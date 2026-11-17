// What route modules and other parts of the host receive. Grow it by adding fields; keep each
// part behind its own module.
import type { Config } from "./config.ts";
import type { Database } from "./db/database.ts";
import type { PluginSupervisor } from "./plugins/supervisor.ts";
import type { PluginStore } from "./plugins/store.ts";

export interface HostContext {
  config: Config;
  db: Database;
  plugins: PluginStore;
  supervisor: PluginSupervisor;
  /** Plugins refused at install, with reasons. In memory only. */
  refused: { folder: string; reason: string }[];
}
