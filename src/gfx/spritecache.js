// ─────────────────────────────────────────────────────────────
//  PixCity · cache de sprites (navigateur)
//  Les sprites pixel-art sont dessinés dans un framebuffer puis
//  « cuits » une fois pour toutes dans un canvas : ensuite le rendu
//  n'est plus qu'un drawImage (rapide).
// ─────────────────────────────────────────────────────────────
import { fbToRGBA } from './fb.js';
import { drawBuilding, drawNature } from './sprites.js';
import { BUILDINGS } from '../core/data.js';

function bake(fb) {
  const c = document.createElement('canvas');
  c.width = fb.w; c.height = fb.h;
  const ctx = c.getContext('2d');
  ctx.putImageData(new ImageData(fbToRGBA(fb), fb.w, fb.h), 0, 0);
  return c;
}

export class SpriteCache {
  constructor() {
    this.map = new Map();
    this.baked = 0;
  }

  get(def, tier, variant, neon) {
    const key = def.id + '|' + tier + '|' + variant + '|' + (neon ? 1 : 0);
    let img = this.map.get(key);
    if (!img) {
      img = bake(drawBuilding(def, tier, variant, neon));
      this.map.set(key, img);
      this.baked++;
    }
    return { img, w: img.width, h: img.height };
  }

  nature(kind, variant, seed) {
    const key = 'n|' + kind + '|' + variant + '|' + seed;
    let img = this.map.get(key);
    if (!img) {
      img = bake(drawNature(kind, variant, seed));
      this.map.set(key, img);
      this.baked++;
    }
    return { img, w: img.width, h: img.height };
  }

  /** Prépare tout ce qui peut l'être, en tâche de fond. */
  async preload(onProgress = () => {}, neon = false) {
    const jobs = [];
    for (const def of BUILDINGS) {
      for (let tier = 0; tier <= 5; tier++) {
        for (let v = 0; v < 3; v++) {
          if (neon && v > 0) continue; // en néon, une seule variante suffit au départ
          jobs.push([def, tier, v, neon]);
        }
      }
    }
    const total = jobs.length;
    let i = 0;
    while (i < total) {
      const slice = jobs.slice(i, i + 6);
      for (const [def, tier, v, n] of slice) this.get(def, tier, v, n);
      i += slice.length;
      onProgress(i / total);
      await new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 60 }) : setTimeout(r, 0)));
    }
    // décors
    const veg = ['tree', 'pine', 'bush', 'flower', 'lamp', 'bench', 'fountain', 'rock', 'sign', 'car'];
    for (let k = 0; k < veg.length; k++) {
      for (let v = 0; v < 3; v++) this.nature(veg[k], v, 100 + k);
      this.nature(veg[k], 0, 0);
    }
    onProgress(1);
  }
}
