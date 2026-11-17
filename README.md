# komga-plugin-bridge
Adds plugin support to Komga. Not affiliated with the Komga project

## Layout

| Folder | What it is |
| --- | --- |
| `bridge/` | The Bridge: a single jar (Kotlin) loaded into stock Komga as a Java agent ([ADR-0003](docs/adr/0003-bridge-loads-as-a-java-agent-on-the-system-class-path.md)). One class per feature, registered in `BridgeAutoConfiguration`. |
| `plugin-host/` | The Plugin Host (Deno/TypeScript) and its `Dockerfile`, which also builds the Bridge into the image. |
| `plugin-api/` | The Plugin API package: types only, published to JSR as `@komga-plugin-bridge/plugin-api`. |
| `template/` | Project template for a new plugin repository: manifest, entry, type-check, release packaging and a release workflow. |
| `plugins/reference/` | The reference plugin (written against the package). |
| `tests/seam1/` | Whole system in real containers, driven through Komga's address. |
| `tests/seam2/` | The Plugin Host alone against a fake Komga and a fake Bridge. |
| `prototypes/` | Throwaway prototypes, to be deleted. |

Inside `plugin-host/src/`, each concern has its own module so tickets rarely touch the same file:

- `http/routes/*.ts`: one file per group of routes, each exporting `register(router)`. Files are discovered automatically; add a file, edit nothing. Routes need the shared secret unless marked `public`.
- `db/migrations/*.ts`: one file per schema change, named `<yyyymmdd>_<n>_<what>.ts`, exporting `up(db)`. Applied in name order, once each.
- `plugins/`: the plugin store, discovery, per-plugin processes, and the supervisor that calls them.
- `bridge/`: placing the Bridge and shared secret in the volume shared with Komga.
- `context.ts`, `host.ts`: what route modules receive, and the wiring.

## Adding to the Bridge: use the version gate

The Bridge is inactive on a Komga version not listed in `bridge/src/main/resources/supported-komga-versions.txt` (the one place to update). The gate is `BridgeGateFilter` (`BridgeGate.kt`), an `AutoConfigurationImportFilter` that keeps every auto-configuration in package `pluginbridge` from loading on an unsupported version, so none of their beans or classes exist. **New Bridge features must be auto-configurations in package `pluginbridge`, listed in `AutoConfiguration.imports`; do not register beans any other way.** Only the auto-configurations in `BridgeGate.ALWAYS_ON` are exempt ([ADR-0004](docs/adr/0004-the-plugin-manager-stays-reachable-on-an-unverified-komga.md)): `BridgeStatusAutoConfiguration` logs and reports the inactive state and reason (`POST /bridge/status`, read at `GET /api/bridge-status`), and `PluginManagerAutoConfiguration` and `PluginManagerLinkAutoConfiguration` keep the Plugin Manager and its link in the web UIs reachable so the admin can see that reason. Exempt parts may use only Spring, Spring Security and the JDK, never Komga's classes. For a non-bean check call `BridgeGate.evaluate(environment).active`.

## Plugin contract (so far)

A plugin is a folder in the plugins directory with a `manifest.json` (`id`, `version`, `apiVersion` (supported: see `plugins/manifest.ts`, currently `"1"`), optional `entry` (default `index.ts`), `capabilities`, `contributions`, `settings` fields). An invalid manifest or unsupported `apiVersion` is refused, with the reason listed at `GET /api/plugins/refused` and nothing recorded and a module whose default export has `getSeriesMetadata({ series })`, returning `{ title?, summary?, publisher?, language?, genres? }` or `null`. Each enabled plugin runs in its own Deno process that may only read its own folder plus what its approved `capabilities` (manifest array of strings) allow: `network`, and `file-read:<library folder>` (or `file-read:*` for every configured library); `file-write:<library>` is in the model but never granted yet; `komga:read` and `komga:write` gate the Komga data API. One store of approved capabilities (`plugin_capabilities`) feeds both the Deno permissions and the Komga-data checks; a plugin's manifest only *declares* capabilities (`CapabilityStore.syncDeclared`); nothing is granted until an admin approves them (`CapabilityStore.approve`, the single grant point, via `POST /api/plugins/approve`). See "Installing a plugin".

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

A hook receives `{ komga }` as its second argument: `getSeries`, `getBook`, `listLibraries` (capability `komga:read`) and `updateSeriesMetadata`, `updateBookMetadata` (capability `komga:write`). The Plugin Host checks the plugin's approved capabilities, then calls Komga's REST API itself with the admin API key from `KOMGA_URL` and `KOMGA_API_KEY`, set once on the Plugin Host. The key never reaches a plugin. A plugin only holds the capabilities an admin approved.

## Failures

Every plugin call has a time limit (`PLUGIN_HOST_CALL_TIMEOUT_MS`, default 8000). Each failure (timeout, crash, error) is recorded in the host database (`GET /api/failures?plugin=<id>`). After `PLUGIN_HOST_FAILURE_THRESHOLD` consecutive failures (default 3) the plugin is disabled; a success resets the count. Re-enable with `POST /api/plugins/enable {"id": "..."}`.

## Scans never wait on plugins

Every scan-time call from the Bridge has a time limit, `PLUGIN_HOST_BRIDGE_TIMEOUT_MS` (default: `PLUGIN_HOST_CALL_TIMEOUT_MS` + 2000), which the Plugin Host writes into `bridge.json`. If the Plugin Host is stopped, unreachable or too slow, the Bridge returns nothing and Komga scans as stock Komga. After such a failure the Bridge skips the host for 3 seconds, so a large scan does not pay the limit once per series. Books that missed plugin metadata get it on the next metadata refresh.

## Plugin API (what a hook receives)

Every hook is called as `hook(params, api)`, with `api.settings` (`all()`, `get(name)`), `api.storage` (`get`, `set`, `delete`, `keys`) and `api.komga` (see above). On the wire, the plugin sends `{call, method: "settings.all" | "storage.get" | "komga.getSeries" | ..., args: [...]}` on stdout and the host answers `{replyTo, result | error}` on stdin. The host routes `komga.*` to the Komga data layer (checked against approved capabilities) and the rest to settings and storage. Failures are counted at the hook call, so an API error a plugin lets propagate counts once.

## Events

The Bridge forwards every Komga domain event (including `LibraryScanned`, which Komga's public stream omits) to `POST /bridge/events` as `{type, data}`, with only ids and names in `data` (see `EventMapper.kt`). Forwarding is queued on its own thread, so a slow Plugin Host never holds up Komga. A plugin subscribes in its manifest, `"contributions": [{"type": "events", "subscribe": ["LibraryScanned"]}]`, and handles events in `onEvent({ type, data }, api)`. It receives only what it subscribed to. Event calls go through the supervisor like metadata calls: time limit, failure record, auto-disable. Note `LibraryScanned` fires before Komga's follow-up tasks (analysis, metadata refresh) have run.

## Shared secret

The Plugin Host generates a secret at first start (kept in its own `/state`, reused later) and writes it to `bridge.json` beside the Bridge jar. Every Plugin Host route except `public` ones needs `Authorization: Bearer <secret>`. The other way, the Bridge answers calls under `/plugin-bridge/host/` (outside Komga's own security) only with the same header (`HostCallFilter`); `GET /plugin-bridge/host/ping` is the liveness check. Later features add handlers behind that filter. No admin configuration is needed.

## Writing a plugin (Plugin API package and template)

`plugin-api/` holds the types for everything above (hooks, `api.settings`, `api.storage`, `api.komga`, events, the manifest). Plugins import it with `import type`, so nothing is loaded at run time. It is extended by adding a file and one export (see `plugin-api/README.md`). Copy `template/` to start a plugin repository: `deno task check` type-checks it, `deno task package` builds `dist/<id>-<version>.zip` (`manifest.json` and code at the archive root, deflate zip), and `.github/workflows/release.yml` attaches that zip to a GitHub release on a `v*` tag. Seam 2 (`tests/seam2/plugin-api-package.test.ts`) type-checks the template against the package, packages it and installs the archive into a Plugin Host. `deno task check:plugins` type-checks the reference plugin and fixtures. Until the package is published, resolve it locally with an import map entry pointing at `plugin-api/src/index.ts`, as the root `deno.json` does.

## Response filtering

A plugin can change what Komga's JSON API returns to the bundled web UI. It declares routes in its manifest, `"contributions": [{"type": "response-filter", "routes": ["/api/v1/libraries", "/api/v1/series/*"]}]` (`*` is one path segment, `**` anything), and exports `filterResponse({ request: {method, path, query}, body })`, returning the new JSON body or `null` to leave it. Several filters apply in plugin id order. Only requests that look like the web UI are filtered: `X-Requested-With: XMLHttpRequest` (both bundled UIs send it) and the session cookie, with no `X-API-Key` or `Authorization` header. That is a heuristic, not security; third-party apps and OPDS readers get Komga's own response. The Bridge (`ResponseFilter`) learns the filtered routes from `GET /bridge/response-filters` every 5 seconds; while no plugin filters a route, a request is not wrapped or buffered at all. A filter call is bounded by the call time limit and counts toward failures like any hook; on a failure, a timeout or an unreachable host the original response bytes are sent. Filtered responses are only `200 application/json` without `Content-Encoding`.
## Plugin Manager link

The Bridge's one addition to Komga's screens is a "Plugin Manager" item at the end of the settings navigation in both web UIs, for admins. `PluginManagerLinkFilter` adds the script `plugin-manager-link.js` before `</body>` of page loads (GET, accepting HTML, not under `/api`, `/opds`, `/sse`); the script adds the item once the single-page app has drawn its navigation, by copying the "Updates" item (`a[href$="/settings/updates"]` in the legacy UI, `a[href$="/server/updates"]` in the newer one). If a UI changes those links the item is simply not shown; nothing else breaks. It is present on unverified Komga versions too (ADR-0004).

## Plugin Manager

Admins open it at `<komga>/api/v1/plugin-manager/` with their normal Komga login. `PluginManagerController` (Bridge) sits under Komga's `/api` prefix, so Komga's own security applies: anonymous gets 401, a non-admin 403. It forwards `.../api/...` to the Plugin Host's `/api/...` and everything else to its `/manager/...`, adding the shared secret; state-changing requests need `X-Requested-With` (the page sends it). The Plugin Host's port is never published. Disable keeps settings; remove deletes the plugin's folder and every row with a `plugin_id`.

The page is `plugin-host/src/manager/ui/`: `index.html` and `app.js` load every file in `sections/` (name them `NN-name.js`, default-export `{ title, render(element) }`, use `h()` and `api()` from `lib.js`). Adding a section means adding a file; nothing else is edited. The Bridge section reads `GET /api/bridge-status`, the same report the Bridge's one status reporter (`BridgeStatusAutoConfiguration`) posts to `/bridge/status`.

## Per-library enablement and importer clashes

The admin chooses the libraries a plugin acts in (Plugin Manager, "Libraries" section; `POST /api/plugin-libraries {"plugin", "all": true}` or `{"plugin", "libraries": [ids]}`). A plugin nobody has configured acts in every library; an empty list means it acts nowhere. The choice gates every kind of call, in the Plugin Host: scan-time metadata (by the series' or book's `libraryId`), events (by the library in the event's payload; events not about one library, such as user or read-progress events, reach any subscriber enabled somewhere), and response filtering (by `/api/v1/libraries/{id}...` or `library_id=` in the request; other requests apply when the plugin is enabled somewhere, and a plugin enabled nowhere announces no routes). It does not change a plugin's Deno file-read permissions, which stay per plugin process (see capabilities).

A plugin with the manifest contribution `{"type": "metadata"}` is a metadata plugin. `GET /api/plugin-clashes` lists each library where one is enabled while a Komga importer that fills the same fields is on (`importComicInfoBook/Series`, `importEpubBook/Series`, `importMylarSeries`, `importBarcodeIsbn`, read from Komga's library list with the host's `KOMGA_URL` and `KOMGA_API_KEY`). Precedence is not controlled; the admin turns one off, the importer in Komga's library settings.

## Installing a plugin

Two ways in, one rule. Upload: the Plugin Manager's "Install a plugin" section sends the archive to `POST /api/plugins/install` (body: the zip, as `template/` packages it; one top-level folder is tolerated). The reusable function is `installFromArchive` in `plugins/install.ts`; later install sources call it with downloaded bytes. It validates the manifest (#12), the id (a plain folder name), the entry file and the entry names (nothing outside the plugin folder), unpacks into a hidden `.install-*` folder and moves it into place, so a refused archive installs nothing (400 `{error}`). Installing an existing id upgrades it in place and keeps its settings. Folder: drop a folder into the plugins directory and restart, as before.

The rule: a plugin whose manifest declares capabilities nobody approved is *pending*. It is recorded but disabled, `enable` answers 409 and the supervisor never starts it. `GET /api/plugin-capabilities` lists `declared`, `approved` and `pending` per plugin (what the Plugin Manager shows before enabling); `POST /api/plugins/approve {"id"}` approves exactly the declared set. A plugin declaring nothing has nothing to approve. A new version that declares more is pending again until approved; approvals the manifest drops are removed. Seam 2's `startTestHost` approves and enables waiting plugins by default (`approve: false` turns that off), as seam 1's `startedAndClaimed` does.

## Testing a plugin locally

`plugin-test-runner/` (`@komga-plugin-bridge/test-runner`) loads a plugin into a real Plugin Host against stand-ins for Komga and the Bridge, with no Komga installed. It is seam 2 (`tests/seam2/support`) packaged for plugin projects: `runPlugin(dir, { settings, library, komga, capabilities })` returns a run with `seriesMetadata`, `bookMetadata`, `event`, `settings`, `saveSettings`, `failures`, `komgaRequests` and `dispose`. The template has an `index.test.ts` using it; run `deno task test` (needs `--allow-all`, since the plugin runs in a subprocess the host starts). `tests/seam2/test-runner.test.ts` runs the reference plugin and fixtures through it. Until the package is published, resolve it locally with an import map entry like the root `deno.json`; publishing must bundle `plugin-host/src` and `tests/seam2/support`, which the runner imports by relative path.
