// Generador de iconos PWA sin dependencias externas.
// Dibuja un "vinilo" con el degradado de marca (cian → rosa) y exporta PNG
// (RGBA) en varios tamaños. Ejecutar: `node scripts/gen-icons.mjs`.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(OUT, { recursive: true });

// ── PNG helpers ────────────────────────────────────────────────────────────
function crc32(buf) {
  let c = ~0 >>> 0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // rows con byte de filtro 0 al inicio de cada fila
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Dibujo ──────────────────────────────────────────────────────────────────
const lerp = (a, b, t) => a + (b - a) * t;
const CYAN = [0x22, 0xd3, 0xee];
const PINK = [0xf4, 0x72, 0xb6];
const DARK = [0x0b, 0x0e, 0x14];
const RING = [0x2a, 0x33, 0x46];

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const corner = size * 0.2; // radio de esquinas redondeadas
  const rRecord = size * 0.4;
  const rLabel = size * 0.13;
  const rHole = size * 0.02;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;

      // Máscara de esquinas redondeadas (alpha).
      let alpha = 255;
      const cx = x < corner ? corner : x > size - corner ? size - corner : x;
      const cy = y < corner ? corner : y > size - corner ? size - corner : y;
      const dCorner = Math.hypot(x - cx, y - cy);
      if (dCorner > corner) {
        alpha = 0;
      } else if (dCorner > corner - 1.5) {
        alpha = Math.round(255 * (corner - dCorner) / 1.5);
      }

      // Fondo: degradado diagonal cian → rosa.
      const t = (x / size + y / size) / 2;
      let r = lerp(CYAN[0], PINK[0], t);
      let g = lerp(CYAN[1], PINK[1], t);
      let b = lerp(CYAN[2], PINK[2], t);

      // Vinilo central.
      const d = Math.hypot(x - c, y - c);
      if (d < rRecord) {
        [r, g, b] = DARK;
        // Surcos (anillos concéntricos).
        const band = (d - rLabel) % (size * 0.035);
        if (d > rLabel && band < size * 0.01) [r, g, b] = RING;
        // Etiqueta central con degradado.
        if (d < rLabel) {
          r = lerp(CYAN[0], PINK[0], t);
          g = lerp(CYAN[1], PINK[1], t);
          b = lerp(CYAN[2], PINK[2], t);
        }
        // Agujero central.
        if (d < rHole) [r, g, b] = DARK;
      }

      rgba[i] = Math.round(r);
      rgba[i + 1] = Math.round(g);
      rgba[i + 2] = Math.round(b);
      rgba[i + 3] = alpha;
    }
  }
  return encodePng(size, size, rgba);
}

for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
  ['favicon-64.png', 64],
]) {
  writeFileSync(join(OUT, name), drawIcon(size));
  console.log('✓', name);
}
