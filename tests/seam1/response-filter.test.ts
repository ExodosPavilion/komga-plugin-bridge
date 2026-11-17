import assert from "node:assert/strict";
import { ADMIN, KOMGA_URL, startedAndClaimed, waitFor } from "./support/komga.ts";

// A fixture plugin ("me-filter") filters GET /api/v2/users/me. The bundled web UI is told apart
// from other clients by X-Requested-With: XMLHttpRequest plus the session cookie.
// The fixture announces the glob "/api/v2/users/*", so this also exercises the Bridge's side of the
// route rule (tests/fixtures/route-globs.json is the shared list of cases; seam 2 runs the Host's side).
const ME = `${KOMGA_URL}/api/v2/users/me`;
const basic = "Basic " + btoa(`${ADMIN.email}:${ADMIN.password}`);

async function sessionCookie(): Promise<string> {
  const response = await fetch(ME, { headers: { Authorization: basic } });
  await response.body?.cancel();
  const cookie = response.headers.getSetCookie().find((c) => c.startsWith("KOMGA-SESSION="));
  assert.ok(cookie, "Komga should open a session on login");
  return cookie.split(";")[0];
}

const get = (url: string, headers: Record<string, string>) => fetch(url, { headers });

Deno.test("a filter plugin changes what the bundled web UI receives, and only that", async () => {
  await startedAndClaimed();
  const cookie = await sessionCookie();
  const ui = { Cookie: cookie, "X-Requested-With": "XMLHttpRequest" };

  // The Bridge learns of the filter's routes within a few seconds.
  const filtered = await waitFor("the web UI request to be filtered", async () => {
    const response = await get(ME, ui);
    const body = await response.json();
    return body.filteredBy === "me-filter" && body;
  });
  assert.equal(filtered.email, ADMIN.email, "the rest of the response is Komga's own");

  // The same request from other clients is Komga's own response.
  const sessionOnly = await (await get(ME, { Cookie: cookie })).json();
  assert.equal(sessionOnly.filteredBy, undefined);
  const thirdParty = await (await get(ME, { Authorization: basic, "X-Requested-With": "XMLHttpRequest" })).json();
  assert.equal(thirdParty.filteredBy, undefined);
  const basicOnly = await (await get(ME, { Authorization: basic })).json();
  assert.equal(basicOnly.filteredBy, undefined);
});

Deno.test("a route no plugin filters is passed through byte for byte", async () => {
  await startedAndClaimed();
  const cookie = await sessionCookie();
  const url = `${KOMGA_URL}/api/v1/libraries`;
  const stock = await get(url, { Cookie: cookie });
  const viaUi = await get(url, { Cookie: cookie, "X-Requested-With": "XMLHttpRequest" });
  assert.equal(viaUi.status, stock.status);
  assert.equal(viaUi.headers.get("content-type"), stock.headers.get("content-type"));
  assert.deepEqual(new Uint8Array(await viaUi.arrayBuffer()), new Uint8Array(await stock.arrayBuffer()));
});
