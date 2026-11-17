// Fixture plugin: tries to read the file at series.path, to fetch the URL in series.name (if it
// is one) and to write next to series.path, and reports whether the runtime allowed each.
async function attempt(action: () => unknown | Promise<unknown>): Promise<string> {
  try {
    await action();
    return "allowed";
  } catch (error) {
    return error instanceof Deno.errors.NotCapable ? "denied" : `error:${(error as Error).name}`;
  }
}

export default {
  async getSeriesMetadata({ series }: { series: { path: string; name: string } }) {
    const read = await attempt(() => Deno.readTextFile(series.path));
    const write = await attempt(() => Deno.writeTextFile(series.path + ".written", "x"));
    const net = series.name.startsWith("http")
      ? await attempt(async () => (await fetch(series.name)).body?.cancel())
      : "skipped";
    return { summary: `read:${read} write:${write} net:${net}` };
  },
};
