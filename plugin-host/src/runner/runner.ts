// Runs inside each plugin's own Deno process. Loads the plugin module and answers calls from the
// host, one JSON object per line on stdin/stdout:
//   in:  {"id": 1, "method": "getSeriesMetadata", "params": {...}}
//   out: {"id": 1, "result": ...} or {"id": 1, "error": "message"}
// A plugin may call the host (the Plugin API's `komga.*`): out {"call": n, "method", "args"},
// answered by in {"replyTo": n, "result"} or {"replyTo": n, "error"}.
// The first line out is {"ready": true}, or {"error": "..."} if the plugin failed to load.
import { pathToFileURL } from "node:url";

// stdout carries the protocol, so anything a plugin logs goes to stderr instead.
console.log = console.info = console.debug = (...args: unknown[]) => console.error(...args);

const out = (message: unknown) => Deno.stdout.writeSync(new TextEncoder().encode(JSON.stringify(message) + "\n"));

let plugin: Record<string, (params: unknown, api: unknown) => unknown>;
try {
  const module = await import(pathToFileURL(Deno.args[0]).href);
  plugin = module.default ?? module;
  out({ ready: true });
} catch (error) {
  out({ error: `failed to load plugin: ${(error as Error).message}` });
  Deno.exit(1);
}

const calls = new Map<number, { resolve(v: unknown): void; reject(e: Error): void }>();
let nextCall = 1;
const hostCall = (method: string, args: unknown[]) =>
  new Promise<unknown>((resolve, reject) => {
    const call = nextCall++;
    calls.set(call, { resolve, reject });
    out({ call, method, args });
  });

/** What a plugin gets as the second argument of every hook. */
const namespace = (prefix: string) =>
  new Proxy({}, {
    get: (_target, name) => typeof name === "string" ? (...args: unknown[]) => hostCall(`${prefix}.${name}`, args) : undefined,
  });
const api = { settings: namespace("settings"), storage: namespace("storage"), komga: namespace("komga") };

const lines = Deno.stdin.readable.pipeThrough(new TextDecoderStream());
let buffer = "";
for await (const chunk of lines) {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (!line.trim()) continue;
    const message = JSON.parse(line);
    if (message.replyTo !== undefined) {
      const waiting = calls.get(message.replyTo);
      calls.delete(message.replyTo);
      if (message.error !== undefined) waiting?.reject(new Error(message.error));
      else waiting?.resolve(message.result);
    } else handle(message);
  }
}

async function handle(request: { id: number; method: string; params: unknown }) {
  try {
    const method = plugin[request.method];
    const result = typeof method === "function" ? await method.call(plugin, request.params, api) : null;
    out({ id: request.id, result: result ?? null });
  } catch (error) {
    out({ id: request.id, error: (error as Error).message });
  }
}
