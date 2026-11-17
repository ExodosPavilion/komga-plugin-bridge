import assert from "node:assert/strict";
import { startTestHost } from "./support/host.ts";
import { FakeBridge, series } from "./support/fake-bridge.ts";

Deno.test("each installation gets its own secret, and near-misses are refused", async () => {
  const a = await startTestHost();
  const b = await startTestHost();
  try {
    const secretA = (await a.bridgeConfig()).secret;
    assert.notEqual(secretA, (await b.bridgeConfig()).secret);

    const bridge = new FakeBridge(await a.bridgeConfig(), a.url);
    const lastDigit = secretA.endsWith("0") ? "1" : "0";
    assert.equal((await bridge.seriesMetadata(series("/x"), secretA.slice(0, -1) + lastDigit)).status, 401);
    assert.equal((await bridge.seriesMetadata(series("/x"), secretA.slice(0, -1))).status, 401);
    assert.equal((await bridge.seriesMetadata(series("/x"), (await b.bridgeConfig()).secret)).status, 401);
    assert.equal((await bridge.seriesMetadata(series("/x"), secretA)).status, 200);
  } finally {
    await a.dispose();
    await b.dispose();
  }
});

Deno.test("a restarted host still accepts the old secret and the Bridge file is rewritten with it", async () => {
  const host = await startTestHost();
  try {
    const before = await host.bridgeConfig();
    await host.restart();
    const bridge = new FakeBridge(before, host.url);
    assert.equal((await bridge.seriesMetadata(series("/x"))).status, 200);
    assert.deepEqual((await host.bridgeConfig()).secret, before.secret);
  } finally {
    await host.dispose();
  }
});
