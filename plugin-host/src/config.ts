// Plugin Host configuration. Everything comes from environment variables so the image needs no
// config file. Add new settings here as optional fields with defaults.
export interface Config {
  /** Port the HTTP interface listens on. 0 picks a free port (tests). */
  port: number;
  /** The host's own volume: its SQLite database and generated secret. Never Komga's. */
  dataDir: string;
  /** Folder an admin drops plugin folders into. */
  pluginsDir: string;
  /** Volume shared with Komga; the Bridge jar and its connection details are placed here. */
  bridgeDir: string;
  /** The Bridge jar carried by this image. */
  bridgeJar: string;
  /** Library folders, mounted read-only at the same paths as in Komga. Plugins may read these. */
  libraryRoots: string[];
  /** Time limit for one call to a plugin. */
  callTimeoutMs: number;
  /**
   * Time limit for each scan-time call from the Bridge, written into bridge.json. Default: the
   * plugin call limit plus two seconds, so the host's own limit normally decides.
   */
  bridgeTimeoutMs?: number;
  /** Consecutive failures after which a plugin is disabled automatically. */
  failureThreshold: number;
  /** The address the Bridge uses to reach this host, from inside Komga's container. */
  hostUrl: string;
  /** Komga's REST API, used on behalf of plugins. Optional until a plugin needs it. */
  komgaUrl?: string;
  komgaApiKey?: string;
  /** GitHub's REST API, used to list a repository's releases. Tests point it at a fake. */
  githubApiUrl?: string;
  /** The Deno executable used to start plugin processes. */
  denoPath: string;
}

export function configFromEnv(env: Record<string, string | undefined> = Deno.env.toObject()): Config {
  const list = (value: string | undefined, fallback: string[]) =>
    value ? value.split(",").map((s) => s.trim()).filter(Boolean) : fallback;
  return {
    port: Number(env.PLUGIN_HOST_PORT ?? 8080),
    dataDir: env.PLUGIN_HOST_DATA_DIR ?? "/state",
    pluginsDir: env.PLUGIN_HOST_PLUGINS_DIR ?? "/plugins",
    bridgeDir: env.PLUGIN_HOST_BRIDGE_DIR ?? "/plugin-bridge",
    bridgeJar: env.PLUGIN_HOST_BRIDGE_JAR ?? "/opt/bridge/bridge.jar",
    libraryRoots: list(env.PLUGIN_HOST_LIBRARY_ROOTS, ["/data"]),
    callTimeoutMs: Number(env.PLUGIN_HOST_CALL_TIMEOUT_MS ?? 8000),
    bridgeTimeoutMs: env.PLUGIN_HOST_BRIDGE_TIMEOUT_MS
      ? Number(env.PLUGIN_HOST_BRIDGE_TIMEOUT_MS)
      : undefined,
    failureThreshold: Number(env.PLUGIN_HOST_FAILURE_THRESHOLD ?? 3),
    hostUrl: env.PLUGIN_HOST_URL ?? "http://plugin-host:8080",
    komgaUrl: env.KOMGA_URL || undefined,
    komgaApiKey: env.KOMGA_API_KEY || undefined,
    githubApiUrl: env.PLUGIN_HOST_GITHUB_API_URL || undefined,
    denoPath: Deno.execPath(),
  };
}
