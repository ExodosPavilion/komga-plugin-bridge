// The capability model, and how the runtime-enforceable capabilities become Deno permissions.
//
// A capability is written as a string in a plugin's manifest:
//   "network"              the plugin may reach the network
//   "file-read:<library>"  the plugin may read files under that library folder; "*" means every
//                          library the host is configured with
//   "file-write:<library>" reserved: part of the model, but never granted yet
// Capabilities about Komga's data are checked by the host when a plugin calls the Plugin API
// and are a later ticket; Deno can only enforce the ones above.
import { resolve } from "node:path";

export type Capability =
  | { kind: "network" }
  | { kind: "file-read"; library: string }
  | { kind: "file-write"; library: string };

export interface CapabilityStatus {
  capability: string;
  granted: boolean;
}

/** Whether the model allows this capability to be granted at all today. */
function grantable(capability: Capability): boolean {
  return capability.kind !== "file-write";
}

export function parseCapability(text: string): Capability | null {
  if (text === "network") return { kind: "network" };
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
  /** Each declared capability and whether it is granted, for the Plugin Manager. */
  statuses: CapabilityStatus[];
}

export function resolvePermissions(declared: string[], libraryRoots: string[]): Permissions {
  const permissions: Permissions = { read: [], network: false, statuses: [] };
  for (const text of declared) {
    const capability = parseCapability(text);
    let granted = false;
    if (capability && grantable(capability)) {
      if (capability.kind === "network") {
        permissions.network = granted = true;
      } else if (capability.kind === "file-read") {
        const libraries = librariesOf(capability, libraryRoots);
        permissions.read.push(...libraries);
        granted = libraries.length > 0;
      }
    }
    permissions.statuses.push({ capability: text, granted });
  }
  return permissions;
}
