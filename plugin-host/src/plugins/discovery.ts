// Install from a folder: every sub-folder of the plugins directory holding a manifest.json is a
// plugin. A folder whose manifest is refused (see manifest.ts) is reported, never installed.
// (Archives, uploads and GitHub releases come in later tickets.)
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { validateManifest } from "./manifest.ts";

export interface DiscoveredPlugin {
  id: string;
  version: string;
  dir: string;
  entry: string;
}

export interface RefusedPlugin {
  folder: string;
  reason: string;
}

export interface Discovery {
  found: DiscoveredPlugin[];
  refused: RefusedPlugin[];
}

export async function discoverPlugins(pluginsDir: string): Promise<Discovery> {
  let names: string[];
  try {
    names = (await readdir(pluginsDir)).sort();
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return { found: [], refused: [] };
    throw error;
  }
  const found: DiscoveredPlugin[] = [];
  const refused: RefusedPlugin[] = [];
  for (const name of names) {
    if (name.startsWith(".")) continue; // hidden: an install in progress (see install.ts)
    const dir = join(pluginsDir, name);
    let text: string;
    try {
      text = await readFile(join(dir, "manifest.json"), "utf8");
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT" || (error as { code?: string }).code === "ENOTDIR") {
        continue; // not a plugin folder
      }
      refused.push({ folder: basename(dir), reason: `manifest.json cannot be read: ${(error as Error).message}` });
      continue;
    }
    const result = validateManifest(text);
    if (!result.ok) {
      console.error(`[plugin-host] refusing ${dir}: ${result.reason}`);
      refused.push({ folder: basename(dir), reason: result.reason });
      continue;
    }
    const { id, version, entry } = result.manifest;
    found.push({ id, version, dir, entry });
  }
  return { found, refused };
}
