import assert from "node:assert/strict";
import { startedAndClaimed, KOMGA_URL } from "./support/komga.ts";

// The Plugin Host's calls into the Bridge arrive at Komga's address under /plugin-bridge/host/.
// The test stands in for the Plugin Host, using the secret from the shared volume.
const PING = `${KOMGA_URL}/plugin-bridge/host/ping`;

async function ping(authorization?: string): Promise<number> {
  const response = await fetch(PING, { headers: authorization ? { Authorization: authorization } : {} });
  await response.body?.cancel();
  return response.status;
}

Deno.test("the Bridge refuses Plugin Host calls without the shared secret and accepts them with it", async () => {
  await startedAndClaimed();
  const { secret } = JSON.parse(await Deno.readTextFile(Deno.env.get("BRIDGE_CONFIG")!));
  assert.match(secret, /^[0-9a-f]{64}$/);

  assert.equal(await ping(), 401);
  assert.equal(await ping("Bearer wrong"), 401);
  assert.equal(await ping(`Bearer ${secret.replace(/.$/, secret.endsWith("0") ? "1" : "0")}`), 401);
  assert.equal(await ping(secret), 401, "the scheme is required");
  assert.equal(await ping(`Bearer ${secret}`), 200);
});
