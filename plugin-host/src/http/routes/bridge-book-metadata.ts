import { mergeBookMetadata } from "../../plugins/book-metadata.ts";
import { scopesOf } from "../../plugins/library-scope.ts";
import type { Router } from "../router.ts";

/**
 * Scan-time book metadata, asked for by the Bridge when Komga scans or refreshes a book.
 * Request: {"book": {"id", "name", "path", "seriesId", "libraryId"}}. Response: {"metadata": {...} | null}.
 */
export function register(router: Router) {
  router.post("/bridge/book-metadata", async (req, ctx) => {
    const body = await req.json().catch(() => null);
    const book = body?.book;
    if (typeof book?.path !== "string") return new Response(null, { status: 400 });
    const scopes = scopesOf(ctx);
    const libraries = typeof book.libraryId === "string" ? [book.libraryId] : [];
    const results = await ctx.supervisor.callAll("getBookMetadata", { book }, (id) => scopes.enabledFor(id, libraries));
    return Response.json({ metadata: mergeBookMetadata(results.map((r) => r.result)) });
  });
}
