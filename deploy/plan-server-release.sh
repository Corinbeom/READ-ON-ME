#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_SHA:?}" "${GITHUB_OUTPUT:?}"
mode=build
server_revision=$GITHUB_SHA
if [[ $GITHUB_EVENT_NAME != workflow_dispatch ]]; then
    manifest=${REGISTRY:?}/deployment:production
    # The current registry intent can be newer than the last successful OCI release.
    docker pull --quiet "$manifest" >/dev/null
    published=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$manifest")
    mode=$(ruby deploy/compare-server-inputs.rb "$published" "$GITHUB_SHA")
    if [[ $mode == reuse ]]; then
        server_revision=$published
        # An explicit rerun of the same server release can retry a failed rollout.
        if [[ $published == "$GITHUB_SHA" && $GITHUB_RUN_ATTEMPT -gt 1 ]]; then
            applied=$(curl --fail --silent --show-error --retry 2 --max-time 10 \
                "${WEB_API_URL%/}/server-release.json?run=$GITHUB_RUN_ID&attempt=$GITHUB_RUN_ATTEMPT" | jq -er '.commit')
            [[ $applied =~ ^[0-9a-f]{40}$ ]] || { echo "Invalid OCI release marker" >&2; exit 1; }
            [[ $applied == "$published" ]] || mode=build
        fi
    fi
fi

printf 'mode=%s\nserver_revision=%s\n' "$mode" "$server_revision" >> "$GITHUB_OUTPUT"
printf 'Server images: %s, required OCI revision: %s\n' "$mode" "$server_revision"
