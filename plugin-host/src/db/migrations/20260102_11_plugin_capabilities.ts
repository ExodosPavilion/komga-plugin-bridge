import type { Database } from "../database.ts";

export function up(db: Database): void {
  db.exec("ALTER TABLE plugins ADD COLUMN capabilities TEXT NOT NULL DEFAULT '[]'");
}
