// Serves the Plugin Manager's web page from ../../manager/ui. The page is reached through the
// Bridge (admins only); the Bridge forwards /api/v1/plugin-manager/ to /manager/ here, and
// /api/v1/plugin-manager/api/... to this host's /api/....
//
// To add a feature to the page, add a file to manager/ui/sections/ (see app.js for the contract).
// Nothing else needs editing: files found at start-up are served and listed.
import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Router } from "../router.ts";

const uiDir = fileURLToPath(new URL("../../manager/ui/", import.meta.url));

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

/** Relative paths ("app.js", "sections/10-plugins.js") of every file under dir. */
function listFiles(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(dir, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]
  ).sort();
}

export function register(router: Router) {
  const files = listFiles(uiDir).filter((f) => extname(f) in types);

  // Only files found here are served, so no request can reach anything else on disk.
  for (const file of files) {
    const headers = { "Content-Type": types[extname(file)], "Cache-Control": "no-cache" };
    const route = file === "index.html" ? "/manager/" : `/manager/${file}`;
    router.get(route, () => new Response(readFileSync(join(uiDir, file)), { headers }));
  }

  const sections = files.filter((f) => f.startsWith("sections/") && f.endsWith(".js"));
  router.get("/manager/sections.json", () => Response.json(sections, { headers: { "Cache-Control": "no-cache" } }));
}
