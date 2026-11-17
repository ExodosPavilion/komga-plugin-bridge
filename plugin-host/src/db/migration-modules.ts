// Finds the migrations: every `<yyyymmdd>_<n>_<what>.ts` in ./migrations exports `up(db)`, in name
// order. A schema change adds a file there and edits nothing. The test runner package
// (plugin-test-runner/scripts/bundle.ts) replaces this file with a static list of imports,
// because a package served from a registry has no folder to read.
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { DatabaseSync } from "node:sqlite";

export interface Migration {
  name: string;
  up(db: DatabaseSync): void;
}

const migrationsDir = fileURLToPath(new URL("./migrations/", import.meta.url));

export async function loadMigrations(): Promise<Migration[]> {
  const migrations: Migration[] = [];
  for (const name of (await readdir(migrationsDir)).filter((n) => n.endsWith(".ts")).sort()) {
    const module: { up(db: DatabaseSync): void } = await import(new URL(`./migrations/${name}`, import.meta.url).href);
    migrations.push({ name, up: module.up });
  }
  return migrations;
}
