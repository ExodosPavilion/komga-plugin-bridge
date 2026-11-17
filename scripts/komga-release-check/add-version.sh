#!/bin/sh
# Adds a Komga version to the Bridge's supported list. Safe to run twice.
#   add-version.sh <version> [list-file]
set -eu

VERSION="${1:?usage: add-version.sh <version> [list-file]}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LIST="${2:-$ROOT/bridge/src/main/resources/supported-komga-versions.txt}"

case "$VERSION" in
  [0-9]*.[0-9]*.[0-9]*) ;;
  *) echo "not a Komga version: '$VERSION'" >&2; exit 1 ;;
esac
case "$VERSION" in
  *[!0-9.]*) echo "not a stable Komga version: '$VERSION'" >&2; exit 1 ;;
esac

if grep -v '^[[:space:]]*#' "$LIST" | tr ',' '\n' | sed 's/[[:space:]]//g' | grep -qx "$VERSION"; then
  echo "$VERSION is already on the list"
  exit 0
fi
# The file ends with a newline; the new version goes on its own last line (the newest is last).
[ -z "$(tail -c1 "$LIST")" ] || printf '\n' >> "$LIST"
printf '%s\n' "$VERSION" >> "$LIST"
echo "added $VERSION"
