// Runs inside each plugin's own Deno process. Loads the plugin module and answers calls from the
// host, one JSON object per line on stdin/stdout:
//   in:  {"id": 1, "method": "getSeriesMetadata", "params": {...}}
//   out: {"id": 1, "result": ...} or {"id": 1, "error": "message"}
// The first line out is {"ready": true}, or {"error": "..."} if the plugin failed to load.
import { pathToFileURL } from "node:url";

// stdout carries the protocol, so anything a plugin logs goes to stderr instead.
console.log = console.info = console.debug = (...args: unknown[]) => console.error(...args);

const out = (message: unknown) => Deno.stdout.writeSync(new TextEncoder().encode(JSON.stringify(message) + "\n"));

let plugin: Record<string, (params: unknown) => unknown>;
try {
  const module = await import(pathToFileURL(Deno.args[0]).href);
  plugin = module.default ?? module;
  out({ ready: true });
} catch (error) {
  out({ error: `failed to load plugin: ${(error as Error).message}` });
  Deno.exit(1);
}

const lines = Deno.stdin.readable.pipeThrough(new TextDecoderStream());
let buffer = "";
for await (const chunk of lines) {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (line.trim()) handle(JSON.parse(line));
  }
}

async function handle(request: { id: number; method: string; params: unknown }) {
  try {
    const method = plugin[request.method];
    const result = typeof method === "function" ? await method.call(plugin, request.params) : null;
    out({ id: request.id, result: result ?? null });
  } catch (error) {
    out({ id: request.id, error: (error as Error).message });
  }
}
