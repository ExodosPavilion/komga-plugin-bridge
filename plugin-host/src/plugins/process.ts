// One plugin, one Deno process. The process is started with only what its capabilities allow:
// reading its own folder and the runner always; reading the library folders it holds file-read
// for; the network if it holds the network capability. Never environment, writes or
// subprocesses. Deno enforces this, not the plugin's good behaviour.
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "../config.ts";
import { resolvePermissions } from "./capabilities.ts";
import type { InstalledPlugin } from "./store.ts";

const runnerFile = fileURLToPath(new URL("../runner/runner.ts", import.meta.url));
const runnerDir = join(runnerFile, "..");

export class PluginProcess {
  private child?: Deno.ChildProcess;
  private writer?: WritableStreamDefaultWriter<Uint8Array>;
  private pending = new Map<number, { resolve(v: unknown): void; reject(e: Error): void }>();
  private nextId = 1;
  private alive = false;

  constructor(private readonly plugin: InstalledPlugin, private readonly config: Config) {}

  get pid(): number | null {
    return this.alive && this.child ? this.child.pid : null;
  }

  get running(): boolean {
    return this.alive;
  }

  async start(): Promise<void> {
    const { read, network } = resolvePermissions(this.plugin.capabilities, this.config.libraryRoots);
    const readable = [this.plugin.dir, runnerDir, ...read].join(",");
    const command = new Deno.Command(this.config.denoPath, {
      args: [
        "run",
        "--no-prompt",
        `--allow-read=${readable}`,
        ...(network ? ["--allow-net"] : []),
        runnerFile,
        join(this.plugin.dir, this.plugin.entry),
      ],
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
        if (message.ready) ready.resolve();
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
