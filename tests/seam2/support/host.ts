// Seam 2 harness: starts the Plugin Host alone, in-process, in throwaway directories. The host is
// driven only through its HTTP interface and by what is placed in its folders, exactly as
// the Bridge and an admin would.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { type PluginHost, startPluginHost } from "../../../plugin-host/src/host.ts";
import type { Config } from "../../../plugin-host/src/config.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const fixturePlugins = join(repoRoot, "tests", "seam2", "fixtures", "plugins");
const realPlugins = join(repoRoot, "plugins");

export interface BridgeConfigFile {
  pluginHostUrl: string;
  secret: string;
  timeoutMillis: number;
}

export interface TestHost {
  url: string;
  dirs: { data: string; plugins: string; bridge: string; library: string; library2: string };
  /** What a real Bridge would read from the shared volume to reach the host. */
  bridgeConfig(): Promise<BridgeConfigFile>;
  /** Stops the host and starts a new one on the same directories. */
  restart(): Promise<void>;
  stop(): Promise<void>;
  /** Stops the host and deletes its directories. */
  dispose(): Promise<void>;
}

export interface TestHostOptions {
  /** Plugins to drop into the plugins folder: a fixture name, or "reference" for the real one. */
  plugins?: string[];
  /**
   * Capabilities to declare in a dropped plugin's manifest, by plugin name. `{library}` and
   * `{library2}` stand for the two library folders.
   */
  capabilities?: Record<string, string[]>;
  /** Files to create in both library folders (file name to content). */
  libraryFiles?: Record<string, string>;
  callTimeoutMs?: number;
  failureThreshold?: number;
  bridgeTimeoutMs?: number;
  komgaUrl?: string;
  komgaApiKey?: string;
}

export async function startTestHost(options: TestHostOptions = {}): Promise<TestHost> {
  const root = await mkdtemp(join(tmpdir(), "plugin-host-seam2-"));
  const dirs = {
    data: join(root, "state"),
    plugins: join(root, "plugins"),
    bridge: join(root, "plugin-bridge"),
    library: join(root, "library"),
    library2: join(root, "library2"),
  };
  for (const dir of Object.values(dirs)) await mkdir(dir, { recursive: true });
  const bridgeJar = join(root, "bridge.jar");
  await writeFile(bridgeJar, "not really a jar, but the host only copies it");

  for (const name of options.plugins ?? []) {
    const source = name === "reference" ? join(realPlugins, "reference") : join(fixturePlugins, name);
    await cp(source, join(dirs.plugins, name), { recursive: true });
    const declared = options.capabilities?.[name];
    if (declared) {
      const file = join(dirs.plugins, name, "manifest.json");
      const manifest = JSON.parse(await readFile(file, "utf8"));
      manifest.capabilities = declared.map((c) =>
        c.replaceAll("{library2}", dirs.library2).replaceAll("{library}", dirs.library)
      );
      await writeFile(file, JSON.stringify(manifest));
    }
  }
  for (const [file, content] of Object.entries(options.libraryFiles ?? {})) {
    await writeFile(join(dirs.library, file), content);
    await writeFile(join(dirs.library2, file), content);
  }

  const config: Config = {
    port: 0,
    dataDir: dirs.data,
    pluginsDir: dirs.plugins,
    bridgeDir: dirs.bridge,
    bridgeJar,
    libraryRoots: [dirs.library, dirs.library2],
    callTimeoutMs: options.callTimeoutMs ?? 5000,
    bridgeTimeoutMs: options.bridgeTimeoutMs,
    failureThreshold: options.failureThreshold ?? 3,
    hostUrl: "http://plugin-host.test:8080",
    komgaUrl: options.komgaUrl,
    komgaApiKey: options.komgaApiKey,
    denoPath: Deno.execPath(),
  };

  let host: PluginHost = await startPluginHost(config);
  const testHost: TestHost = {
    get url() {
      return host.url;
    },
    dirs,
    async bridgeConfig() {
      return JSON.parse(await readFile(join(dirs.bridge, "bridge.json"), "utf8"));
    },
    async restart() {
      await host.stop();
      host = await startPluginHost(config);
    },
    async stop() {
      await host.stop();
    },
    async dispose() {
      await host.stop();
      await rm(root, { recursive: true, force: true });
    },
  };
  return testHost;
}

/** Writes a series folder in the fixture library, with the given extra files beside it. */
export async function makeSeries(
  library: string,
  name: string,
  files: Record<string, string> = {},
): Promise<string> {
  const dir = join(library, name);
  await mkdir(dir, { recursive: true });
  for (const [file, content] of Object.entries(files)) await writeFile(join(dir, file), content);
  return dir;
}
