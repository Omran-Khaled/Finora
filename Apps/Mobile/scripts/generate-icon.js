/**
 * FINORA BRAND ICON GENERATOR (placeholder asset).
 * Emits a valid 1024x1024 RGBA PNG — Deep Calm Obsidian canvas with the
 * Finora Trust Blue disc and an "F" mark. Pure Node (zlib only), no deps.
 * Replace with the final designed asset before store submission (Section 68).
 *
 * Run: node scripts/generate-icon.js
 */
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

const SIZE = 1024;

// --- CRC32 (PNG requirement) ---
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// --- Pixel helpers ---
function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

const BG = hexToRgb("#0B0F19"); // Deep Calm Obsidian
const DISC = hexToRgb("#3B82F6"); // Finora Trust Blue
const DISC_LIGHT = hexToRgb("#60A5FA");
const MARK = hexToRgb("#F8FAFC"); // textPrimary

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));

function put(x, y, rgb) {
  const rowStart = y * (SIZE * 4 + 1);
  const idx = rowStart + 1 + x * 4;
  raw[idx] = rgb[0];
  raw[idx + 1] = rgb[1];
  raw[idx + 2] = rgb[2];
  raw[idx + 3] = 255;
}

const cx = SIZE / 2;
const cy = SIZE / 2;
const radius = 340;
const innerRadius = 300;

for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // filter: none
  for (let x = 0; x < SIZE; x++) {
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= innerRadius) {
      // Upper hemisphere gets the lighter tint for depth
      put(x, y, dy < 0 ? DISC_LIGHT : DISC);
    } else if (dist <= radius) {
      put(x, y, BG); // obsidian ring gap acts as border
    } else {
      put(x, y, BG);
    }
  }
}

// "F" mark: vertical stem + two arms (drawn inside the disc)
const stemX0 = cx - 40, stemX1 = cx + 40;
const topY0 = cy - 210, topY1 = cy + 190;
for (let y = topY0; y <= topY1; y++)
  for (let x = stemX0; x <= stemX1; x++) put(x, y, MARK);
// Top arm
for (let y = topY0; y <= topY0 + 78; y++)
  for (let x = stemX0; x <= cx + 150; x++) put(x, y, MARK);
// Middle arm
for (let y = cy - 40; y <= cy + 34; y++)
  for (let x = stemX0; x <= cx + 110; x++) put(x, y, MARK);

// --- Assemble PNG ---
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type: RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = path.join(__dirname, "..", "assets", "icon.png");
fs.writeFileSync(out, png);
console.log("Wrote", out, png.length, "bytes");
