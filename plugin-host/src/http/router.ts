// A tiny router. Route modules (./routes/*.ts) register handlers on it; see routes/health.ts.
import type { HostContext } from "../context.ts";

export type Handler = (req: Request, ctx: HostContext) => Response | Promise<Response>;

export interface RouteOptions {
  /** Skips the shared-secret check. Only for routes safe to expose on the private network. */
  public?: boolean;
}

interface Route {
  handler: Handler;
  options: RouteOptions;
}

export class Router {
  private routes = new Map<string, Route>();

  get(path: string, handler: Handler, options: RouteOptions = {}) {
    this.routes.set(`GET ${path}`, { handler, options });
  }

  post(path: string, handler: Handler, options: RouteOptions = {}) {
    this.routes.set(`POST ${path}`, { handler, options });
  }

  find(method: string, path: string): Route | undefined {
    return this.routes.get(`${method} ${path}`);
  }
}
