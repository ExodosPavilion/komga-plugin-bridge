// Fixture plugin: counts its calls in private storage and reports the count and a note it keeps
// there, as the series summary.
type Storage = { get(k: string): Promise<unknown>; set(k: string, v: unknown): Promise<void> };
export default {
  async getSeriesMetadata(_params: unknown, api: { storage: Storage }) {
    const count = (((await api.storage.get("count")) as number | null) ?? 0) + 1;
    await api.storage.set("count", count);
    if (count === 1) await api.storage.set("note", "from-a");
    return { summary: `count=${count} note=${await api.storage.get("note")}` };
  },
};
