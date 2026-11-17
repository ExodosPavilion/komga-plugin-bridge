import { jsonBody } from "../body.ts";
import { MAX_ARCHIVE_BYTES } from "../../plugins/archive.ts";
import { installFromArchive } from "../../plugins/install.ts";
import type { Router } from "../router.ts";

/**
 * Installing by upload, and approving a plugin's declared capabilities.
 *   POST /api/plugins/install    body: the plugin archive (a zip) -> 200 {id, version, enabled, pending, upgraded}
 *                                or 400 {error} with the reason it was refused
 *   POST /api/plugins/approve    {"id"}: approves exactly what the plugin declares -> 200 | 404
 *   GET  /api/plugin-capabilities  -> [{id, declared, approved, pending}], what the admin reviews before enabling
 * Enabling a plugin with pending capabilities is refused with 409 (see plugin-failures.ts).
 */
export function register(router: Router) {
  router.post("/api/plugins/install", async (req, ctx) => {
    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > MAX_ARCHIVE_BYTES) {
      return Response.json({ error: "The upload is too large to be a plugin." }, { status: 413 });
    }
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length === 0) return Response.json({ error: "The upload is empty." }, { status: 400 });
    const result = await installFromArchive(ctx, bytes);
    if (!result.ok) {
      console.error(`[plugin-host] refusing upload: ${result.reason}`);
      return Response.json({ error: result.reason }, { status: 400 });
    }
    const { ok: _ok, ...installed } = result;
    return Response.json(installed);
  });

  router.post("/api/plugins/approve", async (req, ctx) => {
    const body = await jsonBody(req);
    if (typeof body?.id !== "string") return new Response(null, { status: 400 });
    if (!ctx.plugins.get(body.id)) return new Response(null, { status: 404 });
    ctx.capabilities.approve(body.id);
    await ctx.supervisor.refreshPermissions(body.id);
    return new Response(null, { status: 200 });
  });

  router.get("/api/plugin-capabilities", (_req, ctx) =>
    Response.json(
      ctx.plugins.list().map((plugin) => ({
        id: plugin.id,
        declared: ctx.capabilities.declared(plugin.id),
        approved: ctx.capabilities.approved(plugin.id),
        pending: ctx.capabilities.pending(plugin.id),
      })),
    ));
}
