import type { Database } from "../database.ts";

export function up(db: Database): void {
  db.exec(`
    CREATE TABLE plugin_failures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plugin_id TEXT NOT NULL,
      at TEXT NOT NULL,
      kind TEXT NOT NULL,
      reason TEXT NOT NULL
    );
    CREATE INDEX plugin_failures_by_plugin ON plugin_failures (plugin_id, id);
    CREATE TABLE plugin_health (
      plugin_id TEXT PRIMARY KEY,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      auto_disabled INTEGER NOT NULL DEFAULT 0
    );
  `);
}
