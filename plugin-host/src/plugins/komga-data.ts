// Komga's data on behalf of plugins. The plugin asks (over its pipe to the host); the host checks
// the plugin's approved capabilities, then makes the real request to Komga's REST API with the
// admin API key. The key lives only in this object and in the request headers it builds.
import type { Config } from "../config.ts";
import type { CapabilityStore, KomgaCapability } from "./capabilities.ts";

interface Operation {
  capability: KomgaCapability;
  request(args: unknown[]): { method: string; path: string; body?: unknown };
}

const id = (value: unknown): string => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid id");
  return encodeURIComponent(value);
};

/** The Plugin API's `komga.*` calls. Add an operation here and it is capability-checked. */
const operations: Record<string, Operation> = {
  listLibraries: { capability: "komga:read", request: () => ({ method: "GET", path: "/api/v1/libraries" }) },
  getSeries: { capability: "komga:read", request: ([s]) => ({ method: "GET", path: `/api/v1/series/${id(s)}` }) },
  getBook: { capability: "komga:read", request: ([b]) => ({ method: "GET", path: `/api/v1/books/${id(b)}` }) },
  updateSeriesMetadata: {
    capability: "komga:write",
    request: ([s, patch]) => ({ method: "PATCH", path: `/api/v1/series/${id(s)}/metadata`, body: patch }),
  },
  updateBookMetadata: {
    capability: "komga:write",
    request: ([b, patch]) => ({ method: "PATCH", path: `/api/v1/books/${id(b)}/metadata`, body: patch }),
  },
};

export class KomgaData {
  constructor(private readonly config: Config, private readonly capabilities: CapabilityStore) {}

  /** Runs `komga.<operation>(...args)` for a plugin. Throws a message meant for the plugin author. */
  async call(pluginId: string, operation: string, args: unknown[]): Promise<unknown> {
    const op = Object.hasOwn(operations, operation) ? operations[operation] : undefined;
    if (!op) throw new Error(`komga.${operation} does not exist`);
    if (!this.capabilities.has(pluginId, op.capability)) {
      throw new Error(
        `plugin '${pluginId}' is missing the capability '${op.capability}' needed for komga.${operation}; ` +
          `declare it in manifest.json and have it approved`,
      );
    }
    if (!this.config.komgaUrl || !this.config.komgaApiKey) {
      throw new Error("Komga access is not configured on the Plugin Host (KOMGA_URL and KOMGA_API_KEY)");
    }
    const { method, path, body } = op.request(args);
    const response = await fetch(new URL(path, this.config.komgaUrl), {
      method,
      headers: {
        "X-API-Key": this.config.komgaApiKey,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Komga answered ${response.status} for komga.${operation}`);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
}
