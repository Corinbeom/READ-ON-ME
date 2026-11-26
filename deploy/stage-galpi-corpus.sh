#!/usr/bin/env bash
# Usage: stage-galpi-corpus.sh BUNDLE ssh OCI_HOST (or BUNDLE /path/to/ssh-wrapper)
set -euo pipefail
if (( $# < 2 )); then echo "Usage: $0 BUNDLE SSH_COMMAND [SSH_ARGS...]" >&2; exit 2; fi
bundle=$1
shift
root=$(cd "$(dirname "$0")/.." && pwd)
umask 077
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp "$bundle" "$tmp/bundle.json"
cp "$root/BookAppAI/tools/promote_reviewed.py" "$tmp/promote_reviewed.py"
cp "$root/deploy/run-galpi-corpus.sh" "$tmp/run.sh"
release=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["release"])' "$tmp/bundle.json")
[[ $release =~ ^[0-9a-f]{64}$ ]] || { echo "Invalid release" >&2; exit 2; }
(cd "$tmp" && shasum -a 256 bundle.json promote_reviewed.py run.sh > SHA256SUMS)
remote_script='
    umask 077
    base=/opt/readonme/.oci-deploy
    remote=$base/galpi-$1
    work=$(mktemp -d "$base/.galpi-upload.XXXXXXXX")
    cleanup() { rm -rf -- "$work"; }
    trap cleanup EXIT
    tar -xzf - --no-same-owner -C "$work"
    cd "$work"
    sha256sum --quiet -c SHA256SUMS
    exec 9>"$base/lock"
    flock -w 120 9
    if test -d "$remote"; then
        cmp SHA256SUMS "$remote/SHA256SUMS"
    else
        mv "$work" "$remote"
    fi
    cd "$remote"
    bash run.sh stage
'
tar -C "$tmp" -czf - bundle.json promote_reviewed.py run.sh SHA256SUMS | "$@" "sudo -n bash -ceu '$remote_script' -- $release"
printf 'OCI corpus directory: /opt/readonme/.oci-deploy/galpi-%s\n' "$release"
