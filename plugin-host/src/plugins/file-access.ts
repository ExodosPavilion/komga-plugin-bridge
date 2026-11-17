// Which library folders a plugin process may read. Three things must all hold:
//   1. the plugin holds an approved `file-read:<folder>` (or `file-read:*`),
//   2. the admin enabled the plugin in that library (per-library enablement, library-scope.ts),
//   3. the folder is the library's root as Komga reports it.
// A Komga library maps to a folder through Komga's own library list: `root` of
// `GET /api/v1/libraries`, read with the host's KOMGA_URL and KOMGA_API_KEY when a process starts
// (and again when the plugin's library choice or approvals change). The root must also lie
// inside one of the host's configured library roots (the folders mounted into it), so a
// misreported root never opens other parts of the host's filesystem. If Komga's list cannot be
// read, no library folder is readable: access fails closed, and the supervisor retries.
import { isAbsolute, relative, resolve } from "node:path";
import type { Config } from "../config.ts";
import { fetchLibraries } from "./library-clashes.ts";
import type { LibraryScopes } from "./library-scope.ts";

export interface EnabledRoots {
  /** Root folders of the libraries the plugin is enabled in (and the host has mounted). */
  roots: string[];
  /** False when Komga's library list could not be read, so `roots` may be missing some. */
  complete: boolean;
  /** Ids of every library Komga listed (so a caller can tell a library it has not seen yet). */
  known: string[];
}

const inside = (root: string, parent: string) => {
  const path = relative(resolve(parent), resolve(root));
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
};

/** The root folders of the libraries a plugin is enabled in. */
export async function enabledLibraryRoots(
  config: Config,
  scopes: LibraryScopes,
  pluginId: string,
): Promise<EnabledRoots> {
  const found = await fetchLibraries(config);
  if ("unavailable" in found) return { roots: [], complete: false, known: [] };
  const roots: string[] = [];
  for (const library of found.libraries) {
    if (typeof library.root !== "string" || library.root === "") continue;
    if (!scopes.isEnabledInAll(pluginId, [library.id])) continue;
    if (!config.libraryRoots.some((mounted) => inside(String(library.root), mounted))) continue;
    roots.push(resolve(String(library.root)));
  }
  return { roots, complete: true, known: found.libraries.map((l) => l.id) };
}
