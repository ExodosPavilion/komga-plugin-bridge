// Wires the Plugin Host together. Tests start it in-process through startPluginHost; main.ts
// starts it from the environment.
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { installBridge } from "./bridge/install.ts";
import type { Config } from "./config.ts";
import type { HostContext } from "./context.ts";
import { openDatabase } from "./db/database.ts";
import { startHttpServer } from "./http/server.ts";
import { discoverPlugins } from "./plugins/discovery.ts";
import { CapabilityStore } from "./plugins/capabilities.ts";
import { KomgaData } from "./plugins/komga-data.ts";
import { PluginStore } from "./plugins/store.ts";
import { PluginSupervisor } from "./plugins/supervisor.ts";

export interface PluginHost {
  url: string;
  stop(): Promise<void>;
}

export async function startPluginHost(config: Config): Promise<PluginHost> {
  await mkdir(config.dataDir, { recursive: true });
  const db = await openDatabase(join(config.dataDir, "plugin-host.sqlite"));
  const plugins = new PluginStore(db);
  for (const plugin of await discoverPlugins(config.pluginsDir)) plugins.upsert(plugin);

  const capabilities = new CapabilityStore(db);
  for (const plugin of plugins.list()) await capabilities.approveDeclared(plugin);
  const komga = new KomgaData(config, capabilities);

  // The Plugin API's `komga.*` calls arrive here, from a plugin's process.
  const supervisor = new PluginSupervisor(plugins, config, (pluginId, method, args) => {
    if (!method.startsWith("komga.")) throw new Error(`${method} does not exist`);
    return komga.call(pluginId, method.slice("komga.".length), args);
  });
  await supervisor.startEnabled();

  const { secret } = await installBridge(config);
  const ctx: HostContext = { config, db, plugins, supervisor };
  const server = await startHttpServer(ctx, secret);
  const url = `http://127.0.0.1:${server.port}`;
  console.log(`[plugin-host] listening on port ${server.port}`);

  return {
    url,
    async stop() {
      await server.stop();
      await supervisor.stopAll();
      db.close();
    },
  };
}
