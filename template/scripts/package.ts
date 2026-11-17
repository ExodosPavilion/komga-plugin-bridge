// Release packaging: builds dist/<id>-<version>.zip, exactly the archive the Plugin Manager
// installs from a GitHub release. The archive holds manifest.json and the plugin's code at its
// root (no wrapping folder): manifest.json, the entry module, and everything under src/.
//
//   deno task package
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { zip, type ZipEntry } from "./zip.ts";

const root = fileURLToPath(new URL("..", import.meta.url));

async function* walk(dir: string, prefix = ""): AsyncGenerator<string> {
  for (const entry of (await readdir(join(dir, prefix), { withFileTypes: true })).sort((a, b) =>
    a.name < b.name ? -1 : 1
  )) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) yield* walk(dir, path);
    else yield path;
  }
}

const manifestText = await readFile(join(root, "manifest.json"), "utf8");
const manifest = JSON.parse(manifestText);
for (const field of ["id", "version", "apiVersion"]) {
  if (typeof manifest[field] !== "string" || manifest[field] === "") {
    throw new Error(`manifest.json: "${field}" is required`);
  }
}
if (!/^[A-Za-z0-9._-]+$/.test(manifest.id) || !/^[A-Za-z0-9._+-]+$/.test(manifest.version)) {
  throw new Error("manifest.json: id and version may only contain letters, digits and . _ + -");
}
const entry: string = manifest.entry ?? "index.ts";

const files = ["manifest.json", entry];
try {
  for await (const file of walk(root, "src")) files.push(`src/${file.slice("src/".length)}`);
} catch (error) {
  if ((error as { code?: string }).code !== "ENOENT") throw error;
}

const entries: ZipEntry[] = [];
for (const name of [...new Set(files)]) {
  entries.push({ name, data: await readFile(join(root, name)) });
}
await mkdir(join(root, "dist"), { recursive: true });
const out = join(root, "dist", `${manifest.id}-${manifest.version}.zip`);
await writeFile(out, await zip(entries));
console.log(`wrote ${out} (${entries.map((e) => e.name).join(", ")})`);
