import type { Database } from "../database.ts";

/** Where a plugin installed from a GitHub release came from, and which release it is pinned to. */
export function up(db: Database): void {
  db.exec(`
    CREATE TABLE plugin_sources (
      plugin_id TEXT PRIMARY KEY,
      repo TEXT NOT NULL,
      tag TEXT NOT NULL,
      published_at TEXT NOT NULL
    );
  `);
}
