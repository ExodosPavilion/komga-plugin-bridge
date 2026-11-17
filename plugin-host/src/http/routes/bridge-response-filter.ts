import { ResponseFilters } from "../../plugins/response-filters.ts";
import type { Router } from "../router.ts";
import type { HostContext } from "../../context.ts";

// One instance per host context (the context is created once per host).
const instances = new WeakMap<HostContext, ResponseFilters>();
const filtersFor = (ctx: HostContext) => {
  let filters = instances.get(ctx);
  if (!filters) instances.set(ctx, filters = new ResponseFilters(ctx.plugins, ctx.supervisor));
  return filters;
};

/**
 * Response filtering, for the bundled web UI only (the Bridge decides which requests qualify).
 * GET /bridge/response-filters answers {"routes": [...]}: the routes some plugin filters, so the
 * Bridge can leave every other response untouched without calling the host.
 * POST /bridge/response-filter takes {"request": {method, path, query}, "body": <json>} and
 * answers {"changed": false} or {"changed": true, "body": <json>}.
 */
export function register(router: Router) {
  router.get("/bridge/response-filters", async (_req, ctx) => Response.json({ routes: await filtersFor(ctx).routes() }));

  router.post("/bridge/response-filter", async (req, ctx) => {
    const input = await req.json().catch(() => null);
    const request = input?.request;
    if (typeof request?.path !== "string" || !input || !("body" in input)) return new Response(null, { status: 400 });
    return Response.json(await filtersFor(ctx).apply({
      method: String(request.method ?? "GET"),
      path: request.path,
      query: String(request.query ?? ""),
    }, input.body));
  });
}
