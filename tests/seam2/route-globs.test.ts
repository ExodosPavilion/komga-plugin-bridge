// The route glob rule (`*` one path segment, `**` anything, the rest literal) is implemented twice:
// by the Plugin Host (routeMatches, here) and by the Bridge (ResponseFilterRoutes.toRegex, Kotlin).
// Both are meant to follow tests/fixtures/route-globs.json. This runs the Host's side; the Bridge's
// side is exercised in seam 1 (response-filter.test.ts), where a plugin's glob decides which of
// Komga's real responses are filtered. The Bridge has no unit-test seam of its own.
import assert from "node:assert/strict";
import { routeMatches } from "../../plugin-host/src/plugins/response-filters.ts";

const cases: { pattern: string; path: string; matches: boolean }[] = JSON.parse(
  await Deno.readTextFile(new URL("../fixtures/route-globs.json", import.meta.url)),
);

Deno.test("the Plugin Host's route glob rule follows the shared cases", () => {
  assert.ok(cases.length > 10);
  for (const { pattern, path, matches } of cases) {
    assert.equal(routeMatches(pattern, path), matches, `${pattern} against ${path}`);
  }
});
