import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public', 'icons');

const table = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = table[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const pixel = color(x, y, size);
      const offset = row + 1 + x * 4;
      raw[offset] = pixel[0];
      raw[offset + 1] = pixel[1];
      raw[offset + 2] = pixel[2];
      raw[offset + 3] = pixel[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function color(x, y, size) {
  const px = (x + 0.5) / size;
  const py = (y + 0.5) / size;
  const inBox = px > 0.08 && px < 0.92 && py > 0.08 && py < 0.92;
  if (!inBox) return [0, 0, 0, 0];
  const cx = px - 0.52;
  const cy = py - 0.5;
  const radius = Math.hypot(cx, cy);
  const ring = radius > 0.18 && radius < 0.3;
  const angle = Math.atan2(cy, cx);
  const gap = angle > -0.4 && angle < 0.7;
  const head = px > 0.58 && px < 0.74 && py > 0.28 && py < 0.46;
  if ((ring && !gap) || head) return [215, 161, 95, 255];
  return [23, 25, 29, 255];
}

mkdirSync(root, { recursive: true });
for (const size of [16, 48, 128]) writeFileSync(join(root, `icon${size}.png`), png(size));
