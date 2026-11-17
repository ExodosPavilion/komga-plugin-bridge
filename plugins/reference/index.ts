// The reference plugin: reads a deliberately small custom metadata file beside a series and
// supplies it as series metadata. It is not meant for real use; it proves and tests the plugin
// system, and shows the shape of a plugin.
//
// A series folder may contain `plugin-metadata.json`:
//   { "summary": "...", "publisher": "...", "genres": ["...", "..."] }

const FILE = "plugin-metadata.json";

export default {
  /** Called when Komga scans or refreshes a series. `series.path` is the series folder. */
  async getSeriesMetadata({ series }: { series: { path: string } }) {
    let text: string;
    try {
      text = await Deno.readTextFile(`${series.path}/${FILE}`);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return null;
      throw error;
    }
    const { summary, publisher, genres } = JSON.parse(text);
    return { summary, publisher, genres };
  },
};
