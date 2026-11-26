#!/usr/bin/env bash
# Installed in a release-specific, root-owned OCI directory by stage-galpi-corpus.sh.
set -euo pipefail
cd "$(dirname "$0")"
umask 077
sha256sum --quiet -c SHA256SUMS
case "${1:-}" in
    stage)
        if [[ ! -s before-reviewed.dump ]]; then
            docker exec readonme-beta-postgres-1 pg_dump -U readonme -d readonme -Fc \
                -t corpus_field_versions -t corpus_derived_artifacts -t corpus_quality_runs -t corpus_use_policy > before-reviewed.partial
            docker exec -i readonme-beta-postgres-1 pg_restore -l < before-reviewed.partial > /dev/null
            mv before-reviewed.partial before-reviewed.dump
        fi ;;
    activate|rollback|inventory) ;;
    *) echo 'Expected stage, activate, rollback, or inventory' >&2; exit 2 ;;
esac
docker exec -i readonme-beta-ai-1 python -c "$(cat promote_reviewed.py)" "$1" < bundle.json
