// The `api` object every hook receives as its second argument. Add a namespace by adding a field
// here and a file beside this one that defines it.
import type { KomgaApi } from "./komga.ts";
import type { PluginSettings } from "./settings.ts";
import type { PluginStorage } from "./storage.ts";

/** The object every hook receives as its second argument: the plugin's way to reach anything. */
export interface PluginApi {
  /** The plugin's settings, as the admin set them in the Plugin Manager. */
  settings: PluginSettings;
  /** Storage private to this plugin, kept between runs. */
  storage: PluginStorage;
  /** Komga's data, read and written through the Plugin Host, checked against the plugin's capabilities. */
  komga: KomgaApi;
}
