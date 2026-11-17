// One plugin, one Deno process. The process is started with only what its capabilities allow:
// reading its own folder and the runner always; reading the library folders it holds file-read
// for in libraries it is enabled in; the network if it holds the network capability. Never
// environment, writes or subprocesses, and it starts with an empty environment. Deno enforces
// this, not the plugin's good behaviour.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "../config.ts";
import { PluginCallError } from "./failures.ts";
import type { Permissions } from "./capabilities.ts";
import type { InstalledPlugin } from "./store.ts";

// The runner is a module URL: a file here, but a registry address when the host is a package
// (the test runner), which Deno can run all the same.
const runnerUrl = import.meta.resolve("../runner/runner.ts");
const runnerDir = runnerUrl.startsWith("file:") ? dirname(fileURLToPath(runnerUrl)) : null;

/** Only what Deno needs to find its own module cache; never anything the host holds secret. */
const DENO_ENV = ["DENO_DIR", "HOME", "XDG_CACHE_HOME", "LOCALAPPDATA"];

/** Answers a Plugin API call a plugin makes from inside its process, e.g. "komga.getSeries" or "storage.get". */
export type ApiCallHandler = (pluginId: string, method: string, args: unknown[]) => Promise<unknown>;

export class PluginProcess {
  private child?: Deno.ChildProcess;
  private writer?: WritableStreamDefaultWriter<Uint8Array>;
  private pending = new Map<number, { resolve(v: unknown): void; reject(e: Error): void }>();
  private nextId = 1;
  private alive = false;
  private reading?: Promise<void>;

  /** The permissions this process was started with. */
  permissions?: Permissions;

  /**
   * `permissions` says what the process may do, as of now (see PluginSupervisor.permissionsOf).
   * `onHostCall` answers the plugin's calls into the host (the Plugin API), e.g. "komga.getSeries".
   */
  constructor(
    private readonly plugin: InstalledPlugin,
    private readonly config: Config,
    private readonly permissionsNow: () => Promise<Permissions>,
    private readonly onHostCall?: ApiCallHandler,
  ) {}

  get pid(): number | null {
    return this.alive && this.child ? this.child.pid : null;
  }

  get running(): boolean {
    return this.alive;
  }

  async start(): Promise<void> {
    const permissions = this.permissions = await this.permissionsNow();
    const { read, network } = permissions;
    const readable = [this.plugin.dir, ...(runnerDir ? [runnerDir] : []), ...read].join(",");
    const command = new Deno.Command(this.config.denoPath, {
      args: [
        "run",
        "--no-prompt",
        `--allow-read=${readable}`,
        ...(network ? ["--allow-net"] : []),
        runnerUrl,
        join(this.plugin.dir, this.plugin.entry),
      ],
      stdin: "piped",
      stdout: "piped",
      stderr: "inherit",
      // The host's environment holds secrets (KOMGA_API_KEY); a plugin process starts with none of
      // it. Only the variables Deno needs to find its cache are passed, so Deno itself keeps working.
      clearEnv: true,
      env: Object.fromEntries(DENO_ENV.flatMap((name) => Deno.env.get(name) ? [[name, Deno.env.get(name)!]] : [])),
    });
    const child = command.spawn();
    this.child = child;
    this.writer = child.stdin.getWriter();
    this.alive = true;

    const ready = Promise.withResolvers<void>();
    this.reading = this.readLines(child, ready).catch(() => {});
    child.status.then(() => {
      this.alive = false;
      for (const call of this.pending.values()) call.reject(new PluginCallError("crash", "plugin process exited"));
      this.pending.clear();
      ready.reject(new Error("plugin process exited before it was ready"));
    });
    await ready.promise;
  }

  async call(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    if (!this.alive || !this.writer) throw new PluginCallError("crash", "plugin process is not running");
    const id = this.nextId++;
    const reply = new Promise<unknown>((resolve, reject) => this.pending.set(id, { resolve, reject }));
    await this.writer.write(new TextEncoder().encode(JSON.stringify({ id, method, params }) + "\n"));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new PluginCallError("timeout", `plugin call timed out after ${timeoutMs} ms`)), timeoutMs);
    });
    try {
      return await Promise.race([reply, timeout]);
    } finally {
      clearTimeout(timer);
      this.pending.delete(id);
    }
  }

  async stop(): Promise<void> {
    if (!this.child) return;
    if (this.alive) {
      try {
        this.child.kill("SIGKILL");
      } catch { /* already gone */ }
    }
    await this.writer?.close().catch(() => {});
    await this.child.status;
    await this.reading;
  }

  private async answerHostCall(message: { call: number; method: string; args: unknown[] }) {
    let reply: Record<string, unknown>;
    try {
      if (!this.onHostCall) throw new Error(`${message.method} is not available`);
      reply = { replyTo: message.call, result: (await this.onHostCall(this.plugin.id, message.method, message.args)) ?? null };
    } catch (error) {
      reply = { replyTo: message.call, error: (error as Error).message };
    }
    await this.writer?.write(new TextEncoder().encode(JSON.stringify(reply) + "\n")).catch(() => {});
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
        if (message.call !== undefined) this.answerHostCall(message);
        else if (message.ready) ready.resolve();
        else if (message.id === undefined) ready.reject(new Error(message.error));
        else {
          const call = this.pending.get(message.id);
          if (message.error !== undefined) call?.reject(new PluginCallError("error", String(message.error)));
          else call?.resolve(message.result);
        }
      }
    }
  }
}
