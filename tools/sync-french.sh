#!/usr/bin/env bash
# Copies the course and word content from the public Vocab repo into apps/french.
# Code is not synced: apps/french has its own embedding changes (store prefix, accounts, cache prefix).
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
src="${1:-$HOME/github/vocab}"
for dir in words courses conjugations prompts; do
  rsync -a --delete "$src/$dir/" "$here/apps/french/$dir/"
done
cp "$src/words.json" "$here/apps/french/words.json"
echo "apps/french content now matches $src. Bump apps/french/version.js so phones pick it up."
