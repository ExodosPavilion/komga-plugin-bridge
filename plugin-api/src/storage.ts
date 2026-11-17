// Private storage: state that persists between runs, visible to this plugin only.

/** Any value that survives a round trip through JSON: what {@link PluginStorage} keeps. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * What `api.storage` offers a hook: a key-value store private to this plugin, kept in the Plugin
 * Host's own database and surviving restarts. No other plugin can read or change it.
 */
export interface PluginStorage {
  /** The stored value, or null when the key is not set. */
  get<T extends JsonValue = JsonValue>(key: string): Promise<T | null>;
  /** Stores a value under the key, replacing any value already there. */
  set(key: string, value: JsonValue): Promise<void>;
  /** Removes the key and its value. Removing a key that is not set does nothing. */
  delete(key: string): Promise<void>;
  /** Every key that is set, in sorted order. */
  keys(): Promise<string[]>;
}
