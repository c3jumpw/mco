#!/usr/bin/env bash
# Refreshes every screenshot in the guide and the getting-started tour from the current code,
# then rebuilds the guide. Run it after any change people can see, before committing.
#
#   scripts/guide/update.sh
#
# Needs Python 3 with Playwright and Pillow, and Chrome (set CHROME if it isn't /usr/bin/google-chrome).
# The screenshots use made-up data and a neutral admin (alex@yourcompany.com); nothing real is shown.
set -euo pipefail
cd "$(dirname "$0")/../.."

npx vite build >/dev/null
npx vite preview --port 4173 --strictPort >/dev/null 2>&1 &
PREVIEW=$!
trap 'kill $PREVIEW 2>/dev/null' EXIT
sleep 3

(cd scripts/guide/capture && python3 capture.py)
python3 scripts/guide/convert.py
python3 scripts/guide/build.py
npx vite build >/dev/null
echo "Done. Check the tour slides and the What's new list in src/admin/tour/ match what changed."
