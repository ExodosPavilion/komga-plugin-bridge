import type { Database } from "../database.ts";

/**
 * Per-library enablement. A plugin with no row in plugin_library_scope acts in every library;
 * once an admin chooses, `all_libraries` is 0 and only the libraries in plugin_libraries count.
 */
export function up(db: Database): void {
  db.exec(`
    CREATE TABLE plugin_library_scope (
      plugin_id TEXT PRIMARY KEY,
      all_libraries INTEGER NOT NULL
    );
    CREATE TABLE plugin_libraries (
      plugin_id TEXT NOT NULL,
      library_id TEXT NOT NULL,
      PRIMARY KEY (plugin_id, library_id)
    );
  `);
}
