// Helpers for reading what a route was sent.

/**
 * The request's JSON body, or null when it is missing or not JSON. The shape is the route's to
 * check (`body?.id`, `typeof body?.plugin`), which is why this is loosely typed.
 */
// deno-lint-ignore no-explicit-any
export async function jsonBody(req: Request): Promise<any> {
  return await req.json().catch(() => null);
}
