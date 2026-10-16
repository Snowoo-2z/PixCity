// ─────────────────────────────────────────────────────────────
//  PixCity · la scène de la ville
//  Ciel qui tourne, collines, routes, 12 parcelles, passants,
//  taxis, bulles à collecter, particules et textes flottants.
//  Tout est dessiné via une `Surface` (canvas ou framebuffer).
// ─────────────────────────────────────────────────────────────
import { BUILDINGS, tierOf, nextTierAt } from '../core/data.js';
import { drawNature } from './sprites.js';
import { mulberry, paintVerticalGradient, ditherRect, BAYER4 } from './surface.js';

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
    this._skyCache = new Map();   // dégradé du ciel, cuit par tranche d'heure
    this.shooting = 0;            // étoile filante en cours
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
    const add = (kind, x, y, floor, v) => this.props.push({
      kind, x: Math.round(x), y: Math.round(y), floor,
      v: v === undefined ? Math.floor(r() * 3) : v,
    });

    // ── lampadaires alignés le long des trottoirs ──────────
    let n = 0;
    for (let x = 30; x < WORLD.w; x += 84, n++) {
      add('lamp', x, 316, 0, 0);                       // bande centrale
      if (n % 2 === 0) add('bench', x + 28, 314, 0);
      if (n % 3 === 0) add('bin', x - 15, 314, 0);
    }
    n = 0;
    for (let x = 58; x < WORLD.w; x += 116, n++) {
      add('lamp', x, 353, 1, 0);                       // premier plan
      if (n % 2 === 0) add('bench', x + 32, 352, 1);
    }
    // ── arrêts de bus, bouches d'incendie, boîtes aux lettres
    add('busstop', 152, 353, 1);
    add('busstop', 476, 353, 1);
    for (let i = 0; i < 4; i++) add('hydrant', 96 + i * 132 + Math.floor(r() * 26), 353, 1);
    for (let i = 0; i < 3; i++) add('mailbox', 210 + i * 158 + Math.floor(r() * 34), 352, 1);
    // ── végétation : arbres taillés puis bosquets ──────────
    for (let x = 10; x < WORLD.w; x += 47) {
      const k = r();
      if (k < 0.4) add('tree', x + r() * 16, 320 + r() * 3, 0);
      else if (k < 0.58) add('pine', x + r() * 16, 320, 0);
      else if (k < 0.74) add('bush', x + r() * 18, 324, 0);
      else if (k < 0.86) add('flower', x + r() * 18, 323, 0);
      else add('birch', x + r() * 16, 320, 0);
    }
    for (let x = 22; x < WORLD.w; x += 61) {
      const k = r();
      if (k < 0.42) add('tree', x + r() * 18, 354 + r() * 3, 1);
      else if (k < 0.58) add('birch', x + r() * 18, 354, 1);
      else if (k < 0.72) add('bush', x + r() * 18, 356, 1);
      else if (k < 0.82) add('flower', x + r() * 18, 356, 1);
      else if (k < 0.88) add('rock', x + r() * 18, 356, 1);
    }
    // ── vie de quartier ────────────────────────────────────
    add('stall', 322, 355, 1);
    add('traffic', 250, 352, 1);
    add('fountain', 418, 320, 0);
    add('sign', 388, 320, 0);
    add('traffic', 566, 320, 0);
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
    const haze = mixInt(sky.bot, 0xfff6d8, 0.22);          // lueur au ras de l'horizon
    paintVerticalGradient(s, 0, 0, WORLD.w, SKY_H, [
      [0, sky.top],
      [0.34, mixInt(sky.top, sky.bot, 0.3)],
      [0.64, mixInt(sky.top, sky.bot, 0.62)],
      [0.88, sky.bot],
      [1, haze],
    ], { levels: 14 });
    // sous la ligne d'horizon (recouvert par le sol, sert de pré-remplissage)
    paintVerticalGradient(s, 0, SKY_H, WORLD.w, WORLD.h - SKY_H, [
      [0, mixInt(sky.bot, haze, 0.5)],
      [1, mixInt(sky.bot, 0x1b2340, 0.42)],
    ], { levels: 6 });
  }

  drawSky(s, sky, now) {
    // dégradé du ciel : cuit une fois par tranche de 15 min de jeu
    const bucket = Math.floor(this.timeOfDay * 24);
    let canvas = null;
    if (this.useLayers && s.offscreen) {
      canvas = this._skyCache.get(bucket) || null;
      if (!canvas) {
        const off = s.offscreen(WORLD.w, SKY_H, 0);
        if (off) {
          this.drawSkyGradient(off, sky);
          canvas = off.layerCanvas;
          this._skyCache.set(bucket, canvas);
          if (this._skyCache.size > 6) this._skyCache.delete(this._skyCache.keys().next().value);
        }
      }
    }
    if (canvas) s.sprite(canvas, 0, 0);
    else this.drawSkyGradient(s, sky);

    // ── étoiles ────────────────────────────────────────────
    if (sky.star > 0.02) {
      const r = mulberry(99);
      const a = Math.min(1, sky.star);
      for (let i = 0; i < 150; i++) {
        const x = Math.floor(r() * WORLD.w);
        const v = r();
        const y = Math.floor(2 + v * v * (SKY_H - 90));       // plus denses en haut
        const tw = 0.55 + 0.45 * Math.sin(now / 700 + i * 1.7);
        if (tw < 0.5) continue;
        const big = i % 17 === 0;
        s.setAlpha(a * (0.4 + 0.6 * tw));
        s.fillRect(x, y, big ? 2 : 1, big ? 2 : 1, i % 9 === 0 ? 0xbfe8ff : 0xfff8e0);
        if (big && tw > 0.88) {                               // croix scintillante
          s.setAlpha(a * 0.45);
          s.fillRect(x - 2, y, 6, 1, 0xdfefff);
          s.fillRect(x, y - 2, 1, 6, 0xdfefff);
        }
      }
      s.setAlpha(1);
      // étoile filante, une toutes les 11 s
      const ph = (now % 11000) / 11000;
      if (ph < 0.09) {
        const k = ph / 0.09;
        const sx = 60 + k * 380, sy = 34 + k * 86;
        for (let i = 0; i < 15; i++) {
          s.setAlpha(a * (1 - k) * (i < 3 ? 0.95 : 0.5));
          s.fillRect(sx - i * 2, sy - i, 2, 1, i < 3 ? 0xffffff : 0xbfe8ff);
        }
        s.setAlpha(1);
      }
    }

    // ── soleil / lune ──────────────────────────────────────
    const arc = (this.timeOfDay <= 2 ? this.timeOfDay / 2 : (this.timeOfDay - 2) / 2);
    const cx = 60 + arc * (WORLD.w - 120);
    const cy = 150 - Math.sin(arc * Math.PI) * 108;
    if (this.timeOfDay > 2) {
      for (let i = 3; i >= 0; i--) {                          // halo de lune
        s.setAlpha(0.1);
        s.circle(cx, cy, 9 + i * 3, 0xbfe8ff);
      }
      s.setAlpha(1);
      s.circle(cx, cy, 9, 0xf4f8ff);
      s.circle(cx, cy - 1, 7, 0xffffff);
      s.circle(cx - 3, cy - 3, 2, 0xdce8f6);                  // mers de la lune
      s.circle(cx + 3, cy + 2, 2, 0xdce8f6);
      s.px && s.px(cx + 1, cy + 4, 0xdce8f6);
    } else {
      const warm = mixInt(sky.bot, 0xffe9a0, 0.6);
      for (let i = 4; i >= 1; i--) {                          // couronne du soleil
        s.setAlpha(0.09);
        s.circle(cx, cy, 10 + i * 3, warm);
      }
      s.setAlpha(1);
      s.circle(cx, cy, 10, 0xfff6c4);
      s.circle(cx - 2, cy - 2, 7, 0xffeead);
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
    const total = BUILDINGS.reduce((a, b) => a + (b.id ? state.buildings[b.id] || 0 : 0), 0);
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
      if (neon) s.fillRect(x, 254 - h, w, 1, 0xff2fd0);       // arête néon
      for (let wy = 2; wy < h - 4; wy += 6) {
        for (let wx = 2; wx < w - 2; wx += 5) {
          if ((i * 7 + wx + wy) % 13 < 3) s.fillRect(x + wx, 254 - h + 2 + wy, 1, 2, neon ? 0xff2fd0 : 0xffd166);
        }
      }
    }
    s.setAlpha(1);
  }

  /** Trottoir en pierre : arête claire, dalles, usure tramée. */
  pavement(s, y, h, o = {}) {
    s.fillRect(0, y, WORLD.w, h, 0x8a8f96);
    ditherRect(s, 0, y, WORLD.w, h, 0x7e838a, 0.34);
    if (o.top !== false) s.fillRect(0, y, WORLD.w, 1, 0xa9aeb5);
    s.fillRect(0, y + h - 1, WORLD.w, 1, 0x6f747b);
    for (let x = (o.off || 0); x < WORLD.w; x += 13) s.fillRect(x, y + 1, 1, Math.max(1, h - 2), 0x7a7f86);
    const r = mulberry(501 + y);
    for (let i = 0; i < 130; i++) {
      s.fillRect(Math.floor(r() * WORLD.w), y + 1 + Math.floor(r() * Math.max(1, h - 2)), 1, 1,
        r() < 0.5 ? 0x949aa1 : 0x82878e);
    }
    // herbes dans les interstices
    if (o.weeds) {
      const g = mulberry(902 + y);
      for (let i = 0; i < 26; i++) {
        const x = Math.floor(g() * WORLD.w);
        s.fillRect(x, y - 1, 1, 2, g() < 0.5 ? 0x3d7a3f : 0x2b5230);
      }
    }
  }

  /** Asphalte : grain, rustines et traces d'usure. */
  asphalt(s, y, h) {
    s.fillRect(0, y, WORLD.w, h, 0x3a3f48);
    ditherRect(s, 0, y, WORLD.w, h, 0x33383f, 0.42);
    ditherRect(s, 0, y, WORLD.w, h, 0x454b55, 0.13, 1, 1);
    const r = mulberry(77 + y);
    for (let i = 0; i < 6; i++) {
      const px = Math.floor(r() * WORLD.w), py = y + 1 + Math.floor(r() * (h - 4));
      ditherRect(s, px, py, 6 + Math.floor(r() * 12), 2 + Math.floor(r() * 2), 0x2c3038, 0.55, i, i);
    }
  }

  drawGround(s, sky) {
    // herbe : dégradé en bandes tramées
    paintVerticalGradient(s, 0, GROUND_Y, WORLD.w, WORLD.h - GROUND_Y, [
      [0, 0x4f8f3a], [0.3, 0x3f7a3c], [0.7, 0x376e36], [1, 0x2a5330],
    ], { levels: 7 });
    const r = mulberry(8);
    for (let y = GROUND_Y; y < WORLD.h; y++) {
      for (let x = 0; x < WORLD.w; x++) {
        const n = r();
        if (n < 0.03) s.fillRect(x, y, 1, 1, y % 2 ? 0x59a04a : 0x4f8f3a);
        else if (n > 0.978) s.fillRect(x, y, 1, 1, 0x24502a);
      }
    }
    // terre battue au pied des deux rangées de bâtiments
    for (const gy of [BACK_GROUND, FRONT_GROUND]) {
      ditherRect(s, 0, gy - 2, WORLD.w, 4, 0x6b5b3a, 0.8);
      s.fillRect(0, gy - 3, WORLD.w, 1, 0x8a7448);
      s.fillRect(0, gy + 1, WORLD.w, 1, 0x3a3222);
      const g = mulberry(gy * 7 + 3);
      for (let i = 0; i < 110; i++) {
        const x = Math.floor(g() * WORLD.w);
        s.fillRect(x, gy - 3 - Math.floor(g() * 3), 1, 2, g() < 0.5 ? 0x59a04a : 0x3d7a3f);
      }
    }
  }

  drawRoad(s, y, sky, dir) {
    this.pavement(s, y - 13, 4);
    this.asphalt(s, y - 9, 18);
    s.fillRect(0, y - 9, WORLD.w, 1, 0x4c525c);
    s.fillRect(0, y + 8, WORLD.w, 1, 0x2c3038);
    // traces de roues
    ditherRect(s, 0, y - 6, WORLD.w, 3, 0x32373f, 0.34);
    ditherRect(s, 0, y + 3, WORLD.w, 3, 0x32373f, 0.34);
    // lignes de rive
    for (let x = 0; x < WORLD.w; x += 7) {
      s.fillRect(x, y - 7, 4, 1, 0x6f747b);
      s.fillRect(x + 3, y + 6, 4, 1, 0x6f747b);
    }
    // bouches d'égout
    for (let x = 96; x < WORLD.w; x += 160) {
      s.fillRect(x, y + 3, 7, 4, 0x2a2e35);
      s.fillRect(x, y + 3, 7, 1, 0x454b55);
      for (let i = 1; i < 6; i += 2) s.fillRect(x + i, y + 4, 1, 2, 0x1f2329);
    }
    // ligne centrale
    for (let x = 4; x < WORLD.w; x += 22) s.fillRect(x, y, 12, 1, 0xd8c88a);
    // passages piétons
    for (let bx = 60; bx < WORLD.w; bx += 208) {
      for (let i = 0; i < 5; i++) {
        s.fillRect(bx + i * 3, y - 8, 2, 16, 0xe8e4d8);
        ditherRect(s, bx + i * 3, y - 8, 2, 16, 0xbfbcb0, 0.22, i, 1);
      }
      ditherRect(s, bx - 2, y - 8, 20, 16, 0xffffff, 0.12, bx, y);
    }
    // flaques qui reflètent le ciel (la nuit)
    if (sky.star > 0.45) {
      const r = mulberry(303 + y);
      for (let i = 0; i < 5; i++) {
        const pw = 10 + Math.floor(r() * 18), ph = 2 + Math.floor(r() * 2);
        const px = 20 + Math.floor(r() * (WORLD.w - 60)), py = y - 7 + Math.floor(r() * 10);
        ditherRect(s, px, py, pw, ph, mixInt(sky.bot, 0x6be3ff, 0.3), 0.75, i, y);
        s.setAlpha(0.45);
        s.fillRect(px + 2, py, Math.max(2, pw - 4), 1, 0xbfe8ff);
        s.setAlpha(1);
      }
    }
  }

  drawMidStrip(s, sky) {
    // pelouse centrale
    paintVerticalGradient(s, 0, 287, WORLD.w, 30, [
      [0, 0x4f8f3a], [0.45, 0x3f7a3c], [1, 0x357033],
    ], { levels: 5 });
    const r = mulberry(21);
    for (let i = 0; i < 340; i++) {
      const x = Math.floor(r() * WORLD.w), y = 288 + Math.floor(r() * 28);
      s.fillRect(x, y, 1, 1, r() < 0.5 ? 0x59a04a : 0x2b5230);
    }
    // sentier de terre qui serpente
    for (let x = 0; x < WORLD.w; x++) {
      const yy = 300 + Math.round(Math.sin(x * 0.019) * 2);
      ditherRect(s, x, yy, 1, 3, 0x8a7448, 0.5, x, 2);
      s.fillRect(x, yy + 3, 1, 1, 0x6b5b3a);
    }
    // trottoirs des deux rangées
    this.pavement(s, 282, 6, { weeds: true });
    this.pavement(s, 317, 5, { off: 6, weeds: true });
    // herbes folles le long des trottoirs
    const g = mulberry(55);
    for (let i = 0; i < 80; i++) {
      const x = Math.floor(g() * WORLD.w);
      s.fillRect(x, 288 + Math.floor(g() * 2), 1, 2, 0x3d7a3f);
      s.fillRect(x, 315 - Math.floor(g() * 2), 1, 2, 0x2b5230);
    }
  }

  drawForeground(s, sky) {
    const y = FRONT_GROUND + 21;
    const h = WORLD.h - y;
    // bord de trottoir + caniveau
    s.fillRect(0, y, WORLD.w, 2, 0xa9aeb5);
    s.fillRect(0, y + 2, WORLD.w, 1, 0x6f747b);
    ditherRect(s, 0, y + 3, WORLD.w, h - 3, 0x6f6a5f, 0.5);
    s.fillRect(0, y + 3, WORLD.w, h - 3, 0x6f6a5f);
    ditherRect(s, 0, y + 3, WORLD.w, h - 3, 0x5c574d, 0.35);
    ditherRect(s, 0, y + 3, WORLD.w, h - 3, 0x7d7768, 0.18, 1, 1);
    // pavés : deux rangées décalées
    for (let row = 0; row * 5 < h; row++) {
      const py = y + 4 + row * 5;
      if (py + 2 > WORLD.h) break;
      s.fillRect(0, py, WORLD.w, 1, row % 2 ? 0x5c574d : 0x655f54);
      for (let x = (row % 2 ? 9 : 0); x < WORLD.w; x += 18) s.fillRect(x, py + 1, 1, 3, 0x5c574d);
    }
    // grains, miettes et fissures
    const r = mulberry(404);
    for (let i = 0; i < 420; i++) {
      s.fillRect(Math.floor(r() * WORLD.w), y + 4 + Math.floor(r() * (h - 5)), 1, 1, r() < 0.5 ? 0x827a68 : 0x4f4a41);
    }
    const g = mulberry(77);
    for (let i = 0; i < 16; i++) {
      const x = Math.floor(g() * WORLD.w);
      s.fillRect(x, y + 3, 1, 2 + Math.floor(g() * 2), 0x3d7a3f);
      s.fillRect(x + 1, y + 3, 1, 1, 0x59a04a);
    }
    // caniveau : grille et bouche
    for (let x = 40; x < WORLD.w; x += 128) {
      s.fillRect(x, y + 3, 9, 3, 0x3a3833);
      for (let i = 1; i < 9; i += 2) s.fillRect(x + i, y + 3, 1, 3, 0x1f1e1b);
      s.fillRect(x - 1, y + 3, 11, 1, 0x55524a);
    }
    // flaques du soir
    if (sky.star > 0.35) {
      const p = mulberry(808);
      for (let i = 0; i < 6; i++) {
        ditherRect(s, Math.floor(p() * WORLD.w), y + 5 + Math.floor(p() * (h - 8)), 8 + Math.floor(p() * 16), 2, mixInt(sky.bot, 0x6be3ff, sky.star > 0.7 ? 0.4 : 0.15), 0.8, i, i);
      }
    }
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
    const lit = sky.star > 0.45;
    const head = c.dir > 0 ? 1 : -1;
    // ombre portée tramée
    ditherRect(s, x - 9, y + 2, 18, 2, 0x2b2e34, 0.55, x, y);
    if (c.kind === 'van') {
      s.fillRect(x - 9, y - 8, 18, 8, body);
      s.fillRect(x - 9, y - 8, 18, 1, mixInt(body, 0xffffff, 0.35));
      s.fillRect(x - 9, y - 4, 18, 1, mixInt(body, 0x000000, 0.22));
      s.fillRect(x + head * 2 - (head > 0 ? 0 : 6), y - 11, 7, 4, mixInt(body, 0xffffff, 0.18));
      s.fillRect(x - 6, y - 7, 6, 3, lit ? 0x9fe8ff : 0xcfe6f2);
      s.fillRect(x - 6, y - 7, 6, 1, 0xe8f6ff);
      s.fillRect(x + head * 8 - (head > 0 ? 0 : 1), y - 5, 2, 2, lit ? 0xfff0b0 : 0xffe9a0);
    } else {
      s.fillRect(x - 8, y - 5, 16, 5, body);
      s.fillRect(x - 8, y - 5, 16, 1, mixInt(body, 0xffffff, 0.4));
      s.fillRect(x - 8, y - 2, 16, 1, mixInt(body, 0x000000, 0.25));
      s.fillRect(x - 4, y - 8, 9, 3, mixInt(body, 0xffffff, 0.15));
      s.fillRect(x - 3, y - 8, 4, 3, lit ? 0x9fe8ff : 0xd6ecf7);
      s.fillRect(x + 2, y - 8, 3, 3, lit ? 0x9fe8ff : 0xd6ecf7);
      s.fillRect(x - 3, y - 8, 4, 1, 0xf2fbff);
      s.fillRect(x + head * 8 - (head > 0 ? 1 : 0), y - 5, 2, 2, lit ? 0xfff0b0 : 0xffe9a0);
    }
    if (lit) {
      // faisceau des phares dans la nuit
      for (let i = 1; i <= 5; i++) {
        s.setAlpha(0.13);
        s.fillRect(x + head * (8 + i) - (head > 0 ? 0 : 1), y - 4, 2, 3, 0xfff0b0);
      }
      s.setAlpha(1);
    }
    // roues + enjoliveurs
    for (const wx of [x - 6, x + 3]) {
      s.fillRect(wx, y, 3, 3, 0x1a1d22);
      s.fillRect(wx, y, 3, 1, 0x50555c);
      s.fillRect(wx + 1, y + 1, 1, 1, 0x6f747b);
    }
  }

  drawTaxi(s, tx, now) {
    const bob = Math.round(Math.sin(tx.bob * 6) * 1);
    const x = Math.round(tx.x), y = Math.round(tx.y) + bob;
    const body = 0xffd166, dark = 0xd8a520, cream = 0xfff6c4;
    // halo doré tramé (remplace les cercles pleins)
    for (let i = 0; i < 4; i++) {
      const rx = 15 - i * 3, ry = 6 - i;
      for (let dx = -rx; dx <= rx; dx++) {
        const t = Math.abs(dx) / rx;
        const hy = Math.round(ry * Math.sqrt(Math.max(0, 1 - t * t)));
        for (let dy = -hy; dy <= hy; dy++) {
          if (((dx + dy) & 1)) continue;
          s.setAlpha(0.06);
          s.fillRect(x + dx, y + dy + 2 + i, 1, 1, 0xffd166);
        }
      }
    }
    s.setAlpha(1);
    ditherRect(s, x - 9, y + 2, 18, 2, 0x2b2e34, 0.55, x, y);
    // carrosserie dorée
    s.fillRect(x - 8, y - 5, 16, 5, body);
    s.fillRect(x - 8, y - 5, 16, 1, 0xffe9a0);
    s.fillRect(x - 4, y - 8, 9, 3, body);
    s.fillRect(x - 3, y - 8, 4, 3, cream);
    s.fillRect(x + 2, y - 8, 3, 3, cream);
    s.fillRect(x - 3, y - 8, 4, 1, 0xffffff);
    s.fillRect(x - 8, y - 2, 16, 1, dark);
    // bande à damier
    for (let i = 0; i < 8; i++) {
      if (i % 2) continue;
      s.fillRect(x - 8 + i * 2, y - 4, 1, 1, 0x1a1d22);
      s.fillRect(x - 8 + i * 2 + 1, y - 3, 1, 1, 0x1a1d22);
    }
    // enseigne de toit + girophare
    s.fillRect(x - 2, y - 10, 5, 2, 0x1a1d22);
    s.fillRect(x - 1, y - 10, 3, 1, 0xfff6c4);
    s.fillRect(x - 1, y - 13, 3, 2, (Math.floor(now / 160) % 2) ? 0x6be3ff : 0xff4d6d);
    s.px && s.px(x - 1, y - 14, 0xfff6c4);
    for (const wx of [x - 6, x + 3]) {
      s.fillRect(wx, y, 3, 3, 0x1a1d22);
      s.fillRect(wx, y, 3, 1, 0x50555c);
      s.fillRect(wx + 1, y + 1, 1, 1, 0xffd166);
    }
    // « ! » au-dessus
    const yy = y - 22 + Math.round(Math.sin(now / 180) * 2);
    s.setAlpha(0.9);
    s.fillRect(x + 7, yy, 2, 8, 0xfff6c4);
    s.fillRect(x + 7, yy + 10, 2, 3, 0xfff6c4);
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
    const glow = b.kind === 'gem' ? 0xff55cc : b.kind === 'coin' ? 0xffd166 : 0x6be3ff;
    const pulse = Math.floor((0.5 + 0.5 * Math.sin(now / 220)) * 3);
    // halo tramé (motif de Bayer) : un vrai « glow » pixel-art
    for (let r = 14; r >= 9; r--) {
      const a = (14 - r) * 0.05 + 0.08 + pulse * 0.03;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const d2 = dx * dx + dy * dy;
          if (d2 > r * r || d2 < (r - 1) * (r - 1)) continue;
          const th = (BAYER4[((y + dy) & 3) * 4 + ((x + dx) & 3)] + 0.5) / 16;
          if (th > a) continue;
          s.setAlpha(0.55);
          s.fillRect(x + dx, y + dy, 1, 1, glow);
        }
      }
    }
    s.setAlpha(1);
    // anneau d'ancrage
    for (let i = 0; i < 28; i++) {
      const ang = (i / 28) * Math.PI * 2 + now / 900;
      s.fillRect(x + Math.round(Math.cos(ang) * 10), y + Math.round(Math.sin(ang) * 6), 1, 1, 0xfff6c4);
    }
    if (b.kind === 'coin') {
      s.circle(x, y, 8, 0xd8a520);
      s.circle(x, y, 7, 0xffd166);
      s.circle(x, y - 1, 6, 0xffe9a0);
      s.fillRect(x - 4, y - 5, 3, 1, 0xfff6c4);
      s.fillRect(x - 5, y - 4, 1, 2, 0xfff6c4);
      s.fillRect(x - 1, y - 4, 2, 8, 0xd8a520);
      s.fillRect(x - 3, y - 2, 6, 1, 0xd8a520);
      s.fillRect(x - 3, y + 1, 6, 1, 0xd8a520);
      s.fillRect(x - 1, y - 4, 1, 8, 0x8a6a12);
      // éclat qui tourne
      const k = Math.floor(now / 420) % 4;
      const sx = x + (k === 0 ? 5 : k === 1 ? 3 : k === 2 ? -5 : -3);
      const sy2 = y + (k === 0 ? -5 : k === 1 ? 5 : k === 2 ? -3 : 5);
      s.fillRect(sx, sy2 - 2, 1, 5, 0xffffff);
      s.fillRect(sx - 2, sy2, 5, 1, 0xffffff);
    } else if (b.kind === 'gem') {
      s.fillRect(x - 1, y - 8, 3, 2, 0xb06bff);
      for (let i = 0; i < 7; i++) {
        const w = 9 - Math.abs(i - 3) * 2;
        s.fillRect(x - Math.floor(w / 2), y - 6 + i, w, 1, i < 2 ? 0xff8fe0 : i < 5 ? 0xff55cc : 0xc020a0);
      }
      s.fillRect(x - 2, y - 5, 2, 3, 0xfff0ff);
      s.fillRect(x - 1, y + 1, 3, 2, 0xffb4ec);
      s.fillRect(x + 1, y - 6, 1, 2, 0xffffff);
    } else {
      s.fillRect(x - 3, y - 6, 6, 9, 0xf4f8ff);
      s.fillRect(x - 2, y - 9, 4, 4, 0xf4f8ff);
      s.fillRect(x - 1, y - 8, 2, 3, 0x6be3ff);
      s.fillRect(x - 3, y - 6, 1, 9, 0xc3d6e8);
      s.fillRect(x + 2, y - 5, 1, 7, 0xc3d6e8);
      s.fillRect(x - 2, y + 3, 2, 3, 0xff9f43);
      s.fillRect(x + 1, y + 3, 2, 3, 0xff9f43);
      s.fillRect(x - 1, y + 3, 2, 4, 0xffd166);
      s.fillRect(x - 1, y - 7, 1, 2, 0xffffff);
    }
  }

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
    const w = 46, h = 11;
    const x0 = plot.x - w / 2;
    const top = gy - h;
    const night = sky.star > 0.45;
    const r = mulberry(plot.index * 31 + 4);
    // terrain vague : terre + bordure tramée
    s.fillRect(x0, top + 2, w, h - 2, 0x6b5b3a);
    ditherRect(s, x0, top + 2, w, h - 2, 0x574827, 0.35, plot.index, plot.index);
    s.fillRect(x0, top + 2, w, 1, 0x8a7448);
    s.fillRect(x0, gy, w, 1, 0x3a3222);
    for (let i = 0; i < 16; i++) {
      s.fillRect(x0 + Math.floor(r() * w), top + 3 + Math.floor(r() * (h - 3)), 1 + Math.floor(r() * 2), 1,
        r() < 0.5 ? 0x8a7448 : 0x4a3d22);
    }
    // herbes folles
    for (let i = 0; i < 9; i++) {
      const gx = x0 + 2 + Math.floor(r() * (w - 4));
      s.fillRect(gx, top + 1, 1, 2, 0x3d7a3f);
      s.fillRect(gx, top, 1, 1, 0x59a04a);
    }
    // barrière : poteaux fins + deux lisses + grillage tramé
    for (let x = x0 - 2; x < x0 + w + 3; x += 8) s.fillRect(x, top - 6, 1, 8, 0x9a6b3a);
    s.fillRect(x0 - 3, top - 6, w + 6, 1, 0xb98a4a);
    s.fillRect(x0 - 3, top - 3, w + 6, 1, 0xa97c42);
    ditherRect(s, x0 - 3, top - 5, w + 6, 2, 0x6b5b3a, 0.4, plot.index, 1);
    // matériaux de chantier
    s.fillRect(x0 + 3, top + 5, 7, 3, 0x9a6b3a);      // planches
    s.fillRect(x0 + 3, top + 5, 7, 1, 0xb98a4a);
    s.fillRect(x0 + 12, top + 4, 8, 4, 0x8a8f96);      // parpaings
    ditherRect(s, x0 + 12, top + 4, 8, 4, 0x6f747b, 0.3);
    s.fillRect(x0 + 22, top + 5, 9, 3, 0x9aa7b8);      // tuyaux
    s.fillRect(x0 + 22, top + 5, 9, 1, 0xc7d2e0);
    ditherRect(s, x0 + 32, top + 5, 9, 4, 0xd8c88a, 0.55);   // tas de sable
    s.fillRect(x0 + 33, top + 4, 7, 1, 0xf4e8c4);
    // barrière de chantier rayée
    const bx = x0 + w - 12, byy = top + 1;
    s.fillRect(bx, byy, 11, 3, 0xe8e4d8);
    for (let i = 0; i < 11; i += 4) {
      s.fillRect(bx + i, byy, 2, 3, 0xd0504c);
      s.fillRect(bx + i + 1, byy + 1, 1, 1, 0xd0504c);
    }
    s.fillRect(bx + 1, byy + 3, 1, 2, 0x6f747b);
    s.fillRect(bx + 9, byy + 3, 1, 2, 0x6f747b);
    // plaque de parcelle, plantée sur la barrière
    const sy = gy - h - 15;
    s.fillRect(plot.x - 7, sy + 8, 1, 5, 0x7d5227);
    s.fillRect(plot.x + 6, sy + 8, 1, 5, 0x7d5227);
    s.fillRect(plot.x - 8, sy, 16, 9, 0x1b2340);
    s.fillRect(plot.x - 7, sy + 1, 14, 7, 0x232c4f);
    s.fillRect(plot.x - 8, sy, 16, 1, 0x3d4a7a);
    s.fillRect(plot.x - 7, sy + 1, 6, 2, 0xd0504c);
    s.text(String(plot.index + 1), plot.x, sy + 2, { size: 10, color: 0xffd166, align: 'center', font: 'VT323, monospace' });
    if (night) s.fillRect(plot.x - 8, sy + 8, 16, 1, 0x6be3ff);
    // progression de déblocage
    const missing = Math.max(0, plot.def.unlock - state.lifetime);
    if (missing > 0) {
      const k = Math.max(0, Math.min(1, state.lifetime / plot.def.unlock));
      const pw = 40;
      s.setAlpha(0.8);
      s.fillRect(plot.x - pw / 2, gy + 4, pw, 6, 0x11162a);
      s.setAlpha(1);
      s.fillRect(plot.x - pw / 2 + 1, gy + 5, Math.max(1, Math.round((pw - 2) * k)), 4, 0x6be3ff);
      ditherRect(s, plot.x - pw / 2 + 1, gy + 5, Math.max(1, Math.round((pw - 2) * k)), 4, 0xbfe8ff, 0.3, 1, 1);
      s.text('?', plot.x, gy + 3, { size: 10, color: 0x9fb0d0, align: 'center', font: 'VT323, monospace' });
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
