// Komga events as plugins receive them. A plugin subscribes in its manifest, with a contribution:
//   "contributions": [{ "type": "events", "subscribe": ["LibraryScanned", "BookAdded"] }]
// and handles them in an `onEvent({ type, data }, api)` hook. Event names are Komga's own
// domain event names (see the Bridge's EventMapper). A plugin receives only what it subscribed to.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateManifest } from "./manifest.ts";
import type { PluginStore } from "./store.ts";
import type { PluginSupervisor } from "./supervisor.ts";

export interface KomgaEvent {
  type: string;
  data: Record<string, unknown>;
}

const cache = new Map<string, Set<string>>();

/** The event types a plugin subscribed to in its manifest. Unreadable manifests subscribe to nothing. */
async function subscriptionsOf(plugin: { id: string; version: string; dir: string }): Promise<Set<string>> {
  const key = `${plugin.id}@${plugin.version}@${plugin.dir}`;
  const known = cache.get(key);
  if (known) return known;
  const types = new Set<string>();
  try {
    const result = validateManifest(await readFile(join(plugin.dir, "manifest.json"), "utf8"));
    if (result.ok) {
      for (const contribution of result.manifest.contributions) {
        const c = contribution as { type?: unknown; subscribe?: unknown };
        if (c?.type === "events" && Array.isArray(c.subscribe)) {
          for (const name of c.subscribe) if (typeof name === "string") types.add(name);
        }
      }
    }
  } catch { /* no readable manifest: no subscriptions */ }
  cache.set(key, types);
  return types;
}

/**
 * Hands an event to every enabled, running plugin that subscribed to its type. Goes through the
 * supervisor, so time limits and failure counting apply as for metadata calls. Returns the ids of
 * the plugins that handled it.
 */
export async function dispatchEvent(
  plugins: PluginStore,
  supervisor: PluginSupervisor,
  event: KomgaEvent,
): Promise<string[]> {
  const subscribers = new Set<string>();
  for (const plugin of plugins.list()) {
    if (plugin.enabled && (await subscriptionsOf(plugin)).has(event.type)) subscribers.add(plugin.id);
  }
  if (subscribers.size === 0) return [];
  const results = await supervisor.callAll("onEvent", event, (id) => subscribers.has(id));
  return results.map((r) => r.pluginId);
}
