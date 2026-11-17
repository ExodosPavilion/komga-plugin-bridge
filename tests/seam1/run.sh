#!/bin/sh
# Seam 1: stock Komga plus the Plugin Host in real containers, driven through Komga's address.
# Needs only Docker with Compose. Exits with the test run's exit code. KEEP=1 leaves the
# containers up afterwards. Everything created is in one compose project and is removed with it;
# nothing else on the machine is touched. The project name is derived from this checkout's path
# (komga-plugin-bridge-seam1-<hash>) so parallel worktrees never tear down each other's runs;
# set SEAM1_PROJECT to override. No host ports are published, so ports cannot clash either.
set -eu

cd "$(dirname "$0")"
if docker compose version >/dev/null 2>&1; then COMPOSE="docker compose"; else COMPOSE="docker-compose"; fi

# The Komga version under test: the official image gotson/komga:$KOMGA_VERSION runs, and the Bridge
# is compiled against it. Default is the newest version on the supported list. A version that is
# not on the list yet (the release check testing a new Komga) runs with the list replaced by that
# version, so the Bridge is active and the whole suite, loading included, runs against it.
LIST=../../bridge/src/main/resources/supported-komga-versions.txt
KOMGA_VERSION="${KOMGA_VERSION:-$(grep -v '^[[:space:]]*#' "$LIST" | grep -v '^[[:space:]]*$' | tail -1 | tr -d '[:space:]')}"
[ -n "$KOMGA_VERSION" ] || { echo "FAIL: no KOMGA_VERSION given and none on the supported list"; exit 1; }
if grep -qx "$KOMGA_VERSION" "$LIST"; then SEAM1_JAVA_OPTIONS=""; else
  SEAM1_JAVA_OPTIONS="-Dplugin-bridge.supported-versions=$KOMGA_VERSION"
  echo "Komga $KOMGA_VERSION is not on the supported list: testing it as a candidate"
fi
export KOMGA_VERSION SEAM1_JAVA_OPTIONS
echo "Seam 1 against gotson/komga:$KOMGA_VERSION"

HASH="$(pwd | cksum | cut -d' ' -f1)"
PROJECT="${SEAM1_PROJECT:-komga-plugin-bridge-seam1-$HASH}"
COMPOSE="$COMPOSE -p $PROJECT -f compose.yaml"

down() { $COMPOSE down -v --remove-orphans >/dev/null 2>&1 || true; }
trap '[ "${KEEP:-0}" = 1 ] || down' EXIT
down

$COMPOSE up -d --build --quiet-pull >/dev/null 2>&1 || {
  $COMPOSE up -d --build 2>&1 | tail -30
  echo "FAIL: compose up failed"; exit 1
}

TESTS="$($COMPOSE ps -aq tests)"
$COMPOSE logs -f --no-log-prefix tests 2>&1
CODE="$(docker wait "$TESTS")"
if [ "$CODE" != 0 ]; then
  echo "--- komga log (tail) ---"; $COMPOSE logs --no-log-prefix komga 2>&1 | tail -40
  echo "--- plugin-host log (tail) ---"; $COMPOSE logs --no-log-prefix plugin-host 2>&1 | tail -20
fi
exit "$CODE"
