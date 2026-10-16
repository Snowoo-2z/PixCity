// ─────────────────────────────────────────────────────────────
//  PixCity · loupe pixel-art
//  Rend quelques bâtiments en gros plan (×N) sur un fond damé :
//  indispensable pour juger les contours, les ombrages et les
//  détails d'un sprite.
//    node tools/zoom.mjs [ids] [palier] [échelle]
//    node tools/zoom.mjs cabane,epicerie,immeuble 3 4
// ─────────────────────────────────────────────────────────────
import { writeFileSync, mkdirSync } from 'node:fs';
import { FB, fbToPNG, hex } from '../src/gfx/fb.js';
import { drawBuilding } from '../src/gfx/sprites.js';
import { BUILDING_BY_ID } from '../src/core/data.js';
import { BAYER4 } from '../src/gfx/surface.js';

const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const ids = (process.argv[2] || 'cabane,epicerie,immeuble,gratteciel').split(',').filter(Boolean);
const tier = Number(process.argv[3] ?? 3);
const scale = Number(process.argv[4] ?? 3);

const missing = ids.filter((id) => !BUILDING_BY_ID[id]);
if (missing.length) {
  console.error('bâtiment inconnu : ' + missing.join(', '));
  process.exit(1);
}

const sprites = ids.map((id) => drawBuilding(BUILDING_BY_ID[id], tier, 0, false));
const cellW = Math.max(...sprites.map((s) => s.w)) * scale + 20;
const groundH = 20;
const H = Math.max(...sprites.map((s) => s.h)) * scale + groundH + 10;
const sheet = new FB(cellW * sprites.length, H);

// fond damé : on voit immédiatement si le contour de silhouette est net
for (let y = 0; y < H; y++) {
  for (let x = 0; x < sheet.w; x++) {
    const t = (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
    const c = y < H - groundH
      ? (t > 0.5 ? 0x1b2550 : 0x232c4f)
      : (t > 0.5 ? 0x3f7a3c : 0x2f5d33);
    sheet.px(x, y, hex(c));
  }
}

sprites.forEach((spr, i) => {
  const x0 = i * cellW + Math.floor((cellW - spr.w * scale) / 2);
  const y0 = H - groundH - (spr.h - 3) * scale;
  for (let y = 0; y < spr.h * scale; y++) {
    for (let x = 0; x < spr.w * scale; x++) {
      const c = spr.data[Math.floor(y / scale) * spr.w + Math.floor(x / scale)];
      if (!(c >>> 24)) continue;
      const px = x0 + x, py = y0 + y;
      if (px < 0 || py < 0 || px >= sheet.w || py >= sheet.h) continue;
      sheet.data[py * sheet.w + px] = c;
    }
  }
});

const file = OUT + 'zoom.png';
writeFileSync(file, Buffer.from(fbToPNG(sheet)));
console.log('✓ tools/out/zoom.png  ' + sheet.w + '×' + sheet.h + '  (palier ' + tier + ', ×' + scale + ')');
console.log('  ' + ids.join(' · '));
