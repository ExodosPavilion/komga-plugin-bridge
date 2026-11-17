import assert from "node:assert/strict";
import { writeSeries } from "./support/fixture-library.ts";
import { api, createLibrary, seriesNamed, startedAndClaimed, waitFor } from "./support/komga.ts";

const LIBRARY = "/data";

Deno.test("the reference plugin's series metadata appears after a scan", async () => {
  await startedAndClaimed();
  await writeSeries(LIBRARY, "Plugin Series", {
    "plugin-metadata.json": JSON.stringify({
      summary: "Supplied by the reference plugin",
      publisher: "Reference Press",
      genres: ["Action", "Comedy"],
    }),
  });
  await writeSeries(LIBRARY, "Plain Series");
  await createLibrary("Fixture", LIBRARY);

  // Komga scans in the background; poll its REST API for the result.
  const series = await waitFor("the plugin's metadata on the series", async () => {
    const found = await seriesNamed("Plugin Series");
    return found?.metadata?.summary === "Supplied by the reference plugin" && found;
  });
  assert.equal(series.metadata.publisher, "Reference Press");
  // Komga stores genres in lower case.
  assert.deepEqual([...series.metadata.genres].sort(), ["action", "comedy"]);

  // A series without the plugin's file is scanned normally and gets nothing from the plugin.
  const plain = await waitFor("the plain series", () => seriesNamed("Plain Series"));
  assert.equal(plain.metadata.summary, "");
  assert.equal(plain.metadata.publisher, "");

  const response = await api(`/api/v1/series/${series.id}`);
  assert.equal((await response.json()).metadata.summary, "Supplied by the reference plugin");
});
