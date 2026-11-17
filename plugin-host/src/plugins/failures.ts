// Failure records and the consecutive-failure count of each plugin, kept in the host's database.
import type { Database } from "../db/database.ts";

export type FailureKind = "timeout" | "crash" | "error";

/** Thrown by a plugin call so the supervisor can record what kind of failure it was. */
export class PluginCallError extends Error {
  constructor(readonly kind: FailureKind, message: string) {
    super(message);
  }
}

export interface FailureRecord {
  plugin: string;
  at: string;
  kind: FailureKind;
  reason: string;
}

/** Most recent records kept per plugin. */
const keepPerPlugin = 200;

export class FailureLog {
  constructor(private readonly db: Database) {}

  /** Records a failure and returns the plugin's consecutive failure count including it. */
  recordFailure(plugin: string, kind: FailureKind, reason: string): number {
    this.db.prepare("INSERT INTO plugin_failures (plugin_id, at, kind, reason) VALUES (?, ?, ?, ?)")
      .run(plugin, new Date().toISOString(), kind, reason);
    this.db.prepare(
      `DELETE FROM plugin_failures WHERE plugin_id = ? AND id NOT IN
         (SELECT id FROM plugin_failures WHERE plugin_id = ? ORDER BY id DESC LIMIT ?)`,
    ).run(plugin, plugin, keepPerPlugin);
    this.db.prepare(
      `INSERT INTO plugin_health (plugin_id, consecutive_failures) VALUES (?, 1)
       ON CONFLICT(plugin_id) DO UPDATE SET consecutive_failures = consecutive_failures + 1`,
    ).run(plugin);
    return this.consecutiveFailures(plugin);
  }

  recordSuccess(plugin: string): void {
    this.db.prepare("UPDATE plugin_health SET consecutive_failures = 0 WHERE plugin_id = ?").run(plugin);
  }

  consecutiveFailures(plugin: string): number {
    const row = this.db.prepare("SELECT consecutive_failures AS n FROM plugin_health WHERE plugin_id = ?")
      .get(plugin);
    return row ? Number(row.n) : 0;
  }

  markAutoDisabled(plugin: string, value: boolean): void {
    this.db.prepare(
      `INSERT INTO plugin_health (plugin_id, auto_disabled) VALUES (?, ?)
       ON CONFLICT(plugin_id) DO UPDATE SET auto_disabled = excluded.auto_disabled`,
    ).run(plugin, value ? 1 : 0);
  }

  isAutoDisabled(plugin: string): boolean {
    const row = this.db.prepare("SELECT auto_disabled AS a FROM plugin_health WHERE plugin_id = ?").get(plugin);
    return row ? row.a === 1 : false;
  }

  /** Newest first. */
  list(plugin: string, limit = 100): FailureRecord[] {
    return this.db.prepare(
      "SELECT plugin_id, at, kind, reason FROM plugin_failures WHERE plugin_id = ? ORDER BY id DESC LIMIT ?",
    ).all(plugin, limit).map((row) => ({
      plugin: String(row.plugin_id),
      at: String(row.at),
      kind: String(row.kind) as FailureKind,
      reason: String(row.reason),
    }));
  }
}
