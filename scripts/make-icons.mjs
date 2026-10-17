// Generates the app icon set (SVG + PNGs) with no third-party dependencies.
// Run with: npm run icons
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');
const iconsDir = join(publicDir, 'icons');
const tauriIconsDir = join(here, '..', 'src-tauri', 'icons');

const TOP = [124, 92, 255];
const BOTTOM = [76, 31, 214];
const GLYPH = [255, 255, 255];

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Signed distance to a rounded rectangle centred at (cx, cy).
function roundedRectSdf(px, py, cx, cy, halfW, halfH, radius) {
  const dx = Math.abs(px - cx) - (halfW - radius);
  const dy = Math.abs(py - cy) - (halfH - radius);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - radius;
}

function coverage(distance) {
  return clamp(0.5 - distance);
}

function sample(px, py, size) {
  const s = size;
  const bg = roundedRectSdf(px, py, s / 2, s / 2, s / 2, s / 2, s * 0.235);
  const bgAlpha = coverage(bg);
  if (bgAlpha <= 0) return [0, 0, 0, 0];

  const gradient = clamp(py / s);
  let color = mix(TOP, BOTTOM, gradient);

  // Three note lines; the first (title) line is thicker, echoing the app's rule.
  const lines = [
    { cy: 0.335, h: 0.052, left: 0.27, right: 0.73, alpha: 1 },
    { cy: 0.5, h: 0.036, left: 0.27, right: 0.64, alpha: 0.82 },
    { cy: 0.645, h: 0.036, left: 0.27, right: 0.55, alpha: 0.62 },
  ];

  let glyph = 0;
  for (const line of lines) {
    const cx = ((line.left + line.right) / 2) * s;
    const halfW = ((line.right - line.left) / 2) * s;
    const halfH = (line.h / 2) * s;
    const distance = roundedRectSdf(px, py, cx, line.cy * s, halfW, halfH, halfH);
    glyph = Math.max(glyph, coverage(distance) * line.alpha);
  }

  color = mix(color, GLYPH, glyph);
  return [color[0], color[1], color[2], bgAlpha * 255];
}

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const sub = 3;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < sub; sy += 1) {
        for (let sx = 0; sx < sub; sx += 1) {
          const [sr, sg, sb, sa] = sample(x + (sx + 0.5) / sub, y + (sy + 0.5) / sub, size);
          r += sr;
          g += sg;
          b += sb;
          a += sa;
        }
      }
      const n = sub * sub;
      const index = (y * size + x) * 4;
      rgba[index] = Math.round(r / n);
      rgba[index + 1] = Math.round(g / n);
      rgba[index + 2] = Math.round(b / n);
      rgba[index + 3] = Math.round(a / n);
    }
  }
  return rgba;
}

let crcTable = null;
function crc32(buffer) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let crc = -1;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function encodeIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + pngs.length * 16;
  for (const { size, data } of pngs) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((png) => png.data)]);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Plain Note">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7c5cff" />
      <stop offset="1" stop-color="#4c1fd6" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="120" fill="url(#g)" />
  <rect x="138" y="158" width="236" height="28" rx="14" fill="#ffffff" />
  <rect x="138" y="246" width="190" height="18" rx="9" fill="#ffffff" opacity="0.82" />
  <rect x="138" y="320" width="140" height="18" rx="9" fill="#ffffff" opacity="0.62" />
</svg>
`;

const outputs = [
  [publicDir, 'icon.svg', svg, 'utf8'],
  [iconsDir, 'icon-192.png', null, 'buffer', 192],
  [iconsDir, 'icon-512.png', null, 'buffer', 512],
  [iconsDir, 'maskable-512.png', null, 'buffer', 512],
  [iconsDir, 'apple-touch-icon.png', null, 'buffer', 180],
  [tauriIconsDir, 'icon.png', null, 'buffer', 512],
  [tauriIconsDir, '32x32.png', null, 'buffer', 32],
  [tauriIconsDir, '128x128.png', null, 'buffer', 128],
  [tauriIconsDir, '128x128@2x.png', null, 'buffer', 256],
];

for (const [directory, name, content, encoding, size] of outputs) {
  mkdirSync(directory, { recursive: true });
  const data = encoding === 'utf8' ? content : encodePng(size, render(size));
  writeFileSync(join(directory, name), data);
  console.log(`wrote ${join(directory, name)}`);
}

mkdirSync(tauriIconsDir, { recursive: true });
const ico = encodeIco([
  { size: 256, data: encodePng(256, render(256)) },
  { size: 128, data: encodePng(128, render(128)) },
  { size: 64, data: encodePng(64, render(64)) },
  { size: 32, data: encodePng(32, render(32)) },
]);
writeFileSync(join(tauriIconsDir, 'icon.ico'), ico);
console.log(`wrote ${join(tauriIconsDir, 'icon.ico')}`);

