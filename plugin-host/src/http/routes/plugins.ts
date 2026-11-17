import { resolvePermissions } from "../../plugins/capabilities.ts";
import type { Router } from "../router.ts";

/** The installed plugins and whether each is running. The Plugin Manager will build on this. */
export function register(router: Router) {
  router.get("/api/plugins", (_req, ctx) =>
    Response.json(
      ctx.plugins.list().map((plugin) => ({
        id: plugin.id,
        version: plugin.version,
        enabled: plugin.enabled,
        running: ctx.supervisor.isRunning(plugin.id),
        pid: ctx.supervisor.pid(plugin.id),
        capabilities: resolvePermissions(plugin.capabilities, ctx.config.libraryRoots).statuses,
      })),
    ));
}
