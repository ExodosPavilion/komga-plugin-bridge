import assert from "node:assert/strict";
import { writeSeries } from "./support/fixture-library.ts";
import { ADMIN, startedAndClaimed, waitFor } from "./support/komga.ts";

// A second Komga, started with the Bridge's supported list replaced by one the real version is
// not on (see compose.yaml), stands in for "Komga was upgraded to an unverified version".
const UNSUPPORTED_URL = Deno.env.get("KOMGA_UNSUPPORTED_URL") ?? "http://localhost:25601";
const auth = "Basic " + btoa(`${ADMIN.email}:${ADMIN.password}`);
const LIBRARY = "/data";

const unsupported = (path: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set("Authorization", auth);
  return fetch(`${UNSUPPORTED_URL}${path}`, { ...init, headers });
};

async function bridgeStatus() {
  const config = JSON.parse(await Deno.readTextFile("/plugin-bridge/bridge.json"));
  const response = await fetch(`${config.pluginHostUrl}/api/bridge-status`, {
    headers: { Authorization: `Bearer ${config.secret}` },
  });
  return await response.json();
}

Deno.test("on an unsupported Komga version the Bridge is inactive, Komga is stock, and the reason is reported", async () => {
  await startedAndClaimed(); // the supported Komga
  await waitFor("the unsupported Komga to start", async () => {
    const response = await fetch(`${UNSUPPORTED_URL}/api/v1/claim`);
    await response.body?.cancel();
    return response.ok;
  });
  const claim = await fetch(`${UNSUPPORTED_URL}/api/v1/claim`, {
    method: "POST",
    headers: { "X-Komga-Email": ADMIN.email, "X-Komga-Password": ADMIN.password },
  });
  await claim.body?.cancel();

  await writeSeries(LIBRARY, "Gate Series", {
    "plugin-metadata.json": JSON.stringify({ summary: "Must not appear", publisher: "Nobody" }),
  });
  const created = await unsupported("/api/v1/libraries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Gate", root: LIBRARY }),
  });
  await created.body?.cancel();
  assert.ok(created.ok, `creating library: ${created.status}`);

  // Komga scans and serves the series as stock Komga: nothing from the plugin.
  const series = await waitFor("the series on the unsupported Komga", async () => {
    const page = await (await unsupported("/api/v1/series?size=100")).json();
    return page.content?.find((s: { name: string }) => s.name === "Gate Series");
  });
  assert.equal(series.metadata.summary, "");
  assert.equal(series.metadata.publisher, "");

  // The inactive state and its reason reach the Plugin Host.
  const reports = await waitFor("the inactive report", async () => {
    const { reports } = await bridgeStatus();
    return reports.some((r: { active: boolean }) => !r.active) && reports;
  });
  const inactive = reports.find((r: { active: boolean }) => !r.active);
  assert.match(inactive.reason, /not on the Bridge's supported list/);
  assert.match(inactive.reason, /9\.9\.9/);
  assert.match(inactive.komgaVersion, /^\d+\.\d+\.\d+/);
  // Every Bridge auto-configuration is off, including the Plugin Host call gate. On the supported
  // Komga this route answers 401 without the secret and {"ok":true} with it; here Komga treats it
  // as any unknown path (its web UI answers), so neither happens.
  const config = JSON.parse(await Deno.readTextFile("/plugin-bridge/bridge.json"));
  const bare = await fetch(`${UNSUPPORTED_URL}/plugin-bridge/host/ping`);
  assert.notEqual(bare.status, 401);
  await bare.body?.cancel();
  const authed = await fetch(`${UNSUPPORTED_URL}/plugin-bridge/host/ping`, {
    headers: { Authorization: `Bearer ${config.secret}` },
  });
  assert.doesNotMatch(await authed.text(), /"ok":\s*true/);

  // Response filtering is gated too: the me-filter plugin is installed, and on the supported Komga
  // it changes what the web UI receives, but here a web-UI-style request gets Komga's own data.
  const me = await unsupported("/api/v2/users/me");
  await me.body?.cancel();
  const cookie = me.headers.getSetCookie().find((c) => c.startsWith("KOMGA-SESSION="))?.split(";")[0];
  assert.ok(cookie, "Komga should open a session on login");
  await new Promise((resolve) => setTimeout(resolve, 6000)); // longer than the Bridge needs to learn filter routes
  const asWebUi = await fetch(`${UNSUPPORTED_URL}/api/v2/users/me`, {
    headers: { Cookie: cookie, "X-Requested-With": "XMLHttpRequest" },
  });
  const stockMe = await asWebUi.json();
  assert.equal(stockMe.email, ADMIN.email);
  assert.equal(stockMe.filteredBy, undefined);

  // The supported Komga reported itself active.
  assert.ok(reports.some((r: { active: boolean }) => r.active));
});
