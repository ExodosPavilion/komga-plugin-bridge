// Reading a plugin archive (a zip, stored or deflate entries) into memory. Untrusted input: entry
// names are checked so nothing can be written outside the plugin's folder, and the size is capped.

/** Uncompressed size cap for one plugin archive. */
export const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;

export class ArchiveError extends Error {}

export interface ArchiveFile {
  /** Path inside the plugin, with forward slashes and no leading folder. */
  path: string;
  data: Uint8Array;
}

/**
 * Reads every file of the archive. When all files sit inside one top-level folder (as zips made
 * by hand or by GitHub's "source archive" do) that folder is stripped, so the manifest is at the
 * root either way.
 */
export async function readArchive(bytes: Uint8Array): Promise<ArchiveFile[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new ArchiveError("The upload is not a zip archive.");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);

  const files: ArchiveFile[] = [];
  let total = 0;
  try {
    for (let i = 0; i < count; i++) {
      if (view.getUint32(offset, true) !== 0x02014b50) throw new ArchiveError("The zip archive is damaged.");
      const flags = view.getUint16(offset + 8, true);
      const method = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const size = view.getUint32(offset + 24, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const local = view.getUint32(offset + 42, true);
      const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
      offset += 46 + nameLength + extraLength + commentLength;

      if (name.endsWith("/")) continue; // a folder entry
      if (flags & 1) throw new ArchiveError("Encrypted zip archives are not supported.");
      const path = safePath(name);
      total += size;
      if (total > MAX_ARCHIVE_BYTES) throw new ArchiveError("The archive is too large to be a plugin.");

      const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      let data = bytes.subarray(dataStart, dataStart + compressedSize);
      if (method === 8) {
        const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        data = new Uint8Array(await new Response(stream).arrayBuffer());
      } else if (method !== 0) {
        throw new ArchiveError(`The archive uses an unsupported zip compression method (${method}).`);
      }
      if (data.length !== size) throw new ArchiveError("The zip archive is damaged.");
      files.push({ path, data });
    }
  } catch (error) {
    if (error instanceof ArchiveError) throw error;
    throw new ArchiveError("The upload is not a readable zip archive.");
  }
  return stripSingleFolder(files);
}

function safePath(name: string): string {
  const segments = name.split("/");
  if (name.startsWith("/") || name.includes("\\") || /^[A-Za-z]:/.test(name) || segments.includes("..")) {
    throw new ArchiveError(`The archive entry "${name}" would be written outside the plugin folder.`);
  }
  return segments.filter((s) => s !== "" && s !== ".").join("/");
}

function stripSingleFolder(files: ArchiveFile[]): ArchiveFile[] {
  if (files.some((f) => f.path === "manifest.json") || files.length === 0) return files;
  const top = files[0].path.split("/")[0];
  if (!files.every((f) => f.path.startsWith(`${top}/`))) return files;
  return files.map((f) => ({ path: f.path.slice(top.length + 1), data: f.data }));
}
