// Fixture plugin: uses Komga's data through the Plugin API and reports what happened.
// The series name picks the operation: "read", "write", or "env" (tries to read the environment).
import type { Plugin } from "@komga-plugin-bridge/plugin-api";

export default {
  async getSeriesMetadata({ series }, api) {
    try {
      if (series.name === "env") {
        const key = Deno.env.get("KOMGA_API_KEY");
        return { summary: `env:${key ?? "unset"}` };
      }
      if (series.name === "read") {
        const found = await api.komga.getSeries(series.id);
        return { summary: `read:${found.name}` };
      }
      await api.komga.updateSeriesMetadata(series.id, { summary: "written by plugin" });
      return { summary: "wrote" };
    } catch (error) {
      return { summary: `error:${(error as Error).message}` };
    }
  },
} satisfies Plugin;
