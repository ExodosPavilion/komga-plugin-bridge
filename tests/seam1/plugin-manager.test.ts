import assert from "node:assert/strict";
import { ADMIN, api, KOMGA_URL, startedAndClaimed, waitFor } from "./support/komga.ts";

// The Plugin Manager is reached at Komga's address, under /api/v1/plugin-manager/, with Komga's
// own login. The reference plugin is installed by the compose file.
const MANAGER = "/api/v1/plugin-manager";
const USER = { email: "reader@example.org", password: "reader-password" };

const basic = (u: { email: string; password: string }) => "Basic " + btoa(`${u.email}:${u.password}`);

/** A request as the given user (null: anonymous). `ajax` adds the header the Plugin Manager page sends. */
async function as(
  user: { email: string; password: string } | null,
  path: string,
  init: RequestInit & { ajax?: boolean } = {},
): Promise<{ status: number; headers: Headers; text: string }> {
  const headers = new Headers(init.headers);
  if (user) headers.set("Authorization", basic(user));
  if (init.ajax) headers.set("X-Requested-With", "XMLHttpRequest");
  const response = await fetch(`${KOMGA_URL}${path}`, { ...init, headers, redirect: "manual" });
  return { status: response.status, headers: response.headers, text: await response.text() };
}

async function ensureNonAdmin() {
  const created = await api("/api/v2/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: USER.email, password: USER.password, roles: [] }),
  });
  await created.body?.cancel();
  assert.ok(created.ok || created.status === 400, `creating the user failed: ${created.status}`);
}

const post = (user: typeof ADMIN | null, path: string, body: unknown, ajax = true) =>
  as(user, path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), ajax });

Deno.test("an admin reaches the Plugin Manager at Komga's address with their normal login", async () => {
  await startedAndClaimed();
  const page = await as(ADMIN, `${MANAGER}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type")!, /text\/html/);
  assert.match(page.text, /Plugin Manager/);

  const withoutSlash = await as(ADMIN, MANAGER);
  assert.equal(withoutSlash.status, 302);
  assert.match(withoutSlash.headers.get("location")!, /\/api\/v1\/plugin-manager\/$/);

  const sections: string[] = JSON.parse((await as(ADMIN, `${MANAGER}/sections.json`)).text);
  assert.ok(sections.length >= 2);
  const script = await as(ADMIN, `${MANAGER}/app.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get("content-type")!, /javascript/);
});

Deno.test("a non-admin user and an anonymous request are refused", async () => {
  await startedAndClaimed();
  await ensureNonAdmin();
  for (const path of [`${MANAGER}/`, `${MANAGER}/api/plugins`, `${MANAGER}/app.js`, `${MANAGER}/sections.json`]) {
    assert.equal((await as(null, path)).status, 401, `anonymous ${path}`);
    assert.equal((await as(null, path, { ajax: true })).status, 401, `anonymous ajax ${path}`);
    const user = await as(USER, path);
    assert.equal(user.status, 403, `non-admin ${path}`);
    assert.doesNotMatch(user.text, /Plugin Manager|reference/);
  }
  // Changing things is refused too, and nothing changes.
  assert.equal((await post(USER, `${MANAGER}/api/plugins/disable`, { id: "reference" })).status, 403);
  assert.equal((await post(USER, `${MANAGER}/api/plugins/remove`, { id: "reference" })).status, 403);
  assert.equal((await post(null, `${MANAGER}/api/plugins/remove`, { id: "reference" })).status, 401);
  const list = JSON.parse((await as(ADMIN, `${MANAGER}/api/plugins`)).text);
  assert.equal(list.find((p: { id: string }) => p.id === "reference")?.enabled, true);
});

Deno.test("the plugins are listed, and an admin can disable and enable one", async () => {
  await startedAndClaimed();
  const list = async () =>
    JSON.parse((await as(ADMIN, `${MANAGER}/api/plugins`)).text) as {
      id: string;
      version: string;
      enabled: boolean;
      running: boolean;
    }[];
  const reference = (await list()).find((p) => p.id === "reference")!;
  assert.equal(reference.version, "0.1.0");
  assert.equal(reference.enabled, true);
  assert.equal(reference.running, true);

  try {
    // The page always sends X-Requested-With; a request without it cannot change anything.
    assert.equal((await post(ADMIN, `${MANAGER}/api/plugins/disable`, { id: "reference" }, false)).status, 403);
    assert.equal((await list()).find((p) => p.id === "reference")!.enabled, true);

    assert.equal((await post(ADMIN, `${MANAGER}/api/plugins/disable`, { id: "reference" })).status, 200);
    const disabled = (await list()).find((p) => p.id === "reference")!;
    assert.equal(disabled.enabled, false);
    assert.equal(disabled.running, false);
  } finally {
    assert.equal((await post(ADMIN, `${MANAGER}/api/plugins/enable`, { id: "reference" })).status, 200);
  }
  assert.equal((await list()).find((p) => p.id === "reference")!.running, true);

  const failures = await as(ADMIN, `${MANAGER}/api/failures?plugin=reference`);
  assert.equal(failures.status, 200);
  assert.ok(Array.isArray(JSON.parse(failures.text)));
});

Deno.test("the Plugin Manager shows that the Bridge is active", async () => {
  await startedAndClaimed();
  const status = await waitFor("the Bridge's status report", async () => {
    const { current } = JSON.parse((await as(ADMIN, `${MANAGER}/api/bridge-status`)).text);
    return current;
  });
  assert.equal(status.active, true);
  assert.match(status.komgaVersion, /^\d+\.\d+\.\d+/);
});
