// The Plugin API package and the project template, tested from a plugin author's side: a plugin
// project type-checks against the package, its release packaging produces an archive, and that
// archive installs into the Plugin Host and runs.
import assert from "node:assert/strict";
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startTestHost } from "./support/host.ts";
import { FakeBridge, series } from "./support/fake-bridge.ts";
import { unzip } from "./support/unzip.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const packageEntry = join(repoRoot, "plugin-api", "src", "index.ts");

async function deno(cwd: string, ...args: string[]) {
  const out = await new Deno.Command(Deno.execPath(), { args, cwd, stdout: "piped", stderr: "piped" }).output();
  const text = new TextDecoder();
  return { code: out.code, output: text.decode(out.stdout) + text.decode(out.stderr) };
}

/** A copy of the template as a plugin author's own repository, with the package resolved locally. */
async function newProject() {
  const dir = await mkdtemp(join(tmpdir(), "plugin-project-"));
  await cp(join(repoRoot, "template"), dir, { recursive: true });
  const map = join(dir, "local-import-map.json");
  await writeFile(map, JSON.stringify({ imports: { "@komga-plugin-bridge/plugin-api": packageEntry } }));
  return { dir, map, dispose: () => rm(dir, { recursive: true, force: true }) };
}

Deno.test("a plugin project made from the template type-checks against the Plugin API package", async () => {
  const project = await newProject();
  try {
    const { code, output } = await deno(project.dir, "check", `--import-map=${project.map}`, "index.ts");
    assert.equal(code, 0, output);
  } finally {
    await project.dispose();
  }
});

Deno.test("a plugin that misuses the Plugin API fails to type-check", async () => {
  const project = await newProject();
  try {
    await writeFile(
      join(project.dir, "index.ts"),
      `import type { Plugin } from "@komga-plugin-bridge/plugin-api";
export default {
  async getSeriesMetadata({ series }, api) {
    const found = await api.komga.getSeries(series.id);
    return { summary: 42, nonsense: found.id };
  },
  async noSuchHook() {},
} satisfies Plugin;
`,
    );
    const { code, output } = await deno(project.dir, "check", `--import-map=${project.map}`, "index.ts");
    assert.notEqual(code, 0);
    assert.match(output, /summary|noSuchHook/);
  } finally {
    await project.dispose();
  }
});

Deno.test("the reference plugin and the plugin fixtures type-check against the package", async () => {
  const fixtures = join(repoRoot, "tests", "seam2", "fixtures", "plugins");
  const typed = ["komga-reader", "komga-writer", "komga-none", "settings-user", "event-recorder", "storage-a", "storage-b", "response-filter"]
    .map((name) => join(fixtures, name, "index.ts"));
  const { code, output } = await deno(repoRoot, "check", join(repoRoot, "plugins", "reference", "index.ts"), ...typed);
  assert.equal(code, 0, output);
});

Deno.test("the template's release packaging produces an archive the Plugin Host installs and runs", async () => {
  const project = await newProject();
  const host = await startTestHost({ plugins: [] });
  try {
    const { code, output } = await deno(project.dir, "run", "--allow-read", "--allow-write", "scripts/package.ts");
    assert.equal(code, 0, output);
    const manifest = JSON.parse(await readFile(join(project.dir, "manifest.json"), "utf8"));
    const file = `${manifest.id}-${manifest.version}.zip`;
    assert.deepEqual(await readdir(join(project.dir, "dist")), [file]);

    // Install the way an admin's archive install will: unpack into the plugins folder and restart.
    const archive = await Deno.readFile(join(project.dir, "dist", file));
    const names = await unzip(archive, join(host.dirs.plugins, manifest.id));
    assert.ok(names.includes("manifest.json") && names.includes("index.ts"), names.join(", "));
    await host.restart();

    const bridge = new FakeBridge(await host.bridgeConfig(), host.url);
    assert.deepEqual((await bridge.plugins()).map((p) => p.id), [manifest.id]);
    const { body } = await bridge.seriesMetadata(series("/library/Anything"));
    assert.equal(body.metadata.summary, "Hello from the template plugin");
  } finally {
    await host.dispose();
    await project.dispose();
  }
});
