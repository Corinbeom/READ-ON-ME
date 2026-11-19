#!/usr/bin/env bash
set -euo pipefail

cd "${READONME_DIR:-/opt/readonme}"
registry=ghcr.io/corinbeom/read-on-me
state=.oci-deploy
status=deploy-status/server-release.json
manifest=$registry/deployment:production
base=(docker compose -f compose.beta.yml)

mkdir -p "$state"
exec 9>"$state/lock"
flock -n 9 || exit 0

write_images() {
    printf 'services:\n  backend:\n    image: "%s"\n  ai:\n    image: "%s"\n' "$2" "$3" > "$1"
}

container_image() {
    local id
    id=$("${base[@]}" ps -q "$1") && [[ -n $id ]] &&
        docker inspect --format '{{.Config.Image}}' "$id"
}

apply_images() {
    local override=$1
    local compose=( "${base[@]}" -f "$override" )
    "${compose[@]}" stop ai || return 1
    "${compose[@]}" up -d --no-deps backend || return 1
    wait_for_health 60 curl --fail --silent --max-time 3 http://127.0.0.1:18080/actuator/health || return 1
    "${compose[@]}" up -d --no-deps ai || return 1
    wait_for_health 24 "${compose[@]}" exec -T ai python -c "from urllib.request import urlopen; urlopen('http://127.0.0.1:8000/health', timeout=3).close()"
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
    echo 'Restoring the previous container images.'
    if apply_images "$state/rollback.yml"; then
        rm -f "$state/in-progress"
    else
        echo 'Could not restore the previous images. Inspect backend and AI health.' >&2
        return 1
    fi
}

if [[ "${1:-}" != --check ]]; then
    [[ -d deploy-status ]] || { echo 'Create the deploy-status directory before deploying' >&2; exit 1; }
    if [[ -f "$state/in-progress" ]]; then
        recover
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

docker pull --quiet "$spring" >/dev/null
docker pull --quiet "$ai" >/dev/null
old_spring=$(container_image backend)
old_ai=$(container_image ai)
write_images "$state/rollback.yml" "$old_spring" "$old_ai"
write_images "$state/candidate.yml" "$spring" "$ai"

"${base[@]}" exec -T postgres pg_dump -U readonme -d readonme -Fc > "$state/db-backup.tmp"
mv "$state/db-backup.tmp" "$state/db-backup.dump"
printf '%s\n' "$attempt" > "$state/last-attempt"
touch "$state/in-progress"

if apply_images "$state/candidate.yml" &&
    [[ "$(container_image backend)" == "$spring" && "$(container_image ai)" == "$ai" ]]; then
    printf '{"commit":"%s"}\n' "$revision" > "$state/server-release.json"
    chmod 644 "$state/server-release.json"
    cp "$state/candidate.yml" "$state/active.yml"
    rm "$state/in-progress"
    mv "$state/server-release.json" "$status"
    printf 'Applied server revision %s\n' "$revision"
else
    recover
    exit 1
fi
