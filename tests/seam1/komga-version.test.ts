import assert from "node:assert/strict";
import { KOMGA_URL, startedAndClaimed, waitFor } from "./support/komga.ts";

// Loading, not only behaviour (ADR-0003, Consequences): the Bridge is a Java agent on the system
// class path, which works only while the official image runs Komga the way it does today. If a
// Komga release repackaged itself, the Bridge would load but see none of Komga's classes, or not
// load at all. This test fails then, naming the cause, before the behaviour tests fail confusingly.
// EXPECTED_KOMGA_VERSION is the version the suite was started for (tests/seam1/run.sh).
const EXPECTED = Deno.env.get("EXPECTED_KOMGA_VERSION");

Deno.test("the Bridge loads into the Komga version under test and is active on it", async () => {
  assert.ok(EXPECTED, "EXPECTED_KOMGA_VERSION must be set (run through tests/seam1/run.sh)");
  await startedAndClaimed();

  const config = JSON.parse(await Deno.readTextFile(Deno.env.get("BRIDGE_CONFIG") ?? "/plugin-bridge/bridge.json"));
  const report = await waitFor(
    `an active Bridge report from Komga ${EXPECTED}`,
    async () => {
      const response = await fetch(`${config.pluginHostUrl}/api/bridge-status`, {
        headers: { Authorization: `Bearer ${config.secret}` },
      });
      const { reports } = await response.json();
      return reports.find((r: { komgaVersion: string | null; active: boolean }) => r.komgaVersion === EXPECTED && r.active);
    },
    120,
  );
  assert.equal(report.reason, null);
  // The supported list as the Bridge parsed it holds only version numbers: no comment text.
  assert.ok(report.supportedVersions.length > 0);
  for (const version of report.supportedVersions) assert.match(version, /^\d+(\.\d+)*$/);

  // The Bridge's own route is in Komga's web stack: answers 401 without the secret, ok with it.
  const bare = await fetch(`${KOMGA_URL}/plugin-bridge/host/ping`);
  await bare.body?.cancel();
  assert.equal(bare.status, 401);
  const authed = await fetch(`${KOMGA_URL}/plugin-bridge/host/ping`, {
    headers: { Authorization: `Bearer ${config.secret}` },
  });
  assert.match(await authed.text(), /"ok":\s*true/);
});
