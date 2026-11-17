import { mergeSeriesMetadata } from "../../plugins/series-metadata.ts";

import type { Router } from "../router.ts";

/**
 * Scan-time series metadata, asked for by the Bridge when Komga scans or refreshes a series.
 * Request: {"series": {"id", "name", "path", "libraryId"}}. Response: {"metadata": {...} | null}.
 */
export function register(router: Router) {
  router.post("/bridge/series-metadata", async (req, ctx) => {
    const body = await req.json().catch(() => null);
    const series = body?.series;
    if (typeof series?.path !== "string") return new Response(null, { status: 400 });
    const scopes = ctx.scopes;
    const libraries = typeof series.libraryId === "string" ? [series.libraryId] : [];
    const results = await ctx.supervisor.callAll("getSeriesMetadata", { series }, (id) => scopes.permitsCallAbout(id, libraries));
    return Response.json({ metadata: mergeSeriesMetadata(results.map((r) => r.result)) });
  });
}
