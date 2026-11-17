import type { Database } from "../database.ts";

export function up(db: Database): void {
  db.exec(`
    CREATE TABLE plugin_settings (
      plugin_id TEXT NOT NULL,
      name TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (plugin_id, name)
    );
    CREATE TABLE plugin_storage (
      plugin_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (plugin_id, key)
    );
  `);
}
