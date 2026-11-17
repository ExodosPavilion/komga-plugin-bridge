import { dispatchEvent } from "../../plugins/events.ts";
import { libraryOfEvent, scopesOf } from "../../plugins/library-scope.ts";
import type { Router } from "../router.ts";

/**
 * Komga's internal events, forwarded by the Bridge. Request: {"type": "LibraryScanned", "data": {...}}.
 * Response: {"delivered": ["<plugin id>", ...]}, the plugins that handled it.
 */
export function register(router: Router) {
  router.post("/bridge/events", async (req, ctx) => {
    const body = await req.json().catch(() => null);
    if (typeof body?.type !== "string" || !/^[A-Za-z]+$/.test(body.type)) return new Response(null, { status: 400 });
    const data = typeof body.data === "object" && body.data !== null ? body.data : {};
    // An event about a library reaches only plugins enabled for it; other events (users, read
    // progress, ...) are not about one library and reach every subscriber enabled somewhere.
    const scopes = scopesOf(ctx);
    const library = libraryOfEvent(data);
    const delivered = await dispatchEvent(
      ctx.plugins,
      ctx.supervisor,
      { type: body.type, data },
      (id) => scopes.enabledFor(id, library ? [library] : []),
    );
    return Response.json({ delivered });
  });
}
