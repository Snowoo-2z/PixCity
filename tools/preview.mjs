// ─────────────────────────────────────────────────────────────
//  PixCity · aperçu du pixel-art (Node → PNG), pour vérifier le
//  dessin sans navigateur.  node tools/preview.mjs
// ─────────────────────────────────────────────────────────────
import { writeFileSync, mkdirSync } from 'node:fs';
import { FB, fbToPNG, rgba, hex } from '../src/gfx/fb.js';
import { drawBuilding, drawNature, spriteSize, ART } from '../src/gfx/sprites.js';
import { BUILDINGS } from '../src/core/data.js';
import { mulberry32 } from '../src/core/format.js';

const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

function backdrop(fb) {
  // ciel dégradé nuit
  for (let y = 0; y < fb.h; y++) {
    const t = y / fb.h;
    const r = Math.round(18 + 26 * t), g = Math.round(20 + 20 * t), b = Math.round(52 + 24 * (1 - t));
    fb.hline(0, y, fb.w, rgba(r, g, b, 255));
  }
  // étoiles
  const rnd = mulberry32(42);
  for (let i = 0; i < 90; i++) {
    fb.px(Math.floor(rnd() * fb.w), Math.floor(rnd() * fb.h * 0.6), rgba(255, 255, 235, 120 + Math.floor(rnd() * 120)));
  }
  // sol
  fb.rect(0, fb.h - 10, fb.w, 10, hex(0x2f5d33));
  fb.rect(0, fb.h - 10, fb.w, 2, hex(0x3d7a3f));
  for (let x = 0; x < fb.w; x += 3) fb.px(x, fb.h - 8 + (x % 5), hex(0x276b2d));
}

const sheetMode = process.argv.includes('--sheet');
const tiers = process.argv[2] ? process.argv[2].split(',').map(Number) : [0, 2, 4];
const pad = 14;
const cellW = 110;
const cellH = 150;
const neon = process.argv.includes('--neon');

if (sheetMode) {
  // planche horizontale : tous les bâtiments au même palier, sur herbe
  const tier = tiers[0];
  const W = 76 * BUILDINGS.length + 20;
  const H = 150;
  const sheetS = new FB(W, H);
  for (let y = 0; y < H; y++) {
    const t = y / H;
    sheetS.hline(0, y, W, rgba(Math.round(24 + 20 * t), Math.round(28 + 22 * t), Math.round(70 + 30 * (1 - t)), 255));
  }
  sheetS.rect(0, 118, W, H - 118, hex(0x3f7a3c));
  sheetS.rect(0, 118, W, 2, hex(0x4f8f3a));
  BUILDINGS.forEach((def, i) => {
    const spr = drawBuilding(def, tier, 0, false);
    sheetS.blit(spr, 10 + i * 76 - Math.floor(spr.w / 2) + 38, 120 - (spr.h - 3));
  });
  writeFileSync(OUT + 'sheet.png', Buffer.from(fbToPNG(sheetS)));
  console.log('✓ outils/out/sheet.png (palier ' + tier + ')');
  process.exit(0);
}
const sheet = new FB(cellW * tiers.length + pad, cellH * BUILDINGS.length + pad);
backdrop(sheet);

BUILDINGS.forEach((def, row) => {
  tiers.forEach((tier, col) => {
    const spr = drawBuilding(def, tier, 0, neon);
    const x = pad + col * cellW + Math.floor((cellW - 8 - spr.w) / 2) + 4;
    const y = pad + row * cellH + (cellH - 12 - spr.h);
    sheet.blit(spr, x, y);
  });
});
writeFileSync(OUT + 'buildings.png', Buffer.from(fbToPNG(sheet)));

// planche de nature
const kinds = ['tree', 'pine', 'bush', 'rock', 'flower', 'lamp', 'bench', 'fountain', 'car', 'sign'];
const nSheet = new FB(kinds.length * 30 + 10, 60);
backdrop(nSheet);
kinds.forEach((k, i) => {
  for (let v = 0; v < 3; v++) {
    const s = drawNature(k, v, 7 + i * 13);
    nSheet.blit(s, 12 + i * 30 + v, 48 - s.h);
  }
});
writeFileSync(OUT + 'nature.png', Buffer.from(fbToPNG(nSheet)));

console.log('✓ outils/out/buildings.png  (' + tiers.map((t) => 'palier ' + t).join(', ') + ')');
console.log('✓ outils/out/nature.png');
