#!/usr/bin/env bash
set -euo pipefail

: "${REGISTRY:?}" "${GITHUB_SHA:?}" "${GITHUB_RUN_ID:?}" "${GITHUB_RUN_ATTEMPT:?}" "${SPRING_DIGEST:?}" "${AI_DIGEST:?}"
[[ $GITHUB_SHA =~ ^[0-9a-f]{40}$ ]]
[[ $SPRING_DIGEST =~ ^sha256:[0-9a-f]{64}$ && $AI_DIGEST =~ ^sha256:[0-9a-f]{64}$ ]]
[[ $GITHUB_RUN_ID =~ ^[0-9]+$ && $GITHUB_RUN_ATTEMPT =~ ^[0-9]+$ ]]

context=$(mktemp -d)
trap 'rm -f "$context/revision"; rmdir "$context"' EXIT
printf '%s\n' "$GITHUB_SHA" > "$context/revision"
docker buildx build --platform linux/amd64 --provenance=false --sbom=false --push \
    --label "org.opencontainers.image.revision=$GITHUB_SHA" \
    --label "me.readonme.spring=$REGISTRY/spring@$SPRING_DIGEST" \
    --label "me.readonme.ai=$REGISTRY/ai@$AI_DIGEST" \
    --label "me.readonme.attempt=$GITHUB_RUN_ID.$GITHUB_RUN_ATTEMPT" \
    --tag "$REGISTRY/deployment:production" --file - "$context" <<'DOCKERFILE'
FROM scratch
COPY revision /revision
LABEL org.opencontainers.image.description="Read On Me production deployment manifest"
DOCKERFILE
