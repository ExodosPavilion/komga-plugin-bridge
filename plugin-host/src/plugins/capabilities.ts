// Capabilities a plugin is approved for. The approval flow itself is a later ticket; until then
// a plugin installed from a folder is treated as approved for what its manifest declares
// (`"capabilities": ["komga:read", ...]`). Checks always read the approved set, never the manifest.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Database } from "../db/database.ts";
import type { InstalledPlugin } from "./store.ts";

export type Capability = "komga:read" | "komga:write";

export class CapabilityStore {
  constructor(private readonly db: Database) {}

  approved(pluginId: string): string[] {
    return this.db.prepare("SELECT capability FROM plugin_capabilities WHERE plugin_id = ? ORDER BY capability")
      .all(pluginId).map((row) => String(row.capability));
  }

  has(pluginId: string, capability: Capability): boolean {
    return this.approved(pluginId).includes(capability);
  }

  /** Folder install: approves what the manifest declares, and nothing else. */
  async approveDeclared(plugin: InstalledPlugin): Promise<void> {
    let declared: unknown = [];
    try {
      declared = JSON.parse(await readFile(join(plugin.dir, "manifest.json"), "utf8")).capabilities ?? [];
    } catch { /* an unreadable manifest declares nothing */ }
    const list = Array.isArray(declared) ? declared.filter((c): c is string => typeof c === "string") : [];
    this.db.prepare("DELETE FROM plugin_capabilities WHERE plugin_id = ?").run(plugin.id);
    for (const capability of list) {
      this.db.prepare("INSERT OR IGNORE INTO plugin_capabilities (plugin_id, capability) VALUES (?, ?)")
        .run(plugin.id, capability);
    }
  }
}
