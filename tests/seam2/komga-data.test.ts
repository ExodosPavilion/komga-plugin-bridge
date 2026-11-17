import assert from "node:assert/strict";
import { startTestHost } from "./support/host.ts";
import { FakeBridge, series } from "./support/fake-bridge.ts";
import { startFakeKomga } from "./support/fake-komga.ts";

async function withKomga(
  plugins: string[],
  body: (bridge: FakeBridge, komga: ReturnType<typeof startFakeKomga>) => Promise<void>,
) {
  const komga = startFakeKomga();
  const host = await startTestHost({ plugins, komgaUrl: komga.url, komgaApiKey: komga.apiKey, callTimeoutMs: 3000 });
  try {
    await body(new FakeBridge(await host.bridgeConfig(), host.url), komga);
  } finally {
    await host.dispose();
    await komga.stop();
  }
}

const summaryFor = async (bridge: FakeBridge, name: string) =>
  (await bridge.seriesMetadata({ ...series("/x"), name })).body.metadata.summary;

Deno.test("a plugin with the read capability can read Komga's data", () =>
  withKomga(["komga-reader"], async (bridge, komga) => {
    assert.equal(await summaryFor(bridge, "read"), "read:Fake series");
    const call = komga.requests.find((r) => r.path === "/api/v1/series/0TESTSERIES");
    assert.equal(call?.apiKey, komga.apiKey, "the host calls Komga with the API key");
  }));

Deno.test("without the read capability the call is refused, naming the capability", () =>
  withKomga(["komga-none"], async (bridge, komga) => {
    assert.match(await summaryFor(bridge, "read"), /^error:.*komga:read/);
    assert.equal(komga.requests.length, 0, "nothing reached Komga");
  }));

Deno.test("writing metadata requires the write capability", () =>
  withKomga(["komga-reader"], async (bridge, komga) => {
    assert.match(await summaryFor(bridge, "write"), /^error:.*komga:write/);
    assert.equal(komga.requests.filter((r) => r.method === "PATCH").length, 0);
  }));

Deno.test("a plugin with the write capability writes metadata through the host", () =>
  withKomga(["komga-writer"], async (bridge, komga) => {
    assert.equal(await summaryFor(bridge, "write"), "wrote");
    const patch = komga.requests.find((r) => r.method === "PATCH");
    assert.equal(patch?.path, "/api/v1/series/0TESTSERIES/metadata");
    assert.deepEqual(patch?.body, { summary: "written by plugin" });
  }));

Deno.test("the API key is never exposed to a plugin or in any response", () =>
  withKomga(["komga-writer"], async (bridge, komga) => {
    const texts = [
      JSON.stringify(await bridge.plugins()),
      JSON.stringify((await bridge.seriesMetadata({ ...series("/x"), name: "read" })).body),
      JSON.stringify((await bridge.seriesMetadata({ ...series("/x"), name: "write" })).body),
      // The plugin tries to read the key from its environment: it is denied, so it reports an error.
      await summaryFor(bridge, "env"),
    ];
    for (const text of texts) assert.ok(!text.includes(komga.apiKey), text);
    assert.match(texts[3], /^error:/);
  }));

Deno.test("when Komga is not configured a data call fails clearly", async () => {
  const host = await startTestHost({ plugins: ["komga-reader"], callTimeoutMs: 3000 });
  try {
    const bridge = new FakeBridge(await host.bridgeConfig(), host.url);
    assert.match(await summaryFor(bridge, "read"), /^error:.*not configured/);
  } finally {
    await host.dispose();
  }
});
