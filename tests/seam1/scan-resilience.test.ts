// A scan never blocks or fails because of the plugin system. The Plugin Host's outage is staged
// by host-proxy (tests/seam1/support/outage-proxy.ts), which sits between Komga and the host.
import assert from "node:assert/strict";
import { writeSeries } from "./support/fixture-library.ts";
import { api, createLibrary, seriesNamed, startedAndClaimed, waitFor } from "./support/komga.ts";

const LIBRARY = "/data";
const PROXY = Deno.env.get("HOST_PROXY_URL") ?? "http://localhost:8081";

async function proxyMode(mode: "pass" | "down" | "blackhole") {
  const response = await fetch(`${PROXY}/mode/${mode}`, { method: "POST" });
  await response.body?.cancel();
  assert.equal(response.status, 200);
}

/** The fixture library, created on first use (the other seam 1 test file may have made it). */
async function libraryId(): Promise<string> {
  const libraries = await (await api("/api/v1/libraries")).json();
  const existing = libraries.find((l: { root: string }) => l.root === LIBRARY);
  return existing?.id ?? await createLibrary("Fixture", LIBRARY);
}

async function scan(id: string) {
  const response = await api(`/api/v1/libraries/${id}/scan`, { method: "POST" });
  await response.body?.cancel();
}

async function refreshMetadata(seriesId: string) {
  const response = await api(`/api/v1/series/${seriesId}/metadata/refresh`, { method: "POST" });
  await response.body?.cancel();
}

/** Waits until a scan has added the series with its book, whatever the plugins did. */
function scanned(name: string, seconds: number) {
  return waitFor(`${name} to be scanned`, async () => {
    const series = await seriesNamed(name);
    return series?.booksCount >= 1 && series;
  }, seconds);
}

const METADATA = (summary: string) => ({
  "plugin-metadata.json": JSON.stringify({ summary, publisher: "Resilience Press" }),
});

/** Refreshes until the plugin metadata arrives; early refreshes may fall in the Bridge's pause. */
function refreshedWith(name: string, summary: string) {
  return waitFor(`${name} to receive its plugin metadata`, async () => {
    const series = await seriesNamed(name);
    if (series?.metadata?.summary === summary) return series;
    if (series) await refreshMetadata(series.id);
    return false;
  }, 90);
}

Deno.test("a scan completes as stock Komga while the Plugin Host is stopped, and a refresh fills in later", async () => {
  await startedAndClaimed();
  const id = await libraryId();
  await proxyMode("down");
  try {
    await writeSeries(LIBRARY, "Outage Series", METADATA("Arrived after the outage"));
    await scan(id);

    const series = await scanned("Outage Series", 60);
    assert.equal(series.metadata.summary, "");
    assert.equal(series.metadata.publisher, "");
    // Komga itself is healthy and serves the book.
    const books = await (await api(`/api/v1/series/${series.id}/books`)).json();
    assert.equal(books.content.length, 1);
  } finally {
    await proxyMode("pass");
  }

  const filled = await refreshedWith("Outage Series", "Arrived after the outage");
  assert.equal(filled.metadata.publisher, "Resilience Press");
});

Deno.test("a scan completes within a bounded time while the Plugin Host stalls, and a refresh fills in later", async () => {
  await startedAndClaimed();
  const id = await libraryId();
  await proxyMode("blackhole");
  try {
    const names = ["Stall Series 1", "Stall Series 2", "Stall Series 3", "Stall Series 4"];
    for (const name of names) await writeSeries(LIBRARY, name, METADATA("Arrived after the stall"));
    const started = Date.now();
    await scan(id);
    for (const name of names) await scanned(name, 60);
    const seconds = (Date.now() - started) / 1000;
    // Four series at the 3 s Bridge limit each would be 12 s, plus the scan itself; the Bridge's
    // pause after the first failure keeps it well under that. Either way it is bounded.
    assert.ok(seconds < 45, `scan took ${seconds}s`);
    assert.equal((await seriesNamed(names[0])).metadata.summary, "");
  } finally {
    await proxyMode("pass");
  }
  await refreshedWith("Stall Series 1", "Arrived after the stall");
});

Deno.test("a plugin that exceeds the time limit does not hold up the scan", async () => {
  await startedAndClaimed();
  const id = await libraryId();
  await proxyMode("pass");
  const names = ["Slow Series 1", "Slow Series 2", "Slow Series 3"];
  for (const name of names) await writeSeries(LIBRARY, name, METADATA("From the other plugin"));
  const started = Date.now();
  await scan(id);
  // The slow plugin hangs on every one of these; the host cuts it off at its 2 s limit and the
  // reference plugin's answer still arrives.
  for (const name of names) await refreshedWith(name, "From the other plugin");
  const seconds = (Date.now() - started) / 1000;
  assert.ok(seconds < 60, `scan took ${seconds}s`);
});
