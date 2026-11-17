#!/bin/sh
# THROWAWAY PROTOTYPE for issue #2.
#
# Brings up compose.yaml (stock Komga plus only a shared volume and JAVA_TOOL_OPTIONS), scans a
# one-book fixture library, and checks that Komga called the prototype Bridge as a metadata
# provider. Needs Docker with Compose, and curl. Exits 0 on success. KEEP=1 leaves it running.
set -eu

cd "$(dirname "$0")"
if docker compose version >/dev/null 2>&1; then COMPOSE="docker compose"; else COMPOSE="docker-compose"; fi
PORT="${PORT:-25699}"
export PORT
URL="http://localhost:$PORT"
AUTH="admin@example.org:prototype-password"

down() { $COMPOSE down -v --remove-orphans >/dev/null 2>&1 || true; }
fail() { $COMPOSE logs komga 2>&1 | tail -40; echo "FAIL: $1"; exit 1; }
trap '[ "${KEEP:-0}" = 1 ] || down' EXIT
down

$COMPOSE up -d --build --quiet-pull >/dev/null 2>&1 || fail "compose up failed"

echo "waiting for Komga to start"
i=0
until curl -fs "$URL/api/v1/claim" >/dev/null 2>&1; do
  i=$((i + 1)); [ "$i" -lt 120 ] || fail "Komga did not start"
  sleep 1
done

curl -fsS -X POST "$URL/api/v1/claim" \
  -H "X-Komga-Email: ${AUTH%%:*}" -H "X-Komga-Password: ${AUTH#*:}" >/dev/null
curl -fsS -u "$AUTH" -X POST "$URL/api/v1/libraries" -H 'Content-Type: application/json' \
  -d '{"name":"Prototype","root":"/data"}' >/dev/null

echo "library created; waiting for the scan to reach the prototype provider"
i=0
until curl -fs -u "$AUTH" "$URL/api/v1/series" | grep -q "Supplied by the bridge-loading prototype"; do
  i=$((i + 1)); [ "$i" -lt 120 ] || fail "summary never appeared"
  sleep 1
done

LOGS="$($COMPOSE logs --no-log-prefix komga 2>&1)"
echo "--- Komga log lines from the prototype ---"
echo "$LOGS" | grep -E "bridge-prototype|JAVA_TOOL_OPTIONS" || true
echo "$LOGS" | grep -q "\[bridge-prototype\] Komga asked for metadata" || fail "provider call not logged"
echo "PASS: stock Komga loaded the prototype Bridge and used it as a metadata provider"

# Recorded in ADR-0003: when the agent jar is missing, the JVM, and so Komga, refuses to start.
echo "checking Komga's behaviour with the Bridge jar missing"
KOMGA_IMAGE="${KOMGA_IMAGE:-gotson/komga:1.30.1}"
ID="$(docker run -d -e JAVA_TOOL_OPTIONS=-javaagent:/plugin-bridge/bridge.jar "$KOMGA_IMAGE")"
CODE="$(timeout 60 docker wait "$ID" || echo running)"
OUT="$(docker logs "$ID" 2>&1 | head -5)"
docker rm -f -v "$ID" >/dev/null
echo "$OUT"
[ "$CODE" != running ] && [ "$CODE" != 0 ] || { echo "FAIL: expected Komga to refuse to start"; exit 1; }
echo "CONFIRMED: with the Bridge jar missing, Komga exits at start (code $CODE)"
