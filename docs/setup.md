# Setting up plugins for Komga

This takes you from a plain Komga to a running plugin in one sitting. It uses Docker Compose and the official Komga image. The compose file is [`examples/compose.yaml`](../examples/compose.yaml). Every step below is run against it by `sh tests/setup/run.sh`, with the Plugin Host image built from this repository.

The system has two parts: the Plugin Host, a second container where plugins run, and the Bridge, a small jar the Plugin Host puts in a shared volume and Komga loads at start. Komga stays on the official image.

## What to know first

- **Start the Plugin Host before Komga.** It puts the Bridge in the shared volume. Komga is told to load that file, and if the file is missing Komga does not start at all (the JVM stops with `Error opening zip file or JAR manifest missing`). Nothing the Bridge does can prevent that. The example's healthcheck lets you wait for it (`docker compose up -d --wait plugin-host`).
- **Removing the plugin system means removing `JAVA_TOOL_OPTIONS` too.** If you remove the Plugin Host and leave the variable, Komga will not start.
- **The Plugin Host's port stays private.** Do not add `ports:` to it. Only Komga talks to it, over the compose network, with a shared secret the Plugin Host generates itself. The admin pages are reached through Komga, with your normal Komga login.
- **The Plugin Host runs as root** (`user: "0:0"` in the example), so it can write the Bridge into the shared volume whoever owns it. Plugins do not run as root: each runs in its own Deno process with only the permissions you approved.

## Install

1. Copy `examples/compose.yaml` into your setup, or merge it into your existing compose file. Change the two `/path/to/your/library` lines to your library folders.

   - **Library folders are mounted read-only (`:ro`) at the same paths** in the Komga service and in the Plugin Host. Plugins see files at the paths Komga reports, so the paths must match. List each folder in `PLUGIN_HOST_LIBRARY_ROOTS` (comma separated).
   - The Komga service keeps its own settings. The only changes to it are the two lines marked `added`: the `plugin-bridge` volume (read-only) and the `JAVA_TOOL_OPTIONS` variable.
   - **If you already set `JAVA_TOOL_OPTIONS`, append to it** and do not replace it. Separate the options with a space: `JAVA_TOOL_OPTIONS: -Xmx2g -javaagent:/plugin-bridge/bridge.jar`. The variable applies to every Java process in the container; in the official image that is only Komga.
   - The Plugin Host image is `ghcr.io/exodospavilion/komga-plugin-bridge`, as in the example. Use a tag from a release (`0.1.0`, or `0.1`; `latest` follows the newest release). The Bridge inside it is built for the newest Komga version that release lists, so use a Plugin Host image that matches your Komga version (see "Komga versions" below).

2. Start the Plugin Host, then Komga:

   ```sh
   docker compose up -d --wait plugin-host
   docker compose up -d komga
   ```

   On later starts the order matters only when the shared volume is empty (a new machine, a deleted volume). Keeping `restart: unless-stopped` on both is fine once the Bridge is in place.

3. Open Komga and create your admin account if you have not already.

## Before the first image is published

The image above is built and pushed by `.github/workflows/publish-image.yml` when a version tag (`v0.1.0`) is pushed. Until the first such tag has been pushed, `ghcr.io/exodospavilion/komga-plugin-bridge` does not exist and `docker compose pull` fails. To publish it (maintainers):

1. In the repository's Settings, Actions, General, set "Workflow permissions" to read and write, so the workflow may write packages.
2. Push a tag: `git tag v0.1.0 && git push origin v0.1.0`. The workflow tests the Plugin Host, builds the image with the Bridge for the newest Komga version on `supported-komga-versions.txt`, and pushes it.
3. Packages published this way are private at first. Open the package on GitHub (the repository's Packages), Package settings, and change its visibility to public, so admins can pull it without signing in. Do this once.

Until then, build the image yourself from a clone of this repository: `docker build -f plugin-host/Dockerfile -t ghcr.io/exodospavilion/komga-plugin-bridge:latest .`, which `sh tests/setup/run.sh` also does.

## Create the API key

Plugins that read or change Komga data go through the Plugin Host, which calls Komga with an admin API key. The key is never given to a plugin.

1. In Komga, sign in as an admin and open your account settings, then API keys. Create a key with a comment such as `plugin host`. (Through the API this is `POST /api/v2/users/me/api-keys` with `{"comment": "plugin host"}`.) Komga shows the key once; copy it.
2. Put it in a file named `.env` beside the compose file: `KOMGA_API_KEY=<the key>`.
3. Recreate the Plugin Host so it picks the key up: `docker compose up -d plugin-host`.

The Plugin Manager's clash check (`GET /api/v1/plugin-manager/api/plugin-clashes`) reports `unavailable` when the key is missing or wrong.

## Install a plugin

Open the Plugin Manager as an admin at `http://<your komga>/api/v1/plugin-manager/`. There is also a "Plugin Manager" item at the end of Komga's settings menu.

- **From a release:** "Install from GitHub": paste a repository address, pick a release; the Plugin Host downloads the `.zip` attached to it. Or "Install a plugin" to upload a plugin's `.zip`.
- **From a folder** (for example the reference plugin in `plugins/reference/`): copy the folder into the `plugins` volume and restart the Plugin Host:

  ```sh
  docker compose cp plugins/reference plugin-host:/plugins/reference
  docker compose restart plugin-host
  ```

A plugin that declares capabilities (reading library files, network, Komga data) is recorded but stays disabled. The Plugin Manager shows what it asks for; approve it, then enable it. Then add or scan a library: the plugin's metadata appears on the series and books it covers. If the Plugin Host is down or slow, scans run as stock Komga does.

## Upgrade

1. Pull the new images: `docker compose pull`.
2. Start the Plugin Host first so the new Bridge is in the volume: `docker compose up -d --wait plugin-host`.
3. **Restart Komga** (`docker compose up -d komga`, or `docker compose restart komga` if its image did not change). Komga reads the Bridge once at start, so it keeps running the old Bridge until it is restarted.

Plugin settings, approvals and failure records live in the Plugin Host's `/state` volume and survive an upgrade.

## Komga versions, and an unverified Komga

The Bridge is checked against a list of Komga versions (`bridge/src/main/resources/supported-komga-versions.txt`). When you run a Komga version that is not on the list, for example after Komga updates ahead of this project, the Bridge is **inactive** ([ADR-0004](adr/0004-the-plugin-manager-stays-reachable-on-an-unverified-komga.md)):

- Komga behaves exactly as stock Komga. No plugin adds metadata, receives events or filters responses, and the Plugin Host is not called.
- Komga still starts, and the Plugin Manager and its link stay reachable. Its Bridge section says that the Bridge is inactive, the Komga version it found, and the versions it supports, so you can see why plugins are off.
- Nothing is broken and no data is changed. To get plugins back, upgrade the Plugin Host image to a release that lists your Komga version, or pin Komga to a listed version. The project checks each new Komga release daily and adds it to the list when its tests pass.

## Remove the plugin system

This leaves Komga as it was:

1. Remove the `JAVA_TOOL_OPTIONS` line (or the `-javaagent:/plugin-bridge/bridge.jar` part of it, if you set other options) **and** the `plugin-bridge` volume line from the Komga service. **Do this before, or together with, removing the Plugin Host**: a Komga that still names the jar will not start without it.
2. Remove the `plugin-host` service.
3. `docker compose up -d` to recreate Komga without the Bridge.
4. Optionally delete the volumes `plugin-bridge`, `plugin-host-state` and `plugins`.

Komga's own database and configuration were never changed by the plugin system. Metadata that plugins already wrote stays in Komga, as it would if you had edited it by hand.
