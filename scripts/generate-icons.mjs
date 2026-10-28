import {deflateSync} from 'node:zlib';
import {writeFileSync, mkdirSync} from 'node:fs';
// Dependency-free PNG generator for the original SnapBite install icon.
function crc32(bytes) {let c = 0xffffffff; for (const b of bytes) {c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;} return (c ^ 0xffffffff) >>> 0;}
function chunk(type, bytes) {const name = Buffer.from(type), length = Buffer.alloc(4), checksum = Buffer.alloc(4); length.writeUInt32BE(bytes.length); checksum.writeUInt32BE(crc32(Buffer.concat([name, bytes]))); return Buffer.concat([length, name, bytes, checksum]);}
mkdirSync('public', {recursive:true});
for (const size of [192, 512]) {
  const data = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const px = x / size * 128, py = y / size * 128;
    const fork = ([40, 50, 60].some(v => Math.abs(px - v) <= 3.5) && py > 32 && py < 63) || (px > 37 && px < 64 && py > 58 && py < 66) || (Math.abs(px - 50) < 3.5 && py >= 62 && py < 97);
    const knife = (Math.abs(px - 87) < 3.5 && py > 32 && py < 97) || (px > 70 && px < 87 && py > 33 && py < 67 && (px - 87)**2 / 20**2 + (py - 65)**2 / 34**2 < 1);
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    data.set(fork || knife ? [22, 32, 20, 255] : [195, 246, 107, 255], offset);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  writeFileSync(`public/icon-${size}.png`, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(data)),chunk('IEND',Buffer.alloc(0))]));
}
