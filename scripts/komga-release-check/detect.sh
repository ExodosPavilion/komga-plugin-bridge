#!/bin/sh
# Finds the newest stable Komga release and says whether it is new to this Bridge. Prints
# GITHUB_OUTPUT-style lines on stdout:
#   version=<newest stable Komga version>
#   new=true|false      true when it is not on the supported list and its Docker image exists
#
# Inputs (all optional):
#   KOMGA_VERSION       test this version instead of asking GitHub (the manual run input)
#   KOMGA_LATEST        stands in for the GitHub lookup (used by selftest.sh)
#   SKIP_IMAGE_CHECK=1  do not ask Docker Hub whether gotson/komga:<version> exists
#   SUPPORTED_LIST      path of the supported list (default: the Bridge's resource file)
# The GitHub lookup needs `gh` (present on GitHub-hosted runners) with GH_TOKEN set.
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LIST="${SUPPORTED_LIST:-$ROOT/bridge/src/main/resources/supported-komga-versions.txt}"

if [ -n "${KOMGA_VERSION:-}" ]; then
  VERSION="$KOMGA_VERSION"
elif [ -n "${KOMGA_LATEST:-}" ]; then
  VERSION="$KOMGA_LATEST"
else
  # "latest" is GitHub's newest release that is neither a draft nor a pre-release.
  VERSION="$(gh api repos/gotson/komga/releases/latest --jq .tag_name)"
fi
VERSION="${VERSION#v}"

case "$VERSION" in
  [0-9]*.[0-9]*.[0-9]*) ;;
  *) echo "not a Komga version: '$VERSION'" >&2; exit 1 ;;
esac
case "$VERSION" in
  *[!0-9.]*) echo "not a stable Komga version: '$VERSION'" >&2; exit 1 ;;
esac

NEW=true
if grep -v '^[[:space:]]*#' "$LIST" | tr ',' '\n' | sed 's/[[:space:]]//g' | grep -qx "$VERSION"; then
  NEW=false
  echo "Komga $VERSION is already on the supported list" >&2
elif [ "${SKIP_IMAGE_CHECK:-0}" != 1 ] && ! docker manifest inspect "gotson/komga:$VERSION" >/dev/null 2>&1; then
  # The GitHub release can appear before the image does; the next run picks it up.
  NEW=false
  echo "Komga $VERSION has no Docker image yet; will look again next run" >&2
fi

echo "version=$VERSION"
echo "new=$NEW"
