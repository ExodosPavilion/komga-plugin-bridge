# @komga-plugin-bridge/test-runner

A local test runner for plugins of the [Komga Plugin Bridge](https://github.com/ExodosPavilion/komga-plugin-bridge). It loads your plugin into a real Plugin Host against stand-ins for Komga and the Bridge, so you can test scan calls, events, settings and Komga data calls with no Komga installed.

The Plugin Host runs your plugin in its own Deno process, with only the permissions your manifest's capabilities grant. A test therefore fails the same way your plugin would in a real install, for example when it reads a file it has no capability for.

Not affiliated with the Komga project.

## Example

```ts
import { runPlugin } from "@komga-plugin-bridge/test-runner";
import { assertEquals } from "jsr:@std/assert";

Deno.test("supplies the series summary from its file", async () => {
  const run = await runPlugin(".", {
    library: { "My Series/plugin-metadata.json": '{"summary": "From a file"}' },
  });
  try {
    const metadata = await run.seriesMetadata({ path: `${run.library}/My Series` });
    assertEquals(metadata, { summary: "From a file" });
  } finally {
    await run.dispose();
  }
});
```

Run the tests with `deno test --allow-all`: the plugin runs in a subprocess the Plugin Host starts.

## What a run offers

`runPlugin(pluginDir, options)` starts a Plugin Host with the plugin in `pluginDir` (the folder holding `manifest.json`), approved for the capabilities it declares. Options:

- `library`: files to create in the stand-in library folder, by relative path.
- `settings`: setting values to save first, validated against the manifest.
- `capabilities`: capabilities to run with instead of the manifest's.
- `callTimeoutMs`: the time limit for one plugin call (default 5000).

The run it returns has:

- `seriesMetadata(series)` and `bookMetadata(book)`: what the plugin answers to a scan, or null.
- `event(type, data)`: sends a Komga event, and resolves to the plugins it reached.
- `settings()` and `saveSettings(values)`: the settings form and saving to it, with validation.
- `failures()`: the timeouts, crashes and errors recorded against the plugin.
- `komgaRequests`: the requests the plugin's `api.komga` calls made to the stand-in Komga.
- `dispose()`: stops everything and deletes the temporary folders. Always call it.

## Getting started

The [plugin template](https://github.com/ExodosPavilion/komga-plugin-bridge/tree/main/template) already has a test using this runner. The types plugins are written against are in [`@komga-plugin-bridge/plugin-api`](https://jsr.io/@komga-plugin-bridge/plugin-api).
