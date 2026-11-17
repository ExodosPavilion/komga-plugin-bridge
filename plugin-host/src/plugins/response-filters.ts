// Response filtering: a plugin declares, in its manifest, the Komga API routes whose responses it
// wants to change:
//   "contributions": [{ "type": "response-filter", "routes": ["/api/v1/libraries", "/api/v1/series/*"] }]
// and exports `filterResponse({ request: {method, path, query}, body })`, returning the new JSON
// body, or null/undefined to leave it as is. Several plugins filter in turn, in plugin id order,
// each seeing the previous one's output. A plugin that fails or times out is skipped (and the
// failure counted by the supervisor), so the response is never worse than the unfiltered one.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { librariesOfRequest, type LibraryScopes } from "./library-scope.ts";
import type { PluginStore } from "./store.ts";
import type { PluginSupervisor } from "./supervisor.ts";

export interface FilterRequest {
  method: string;
  path: string;
  query: string;
}

/** `*` matches one path segment, `**` matches anything; everything else is literal. */
export function routeMatches(pattern: string, path: string): boolean {
  const source = pattern
    .split("**")
    .map((part) => part.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*"))
    .join(".*");
  return new RegExp(`^${source}$`).test(path);
}

export class ResponseFilters {
  private manifestRoutes = new Map<string, { key: string; routes: string[] }>();

  constructor(
    private readonly store: PluginStore,
    private readonly supervisor: PluginSupervisor,
    private readonly scopes?: LibraryScopes,
  ) {}

  /** The routes each running filter plugin asked for, by plugin id. */
  private async routesByPlugin(): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    for (const id of this.supervisor.runningIds()) {
      const plugin = this.store.get(id);
      // A plugin enabled for no library acts nowhere, so its routes are not announced.
      if (!plugin?.enabled || (this.scopes && !this.scopes.isEnabledAnywhere(id))) continue;
      const key = `${plugin.dir}@${plugin.version}`;
      let cached = this.manifestRoutes.get(id);
      if (cached?.key !== key) {
        cached = { key, routes: await this.readRoutes(plugin.dir) };
        this.manifestRoutes.set(id, cached);
      }
      if (cached.routes.length > 0) result.set(id, cached.routes);
    }
    return result;
  }

  private async readRoutes(dir: string): Promise<string[]> {
    try {
      const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
      return (manifest.contributions ?? [])
        .filter((c: { type?: unknown }) => c?.type === "response-filter")
        .flatMap((c: { routes?: unknown }) => Array.isArray(c.routes) ? c.routes : [])
        .filter((r: unknown): r is string => typeof r === "string" && r.startsWith("/"));
    } catch {
      return [];
    }
  }

  /** Every route some running filter plugin wants, without duplicates. Empty when none does. */
  async routes(): Promise<string[]> {
    return [...new Set([...(await this.routesByPlugin()).values()].flat())];
  }

  /** Runs the matching filters over a response body. `changed` is false when nothing changed it. */
  async apply(request: FilterRequest, body: unknown): Promise<{ changed: boolean; body?: unknown }> {
    let current = body;
    let changed = false;
    const libraries = librariesOfRequest(request.path, request.query);
    for (const [pluginId, routes] of await this.routesByPlugin()) {
      if (!routes.some((route) => routeMatches(route, request.path))) continue;
      if (this.scopes && !this.scopes.permitsCallAbout(pluginId, libraries)) continue;
      const answer = await this.supervisor.callPlugin(pluginId, "filterResponse", { request, body: current });
      if (answer && answer.result !== null && answer.result !== undefined) {
        current = answer.result;
        changed = true;
      }
    }
    return changed ? { changed, body: current } : { changed };
  }
}
