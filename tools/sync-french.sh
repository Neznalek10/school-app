#!/usr/bin/env bash
# Copies the course and word content (Czech and English editions) from the language app into apps/french.
# Code is not synced: apps/french keeps its school hooks (see docs/ARCHITECTURE.md), so code changes are ported by hand.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
src="${1:-$HOME/github/language-learning}"
for dir in words courses conjugations prompts en; do
  rsync -a --delete "$src/$dir/" "$here/apps/french/$dir/"
done
cp "$src/words.json" "$here/apps/french/words.json"
echo "apps/french content now matches $src. Bump apps/french/version.js so phones pick it up."
