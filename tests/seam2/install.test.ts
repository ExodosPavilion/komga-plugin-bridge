import assert from "node:assert/strict";
import { join } from "node:path";
import { stat } from "node:fs/promises";
import { zip, type ZipEntry } from "../../template/scripts/zip.ts";
import { startTestHost, type TestHost } from "./support/host.ts";
import { FakeBridge, series } from "./support/fake-bridge.ts";

// Install by upload (and by folder), and the capability approval that gates enabling. The
// requests are the ones the Bridge forwards from the Plugin Manager.

const text = (value: string) => new TextEncoder().encode(value);
const exists = (path: string) => stat(path).then(() => true, () => false);

const manifest = (fields: Record<string, unknown> = {}) =>
  JSON.stringify({ id: "uploaded", version: "1.0.0", apiVersion: "1", ...fields });

const entry = (summary: string) =>
  `export default { getSeriesMetadata() { return { summary: ${JSON.stringify(summary)} }; } };`;

/** A plugin archive laid out as the template packages it: manifest.json and code at the root. */
const archive = (
  fields: Record<string, unknown> = {},
  summary = "from the archive",
  extra: ZipEntry[] = [],
) =>
  zip([
    { name: "manifest.json", data: text(manifest(fields)) },
    { name: "index.ts", data: text(entry(summary)) },
    ...extra,
  ]);

async function withHost(
  options: Parameters<typeof startTestHost>[0],
  body: (host: TestHost, bridge: FakeBridge) => Promise<void>,
) {
  const host = await startTestHost({ approve: false, ...options });
  try {
    await body(host, new FakeBridge(await host.bridgeConfig(), host.url));
  } finally {
    await host.dispose();
  }
}

const upload = async (bridge: FakeBridge, bytes: Uint8Array, secret?: string | null) => {
  const response = await bridge.request("/api/plugins/install", {
    method: "POST",
    headers: { "Content-Type": "application/zip" },
    body: bytes as BodyInit,
  }, secret);
  return { status: response.status, body: await response.json().catch(() => null) };
};

const post = async (bridge: FakeBridge, path: string, id: string) => {
  const response = await bridge.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

const capabilitiesOf = async (bridge: FakeBridge, id: string) =>
  (await (await bridge.request("/api/plugin-capabilities")).json() as {
    id: string;
    declared: string[];
    approved: string[];
    pending: string[];
  }[]).find((p) => p.id === id);

const summary = async (bridge: FakeBridge) =>
  (await bridge.seriesMetadata(series("/nonexistent"))).body.metadata?.summary;

Deno.test("an uploaded plugin is installed but stays disabled until its capabilities are approved", () =>
  withHost({}, async (host, bridge) => {
    const installed = await upload(bridge, await archive({ capabilities: ["network"] }));
    assert.equal(installed.status, 200);
    assert.equal(installed.body.id, "uploaded");
    assert.deepEqual(installed.body.pending, ["network"]);
    assert.equal(await exists(join(host.dirs.plugins, "uploaded", "manifest.json")), true);

    // The admin sees what it declares, before enabling.
    const shown = await capabilitiesOf(bridge, "uploaded");
    assert.deepEqual(shown?.declared, ["network"]);
    assert.deepEqual(shown?.approved, []);
    assert.deepEqual(shown?.pending, ["network"]);

    const listed = (await bridge.plugins()).find((p) => p.id === "uploaded")!;
    assert.equal(listed.enabled, false);
    assert.equal(listed.running, false);
    assert.equal(await summary(bridge), undefined, "it does not run");

    // It cannot be enabled yet.
    const refused = await post(bridge, "/api/plugins/enable", "uploaded");
    assert.equal(refused.status, 409);
    assert.match(refused.body.error, /network/);
    assert.equal((await bridge.plugins()).find((p) => p.id === "uploaded")!.running, false);

    // Approved, it can be.
    assert.equal((await post(bridge, "/api/plugins/approve", "uploaded")).status, 200);
    assert.deepEqual((await capabilitiesOf(bridge, "uploaded"))?.approved, ["network"]);
    assert.equal((await post(bridge, "/api/plugins/enable", "uploaded")).status, 200);
    assert.equal(await summary(bridge), "from the archive");

    // And it stays approved across a restart.
    await host.restart();
    const after = new FakeBridge(await host.bridgeConfig(), host.url);
    assert.equal((await after.plugins()).find((p) => p.id === "uploaded")!.running, true);
  }));

Deno.test("a plugin that declares no capabilities has nothing to approve and is enabled at once", () =>
  withHost({}, async (_host, bridge) => {
    const installed = await upload(bridge, await archive());
    assert.equal(installed.status, 200);
    assert.deepEqual(installed.body.pending, []);
    assert.equal(installed.body.enabled, true);
    assert.equal(await summary(bridge), "from the archive");
  }));

Deno.test("an upload that fails manifest validation is refused with the reason and installs nothing", () =>
  withHost({}, async (host, bridge) => {
    const cases: [string, Uint8Array | Promise<Uint8Array>, RegExp][] = [
      ["no manifest", zip([{ name: "index.ts", data: text(entry("x")) }]), /manifest\.json/],
      [
        "unsupported API version",
        zip([{ name: "manifest.json", data: text(manifest({ apiVersion: "99" })) }, { name: "index.ts", data: text("") }]),
        /"99" is not supported/,
      ],
      [
        "missing entry file",
        zip([{ name: "manifest.json", data: text(manifest({ entry: "main.ts" })) }]),
        /main\.ts/,
      ],
      [
        "unsafe id",
        zip([{ name: "manifest.json", data: text(manifest({ id: "../evil" })) }, { name: "index.ts", data: text("") }]),
        /id/,
      ],
      ["not an archive", text("hello"), /zip/],
    ];
    for (const [name, bytes, reason] of cases) {
      const answer = await upload(bridge, await bytes);
      assert.equal(answer.status, 400, name);
      assert.match(answer.body.error, reason, name);
    }
    assert.deepEqual(await bridge.plugins(), []);
    assert.equal(await exists(join(host.dirs.plugins, "..", "evil")), false);
  }));

Deno.test("an archive entry that would escape the plugin folder is refused", () =>
  withHost({}, async (host, bridge) => {
    const answer = await upload(bridge, await archive({}, "x", [{ name: "../escaped.txt", data: text("no") }]));
    assert.equal(answer.status, 400);
    assert.match(answer.body.error, /outside/);
    assert.equal(await exists(join(host.dirs.plugins, "..", "escaped.txt")), false);
    assert.deepEqual(await bridge.plugins(), []);
  }));

Deno.test("an archive with everything inside one top-level folder installs too", () =>
  withHost({}, async (_host, bridge) => {
    const bytes = await zip([
      { name: "uploaded-1.0.0/manifest.json", data: text(manifest()) },
      { name: "uploaded-1.0.0/index.ts", data: text(entry("nested")) },
    ]);
    assert.equal((await upload(bridge, bytes)).status, 200);
    assert.equal(await summary(bridge), "nested");
  }));

Deno.test("uploading needs the shared secret", () =>
  withHost({}, async (_host, bridge) => {
    assert.equal((await upload(bridge, await archive(), null)).status, 401);
  }));

Deno.test("a folder-installed plugin also waits for approval, and approval is per declared set", () =>
  withHost({ plugins: ["komga-reader"] }, async (_host, bridge) => {
    const listed = (await bridge.plugins()).find((p) => p.id === "komga-reader")!;
    assert.equal(listed.enabled, false);
    assert.equal(listed.running, false);
    assert.deepEqual((await capabilitiesOf(bridge, "komga-reader"))?.pending, ["komga:read"]);
    assert.equal((await post(bridge, "/api/plugins/enable", "komga-reader")).status, 409);

    assert.equal((await post(bridge, "/api/plugins/approve", "komga-reader")).status, 200);
    assert.equal((await post(bridge, "/api/plugins/enable", "komga-reader")).status, 200);
    assert.equal((await bridge.plugins()).find((p) => p.id === "komga-reader")!.running, true);
    assert.equal((await post(bridge, "/api/plugins/approve", "nope")).status, 404);
  }));

Deno.test("a new version that declares more capabilities is disabled until the new ones are approved", () =>
  withHost({}, async (_host, bridge) => {
    await upload(bridge, await archive({ capabilities: ["network"] }));
    await post(bridge, "/api/plugins/approve", "uploaded");
    await post(bridge, "/api/plugins/enable", "uploaded");
    assert.equal(await summary(bridge), "from the archive");

    const upgraded = await upload(
      bridge,
      await archive({ version: "2.0.0", capabilities: ["network", "komga:write"] }, "version two"),
    );
    assert.equal(upgraded.status, 200);
    assert.deepEqual(upgraded.body.pending, ["komga:write"]);
    const listed = (await bridge.plugins()).find((p) => p.id === "uploaded")!;
    assert.equal(listed.version, "2.0.0");
    assert.equal(listed.enabled, false);
    assert.equal(await summary(bridge), undefined);

    await post(bridge, "/api/plugins/approve", "uploaded");
    await post(bridge, "/api/plugins/enable", "uploaded");
    assert.equal(await summary(bridge), "version two");
  }));

Deno.test("a new version that declares nothing new keeps running, with its settings", () =>
  withHost({}, async (_host, bridge) => {
    await upload(bridge, await archive({ capabilities: ["network"], settings: [{ name: "greeting", type: "string" }] }));
    await post(bridge, "/api/plugins/approve", "uploaded");
    await post(bridge, "/api/plugins/enable", "uploaded");
    await bridge.saveSettings("uploaded", { greeting: "kept" });

    const upgraded = await upload(
      bridge,
      await archive({ version: "1.1.0", capabilities: ["network"], settings: [{ name: "greeting", type: "string" }] }, "newer"),
    );
    assert.deepEqual(upgraded.body.pending, []);
    assert.equal(await summary(bridge), "newer");
    const saved = (await bridge.pluginSettings("uploaded")).body.fields.find((f: { name: string }) => f.name === "greeting");
    assert.equal(saved.value, "kept");
  }));
