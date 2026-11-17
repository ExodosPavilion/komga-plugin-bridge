// Per-library enablement: which libraries a plugin acts in. A plugin nobody has configured acts
// in every library. Once an admin picks libraries it acts only in those (and in none when the
// list is empty). Every kind of plugin call (metadata, events, response filtering) asks this.
import type { Database } from "../db/database.ts";
import type { HostContext } from "../context.ts";

export interface LibraryScope {
  all: boolean;
  libraries: string[];
}

export class LibraryScopes {
  constructor(private readonly db: Database) {}

  get(pluginId: string): LibraryScope {
    const row = this.db.prepare("SELECT all_libraries FROM plugin_library_scope WHERE plugin_id = ?").get(pluginId);
    if (!row || row.all_libraries === 1) return { all: true, libraries: [] };
    const libraries = this.db.prepare("SELECT library_id FROM plugin_libraries WHERE plugin_id = ? ORDER BY library_id")
      .all(pluginId).map((r) => String(r.library_id));
    return { all: false, libraries };
  }

  set(pluginId: string, scope: LibraryScope): void {
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM plugin_libraries WHERE plugin_id = ?").run(pluginId);
      this.db.prepare(
        "INSERT INTO plugin_library_scope (plugin_id, all_libraries) VALUES (?, ?) " +
          "ON CONFLICT(plugin_id) DO UPDATE SET all_libraries = excluded.all_libraries",
      ).run(pluginId, scope.all ? 1 : 0);
      if (!scope.all) {
        for (const id of new Set(scope.libraries)) {
          this.db.prepare("INSERT INTO plugin_libraries (plugin_id, library_id) VALUES (?, ?)").run(pluginId, id);
        }
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  /**
   * Whether the plugin acts for a call about these libraries. With no library named (a call that
   * is not about one library) it acts when it is enabled anywhere. With several named, it must
   * be enabled for all of them.
   */
  enabledFor(pluginId: string, libraryIds: string[] = []): boolean {
    const scope = this.get(pluginId);
    if (scope.all) return true;
    if (libraryIds.length === 0) return scope.libraries.length > 0;
    return libraryIds.every((id) => scope.libraries.includes(id));
  }
}

const instances = new WeakMap<HostContext, LibraryScopes>();

/** The one LibraryScopes of a host context. */
export function scopesOf(ctx: HostContext): LibraryScopes {
  let scopes = instances.get(ctx);
  if (!scopes) instances.set(ctx, scopes = new LibraryScopes(ctx.db));
  return scopes;
}

/** The library an event is about, if any (the Bridge's EventMapper puts it in a fixed place). */
export function libraryOfEvent(data: Record<string, unknown>): string | undefined {
  for (const key of ["library", "series", "book"]) {
    const part = data[key] as Record<string, unknown> | null | undefined;
    const id = key === "library" ? part?.id : part?.libraryId;
    if (typeof id === "string") return id;
  }
  return undefined;
}

/** The libraries a Komga API request is about: /api/v1/libraries/{id}... or ?library_id=a,b. */
export function librariesOfRequest(path: string, query: string): string[] {
  const ids: string[] = [];
  const m = /^\/api\/v1\/libraries\/([^/]+)/.exec(path);
  if (m) ids.push(decodeURIComponent(m[1]));
  for (const value of new URLSearchParams(query).getAll("library_id")) {
    ids.push(...value.split(",").filter(Boolean));
  }
  return ids;
}
