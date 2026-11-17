// Keeps one process per enabled plugin and fans calls out to them. Failure handling beyond
// "one plugin failing never affects the others" (recording, auto-disable) is a later ticket.
import type { Config } from "../config.ts";
import { PluginProcess } from "./process.ts";
import type { PluginStore } from "./store.ts";

export class PluginSupervisor {
  private processes = new Map<string, PluginProcess>();

  constructor(
    private readonly store: PluginStore,
    private readonly config: Config,
    private readonly onHostCall?: (pluginId: string, method: string, args: unknown[]) => Promise<unknown>,
  ) {}

  async startEnabled(): Promise<void> {
    for (const plugin of this.store.list()) {
      if (!plugin.enabled) continue;
      const process = new PluginProcess(plugin, this.config, this.onHostCall);
      this.processes.set(plugin.id, process);
      try {
        await process.start();
      } catch (error) {
        console.error(`[plugin-host] plugin ${plugin.id} failed to start: ${(error as Error).message}`);
      }
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
      [...this.processes.entries()].filter(([, p]) => p.running).map(async ([pluginId, process]) => {
        try {
          return { pluginId, result: await process.call(method, params, this.config.callTimeoutMs) };
        } catch (error) {
          console.error(`[plugin-host] plugin ${pluginId} ${method} failed: ${(error as Error).message}`);
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
