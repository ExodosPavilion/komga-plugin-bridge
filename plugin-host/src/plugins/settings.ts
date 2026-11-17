// Plugin settings (declared in the manifest, values stored in the host's database) and each
// plugin's private storage. Everything is keyed by plugin id, and the id always comes from the
// host (the process a call arrived from), never from the plugin, so plugins cannot reach each other.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Database } from "../db/database.ts";
import type { InstalledPlugin, PluginStore } from "./store.ts";

export type SettingType = "string" | "number" | "boolean";

export interface SettingField {
  name: string;
  type: SettingType;
  default?: string | number | boolean;
  help: string;
  secret: boolean;
}

export type SettingValue = string | number | boolean;

export class UnknownPluginError extends Error {}

export class PluginData {
  constructor(private readonly db: Database, private readonly plugins: PluginStore) {}

  private plugin(id: string): InstalledPlugin {
    const plugin = this.plugins.list().find((p) => p.id === id);
    if (!plugin) throw new UnknownPluginError(`No plugin "${id}" is installed.`);
    return plugin;
  }

  /** The fields declared in the plugin's manifest. */
  async fields(pluginId: string): Promise<SettingField[]> {
    const plugin = this.plugin(pluginId);
    const manifest = JSON.parse(await readFile(join(plugin.dir, "manifest.json"), "utf8"));
    const declared: unknown[] = Array.isArray(manifest.settings) ? manifest.settings : [];
    return declared.flatMap((raw) => {
      const f = raw as Record<string, unknown>;
      if (typeof f?.name !== "string" || !["string", "number", "boolean"].includes(f.type as string)) return [];
      return [{
        name: f.name,
        type: f.type as SettingType,
        default: f.default as SettingValue | undefined,
        help: typeof f.help === "string" ? f.help : "",
        secret: f.secret === true,
      }];
    });
  }

  private stored(pluginId: string): Map<string, SettingValue> {
    const rows = this.db.prepare("SELECT name, value FROM plugin_settings WHERE plugin_id = ?").all(pluginId);
    return new Map(rows.map((r) => [String(r.name), JSON.parse(String(r.value))]));
  }

  /** What the plugin itself sees: stored values over manifest defaults. Secrets included. */
  async effective(pluginId: string): Promise<Record<string, SettingValue>> {
    const stored = this.stored(pluginId);
    const result: Record<string, SettingValue> = {};
    for (const field of await this.fields(pluginId)) {
      const value = stored.get(field.name) ?? field.default;
      if (value !== undefined) result[field.name] = value;
    }
    return result;
  }

  /** What an admin sees: the form. Secret values are never included, only whether one is set. */
  async form(pluginId: string) {
    const stored = this.stored(pluginId);
    return (await this.fields(pluginId)).map((field) => {
      const base = { name: field.name, type: field.type, help: field.help, secret: field.secret };
      if (field.secret) return { ...base, isSet: stored.has(field.name) };
      return { ...base, default: field.default, value: stored.get(field.name) ?? field.default, isSet: stored.has(field.name) };
    });
  }

  /**
   * Validates and saves the given values; only the given settings change. A null value clears a
   * setting back to its default. Returns error messages; on any error nothing is saved.
   */
  async save(pluginId: string, values: Record<string, unknown>): Promise<string[]> {
    const fields = new Map((await this.fields(pluginId)).map((f) => [f.name, f]));
    const errors: string[] = [];
    for (const [name, value] of Object.entries(values)) {
      const field = fields.get(name);
      if (!field) {
        errors.push(`Setting "${name}" is not declared by plugin "${pluginId}".`);
      } else if (value !== null && typeof value !== field.type) {
        errors.push(`Setting "${name}" must be a ${field.type}, but got a ${valueKind(value)}.`);
      } else if (typeof value === "number" && !Number.isFinite(value)) {
        errors.push(`Setting "${name}" must be a finite number.`);
      }
    }
    if (errors.length > 0) return errors;
    this.db.exec("BEGIN");
    try {
      for (const [name, value] of Object.entries(values)) {
        if (value === null) {
          this.db.prepare("DELETE FROM plugin_settings WHERE plugin_id = ? AND name = ?").run(pluginId, name);
        } else {
          this.db.prepare(
            "INSERT INTO plugin_settings (plugin_id, name, value) VALUES (?, ?, ?) ON CONFLICT(plugin_id, name) DO UPDATE SET value = excluded.value",
          ).run(pluginId, name, JSON.stringify(value));
        }
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return [];
  }

  storageGet(pluginId: string, key: string): unknown {
    const row = this.db.prepare("SELECT value FROM plugin_storage WHERE plugin_id = ? AND key = ?").get(pluginId, key);
    return row ? JSON.parse(String(row.value)) : null;
  }

  storageSet(pluginId: string, key: string, value: unknown): void {
    this.db.prepare(
      "INSERT INTO plugin_storage (plugin_id, key, value) VALUES (?, ?, ?) ON CONFLICT(plugin_id, key) DO UPDATE SET value = excluded.value",
    ).run(pluginId, key, JSON.stringify(value ?? null));
  }

  storageDelete(pluginId: string, key: string): void {
    this.db.prepare("DELETE FROM plugin_storage WHERE plugin_id = ? AND key = ?").run(pluginId, key);
  }

  storageKeys(pluginId: string): string[] {
    return this.db.prepare("SELECT key FROM plugin_storage WHERE plugin_id = ? ORDER BY key").all(pluginId)
      .map((r) => String(r.key));
  }

  /** Answers the Plugin API calls a plugin makes from inside its process. */
  async handleApiCall(pluginId: string, method: string, params: unknown): Promise<unknown> {
    const p = (params ?? {}) as { key?: unknown; name?: unknown; value?: unknown };
    switch (method) {
      case "settings.all":
        return await this.effective(pluginId);
      case "settings.get":
        return (await this.effective(pluginId))[String(p.name)] ?? null;
      case "storage.get":
        return this.storageGet(pluginId, String(p.key));
      case "storage.set":
        this.storageSet(pluginId, String(p.key), p.value);
        return null;
      case "storage.delete":
        this.storageDelete(pluginId, String(p.key));
        return null;
      case "storage.keys":
        return this.storageKeys(pluginId);
      default:
        throw new Error(`Unknown Plugin API method "${method}".`);
    }
  }
}

function valueKind(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "list";
  return typeof value;
}
