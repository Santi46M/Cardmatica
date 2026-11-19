#!/bin/sh
# Runs each time Vercel builds the test site (vercel.json), before it opens:
# the database up to date, the bundled banlists, the site's accounts, the
# first cards of each game whose catalogue is still empty, for at most 20
# minutes the cards still wanted (CATALOG_CARDS and CATALOG_ARCHETYPES, set
# in Vercel) and, for at most 15, the pictures still missing (each build adds
# more; Vercel stops a build at 45 minutes). These are
# command-line steps: the site itself never fetches anything from other websites.
set -e
cd "$(dirname "$0")/../backend"
DEPS="${TMPDIR:-/tmp}/cardmatica-build"
if command -v uv >/dev/null 2>&1; then
    uv pip install --quiet --target "$DEPS" -r ../requirements.txt
else
    python3 -m pip install --quiet --target "$DEPS" -r ../requirements.txt
fi
export PYTHONPATH="$DEPS:$PWD"
python3 -m alembic upgrade head
python3 -m app.cli import-banlist
python3 -m app.cli prepare-test-site --max-cards 500 --catalog-minutes 20 --image-minutes 15
