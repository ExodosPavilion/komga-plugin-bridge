// Installing a plugin from an archive. A reusable function: the upload route calls it with the
// uploaded bytes, and later install sources (GitHub releases) call it with what they download.
//
// The archive is validated before anything is written to the plugins folder (manifest, API
// version, id, entry file), unpacked beside the final folder and moved into place. The plugin is
// then recorded and its declared capabilities noted; it is enabled only if nothing is waiting
// for approval (see capabilities.ts). Installing an id that already exists upgrades it in place:
// settings and storage are kept, and an enabled plugin stays enabled unless the new version
// declares capabilities nobody approved yet.
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Config } from "../config.ts";
import { ArchiveError, readArchive } from "./archive.ts";
import type { CapabilityStore } from "./capabilities.ts";
import { validateManifest } from "./manifest.ts";
import type { PluginStore } from "./store.ts";
import type { PluginSupervisor } from "./supervisor.ts";

export interface InstallDeps {
  config: Config;
  plugins: PluginStore;
  capabilities: CapabilityStore;
  supervisor: PluginSupervisor;
}

export type InstallResult =
  | { ok: true; id: string; version: string; enabled: boolean; pending: string[]; upgraded: boolean }
  | { ok: false; reason: string };

/** A plugin id becomes a folder name, so it must be a plain one. */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const refuse = (reason: string): InstallResult => ({ ok: false, reason });
const exists = (path: string) => stat(path).then(() => true, () => false);

export async function installFromArchive(deps: InstallDeps, bytes: Uint8Array): Promise<InstallResult> {
  const { config, plugins, capabilities, supervisor } = deps;

  let files;
  try {
    files = await readArchive(bytes);
  } catch (error) {
    if (error instanceof ArchiveError) return refuse(error.message);
    throw error;
  }
  const manifestFile = files.find((f) => f.path === "manifest.json");
  if (!manifestFile) return refuse("The archive has no manifest.json at its top level.");
  const validated = validateManifest(new TextDecoder().decode(manifestFile.data));
  if (!validated.ok) return refuse(validated.reason);
  const { id, version, entry } = validated.manifest;
  if (!SAFE_ID.test(id)) {
    return refuse(`The plugin id "${id}" must start with a letter or digit and use only letters, digits, ".", "_" and "-".`);
  }
  const entryPath = entry.replace(/^\.\//, "");
  if (!files.some((f) => f.path === entryPath)) {
    return refuse(`The archive does not contain the plugin's entry file "${entry}".`);
  }

  const existing = plugins.get(id);
  const target = existing?.dir ?? join(config.pluginsDir, id);
  if (!existing && await exists(target)) {
    return refuse(`The plugins folder already has a folder named "${id}" that is not an installed plugin.`);
  }

  await mkdir(config.pluginsDir, { recursive: true });
  const staging = join(config.pluginsDir, `.install-${crypto.randomUUID()}`);
  try {
    for (const file of files) {
      const path = join(staging, file.path);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, file.data);
    }
    const wasEnabled = existing?.enabled === true;
    if (existing) await supervisor.disable(id);
    await rm(target, { recursive: true, force: true });
    await rename(staging, target);

    plugins.upsert({ id, version, dir: target, entry });
    await capabilities.syncDeclared({ id, version, dir: target, entry, enabled: false });
    const pending = capabilities.pending(id);
    if (pending.length > 0) {
      plugins.setEnabled(id, false);
    } else if (!existing || wasEnabled) {
      await supervisor.enable(id);
    }
    return { ok: true, id, version, enabled: plugins.get(id)?.enabled === true, pending, upgraded: existing !== undefined };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
