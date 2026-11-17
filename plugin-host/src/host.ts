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
import { PluginData } from "./plugins/settings.ts";
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
  const { found, refused } = await discoverPlugins(config.pluginsDir);
  for (const plugin of found) plugins.upsert(plugin);

  const pluginData = new PluginData(db, plugins);
  const supervisor = new PluginSupervisor(plugins, config, (id, method, params) =>
    pluginData.handleApiCall(id, method, params)
  );
  await supervisor.startEnabled();

  const { secret } = await installBridge(config);
  const ctx: HostContext = { config, db, plugins, pluginData, supervisor, refused };
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
