import type { Router } from "../router.ts";

/** Failure records and re-enabling a plugin. The Plugin Manager builds on these. */
export function register(router: Router) {
  // GET /api/failures?plugin=<id>: recent failures, newest first.
  router.get("/api/failures", (req, ctx) => {
    const plugin = new URL(req.url).searchParams.get("plugin");
    if (!plugin) return new Response(null, { status: 400 });
    return Response.json(ctx.failures.list(plugin));
  });

  // POST /api/plugins/enable {"id": "..."}: re-enables a plugin and clears its failure count.
  router.post("/api/plugins/enable", async (req, ctx) => {
    const body = await req.json().catch(() => null);
    if (typeof body?.id !== "string") return new Response(null, { status: 400 });
    return new Response(null, { status: (await ctx.supervisor.enable(body.id)) ? 200 : 404 });
  });
}
