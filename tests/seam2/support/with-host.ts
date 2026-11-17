// Runs a test body against a started test host and a stand-in Bridge speaking to it, and cleans up
// after, whether the body passes or throws. Test files with a different shape of call (a plugin
// list instead of options, say) wrap this.
import { startTestHost, type TestHost, type TestHostOptions } from "./host.ts";
import { FakeBridge } from "./fake-bridge.ts";

export async function withHost(
  options: TestHostOptions,
  body: (host: TestHost, bridge: FakeBridge) => Promise<void>,
): Promise<void> {
  const host = await startTestHost({ callTimeoutMs: 3000, ...options });
  try {
    await body(host, new FakeBridge(await host.bridgeConfig(), host.url));
  } finally {
    await host.dispose();
  }
}
