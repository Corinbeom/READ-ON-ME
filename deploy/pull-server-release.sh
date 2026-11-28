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
    {
        printf 'services:\n  backend:\n    image: "%s"\n' "$2"
        if [[ ${4:-} == direct || $# == 5 ]]; then printf '    environment:\n'; fi
        if [[ ${4:-} == direct ]]; then printf '      AI_BASE_URL: "http://ai:8000"\n'; fi
        if [[ $# == 5 ]]; then printf '      GALPI_REVIEWED_RELEASE: "%s"\n' "$5"; fi
        printf '  ai:\n    image: "%s"\n' "$3"
        if [[ $# == 5 ]]; then printf '    environment:\n      GALPI_REVIEWED_RELEASE: "%s"\n' "$5"; fi
    } > "$1"
}

configured_corpus() {
    "$@" config --format json backend ai | python3 -c '
import json, re, sys
services = json.load(sys.stdin)["services"]
spring, ai = (services[name]["environment"]["GALPI_REVIEWED_RELEASE"] for name in ("backend", "ai"))
if spring != ai or not (spring == "" or re.fullmatch("[0-9a-f]{64}", spring)):
    sys.exit("Spring and AI need the same valid corpus release")
print(spring)'
}

container_image() {
    local id
    id=$("${base[@]}" ps -q "$1") || return 1
    if [[ -n $id ]]; then
        docker inspect --format '{{.Config.Image}}' "$id"
    fi
}

# The retiring binary may predate drain support. A transactional database barrier
# also covers a claim that raced the scheduler's check, across both versions.
job_sql() {
    "${base[@]}" exec -T -e PGCONNECT_TIMEOUT=5 -e "PGOPTIONS=-c statement_timeout=5000" postgres psql -X -qAt -v ON_ERROR_STOP=1 -U readonme -d readonme "$@"
}

pause_job_claims() {
    job_sql <<'SQL'
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE OR REPLACE FUNCTION public.readonme_hold_galpi_claim() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Galpi dispatch is paused for deployment' USING ERRCODE = '55P03';
END
$$;
CREATE OR REPLACE TRIGGER readonme_hold_galpi_claim BEFORE UPDATE OF status ON public.ai_search_jobs
    FOR EACH ROW WHEN (OLD.status = 'QUEUED' AND NEW.status = 'RUNNING')
    EXECUTE FUNCTION public.readonme_hold_galpi_claim();
COMMIT;
SQL
}

resume_job_claims() {
    job_sql <<'SQL'
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP TRIGGER IF EXISTS readonme_hold_galpi_claim ON public.ai_search_jobs;
DROP FUNCTION IF EXISTS public.readonme_hold_galpi_claim();
COMMIT;
SQL
}

wait_for_jobs() {
    local idle
    local deadline=$((SECONDS + 90))
    while (( SECONDS < deadline )); do
        idle=$(job_sql -c "SELECT NOT EXISTS (SELECT FROM public.ai_search_jobs WHERE status = 'RUNNING')") || return 1
        [[ $idle == t ]] && return 0
        [[ $idle == f ]] || return 1
        sleep 1
    done
    echo 'Active Galpi jobs did not finish before the drain deadline.' >&2
    return 1
}

write_phase() {
    printf '%s\n' "$1" > "$state/phase.tmp" && mv "$state/phase.tmp" "$state/in-progress"
}

spring_ai_ready() {
    local override=$1 backend release route
    backend=$("${base[@]}" ps -q backend) || return 1
    release=$(docker exec "$backend" printenv GALPI_REVIEWED_RELEASE) || return 1
    if [[ -f "$state/ai-router/enabled" ]]; then
        route=$(docker exec "$backend" printenv AI_BASE_URL) || return 1
        if [[ $route == http://ai-router:8000 ]]; then
            spring_can_use_ai "$backend" "$release" primary
            return $?
        fi
        [[ $override == "$state/rollback.yml" && $route == http://ai:8000 ]] || return 1
    fi
    docker exec "$backend" curl --fail --silent --max-time 5 http://127.0.0.1:8080/api/ai/availability |
        python3 -c 'import json, sys; sys.exit(0 if json.load(sys.stdin).get("data") is bool(sys.argv[1]) else 1)' "$release"
}

apply_images() {
    local override=$1 target_spring=$2 target_ai=$3 running_spring backend wanted current restart=false
    local compose=( "${base[@]}" -f "$override" )
    running_spring=$(container_image backend) || return 1
    if [[ -f "$state/ai-router/enabled" && $(cat "$state/in-progress") == handoff ]]; then
        [[ $running_spring == "$target_spring" ]] || { echo 'Spring changed during AI handoff.' >&2; return 1; }
        handoff_ai "$override" "$target_ai"
        return $?
    fi
    if [[ $running_spring != "$target_spring" ]]; then
        restart=true
    elif [[ $(cat "$state/in-progress") == drained ]] && grep -q 'GALPI_REVIEWED_RELEASE:' "$override"; then
        wanted=$(configured_corpus "${compose[@]}") || return 1
        backend=$("${base[@]}" ps -q backend) || return 1
        current=$(docker exec "$backend" printenv GALPI_REVIEWED_RELEASE) || return 1
        if [[ $current != "$wanted" ]]; then restart=true; fi
    fi
    if [[ $restart == true ]]; then
        if [[ -n $running_spring ]]; then
            "${compose[@]}" stop -t 75 backend || return 1
        fi
        "${compose[@]}" stop -t 75 ai || return 1
        "${compose[@]}" up -d --no-deps backend || return 1
    fi
    wait_for_health 60 curl --fail --silent --max-time 3 http://127.0.0.1:18080/actuator/health || return 1
    "${compose[@]}" up -d --no-deps ai || return 1
    wait_for_health 24 "${compose[@]}" exec -T ai python -c "from urllib.request import urlopen; urlopen('http://127.0.0.1:8000/health', timeout=3).close()" || return 1
    [[ "$(container_image backend)" == "$target_spring" && "$(container_image ai)" == "$target_ai" ]] || return 1
    if [[ $(cat "$state/in-progress") == drained ]]; then
        wait_for_health 12 spring_ai_ready "$override" || return 1
    fi
    return 0
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
        if [[ $(cat "$state/in-progress") == drained ]]; then
            write_phase restored-drained && resume_job_claims || return 1
        fi
        rm -f "$state/in-progress"
    else
        echo 'Could not restore the previous images. Inspect backend and AI health.' >&2
        return 1
    fi
}

finish_release() {
    if [[ $(cat "$state/in-progress") == verified-drained ]]; then resume_job_claims; fi
    cp "$state/candidate.yml" "$state/active.yml"
    if [[ -f "$state/server-release.json" ]]; then
        mv "$state/server-release.json" "$status"
    fi
    rm "$state/in-progress"
}

if [[ "${1:-}" != --check ]]; then
    [[ -d deploy-status ]] || { echo 'Create the deploy-status directory before deploying' >&2; exit 1; }
    if [[ -f "$state/in-progress" ]]; then
        case $(cat "$state/in-progress") in
            verified|verified-drained) finish_release ;;
            draining|restored-drained) resume_job_claims && rm "$state/in-progress" || exit 1 ;;
            *) recover ;;
        esac
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
backend=$("${base[@]}" ps -q backend)
old_release=$(docker exec "$backend" printenv GALPI_REVIEWED_RELEASE)
[[ -z $old_release || $old_release =~ ^[0-9a-f]{64}$ ]] || { echo 'Invalid running corpus release' >&2; exit 1; }
new_release=$(configured_corpus "${base[@]}")
if [[ -f "$state/ai-router/enabled" && $old_spring == "$spring" && $old_release == "$new_release" ]]; then
    if [[ $(docker exec "$backend" printenv AI_BASE_URL) != http://ai-router:8000 ]]; then
        echo 'Waiting for the initial Spring switch to the AI router. Existing release is still serving.' >&2
        exit 1
    fi
fi
if [[ $old_spring != "$spring" ]]; then docker pull --quiet "$spring" >/dev/null; fi
if [[ $old_ai != "$ai" ]]; then docker pull --quiet "$ai" >/dev/null; fi
previous_route=
if [[ -f "$state/ai-router/enabled" && ( $old_spring != "$spring" || $old_release != "$new_release" ) ]]; then
    current_route=$(docker exec "$backend" printenv AI_BASE_URL)
    if [[ $current_route == http://ai:8000 ]]; then
        previous_route=direct
    fi
fi
if [[ $old_release != "$new_release" ]]; then
    # Both processes read the release at startup. Recovery must also restore the old value.
    write_images "$state/rollback.yml" "$old_spring" "$old_ai" "$previous_route" "$old_release"
    write_images "$state/candidate.yml" "$spring" "$ai" "" "$new_release"
else
    write_images "$state/rollback.yml" "$old_spring" "$old_ai" "$previous_route"
    write_images "$state/candidate.yml" "$spring" "$ai"
fi

"${base[@]}" exec -T postgres pg_dump -U readonme -d readonme -Fc > "$state/db-backup.tmp"
mv "$state/db-backup.tmp" "$state/db-backup.dump"
if [[ $old_spring != "$spring" || $old_release != "$new_release" ]]; then
    phase=draining
elif [[ -f "$state/ai-router/enabled" ]]; then
    phase=handoff
else
    phase=apply
fi
write_phase "$phase"
printf '%s\n' "$attempt" > "$state/last-attempt"

if [[ $phase == draining ]]; then
    if ! pause_job_claims || ! wait_for_jobs; then
        # Nothing has been stopped. Leave the old pair serving and let the queue run again.
        resume_job_claims && rm "$state/in-progress"
        exit 1
    fi
    write_phase drained
fi

if apply_images "$state/candidate.yml" "$spring" "$ai"; then
    printf '{"commit":"%s"}\n' "$revision" > "$state/server-release.json"
    chmod 644 "$state/server-release.json"
    if [[ $(cat "$state/in-progress") == drained ]]; then write_phase verified-drained; else write_phase verified; fi
    finish_release
    printf 'Applied server revision %s\n' "$revision"
else
    recover
    exit 1
fi
