#!/bin/sh
# Turns the output of a failed seam 1 run (tests/seam1/run.sh) into a Markdown report on stdout.
#   failure-report.sh <version> <log-file> [run-url]
# It names the failing tests (from `deno test`'s FAILURES section) or, when the suite never
# started, says the build or start-up failed and shows the end of the log.
set -eu

VERSION="${1:?usage: failure-report.sh <version> <log-file> [run-url]}"
LOG="${2:?usage: failure-report.sh <version> <log-file> [run-url]}"
RUN_URL="${3:-}"

# Strip colour codes from the log.
CLEAN="$(sed 's/\x1b\[[0-9;]*m//g' "$LOG")"

echo "The seam 1 suite failed against Komga $VERSION, so the version was **not** added to the supported list."
echo "The Bridge stays inactive on Komga $VERSION until this is resolved."
[ -z "$RUN_URL" ] || { echo; echo "Run: $RUN_URL"; }
echo

# "name => ./file:line:col" lines under FAILURES, one per failing test.
FAILING="$(printf '%s\n' "$CLEAN" | sed -n '/^ *FAILURES *$/,$p' | grep ' => ' || true)"
if [ -n "$FAILING" ]; then
  echo "## Failing tests"
  echo
  printf '%s\n' "$FAILING" | sed 's/^ *//; s/^/- `/; s/$/`/'
  echo
  echo "## Failure details"
  echo
  echo '```'
  printf '%s\n' "$CLEAN" | sed -n '/^ *ERRORS *$/,/^ *FAILURES *$/p' | head -120
  echo '```'
else
  echo "## The suite did not run to a result"
  echo
  echo "The build or start-up failed. Likely causes: the Bridge no longer compiles against this Komga's jars, or Komga did not start with the Bridge loaded (ADR-0003: how the image is packaged)."
  echo
  echo '```'
  printf '%s\n' "$CLEAN" | tail -60
  echo '```'
fi
