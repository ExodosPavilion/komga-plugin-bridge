import type { Router } from "../router.ts";

export function register(router: Router) {
  router.get("/healthz", () => Response.json({ ok: true }), { public: true });
}
