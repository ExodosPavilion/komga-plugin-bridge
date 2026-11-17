// The admin's side of the setup guide, done through Komga's address.
//   driver.ts key     claim Komga, create an API key, print it as the last line
//   driver.ts verify  approve and enable the plugin, add a library, wait for the plugin's metadata
import assert from "node:assert/strict";
import { writeSeries } from "../seam1/support/fixture-library.ts";
import {
  api,
  approveWaitingPlugins,
  createLibrary,
  seriesNamed,
  startedAndClaimed,
  waitFor,
} from "../seam1/support/komga.ts";

const manager = "/api/v1/plugin-manager/api";

if (Deno.args[0] === "key") {
  await startedAndClaimed();
  const response = await api("/api/v2/users/me/api-keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comment: "plugin host" }),
  });
  assert.ok(response.ok, `creating the API key failed: ${response.status}`);
  console.log((await response.json()).key);
} else if (Deno.args[0] === "verify") {
  await startedAndClaimed();
  await waitFor("the reference plugin to be listed", async () => {
    const list: { id: string }[] = await (await api(`${manager}/plugin-capabilities`)).json();
    return list.some((p) => p.id === "reference");
  });
  await approveWaitingPlugins(); // what the admin does in the Plugin Manager
  // The Plugin Host can use the API key: it reads Komga's libraries with it.
  const clashes = await api(`${manager}/plugin-clashes`);
  assert.equal(clashes.status, 200);
  const reason = (await clashes.json()).unavailable;
  assert.equal(reason, undefined, `the Plugin Host could not use the API key: ${reason}`);

  await writeSeries("/data", "Setup Series", {
    "plugin-metadata.json": JSON.stringify({ summary: "From the setup guide", publisher: "Guide Press" }),
  });
  await createLibrary("Setup", "/data");
  const series = await waitFor("the plugin's metadata", async () => {
    const found = await seriesNamed("Setup Series");
    return found?.metadata?.summary === "From the setup guide" && found;
  });
  assert.equal(series.metadata.publisher, "Guide Press");
  console.log("OK: the reference plugin's metadata appears after a scan");
} else {
  throw new Error("usage: driver.ts key|verify");
}
