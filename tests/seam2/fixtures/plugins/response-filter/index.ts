// Fixture filter plugin: hides libraries named "Hidden"; marks any single object it filters.
export default {
  filterResponse({ request, body }: { request: { path: string }; body: unknown }) {
    if (Array.isArray(body)) return body.filter((item) => item?.name !== "Hidden");
    if (body && typeof body === "object") {
      return { ...(body as object), filteredBy: "response-filter", path: request.path };
    }
    return null;
  },
};
