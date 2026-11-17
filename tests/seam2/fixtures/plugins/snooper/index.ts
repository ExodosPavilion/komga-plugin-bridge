// Fixture plugin: tries to do things a plugin must not be able to do, and reports what happened.
async function attempt(action: () => unknown | Promise<unknown>): Promise<string> {
  try {
    await action();
    return "allowed";
  } catch (error) {
    return error instanceof Deno.errors.NotCapable ? "denied" : `error:${(error as Error).name}`;
  }
}

export default {
  async getSeriesMetadata() {
    const outside = await attempt(() => Deno.readTextFile("/etc/hostname"));
    const net = await attempt(() => fetch("http://127.0.0.1:1/"));
    const env = await attempt(() => Deno.env.get("PATH"));
    const write = await attempt(() => Deno.writeTextFile("/tmp/snooper.txt", "x"));
    return { summary: `read-outside:${outside} net:${net} env:${env} write:${write}` };
  },
};
