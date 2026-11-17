// Writes a fixture library on disk: series folders holding one-page .cbz books.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// A valid 1x1 PNG.
const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (data: Uint8Array) => {
  let c = 0xffffffff;
  for (const byte of data) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** A zip with a single stored (uncompressed) entry. */
function zipWithOneFile(name: string, data: Uint8Array): Uint8Array {
  const nameBytes = new TextEncoder().encode(name);
  const crc = crc32(data);
  const local = new DataView(new ArrayBuffer(30));
  local.setUint32(0, 0x04034b50, true);
  local.setUint16(4, 20, true);
  local.setUint32(14, crc, true);
  local.setUint32(18, data.length, true);
  local.setUint32(22, data.length, true);
  local.setUint16(26, nameBytes.length, true);
  const central = new DataView(new ArrayBuffer(46));
  central.setUint32(0, 0x02014b50, true);
  central.setUint16(4, 20, true);
  central.setUint16(6, 20, true);
  central.setUint32(16, crc, true);
  central.setUint32(20, data.length, true);
  central.setUint32(24, data.length, true);
  central.setUint16(28, nameBytes.length, true);
  const centralOffset = 30 + nameBytes.length + data.length;
  const centralSize = 46 + nameBytes.length;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, 1, true);
  end.setUint16(10, 1, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, centralOffset, true);
  const parts = [
    new Uint8Array(local.buffer), nameBytes, data,
    new Uint8Array(central.buffer), nameBytes, new Uint8Array(end.buffer),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export async function writeSeries(
  library: string,
  name: string,
  files: Record<string, string> = {},
): Promise<void> {
  const dir = join(library, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "001.cbz"), zipWithOneFile("001.png", PNG));
  for (const [file, content] of Object.entries(files)) await writeFile(join(dir, file), content);
}
