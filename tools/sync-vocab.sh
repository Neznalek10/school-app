#!/usr/bin/env bash
# Copies the latest language-app-v2 into apps/vocab. apps/french gets its content from tools/sync-french.sh.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
src="${1:-$HOME/Projects/language-app-v2}"
rsync -a --delete --exclude '.git' --exclude '.gitignore' --exclude '.nojekyll' --exclude 'README.md' "$src/" "$here/apps/vocab/"
echo "apps/vocab now matches $src ($(grep -o "'[0-9.]*'" "$here/apps/vocab/version.js"))"
