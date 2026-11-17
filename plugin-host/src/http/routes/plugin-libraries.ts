import { jsonBody } from "../body.ts";
import { fetchLibraries, findClashes } from "../../plugins/library-clashes.ts";

import type { Router } from "../router.ts";

/**
 * Per-library enablement and the importer clash warning.
 * GET  /api/plugin-libraries: {"plugins": [{"id", "all", "libraries": [ids]}], "komgaLibraries": [{"id", "name"}] | null,
 *      "unavailable"?: reason Komga's libraries could not be read}
 * POST /api/plugin-libraries {"plugin", "all": true} or {"plugin", "libraries": [ids]}: choose where a plugin acts.
 * GET  /api/plugin-clashes: {"clashes": [{"plugin", "libraryId", "libraryName", "importers": [...]}], "unavailable"?}
 */
export function register(router: Router) {
  router.get("/api/plugin-libraries", async (_req, ctx) => {
    const scopes = ctx.scopes;
    const found = await fetchLibraries(ctx.config);
    return Response.json({
      plugins: ctx.plugins.list().map((p) => ({ id: p.id, ...scopes.get(p.id) })),
      komgaLibraries: "libraries" in found ? found.libraries.map((l) => ({ id: l.id, name: l.name })) : null,
      ...("unavailable" in found ? { unavailable: found.unavailable } : {}),
    });
  });

  router.post("/api/plugin-libraries", async (req, ctx) => {
    const body = await jsonBody(req);
    if (typeof body?.plugin !== "string") return new Response(null, { status: 400 });
    if (!ctx.plugins.get(body.plugin)) return new Response(null, { status: 404 });
    if (body.all === true) {
      ctx.scopes.set(body.plugin, { all: true, libraries: [] });
    } else if (Array.isArray(body.libraries) && body.libraries.every((l: unknown) => typeof l === "string")) {
      ctx.scopes.set(body.plugin, { all: false, libraries: body.libraries });
    } else {
      return new Response(null, { status: 400 });
    }
    await ctx.supervisor.refreshPermissions(body.plugin);
    return Response.json(ctx.scopes.get(body.plugin));
  });

  router.get("/api/plugin-clashes", async (_req, ctx) => {
    const found = await fetchLibraries(ctx.config);
    if ("unavailable" in found) return Response.json({ clashes: [], unavailable: found.unavailable });
    return Response.json({ clashes: await findClashes(ctx.plugins.list(), ctx.scopes, found.libraries) });
  });
}
