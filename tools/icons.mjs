// ─────────────────────────────────────────────────────────────
//  PixCity · génère les icônes PWA (pixel-art, 192 & 512 px)
//  node tools/icons.mjs
// ─────────────────────────────────────────────────────────────
import { writeFileSync, mkdirSync } from 'node:fs';
import { FB, fbToPNG, rgba, hex } from '../src/gfx/fb.js';
import { drawBuilding } from '../src/gfx/sprites.js';
import { BUILDING_BY_ID } from '../src/core/data.js';

const OUT = new URL('../assets/icons/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

function makeIcon(size) {
  const fb = new FB(size, size);
  // fond dégradé nuit + halo
  for (let y = 0; y < size; y++) {
    const t = y / size;
    const r = Math.round(20 + 26 * (1 - t)), g = Math.round(26 + 26 * (1 - t)), b = Math.round(64 + 40 * (1 - t));
    fb.hline(0, y, size, rgba(r, g, b, 255));
  }
  const cx = size / 2;
  fb.disk(cx, size * 0.62, size * 0.44, rgba(90, 130, 220, 26));
  for (let i = 0; i < 26; i++) {
    const x = ((i * 7919) % size), y = ((i * 104729) % Math.floor(size * 0.5));
    fb.px(x, y, rgba(255, 255, 235, 200));
  }
  // lune
  fb.disk(size * 0.78, size * 0.2, size * 0.075, hex(0xf4f8ff));
  fb.disk(size * 0.755, size * 0.185, size * 0.065, rgba(40, 48, 96, 255));

  // sol
  fb.rect(0, Math.floor(size * 0.78), size, size, hex(0x2f5d33));
  fb.rect(0, Math.floor(size * 0.78), size, Math.max(2, size * 0.012), hex(0x4f8f3a));

  // silhouette de ville au fond
  const skyline = [0.30, 0.52, 0.40, 0.62, 0.44, 0.58];
  for (let i = 0; i < skyline.length; i++) {
    const w = size * 0.11, x = size * (0.02 + i * 0.165), h = size * skyline[i] * 0.5;
    fb.rect(x, size * 0.78 - h, w, h, rgba(30, 40, 80, 190));
    for (let wy = 0; wy < h - 6; wy += 10) {
      for (let wx = 3; wx < w - 4; wx += 8) {
        if ((i + wx + wy) % 3) fb.rect(x + wx, size * 0.78 - h + wy + 3, 3, 4, rgba(255, 209, 102, 150));
      }
    }
  }

  // bâtiment principal (gratte-ciel) au centre, mis à l'échelle
  const spr = drawBuilding(BUILDING_BY_ID.gratteciel, 2, 0, false);
  const scale = Math.max(1, Math.floor((size * 0.56) / spr.h));
  for (let y = 0; y < spr.h; y++) {
    for (let x = 0; x < spr.w; x++) {
      const c = spr.data[y * spr.w + x];
      if (!(c >>> 24)) continue;
      const px = Math.round(size * 0.5 - (spr.w * scale) / 2 + x * scale);
      const py = Math.round(size * 0.85 - spr.h * scale + y * scale);
      fb.rect(px, py, scale, scale, c);
    }
  }
  // bord
  fb.outline(0, 0, size, size, hex(0x0a0e1c));
  fb.outline(2, 2, size - 4, size - 4, rgba(255, 209, 102, 90));
  return fb;
}

for (const size of [192, 512]) {
  const fb = makeIcon(size);
  writeFileSync(OUT + `icon-${size}.png`, Buffer.from(fbToPNG(fb)));
  console.log('✓ assets/icons/icon-' + size + '.png');
}
