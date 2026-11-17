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

const LIB_A = "LIB-A";
const LIB_B = "LIB-B";
const choose = async (host: TestHost, body: unknown) => {
  const bridge = new FakeBridge(await host.bridgeConfig(), host.url);
  const response = await bridge.request("/api/plugin-libraries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await response.body?.cancel();
  assert.equal(response.status, 200);
  return bridge;
};
// The prober's own series call is made in library LIB-A, which every choice below includes.
const read = async (bridge: FakeBridge, path: string) =>
  (await bridge.seriesMetadata({ ...series(path), libraryId: LIB_A })).body.metadata?.summary as string;

Deno.test("enabled for library A only, a plugin cannot read library B even with file-read:*", async () => {
  const host = await startTestHost({
    plugins: ["prober"],
    capabilities: { prober: ["file-read:*"] },
    libraryFiles,
    libraries: true,
  });
  try {
    const bridge = await choose(host, { plugin: "prober", libraries: [LIB_A] });
    assert.match(await read(bridge, inA(host)), /read:allowed/);
    assert.match(await read(bridge, inB(host)), /read:denied/);
    // The Plugin Manager reports the capability as in effect while it covers an enabled library.
    assert.deepEqual((await bridge.plugins())[0].capabilities, [{ capability: "file-read:*", granted: true }]);
  } finally {
    await host.dispose();
  }
});

Deno.test("a folder-specific file-read is limited to the library it names even when enabled for both", async () => {
  const host = await startTestHost({
    plugins: ["prober"],
    capabilities: { prober: ["file-read:{library}"] },
    libraryFiles,
    libraries: true,
  });
  try {
    const bridge = await choose(host, { plugin: "prober", all: true });
    assert.match(await read(bridge, inA(host)), /read:allowed/);
    assert.match(await read(bridge, inB(host)), /read:denied/);
  } finally {
    await host.dispose();
  }
});

Deno.test("changing the library choice changes what a running plugin can read", async () => {
  const host = await startTestHost({
    plugins: ["prober"],
    capabilities: { prober: ["file-read:*"] },
    libraryFiles,
    libraries: true,
  });
  try {
    let bridge = await choose(host, { plugin: "prober", libraries: [LIB_A] });
    assert.match(await read(bridge, inB(host)), /read:denied/);
    bridge = await choose(host, { plugin: "prober", libraries: [LIB_A, LIB_B] });
    assert.match(await read(bridge, inB(host)), /read:allowed/);
    bridge = await choose(host, { plugin: "prober", libraries: [LIB_A] });
    assert.match(await read(bridge, inB(host)), /read:denied/);
  } finally {
    await host.dispose();
  }
});

Deno.test("a plugin cannot read library folders when Komga's library list is unavailable", async () => {
  const host = await startTestHost({
    plugins: ["prober"],
    capabilities: { prober: ["file-read:*"] },
    libraryFiles,
    libraries: false,
  });
  try {
    const bridge = new FakeBridge(await host.bridgeConfig(), host.url);
    assert.match(await read(bridge, inA(host)), /read:denied/);
  } finally {
    await host.dispose();
  }
});

Deno.test("a plugin cannot learn KOMGA_API_KEY or any host environment variable, whatever it holds", async () => {
  const secret = "host-secret-key-1234";
  Deno.env.set("KOMGA_API_KEY", secret);
  try {
    const host = await startTestHost({
      plugins: ["env-snoop"],
      // every capability that exists: network, library reads and Komga data
      capabilities: { "env-snoop": ["network", "file-read:*", "komga:read", "komga:write"] },
      komgaApiKey: secret,
      komgaUrl: "http://127.0.0.1:1",
    });
    try {
      const bridge = new FakeBridge(await host.bridgeConfig(), host.url);
      const summary = (await bridge.seriesMetadata(series(host.dirs.library))).body.metadata.summary as string;
      assert.doesNotMatch(summary, /leaked/);
      assert.ok(!summary.includes(secret));
      // Deno denies reading the environment outright, and /proc is outside what it may read.
      assert.equal(summary, "denied denied denied denied denied");
    } finally {
      await host.dispose();
    }
  } finally {
    Deno.env.delete("KOMGA_API_KEY");
  }
});
