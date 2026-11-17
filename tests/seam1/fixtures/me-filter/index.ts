// Fixture filter plugin: marks the current-user response, so a test can see who got it filtered.
export default {
  filterResponse({ body }: { body: Record<string, unknown> }) {
    return { ...body, filteredBy: "me-filter" };
  },
};
