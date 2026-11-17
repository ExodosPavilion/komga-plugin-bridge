// Fixture plugin: reports the settings it sees through the Plugin API as the series summary.
export default {
  async getSeriesMetadata(_params: unknown, api: { settings: { all(): Promise<unknown> } }) {
    return { summary: JSON.stringify(await api.settings.all()) };
  },
};
