import type { HostContext } from "../../context.ts";
import type { Router } from "../router.ts";

interface BridgeStatus {
  active: boolean;
  reason?: string;
  komgaVersion?: string;
  at: string;
}

// What the Bridge last said about itself, in memory (it reports again at every Komga start).
const reports = new WeakMap<HostContext, BridgeStatus>();

/**
 * The Bridge reports whether it is active (POST) and the Plugin Manager reads it (GET).
 * Inactive carries the reason (for example, a Komga version that has not been verified).
 */
export function register(router: Router) {
  router.post("/api/bridge/status", async (req, ctx) => {
    const body = await req.json().catch(() => null);
    if (typeof body?.active !== "boolean") return new Response(null, { status: 400 });
    reports.set(ctx, {
      active: body.active,
      reason: typeof body.reason === "string" ? body.reason : undefined,
      komgaVersion: typeof body.komgaVersion === "string" ? body.komgaVersion : undefined,
      at: new Date().toISOString(),
    });
    return Response.json({ ok: true });
  });

  router.get("/api/bridge/status", (_req, ctx) => {
    const status = reports.get(ctx);
    return Response.json(status ? { reported: true, ...status } : { reported: false });
  });
}
