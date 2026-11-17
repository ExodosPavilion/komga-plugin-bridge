import assert from "node:assert/strict";
import { startTestHost, type TestHost } from "./support/host.ts";
import { FakeBridge, series } from "./support/fake-bridge.ts";

async function bridgeFor(host: TestHost) {
  return new FakeBridge(await host.bridgeConfig(), host.url);
}

const metadata = async (bridge: FakeBridge) =>
  (await bridge.seriesMetadata(series("/x"))).body.metadata as { summary?: string; title?: string };

const field = (form: { body: { fields: { name: string }[] } }, name: string) =>
  // deno-lint-ignore no-explicit-any
  form.body.fields.find((f) => f.name === name) as any;

Deno.test("manifest defaults apply when nothing is set", async () => {
  const host = await startTestHost({ plugins: ["settings-user"] });
  try {
    const bridge = await bridgeFor(host);
    assert.deepEqual(JSON.parse((await metadata(bridge)).summary!), {
      greeting: "hello",
      retries: 3,
      loud: false,
    });
    const form = await bridge.pluginSettings("settings-user");
    assert.equal(form.status, 200);
    assert.equal(field(form, "greeting").value, "hello");
    assert.equal(field(form, "greeting").help, "What to say");
    assert.equal(field(form, "retries").type, "number");
  } finally {
    await host.dispose();
  }
});

Deno.test("saved settings reach the plugin without a restart", async () => {
  const host = await startTestHost({ plugins: ["settings-user"] });
  try {
    const bridge = await bridgeFor(host);
    const saved = await bridge.saveSettings("settings-user", { greeting: "hi", retries: 5, loud: true });
    assert.equal(saved.status, 200);
    assert.deepEqual(JSON.parse((await metadata(bridge)).summary!), { greeting: "hi", retries: 5, loud: true });
  } finally {
    await host.dispose();
  }
});

Deno.test("invalid setting values are rejected with a clear message and nothing is saved", async () => {
  const host = await startTestHost({ plugins: ["settings-user"] });
  try {
    const bridge = await bridgeFor(host);
    const wrongType = await bridge.saveSettings("settings-user", { greeting: "ok", retries: "many" });
    assert.equal(wrongType.status, 400);
    assert.deepEqual(wrongType.body.errors, ['Setting "retries" must be a number, but got a string.']);
    const unknown = await bridge.saveSettings("settings-user", { nope: 1 });
    assert.equal(unknown.status, 400);
    assert.deepEqual(unknown.body.errors, ['Setting "nope" is not declared by plugin "settings-user".']);
    const bool = await bridge.saveSettings("settings-user", { loud: "yes" });
    assert.deepEqual(bool.body.errors, ['Setting "loud" must be a boolean, but got a string.']);
    // the valid greeting sent along with the bad retries was not saved
    assert.equal(JSON.parse((await metadata(bridge)).summary!).greeting, "hello");
    assert.equal((await bridge.saveSettings("nobody", {})).status, 404);
  } finally {
    await host.dispose();
  }
});

Deno.test("secret values are never returned after saving, but still reach the plugin", async () => {
  const host = await startTestHost({ plugins: ["settings-user"] });
  try {
    const bridge = await bridgeFor(host);
    const saved = await bridge.saveSettings("settings-user", { token: "s3cr3t-value" });
    assert.equal(saved.status, 200);
    assert.ok(!JSON.stringify(saved.body).includes("s3cr3t-value"));
    const form = await bridge.pluginSettings("settings-user");
    assert.ok(!JSON.stringify(form.body).includes("s3cr3t-value"));
    assert.equal(field(form, "token").isSet, true);
    assert.equal("value" in field(form, "token"), false);
    assert.equal(JSON.parse((await metadata(bridge)).summary!).token, "s3cr3t-value");
    // saving other fields leaves the secret in place
    await bridge.saveSettings("settings-user", { greeting: "yo" });
    assert.equal(JSON.parse((await metadata(bridge)).summary!).token, "s3cr3t-value");
    // an invalid value for a secret field is refused without echoing it
    const bad = await bridge.saveSettings("settings-user", { token: 424242 });
    assert.equal(bad.status, 400);
    assert.ok(!JSON.stringify(bad.body).includes("424242"));
  } finally {
    await host.dispose();
  }
});

Deno.test("settings persist across a restart", async () => {
  const host = await startTestHost({ plugins: ["settings-user"] });
  try {
    await (await bridgeFor(host)).saveSettings("settings-user", { greeting: "kept" });
    await host.restart();
    assert.equal(JSON.parse((await metadata(await bridgeFor(host))).summary!).greeting, "kept");
  } finally {
    await host.dispose();
  }
});

Deno.test("a plugin's storage persists across restarts and is invisible to other plugins", async () => {
  const host = await startTestHost({ plugins: ["storage-a", "storage-b"] });
  try {
    let bridge = await bridgeFor(host);
    let result = await metadata(bridge);
    assert.equal(result.summary, "count=1 note=from-a");
    // storage-b reads the same keys in its own storage and finds nothing
    assert.equal(result.title, "count=null note=null");
    assert.equal((await metadata(bridge)).summary, "count=2 note=from-a");
    await host.restart();
    bridge = await bridgeFor(host);
    result = await metadata(bridge);
    assert.equal(result.summary, "count=3 note=from-a");
    assert.equal(result.title, "count=null note=null");
  } finally {
    await host.dispose();
  }
});
