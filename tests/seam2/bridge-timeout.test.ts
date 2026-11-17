import assert from "node:assert/strict";
import { startTestHost } from "./support/host.ts";

Deno.test("the Bridge's time limit defaults to the plugin call limit plus two seconds", async () => {
  const host = await startTestHost({ callTimeoutMs: 3000 });
  try {
    assert.equal((await host.bridgeConfig()).timeoutMillis, 5000);
  } finally {
    await host.dispose();
  }
});

Deno.test("the Bridge's time limit can be configured", async () => {
  const host = await startTestHost({ callTimeoutMs: 3000, bridgeTimeoutMs: 1234 });
  try {
    assert.equal((await host.bridgeConfig()).timeoutMillis, 1234);
  } finally {
    await host.dispose();
  }
});
