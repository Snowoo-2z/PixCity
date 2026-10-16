// ─────────────────────────────────────────────────────────────
//  PixCity · la scène de la ville
//  Ciel qui tourne, collines, routes, 12 parcelles, passants,
//  taxis, bulles à collecter, particules et textes flottants.
//  Tout est dessiné via une `Surface` (canvas ou framebuffer).
// ─────────────────────────────────────────────────────────────
import { BUILDINGS, tierOf, nextTierAt } from '../core/data.js';
import { drawNature } from './sprites.js';
import { mulberry } from './surface.js';

export const WORLD = { w: 640, h: 360 };
export const SKY_H = 268;
const GROUND_Y = 254;      // début du sol
const LAYER_TOP = 160;     // haut des calques statiques (collines, silhouettes)
const BACK_GROUND = 268;
const FRONT_GROUND = 322;
const BACK_COLS = [2, 3, 1, 4, 0, 5];   // colonne de chaque bâtiment arrière
const FRONT_COLS = [2, 3, 1, 4, 0, 5];
const COL_X_BACK = (i) => 52 + i * 104;
const COL_X_FRONT = (i) => 78 + i * 104;

const DAY_MS = 420000; // cycle jour/nuit de 7 minutes

// Ambiances du ciel (aube, jour, crépuscule, nuit)
const SKIES = [
  { top: 0x2b2a5e, bot: 0xff9a5c, star: 0.35, tint: 0x3a2a66, tintA: 0.16, name: 'aube' },
  { top: 0x3f9fe0, bot: 0xbfe8ff, star: 0.0, tint: 0xfff3c4, tintA: 0.06, name: 'jour' },
  { top: 0x3a2a5c, bot: 0xff7a4d, star: 0.25, tint: 0x5c2a4a, tintA: 0.2, name: 'crépuscule' },
  { top: 0x070b28, bot: 0x1b2a54, star: 1, tint: 0x101a44, tintA: 0.3, name: 'nuit' },
];

function phaseOf(now) {
  const t = ((now % DAY_MS) + DAY_MS) % DAY_MS / DAY_MS; // 0..1
  return t * 4; // 0..4 : aube, jour, crépuscule, nuit
}

function skyFor(p) {
  const i = Math.floor(p) % 4;
  const j = (i + 1) % 4;
  const k = p - Math.floor(p);
  const a = SKIES[i], b = SKIES[j];
  return {
    top: mixInt(a.top, b.top, k),
    bot: mixInt(a.bot, b.bot, k),
    star: a.star + (b.star - a.star) * k,
    tint: mixInt(a.tint, b.tint, k),
    tintA: a.tintA + (b.tintA - a.tintA) * k,
    sun: mixInt(a.bot, b.bot, k),
    night: (a.star + (b.star - a.star) * k) > 0.5,
  };
}

function mixInt(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

export class CityScene {
  /**
   * @param {object} sprites  cache de sprites { get(def, tier, variant) }
   */
  constructor(sprites) {
    this.sprites = sprites;
    this._layers = new Map();
    this.useLayers = true;
    this.rnd = mulberry(20251016);
    this.particles = [];
    this.floats = [];
    this.ripples = [];
    this.bubbles = [];
    this.cars = [];
    this.citizens = [];
    this.clouds = [];
    this.plots = [];
    this.props = [];
    this.taxi = null;
    this.taxiTimer = 42 + Math.random() * 30;
    this.shake = { t: 0, mag: 0 };
    this.flash = 0;
    this.t = 0;
    this.timeOfDay = 0;
    this.build(BUILDINGS);
    this.initAmbient();
  }

  // ── Construction de la ville ──────────────────────────────
  build(defs) {
    this.plots = defs.map((def, i) => {
      const back = i >= 6;
      const idx = i % 6;
      const col = back ? BACK_COLS[idx] : FRONT_COLS[idx];
      const x = back ? COL_X_BACK(col) : COL_X_FRONT(col);
      return {
        def, index: i, row: back ? 'back' : 'front',
        x, ground: back ? BACK_GROUND : FRONT_GROUND,
        // la 1ʳᵉ bulle arrive vite : c'est le premier « gros » plaisir du joueur
        bubble: null, next: 5 + Math.random() * 7, bonus: 0,
      };
    });
  }

  initAmbient() {
    const r = mulberry(777);
    // nuages
    for (let i = 0; i < 7; i++) {
      this.clouds.push({
        x: r() * WORLD.w, y: 22 + r() * 90, s: 0.6 + r() * 1.1,
        v: 2 + r() * 4, kind: Math.floor(r() * 3),
      });
    }
    // décor fixe
    const veg = ['tree', 'pine', 'bush', 'flower', 'lamp', 'bench', 'fountain', 'rock', 'sign'];
    for (let i = 0; i < 46; i++) {
      const front = r() < 0.45;
      const kind = veg[Math.floor(r() * veg.length)];
      const y = front ? 344 + r() * 14 : 286 + r() * 30;
      const x = 6 + r() * (WORLD.w - 12);
      if (kind === 'lamp' || kind === 'bench' || kind === 'sign') {
        this.props.push({ kind, x, y, v: Math.floor(r() * 3), floor: front ? 1 : 0 });
      } else if (r() < 0.75) {
        this.props.push({ kind, x, y, v: Math.floor(r() * 3), floor: front ? 1 : 0 });
      }
    }
    // voitures
    for (let i = 0; i < 5; i++) this.cars.push(this.makeCar(i));
    // passants
    for (let i = 0; i < 14; i++) this.citizens.push(this.makeCitizen(r));
  }

  makeCar(i) {
    const r = Math.random();
    const back = i % 2 === 0;
    return {
      x: back ? Math.random() * WORLD.w : WORLD.w + Math.random() * 200,
      y: back ? BACK_GROUND + 8 : FRONT_GROUND + 8,
      dir: back ? 1 : -1,
      speed: (back ? 22 : 30) + r * 26,
      pal: Math.floor(r * 5),
      back,
      kind: r > 0.82 ? 'van' : 'car',
    };
  }

  makeCitizen(r) {
    return {
      x: r() * WORLD.w,
      y: 340 + r() * 16,
      dir: r() < 0.5 ? 1 : -1,
      speed: 6 + r() * 9,
      frame: Math.floor(r() * 2),
      ft: 0,
      pal: Math.floor(r() * 4),
    };
  }

  // ── Simulation ────────────────────────────────────────────
  update(dt, now, state) {
    this.t += dt;
    this.timeOfDay = phaseOf(now);
    const rnd = Math.random;

    // nuages
    for (const c of this.clouds) {
      c.x += c.v * dt * 0.35;
      if (c.x > WORLD.w + 60) c.x = -60;
    }
    // voitures (le taxi doré remplace une voiture de la route avant)
    for (const c of this.cars) {
      c.x += c.speed * dt * c.dir;
      if (c.dir > 0 && c.x > WORLD.w + 40) Object.assign(c, this.makeCar(c.back ? 0 : 1));
      if (c.dir < 0 && c.x < -40) Object.assign(c, this.makeCar(c.back ? 0 : 1));
    }
    // passants : la population suit la taille de la ville
    const total = BUILDINGS.reduce((a, b) => a + (state.buildings[b.id] || 0), 0);
    const active = Math.min(this.citizens.length, 3 + Math.floor(Math.log10(1 + total) * 5));
    for (let i = 0; i < this.citizens.length; i++) {
      const p = this.citizens[i];
      if (i >= active) continue;
      p.x += p.speed * dt * p.dir;
      p.ft += dt;
      if (p.ft > 0.22) { p.ft = 0; p.frame = 1 - p.frame; }
      if (p.x > WORLD.w + 10) { p.x = -10; p.y = 340 + rnd() * 16; }
      if (p.x < -10) { p.x = WORLD.w + 10; p.y = 340 + rnd() * 16; }
    }

    // bulles à collecter sur les parcelles construites
    for (const plot of this.plots) {
      const n = state.buildings[plot.def.id] || 0;
      if (n <= 0) { plot.bubble = null; continue; }
      if (plot.bubble) {
        plot.bubble.t += dt;
        if (plot.bubble.t > plot.bubble.life) plot.bubble = null;
      } else {
        plot.next -= dt;
        if (plot.next <= 0) {
          plot.next = 26 + Math.random() * 34;
          const roll = Math.random();
          const kind = roll < 0.62 ? 'coin' : roll < 0.86 ? 'gem' : 'boost';
          plot.bubble = { kind, t: 0, life: 13, x: plot.x + (Math.random() * 20 - 10), y: plot.ground - 46 - Math.random() * 22 };
        }
      }
    }

    // taxi doré
    {
      const chance = 0.82 - 0.06 * (state.up.taxi || 0);
      if (!this.taxi) {
        this.taxiTimer -= dt;
        if (this.taxiTimer <= 0 && Math.random() < 0.06) {
          this.taxiTimer = (80 + Math.random() * 95) * chance;
          this.spawnTaxi();
        }
      }
    }
    if (this.taxi) {
      const tx = this.taxi;
      tx.x += tx.speed * dt;
      tx.life -= dt;
      tx.bob += dt;
      if (tx.x > WORLD.w + 60 || tx.life < 0) this.taxi = null;
      if (Math.random() < 0.5) this.sparkle(tx.x - 4 * tx.dir, tx.y - 2);
    }

    // particules
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.g ?? 90) * dt;
      if (p.bounce && p.y > p.floorY) { p.y = p.floorY; p.vy = -Math.abs(p.vy) * 0.45; p.vx *= 0.8; }
    }
    // textes flottants
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dt;
      f.y += f.vy * dt;
      f.vy *= 0.94;
      if (f.life <= 0) this.floats.splice(i, 1);
    }
    // ondes de tap
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const w = this.ripples[i];
      w.life -= dt;
      if (w.life <= 0) this.ripples.splice(i, 1);
    }
    if (this.shake.t > 0) this.shake.t -= dt;
    if (this.flash > 0) this.flash -= dt * 2.2;
  }

  spawnTaxi() {
    const left = Math.random() < 0.5;
    this.taxi = {
      x: left ? -40 : WORLD.w + 40,
      y: FRONT_GROUND + 8,
      dir: left ? 1 : -1,
      speed: 34 + Math.random() * 10,
      life: 22,
      bob: 0,
    };
  }

  // ── Effets ────────────────────────────────────────────────
  addFloat(text, x, y, o = {}) {
    this.floats.push({
      text, x, y, vy: o.vy ?? -26, life: o.life ?? 1.05, max: o.life ?? 1.05,
      color: o.color ?? 0xffe9a0, size: o.size ?? 12, shadow: o.shadow ?? true,
    });
    if (this.floats.length > 46) this.floats.shift();
  }

  burst(x, y, o = {}) {
    const n = o.n ?? 8;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (o.speed ?? 40) * (0.5 + Math.random());
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up ?? 30),
        life: (o.life ?? 0.7) * (0.6 + Math.random() * 0.7), max: o.life ?? 0.7,
        color: o.colors ? o.colors[Math.floor(Math.random() * o.colors.length)] : 0xffd166,
        size: o.size ?? 2, g: o.g ?? 120, bounce: o.bounce, floorY: o.floorY,
      });
    }
    if (this.particles.length > 260) this.particles.splice(0, this.particles.length - 260);
  }

  sparkle(x, y) {
    this.particles.push({
      x, y, vx: -6 + Math.random() * 12, vy: -14 - Math.random() * 10,
      life: 0.45, max: 0.45, color: Math.random() < 0.5 ? 0xffd166 : 0xfff3c4, size: 1, g: 10,
    });
  }

  ripple(x, y, color = 0xffe9a0, maxR = 22) {
    this.ripples.push({ x, y, r: 2, maxR, color, life: 0.35, max: 0.35 });
  }

  shakeIt(mag = 3, t = 0.28) { this.shake = { t, mag }; }
  bang() { this.flash = 0.5; }

  // ── Couches statiques (performance) ───────────────────────
  /**
   * Les éléments immuables (collines, sols, routes, trottoirs) sont
   * dessinés une fois dans un canvas hors-écran puis simplement
   * recopiés à chaque image. En Node (pas de canvas) on dessine en
   * direct : le code de dessin reste identique.
   */
  layer(key, drawFn, prefill = null) {
    const surf = this.surface;
    if (!this.useLayers || !surf || !surf.offscreen) return false;
    let canvas = this._layers.get(key);
    if (!canvas) {
      const off = surf.offscreen(WORLD.w, WORLD.h - LAYER_TOP, -LAYER_TOP);
      if (!off) return false;
      // Le pré-remplissage reproduit ce qu'il y a DERRIÈRE le calque :
      // indispensable pour que les pixels semi-transparents (brume,
      // halos) se mélangent exactement comme en rendu direct.
      if (prefill) prefill(off);
      drawFn(off);
      canvas = off.layerCanvas;
      this._layers.set(key, canvas);
      if (this._layers.size > 10) this._layers.delete(this._layers.keys().next().value);
    }
    surf.sprite(canvas, 0, LAYER_TOP);
    return true;
  }

  // ── Rendu ─────────────────────────────────────────────────
  draw(s, state, now) {
    this.surface = s;
    const shakeX = this.shake.t > 0 ? Math.round((Math.random() - 0.5) * this.shake.mag * 2) : 0;
    const shakeY = this.shake.t > 0 ? Math.round((Math.random() - 0.5) * this.shake.mag * 2) : 0;
    s.save();
    if (s.ctx && (shakeX || shakeY)) s.ctx.translate(shakeX, shakeY);

    const sky = skyFor(this.timeOfDay);
    const neon = !!(state.skins && state.skins.neon);
    this.drawSky(s, sky, now);
    this.drawClouds(s, sky);

    // couche 1 : collines, silhouette lointaine, sol
    const skyBucket = Math.floor(this.timeOfDay * 16);
    const total = BUILDINGS.reduce((a, b) => a + (state.buildings[b.id] || 0), 0);
    const skylineBucket = Math.min(8, Math.floor(total / 30));
    if (!this.layer('g' + skyBucket + '_' + skylineBucket + (neon ? 'n' : ''), (ls) => {
      this.drawHills(ls, sky);
      if (neon) this.drawSkyline(ls, state, now, true);
      this.drawGround(ls, sky);
    }, (ls) => this.drawSkyGradient(ls, sky))) {
      this.drawHills(s, sky);
      if (neon) this.drawSkyline(s, state, now, true);
      this.drawGround(s, sky);
    }

    const variant = Math.floor(now / 520) % 3;

    // rangée arrière
    for (const plot of this.plots) if (plot.row === 'back') this.drawPlot(s, plot, state, variant, neon, sky);
    // couche 2 : route arrière
    if (!this.layer('rb', (ls) => this.drawRoad(ls, BACK_GROUND + 8, sky, 1))) this.drawRoad(s, BACK_GROUND + 8, sky, 1);
    // couche 3 : bande centrale
    if (!this.layer('mid', (ls) => this.drawMidStrip(ls, sky))) this.drawMidStrip(s, sky);
    for (const p of this.props) if (!p.floor) this.drawProp(s, p, variant, sky);
    for (const c of this.cars) if (c.back) this.drawCar(s, c, sky);

    // rangée avant
    for (const plot of this.plots) if (plot.row === 'front') this.drawPlot(s, plot, state, variant, neon, sky);
    // couche 4 : route avant, puis couche 5 : premier plan
    if (!this.layer('rf', (ls) => this.drawRoad(ls, FRONT_GROUND + 8, sky, -1))) this.drawRoad(s, FRONT_GROUND + 8, sky, -1);
    for (const c of this.cars) if (!c.back) this.drawCar(s, c, sky);
    if (this.taxi) this.drawTaxi(s, this.taxi, now);
    if (!this.layer('fg', (ls) => this.drawForeground(ls, sky))) this.drawForeground(s, sky);
    for (const p of this.props) if (p.floor) this.drawProp(s, p, variant, sky);
    const active = Math.min(this.citizens.length, 3 + Math.floor(Math.log10(1 + total) * 5));
    for (let i = 0; i < active; i++) this.drawCitizen(s, this.citizens[i], sky);

    // bulles, particules, textes
    for (const plot of this.plots) if (plot.bubble) this.drawBubble(s, plot.bubble, now);
    this.drawParticles(s);
    this.drawRipples(s);
    this.drawFloats(s);

    // teinte d'ambiance + flash
    if (sky.tintA > 0.01) {
      s.setAlpha(sky.tintA);
      s.fillRect(0, 0, WORLD.w, WORLD.h, sky.tint);
      s.setAlpha(1);
    }
    if (this.flash > 0) {
      s.setAlpha(Math.min(0.5, this.flash * 0.5));
      s.fillRect(0, 0, WORLD.w, WORLD.h, 0xffffff);
      s.setAlpha(1);
    }
    s.restore();
  }

  /** Dégradé du ciel (utilisé aussi pour pré-remplir les calques). */
  drawSkyGradient(s, sky) {
    s.gradient(0, 0, WORLD.w, SKY_H, [[0, sky.top], [0.55, mixInt(sky.top, sky.bot, 0.55)], [1, sky.bot]]);
    s.gradient(0, SKY_H, WORLD.w, WORLD.h - SKY_H, [[0, sky.bot], [1, mixInt(sky.bot, 0x1b2340, 0.35)]]);
  }

  drawSky(s, sky, now) {
    this.drawSkyGradient(s, sky);
    // étoiles
    if (sky.star > 0.02) {
      const r = mulberry(99);
      s.setAlpha(sky.star);
      for (let i = 0; i < 120; i++) {
        const x = Math.floor(r() * WORLD.w);
        const y = Math.floor(r() * (SKY_H - 60));
        const tw = 0.6 + 0.4 * Math.sin(now / 900 + i);
        if (tw > 0.72) s.fillRect(x, y, 1, 1, i % 9 === 0 ? 0xbfe8ff : 0xfff8e0);
      }
      s.setAlpha(1);
    }
    // soleil / lune
    const p = this.timeOfDay;
    const dayPart = Math.min(p, 2); // 0..2 = matin→soir
    const arc = (p <= 2 ? p / 2 : (p - 2) / 2);
    const cx = 60 + arc * (WORLD.w - 120);
    const cy = 150 - Math.sin(arc * Math.PI) * 108;
    const isNight = p > 2;
    if (isNight) {
      s.circle(cx, cy, 9, 0xf4f8ff);
      s.circle(cx - 4, cy - 2, 8, mixInt(sky.top, sky.bot, 0.5));
      s.setAlpha(0.5); s.ring(cx, cy, 13, 0xbfe8ff, 1); s.setAlpha(1);
    } else {
      s.setAlpha(0.35); s.circle(cx, cy, 14, 0xffe9a0); s.setAlpha(1);
      s.circle(cx, cy, 10, 0xfff6c4);
      s.circle(cx - 2, cy - 2, 8, 0xffeead);
    }
  }

  drawClouds(s, sky) {
    const night = sky.star > 0.4;
    for (const c of this.clouds) {
      const base = night ? 0x2c3358 : 0xf4f8ff;
      const sh = night ? 0x232a4a : 0xdce8f6;
      const w = Math.round(18 * c.s), h = Math.round(5 * c.s);
      s.setAlpha(0.7);
      s.fillRect(c.x, c.y, w, h, base);
      s.fillRect(c.x + 3, c.y - 2, Math.round(w * 0.6), 3, base);
      s.fillRect(c.x - 2, c.y + h, Math.round(w * 0.5), 2, sh);
      s.fillRect(c.x + 4, c.y + h, w, 2, sh);
      s.setAlpha(1);
    }
  }

  drawHills(s, sky) {
    const dark = mixInt(0x1b2a4a, sky.top, 0.3);
    const mid = mixInt(0x24406a, sky.bot, 0.15);
    const H = 254;
    const layers = [
      { base: 22, amp: [16, 9, 5], freq: [0.0065, 0.017, 0.041], col: mid, top: mixInt(mid, 0xffffff, 0.16) },
      { base: 12, amp: [10, 6, 4], freq: [0.011, 0.026, 0.06], col: dark, top: mixInt(dark, 0xffffff, 0.1) },
    ];
    for (const L of layers) {
      for (let x = 0; x < WORLD.w; x++) {
        const h = L.base
          + Math.sin(x * L.freq[0] + L.base) * L.amp[0]
          + Math.sin(x * L.freq[1] + L.base * 2) * L.amp[1]
          + Math.sin(x * L.freq[2] + L.base * 3) * L.amp[2];
        const hh = Math.max(4, Math.round(h));
        s.fillRect(x, H - hh, 1, hh, L.col);
        s.fillRect(x, H - hh, 1, 1, L.top);
      }
    }
    // brume au pied des collines
    s.setAlpha(0.35);
    for (let x = 0; x < WORLD.w; x++) {
      const k = 0.5 + 0.5 * Math.sin(x * 0.02);
      s.fillRect(x, 246 + Math.round(k * 3), 1, 8, mixInt(mid, sky.bot, 0.6));
    }
    s.setAlpha(1);
    // lisière de forêt en zigzag
    const r2 = mulberry(313);
    for (let x = -4; x < WORLD.w + 4; x += 4) {
      const h = 7 + Math.floor(r2() * 5);
      for (let i = 0; i < h; i++) {
        const w = Math.max(1, Math.round((h - i) * 0.95));
        s.fillRect(x + (4 - w) / 2, 256 - i, w, 1, i > h - 3 ? mixInt(dark, 0x000000, 0.25) : mixInt(dark, 0x1f4a30, 0.4));
      }
    }
  }

  /** Silhouettes lointaines qui poussent avec la ville (mode néon : néons). */
  drawSkyline(s, state, now, neon) {
    const total = BUILDINGS.reduce((a, b) => a + (state.buildings[b.id] || 0), 0);
    if (total < 4) return;
    const r = mulberry(1234);
    const n = Math.min(26, 6 + Math.floor(total / 3));
    s.setAlpha(0.5);
    for (let i = 0; i < n; i++) {
      const x = Math.floor(r() * WORLD.w);
      const h = 20 + Math.floor(r() * 60);
      const w = 12 + Math.floor(r() * 18);
      const col = neon ? 0x2a1b4d : 0x1a2340;
      s.fillRect(x, 254 - h, w, h, col);
      for (let wy = 0; wy < h - 4; wy += 5) {
        for (let wx = 2; wx < w - 2; wx += 4) {
          if ((i * 7 + wx + wy) % 11 < 4) s.fillRect(x + wx, 254 - h + 2 + wy, 2, 2, neon ? 0xff2fd0 : 0xffd166);
        }
      }
    }
    s.setAlpha(1);
  }

  drawGround(s, sky) {
    // sol herbé avec dither
    s.gradient(0, 254, WORLD.w, WORLD.h - 254, [[0, 0x3f7a3c], [0.35, 0x4f8f3a], [1, 0x2f5d33]]);
    const r = mulberry(8);
    for (let y = 254; y < WORLD.h; y += 1) {
      for (let x = 0; x < WORLD.w; x += 1) {
        const n = r();
        if (n < 0.045) s.fillRect(x, y, 1, 1, y % 2 ? 0x3d7a3f : 0x59a04a);
        else if (n > 0.975) s.fillRect(x, y, 1, 1, 0x2b5230);
      }
    }
  }

  drawRoad(s, y, sky, dir) {
    s.fillRect(0, y - 9, WORLD.w, 18, 0x3a3f48);
    s.fillRect(0, y - 9, WORLD.w, 2, 0x4c525c);
    s.fillRect(0, y + 7, WORLD.w, 2, 0x2c3038);
    // trottoir
    s.fillRect(0, y - 13, WORLD.w, 4, 0x8a8f96);
    s.fillRect(0, y - 13, WORLD.w, 1, 0xa9aeb5);
    s.fillRect(0, y + 9, WORLD.w, 3, 0x8a8f96);
    // marquage
    for (let x = 4; x < WORLD.w; x += 22) s.fillRect(x, y, 12, 2, 0xd8c88a);
    // passages piétons
    for (let bx = 60; bx < WORLD.w; bx += 208) {
      for (let i = 0; i < 5; i++) s.fillRect(bx + i * 3, y - 8, 2, 16, 0xe8e4d8);
    }
  }

  drawMidStrip(s, sky) {
    s.fillRect(0, 282, WORLD.w, 44, 0x3f7a3c);
    s.fillRect(0, 282, WORLD.w, 2, 0x4f8f3a);
    const r = mulberry(21);
    for (let i = 0; i < 220; i++) {
      const x = Math.floor(r() * WORLD.w), y = 284 + Math.floor(r() * 38);
      s.fillRect(x, y, 1, 1, r() < 0.5 ? 0x59a04a : 0x2b5230);
    }
  }

  drawForeground(s, sky) {
    const y = FRONT_GROUND + 21;
    s.fillRect(0, y, WORLD.w, WORLD.h - y, 0x6f6a5f);
    s.fillRect(0, y, WORLD.w, 2, 0x8a8477);
    for (let x = 0; x < WORLD.w; x += 16) s.fillRect(x, y + 2, 1, WORLD.h - y - 2, 0x5c574d);
    for (let x = 8; x < WORLD.w; x += 32) s.fillRect(x, y + 7, 22, 1, 0x5c574d);
  }

  drawProp(s, p, variant, sky) {
    const spr = this.sprites.nature(p.kind, p.kind === 'lamp' ? (sky.star > 0.4 ? 1 : 0) : p.v, p.x | 0);
    s.sprite(spr.img, p.x - spr.img.width / 2, p.y - spr.img.height);
  }

  drawCitizen(s, c, sky) {
    const pal = [0xffd166, 0x6be3ff, 0xff8fb1, 0x7ef2c0][c.pal];
    const shirt = [0xd0504c, 0x3aa7a0, 0x6a4bd0, 0x2f4a6b][c.pal];
    const x = Math.round(c.x), y = Math.round(c.y);
    s.fillRect(x - 1, y - 9, 3, 4, shirt);       // torse
    s.fillRect(x - 1, y - 12, 3, 3, 0xf0c8a0);   // tête
    s.fillRect(x - 1, y - 13, 3, 1, pal);        // cheveux
    const step = c.frame === 0 ? 0 : 1;
    s.fillRect(x - 1 + step, y - 5, 1, 5, 0x2b2f36);  // jambes
    s.fillRect(x + 1 - step, y - 5, 1, 5, 0x2b2f36);
    s.fillRect(x - 2, y - 8, 1, 3, 0xf0c8a0);
    s.fillRect(x + 2, y - 8, 1, 3, 0xf0c8a0);
  }

  drawCar(s, c, sky) {
    const colors = [0xd0504c, 0x3aa7a0, 0xffd166, 0x6a4bd0, 0xe8e4d8];
    const body = colors[c.pal % colors.length];
    const x = Math.round(c.x), y = Math.round(c.y);
    if (c.kind === 'van') {
      s.fillRect(x - 9, y - 8, 18, 8, body);
      s.fillRect(x - 9, y - 8, 18, 1, mixInt(body, 0xffffff, 0.3));
      s.fillRect(x + 2, y - 11, 7, 4, mixInt(body, 0x000000, 0.15));
      s.fillRect(x - 6, y - 7, 6, 3, 0x9fe8ff);
      s.fillRect(x - 10, y - 4, 1, 2, 0xffe9a0);
    } else {
      s.fillRect(x - 8, y - 5, 16, 5, body);
      s.fillRect(x - 4, y - 8, 9, 3, mixInt(body, 0xffffff, 0.15));
      s.fillRect(x - 3, y - 8, 4, 3, 0x9fe8ff);
      s.fillRect(x + 2, y - 8, 3, 3, 0x9fe8ff);
      s.fillRect(x - 8, y - 5, 16, 1, mixInt(body, 0xffffff, 0.35));
      s.fillRect(x + (c.dir > 0 ? 8 : -9), y - 4, 1, 2, 0xffe9a0);
    }
    s.fillRect(x - 6, y, 3, 3, 0x1a1d22);
    s.fillRect(x + 3, y, 3, 3, 0x1a1d22);
    s.fillRect(x - 6, y, 3, 1, 0x50555c);
    s.fillRect(x + 3, y, 3, 1, 0x50555c);
  }

  drawTaxi(s, tx, now) {
    const bob = Math.round(Math.sin(tx.bob * 6) * 1);
    const x = Math.round(tx.x), y = Math.round(tx.y) + bob;
    for (let i = 0; i < 4; i++) { s.setAlpha(0.05 + i * 0.03); s.circle(x, y + 2, 14 - i * 2.5, 0xffd166); }
    s.setAlpha(1);
    const body = 0xffd166, dark = 0xd8a520;
    s.fillRect(x - 8, y - 5, 16, 5, body);
    s.fillRect(x - 4, y - 8, 9, 3, body);
    s.fillRect(x - 3, y - 8, 4, 3, 0xfff6c4);
    s.fillRect(x + 2, y - 8, 3, 3, 0xfff6c4);
    s.fillRect(x - 8, y - 1, 16, 1, dark);
    s.fillRect(x - 2, y - 10, 5, 2, 0x1a1d22);
    s.fillRect(x - 6, y, 3, 3, 0x1a1d22);
    s.fillRect(x + 3, y, 3, 3, 0x1a1d22);
    // girophare
    s.fillRect(x - 1, y - 12, 3, 2, (Math.floor(now / 160) % 2) ? 0x6be3ff : 0xff4d6d);
    // « ! » au-dessus
    const yy = y - 20 + Math.round(Math.sin(now / 180) * 2);
    s.setAlpha(0.9);
    s.fillRect(x + 6, yy, 2, 8, 0xfff6c4);
    s.fillRect(x + 6, yy + 10, 2, 3, 0xfff6c4);
    s.setAlpha(1);
  }

  drawParticles(s) {
    for (const p of this.particles) {
      const a = Math.min(1, p.life / (p.max || 0.6) * 1.6);
      s.setAlpha(a);
      s.fillRect(p.x, p.y, p.size, p.size, p.color);
    }
    s.setAlpha(1);
  }

  drawRipples(s) {
    for (const w of this.ripples) {
      const k = 1 - w.life / w.max;
      s.setAlpha(1 - k);
      s.ring(w.x, w.y, 2 + k * w.maxR, w.color, Math.max(1, Math.round(2 - k * 1.5)));
    }
    s.setAlpha(1);
  }

  drawFloats(s) {
    for (const f of this.floats) {
      const k = f.life / f.max;
      s.setAlpha(Math.min(1, k * 2.2));
      s.text(f.text, f.x, f.y, { size: f.size, color: f.color, align: 'center', font: 'VT323, monospace' });
      s.setAlpha(1);
    }
  }

  /** Icône de bulle (pièce, gemme, fusée). */
  drawBubble(s, b, now) {
    const bob = Math.sin(now / 260 + b.x) * 3;
    const x = Math.round(b.x), y = Math.round(b.y + bob);
    const scale = 1 + Math.sin(now / 180) * 0.06;
    const glow = b.kind === 'gem' ? 0xff55cc : b.kind === 'coin' ? 0xffd166 : 0x6be3ff;
    const pulse = 0.5 + 0.5 * Math.sin(now / 220);
    for (let i = 0; i < 5; i++) {
      s.setAlpha(0.045 + 0.03 * pulse + i * 0.02);
      s.circle(x, y, (13 - i * 1.6) * scale, glow);
    }
    s.setAlpha(1);
    // halo
    s.ring(x, y, 10, 0xfff6c4, 1);
    s.ring(x, y, 11, 0x000000, 1);
    if (b.kind === 'coin') {
      s.circle(x, y, 7, 0xffd166);
      s.circle(x, y - 1, 6, 0xffe9a0);
      s.fillRect(x - 4, y - 1, 8, 1, 0xd8a520);
      s.fillRect(x - 1, y - 4, 2, 8, 0xd8a520);
      s.fillRect(x - 3, y - 4, 1, 2, 0xfff6c4);
    } else if (b.kind === 'gem') {
      s.fillRect(x - 1, y - 7, 3, 2, 0xb06bff);
      for (let i = 0; i < 7; i++) {
        const w = 9 - Math.abs(i - 3) * 2;
        s.fillRect(x - Math.floor(w / 2), y - 5 + i, w, 1, i < 2 ? 0xff8fe0 : i < 5 ? 0xff55cc : 0xc020a0);
      }
      s.fillRect(x - 2, y - 4, 1, 1, 0xfff0ff);
    } else {
      s.fillRect(x - 2, y - 7, 5, 8, 0xffffff);
      s.fillRect(x - 1, y - 11, 3, 4, 0xffffff);
      s.fillRect(x - 1, y - 9, 3, 3, 0x6be3ff);
      s.fillRect(x - 2, y + 2, 2, 3, 0xff9f43);
      s.fillRect(x + 1, y + 2, 2, 3, 0xff9f43);
      s.fillRect(x - 1, y + 2, 2, 4, 0xffd166);
    }
  }

  /** Parcelle : bâtiment(s), lot vide, badge de compteur. */
  drawPlot(s, plot, state, variant, neon, sky) {
    const n = state.buildings[plot.def.id] || 0;
    if (n <= 0) { this.drawEmptyLot(s, plot, state, sky); return; }
    const tier = tierOf(n);
    const sp = (t) => this.sprites.get(plot.def, Math.max(0, Math.min(5, t)), variant, neon);

    // densité : jusqu'à 3 bâtiments décalés + silhouettes
    const spr3 = n >= 18 ? sp(Math.max(0, tier - 2)) : null;
    const spr2 = n >= 6 ? sp(Math.max(0, tier - 1)) : null;
    const main = sp(tier);

    const gy = plot.ground;
    if (spr3) {
      const off = Math.round(main.w * 0.55);
      s.setAlpha(0.85);
      this.blitAnchored(s, spr3, plot.x - off - 4, gy);
      s.setAlpha(1);
    }
    if (spr2) {
      const off = Math.round(main.w * 0.45);
      s.setAlpha(0.92);
      this.blitAnchored(s, spr2, plot.x + off + 6, gy);
      s.setAlpha(1);
    }
    // ombre de foule/marché quand le bâtiment est énorme
    if (n >= 40) {
      const r = mulberry(plot.index * 91 + 5);
      for (let i = 0; i < 4; i++) {
        const x = plot.x + (r() * 70 - 35);
        s.setAlpha(0.5);
        s.fillRect(x, gy - 1, 4, 1, 0x1a2340);
        s.setAlpha(1);
      }
    }
    this.blitAnchored(s, main, plot.x, gy);

    // badge : nombre d'unités + flèche de palier
    const bx = plot.x, by = gy + 6;
    const label = '×' + n;
    const w = Math.max(20, label.length * 6 + 10);
    s.setAlpha(0.72);
    s.fillRect(bx - w / 2, by - 2, w, 11, 0x11162a);
    s.setAlpha(1);
    s.fillRect(bx - w / 2, by - 2, w, 1, mixInt(plot.def.pal.accent, 0xffffff, 0.2));
    s.text(label, bx, by + 1, { size: 10, color: 0xf4f8ff, align: 'center', font: 'VT323, monospace' });
    // progression vers le prochain palier
    const step = nextTierAt(n);
    if (step != null) {
      const prev = [0, 1, 10, 25, 50, 100, 200].filter((x) => x <= n).pop() || 0;
      const k = (n - prev) / (step - prev);
      s.fillRect(bx - w / 2, by + 9, w, 2, 0x2a3350);
      s.fillRect(bx - w / 2, by + 9, Math.max(1, Math.round(w * k)), 2, 0xffd166);
    }
  }

  blitAnchored(s, sprImg, x, ground) {
    s.sprite(sprImg.img, x - sprImg.img.width / 2, ground - (sprImg.img.height - 3));
  }

  drawEmptyLot(s, plot, state, sky) {
    const gy = plot.ground;
    const w = 46, h = 12;
    // terrain vague
    s.fillRect(plot.x - w / 2, gy - h + 3, w, h, 0x6b5b3a);
    s.fillRect(plot.x - w / 2, gy - h + 3, w, 1, 0x8a7448);
    const r = mulberry(plot.index * 31 + 4);
    for (let i = 0; i < 14; i++) s.fillRect(plot.x - w / 2 + r() * w, gy - h + 4 + r() * (h - 2), 2, 1, 0x574827);
    // barrière en bois
    for (let i = 0; i < 5; i++) {
      const x = plot.x - w / 2 - 2 + i * 12;
      s.fillRect(x, gy - h - 3, 2, 8, 0x9a6b3a);
    }
    s.fillRect(plot.x - w / 2 - 3, gy - h - 1, w + 6, 2, 0xb98a4a);
    s.fillRect(plot.x - w / 2 - 3, gy - h - 5, w + 6, 2, 0xb98a4a);
    // numéro de parcelle (repère de construction)
    s.fillRect(plot.x - 4, gy - h - 20, 8, 7, 0x1b2340);
    s.fillRect(plot.x - 4, gy - h - 20, 8, 1, 0x3d4a7a);
    s.text(String(plot.index + 1), plot.x, gy - h - 19, { size: 9, color: 0x9fb0d0, align: 'center', font: 'VT323, monospace' });
    // panneau « à bâtir »
    s.fillRect(plot.x - 5, gy - h - 16, 10, 8, 0xd8c88a);
    s.fillRect(plot.x - 4, gy - h - 15, 8, 6, 0xf4e8c4);
    s.fillRect(plot.x - 2, gy - h - 14, 4, 1, 0x8a7448);
    s.fillRect(plot.x - 2, gy - h - 12, 4, 1, 0x8a7448);
    s.fillRect(plot.x - 1, gy - h - 8, 2, 6, 0x9a6b3a);
    // progression de déblocage
    const missing = Math.max(0, plot.def.unlock - state.lifetime);
    if (missing > 0) {
      const k = Math.max(0, Math.min(1, state.lifetime / plot.def.unlock));
      const pw = 40;
      s.setAlpha(0.75);
      s.fillRect(plot.x - pw / 2, gy + 4, pw, 5, 0x11162a);
      s.setAlpha(1);
      s.fillRect(plot.x - pw / 2 + 1, gy + 5, Math.max(1, Math.round((pw - 2) * k)), 3, 0x6be3ff);
      s.text('?', plot.x, gy + 11, { size: 10, color: 0x9fb0d0, align: 'center', font: 'VT323, monospace' });
    }
  }

  // ── Entrées ───────────────────────────────────────────────

  /** Que trouve-t-on sous le doigt ? (coordonnées monde) */
  hitTest(x, y, state) {
    if (this.taxi) {
      const t = this.taxi;
      if (Math.abs(x - t.x) < 14 && y > t.y - 22 && y < t.y + 6) return { type: 'taxi' };
    }
    for (const plot of this.plots) {
      if (!plot.bubble) continue;
      const b = plot.bubble;
      if (Math.abs(x - b.x) < 14 && Math.abs(y - b.y) < 17) return { type: 'bubble', plot };
    }
    // parcelles : on choisit la plus proche, la rangée avant a la priorité
    let best = null, bestD = 999;
    for (const plot of this.plots) {
      const n = state.buildings[plot.def.id] || 0;
      const hh = n > 0 ? 60 + tierOf(n) * 14 : 30;
      const w = n > 0 ? 40 : 26;
      if (Math.abs(x - plot.x) < w && y < plot.ground + 12 && y > plot.ground - hh) {
        const d = Math.abs(x - plot.x) + (plot.row === 'front' ? -6 : 0);
        if (d < bestD) { bestD = d; best = plot; }
      }
    }
    if (best) return { type: 'plot', plot: best };
    return { type: 'city' };
  }
}
