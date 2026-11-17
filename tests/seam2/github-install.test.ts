import assert from "node:assert/strict";
import { zip } from "../../template/scripts/zip.ts";
import { startTestHost } from "./support/host.ts";
import { FakeBridge } from "./support/fake-bridge.ts";
import { type FakeRelease, type FakeReleases, startFakeReleases } from "./support/fake-releases.ts";

// Install from a GitHub release, pinned, with an on-demand update check. GitHub is a fake
// release server; requests are the ones the Bridge forwards from the Plugin Manager.

const text = (value: string) => new TextEncoder().encode(value);
const REPO = "https://github.com/someone/my-plugin";
const SLUG = "someone/my-plugin";

const archive = (version: string, fields: Record<string, unknown> = {}) =>
  zip([
    { name: "manifest.json", data: text(JSON.stringify({ id: "gh-plugin", version, apiVersion: "1", ...fields })) },
    {
      name: "index.ts",
      data: text(`export default { getSeriesMetadata() { return { summary: ${JSON.stringify(`v${version}`)} }; } };`),
    },
  ]);

const release = async (
  version: string,
  publishedAt: string,
  fields: Record<string, unknown> = {},
): Promise<FakeRelease> => ({
  tag: `v${version}`,
  publishedAt,
  assets: [
    { name: "source.txt", bytes: text("not the plugin") },
    { name: `gh-plugin-${version}.zip`, bytes: await archive(version, fields) },
  ],
});

async function withEnv(
  releases: Record<string, FakeRelease[]>,
  body: (bridge: FakeBridge, fake: FakeReleases) => Promise<void>,
) {
  const fake = startFakeReleases(releases);
  const host = await startTestHost({ approve: false, githubApiUrl: fake.url });
  try {
    await body(new FakeBridge(await host.bridgeConfig(), host.url), fake);
  } finally {
    await host.dispose();
    await fake.stop();
  }
}

const json = async (response: Response) => ({ status: response.status, body: await response.json().catch(() => null) });
const post = (bridge: FakeBridge, path: string, body: unknown) =>
  bridge.request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(json);
const releasesOf = (bridge: FakeBridge, repo = REPO) =>
  bridge.request(`/api/github/releases?repo=${encodeURIComponent(repo)}`).then(json);
const updates = (bridge: FakeBridge) => bridge.request("/api/plugins/updates").then(json);
const summary = async (bridge: FakeBridge) =>
  (await bridge.seriesMetadata({ id: "s", name: "S", path: "/nonexistent", libraryId: "l" })).body.metadata?.summary;

Deno.test("the releases of a repository are listed, and the chosen release's archive is installed", async () =>
  await withEnv({
    [SLUG]: [await release("1.0.0", "2026-01-01T00:00:00Z"), await release("1.1.0", "2026-02-01T00:00:00Z")],
  }, async (bridge) => {
    const listed = await releasesOf(bridge);
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.body.map((r: { tag: string }) => r.tag), ["v1.1.0", "v1.0.0"]);

    const installed = await post(bridge, "/api/plugins/install-github", { repo: REPO, tag: "v1.0.0" });
    assert.equal(installed.status, 200);
    assert.equal(installed.body.id, "gh-plugin");
    assert.equal(installed.body.version, "1.0.0");
    assert.equal(await summary(bridge), "v1.0.0");
  }));

Deno.test("a repository address that is not a GitHub repository, or does not exist, is refused with a reason", () =>
  withEnv({}, async (bridge) => {
    const notGithub = await releasesOf(bridge, "https://example.com/someone/my-plugin");
    assert.equal(notGithub.status, 400);
    assert.match(notGithub.body.error, /GitHub/);
    const missing = await releasesOf(bridge, "https://github.com/nobody/nothing");
    assert.equal(missing.status, 404);
    assert.ok(missing.body.error);
  }));

Deno.test("a release without a plugin archive installs nothing", () =>
  withEnv({
    [SLUG]: [{ tag: "v1", publishedAt: "2026-01-01T00:00:00Z", assets: [{ name: "notes.txt", bytes: text("hi") }] }],
  }, async (bridge) => {
    const result = await post(bridge, "/api/plugins/install-github", { repo: REPO, tag: "v1" });
    assert.equal(result.status, 400);
    assert.match(result.body.error, /archive/);
    assert.deepEqual(await bridge.plugins(), []);
  }));

Deno.test("an installed version stays pinned: nothing is fetched or changed until an update is chosen", async () =>
  await withEnv({ [SLUG]: [await release("1.0.0", "2026-01-01T00:00:00Z")] }, async (bridge, fake) => {
    await post(bridge, "/api/plugins/install-github", { repo: REPO, tag: "v1.0.0" });
    fake.publish(SLUG, await release("2.0.0", "2026-03-01T00:00:00Z"));
    const before = fake.requests.length;
    assert.equal((await bridge.plugins())[0].version, "1.0.0");
    assert.equal(await summary(bridge), "v1.0.0");
    assert.equal(fake.requests.length, before, "no request to the release server on its own");
  }));

Deno.test("an on-demand update check reports newer releases only", async () =>
  await withEnv({
    [SLUG]: [await release("1.0.0", "2026-01-01T00:00:00Z"), await release("1.1.0", "2026-02-01T00:00:00Z")],
  }, async (bridge, fake) => {
    await post(bridge, "/api/plugins/install-github", { repo: REPO, tag: "v1.1.0" });
    assert.deepEqual((await updates(bridge)).body, [
      { id: "gh-plugin", repo: REPO, installed: "v1.1.0", newer: [] },
    ]);
    fake.publish(SLUG, await release("1.2.0", "2026-03-01T00:00:00Z"));
    const checked = (await updates(bridge)).body;
    assert.deepEqual(checked[0].newer.map((r: { tag: string }) => r.tag), ["v1.2.0"]);
  }));

Deno.test("a plugin that was not installed from GitHub is not part of the update check", () =>
  withEnv({}, async (bridge) => {
    assert.deepEqual((await updates(bridge)).body, []);
  }));

Deno.test("an update that declares new capabilities stays disabled until re-approved", async () =>
  await withEnv({
    [SLUG]: [
      await release("1.0.0", "2026-01-01T00:00:00Z", { capabilities: ["komga:read"] }),
      await release("2.0.0", "2026-02-01T00:00:00Z", { capabilities: ["komga:read", "network"] }),
    ],
  }, async (bridge) => {
    await post(bridge, "/api/plugins/install-github", { repo: REPO, tag: "v1.0.0" });
    await post(bridge, "/api/plugins/approve", { id: "gh-plugin" });
    assert.equal((await bridge.enable("gh-plugin")).status, 200);

    const update = await post(bridge, "/api/plugins/install-github", { repo: REPO, tag: "v2.0.0" });
    assert.equal(update.status, 200);
    assert.equal(update.body.upgraded, true);
    assert.deepEqual(update.body.pending, ["network"]);
    assert.equal(update.body.enabled, false);
    assert.equal((await bridge.plugins())[0].version, "2.0.0");
    assert.equal((await bridge.enable("gh-plugin")).status, 409);

    await post(bridge, "/api/plugins/approve", { id: "gh-plugin" });
    assert.equal((await bridge.enable("gh-plugin")).status, 200);
    assert.equal(await summary(bridge), "v2.0.0");
  }));

Deno.test("an update that declares no new capabilities keeps running without re-approval", async () =>
  await withEnv({
    [SLUG]: [
      await release("1.0.0", "2026-01-01T00:00:00Z", { capabilities: ["komga:read"] }),
      await release("1.1.0", "2026-02-01T00:00:00Z", { capabilities: ["komga:read"] }),
    ],
  }, async (bridge) => {
    await post(bridge, "/api/plugins/install-github", { repo: REPO, tag: "v1.0.0" });
    await post(bridge, "/api/plugins/approve", { id: "gh-plugin" });
    await bridge.enable("gh-plugin");

    const update = await post(bridge, "/api/plugins/install-github", { repo: REPO, tag: "v1.1.0" });
    assert.deepEqual(update.body.pending, []);
    assert.equal(update.body.enabled, true);
    assert.equal(await summary(bridge), "v1.1.0");
    assert.equal((await updates(bridge)).body[0].installed, "v1.1.0");
  }));

Deno.test("the GitHub routes need the shared secret", () =>
  withEnv({}, async (bridge) => {
    assert.equal(await bridge.status(`/api/github/releases?repo=${encodeURIComponent(REPO)}`, null), 401);
    assert.equal(await bridge.status("/api/plugins/updates", null), 401);
  }));
