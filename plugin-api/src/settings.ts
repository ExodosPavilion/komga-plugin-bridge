// Settings: declared as fields in the manifest, edited by the admin, read by the plugin.

/** A setting's value: its type is the `type` of its {@link SettingField} in the manifest. */
export type SettingValue = string | number | boolean;

/** What `api.settings` offers a hook. Defaults from the manifest apply when nothing is set. */
export interface PluginSettings {
  /** Every setting that has a value (or a default), by name. */
  all(): Promise<Record<string, SettingValue>>;
  /** One setting, or null when it has neither a value nor a default. */
  get(name: string): Promise<SettingValue | null>;
}
