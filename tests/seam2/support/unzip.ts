// Minimal zip reader for tests: extracts a zip archive into a folder (stored and deflate entries).
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function unzip(archive: Uint8Array, into: string): Promise<string[]> {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  let end = archive.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error("not a zip archive");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(archive.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith("/")) continue;
    const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    let data = archive.subarray(dataStart, dataStart + compressedSize);
    if (method === 8) {
      const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      data = new Uint8Array(await new Response(stream).arrayBuffer());
    } else if (method !== 0) throw new Error(`unsupported zip method ${method}`);
    const target = join(into, name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
    names.push(name);
  }
  return names;
}
