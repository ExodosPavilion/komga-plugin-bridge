import assert from "node:assert/strict";
import { KOMGA_URL, startedAndClaimed } from "./support/komga.ts";
import { assertLinkInjected, assertScriptParses, pageAt } from "./support/link-page.ts";

// The link to the Plugin Manager is the only element the Bridge adds to Komga's screens. It is a
// script added to the pages that load the two web UIs. Seam 1 has no browser, so these tests check
// the pages a browser would receive; the script's effect on the settings navigation was checked by
// hand in both UIs (see ticket #20).

Deno.test("both web UIs' pages carry the link script, deep links included", async () => {
  await startedAndClaimed();
  for (const path of ["/", "/classic/", "/next/", "/series/abc", "/settings/server", "/server/settings"]) {
    const page = await pageAt(KOMGA_URL, path);
    assertLinkInjected(page, path);
    assertScriptParses(page);
    // The pages still load Komga's own app.
    assert.match(page.text, /<script[^>]+src=/, `${path}: Komga's own scripts remain`);
  }
});

Deno.test("only page loads get the script: assets, the API and non-browser clients are untouched", async () => {
  await startedAndClaimed();
  const index = await pageAt(KOMGA_URL, "/");
  const asset = /src="([^"]*\.js)"/.exec(index.text)?.[1];
  assert.ok(asset, "the page loads a script file");
  const js = await pageAt(KOMGA_URL, asset!.startsWith("/") ? asset! : `/${asset}`, { Accept: "*/*" });
  assert.equal(js.status, 200);
  assert.doesNotMatch(js.text, /data-plugin-manager-link/);

  const plain = await pageAt(KOMGA_URL, "/", { Accept: "*/*" });
  assert.doesNotMatch(plain.text, /data-plugin-manager-link/);

  const claim = await pageAt(KOMGA_URL, "/api/v1/claim", { Accept: "application/json, text/html" });
  assert.doesNotMatch(claim.text, /data-plugin-manager-link/);
});
