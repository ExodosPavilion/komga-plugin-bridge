// Fixture plugin: records every event it receives in its private storage and reports the record
// as the series summary, so a test can read it back through the Bridge's metadata call.
type Api = { storage: { get(k: string): Promise<unknown>; set(k: string, v: unknown): Promise<void> } };

export default {
  async onEvent(event: unknown, api: Api) {
    const seen = ((await api.storage.get("events")) as unknown[] | null) ?? [];
    await api.storage.set("events", [...seen, event]);
  },
  async getSeriesMetadata(_params: unknown, api: Api) {
    return { summary: JSON.stringify((await api.storage.get("events")) ?? []) };
  },
};
