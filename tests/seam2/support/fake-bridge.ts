// Stand-in for the Bridge: speaks the Bridge's side of the Plugin Host's HTTP interface, using
// the shared secret the way the real Bridge reads it from the shared volume.
import type { BridgeConfigFile } from "./host.ts";

export interface SeriesRequest {
  id: string;
  name: string;
  path: string;
  libraryId: string;
}

export interface BookRequest {
  id: string;
  name: string;
  path: string;
  seriesId: string;
  libraryId: string;
}

export class FakeBridge {
  constructor(private readonly config: BridgeConfigFile, private readonly baseUrl: string) {}

  /** A request with the right secret, or with `secret` replaced (null sends no secret at all). */
  request(path: string, init: RequestInit = {}, secret: string | null = this.config.secret) {
    const headers = new Headers(init.headers);
    if (secret !== null) headers.set("Authorization", `Bearer ${secret}`);
    return fetch(`${this.baseUrl}${path}`, { ...init, headers });
  }

  async seriesMetadata(series: SeriesRequest, secret?: string | null) {
    const response = await this.request("/bridge/series-metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ series }),
    }, secret);
    return { status: response.status, body: await response.json().catch(() => null) };
  }

  async bookMetadata(book: BookRequest, secret?: string | null) {
    const response = await this.request("/bridge/book-metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ book }),
    }, secret);
    return { status: response.status, body: await response.json().catch(() => null) };
  }

  /** Forwards a Komga event, as the Bridge does. */
  async event(type: string, data: Record<string, unknown> = {}, secret?: string | null) {
    const response = await this.request("/bridge/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, data }),
    }, secret);
    return { status: response.status, body: await response.json().catch(() => null) };
  }

  async pluginSettings(pluginId: string) {
    const response = await this.request(`/api/plugin-settings?plugin=${encodeURIComponent(pluginId)}`);
    return { status: response.status, body: await response.json().catch(() => null) };
  }

  async saveSettings(pluginId: string, values: Record<string, unknown>) {
    const response = await this.request("/api/plugin-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plugin: pluginId, values }),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  }

  /** Status of a request whose body is not needed. */
  async status(path: string, secret?: string | null): Promise<number> {
    const response = await this.request(path, {}, secret);
    await response.body?.cancel();
    return response.status;
  }

  async failures(plugin: string): Promise<{ plugin: string; at: string; kind: string; reason: string }[]> {
    const response = await this.request(`/api/failures?plugin=${encodeURIComponent(plugin)}`);
    return await response.json();
  }

  async enable(id: string) {
    const response = await this.request("/api/plugins/enable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await response.body?.cancel();
    return { status: response.status };
  }

  async plugins(): Promise<
    {
      id: string;
      version: string;
      enabled: boolean;
      running: boolean;
      pid: number | null;
      autoDisabled?: boolean;
      capabilities: { capability: string; granted: boolean }[];
    }[]
  > {
    const response = await this.request("/api/plugins");
    return await response.json();
  }
}

export const book = (path: string, name = "Book"): BookRequest => ({
  id: "0TESTBOOK",
  name,
  path,
  seriesId: "0TESTSERIES",
  libraryId: "0TESTLIB",
});

export const series = (path: string, name = "Series"): SeriesRequest => ({
  id: "0TESTSERIES",
  name,
  path,
  libraryId: "0TESTLIB",
});
