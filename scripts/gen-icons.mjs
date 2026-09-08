#!/usr/bin/env node
/* Writes the home-screen icons with nothing but zlib, so the build stays
   dependency-free. A rounded ink square with the pink plus from the wordmark. */

import { deflateSync } from "node:zlib";
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INK = [47, 42, 61];
const PINK = [242, 104, 126];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Coverage of a pixel by a rounded rect, sampled for a soft edge. */
function roundedCoverage(x, y, size, radius) {
  const s = 3;
  let hits = 0;
  for (let i = 0; i < s; i++) {
    for (let j = 0; j < s; j++) {
      const px = x + (i + 0.5) / s;
      const py = y + (j + 0.5) / s;
      const dx = Math.max(radius - px, px - (size - radius), 0);
      const dy = Math.max(radius - py, py - (size - radius), 0);
      if (dx * dx + dy * dy <= radius * radius) hits++;
    }
  }
  return hits / (s * s);
}

function render(size) {
  const radius = size * 0.22;
  const arm = size * 0.13;   // thickness of the plus
  const reach = size * 0.30; // half-length of the plus
  const mid = size / 2;
  const rows = [];

  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0; // no per-row filter
    for (let x = 0; x < size; x++) {
      const cov = roundedCoverage(x, y, size, radius);
      const inPlus =
        (Math.abs(x + 0.5 - mid) <= arm && Math.abs(y + 0.5 - mid) <= reach) ||
        (Math.abs(y + 0.5 - mid) <= arm && Math.abs(x + 0.5 - mid) <= reach);
      const [r, g, b] = inPlus ? PINK : INK;
      const o = 1 + x * 4;
      row[o] = r;
      row[o + 1] = g;
      row[o + 2] = b;
      row[o + 3] = Math.round(cov * 255);
    }
    rows.push(row);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // truecolour with alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

await mkdir(path.join(root, "public"), { recursive: true });
for (const size of [192, 512]) {
  const png = render(size);
  await writeFile(path.join(root, `public/icon-${size}.png`), png);
  console.log(`icon-${size}.png  ${(png.length / 1024).toFixed(1)} kB`);
}
