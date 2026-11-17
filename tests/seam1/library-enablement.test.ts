import assert from "node:assert/strict";
import { writeSeries } from "./support/fixture-library.ts";
import { api, createLibrary, seriesNamed, startedAndClaimed, waitFor } from "./support/komga.ts";

// The admin switches the reference plugin on for library A only, through the Plugin Manager's
// route at Komga's address, then both libraries are refreshed.
const MANAGER = "/api/v1/plugin-manager";
const FILE = { "plugin-metadata.json": JSON.stringify({ summary: "Supplied by the reference plugin" }) };

async function chooseLibraries(body: unknown) {
  const response = await api(`${MANAGER}/api/plugin-libraries`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
    body: JSON.stringify({ plugin: "reference", ...(body as object) }),
  });
  await response.body?.cancel();
  assert.equal(response.status, 200);
}

Deno.test("a plugin enabled only for library A supplies metadata in A and not in B", async () => {
  await startedAndClaimed();
  try {
    // Off everywhere while the libraries are created, so the first scan cannot decide anything.
    await chooseLibraries({ libraries: [] });
    await writeSeries("/enablement/a", "Enabled Here", FILE);
    await writeSeries("/enablement/b", "Not Enabled Here", FILE);
    const a = await createLibrary("Library A", "/enablement/a");
    const b = await createLibrary("Library B", "/enablement/b");
    await waitFor("both series", async () => (await seriesNamed("Enabled Here")) && (await seriesNamed("Not Enabled Here")));

    await chooseLibraries({ libraries: [a] });
    for (const id of [a, b]) {
      const refresh = await api(`/api/v1/libraries/${id}/metadata/refresh`, { method: "POST" });
      await refresh.body?.cancel();
    }

    const enabled = await waitFor("the plugin's metadata in library A", async () => {
      const found = await seriesNamed("Enabled Here");
      return found?.metadata?.summary === "Supplied by the reference plugin" && found;
    });
    assert.equal(enabled.libraryId, a);
    // Library B was refreshed at the same time; give Komga time to have run it.
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const other = await seriesNamed("Not Enabled Here");
    assert.equal(other.libraryId, b);
    assert.equal(other.metadata.summary, "");
  } finally {
    await chooseLibraries({ all: true });
  }
});
