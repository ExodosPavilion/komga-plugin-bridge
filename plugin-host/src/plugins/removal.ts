// Removing an installed plugin: its files, its row, and every row any feature keeps about it.
import { rm } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { Config } from "../config.ts";
import type { Database } from "../db/database.ts";
import type { InstalledPlugin } from "./store.ts";

/** Deletes the plugin's folder (it must be inside the plugins folder) and everything stored about it. */
export async function removePlugin(db: Database, config: Config, plugin: InstalledPlugin): Promise<void> {
  const rel = relative(resolve(config.pluginsDir), resolve(plugin.dir));
  if (rel === "" || rel.startsWith("..")) throw new Error(`${plugin.dir} is not inside the plugins folder`);
  await rm(plugin.dir, { recursive: true, force: true });
  forgetPlugin(db, plugin.id);
}

/**
 * Deletes every row about a plugin. Any table with a `plugin_id` column is covered, so features
 * added later are cleaned up without being listed here.
 */
export function forgetPlugin(db: Database, id: string): void {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all().map((row) => String(row.name));
  db.exec("BEGIN");
  try {
    for (const table of tables) {
      const columns = db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all().map((c) => String(c.name));
      if (columns.includes("plugin_id")) db.prepare(`DELETE FROM "${table}" WHERE plugin_id = ?`).run(id);
    }
    db.prepare("DELETE FROM plugins WHERE id = ?").run(id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
