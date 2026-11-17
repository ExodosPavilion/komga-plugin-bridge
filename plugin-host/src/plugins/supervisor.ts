// Keeps one process per enabled plugin and fans calls out to them. A plugin that fails or is
// slow never affects the others; every failure is recorded, and a plugin that fails
// `config.failureThreshold` times in a row is disabled until an admin re-enables it.
import type { Config } from "../config.ts";
import { type ApiCallHandler, PluginProcess } from "./process.ts";
import { type FailureKind, type FailureLog, PluginCallError } from "./failures.ts";
import { type CapabilityStore, type Permissions, resolvePermissions } from "./capabilities.ts";
import { enabledLibraryRoots } from "./file-access.ts";
import type { LibraryScopes } from "./library-scope.ts";
import type { PluginStore } from "./store.ts";

export class CapabilitiesNotApprovedError extends Error {
  constructor(readonly pluginId: string, readonly pending: string[]) {
    super(`${pluginId} cannot be enabled until its capabilities are approved: ${pending.join(", ")}`);
  }
}

export class PluginSupervisor {
  private processes = new Map<string, PluginProcess>();
  /** Processes of plugins disabled automatically, still being stopped; stopAll waits for them. */
  private stopping = new Set<Promise<void>>();

  /** Plugins started while Komga's library list could not be read, so their file access may be short. */
  private incomplete = new Set<string>();
  private lastRetry = new Map<string, number>();
  /** Libraries Komga listed at the last look, and when: a call about another one means a new library. */
  private knownLibraries = new Set<string>();
  /** When a call about a not-yet-listed library last caused a look, by library id. */
  private missedAt = new Map<string, number>();

  constructor(
    private readonly store: PluginStore,
    private readonly config: Config,
    private readonly failures: FailureLog,
    private readonly capabilities: CapabilityStore,
    private readonly scopes: LibraryScopes,
    private readonly onHostCall?: ApiCallHandler,
  ) {}

  async startEnabled(): Promise<void> {
    for (const plugin of this.store.list()) {
      if (plugin.enabled && this.capabilities.pending(plugin.id).length === 0) await this.start(plugin.id);
    }
  }

  private async start(id: string): Promise<void> {
    const plugin = this.store.get(id);
    if (!plugin || this.capabilities.pending(id).length > 0) return;
    const process = new PluginProcess(plugin, this.config, () => this.permissionsOf(id), this.onHostCall);
    this.processes.set(id, process);
    try {
      await process.start();
    } catch (error) {
      this.fail(id, "crash", `failed to start: ${(error as Error).message}`);
    }
  }

  /**
   * What a plugin process may do now: its approved capabilities, with file-read limited to the
   * libraries the plugin is enabled in (file-access.ts).
   */
  async permissionsOf(id: string): Promise<Permissions> {
    const approved = this.capabilities.approved(id);
    let roots: string[] = [];
    if (approved.some((c) => c.startsWith("file-read:"))) {
      const found = await enabledLibraryRoots(this.config, this.scopes, id);
      roots = found.roots;
      if (found.complete) {
        this.incomplete.delete(id);
        this.knownLibraries = new Set(found.known);
      } else this.incomplete.add(id);
    }
    return resolvePermissions(approved, roots);
  }

  /**
   * Called before a call about these libraries. A library Komga did not list at the last look
   * (added since the plugins started) may open file access for plugins enabled in it, so the
   * plugins that read library files are re-checked (at most every 5 seconds per library).
   */
  async noteLibraries(libraryIds: string[]): Promise<void> {
    const now = Date.now();
    const unseen = libraryIds.filter((id) => !this.knownLibraries.has(id) && now - (this.missedAt.get(id) ?? 0) > 5000);
    if (unseen.length === 0) return;
    for (const id of unseen) this.missedAt.set(id, now);
    for (const id of [...this.processes.keys()]) {
      if (this.capabilities.approved(id).some((c) => c.startsWith("file-read:"))) {
        await this.refreshPermissions(id).catch(() => {});
      }
    }
  }

  /**
   * Restarts a running plugin when what it may do has changed (its library choice or approved
   * capabilities changed). A plugin whose permissions are unchanged keeps its process.
   */
  async refreshPermissions(id: string): Promise<void> {
    const process = this.processes.get(id);
    if (!process?.running || !process.permissions) return;
    const next = await this.permissionsOf(id);
    const before = process.permissions;
    const same = before.network === next.network &&
      JSON.stringify([...before.read].sort()) === JSON.stringify([...next.read].sort());
    if (same) return;
    await process.stop();
    await this.start(id);
  }

  /**
   * Admin action: turns a plugin on (for example after it was disabled automatically). Throws
   * CapabilitiesNotApprovedError while the plugin declares capabilities no admin has approved.
   */
  async enable(id: string): Promise<boolean> {
    if (!this.store.get(id)) return false;
    const pending = this.capabilities.pending(id);
    if (pending.length > 0) throw new CapabilitiesNotApprovedError(id, pending);
    this.failures.recordSuccess(id);
    this.failures.markAutoDisabled(id, false);
    this.store.setEnabled(id, true);
    await this.processes.get(id)?.stop();
    await this.start(id);
    return true;
  }

  /** Admin action: stops a plugin and keeps it off, with its settings and storage kept. */
  async disable(id: string): Promise<boolean> {
    if (!this.store.get(id)) return false;
    this.store.setEnabled(id, false);
    const process = this.processes.get(id);
    this.processes.delete(id);
    await process?.stop();
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
      if (process) {
        const stopped = process.stop().catch(() => {}).finally(() => this.stopping.delete(stopped));
        this.stopping.add(stopped);
      }
    }
  }

  isRunning(id: string): boolean {
    return this.processes.get(id)?.running ?? false;
  }

  pid(id: string): number | null {
    return this.processes.get(id)?.pid ?? null;
  }

  /** Ids of the plugins that are running now, in a stable order. */
  runningIds(): string[] {
    return [...this.processes.entries()].filter(([, p]) => p.running).map(([id]) => id).sort();
  }

  /**
   * Calls one running plugin within the time limit, recording success or failure like any other
   * call. Returns null when the plugin is not running or the call failed.
   */
  async callPlugin(pluginId: string, method: string, params: unknown): Promise<{ result: unknown } | null> {
    // Komga's library list was unreachable when this plugin started (the host may have come up
    // first): look again, at most every few seconds, so its file access is not lost until restart.
    if (this.incomplete.has(pluginId) && Date.now() - (this.lastRetry.get(pluginId) ?? 0) > 5000) {
      this.lastRetry.set(pluginId, Date.now());
      await this.refreshPermissions(pluginId).catch(() => {});
    }
    const process = this.processes.get(pluginId);
    if (!process) return null;
    try {
      const result = await process.call(method, params, this.config.callTimeoutMs);
      this.failures.recordSuccess(pluginId);
      return { result };
    } catch (error) {
      const kind = error instanceof PluginCallError ? error.kind : "error";
      this.fail(pluginId, kind, `${method}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Calls every running plugin (or only those `only` accepts); a plugin that fails or is slow is
   * skipped, never fatal. Failures are counted the same way for every kind of call.
   */
  async callAll(
    method: string,
    params: unknown,
    only?: (pluginId: string) => boolean,
  ): Promise<{ pluginId: string; result: unknown }[]> {
    const settled = await Promise.all(
      [...this.processes.keys()].filter((pluginId) => !only || only(pluginId)).map(async (pluginId) => {
        const answer = await this.callPlugin(pluginId, method, params);
        return answer && { pluginId, result: answer.result };
      }),
    );
    return settled.filter((r): r is { pluginId: string; result: unknown } => r !== null)
      .sort((a, b) => a.pluginId.localeCompare(b.pluginId));
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.processes.values()].map((p) => p.stop()));
    this.processes.clear();
    await Promise.all([...this.stopping]);
  }
}
