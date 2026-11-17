import { removePlugin } from "../../plugins/removal.ts";
import type { Router } from "../router.ts";

/** Disabling (keeps settings) and removing (keeps nothing) a plugin. Enabling is in plugin-failures.ts. */
export function register(router: Router) {
  // POST /api/plugins/disable {"id": "..."}: stops the plugin; settings and storage stay.
  router.post("/api/plugins/disable", async (req, ctx) => {
    const body = await req.json().catch(() => null);
    if (typeof body?.id !== "string") return new Response(null, { status: 400 });
    return new Response(null, { status: (await ctx.supervisor.disable(body.id)) ? 200 : 404 });
  });

  // POST /api/plugins/remove {"id": "..."}: stops the plugin and deletes its files and every record.
  router.post("/api/plugins/remove", async (req, ctx) => {
    const body = await req.json().catch(() => null);
    if (typeof body?.id !== "string") return new Response(null, { status: 400 });
    const plugin = ctx.plugins.get(body.id);
    if (!plugin) return new Response(null, { status: 404 });
    await ctx.supervisor.disable(plugin.id);
    try {
      await removePlugin(ctx.db, ctx.config, plugin);
    } catch (error) {
      return Response.json({ error: `Could not remove ${plugin.id}: ${(error as Error).message}` }, { status: 500 });
    }
    return new Response(null, { status: 200 });
  });
}
