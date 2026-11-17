/**
 * A local test runner for Komga Plugin Bridge plugins: it loads a plugin into a real Plugin Host
 * (its own Deno process, with only the permissions its capabilities grant) against stand-ins for
 * Komga and the Bridge. Scan calls, events, settings and Komga data calls can be tried with no
 * Komga installed.
 *
 * ```ts
 * import { runPlugin } from "@komga-plugin-bridge/test-runner";
 * import { assertEquals } from "jsr:@std/assert";
 *
 * Deno.test("supplies the series summary from its file", async () => {
 *   const run = await runPlugin(".", {
 *     library: { "My Series/plugin-metadata.json": '{"summary": "From a file"}' },
 *   });
 *   try {
 *     const metadata = await run.seriesMetadata({ path: `${run.library}/My Series` });
 *     assertEquals(metadata, { summary: "From a file" });
 *   } finally {
 *     await run.dispose();
 *   }
 * });
 * ```
 *
 * Run the tests with `deno test --allow-all`: the plugin runs in a subprocess the host starts.
 *
 * Not affiliated with the Komga project.
 *
 * @module
 */
// This is seam 2 of the repository's own tests (tests/seam2/support) packaged for use from a
// plugin project; the repository's tests use it too. The package stands alone: `vendor/` holds the
// Plugin Host and stand-ins it needs, built from the repository by scripts/bundle.ts.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { startTestHost } from "./vendor/tests/seam2/support/host.ts";
import { book, FakeBridge, series } from "./vendor/tests/seam2/support/fake-bridge.ts";
import type { BookMetadata } from "./vendor/plugin-host/src/plugins/book-metadata.ts";
import type { SeriesMetadata } from "./vendor/plugin-host/src/plugins/series-metadata.ts";

export type { BookAuthor, BookMetadata } from "./vendor/plugin-host/src/plugins/book-metadata.ts";
export type { SeriesMetadata } from "./vendor/plugin-host/src/plugins/series-metadata.ts";

/** How {@link runPlugin} sets the plugin up. Every field is optional. */
export interface RunPluginOptions {
  /** Setting values to save before the first call (validated against the manifest, as in the Plugin Manager). */
  settings?: Record<string, unknown>;
  /**
   * Files to create in the stand-in library folder (relative path to content). The plugin can
   * read them when its manifest declares `file-read:*`. Paths given to calls are under `run.library`.
   */
  library?: Record<string, string>;
  /** Capabilities to run with instead of the manifest's (the library folder is `{library}`). */
  capabilities?: string[];
  /** Time limit for one plugin call; default 5000. */
  callTimeoutMs?: number;
}

/** The outcome of {@link PluginRun.saveSettings}. */
export interface SettingsResult {
  /** True when every value was valid and saved. */
  ok: boolean;
  /** Why the values were refused, one reason per invalid value, when `ok` is false. */
  errors?: string[];
}

/** One request the plugin's `api.komga` calls made to the stand-in Komga. */
export interface KomgaRequest {
  /** The HTTP method, for example "GET" or "PATCH". */
  method: string;
  /** The Komga REST API path, for example "/api/v1/series/0TESTSERIES". */
  path: string;
  /** The API key the Plugin Host sent: never one the plugin holds. */
  apiKey: string | null;
  /** The JSON body sent, for a request that changes data. */
  body?: unknown;
}

/** A direct line to the Plugin Host, as the Bridge reaches it, with the shared secret added. */
export interface HostConnection {
  /** Sends a request to the Plugin Host's HTTP interface, for example `/api/plugins`. */
  request(path: string, init?: RequestInit): Promise<Response>;
}

/** A plugin running in a test Plugin Host, as {@link runPlugin} returns it. */
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
  /**
   * Requests made to the stand-in Komga, which answers the plugin's `api.komga` calls (canned
   * data; needs the `komga:read` / `komga:write` capability). The library list the host reads
   * for itself (`GET /api/v1/libraries`) is not included.
   */
  komgaRequests: KomgaRequest[];
  /** The stand-in Bridge, for anything the helpers above do not cover. */
  bridge: HostConnection;
  /** Stops the host, the stand-in Komga and deletes the temporary folders. */
  dispose(): Promise<void>;
}

/**
 * Runs the plugin in the folder `pluginDir` (containing `manifest.json`) in a new test Plugin Host,
 * approved for the capabilities its manifest declares. Throws when the host refuses the plugin or
 * the initial settings are invalid. Call `dispose()` on the result when done.
 */
export async function runPlugin(pluginDir: string, options: RunPluginOptions = {}): Promise<PluginRun> {
  const dir = resolve(pluginDir);
  const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
  const id: string = manifest.id;
  const host = await startTestHost({
    pluginDirs: [dir],
    capabilities: options.capabilities ? { [id]: options.capabilities } : undefined,
    callTimeoutMs: options.callTimeoutMs,
  });
  const dispose = () => host.dispose();
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
      get komgaRequests() {
        return (host.komga?.requests ?? []).filter((r) => !(r.method === "GET" && r.path === "/api/v1/libraries"));
      },
      bridge,
      dispose,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}
