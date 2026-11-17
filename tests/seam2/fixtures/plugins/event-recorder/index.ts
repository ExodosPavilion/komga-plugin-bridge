// Fixture plugin: records every event it receives in its private storage and reports the record
// as the series summary, so a test can read it back through the Bridge's metadata call.
import type { JsonValue, Plugin } from "@komga-plugin-bridge/plugin-api";

export default {
  async onEvent(event, api) {
    const seen = (await api.storage.get<JsonValue[]>("events")) ?? [];
    await api.storage.set("events", [...seen, event as unknown as JsonValue]);
  },
  async getSeriesMetadata(_params, api) {
    return { summary: JSON.stringify((await api.storage.get("events")) ?? []) };
  },
} satisfies Plugin;
