import { configFromEnv } from "./config.ts";
import { startPluginHost } from "./host.ts";

const host = await startPluginHost(configFromEnv());
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  Deno.addSignalListener(signal, async () => {
    await host.stop();
    Deno.exit(0);
  });
}
