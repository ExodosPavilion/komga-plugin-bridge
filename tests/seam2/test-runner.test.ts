// The local test runner (what plugin authors use), exercised through its public interface. It is
// seam 2 packaged for use outside this repository, so these tests run real plugins through it.
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { runPlugin } from "../../plugin-test-runner/mod.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixture = (name: string) => join(repoRoot, "tests", "seam2", "fixtures", "plugins", name);

Deno.test("scan calls: the reference plugin supplies series and book metadata from files", async () => {
  const run = await runPlugin(join(repoRoot, "plugins", "reference"), {
    library: {
      "Some Series/plugin-metadata.json": JSON.stringify({ summary: "From a file", genres: ["a"] }),
      "Some Series/001.cbz.plugin-metadata.json": JSON.stringify({ title: "Chapter One" }),
    },
  });
  try {
    const seriesPath = join(run.library, "Some Series");
    assert.deepEqual(await run.seriesMetadata({ path: seriesPath }), { summary: "From a file", genres: ["a"] });
    assert.deepEqual(await run.bookMetadata({ path: join(seriesPath, "001.cbz") }), { title: "Chapter One" });
    assert.equal(await run.seriesMetadata({ path: join(run.library, "Nothing here") }), null);
  } finally {
    await run.dispose();
  }
});

Deno.test("events: the plugin receives what it subscribed to and nothing else", async () => {
  const run = await runPlugin(fixture("event-recorder"));
  try {
    assert.deepEqual(await run.event("LibraryScanned", { library: { id: "L1" } }), ["event-recorder"]);
    assert.deepEqual(await run.event("BookAdded"), []);
    const seen = JSON.parse((await run.seriesMetadata({ path: "/x" }))!.summary!);
    assert.deepEqual(seen, [{ type: "LibraryScanned", data: { library: { id: "L1" } } }]);
  } finally {
    await run.dispose();
  }
});

Deno.test("settings: defaults, values given up front, saved values and rejected values", async () => {
  const run = await runPlugin(fixture("settings-user"), { settings: { greeting: "hi" } });
  try {
    const seen = async () => JSON.parse((await run.seriesMetadata({ path: "/x" }))!.summary!);
    assert.deepEqual(await seen(), { greeting: "hi", retries: 3, loud: false });
    assert.deepEqual(await run.saveSettings({ retries: 9 }), { ok: true });
    assert.equal((await seen()).retries, 9);
    assert.deepEqual(await run.saveSettings({ retries: "many" }), {
      ok: false,
      errors: ['Setting "retries" must be a number, but got a string.'],
    });
    assert.equal((await seen()).retries, 9);
  } finally {
    await run.dispose();
  }
});

Deno.test("Komga data: the plugin reads from a stand-in Komga whose requests are recorded", async () => {
  const run = await runPlugin(fixture("komga-reader"));
  try {
    const metadata = await run.seriesMetadata({ name: "read", path: "/x" });
    assert.equal(metadata?.summary, "read:Fake series");
    assert.ok(run.komgaRequests.some((r) => r.path === "/api/v1/series/0TESTSERIES"));
  } finally {
    await run.dispose();
  }
});

Deno.test("failures: a crashing plugin is reported with its reason", async () => {
  const run = await runPlugin(fixture("crasher"));
  try {
    assert.equal(await run.seriesMetadata({ path: "/x" }), null);
    const failures = await run.failures();
    assert.equal(failures.length, 1);
    assert.equal(failures[0].kind, "error");
  } finally {
    await run.dispose();
  }
});

async function deno(cwd: string, ...args: string[]) {
  return await denoWith({}, cwd, ...args);
}

async function denoWith(env: Record<string, string>, cwd: string, ...args: string[]) {
  const out = await new Deno.Command(Deno.execPath(), {
    args,
    cwd,
    env: { NO_COLOR: "1", ...env },
    stdout: "piped",
    stderr: "piped",
  }).output();
  const text = new TextDecoder();
  return { code: out.code, output: text.decode(out.stdout) + text.decode(out.stderr) };
}

/**
 * Serves the two package folders over HTTP, as a registry does. Code loaded from here sees an
 * http: import.meta.url and has no repository beside it, exactly as when it comes from JSR.
 */
function servePackages(): { url: string; close(): Promise<void> } {
  const roots: Record<string, string> = {
    "plugin-api": join(repoRoot, "plugin-api"),
    "test-runner": join(repoRoot, "plugin-test-runner"),
  };
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (request) => {
    const [, name, ...rest] = decodeURIComponent(new URL(request.url).pathname).split("/");
    const root = roots[name];
    const file = root && join(root, ...rest);
    if (!file || relative(root, file).startsWith("..")) return new Response("not found", { status: 404 });
    try {
      const type = file.endsWith(".json") ? "application/json" : "application/typescript";
      return new Response(await Deno.readFile(file), { headers: { "Content-Type": type } });
    } catch {
      return new Response("not found", { status: 404 });
    }
  });
  return { url: `http://127.0.0.1:${server.addr.port}`, close: () => server.shutdown() };
}

Deno.test("a plugin project outside this repository checks and tests with the runner and the API package", async () => {
  // A plugin author's repository: the template in a folder far from this repository, with both
  // packages loaded over HTTP from a stand-in registry, and a Deno cache of its own.
  const dir = await mkdtemp(join(tmpdir(), "plugin-project-"));
  const registry = servePackages();
  try {
    assert.ok(relative(repoRoot, dir).startsWith(".."), "the project is outside the repository");
    await cp(join(repoRoot, "template"), dir, { recursive: true });
    const config = JSON.parse(await readFile(join(dir, "deno.json"), "utf8"));
    config.imports = {
      "@komga-plugin-bridge/plugin-api": `${registry.url}/plugin-api/src/index.ts`,
      "@komga-plugin-bridge/test-runner": `${registry.url}/test-runner/mod.ts`,
    };
    await writeFile(join(dir, "deno.json"), JSON.stringify(config, null, 2));
    const env = { DENO_DIR: join(dir, ".deno-cache") };
    // The template's tasks (deno check index.ts; deno test --allow-all), with import access to the
    // stand-in registry's host: Deno imports only from default hosts such as jsr.io unaided.
    const host = new URL(registry.url).host;
    assert.match(config.tasks.check, /^deno check index\.ts$/);
    assert.match(config.tasks.test, /^deno test --allow-all$/);

    const check = await denoWith(env, dir, "check", `--allow-import=${host}`, "index.ts");
    assert.equal(check.code, 0, check.output);
    const test = await denoWith(env, dir, "test", "--allow-all");
    assert.equal(test.code, 0, test.output);
    assert.match(test.output, /1 passed \| 0 failed/);
  } finally {
    await registry.close();
    await rm(dir, { recursive: true, force: true });
  }
});

Deno.test("the test runner package publishes on its own (dry run)", async () => {
  // Everything it imports lies inside its folder, and its public API has no slow types (JSR needs
  // explicit types on everything a user can reach; deno publish refuses the package otherwise).
  const dry = await deno(
    join(repoRoot, "plugin-test-runner"),
    "publish",
    "--dry-run",
    "--allow-dirty",
  );
  assert.equal(dry.code, 0, dry.output);
  assert.match(dry.output, /Dry run complete/);
  const published = [...dry.output.matchAll(/file:\/\/(\S+\.ts) /g)].map((m) => m[1]);
  assert.ok(published.length > 40, "the Plugin Host is bundled into the package");
  assert.ok(published.every((file) => relative(join(repoRoot, "plugin-test-runner"), file).startsWith("vendor") || file.endsWith("/mod.ts")), published.join("\n"));
});
