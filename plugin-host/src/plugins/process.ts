// One plugin, one Deno process. The process is started with no permissions beyond reading its
// own folder, the runner, and the library folders: no network, no environment, no writes, no
// subprocesses. (Per-capability and per-library permissions are later tickets.)
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "../config.ts";
import type { InstalledPlugin } from "./store.ts";

const runnerFile = fileURLToPath(new URL("../runner/runner.ts", import.meta.url));
const runnerDir = join(runnerFile, "..");

/** Answers a Plugin API call a plugin makes (settings, storage) from inside its process. */
export type ApiCallHandler = (pluginId: string, method: string, params: unknown) => Promise<unknown>;

export class PluginProcess {
  private child?: Deno.ChildProcess;
  private writer?: WritableStreamDefaultWriter<Uint8Array>;
  private pending = new Map<number, { resolve(v: unknown): void; reject(e: Error): void }>();
  private nextId = 1;
  private alive = false;

  constructor(
    private readonly plugin: InstalledPlugin,
    private readonly config: Config,
    private readonly onApiCall?: (method: string, params: unknown) => Promise<unknown>,
  ) {}

  get pid(): number | null {
    return this.alive && this.child ? this.child.pid : null;
  }

  get running(): boolean {
    return this.alive;
  }

  async start(): Promise<void> {
    const readable = [this.plugin.dir, runnerDir, ...this.config.libraryRoots].join(",");
    const command = new Deno.Command(this.config.denoPath, {
      args: ["run", "--no-prompt", `--allow-read=${readable}`, runnerFile, join(this.plugin.dir, this.plugin.entry)],
      stdin: "piped",
      stdout: "piped",
      stderr: "inherit",
      clearEnv: false,
    });
    const child = command.spawn();
    this.child = child;
    this.writer = child.stdin.getWriter();
    this.alive = true;

    const ready = Promise.withResolvers<void>();
    this.readLines(child, ready);
    child.status.then(() => {
      this.alive = false;
      for (const call of this.pending.values()) call.reject(new Error("plugin process exited"));
      this.pending.clear();
      ready.reject(new Error("plugin process exited before it was ready"));
    });
    await ready.promise;
  }

  async call(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    if (!this.alive || !this.writer) throw new Error("plugin is not running");
    const id = this.nextId++;
    const reply = new Promise<unknown>((resolve, reject) => this.pending.set(id, { resolve, reject }));
    await this.writer.write(new TextEncoder().encode(JSON.stringify({ id, method, params }) + "\n"));
    let timer: number | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`plugin call timed out after ${timeoutMs} ms`)), timeoutMs);
    });
    try {
      return await Promise.race([reply, timeout]);
    } finally {
      clearTimeout(timer);
      this.pending.delete(id);
    }
  }

  async stop(): Promise<void> {
    if (!this.child || !this.alive) return;
    try {
      this.child.kill("SIGKILL");
    } catch { /* already gone */ }
    await this.writer?.close().catch(() => {});
    await this.child.status;
  }

  private async answerApiCall(message: { api: number; method: string; params: unknown }) {
    let reply: unknown;
    try {
      if (!this.onApiCall) throw new Error("the Plugin API is not available");
      reply = { apiReply: message.api, result: (await this.onApiCall(message.method, message.params)) ?? null };
    } catch (error) {
      reply = { apiReply: message.api, error: (error as Error).message };
    }
    try {
      await this.writer?.write(new TextEncoder().encode(JSON.stringify(reply) + "\n"));
    } catch { /* the process went away */ }
  }

  private async readLines(child: Deno.ChildProcess, ready: PromiseWithResolvers<void>) {
    let buffer = "";
    for await (const chunk of child.stdout.pipeThrough(new TextDecoderStream())) {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;
        const message = JSON.parse(line);
        if (message.api !== undefined) void this.answerApiCall(message);
        else if (message.ready) ready.resolve();
        else if (message.id === undefined) ready.reject(new Error(message.error));
        else {
          const call = this.pending.get(message.id);
          if (message.error !== undefined) call?.reject(new Error(message.error));
          else call?.resolve(message.result);
        }
      }
    }
  }
}
