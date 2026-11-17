import assert from "node:assert/strict";
import { writeSeries } from "./support/fixture-library.ts";
import { api, createLibrary, startedAndClaimed, waitFor } from "./support/komga.ts";

const LIBRARY = "/data";

Deno.test("a plugin receives the library-scan-finished event after a scan", async () => {
  // The fixture plugin (event-sink) forwards LibraryScanned to this listener.
  const received: { type: string; data: { library?: { id: string; name: string } } }[] = [];
  const server = Deno.serve({ port: 9099, hostname: "0.0.0.0", onListen: () => {} }, async (req) => {
    received.push(await req.json());
    return new Response(null, { status: 204 });
  });
  try {
    await startedAndClaimed();
    await writeSeries(LIBRARY, "Event Series");

    // Another test may already have created the library; scan it again then.
    const libraries: { id: string; root: string }[] = await (await api("/api/v1/libraries")).json();
    let id = libraries.find((l) => l.root === LIBRARY)?.id;
    if (id) {
      const scan = await api(`/api/v1/libraries/${id}/scan`, { method: "POST" });
      await scan.body?.cancel();
    } else {
      id = await createLibrary("Events", LIBRARY);
    }

    // Komga scans in the background; the event arrives at the end of the scan.
    const event = await waitFor("the library-scan-finished event", async () =>
      received.find((e) => e.type === "LibraryScanned" && e.data.library?.id === id));
    assert.equal(event.type, "LibraryScanned");
    assert.ok(event.data.library?.name);
    assert.deepEqual(Object.keys(event.data), ["library"], "only ids and names are forwarded");
  } finally {
    await server.shutdown();
  }
});
