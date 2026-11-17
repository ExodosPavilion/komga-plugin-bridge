import type { Database } from "../database.ts";

export function up(db: Database): void {
  db.exec(`
    CREATE TABLE bridge_reports (
      instance_id TEXT PRIMARY KEY,
      active INTEGER NOT NULL,
      komga_version TEXT,
      supported_versions TEXT NOT NULL,
      reason TEXT,
      reported_at TEXT NOT NULL
    );
  `);
}
