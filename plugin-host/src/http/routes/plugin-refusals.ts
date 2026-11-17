import type { Router } from "../router.ts";

/** Plugins refused at the last start, with the reason. Held in memory only; never persisted. */
export function register(router: Router) {
  router.get("/api/plugins/refused", (_req, ctx) => Response.json(ctx.refused));
}
