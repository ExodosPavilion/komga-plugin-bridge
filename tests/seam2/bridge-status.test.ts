import assert from "node:assert/strict";
import { startTestHost } from "./support/host.ts";
import { FakeBridge } from "./support/fake-bridge.ts";

const report = (over: Record<string, unknown> = {}) => ({
  instanceId: "komga-run-1",
  active: false,
  komgaVersion: "9.9.9",
  supportedVersions: ["1.30.1"],
  reason: "Komga 9.9.9 is not on the Bridge's supported list (1.30.1)",
  ...over,
});

async function send(bridge: FakeBridge, body: unknown, secret?: string | null) {
  const response = await bridge.request("/bridge/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, secret);
  await response.body?.cancel();
  return response.status;
}

async function status(bridge: FakeBridge) {
  const response = await bridge.request("/api/bridge-status");
  return await response.json();
}

Deno.test("before any Bridge has reported, the host says so", async () => {
  const host = await startTestHost();
  try {
    const bridge = new FakeBridge(await host.bridgeConfig(), host.url);
    assert.deepEqual(await status(bridge), { current: null, reports: [] });
  } finally {
    await host.dispose();
  }
});

Deno.test("an inactive Bridge's report and its reason are available to the Plugin Manager, and survive a restart", async () => {
  const host = await startTestHost();
  try {
    const bridge = new FakeBridge(await host.bridgeConfig(), host.url);
    assert.equal(await send(bridge, report()), 200);
    const { current } = await status(bridge);
    assert.equal(current.active, false);
    assert.equal(current.komgaVersion, "9.9.9");
    assert.match(current.reason, /not on the Bridge's supported list/);
    assert.deepEqual(current.supportedVersions, ["1.30.1"]);
    assert.ok(current.reportedAt);

    await host.restart();
    const after = new FakeBridge(await host.bridgeConfig(), host.url);
    assert.equal((await status(after)).current.active, false);
  } finally {
    await host.dispose();
  }
});

Deno.test("a later report from the same Komga run replaces the earlier one; a new run is added", async () => {
  const host = await startTestHost();
  try {
    const bridge = new FakeBridge(await host.bridgeConfig(), host.url);
    await send(bridge, report());
    await send(bridge, report({ active: true, komgaVersion: "1.30.1", reason: null }));
    let result = await status(bridge);
    assert.equal(result.reports.length, 1);
    assert.equal(result.current.active, true);
    assert.equal(result.current.reason, null);

    await send(bridge, report({ instanceId: "komga-run-2" }));
    result = await status(bridge);
    assert.equal(result.reports.length, 2);
    assert.equal(result.current.instanceId, "komga-run-2");
  } finally {
    await host.dispose();
  }
});

Deno.test("malformed or unauthenticated reports are refused", async () => {
  const host = await startTestHost();
  try {
    const bridge = new FakeBridge(await host.bridgeConfig(), host.url);
    assert.equal(await send(bridge, { active: true }), 400);
    assert.equal(await send(bridge, report({ active: "yes" })), 400);
    assert.equal(await send(bridge, report(), null), 401);
    assert.equal(await bridge.status("/api/bridge-status", null), 401);
    assert.deepEqual(await status(bridge), { current: null, reports: [] });
  } finally {
    await host.dispose();
  }
});
