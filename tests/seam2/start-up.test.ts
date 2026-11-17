import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { startTestHost } from "./support/host.ts";
import { FakeBridge, series } from "./support/fake-bridge.ts";
import { startFakeKomga } from "./support/fake-komga.ts";

Deno.test("on start the host places the Bridge and its connection details in the shared volume", async () => {
  const host = await startTestHost();
  try {
    assert.equal(
      await readFile(join(host.dirs.bridge, "bridge.jar"), "utf8"),
      "not really a jar, but the host only copies it",
    );
    const config = await host.bridgeConfig();
    assert.equal(config.pluginHostUrl, "http://plugin-host.test:8080");
    assert.match(config.secret, /^[0-9a-f]{64}$/);
    assert.ok(config.timeoutMillis > 0);
  } finally {
    await host.dispose();
  }
});

Deno.test("the shared secret is generated once and survives a restart", async () => {
  const host = await startTestHost();
  try {
    const before = await host.bridgeConfig();
    await host.restart();
    assert.equal((await host.bridgeConfig()).secret, before.secret);
  } finally {
    await host.dispose();
  }
});

Deno.test("the host refuses bridge calls that lack the shared secret", async () => {
  const host = await startTestHost();
  try {
    const bridge = new FakeBridge(await host.bridgeConfig(), host.url);
    assert.equal((await bridge.seriesMetadata(series("/x"), null)).status, 401);
    assert.equal((await bridge.seriesMetadata(series("/x"), "wrong")).status, 401);
    assert.equal(await bridge.status("/api/plugins", null), 401);
    assert.equal((await bridge.seriesMetadata(series("/x"))).status, 200);
  } finally {
    await host.dispose();
  }
});

Deno.test("the host keeps its state in its own SQLite database in its own data directory", async () => {
  const host = await startTestHost({ plugins: ["pid-reporter"] });
  try {
    assert.ok(existsSync(join(host.dirs.data, "plugin-host.sqlite")));
    await host.restart();
    const bridge = new FakeBridge(await host.bridgeConfig(), host.url);
    const plugins = await bridge.plugins();
    assert.deepEqual(plugins.map((p) => [p.id, p.version, p.enabled]), [["pid-reporter", "1.0.0", true]]);
  } finally {
    await host.dispose();
  }
});

Deno.test("the host starts and serves with a Komga configured", async () => {
  const komga = startFakeKomga();
  const host = await startTestHost({ komgaUrl: komga.url, komgaApiKey: komga.apiKey });
  try {
    const response = await fetch(`${host.url}/healthz`);
    await response.body?.cancel();
    assert.equal(response.status, 200);
  } finally {
    await host.dispose();
    await komga.stop();
  }
});
