// Places the Bridge in the volume shared with Komga, with the details it needs to call back.
//
// The shared secret is generated at first start and kept in the host's own data directory; the
// Bridge reads it from `bridge.json` beside the jar. Nothing needs configuring by the admin.
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Config } from "../config.ts";

export interface BridgeConnection {
  secret: string;
}

export async function installBridge(config: Config): Promise<BridgeConnection> {
  const secret = await loadOrCreateSecret(join(config.dataDir, "bridge-secret"));
  await mkdir(config.bridgeDir, { recursive: true });

  // Write beside the target and rename, so Komga never sees a half-written file.
  const jarTmp = join(config.bridgeDir, ".bridge.jar.tmp");
  await copyFile(config.bridgeJar, jarTmp);
  await rename(jarTmp, join(config.bridgeDir, "bridge.jar"));

  const connection = {
    pluginHostUrl: config.hostUrl,
    secret,
    // The Bridge gives up a little after the host would have, so the host's own limit decides.
    timeoutMillis: config.callTimeoutMs + 2000,
  };
  const jsonTmp = join(config.bridgeDir, ".bridge.json.tmp");
  await writeFile(jsonTmp, JSON.stringify(connection, null, 2) + "\n", { mode: 0o644 });
  await rename(jsonTmp, join(config.bridgeDir, "bridge.json"));
  return { secret };
}

async function loadOrCreateSecret(file: string): Promise<string> {
  try {
    const existing = (await readFile(file, "utf8")).trim();
    if (existing) return existing;
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") throw error;
  }
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const secret = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, secret + "\n", { mode: 0o600 });
  return secret;
}
