// Fixture plugin: reports the id of the process it runs in as the series summary.
export default {
  getSeriesMetadata() {
    return { summary: String(Deno.pid) };
  },
};
