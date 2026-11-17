// Keeps one process per enabled plugin and fans calls out to them. A plugin that fails or is
// slow never affects the others; every failure is recorded, and a plugin that fails
// `config.failureThreshold` times in a row is disabled until an admin re-enables it.
import type { Config } from "../config.ts";
import { type ApiCallHandler, PluginProcess } from "./process.ts";
import { type FailureKind, type FailureLog, PluginCallError } from "./failures.ts";
import type { CapabilityStore } from "./capabilities.ts";
import type { PluginStore } from "./store.ts";

export class PluginSupervisor {
  private processes = new Map<string, PluginProcess>();

  constructor(
    private readonly store: PluginStore,
    private readonly config: Config,
    private readonly failures: FailureLog,
    private readonly capabilities: CapabilityStore,
    private readonly onHostCall?: ApiCallHandler,
  ) {}

  async startEnabled(): Promise<void> {
    for (const plugin of this.store.list()) {
      if (plugin.enabled) await this.start(plugin.id);
    }
  }

  private async start(id: string): Promise<void> {
    const plugin = this.store.get(id);
    if (!plugin) return;
    const process = new PluginProcess(plugin, this.config, () => this.capabilities.approved(plugin.id), this.onHostCall);
    this.processes.set(id, process);
    try {
      await process.start();
    } catch (error) {
      this.fail(id, "crash", `failed to start: ${(error as Error).message}`);
    }
  }

  /** Admin action: turns a plugin on (for example after it was disabled automatically). */
  async enable(id: string): Promise<boolean> {
    if (!this.store.get(id)) return false;
    this.failures.recordSuccess(id);
    this.failures.markAutoDisabled(id, false);
    this.store.setEnabled(id, true);
    await this.processes.get(id)?.stop();
    await this.start(id);
    return true;
  }

  private fail(id: string, kind: FailureKind, reason: string): void {
    console.error(`[plugin-host] plugin ${id} ${kind}: ${reason}`);
    const count = this.failures.recordFailure(id, kind, reason);
    if (count >= this.config.failureThreshold && this.store.get(id)?.enabled) {
      console.error(`[plugin-host] plugin ${id} disabled after ${count} failures in a row`);
      this.store.setEnabled(id, false);
      this.failures.markAutoDisabled(id, true);
      const process = this.processes.get(id);
      this.processes.delete(id);
      process?.stop().catch(() => {});
    }
  }

  isRunning(id: string): boolean {
    return this.processes.get(id)?.running ?? false;
  }

  pid(id: string): number | null {
    return this.processes.get(id)?.pid ?? null;
  }

  /** Calls every running plugin; a plugin that fails or is slow is skipped, never fatal. */
  async callAll(method: string, params: unknown): Promise<{ pluginId: string; result: unknown }[]> {
    const settled = await Promise.all(
      [...this.processes.entries()].map(async ([pluginId, process]) => {
        try {
          const result = await process.call(method, params, this.config.callTimeoutMs);
          this.failures.recordSuccess(pluginId);
          return { pluginId, result };
        } catch (error) {
          const kind = error instanceof PluginCallError ? error.kind : "error";
          this.fail(pluginId, kind, `${method}: ${(error as Error).message}`);
          return null;
        }
      }),
    );
    return settled.filter((r): r is { pluginId: string; result: unknown } => r !== null)
      .sort((a, b) => a.pluginId.localeCompare(b.pluginId));
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.processes.values()].map((p) => p.stop()));
    this.processes.clear();
  }
}
