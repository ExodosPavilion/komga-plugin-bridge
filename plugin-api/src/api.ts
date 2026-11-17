// The `api` object every hook receives as its second argument. Add a namespace by adding a field
// here and a file beside this one that defines it.
import type { KomgaApi } from "./komga.ts";
import type { PluginSettings } from "./settings.ts";
import type { PluginStorage } from "./storage.ts";

export interface PluginApi {
  settings: PluginSettings;
  storage: PluginStorage;
  komga: KomgaApi;
}
