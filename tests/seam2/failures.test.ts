import assert from "node:assert/strict";
import { join } from "node:path";
import { rm, writeFile } from "node:fs/promises";
import { makeSeries, startTestHost, type TestHost } from "./support/host.ts";
import { FakeBridge, series } from "./support/fake-bridge.ts";

async function withHost(
  options: Parameters<typeof startTestHost>[0],
  // deno-lint-ignore no-explicit-any
  body: (host: TestHost, bridge: FakeBridge, ask: () => Promise<any>) => Promise<void>,
) {
  const host = await startTestHost(options);
  try {
    const bridge = new FakeBridge(await host.bridgeConfig(), host.url);
    const dir = await makeSeries(host.dirs.library, "Some Series");
    await body(host, bridge, async () => (await bridge.seriesMetadata(series(dir))).body);
  } finally {
    await host.dispose();
  }
}

Deno.test("each failure is recorded with plugin, time, kind and reason", () =>
  withHost({ plugins: ["crasher", "hanger"], callTimeoutMs: 300, failureThreshold: 10 }, async (_h, bridge, ask) => {
    const before = Date.now();
    await ask();
    const crasher = await bridge.failures("crasher");
    assert.equal(crasher.length, 1);
    assert.equal(crasher[0].plugin, "crasher");
    assert.equal(crasher[0].kind, "error");
    assert.match(crasher[0].reason, /this plugin always fails/);
    assert.ok(Date.parse(crasher[0].at) >= before - 1000);

    const hanger = await bridge.failures("hanger");
    assert.equal(hanger.length, 1);
    assert.equal(hanger[0].kind, "timeout");
    assert.match(hanger[0].reason, /timed out/);
  }));

Deno.test("a plugin that fails N times in a row is disabled, and the others carry on", () =>
  withHost({ plugins: ["crasher", "pid-reporter"], failureThreshold: 3 }, async (_h, bridge, ask) => {
    for (let i = 0; i < 2; i++) await ask();
    let crasher = (await bridge.plugins()).find((p) => p.id === "crasher")!;
    assert.equal(crasher.enabled, true);
    await ask();
    crasher = (await bridge.plugins()).find((p) => p.id === "crasher")!;
    assert.equal(crasher.enabled, false);
    assert.equal(crasher.running, false);
    assert.equal(crasher.autoDisabled, true);

    // Once disabled it is no longer called, so no further failures are recorded.
    await ask();
    assert.equal((await bridge.failures("crasher")).length, 3);
    const other = (await bridge.plugins()).find((p) => p.id === "pid-reporter")!;
    assert.equal(other.enabled, true);
    assert.match((await ask()).metadata.summary, /^\d+$/);
  }));

Deno.test("a success resets the consecutive failure count", () =>
  withHost({ plugins: ["toggle"], failureThreshold: 3 }, async (host, bridge, ask) => {
    const flag = join(host.dirs.plugins, "toggle", "fail");
    await writeFile(flag, "");
    await ask();
    await ask();
    await rm(flag);
    assert.equal((await ask()).metadata.summary, "toggle ok");
    await writeFile(flag, "");
    await ask();
    await ask();
    assert.equal((await bridge.plugins())[0].enabled, true, "four failures in total, but never three in a row");
    await ask();
    assert.equal((await bridge.plugins())[0].enabled, false);
  }));

Deno.test("an automatically disabled plugin can be re-enabled through the host", () =>
  withHost({ plugins: ["toggle"], failureThreshold: 2 }, async (host, bridge, ask) => {
    const flag = join(host.dirs.plugins, "toggle", "fail");
    await writeFile(flag, "");
    await ask();
    await ask();
    assert.equal((await bridge.plugins())[0].enabled, false);

    await rm(flag);
    assert.equal((await bridge.enable("toggle")).status, 200);
    const toggle = (await bridge.plugins())[0];
    assert.equal(toggle.enabled, true);
    assert.equal(toggle.running, true);
    assert.equal(toggle.autoDisabled, false);
    assert.equal((await ask()).metadata.summary, "toggle ok");
    assert.equal((await bridge.enable("nope")).status, 404);
  }));

Deno.test("failure records and the disabled state survive a restart", () =>
  withHost({ plugins: ["crasher"], failureThreshold: 1 }, async (host, _bridge, ask) => {
    await ask();
    await host.restart();
    const after = new FakeBridge(await host.bridgeConfig(), host.url);
    assert.equal((await after.failures("crasher")).length, 1);
    const crasher = (await after.plugins())[0];
    assert.equal(crasher.enabled, false);
    assert.equal(crasher.running, false);
  }));

Deno.test("a plugin whose process dies is recorded as a crash", () =>
  withHost({ plugins: ["toggle"], failureThreshold: 5 }, async (_host, bridge, ask) => {
    const pid = (await bridge.plugins())[0].pid!;
    Deno.kill(pid, "SIGKILL");
    await new Promise((r) => setTimeout(r, 300));
    await ask();
    const failures = await bridge.failures("toggle");
    assert.equal(failures.length, 1);
    assert.equal(failures[0].kind, "crash");
  }));
