#!/usr/bin/env bash
set -euo pipefail

cd "${READONME_DIR:-/opt/readonme}"
registry=ghcr.io/corinbeom/read-on-me
state=.oci-deploy
status=deploy-status/server-release.json
manifest=$registry/deployment:production
base=(docker compose -f compose.beta.yml)

if [[ -f "$state/ai-router/enabled" ]]; then
    base+=(-f compose.ai-handoff.yml)
    source ./ai-handoff.sh
fi

mkdir -p "$state"
exec 9>"$state/lock"
flock -n 9 || exit 0

write_images() {
    printf 'services:\n  backend:\n    image: "%s"\n  ai:\n    image: "%s"\n' "$2" "$3" > "$1"
}

container_image() {
    local id
    id=$("${base[@]}" ps -q "$1") || return 1
    if [[ -n $id ]]; then
        docker inspect --format '{{.Config.Image}}' "$id"
    fi
}

apply_images() {
    local override=$1 target_spring=$2 target_ai=$3 running_spring
    local compose=( "${base[@]}" -f "$override" )
    running_spring=$(container_image backend) || return 1
    if [[ -f "$state/ai-router/enabled" && $(cat "$state/in-progress") == handoff ]]; then
        [[ $running_spring == "$target_spring" ]] || { echo 'Spring changed during AI handoff.' >&2; return 1; }
        handoff_ai "$override" "$target_ai"
        return $?
    fi
    if [[ $running_spring != "$target_spring" ]]; then
        "${compose[@]}" stop ai || return 1
        "${compose[@]}" up -d --no-deps backend || return 1
    fi
    wait_for_health 60 curl --fail --silent --max-time 3 http://127.0.0.1:18080/actuator/health || return 1
    "${compose[@]}" up -d --no-deps ai || return 1
    wait_for_health 24 "${compose[@]}" exec -T ai python -c "from urllib.request import urlopen; urlopen('http://127.0.0.1:8000/health', timeout=3).close()" || return 1
    [[ "$(container_image backend)" == "$target_spring" && "$(container_image ai)" == "$target_ai" ]]
}

wait_for_health() {
    local retries=$1
    shift
    while (( retries > 0 )); do
        if "$@" >/dev/null 2>&1; then
            return 0
        fi
        retries=$((retries - 1))
        sleep 5
    done
    return 1
}

recover() {
    local rollback_spring rollback_ai
    echo 'Restoring the previous container images.'
    rollback_spring=$(docker compose -f "$state/rollback.yml" config --images backend) || return 1
    rollback_ai=$(docker compose -f "$state/rollback.yml" config --images ai) || return 1
    if apply_images "$state/rollback.yml" "$rollback_spring" "$rollback_ai"; then
        cp "$state/rollback.yml" "$state/active.yml" || return 1
        rm -f "$state/in-progress"
    else
        echo 'Could not restore the previous images. Inspect backend and AI health.' >&2
        return 1
    fi
}

finish_release() {
    cp "$state/candidate.yml" "$state/active.yml"
    if [[ -f "$state/server-release.json" ]]; then
        mv "$state/server-release.json" "$status"
    fi
    rm "$state/in-progress"
}

if [[ "${1:-}" != --check ]]; then
    [[ -d deploy-status ]] || { echo 'Create the deploy-status directory before deploying' >&2; exit 1; }
    if [[ -f "$state/in-progress" ]]; then
        if [[ $(cat "$state/in-progress") == verified ]]; then
            finish_release
        else
            recover
        fi
    fi
fi

docker pull --quiet "$manifest" >/dev/null
labels=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}} {{index .Config.Labels "me.readonme.spring"}} {{index .Config.Labels "me.readonme.ai"}} {{index .Config.Labels "me.readonme.attempt"}}' "$manifest")
read -r revision spring ai attempt <<< "$labels"
[[ $revision =~ ^[0-9a-f]{40}$ && $attempt =~ ^[0-9]+\.[0-9]+$ ]] || { echo 'Invalid release revision or attempt' >&2; exit 1; }
[[ $spring == "$registry/spring@"* && ${spring##*@} =~ ^sha256:[0-9a-f]{64}$ &&
   $ai == "$registry/ai@"* && ${ai##*@} =~ ^sha256:[0-9a-f]{64}$ ]] || { echo 'Invalid release image references' >&2; exit 1; }

if [[ "${1:-}" == --check ]]; then
    printf 'Registry access verified for %s (%s)\n' "$revision" "$attempt"
    exit 0
fi

if [[ -f "$status" ]] && grep -qF "\"commit\":\"$revision\"" "$status" &&
    [[ "$(container_image backend)" == "$spring" && "$(container_image ai)" == "$ai" ]]; then
    exit 0
fi
[[ ! -f "$state/last-attempt" || "$(cat "$state/last-attempt")" != "$attempt" ]] || exit 0

old_spring=$(container_image backend)
old_ai=$(container_image ai)
[[ -n $old_spring && -n $old_ai ]] || { echo 'Could not identify the running image pair' >&2; exit 1; }
if [[ -f "$state/ai-router/enabled" && $old_spring == "$spring" ]]; then
    backend=$("${base[@]}" ps -q backend)
    if [[ $(docker exec "$backend" printenv AI_BASE_URL) != http://ai-router:8000 ]]; then
        echo 'Waiting for the initial Spring switch to the AI router. Existing release is still serving.' >&2
        exit 1
    fi
fi
if [[ $old_spring != "$spring" ]]; then docker pull --quiet "$spring" >/dev/null; fi
if [[ $old_ai != "$ai" ]]; then docker pull --quiet "$ai" >/dev/null; fi
write_images "$state/rollback.yml" "$old_spring" "$old_ai"
write_images "$state/candidate.yml" "$spring" "$ai"

"${base[@]}" exec -T postgres pg_dump -U readonme -d readonme -Fc > "$state/db-backup.tmp"
mv "$state/db-backup.tmp" "$state/db-backup.dump"
if [[ -f "$state/ai-router/enabled" && $old_spring == "$spring" ]]; then
    printf 'handoff\n' > "$state/in-progress.tmp"
else
    printf 'apply\n' > "$state/in-progress.tmp"
fi
mv "$state/in-progress.tmp" "$state/in-progress"
printf '%s\n' "$attempt" > "$state/last-attempt"

if apply_images "$state/candidate.yml" "$spring" "$ai"; then
    printf '{"commit":"%s"}\n' "$revision" > "$state/server-release.json"
    chmod 644 "$state/server-release.json"
    printf 'verified\n' > "$state/verified.tmp"
    mv "$state/verified.tmp" "$state/in-progress"
    finish_release
    printf 'Applied server revision %s\n' "$revision"
else
    recover
    exit 1
fi
