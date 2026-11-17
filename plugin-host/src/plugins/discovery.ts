// Install from a folder: every sub-folder of the plugins directory holding a manifest.json is a
// plugin. (Archives, uploads and GitHub releases come in later tickets; manifest validation
// is deliberately minimal here and gets its own ticket.)
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export interface DiscoveredPlugin {
  id: string;
  version: string;
  dir: string;
  entry: string;
  /** Declared in the manifest. Until capability approval exists, a folder install grants them all. */
  capabilities: string[];
}

export async function discoverPlugins(pluginsDir: string): Promise<DiscoveredPlugin[]> {
  let names: string[];
  try {
    names = (await readdir(pluginsDir)).sort();
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
  const found: DiscoveredPlugin[] = [];
  for (const name of names) {
    const dir = join(pluginsDir, name);
    try {
      const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
      if (typeof manifest.id !== "string" || typeof manifest.version !== "string") {
        throw new Error("manifest needs a string id and version");
      }
      found.push({
        id: manifest.id,
        version: manifest.version,
        dir,
        entry: typeof manifest.entry === "string" ? manifest.entry : "index.ts",
        capabilities: Array.isArray(manifest.capabilities)
          ? manifest.capabilities.filter((c: unknown): c is string => typeof c === "string")
          : [],
      });
    } catch (error) {
      console.error(`[plugin-host] ignoring ${dir}: ${(error as Error).message}`);
    }
  }
  return found;
}
