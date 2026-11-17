import assert from "node:assert/strict";
import { makeSeries, startTestHost } from "./support/host.ts";
import { FakeBridge, series } from "./support/fake-bridge.ts";

async function withHost(
  plugins: string[],
  body: (host: Awaited<ReturnType<typeof startTestHost>>, bridge: FakeBridge) => Promise<void>,
) {
  const host = await startTestHost({ plugins, callTimeoutMs: 3000 });
  try {
    await body(host, new FakeBridge(await host.bridgeConfig(), host.url));
  } finally {
    await host.dispose();
  }
}

Deno.test("the reference plugin supplies the metadata file beside a series", () =>
  withHost(["reference"], async (host, bridge) => {
    const dir = await makeSeries(host.dirs.library, "Some Series", {
      "plugin-metadata.json": JSON.stringify({
        summary: "A summary from the file",
        publisher: "Fixture Press",
        genres: ["Action", "Comedy"],
      }),
    });
    const response = await bridge.seriesMetadata(series(dir));
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      metadata: {
        summary: "A summary from the file",
        publisher: "Fixture Press",
        genres: ["Action", "Comedy"],
      },
    });
  }));

Deno.test("a series without the metadata file gets no metadata", () =>
  withHost(["reference"], async (host, bridge) => {
    const dir = await makeSeries(host.dirs.library, "Bare Series");
    assert.deepEqual((await bridge.seriesMetadata(series(dir))).body, { metadata: null });
  }));

Deno.test("with no plugins installed the host answers with no metadata", () =>
  withHost([], async (host, bridge) => {
    const dir = await makeSeries(host.dirs.library, "Any Series");
    assert.deepEqual((await bridge.seriesMetadata(series(dir))).body, { metadata: null });
  }));

Deno.test("each enabled plugin runs as its own process, apart from the host", () =>
  withHost(["pid-reporter", "reference"], async (host, bridge) => {
    const plugins = await bridge.plugins();
    assert.deepEqual(plugins.map((p) => p.id), ["pid-reporter", "reference"]);
    const pids = plugins.map((p) => p.pid);
    assert.ok(pids.every((pid) => typeof pid === "number" && pid !== Deno.pid));
    assert.notEqual(pids[0], pids[1]);

    // The process the plugin says it runs in is the one the host lists.
    const dir = await makeSeries(host.dirs.library, "Pid Series");
    const { body } = await bridge.seriesMetadata(series(dir));
    assert.equal(body.metadata.summary, String(pids[0]));
  }));

Deno.test("a plugin has no access beyond its own folder and the library folders", () =>
  withHost(["snooper"], async (host, bridge) => {
    const dir = await makeSeries(host.dirs.library, "Snoop Series");
    const { body } = await bridge.seriesMetadata(series(dir));
    assert.equal(body.metadata.summary, "read-outside:denied net:denied env:denied write:denied");
  }));

Deno.test("a crashing plugin does not stop other plugins from supplying metadata", () =>
  withHost(["crasher", "pid-reporter"], async (host, bridge) => {
    const dir = await makeSeries(host.dirs.library, "Crash Series");
    const { status, body } = await bridge.seriesMetadata(series(dir));
    assert.equal(status, 200);
    assert.match(body.metadata.summary, /^\d+$/);
  }));

Deno.test("a hanging plugin is cut off at the time limit and the call still answers", async () => {
  const host = await startTestHost({ plugins: ["hanger"], callTimeoutMs: 300 });
  try {
    const bridge = new FakeBridge(await host.bridgeConfig(), host.url);
    const started = Date.now();
    const { status, body } = await bridge.seriesMetadata(series("/x"));
    assert.equal(status, 200);
    assert.deepEqual(body, { metadata: null });
    assert.ok(Date.now() - started < 2000);
  } finally {
    await host.dispose();
  }
});
