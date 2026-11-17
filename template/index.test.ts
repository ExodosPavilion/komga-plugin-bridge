// Tests for your plugin, run with `deno task test`. The runner loads the plugin into a real
// Plugin Host against stand-ins for Komga, so nothing else needs to be installed.
import assert from "node:assert/strict";
import { runPlugin } from "@komga-plugin-bridge/test-runner";

Deno.test("the plugin supplies series metadata", async () => {
  const run = await runPlugin(".");
  try {
    const metadata = await run.seriesMetadata({ path: `${run.library}/Some Series` });
    assert.equal(metadata?.summary, "Hello from the template plugin");
  } finally {
    await run.dispose();
  }
});

// More things to try:
//   runPlugin(".", { settings: { name: "value" } })   settings declared in manifest.json
//   runPlugin(".", { library: { "Series/info.json": "{}" } })   files the plugin reads (needs file-read:*)
//   runPlugin(".", { komga: true })                    a stand-in Komga for api.komga calls
//   await run.event("LibraryScanned", { ... })         events the plugin subscribed to
//   await run.bookMetadata({ path })  await run.saveSettings({ ... })  await run.failures()
