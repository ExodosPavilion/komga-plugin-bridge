# @komga-plugin-bridge/plugin-api

TypeScript types for writing a plugin for Komga's plugin system (komga-plugin-bridge). Types only:
import them with `import type`, and nothing from this package is loaded when your plugin runs.

```ts
import type { Plugin } from "@komga-plugin-bridge/plugin-api";

export default {
  async getSeriesMetadata({ series }, api) {
    const token = await api.settings.get("token");
    return { summary: `Hello from ${series.name}` };
  },
} satisfies Plugin;
```

The package is versioned on its own, independent of Komga. The manifest's `apiVersion` names the
Plugin API version your plugin targets (currently `"1"`); the package's semver follows it: a
breaking change to the API is a new major `apiVersion`, additions are minor releases here.

## What is in it

| Module | Covers |
| --- | --- |
| `plugin.ts` | `Plugin`: the hooks a module may export, grouped as `MetadataHooks`, `EventHooks`, `FilterHooks`. |
| `api.ts` | `PluginApi`: the second argument of every hook (`settings`, `storage`, `komga`). |
| `metadata.ts` | Scan-time series and book metadata. |
| `filtering.ts` | `filterResponse`: change API responses for the bundled web UI. |
| `events.ts` | Komga's events as `KomgaEvent`, discriminated on `type`. |
| `komga.ts` | `api.komga`: read and write Komga's data (capabilities `komga:read`, `komga:write`). |
| `settings.ts`, `storage.ts` | `api.settings` and `api.storage`. |
| `manifest.ts` | The shape of `manifest.json`. |

## Extending the package

A new kind of hook or API namespace is a new file plus a line in `src/index.ts`; existing files
barely change. A new hook group is an interface in its own file, added to the `extends` list of
`Plugin` in `plugin.ts`. A new `api.<name>` namespace is a field on `PluginApi` in `api.ts`.

## Publishing

The package is published to JSR by the repository's `publish-packages.yml` workflow: bump
`version` in `deno.json` and push to `main`. `deno publish --dry-run` checks it without
publishing.
