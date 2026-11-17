// HTTP interface of the Plugin Host. Route modules are discovered from ./routes: every `*.ts`
// there exports `register(router)`. A new ticket adds a file; none edits a shared list.
//
// Every route except those marked public needs the shared secret, which only the Bridge (and
// the host's own tests, standing in for it) holds.
import type { HostContext } from "../context.ts";
import { Router } from "./router.ts";
import { loadRouteModules } from "./route-modules.ts";

export interface HttpServer {
  port: number;
  stop(): Promise<void>;
}

export async function startHttpServer(ctx: HostContext, secret: string): Promise<HttpServer> {
  const router = new Router();
  for (const module of await loadRouteModules()) module.register(router);

  const server = Deno.serve(
    { port: ctx.config.port, hostname: "0.0.0.0", onListen: () => {} },
    async (req) => {
      const route = router.find(req.method, new URL(req.url).pathname);
      if (!route) return new Response(null, { status: 404 });
      if (!route.options.public && !hasSecret(req, secret)) {
        return new Response(null, { status: 401 });
      }
      try {
        return await route.handler(req, ctx);
      } catch (error) {
        console.error("[plugin-host] unhandled error in route", error);
        return new Response(null, { status: 500 });
      }
    },
  );
  return { port: server.addr.port, stop: () => server.shutdown() };
}

function hasSecret(req: Request, secret: string): boolean {
  const header = req.headers.get("Authorization") ?? "";
  const given = new TextEncoder().encode(header);
  const expected = new TextEncoder().encode(`Bearer ${secret}`);
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given[i] ^ expected[i];
  return diff === 0;
}
