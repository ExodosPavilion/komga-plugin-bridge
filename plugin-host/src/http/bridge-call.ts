// The one shape of a scan-time call from the Bridge: it names a thing (a series or a book) and
// the Plugin Host asks every plugin enabled for that thing's library, then merges the answers.
import type { Handler } from "./router.ts";
import { jsonBody } from "./body.ts";

/**
 * A route handler for `{"<key>": {"path", "libraryId", ...}}` answering `{"metadata": ... | null}`.
 * `hook` is the plugin hook asked ("getSeriesMetadata"); `merge` combines the plugins' answers.
 */
export function metadataCall(key: "series" | "book", hook: string, merge: (results: unknown[]) => unknown): Handler {
  return async (req, ctx) => {
    const subject = (await jsonBody(req))?.[key];
    if (typeof subject?.path !== "string") return new Response(null, { status: 400 });
    const libraries = typeof subject.libraryId === "string" ? [subject.libraryId] : [];
    await ctx.supervisor.noteLibraries(libraries);
    const results = await ctx.supervisor.callAll(hook, { [key]: subject }, (id) => ctx.scopes.permitsCallAbout(id, libraries));
    return Response.json({ metadata: merge(results.map((r) => r.result)) });
  };
}
