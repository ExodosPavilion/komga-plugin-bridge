import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { startTestHost, type TestHost } from "./support/host.ts";
import { FakeBridge } from "./support/fake-bridge.ts";

const valid = {
  id: "good",
  version: "1.0.0",
  apiVersion: "1",
  capabilities: [],
  contributions: [],
  settings: [],
};

/** Drops a plugin folder with the given manifest into the plugins folder and restarts the host. */
async function install(host: TestHost, folder: string, manifest: unknown) {
  const dir = join(host.dirs.plugins, folder);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "manifest.json"),
    typeof manifest === "string" ? manifest : JSON.stringify(manifest),
  );
  await writeFile(join(dir, "index.ts"), "export default {};\n");
  await host.restart();
  const bridge = new FakeBridge(await host.bridgeConfig(), host.url);
  const refused: { folder: string; reason: string }[] =
    await (await bridge.request("/api/plugins/refused")).json();
  return { bridge, refused, installed: (await bridge.plugins()).map((p) => p.id) };
}

async function refusedWith(manifest: unknown) {
  const host = await startTestHost();
  try {
    const result = await install(host, "p", manifest);
    assert.deepEqual(result.installed, [], "refused plugin must not be installed");
    assert.equal(result.refused.length, 1);
    return result.refused[0].reason;
  } finally {
    await host.dispose();
  }
}

Deno.test("a complete manifest is installed", async () => {
  const host = await startTestHost();
  try {
    const { installed, refused } = await install(host, "good", valid);
    assert.deepEqual(installed, ["good"]);
    assert.deepEqual(refused, []);
  } finally {
    await host.dispose();
  }
});

for (const field of ["id", "version", "apiVersion"]) {
  Deno.test(`a manifest missing ${field} is refused, naming the field`, async () => {
    const manifest: Record<string, unknown> = { ...valid };
    delete manifest[field];
    assert.match(await refusedWith(manifest), new RegExp(field));
  });
}

Deno.test("a manifest that is not JSON is refused", async () => {
  assert.match(await refusedWith("{ nope"), /manifest\.json/);
});

Deno.test("a manifest with the wrong type for capabilities is refused, naming it", async () => {
  assert.match(await refusedWith({ ...valid, capabilities: "file-read" }), /capabilities/);
});

Deno.test("a settings field without a name or with an unknown type is refused", async () => {
  assert.match(
    await refusedWith({ ...valid, settings: [{ type: "string" }] }),
    /settings\[0\]\.name/,
  );
  assert.match(
    await refusedWith({ ...valid, settings: [{ name: "token", type: "blob" }] }),
    /settings\[0\]\.type/,
  );
});

Deno.test("an unsupported Plugin API version is refused, naming the supported versions", async () => {
  const reason = await refusedWith({ ...valid, apiVersion: "99" });
  assert.match(reason, /99/);
  assert.match(reason, /supported.*1/i);
});

Deno.test("a refused plugin leaves no trace in the host's state, even across a restart", async () => {
  const host = await startTestHost();
  try {
    await install(host, "bad", { ...valid, id: "bad", apiVersion: "99" });
    await host.restart();
    const bridge = new FakeBridge(await host.bridgeConfig(), host.url);
    assert.deepEqual(await bridge.plugins(), []);
    // The folder is the admin's: the host neither deletes it nor copies it anywhere.
    assert.ok(existsSync(join(host.dirs.plugins, "bad")));
  } finally {
    await host.dispose();
  }
});
