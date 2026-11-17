// Fixture plugin: only reads the keys storage-a writes (and must never see them); reports what it
// finds as the series title.
import type { Plugin } from "@komga-plugin-bridge/plugin-api";

export default {
  async getSeriesMetadata(_params, api) {
    return { title: `count=${await api.storage.get("count")} note=${await api.storage.get("note")}` };
  },
} satisfies Plugin;
