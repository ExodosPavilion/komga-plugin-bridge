// Fixture plugin: uses Komga's data through the Plugin API and reports what happened.
// The series name picks the operation: "read", "write", or "env" (tries to read the environment).
export default {
  async getSeriesMetadata(
    { series }: { series: { id: string; name: string } },
    api: { komga: Record<string, (...args: unknown[]) => Promise<unknown>> },
  ) {
    try {
      if (series.name === "env") {
        const key = Deno.env.get("KOMGA_API_KEY");
        return { summary: `env:${key ?? "unset"}` };
      }
      if (series.name === "read") {
        const found = await api.komga.getSeries(series.id) as { name: string };
        return { summary: `read:${found.name}` };
      }
      await api.komga.updateSeriesMetadata(series.id, { summary: "written by plugin" });
      return { summary: "wrote" };
    } catch (error) {
      return { summary: `error:${(error as Error).message}` };
    }
  },
};
