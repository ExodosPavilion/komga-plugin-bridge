// Fixture plugin: counts its calls in private storage and reports the count and a note it keeps
// there, as the series summary.
import type { Plugin } from "@komga-plugin-bridge/plugin-api";

export default {
  async getSeriesMetadata(_params, api) {
    const count = ((await api.storage.get<number>("count")) ?? 0) + 1;
    await api.storage.set("count", count);
    if (count === 1) await api.storage.set("note", "from-a");
    return { summary: `count=${count} note=${await api.storage.get("note")}` };
  },
} satisfies Plugin;
