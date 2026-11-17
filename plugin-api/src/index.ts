/**
 * The Plugin API: the types a plugin for the Komga Plugin Bridge is written against.
 *
 * A plugin is a module that exports some of the hooks in {@link Plugin}. Each hook receives its
 * parameters and a {@link PluginApi} object, through which it reads its settings, keeps private
 * storage and reaches Komga's data. A plugin also ships a `manifest.json` ({@link PluginManifest})
 * that declares its capabilities and contributions.
 *
 * This package holds types only. Import them with `import type`, so nothing from it is loaded when
 * the plugin runs:
 *
 * ```ts
 * import type { Plugin } from "@komga-plugin-bridge/plugin-api";
 *
 * export default {
 *   async getSeriesMetadata(_params, api) {
 *     const publisher = await api.settings.get("publisher");
 *     return typeof publisher === "string" ? { publisher } : null;
 *   },
 * } satisfies Plugin;
 * ```
 *
 * Not affiliated with the Komga project.
 *
 * @module
 */
// To extend the API, add a file and export it here.
export type * from "./api.ts";
export type * from "./events.ts";
export type * from "./filtering.ts";
export type * from "./komga.ts";
export type * from "./manifest.ts";
export type * from "./metadata.ts";
export type * from "./plugin.ts";
export type * from "./settings.ts";
export type * from "./storage.ts";
