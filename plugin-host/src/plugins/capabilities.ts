// Capabilities: what a plugin is approved to do. ONE store of approved capabilities
// (table plugin_capabilities) is read by both enforcement paths:
//   - the Deno-permission mapping (network, file-read:<library>) when a plugin process starts
//   - the Komga-data checks (komga:read, komga:write) when a plugin calls the Plugin API
// Checks always read the approved set, never the manifest. The only place approval happens today
// is CapabilityStore.approveDeclared (folder install grants what the manifest declares); the
// approval flow (#17) replaces that single call.
//
// A capability is a string in a plugin's manifest:
//   "network"              the plugin may reach the network
//   "file-read:<library>"  read files under that library folder; "*" means every configured library
//   "file-write:<library>" reserved: part of the model, but never granted yet
//   "komga:read" / "komga:write"  Komga's data through the Plugin API (checked by the host)
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Database } from "../db/database.ts";
import type { InstalledPlugin } from "./store.ts";

export type KomgaCapability = "komga:read" | "komga:write";

export type Capability =
  | { kind: "network" }
  | { kind: "file-read"; library: string }
  | { kind: "file-write"; library: string }
  | { kind: "komga"; access: "read" | "write" };

export interface CapabilityStatus {
  capability: string;
  granted: boolean;
}

export class CapabilityStore {
  constructor(private readonly db: Database) {}

  approved(pluginId: string): string[] {
    return this.db.prepare("SELECT capability FROM plugin_capabilities WHERE plugin_id = ? ORDER BY capability")
      .all(pluginId).map((row) => String(row.capability));
  }

  has(pluginId: string, capability: KomgaCapability): boolean {
    return this.approved(pluginId).includes(capability);
  }

  /** Folder install: approves what the manifest declares, and nothing else. The single auto-grant point. */
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

/** Whether the model allows this capability to be granted at all today. */
function grantable(capability: Capability): boolean {
  return capability.kind !== "file-write";
}

export function parseCapability(text: string): Capability | null {
  if (text === "network") return { kind: "network" };
  if (text === "komga:read") return { kind: "komga", access: "read" };
  if (text === "komga:write") return { kind: "komga", access: "write" };
  const match = /^(file-read|file-write):(.+)$/.exec(text);
  if (match) return { kind: match[1] as "file-read" | "file-write", library: match[2] };
  return null;
}

/** The libraries a capability covers, among those the host is configured with. */
function librariesOf(capability: { library: string }, libraryRoots: string[]): string[] {
  if (capability.library === "*") return libraryRoots;
  const wanted = resolve(capability.library);
  return libraryRoots.filter((root) => resolve(root) === wanted);
}

export interface Permissions {
  /** Library folders the plugin process may read. */
  read: string[];
  network: boolean;
  /** Each approved capability and whether it is in effect, for the Plugin Manager. */
  statuses: CapabilityStatus[];
}

/** Maps approved capabilities (from CapabilityStore.approved) to Deno permissions. */
export function resolvePermissions(approved: string[], libraryRoots: string[]): Permissions {
  const permissions: Permissions = { read: [], network: false, statuses: [] };
  for (const text of approved) {
    const capability = parseCapability(text);
    let granted = false;
    if (capability && grantable(capability)) {
      if (capability.kind === "network") {
        permissions.network = granted = true;
      } else if (capability.kind === "file-read") {
        const libraries = librariesOf(capability, libraryRoots);
        permissions.read.push(...libraries);
        granted = libraries.length > 0;
      } else if (capability.kind === "komga") {
        granted = true;
      }
    }
    permissions.statuses.push({ capability: text, granted });
  }
  return permissions;
}
