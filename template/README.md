# My plugin

A plugin for Komga's plugin system (komga-plugin-bridge), started from the project template.

## Develop

- `manifest.json`: set `id`, `version` and the `capabilities` the plugin needs. `apiVersion` is the
  Plugin API version it targets.
- `index.ts`: the plugin. Types come from `@komga-plugin-bridge/plugin-api` (use `import type`).
- Code beside `index.ts` goes under `src/`; it is included in the archive.
- `deno task check` type-checks the plugin.

## Release

1. Raise `version` in `manifest.json`, commit.
2. Tag it (`git tag v0.1.0 && git push --tags`). The workflow in `.github/workflows/release.yml`
   type-checks, runs `deno task package` and attaches `dist/<id>-<version>.zip` to a GitHub release.
3. In the Plugin Manager, install from the repository URL and choose that release.

`deno task package` alone builds the same archive locally in `dist/`.
