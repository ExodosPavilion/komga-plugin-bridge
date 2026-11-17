#!/bin/sh
# Setup check: follows docs/setup.md against examples/compose.yaml, with the Plugin Host image
# built from this repository in place of the published one. Needs only Docker with Compose.
# Everything lives in one uniquely named compose project, removed at the end (KEEP=1 leaves it).
set -eu

cd "$(dirname "$0")/../.."
if docker compose version >/dev/null 2>&1; then DC="docker compose"; else DC="docker-compose"; fi

EXAMPLE=examples/compose.yaml
LIST=bridge/src/main/resources/supported-komga-versions.txt
KOMGA_IMAGE="$(sed -n 's/^ *image: *\(gotson\/komga:[^ ]*\).*/\1/p' "$EXAMPLE")"
VERSION="${KOMGA_IMAGE#gotson/komga:}"
grep -qx "$VERSION" "$LIST" || { echo "FAIL: the example's Komga $VERSION is not on the supported list"; exit 1; }

HASH="$(pwd | cksum | cut -d' ' -f1)"
PROJECT="komga-setup-check-$HASH-$$"
export SETUP_IMAGE="komga-plugin-bridge-setup-check:$HASH"
ENVFILE="$(mktemp)"
DC="$DC -p $PROJECT --project-directory $(pwd)/examples --env-file $ENVFILE -f $(pwd)/$EXAMPLE -f $(pwd)/tests/setup/override.yaml"
DRIVER="deno run --allow-all tests/setup/driver.ts"

down() { $DC --profile driver down -v --remove-orphans >/dev/null 2>&1 || true; rm -f "$ENVFILE"; }
trap '[ "${KEEP:-0}" = 1 ] || down' EXIT

echo "Building the Plugin Host image from this repository"
docker build -q -f plugin-host/Dockerfile --build-arg "KOMGA_IMAGE=$KOMGA_IMAGE" -t "$SETUP_IMAGE" . >/dev/null

echo "Step 1: start the Plugin Host, then Komga"
$DC up -d --wait plugin-host
$DC up -d komga

echo "Step 2: claim Komga and create the API key"
KEY="$($DC run --rm --build driver $DRIVER key | tail -1 | tr -d '\r')"
echo "$KEY" | grep -qE '^[A-Za-z0-9_-]{16,}$' || { echo "FAIL: no API key (got: $KEY)"; exit 1; }
echo "KOMGA_API_KEY=$KEY" > "$ENVFILE"

echo "Step 3: give the Plugin Host the key, and copy the reference plugin in"
$DC up -d --wait plugin-host
$DC cp plugins/reference plugin-host:/plugins/reference
$DC restart plugin-host
$DC up -d --wait plugin-host

echo "Step 4: add a library, scan, look for the plugin's metadata"
if ! $DC run --rm driver $DRIVER verify; then
  echo "--- komga log (tail) ---"; $DC logs --no-log-prefix komga 2>&1 | tail -40
  echo "--- plugin-host log (tail) ---"; $DC logs --no-log-prefix plugin-host 2>&1 | tail -20
  exit 1
fi
