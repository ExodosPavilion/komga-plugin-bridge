#!/bin/sh
# Checks the release check's scripts on their own; no Docker, no network. The workflow runs this
# first, so a broken script is caught before a real Komga release depends on it.
set -eu

HERE="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
fail() { echo "FAIL: $*" >&2; exit 1; }
export SKIP_IMAGE_CHECK=1

printf '# comment\n1.30.1\n' > "$TMP/list.txt"
export SUPPORTED_LIST="$TMP/list.txt"

# detect: a version on the list is not new; one off the list is; a v prefix is dropped.
OUT="$(KOMGA_LATEST=1.30.1 sh "$HERE/detect.sh" 2>/dev/null)"
[ "$OUT" = "version=1.30.1
new=false" ] || fail "known version: $OUT"
OUT="$(KOMGA_LATEST=v1.31.0 sh "$HERE/detect.sh" 2>/dev/null)"
[ "$OUT" = "version=1.31.0
new=true" ] || fail "new version: $OUT"
KOMGA_LATEST=1.31.0-rc1 sh "$HERE/detect.sh" >/dev/null 2>&1 && fail "a pre-release was accepted"
KOMGA_LATEST=nonsense sh "$HERE/detect.sh" >/dev/null 2>&1 && fail "garbage was accepted"
# a manual run input wins over the lookup
OUT="$(KOMGA_VERSION=1.29.0 KOMGA_LATEST=1.31.0 sh "$HERE/detect.sh" 2>/dev/null)"
[ "$OUT" = "version=1.29.0
new=true" ] || fail "manual version: $OUT"

# add-version: appends on its own line, keeps the comment, is idempotent.
sh "$HERE/add-version.sh" 1.31.0 "$TMP/list.txt" >/dev/null
sh "$HERE/add-version.sh" 1.31.0 "$TMP/list.txt" >/dev/null
[ "$(cat "$TMP/list.txt")" = "# comment
1.30.1
1.31.0" ] || fail "list after add: $(cat "$TMP/list.txt")"
printf '1.30.1' > "$TMP/nonl.txt" # no trailing newline
sh "$HERE/add-version.sh" 1.31.0 "$TMP/nonl.txt" >/dev/null
[ "$(cat "$TMP/nonl.txt")" = "1.30.1
1.31.0" ] || fail "list without final newline: $(cat "$TMP/nonl.txt")"
sh "$HERE/add-version.sh" '1.31.0; rm -rf /' "$TMP/list.txt" >/dev/null 2>&1 && fail "bad version accepted"
[ "$(wc -l < "$TMP/list.txt")" -eq 3 ] || fail "list changed by a refused add"
KOMGA_LATEST=1.31.0 sh "$HERE/detect.sh" 2>/dev/null | grep -qx 'new=false' || fail "added version still new"

# failure-report: names failing tests, or says the suite did not run.
cat > "$TMP/failed.log" <<'EOF'
running 2 tests from ./tests/seam1/a.test.ts
the reference plugin metadata ... FAILED (1s)
ERRORS

the reference plugin metadata => ./tests/seam1/a.test.ts:10:6
error: AssertionError: Expected values to be strictly equal

 FAILURES

the reference plugin metadata => ./tests/seam1/a.test.ts:10:6

FAILED | 1 passed | 1 failed (2s)
EOF
sh "$HERE/failure-report.sh" 1.31.0 "$TMP/failed.log" https://example.test/run/1 > "$TMP/report.md"
grep -q '^- `the reference plugin metadata => ./tests/seam1/a.test.ts:10:6`$' "$TMP/report.md" || fail "failing test not named"
grep -q 'AssertionError' "$TMP/report.md" || fail "error detail missing"
grep -q 'https://example.test/run/1' "$TMP/report.md" || fail "run url missing"
printf 'step 5/9 ...\nerror: kotlinc: unresolved reference\nFAIL: compose up failed\n' > "$TMP/build.log"
sh "$HERE/failure-report.sh" 1.31.0 "$TMP/build.log" > "$TMP/report2.md"
grep -q 'did not run to a result' "$TMP/report2.md" || fail "build failure not described"
grep -q 'unresolved reference' "$TMP/report2.md" || fail "build log tail missing"

echo "komga-release-check selftest: ok"
