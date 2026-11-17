// The shape of a plugin's manifest.json, for authors who want to check or generate one.
import type { KomgaEventType } from "./events.ts";
import type { SettingValue } from "./settings.ts";

/** "network", "komga:read", "komga:write", "file-read:<library folder>" or "file-read:*". */
export type Capability = string;

export interface SettingField {
  name: string;
  type: "string" | "number" | "boolean";
  default?: SettingValue;
  help?: string;
  /** Secret values are hidden after they are saved. */
  secret?: boolean;
}

export interface EventsContribution {
  type: "events";
  subscribe: KomgaEventType[];
}

export interface ResponseFilterContribution {
  type: "response-filter";
  /** Komga API paths: `*` is one path segment, `**` anything. */
  routes: string[];
}

/**
 * Declares a plugin that supplies series or book metadata. The Plugin Manager uses it to warn
 * when a library also has one of Komga's built-in importers switched on.
 */
export interface MetadataContribution {
  type: "metadata";
}

export type Contribution = EventsContribution | ResponseFilterContribution | MetadataContribution;

export interface PluginManifest {
  id: string;
  version: string;
  /** The Plugin API version this plugin targets: see PluginApiVersion. */
  apiVersion: PluginApiVersion;
  /** The module to load, relative to the archive root. Defaults to "index.ts". */
  entry?: string;
  capabilities?: Capability[];
  contributions?: Contribution[];
  settings?: SettingField[];
}

/** The Plugin API versions this package describes. A manifest names exactly one. */
export type PluginApiVersion = "1";
