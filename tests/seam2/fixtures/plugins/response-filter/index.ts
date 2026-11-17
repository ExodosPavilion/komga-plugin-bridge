// Fixture filter plugin: hides libraries named "Hidden"; marks any single object it filters.
import type { JsonValue, Plugin } from "@komga-plugin-bridge/plugin-api";

export default {
  filterResponse({ request, body }) {
    if (Array.isArray(body)) {
      return body.filter((item) => (item as { name?: JsonValue } | null)?.name !== "Hidden");
    }
    if (body && typeof body === "object") {
      return { ...body, filteredBy: "response-filter", path: request.path };
    }
    return null;
  },
} satisfies Plugin;
