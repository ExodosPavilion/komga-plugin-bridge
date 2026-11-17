# komga-plugin-bridge
Adds plugin support to Komga. Not affiliated with the Komga project

## Layout

| Folder | What it is |
| --- | --- |
| `bridge/` | The Bridge: a single jar (Kotlin) loaded into stock Komga as a Java agent ([ADR-0003](docs/adr/0003-bridge-loads-as-a-java-agent-on-the-system-class-path.md)). One class per feature, registered in `BridgeAutoConfiguration`. |
| `plugin-host/` | The Plugin Host (Deno/TypeScript) and its `Dockerfile`, which also builds the Bridge into the image. |
| `plugins/reference/` | The reference plugin. |
| `tests/seam1/` | Whole system in real containers, driven through Komga's address. |
| `tests/seam2/` | The Plugin Host alone against a fake Komga and a fake Bridge. |
| `prototypes/` | Throwaway prototypes, to be deleted. |

Inside `plugin-host/src/`, each concern has its own module so tickets rarely touch the same file:

- `http/routes/*.ts`: one file per group of routes, each exporting `register(router)`. Files are discovered automatically; add a file, edit nothing. Routes need the shared secret unless marked `public`.
- `db/migrations/*.ts`: one file per schema change, named `<yyyymmdd>_<n>_<what>.ts`, exporting `up(db)`. Applied in name order, once each.
- `plugins/`: the plugin store, discovery, per-plugin processes, and the supervisor that calls them.
- `bridge/`: placing the Bridge and shared secret in the volume shared with Komga.
- `context.ts`, `host.ts`: what route modules receive, and the wiring.

## Plugin contract (so far)

A plugin is a folder in the plugins directory with a `manifest.json` (`id`, `version`, `apiVersion` (supported: see `plugins/manifest.ts`, currently `"1"`), optional `entry` (default `index.ts`), `capabilities`, `contributions`, `settings` fields). An invalid manifest or unsupported `apiVersion` is refused, with the reason listed at `GET /api/plugins/refused` and nothing recorded and a module whose default export has `getSeriesMetadata({ series })`, returning `{ title?, summary?, publisher?, language?, genres? }` or `null`. Each enabled plugin runs in its own Deno process that may only read its own folder plus what its approved `capabilities` (manifest array of strings) allow: `network`, and `file-read:<library folder>` (or `file-read:*` for every configured library); `file-write:<library>` is in the model but never granted yet; `komga:read` and `komga:write` gate the Komga data API. One store of approved capabilities (`plugin_capabilities`) feeds both the Deno permissions and the Komga-data checks; until the approval flow exists, a folder install is approved for what it declares (`CapabilityStore.approveDeclared`). Archives come in later tickets.

## Tests

Both need only Docker. The seams are described in the spec (#1).

```sh
sh tests/seam2/run.sh              # Plugin Host alone, fake Komga and Bridge; seconds
sh tests/seam1/run.sh              # stock Komga + Plugin Host + fixture library; about a minute
```

`seam2/run.sh` passes extra arguments to `deno test` (for example `--filter secret`). `seam1/run.sh` uses `docker compose` and removes only its own compose project (`komga-plugin-bridge-seam1`); `KEEP=1` leaves it up. On Windows with the Docker engine inside WSL, run the scripts inside that WSL distribution.

With a local Deno, `deno task test:seam2` runs seam 2 directly.

## Running it

In your compose file, add the Plugin Host, and give Komga the shared volume and one variable. See `tests/seam1/compose.yaml` for a working example; the Komga lines marked `added` are all that changes. Start the Plugin Host once before Komga, so the Bridge is in the shared volume (a missing jar stops Komga from starting). Mount library folders into the Plugin Host read-only at the same paths as in Komga, and list them in `PLUGIN_HOST_LIBRARY_ROOTS`. Drop plugin folders into the `/plugins` volume and restart the Plugin Host.

## Komga data for plugins

A hook receives `{ komga }` as its second argument: `getSeries`, `getBook`, `listLibraries` (capability `komga:read`) and `updateSeriesMetadata`, `updateBookMetadata` (capability `komga:write`). The Plugin Host checks the plugin's approved capabilities, then calls Komga's REST API itself with the admin API key from `KOMGA_URL` and `KOMGA_API_KEY`, set once on the Plugin Host. The key never reaches a plugin. Until the approval ticket lands, a folder-installed plugin is approved for the capabilities its `manifest.json` declares.

## Failures

Every plugin call has a time limit (`PLUGIN_HOST_CALL_TIMEOUT_MS`, default 8000). Each failure (timeout, crash, error) is recorded in the host database (`GET /api/failures?plugin=<id>`). After `PLUGIN_HOST_FAILURE_THRESHOLD` consecutive failures (default 3) the plugin is disabled; a success resets the count. Re-enable with `POST /api/plugins/enable {"id": "..."}`.
