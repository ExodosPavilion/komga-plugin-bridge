import { jsonBody } from "../body.ts";
import { BridgeStatus } from "../../bridge/status.ts";
import type { Router } from "../router.ts";

/**
 * The Bridge reports whether it is active (it is inactive on a Komga version not on its
 * supported list). POST /bridge/status {instanceId, active, komgaVersion, supportedVersions,
 * reason}. GET /api/bridge-status gives {current, reports} for the Plugin Manager.
 */
export function register(router: Router) {
  router.post("/bridge/status", async (req, ctx) => {
    const b = await jsonBody(req);
    const strings = (v: unknown) => Array.isArray(v) && v.every((s) => typeof s === "string");
    const optional = (v: unknown) => v === undefined || v === null || typeof v === "string";
    if (
      typeof b?.instanceId !== "string" || b.instanceId === "" || typeof b.active !== "boolean" ||
      !optional(b.komgaVersion) || !optional(b.reason) || !strings(b.supportedVersions ?? [])
    ) return new Response(null, { status: 400 });
    new BridgeStatus(ctx.db).record({
      instanceId: b.instanceId,
      active: b.active,
      komgaVersion: b.komgaVersion ?? null,
      supportedVersions: b.supportedVersions ?? [],
      reason: b.reason ?? null,
    });
    if (!b.active) console.log(`[plugin-host] the Bridge is inactive: ${b.reason}`);
    return new Response(null, { status: 200 });
  });

  router.get("/api/bridge-status", (_req, ctx) => {
    const reports = new BridgeStatus(ctx.db).list();
    return Response.json({ current: reports[0] ?? null, reports });
  });
}
