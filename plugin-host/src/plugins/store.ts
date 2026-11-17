// Installed plugins, as recorded in the host's database.
import type { Database } from "../db/database.ts";

export interface InstalledPlugin {
  id: string;
  version: string;
  dir: string;
  entry: string;
  enabled: boolean;
}

export class PluginStore {
  constructor(private readonly db: Database) {}

  list(): InstalledPlugin[] {
    return this.db.prepare("SELECT id, version, dir, entry, enabled FROM plugins ORDER BY id")
      .all()
      .map((row) => ({
        id: String(row.id),
        version: String(row.version),
        dir: String(row.dir),
        entry: String(row.entry),
        enabled: row.enabled === 1,
      }));
  }

  get(id: string): InstalledPlugin | undefined {
    return this.list().find((p) => p.id === id);
  }

  setEnabled(id: string, enabled: boolean): void {
    this.db.prepare("UPDATE plugins SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
  }

  /** Records a plugin found on disk. A new plugin starts enabled; an existing one keeps its state. */
  upsert(plugin: Omit<InstalledPlugin, "enabled">): void {
    this.db.prepare(
      `INSERT INTO plugins (id, version, dir, entry, enabled, installed_at) VALUES (?, ?, ?, ?, 1, ?)
       ON CONFLICT(id) DO UPDATE SET version = excluded.version, dir = excluded.dir, entry = excluded.entry`,
    ).run(plugin.id, plugin.version, plugin.dir, plugin.entry, new Date().toISOString());
  }
}
