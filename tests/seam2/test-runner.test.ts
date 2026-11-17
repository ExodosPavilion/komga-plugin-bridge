// The local test runner (what plugin authors use), exercised through its public interface. It is
// seam 2 packaged for use outside this repository, so these tests run real plugins through it.
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
  const run = await runPlugin(fixture("komga-reader"), { komga: true });
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

Deno.test("the template's own tests run the reference-style plugin through the runner", async () => {
  // A plugin author's project: the template with the runner resolved from this repository.
  const dir = await mkdtemp(join(tmpdir(), "plugin-project-"));
  try {
    await cp(join(repoRoot, "template"), dir, { recursive: true });
    const map = join(dir, "local-import-map.json");
    await writeFile(
      map,
      JSON.stringify({
        imports: {
          "@komga-plugin-bridge/plugin-api": join(repoRoot, "plugin-api", "src", "index.ts"),
          "@komga-plugin-bridge/test-runner": join(repoRoot, "plugin-test-runner", "mod.ts"),
        },
      }),
    );
    const out = await new Deno.Command(Deno.execPath(), {
      args: ["test", "--allow-all", `--import-map=${map}`, "index.test.ts"],
      cwd: dir,
      env: { NO_COLOR: "1" },
      stdout: "piped",
      stderr: "piped",
    }).output();
    const text = new TextDecoder();
    const output = text.decode(out.stdout) + text.decode(out.stderr);
    assert.equal(out.code, 0, output);
    assert.match(output, /1 passed \| 0 failed/);
    assert.ok((await readFile(join(dir, "index.test.ts"), "utf8")).includes("runPlugin"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
