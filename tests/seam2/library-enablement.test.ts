import assert from "node:assert/strict";
import { join } from "node:path";
import { makeSeries, startTestHost, type TestHost } from "./support/host.ts";
import { FakeBridge, series } from "./support/fake-bridge.ts";
import { startFakeKomga } from "./support/fake-komga.ts";

async function withHost(
  options: Parameters<typeof startTestHost>[0],
  body: (host: TestHost, bridge: FakeBridge) => Promise<void>,
) {
  const host = await startTestHost({ callTimeoutMs: 3000, ...options });
  try {
    await body(host, new FakeBridge(await host.bridgeConfig(), host.url));
  } finally {
    await host.dispose();
  }
}

const choose = async (bridge: FakeBridge, body: unknown) => {
  const response = await bridge.request("/api/plugin-libraries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await response.body?.cancel();
  return response.status;
};

const inLibrary = (path: string, libraryId: string) => ({ ...series(path), libraryId });

const FILE = { "plugin-metadata.json": JSON.stringify({ summary: "From the plugin" }) };

Deno.test("a plugin enabled only for library A supplies metadata in A and not in B", () =>
  withHost({ plugins: ["reference"] }, async (host, bridge) => {
    const dir = await makeSeries(host.dirs.library, "Some Series", FILE);
    assert.equal(await choose(bridge, { plugin: "reference", libraries: ["LIB-A"] }), 200);
    assert.deepEqual((await bridge.seriesMetadata(inLibrary(dir, "LIB-A"))).body, { metadata: { summary: "From the plugin" } });
    assert.deepEqual((await bridge.seriesMetadata(inLibrary(dir, "LIB-B"))).body, { metadata: null });

    const book = (libraryId: string) => ({
      id: "B1",
      name: "Book",
      path: join(dir, "001.cbz"),
      seriesId: "S1",
      libraryId,
    });
    await Deno.writeTextFile(join(dir, "001.cbz.plugin-metadata.json"), JSON.stringify({ title: "Book title" }));
    assert.deepEqual((await bridge.bookMetadata(book("LIB-A"))).body, { metadata: { title: "Book title" } });
    assert.deepEqual((await bridge.bookMetadata(book("LIB-B"))).body, { metadata: null });
  }));

Deno.test("a plugin is on for every library until the admin chooses, and the choice survives a restart", () =>
  withHost({ plugins: ["reference"] }, async (host, bridge) => {
    const dir = await makeSeries(host.dirs.library, "Some Series", FILE);
    assert.notEqual((await bridge.seriesMetadata(inLibrary(dir, "LIB-B"))).body.metadata, null);
    await choose(bridge, { plugin: "reference", libraries: ["LIB-A"] });
    await host.restart();
    const after = new FakeBridge(await host.bridgeConfig(), host.url);
    assert.equal((await after.seriesMetadata(inLibrary(dir, "LIB-B"))).body.metadata, null);
    await choose(after, { plugin: "reference", all: true });
    assert.notEqual((await after.seriesMetadata(inLibrary(dir, "LIB-B"))).body.metadata, null);
  }));

Deno.test("a plugin enabled for no library acts nowhere", () =>
  withHost({ plugins: ["reference"] }, async (host, bridge) => {
    const dir = await makeSeries(host.dirs.library, "Some Series", FILE);
    await choose(bridge, { plugin: "reference", libraries: [] });
    assert.equal((await bridge.seriesMetadata(inLibrary(dir, "LIB-A"))).body.metadata, null);
  }));

Deno.test("an invalid choice or an unknown plugin is refused", () =>
  withHost({ plugins: ["reference"] }, async (_host, bridge) => {
    assert.equal(await choose(bridge, { plugin: "reference" }), 400);
    assert.equal(await choose(bridge, { plugin: "reference", libraries: [1] }), 400);
    assert.equal(await choose(bridge, { plugin: "nope", all: true }), 404);
  }));

Deno.test("events reach a plugin only for the libraries it is enabled for", () =>
  withHost({ plugins: ["event-recorder"] }, async (_host, bridge) => {
    await choose(bridge, { plugin: "event-recorder", libraries: ["LIB-A"] });
    assert.deepEqual((await bridge.event("LibraryScanned", { library: { id: "LIB-B", name: "B" } })).body, { delivered: [] });
    assert.deepEqual((await bridge.event("LibraryScanned", { library: { id: "LIB-A", name: "A" } })).body, {
      delivered: ["event-recorder"],
    });
    assert.deepEqual(
      (await bridge.event("SeriesAdded", { series: { id: "S", name: "S", libraryId: "LIB-B" } })).body,
      { delivered: [] },
    );
    // An event that is not about one library still reaches a plugin enabled somewhere.
    assert.deepEqual((await bridge.event("LibraryScanned", {})).body, { delivered: ["event-recorder"] });
  }));

Deno.test("response filtering follows enablement", () =>
  withHost({ plugins: ["response-filter"] }, async (_host, bridge) => {
    const filter = async (path: string, query = "") =>
      (await (await bridge.request("/bridge/response-filter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: { method: "GET", path, query }, body: [{ name: "Hidden" }] }),
      })).json()).changed;
    const announced = async () => (await (await bridge.request("/bridge/response-filters")).json()).routes;

    await choose(bridge, { plugin: "response-filter", libraries: ["LIB-A"] });
    assert.equal(await filter("/api/v1/libraries"), true, "a request not about one library applies when enabled somewhere");
    assert.equal(await filter("/api/v1/series/x", "library_id=LIB-A"), true);
    assert.equal(await filter("/api/v1/series/x", "library_id=LIB-B"), false);
    assert.equal(await filter("/api/v1/series/x", "library_id=LIB-A,LIB-B"), false);

    await choose(bridge, { plugin: "response-filter", libraries: [] });
    assert.deepEqual(await announced(), [], "a plugin enabled nowhere announces no routes");
    assert.equal(await filter("/api/v1/libraries"), false);
  }));

const LIBRARIES = [
  { id: "LIB-A", name: "Comics", importComicInfoBook: true, importComicInfoSeries: false, importEpubBook: false },
  { id: "LIB-B", name: "Books", importComicInfoBook: false, importMylarSeries: true },
  { id: "LIB-C", name: "Clean", importComicInfoBook: false },
];

Deno.test("a warning names each library where a metadata plugin and a built-in importer are both on", async () => {
  const komga = startFakeKomga("key", LIBRARIES);
  try {
    await withHost(
      { plugins: ["reference", "event-recorder"], komgaUrl: komga.url, komgaApiKey: "key" },
      async (_host, bridge) => {
        const clashes = async () => (await (await bridge.request("/api/plugin-clashes")).json()).clashes;
        const names = (list: { importers: { setting: string }[] }[]) => list.map((c) => c.importers.map((i) => i.setting));

        const everywhere = await clashes();
        assert.deepEqual(everywhere.map((c: { libraryId: string }) => c.libraryId), ["LIB-A", "LIB-B"]);
        assert.ok(everywhere.every((c: { plugin: string }) => c.plugin === "reference"), "only metadata plugins clash");
        assert.deepEqual(names(everywhere), [["importComicInfoBook"], ["importMylarSeries"]]);

        await choose(bridge, { plugin: "reference", libraries: ["LIB-B", "LIB-C"] });
        assert.deepEqual((await clashes()).map((c: { libraryId: string }) => c.libraryId), ["LIB-B"]);

        await choose(bridge, { plugin: "reference", libraries: ["LIB-C"] });
        assert.deepEqual(await clashes(), []);

        const state = await (await bridge.request("/api/plugin-libraries")).json();
        assert.deepEqual(state.komgaLibraries.map((l: { id: string }) => l.id), ["LIB-A", "LIB-B", "LIB-C"]);
      },
    );
  } finally {
    await komga.stop();
  }
});

Deno.test("without Komga access the warning list says why it is empty", () =>
  withHost({ plugins: ["reference"] }, async (_host, bridge) => {
    const body = await (await bridge.request("/api/plugin-clashes")).json();
    assert.deepEqual(body.clashes, []);
    assert.match(body.unavailable, /KOMGA_URL/);
  }));

Deno.test("removing a plugin forgets where it was enabled", () =>
  withHost({ plugins: ["reference"] }, async (_host, bridge) => {
    await choose(bridge, { plugin: "reference", libraries: ["LIB-A"] });
    const removed = await bridge.request("/api/plugins/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "reference" }),
    });
    await removed.body?.cancel();
    assert.equal(removed.status, 200);
    const state = await (await bridge.request("/api/plugin-libraries")).json();
    assert.deepEqual(state.plugins, []);
  }));
