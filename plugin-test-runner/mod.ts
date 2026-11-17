// Local test runner for plugin authors: loads a plugin into a real Plugin Host (its own Deno
// process, its own permissions) against stand-ins for Komga and the Bridge, so scan calls,
// events and settings can be tried with no Komga installed.
//
// This is seam 2 of the repository's own tests (tests/seam2/support) packaged for use from a
// plugin project; the repository's tests use it too.
//
//   const run = await runPlugin(".", { settings: { greeting: "hi" } });
//   try {
//     assert.deepEqual(await run.seriesMetadata({ path: "/library/Series" }), { summary: "..." });
//   } finally {
//     await run.dispose();
//   }
//
// Run tests with `deno test --allow-all`: the plugin runs in a subprocess the host starts.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { startTestHost } from "../tests/seam2/support/host.ts";
import { book, FakeBridge, series } from "../tests/seam2/support/fake-bridge.ts";
import { type FakeKomga, startFakeKomga } from "../tests/seam2/support/fake-komga.ts";
import type { BookMetadata, SeriesMetadata } from "../plugin-api/src/index.ts";

export interface RunPluginOptions {
  /** Setting values to save before the first call (validated against the manifest, as in the Plugin Manager). */
  settings?: Record<string, unknown>;
  /**
   * Files to create in the stand-in library folder (relative path to content). The plugin can
   * read them when its manifest declares `file-read:*`. Paths given to calls are under `run.library`.
   */
  library?: Record<string, string>;
  /** Start a stand-in Komga REST API (canned data, every request recorded) and point the host at it. */
  komga?: boolean;
  /** Capabilities to run with instead of the manifest's (the library folder is `{library}`). */
  capabilities?: string[];
  /** Time limit for one plugin call; default 5000. */
  callTimeoutMs?: number;
}

export interface SettingsResult {
  ok: boolean;
  errors?: string[];
}

export interface PluginRun {
  /** The plugin's id, from its manifest. */
  id: string;
  /** The stand-in library folder. Build the `path` of series and books from it. */
  library: string;
  /** What the plugin returns from `getSeriesMetadata` (several results are merged; null for nothing). */
  seriesMetadata(series: { path: string; name?: string; id?: string }): Promise<SeriesMetadata | null>;
  /** What the plugin returns from `getBookMetadata`. */
  bookMetadata(book: { path: string; name?: string; id?: string }): Promise<BookMetadata | null>;
  /** Sends a Komga event; resolves to the plugins it was delivered to (empty if not subscribed). */
  event(type: string, data?: Record<string, unknown>): Promise<string[]>;
  /** The settings form as the Plugin Manager shows it, with current values. */
  settings(): Promise<{ name: string; value?: unknown }[]>;
  /** Saves setting values; invalid ones are refused with the reasons and nothing is saved. */
  saveSettings(values: Record<string, unknown>): Promise<SettingsResult>;
  /** Failures recorded against the plugin (timeouts, crashes, errors), oldest first. */
  failures(): Promise<{ at: string; kind: string; reason: string }[]>;
  /** Requests the plugin's `api.komga` calls made to the stand-in Komga (needs `komga: true`). */
  komgaRequests: FakeKomga["requests"];
  /** The stand-in Bridge, for anything the helpers above do not cover. */
  bridge: FakeBridge;
  /** Stops the host, the stand-in Komga and deletes the temporary folders. */
  dispose(): Promise<void>;
}

/** Runs the plugin in the folder `pluginDir` (containing `manifest.json`). */
export async function runPlugin(pluginDir: string, options: RunPluginOptions = {}): Promise<PluginRun> {
  const dir = resolve(pluginDir);
  const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
  const id: string = manifest.id;
  const komga = options.komga ? startFakeKomga() : undefined;
  const host = await startTestHost({
    pluginDirs: [dir],
    capabilities: options.capabilities ? { [id]: options.capabilities } : undefined,
    callTimeoutMs: options.callTimeoutMs,
    komgaUrl: komga?.url,
    komgaApiKey: komga?.apiKey,
  });
  const dispose = async () => {
    await host.dispose();
    await komga?.stop();
  };
  try {
    for (const [file, content] of Object.entries(options.library ?? {})) {
      const target = join(host.dirs.library, file);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);
    }
    const bridge = new FakeBridge(await host.bridgeConfig(), host.url);
    const refused = await bridge.request("/api/plugins/refused").then((r) => r.json()).catch(() => []);
    if (!(await bridge.plugins()).some((p) => p.id === id)) {
      throw new Error(`The Plugin Host refused plugin "${id}": ${JSON.stringify(refused)}`);
    }
    const saveSettings = async (values: Record<string, unknown>): Promise<SettingsResult> => {
      const { status, body } = await bridge.saveSettings(id, values);
      return status === 200 ? { ok: true } : { ok: false, errors: body?.errors ?? [`HTTP ${status}`] };
    };
    if (options.settings) {
      const saved = await saveSettings(options.settings);
      if (!saved.ok) throw new Error(`Invalid settings: ${saved.errors!.join("; ")}`);
    }
    return {
      id,
      library: host.dirs.library,
      async seriesMetadata(s) {
        const { status, body } = await bridge.seriesMetadata({ ...series(s.path, s.name), ...s });
        if (status !== 200) throw new Error(`series-metadata answered ${status}`);
        return body.metadata;
      },
      async bookMetadata(b) {
        const { status, body } = await bridge.bookMetadata({ ...book(b.path, b.name), ...b });
        if (status !== 200) throw new Error(`book-metadata answered ${status}`);
        return body.metadata;
      },
      async event(type, data = {}) {
        const { status, body } = await bridge.event(type, data);
        if (status !== 200) throw new Error(`events answered ${status}`);
        return body.delivered;
      },
      async settings() {
        return (await bridge.pluginSettings(id)).body.fields;
      },
      saveSettings,
      async failures() {
        return (await bridge.failures(id)).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
      },
      komgaRequests: komga?.requests ?? [],
      bridge,
      dispose,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}
