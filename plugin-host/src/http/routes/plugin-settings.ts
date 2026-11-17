import { UnknownPluginError } from "../../plugins/settings.ts";
import type { Router } from "../router.ts";

/**
 * A plugin's settings form, and saving it. The plugin is named in the query (GET) or the body (POST).
 *   GET  /api/plugin-settings?plugin=<id>              -> {"fields": [...]}   (secrets: isSet only)
 *   POST /api/plugin-settings {"plugin", "values"}      -> 200 {"fields"} or 400 {"errors": [...]}
 */
export function register(router: Router) {
  router.get("/api/plugin-settings", async (req, ctx) => {
    const id = new URL(req.url).searchParams.get("plugin") ?? "";
    try {
      return Response.json({ fields: await ctx.pluginData.form(id) });
    } catch (error) {
      return failure(error);
    }
  });

  router.post("/api/plugin-settings", async (req, ctx) => {
    const body = await req.json().catch(() => null);
    if (typeof body?.plugin !== "string" || typeof body.values !== "object" || body.values === null) {
      return Response.json({ errors: ['Expected {"plugin": "<id>", "values": {...}}.'] }, { status: 400 });
    }
    try {
      const errors = await ctx.pluginData.save(body.plugin, body.values);
      if (errors.length > 0) return Response.json({ errors }, { status: 400 });
      return Response.json({ fields: await ctx.pluginData.form(body.plugin) });
    } catch (error) {
      return failure(error);
    }
  });
}

function failure(error: unknown): Response {
  if (error instanceof UnknownPluginError) return Response.json({ errors: [error.message] }, { status: 404 });
  throw error;
}
