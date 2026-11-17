// Fixture plugin: reports the settings it sees through the Plugin API as the series summary.
import type { Plugin } from "@komga-plugin-bridge/plugin-api";

export default {
  async getSeriesMetadata(_params, api) {
    return { summary: JSON.stringify(await api.settings.all()) };
  },
} satisfies Plugin;
