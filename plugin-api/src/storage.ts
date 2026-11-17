// Private storage: state that persists between runs, visible to this plugin only.

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** What `api.storage` offers a hook. */
export interface PluginStorage {
  /** The stored value, or null when the key is not set. */
  get<T extends JsonValue = JsonValue>(key: string): Promise<T | null>;
  set(key: string, value: JsonValue): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}
