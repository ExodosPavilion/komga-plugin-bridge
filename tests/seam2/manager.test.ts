import assert from "node:assert/strict";
import { join } from "node:path";
import { stat } from "node:fs/promises";
import { startTestHost, type TestHost } from "./support/host.ts";
import { FakeBridge, series } from "./support/fake-bridge.ts";

// The Plugin Manager as the Bridge forwards it: the Bridge adds the shared secret and passes the
// admin's request through, so these tests make the same requests with the secret.

async function withHost(
  options: Parameters<typeof startTestHost>[0],
  body: (host: TestHost, bridge: FakeBridge) => Promise<void>,
) {
  const host = await startTestHost(options);
  try {
    await body(host, new FakeBridge(await host.bridgeConfig(), host.url));
  } finally {
    await host.dispose();
  }
}

const post = async (bridge: FakeBridge, path: string, body: unknown) => {
  const response = await bridge.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await response.body?.cancel();
  return response;
};

const exists = (path: string) => stat(path).then(() => true, () => false);

const greeting = (form: { body: { fields: { name: string; value: unknown }[] } }) =>
  form.body.fields.find((f) => f.name === "greeting")!.value;

Deno.test("the Plugin Manager page and its sections are served, and need the secret", () =>
  withHost({}, async (_host, bridge) => {
    assert.equal(await bridge.status("/manager/", null), 401);
    assert.equal(await bridge.status("/manager/sections.json", null), 401);

    const page = await bridge.request("/manager/");
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type")!, /text\/html/);
    assert.match(await page.text(), /Plugin Manager/);

    const sections: string[] = await (await bridge.request("/manager/sections.json")).json();
    assert.ok(sections.length >= 2, "the plugin list and the Bridge status are sections");
    for (const section of sections) {
      const file = await bridge.request(`/manager/${section}`);
      assert.equal(file.status, 200, section);
      assert.match(file.headers.get("content-type")!, /javascript/);
      await file.body?.cancel();
    }
    assert.equal(await bridge.status("/manager/nothing.js"), 404);
    assert.equal(await bridge.status("/manager/%2e%2e/config.ts"), 404);
  }));

Deno.test("disabling stops a plugin but keeps its settings, and enabling brings it back", () =>
  withHost({ plugins: ["settings-user", "pid-reporter"] }, async (host, bridge) => {
    assert.equal((await bridge.saveSettings("settings-user", { greeting: "kept" })).status, 200);
    let list = await bridge.plugins();
    assert.equal(list.find((p) => p.id === "settings-user")!.running, true);

    const disabled = await post(bridge, "/api/plugins/disable", { id: "settings-user" });
    assert.equal(disabled.status, 200);
    await disabled.body?.cancel();
    list = await bridge.plugins();
    const plugin = list.find((p) => p.id === "settings-user")!;
    assert.equal(plugin.enabled, false);
    assert.equal(plugin.running, false);
    assert.equal(list.find((p) => p.id === "pid-reporter")!.running, true, "others carry on");
    assert.equal(greeting(await bridge.pluginSettings("settings-user")), "kept");

    await host.restart();
    const after = new FakeBridge(await host.bridgeConfig(), host.url);
    assert.equal((await after.plugins()).find((p) => p.id === "settings-user")!.enabled, false);

    const enabled = await post(after, "/api/plugins/enable", { id: "settings-user" });
    assert.equal(enabled.status, 200);
    const back = (await after.plugins()).find((p) => p.id === "settings-user")!;
    assert.equal(back.enabled, true);
    assert.equal(back.running, true);
    assert.equal(greeting(await after.pluginSettings("settings-user")), "kept");

    const unknown = await post(after, "/api/plugins/disable", { id: "nope" });
    assert.equal(unknown.status, 404);
  }));

Deno.test("removing a plugin leaves nothing of it running, installed or stored", () =>
  withHost({ plugins: ["settings-user", "pid-reporter"] }, async (host, bridge) => {
    await bridge.saveSettings("settings-user", { greeting: "gone soon" });
    const folder = join(host.dirs.plugins, "settings-user");
    assert.equal(await exists(folder), true);

    const removed = await post(bridge, "/api/plugins/remove", { id: "settings-user" });
    assert.equal(removed.status, 200);
    await removed.body?.cancel();

    assert.deepEqual((await bridge.plugins()).map((p) => p.id), ["pid-reporter"]);
    assert.equal(await exists(folder), false, "its files are deleted");
    assert.ok((await bridge.pluginSettings("settings-user")).status >= 400);

    await host.restart();
    const after = new FakeBridge(await host.bridgeConfig(), host.url);
    assert.deepEqual((await after.plugins()).map((p) => p.id), ["pid-reporter"]);

    const again = await post(after, "/api/plugins/remove", { id: "settings-user" });
    assert.equal(again.status, 404);
  }));

Deno.test("a removed plugin's id starts clean when it is installed again", () =>
  withHost({ plugins: ["settings-user"] }, async (host, bridge) => {
    await bridge.saveSettings("settings-user", { greeting: "old" });
    const removed = await post(bridge, "/api/plugins/remove", { id: "settings-user" });
    await removed.body?.cancel();
    const { cp } = await import("node:fs/promises");
    await cp(
      join(import.meta.dirname!, "fixtures", "plugins", "settings-user"),
      join(host.dirs.plugins, "settings-user"),
      { recursive: true },
    );
    await host.restart();
    const after = new FakeBridge(await host.bridgeConfig(), host.url);
    assert.equal(greeting(await after.pluginSettings("settings-user")), "hello");
  }));

Deno.test("the manager can read what the Bridge reported (one reporter, one store)", () =>
  withHost({}, async (_host, bridge) => {
    const empty = await (await bridge.request("/api/bridge-status")).json();
    assert.equal(empty.current, null);

    const accepted = await post(bridge, "/bridge/status", {
      instanceId: "run-1",
      active: false,
      reason: "Komga 9.9.9 has not been verified",
      komgaVersion: "9.9.9",
    });
    assert.equal(accepted.status, 200);
    await accepted.body?.cancel();
    const { current } = await (await bridge.request("/api/bridge-status")).json();
    assert.equal(current.active, false);
    assert.equal(current.reason, "Komga 9.9.9 has not been verified");
    assert.equal(current.komgaVersion, "9.9.9");
    assert.ok(Date.parse(current.reportedAt) > 0);
  }));
