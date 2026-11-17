import type { Database } from "../database.ts";

/**
 * What each installed plugin's manifest declares. A plugin whose declared set is not covered by
 * its approved set (plugin_capabilities) is waiting for approval and cannot be enabled.
 */
export function up(db: Database): void {
  db.exec(`
    CREATE TABLE plugin_declared_capabilities (
      plugin_id TEXT NOT NULL,
      capability TEXT NOT NULL,
      PRIMARY KEY (plugin_id, capability)
    )
  `);
}
