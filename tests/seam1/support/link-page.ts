import assert from "node:assert/strict";

// Helpers for checking the pages that carry the Plugin Manager link script.
export const browserHeaders = { Accept: "text/html,application/xhtml+xml" };

export type Page = { status: number; type: string; text: string };

export async function pageAt(baseUrl: string, path: string, headers: Record<string, string> = browserHeaders): Promise<Page> {
  const response = await fetch(`${baseUrl}${path}`, { headers });
  return { status: response.status, type: response.headers.get("content-type") ?? "", text: await response.text() };
}

/** The page must carry the link script, which points at the Plugin Manager. */
export function assertLinkInjected(page: Page, what: string) {
  assert.equal(page.status, 200, what);
  assert.match(page.type, /text\/html/, what);
  assert.match(page.text, /data-plugin-manager-link[^]*<\/script>\s*<\/body>/, `${what}: link script before </body>`);
  assert.match(page.text, /api\/v1\/plugin-manager\//, `${what}: points at the Plugin Manager`);
}

/** The injected script must at least be valid JavaScript (it is not run). */
export function assertScriptParses(page: Page) {
  const end = page.text.lastIndexOf("</script>");
  const start = page.text.lastIndexOf("<script>", end);
  const script = page.text.slice(start + "<script>".length, end);
  assert.match(script, /data-plugin-manager-link/, "injected script found");
  new Function(script);
}
