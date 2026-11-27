# Sourced by pull-server-release.sh with the OCI deployment lock held.
# A short-lived, verified copy receives traffic while the canonical ai service is replaced.

ai_ready() {
    docker exec "$1" python -c '
import json, os, sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
expected = sys.argv[1]
if os.getenv("GALPI_REVIEWED_RELEASE", "") != expected:
    sys.exit(2)
path = "/api/ai/reviewed-release" if expected else "/health"
request = Request("http://127.0.0.1:8000" + path,
                  headers={"X-Internal-Token": os.environ["INTERNAL_API_TOKEN"]})
try:
    with urlopen(request, timeout=3) as response:
        body = json.load(response)
        verified = body.get("release") == expected if expected else body.get("ok") is True
        sys.exit(0 if verified else 2)
except HTTPError:
    sys.exit(2)
except (URLError, TimeoutError):
    sys.exit(1)
' "$2"
}

wait_ai() {
    local n
    for ((n=0; n<24; n++)); do
        if ai_ready "$1" "$2"; then return 0; elif [[ $? == 2 ]]; then return 1; fi
        [[ $(docker inspect --format '{{.State.Running}}' "$1") == true ]] || return 1
        sleep 5
    done
    return 1
}

spring_can_use_ai() {
    local headers
    headers=$(docker exec "$1" curl --fail --silent --max-time 4 -D - -o /dev/null http://ai-router:8000/health) || return 1
    tr -d '\r' <<< "$headers" | grep -ix "X-Readonme-AI-Route: $3" >/dev/null || return 1
    docker exec "$1" curl --fail --silent --max-time 5 http://127.0.0.1:8080/api/ai/availability |
        python3 -c 'import json,sys; sys.exit(0 if json.load(sys.stdin).get("data") is bool(sys.argv[1]) else 1)' "$2"
}

route_ai() {
    # Caddy checks this file per request. Existing client and upstream connections stay open.
    if [[ $1 == ai ]]; then
        rm -f "$state/ai-router/standby"
    else
        printf '%s\n' "$1" > "$state/ai-router/standby.tmp" && mv "$state/ai-router/standby.tmp" "$state/ai-router/standby"
    fi
}

retire_standby() {
    # Uvicorn drains accepted requests on SIGTERM. Spring's longest AI deadline is 65 seconds.
    docker stop -t 75 "$1" >/dev/null && docker rm "$1" >/dev/null
}

handoff_ai() {
    local override=$1 target=$2 backend project standby_id active_id release
    local compose=("${base[@]}" -f "$override")
    backend=$("${base[@]}" ps -q backend) || return 1
    [[ $(docker exec "$backend" printenv AI_BASE_URL) == http://ai-router:8000 ]] || {
        echo 'Running Spring has not switched to the AI router.' >&2
        return 1
    }
    release=$(docker exec "$backend" printenv GALPI_REVIEWED_RELEASE) || return 1
    [[ -z $release || $release =~ ^[0-9a-f]{64}$ ]] || { echo 'Invalid reviewed release configured for handoff.' >&2; return 1; }
    project=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$backend") || return 1
    [[ $project =~ ^[a-z0-9][a-z0-9_-]*$ ]] || return 1
    local standby=$project-ai-standby
    standby_id=$(docker ps -aq --filter "name=^/${standby}$" --filter "label=com.docker.compose.project=$project" --filter label=me.readonme.handoff=standby) || return 1
    active_id=$("${base[@]}" ps -q ai) || return 1

    if [[ -n $active_id && $(container_image ai) == "$target" ]]; then
        # Recovery can start here if candidate startup failed or the hand-back was interrupted.
        wait_ai "$active_id" "$release" || return 1
    else
        if [[ -e $state/ai-router/standby ]] && {
            [[ -z $standby_id ]] || [[ $(cat "$state/ai-router/standby") != "$standby" ]]
        }; then
            echo 'Cannot identify the serving AI standby.' >&2
            return 1
        fi
        if [[ -z $standby_id ]]; then
            standby_id=$("${compose[@]}" run --detach --no-deps --name "$standby" --label me.readonme.handoff=standby \
                ai uvicorn --factory app.main:standby --host 0.0.0.0 --port 8000) || return 1
        fi
        # A surviving verified standby can bridge an interrupted hand-back while the old image is restored.
        wait_ai "$standby_id" "$release" || return 1
        route_ai "$standby" && wait_for_health 3 spring_can_use_ai "$backend" "$release" standby || return 1
        if [[ -n $active_id ]]; then
            docker stop -t 75 "$active_id" >/dev/null || return 1
        fi
        "${compose[@]}" up -d --no-deps ai || return 1
        active_id=$("${base[@]}" ps -q ai) || return 1
        wait_ai "$active_id" "$release" || return 1
    fi
    route_ai ai && wait_for_health 3 spring_can_use_ai "$backend" "$release" primary || return 1
    if [[ -n $standby_id ]]; then retire_standby "$standby_id" || return 1; fi
    [[ $(container_image ai) == "$target" ]]
}
