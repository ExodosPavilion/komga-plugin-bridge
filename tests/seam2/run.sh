#!/bin/sh
# Seam 2: the Plugin Host alone, against a fake Komga and a fake Bridge. Needs only Docker.
# Exits with the test run's exit code. Extra arguments are passed to `deno test` (for example
# `--filter "secret"`).
set -eu

cd "$(dirname "$0")/../.."
IMAGE=komga-plugin-bridge-seam2

docker build -q -f tests/seam2/Dockerfile -t "$IMAGE" . >/dev/null

# Run detached and follow the logs, so output is shown on every Docker setup.
if [ "$#" -gt 0 ]; then
  ID="$(docker run -d "$IMAGE" deno test --allow-all tests/seam2/ "$@")"
else
  ID="$(docker run -d "$IMAGE")"
fi
docker logs -f "$ID" 2>&1
CODE="$(docker wait "$ID")"
docker rm -v "$ID" >/dev/null
exit "$CODE"
