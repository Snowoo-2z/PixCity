// ─────────────────────────────────────────────────────────────
//  PixCity · aperçu de la scène complète (Node → PNG)
//  node tools/city.mjs [early|mid|late|all]
// ─────────────────────────────────────────────────────────────
import { writeFileSync, mkdirSync } from 'node:fs';
import { FB, fbToPNG } from '../src/gfx/fb.js';
import { FBSurface } from '../src/gfx/surface.js';
import { drawBuilding, drawNature } from '../src/gfx/sprites.js';
import { CityScene, WORLD } from '../src/gfx/city.js';
import { newState } from '../src/core/state.js';

const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const map = new Map();
const nodeSprites = {
  get(def, tier, variant, neon) {
    const key = def.id + tier + variant + (neon ? 'n' : '');
    let fb = map.get(key);
    if (!fb) { fb = drawBuilding(def, tier, variant, neon); map.set(key, fb); }
    return { img: fb, w: fb.w, h: fb.h };
  },
  nature(kind, variant, seed) {
    const key = 'n' + kind + variant + seed;
    let fb = map.get(key);
    if (!fb) { fb = drawNature(kind, variant, seed); map.set(key, fb); }
    return { img: fb, w: fb.w, h: fb.h };
  },
};

const STAGES = {
  fresh: { lifetime: 0, buildings: {} },
  early: { lifetime: 240, buildings: { cabane: 7, epicerie: 1 } },
  mid: { lifetime: 120000, buildings: { cabane: 40, epicerie: 26, cafe: 14, immeuble: 6, cinema: 2 } },
  late: {
    lifetime: 4e10, neon: true,
    buildings: {
      cabane: 120, epicerie: 90, cafe: 70, immeuble: 55, cinema: 40, centre: 33,
      hopital: 26, bureaux: 20, gratteciel: 15, parc: 11, gare: 8, quantique: 6,
    },
  },
};

// horloge simulée : --phase=0..4 (aube 0, jour 1, crépuscule 2, nuit 3)
const phaseArg = process.argv.find((a) => a.startsWith('--phase='));
const DAY = 420000;
const fakeNow = phaseArg ? (Number(phaseArg.slice(8)) / 4) * DAY : null;

const which = (process.argv[2] || 'all');
const names = which === 'all' ? Object.keys(STAGES) : [which];

for (const name of names) {
  const stage = STAGES[name];
  const state = newState();
  state.lifetime = stage.lifetime;
  state.run = stage.lifetime;
  for (const k in stage.buildings) state.buildings[k] = stage.buildings[k];
  state.skins.neon = process.argv.includes('--noneon') ? false : !!stage.neon;

  const fb = new FB(WORLD.w, WORLD.h);
  const s = new FBSurface(fb);
  const scene = new CityScene(nodeSprites);
  // on simule quelques secondes pour que bulles/taxis/voitures se placent
  const t0 = fakeNow === null ? Date.now() : fakeNow;
  for (let i = 0; i < 240; i++) scene.update(1 / 30, t0 + i * 33, state);
  // taxi visible sur l'aperçu
  if (name === 'mid' || name === 'late') scene.spawnTaxi();
  scene.taxi && (scene.taxi.x = name === 'late' ? 300 : 180);
  scene.addFloat('+1,2 K', 320, 210, { color: 0xffe9a0, size: 14 });
  scene.burst(320, 220, { n: 14, colors: [0xffd166, 0xfff6c4, 0xd8a520] });
  scene.draw(s, state, fakeNow === null ? Date.now() : fakeNow);
  const suffix = phaseArg ? '-p' + Number(process.argv.find((a) => a.startsWith('--phase=')).slice(8)) : '';
  writeFileSync(OUT + 'city-' + name + suffix + '.png', Buffer.from(fbToPNG(fb)));
  console.log('✓ outils/out/city-' + name + suffix + '.png');

  // zoom optionnel : --crop=x,y,w,h[,échelle]
  const cropArg = process.argv.find((a) => a.startsWith('--crop='));
  if (cropArg) {
    const [x, y, w, h, sc = 3] = cropArg.slice(7).split(',').map(Number);
    const zoom = new FB(w * sc, h * sc);
    for (let yy = 0; yy < h * sc; yy++) {
      for (let xx = 0; xx < w * sc; xx++) {
        zoom.data[yy * zoom.w + xx] = fb.data[Math.floor(y / 1 + yy / sc) * fb.w + Math.floor(x + xx / sc)];
      }
    }
    writeFileSync(OUT + 'zoom-' + name + '.png', Buffer.from(fbToPNG(zoom)));
    console.log('✓ outils/out/zoom-' + name + '.png (' + w + '×' + h + ' ×' + sc + ')');
  }
}
