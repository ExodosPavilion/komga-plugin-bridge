// What the Bridge says about itself: active or inactive, the Komga version it found, and why it
// is inactive. One report per Komga run (instance id), newest run first. The Plugin Manager reads
// this later to show that plugins are off and what to upgrade.
import type { Database } from "../db/database.ts";

export interface BridgeReport {
  instanceId: string;
  active: boolean;
  komgaVersion: string | null;
  supportedVersions: string[];
  reason: string | null;
  reportedAt: string;
}

/** Reports kept; older Komga runs are dropped. */
const keep = 10;

export class BridgeStatus {
  constructor(private readonly db: Database) {}

  record(report: Omit<BridgeReport, "reportedAt">): void {
    this.db.prepare(
      `INSERT INTO bridge_reports (instance_id, active, komga_version, supported_versions, reason, reported_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(instance_id) DO UPDATE SET active = excluded.active,
         komga_version = excluded.komga_version, supported_versions = excluded.supported_versions,
         reason = excluded.reason, reported_at = excluded.reported_at`,
    ).run(
      report.instanceId,
      report.active ? 1 : 0,
      report.komgaVersion,
      JSON.stringify(report.supportedVersions),
      report.reason,
      new Date().toISOString(),
    );
    this.db.prepare(
      `DELETE FROM bridge_reports WHERE instance_id NOT IN
         (SELECT instance_id FROM bridge_reports ORDER BY reported_at DESC, rowid DESC LIMIT ?)`,
    ).run(keep);
  }

  /** Newest first. */
  list(): BridgeReport[] {
    return this.db.prepare(
      `SELECT instance_id, active, komga_version, supported_versions, reason, reported_at
       FROM bridge_reports ORDER BY reported_at DESC, rowid DESC`,
    ).all().map((row) => ({
      instanceId: String(row.instance_id),
      active: row.active === 1,
      komgaVersion: row.komga_version === null ? null : String(row.komga_version),
      supportedVersions: JSON.parse(String(row.supported_versions)),
      reason: row.reason === null ? null : String(row.reason),
      reportedAt: String(row.reported_at),
    }));
  }
}
