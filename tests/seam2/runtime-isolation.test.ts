import assert from "node:assert/strict";
import { join } from "node:path";
import { startTestHost, type TestHost, type TestHostOptions } from "./support/host.ts";
import { FakeBridge, series } from "./support/fake-bridge.ts";

/**
 * Starts a host with the prober plugin (plus any other plugins asked for) and returns what the
 * prober reports when asked to read `path(host)`, fetch `url` and write beside the path.
 */
async function probe(options: TestHostOptions, path: (host: TestHost) => string, url = "Series") {
  const host = await startTestHost({ ...options, plugins: ["prober", ...(options.plugins ?? [])] });
  try {
    const bridge = new FakeBridge(await host.bridgeConfig(), host.url);
    const { body } = await bridge.seriesMetadata({ ...series(path(host)), name: url });
    return body.metadata.summary as string;
  } finally {
    await host.dispose();
  }
}

const libraryFiles = { "a.txt": "A", "b.txt": "B" };
const inA = (host: TestHost) => join(host.dirs.library, "a.txt");
const inB = (host: TestHost) => join(host.dirs.library2, "b.txt");

Deno.test("a plugin without the network capability cannot reach the network", async () => {
  const server = Deno.serve({ port: 0, hostname: "127.0.0.1", onListen: () => {} }, () => new Response("hi"));
  const url = `http://127.0.0.1:${server.addr.port}/`;
  try {
    assert.match(await probe({}, () => "/nonexistent", url), /net:denied/);
    assert.match(
      await probe({ capabilities: { prober: ["network"] } }, () => "/nonexistent", url),
      /net:allowed/,
    );
  } finally {
    await server.shutdown();
  }
});

Deno.test("a plugin with file-read for library A reads A's files but not library B's", async () => {
  const options = { capabilities: { prober: ["file-read:{library}"] }, libraryFiles };
  assert.match(await probe(options, inA), /read:allowed/);
  assert.match(await probe(options, inB), /read:denied/);
});

Deno.test("a plugin with no file-read capability cannot read any library", async () => {
  assert.match(await probe({ libraryFiles }, inA), /read:denied/);
});

Deno.test("a plugin cannot read another plugin's files or the host's database", async () => {
  const options = { plugins: ["reference"], capabilities: { prober: ["file-read:{library}"] } };
  assert.match(await probe(options, (h) => join(h.dirs.plugins, "reference", "manifest.json")), /read:denied/);
  assert.match(await probe(options, (h) => join(h.dirs.data, "plugin-host.sqlite")), /read:denied/);
  assert.match(await probe(options, (h) => join(h.dirs.plugins, "prober", "manifest.json")), /read:allowed/);
});

Deno.test("file-write is in the capability model but cannot be granted yet", async () => {
  const options = {
    capabilities: { prober: ["file-write:{library}", "file-read:{library}"] },
    libraryFiles,
  };
  assert.match(await probe(options, inA), /read:allowed write:denied/);

  const host = await startTestHost({ ...options, plugins: ["prober"] });
  try {
    const [plugin] = await new FakeBridge(await host.bridgeConfig(), host.url).plugins();
    assert.deepEqual(plugin.capabilities, [
      // listed from the approved set, which is sorted
      { capability: `file-read:${host.dirs.library}`, granted: true },
      { capability: `file-write:${host.dirs.library}`, granted: false },
    ]);
  } finally {
    await host.dispose();
  }
});

Deno.test("file-read:* declares every configured library", async () => {
  const options = { capabilities: { prober: ["file-read:*"] }, libraryFiles };
  assert.match(await probe(options, inA), /read:allowed/);
  assert.match(await probe(options, inB), /read:allowed/);
});
