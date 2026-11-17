// The Plugin Host's own SQLite database. All plugin-system state lives here; Komga's database is
// never opened.
//
// Schema changes are migrations: add a file to ./migrations named `<yyyymmdd>_<n>_<what>.ts`
// exporting `up(db)`. Files are discovered and applied in name order, each exactly once, so
// parallel tickets add files instead of editing a shared list.
import { DatabaseSync } from "node:sqlite";
import { loadMigrations } from "./migration-modules.ts";

export type Database = DatabaseSync;

export async function openDatabase(file: string): Promise<Database> {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const applied = new Set(
    db.prepare("SELECT name FROM schema_migrations").all().map((row) => String(row.name)),
  );
  for (const migration of await loadMigrations()) {
    if (applied.has(migration.name)) continue;
    db.exec("BEGIN");
    try {
      migration.up(db);
      db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)").run(
        migration.name,
        new Date().toISOString(),
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  return db;
}
