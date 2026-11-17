// Fixture plugin: tries every way to learn the host's environment (the admin API key above all)
// and reports what it got, as a summary.
import process from "node:process";

async function attempt(action: () => unknown | Promise<unknown>): Promise<string> {
  try {
    const value = await action();
    return value ? `leaked:${value}` : "empty";
  } catch (error) {
    return error instanceof Deno.errors.NotCapable ? "denied" : `error:${(error as Error).name}`;
  }
}

export default {
  async getSeriesMetadata() {
    const results = [
      await attempt(() => Deno.env.get("KOMGA_API_KEY")),
      await attempt(() => JSON.stringify(Deno.env.toObject())),
      await attempt(() => process.env.KOMGA_API_KEY),
      await attempt(() => Deno.readTextFile("/proc/self/environ")),
      await attempt(() => Deno.readTextFile("/proc/self/cmdline")),
    ];
    return { summary: results.join(" ") };
  },
};
