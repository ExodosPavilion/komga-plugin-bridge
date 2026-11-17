// The shape of a plugin's manifest.json, for authors who want to check or generate one.
import type { KomgaEventType } from "./events.ts";
import type { SettingValue } from "./settings.ts";

/**
 * Something a plugin may do, which the admin approves before the plugin runs:
 * "network", "komga:read", "komga:write", "file-read:<library folder>" or "file-read:*".
 * File access applies only in the libraries the plugin is enabled in.
 */
export type Capability = string;

/** One setting the plugin declares. The Plugin Manager builds the settings form from these. */
export interface SettingField {
  /** The setting's name, as the plugin reads it with `api.settings.get(name)`. */
  name: string;
  /** The type of value the setting holds. A saved value of another type is refused. */
  type: "string" | "number" | "boolean";
  /** The value the plugin reads while the admin has set none. */
  default?: SettingValue;
  /** Help text shown under the setting in the Plugin Manager. */
  help?: string;
  /** Secret values are hidden after they are saved. */
  secret?: boolean;
}

/** Subscribes the plugin to Komga events, which reach its {@link EventHooks.onEvent} hook. */
export interface EventsContribution {
  /** Marks this contribution as an event subscription. */
  type: "events";
  /** The event types the plugin receives. Other events never reach it. */
  subscribe: KomgaEventType[];
}

/** Declares the Komga API routes whose responses the plugin filters (see {@link FilterHooks}). */
export interface ResponseFilterContribution {
  /** Marks this contribution as response filtering. */
  type: "response-filter";
  /** Komga API paths: `*` is one path segment, `**` anything. */
  routes: string[];
}

/**
 * Declares a plugin that supplies series or book metadata. The Plugin Manager uses it to warn
 * when a library also has one of Komga's built-in importers switched on.
 */
export interface MetadataContribution {
  /** Marks this contribution as metadata. */
  type: "metadata";
}

/** One thing the plugin adds to Komga, as declared in its manifest. */
export type Contribution = EventsContribution | ResponseFilterContribution | MetadataContribution;

/**
 * A plugin's `manifest.json`. The Plugin Host refuses a plugin whose manifest is invalid or names
 * an unsupported {@link PluginApiVersion}.
 *
 * ```json
 * {
 *   "id": "my-plugin",
 *   "version": "0.1.0",
 *   "apiVersion": "1",
 *   "capabilities": ["komga:read"],
 *   "contributions": [{ "type": "metadata" }],
 *   "settings": [{ "name": "publisher", "type": "string", "help": "Publisher to supply" }]
 * }
 * ```
 */
export interface PluginManifest {
  /** The plugin's id: unique, starting with a letter or digit, then letters, digits, ".", "_" or "-". */
  id: string;
  /** The plugin's own version, for example "0.1.0". */
  version: string;
  /** The Plugin API version this plugin targets: see PluginApiVersion. */
  apiVersion: PluginApiVersion;
  /** The module to load, relative to the archive root. Defaults to "index.ts". */
  entry?: string;
  /** What the plugin needs to do. Nothing runs until the admin approves all of them. */
  capabilities?: Capability[];
  /** What the plugin adds to Komga. */
  contributions?: Contribution[];
  /** The settings the admin can edit in the Plugin Manager. */
  settings?: SettingField[];
}

/** The Plugin API versions this package describes. A manifest names exactly one. */
export type PluginApiVersion = "1";
