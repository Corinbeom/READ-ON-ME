#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_SHA:?}" "${GITHUB_OUTPUT:?}"
mode=build
server_revision=$GITHUB_SHA
spring_digest=
ai_digest=
if [[ $GITHUB_EVENT_NAME != workflow_dispatch ]]; then
    manifest=${REGISTRY:?}/deployment:production
    # The current registry intent can be newer than the last successful OCI release.
    docker pull --quiet "$manifest" >/dev/null
    labels=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}} {{index .Config.Labels "me.readonme.spring"}} {{index .Config.Labels "me.readonme.ai"}}' "$manifest")
    read -r published spring ai <<< "$labels"
    [[ $spring == "$REGISTRY/spring@${spring##*@}" && ${spring##*@} =~ ^sha256:[0-9a-f]{64}$ &&
       $ai == "$REGISTRY/ai@${ai##*@}" && ${ai##*@} =~ ^sha256:[0-9a-f]{64}$ ]] || {
        echo "Invalid image reference in published manifest" >&2
        exit 1
    }
    mode=$(ruby deploy/compare-server-inputs.rb "$published" "$GITHUB_SHA")
    if [[ $mode == reuse ]]; then
        server_revision=$published
        # An explicit rerun of the same server release can retry a failed rollout.
        if [[ $published == "$GITHUB_SHA" && $GITHUB_RUN_ATTEMPT -gt 1 ]]; then
            applied=$(curl --fail --silent --show-error --retry 2 --max-time 10 \
                "${WEB_API_URL%/}/server-release.json?run=$GITHUB_RUN_ID&attempt=$GITHUB_RUN_ATTEMPT" | jq -er '.commit')
            [[ $applied =~ ^[0-9a-f]{40}$ ]] || { echo "Invalid OCI release marker" >&2; exit 1; }
            [[ $applied == "$published" ]] || mode=retry
        fi
    fi
    case "$mode" in
        ai) spring_digest=${spring##*@} ;;
        retry) spring_digest=${spring##*@}; ai_digest=${ai##*@} ;;
    esac
fi

printf 'spring_digest=%s\nai_digest=%s\n' "$spring_digest" "$ai_digest" >> "$GITHUB_OUTPUT"
printf 'mode=%s\nserver_revision=%s\n' "$mode" "$server_revision" >> "$GITHUB_OUTPUT"
printf 'Server images: %s, required OCI revision: %s\n' "$mode" "$server_revision"
