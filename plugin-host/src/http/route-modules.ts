// Finds the route modules: every `*.ts` in ./routes exports `register(router)`. A new feature adds
// a file there and edits nothing. The test runner package (plugin-test-runner/scripts/bundle.ts)
// replaces this file with a static list of imports, because a package served from a registry has
// no folder to read.
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Router } from "./router.ts";

export interface RouteModule {
  register(router: Router): void;
}

const routesDir = fileURLToPath(new URL("./routes/", import.meta.url));

export async function loadRouteModules(): Promise<RouteModule[]> {
  const modules: RouteModule[] = [];
  for (const file of (await readdir(routesDir)).filter((f) => f.endsWith(".ts")).sort()) {
    modules.push(await import(new URL(`./routes/${file}`, import.meta.url).href));
  }
  return modules;
}
