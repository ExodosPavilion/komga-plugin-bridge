// Fixture filter plugin: marks the current-user response, so a test can see who got it filtered.
import type { Plugin } from "@komga-plugin-bridge/plugin-api";

export default {
  filterResponse({ body }) {
    return { ...(body as Record<string, never>), filteredBy: "me-filter" };
  },
} satisfies Plugin;
