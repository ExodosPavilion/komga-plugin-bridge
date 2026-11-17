import type { Database } from "../database.ts";

/** The capabilities an admin has approved for each plugin. */
export function up(db: Database): void {
  db.exec(`
    CREATE TABLE plugin_capabilities (
      plugin_id TEXT NOT NULL,
      capability TEXT NOT NULL,
      PRIMARY KEY (plugin_id, capability)
    )
  `);
}
