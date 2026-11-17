// Warns when a metadata plugin and one of Komga's built-in importers are both on for a library.
// Precedence is not controlled; the admin resolves a clash with Komga's own per-library switches.
// A metadata plugin is one whose manifest has the contribution {"type": "metadata"}.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type Config, komgaApiKeyOf } from "../config.ts";
import { validateManifest } from "./manifest.ts";
import type { LibraryScopes } from "./library-scope.ts";
import type { InstalledPlugin } from "./store.ts";

/** Komga's importers that fill the same fields as a metadata plugin: LibraryDto flag, display name. */
export const IMPORTERS: { setting: string; name: string }[] = [
  { setting: "importComicInfoBook", name: "ComicInfo.xml (books)" },
  { setting: "importComicInfoSeries", name: "ComicInfo.xml (series)" },
  { setting: "importEpubBook", name: "EPUB metadata (books)" },
  { setting: "importEpubSeries", name: "EPUB metadata (series)" },
  { setting: "importMylarSeries", name: "Mylar series.json (series)" },
  { setting: "importBarcodeIsbn", name: "ISBN barcode (books)" },
];

export interface KomgaLibrary {
  id: string;
  name: string;
  [setting: string]: unknown;
}

export interface Clash {
  plugin: string;
  libraryId: string;
  libraryName: string;
  importers: { setting: string; name: string }[];
}

/** Komga's libraries, or the reason they could not be read. */
export async function fetchLibraries(config: Config): Promise<{ libraries: KomgaLibrary[] } | { unavailable: string }> {
  const apiKey = komgaApiKeyOf(config);
  if (!config.komgaUrl || !apiKey) {
    return { unavailable: "Komga access is not configured on the Plugin Host (KOMGA_URL and KOMGA_API_KEY)" };
  }
  try {
    const response = await fetch(new URL("/api/v1/libraries", config.komgaUrl), {
      headers: { "X-API-Key": apiKey },
    });
    if (!response.ok) {
      await response.body?.cancel();
      return { unavailable: `Komga answered ${response.status} for the library list` };
    }
    return { libraries: await response.json() };
  } catch (error) {
    return { unavailable: `Komga could not be reached: ${(error as Error).message}` };
  }
}

export async function isMetadataPlugin(plugin: Pick<InstalledPlugin, "dir">): Promise<boolean> {
  try {
    const result = validateManifest(await readFile(join(plugin.dir, "manifest.json"), "utf8"));
    return result.ok && result.manifest.contributions.some((c) => (c as { type?: unknown })?.type === "metadata");
  } catch {
    return false;
  }
}

/** Every (enabled metadata plugin, library) pair where a built-in importer is also switched on. */
export async function findClashes(
  plugins: InstalledPlugin[],
  scopes: LibraryScopes,
  libraries: KomgaLibrary[],
): Promise<Clash[]> {
  const clashes: Clash[] = [];
  for (const plugin of plugins) {
    if (!plugin.enabled || !(await isMetadataPlugin(plugin))) continue;
    for (const library of libraries) {
      if (!scopes.isEnabledInAll(plugin.id, [library.id])) continue;
      const importers = IMPORTERS.filter((i) => library[i.setting] === true);
      if (importers.length > 0) {
        clashes.push({ plugin: plugin.id, libraryId: library.id, libraryName: library.name, importers });
      }
    }
  }
  return clashes;
}
