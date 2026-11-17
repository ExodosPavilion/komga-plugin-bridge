// Fixture plugin: only reads the keys storage-a writes (and must never see them); reports what it
// finds as the series title.
export default {
  async getSeriesMetadata(_params: unknown, api: { storage: { get(k: string): Promise<unknown> } }) {
    return { title: `count=${await api.storage.get("count")} note=${await api.storage.get("note")}` };
  },
};
