// Your plugin. Import types only (`import type`): nothing from the Plugin API package is loaded
// when the plugin runs. Hooks are optional; `satisfies Plugin` type-checks them.
import type { Plugin } from "@komga-plugin-bridge/plugin-api";

export default {
  /** Called when Komga scans or refreshes a series. Return null when you have nothing. */
  getSeriesMetadata() {
    return { summary: "Hello from the template plugin" };
  },
} satisfies Plugin;
