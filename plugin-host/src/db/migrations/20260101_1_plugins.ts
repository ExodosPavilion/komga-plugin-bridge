import type { Database } from "../database.ts";

export function up(db: Database): void {
  db.exec(`
    CREATE TABLE plugins (
      id TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      dir TEXT NOT NULL,
      entry TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      installed_at TEXT NOT NULL
    )
  `);
}
