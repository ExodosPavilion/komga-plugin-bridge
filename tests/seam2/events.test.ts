import assert from "node:assert/strict";
import { startTestHost } from "./support/host.ts";
import { FakeBridge, series } from "./support/fake-bridge.ts";

async function withHost(
  plugins: string[],
  body: (bridge: FakeBridge) => Promise<void>,
  failureThreshold = 3,
) {
  const host = await startTestHost({ plugins, callTimeoutMs: 3000, failureThreshold });
  try {
    await body(new FakeBridge(await host.bridgeConfig(), host.url));
  } finally {
    await host.dispose();
  }
}

/** What the recorder plugin has received, read back through its metadata hook. */
const received = async (bridge: FakeBridge) =>
  JSON.parse((await bridge.seriesMetadata(series("/x"))).body.metadata.summary);

Deno.test("a plugin receives the library-scan-finished event it subscribed to", () =>
  withHost(["event-recorder"], async (bridge) => {
    const { status, body } = await bridge.event("LibraryScanned", { library: { id: "L1", name: "Comics" } });
    assert.equal(status, 200);
    assert.deepEqual(body, { delivered: ["event-recorder"] });
    assert.deepEqual(await received(bridge), [
      { type: "LibraryScanned", data: { library: { id: "L1", name: "Comics" } } },
    ]);
  }));

Deno.test("a plugin receives only the events it subscribed to", () =>
  withHost(["event-recorder", "event-other"], async (bridge) => {
    assert.deepEqual((await bridge.event("LibraryScanned")).body, { delivered: ["event-recorder"] });
    assert.deepEqual((await bridge.event("BookAdded")).body, { delivered: ["event-other"] });
    assert.deepEqual((await bridge.event("ReadProgressChanged")).body, { delivered: [] });
    assert.deepEqual((await received(bridge)).map((e: { type: string }) => e.type), ["LibraryScanned"]);
  }));

Deno.test("a plugin failing on an event is recorded and does not stop other plugins", () =>
  withHost(["event-crasher", "event-recorder"], async (bridge) => {
    const { status, body } = await bridge.event("LibraryScanned");
    assert.equal(status, 200);
    assert.deepEqual(body, { delivered: ["event-recorder"] });
    const failures = await bridge.failures("event-crasher");
    assert.equal(failures.length, 1);
    assert.equal(failures[0].kind, "error");
    assert.match(failures[0].reason, /onEvent.*cannot handle this event/);
    assert.equal((await received(bridge)).length, 1);
  }));

Deno.test("repeated failures on events disable the plugin, like any other failure", () =>
  withHost(["event-crasher"], async (bridge) => {
    for (let i = 0; i < 3; i++) await bridge.event("LibraryScanned");
    const plugin = (await bridge.plugins()).find((p) => p.id === "event-crasher");
    assert.equal(plugin?.enabled, false);
    assert.equal(plugin?.autoDisabled, true);
    // A disabled plugin is not called any more.
    assert.deepEqual((await bridge.event("LibraryScanned")).body, { delivered: [] });
    assert.equal((await bridge.failures("event-crasher")).length, 3);
  }, 3));

Deno.test("events need the shared secret and a valid type", () =>
  withHost(["event-recorder"], async (bridge) => {
    assert.equal((await bridge.event("LibraryScanned", {}, null)).status, 401);
    assert.equal((await bridge.event("not a type")).status, 400);
    assert.deepEqual(await received(bridge), []);
  }));
