// ─────────────────────────────────────────────────────────────
//  PixCity · orchestrateur : état, boucle, actions, sauvegarde
// ─────────────────────────────────────────────────────────────
import { S } from '../core/state.js';
import { BUILDINGS, BUILDING_BY_ID, GEM_UPGRADES, GEM_UNIQUE, GEM_CONSUMABLES, tierOf, REWARDED_AD } from '../core/data.js';
import { bus } from '../core/bus.js';
import { fmt, fmtShort, clamp } from '../core/format.js';
import * as Eco from '../core/economy.js';
import { loadGame, saveGame, wipeSave, offlineGain, applyOffline, storage } from '../core/save.js';
import { checkAchievements, ACH } from '../core/achievements.js';
import { refreshDaily, chainInfo, claimChain, dailyInfo, claimDaily, claimDailyChest, tally } from '../core/quests.js';
import { Audio, haptic } from '../core/audio.js';
import { Backend } from './backend.js';
import { CanvasSurface } from '../gfx/surface.js';
import { SpriteCache } from '../gfx/spritecache.js';
import { CityScene, WORLD } from '../gfx/city.js';
import { grantPack, PACKS, packById, rollOffer, offerActive, priceFor, vipAvailable, claimVip, rewardedAvailable, claimRewarded } from '../core/iap.js';

const DOCK_H = 74;

export const Game = {
  state: null,
  sprites: null,
  scene: null,
  surface: null,
  rng: Math.random,
  derived: null,
  last: 0,
  acc: 0,
  fps: 60,
  uiOpen: false,
  paused: false,
  away: 0,
  bigBuyMode: 1,
  logs: [],
  ready: false,

  // ── Démarrage ─────────────────────────────────────────────
  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.surface = new CanvasSurface(this.ctx);
    this.sprites = new SpriteCache();
    const { state, fresh, broken } = loadGame();
    S.set(state);
    this.state = state;
    this.scene = new CityScene(this.sprites);
    this.pan = { x: WORLD.w / 2, y: WORLD.h / 2 };
    this.view = { scale: 1.6, vw: window.innerWidth, vh: window.innerHeight, portrait: true };
    this.fresh = fresh;
    this.broken = broken;
    return { state, fresh, broken };
  },

  /** À appeler une fois les sprites préchargés. */
  start() {
    this.state.time.session = Date.now();
    this.ready = true;
    this.layout();
    window.addEventListener('resize', () => this.layout());
    window.addEventListener('orientationchange', () => setTimeout(() => this.layout(), 120));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.save(true); this.hiddenAt = performance.now(); }
      else this.onReturn();
    });
    window.addEventListener('beforeunload', () => this.save(true));
    setInterval(() => this.save(), 8000);

    // gains hors-ligne au lancement
    const off = offlineGain(this.state, Date.now());
    if (!this.fresh && off.coins > 1) {
      applyOffline(this.state, off);
      setTimeout(() => bus.emit('offline', off), 600);
    }
    this.state.time.lastSeen = Date.now();

    this.refreshQuests();
    const got = checkAchievements(this.state);
    if (got.length && !this.fresh) bus.emit('ach:many', got);

    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    bus.emit('game:ready', this.state);
    return off;
  },

  onReturn() {
    const now = performance.now();
    const away = (now - (this.hiddenAt || now)) / 1000;
    this.hiddenAt = null;
    if (away < 45) return;
    const off = offlineGain(this.state, Date.now());
    if (off.coins > 1) {
      applyOffline(this.state, off);
      bus.emit('offline', off);
    }
    this.state.time.lastSeen = Date.now();
  },

  // ── Boucle ────────────────────────────────────────────────
  frame(now) {
    const dtRaw = (now - this.last) / 1000;
    this.last = now;
    const dt = clamp(dtRaw, 0, 0.1);
    this.fps = this.fps * 0.92 + (1 / Math.max(0.0001, dtRaw)) * 0.08;

    if (!this.paused) this.step(dt, now);
    this.render(now);
    requestAnimationFrame((t) => this.frame(t));
  },

  step(dt, now) {
    const s = this.state;
    const wall = Date.now();
    Eco.tick(s, dt, wall);
    this.scene.update(dt, wall, s);
    this.derived = Eco.derive(s, wall);
    this.questT = (this.questT || 0) + dt;
    this.achT = (this.achT || 0) + dt;
    this.offerT = (this.offerT || 0) + dt;
    this.autoT = (this.autoT || 0) + dt;

    if (this.questT > 1) {
      this.questT = 0;
      // suivi des pièces du jour
      const delta = s.lifetime - (this._lastLifetime ?? s.lifetime);
      if (delta > 0) tally(s, 'coins', delta);
      this._lastLifetime = s.lifetime;
      refreshDaily(s, Date.now());   // bascule à minuit
      this.checkQuestReady();
    }
    if (this.achT > 1.4) { this.achT = 0; this.checkAch(); }
    if (this.offerT > 20) { this.offerT = 0; this.maybeOffer(); }
    if (this.autoT > 3) { this.autoT = 0; this.autoCollect(); }
    this.autoPan(dt);
    this.checkUnlocks();
    bus.emit('tick', s);
  },

  /** Déplacement automatique de la caméra quand la ville dépasse l'écran. */
  autoPan(dt) {
    if (!this.view) return;
    const worldW = WORLD.w * this.view.scale;
    if (worldW <= this.view.vw + 4) return;
    const idleFor = (Date.now() - (this.lastTouch || 0)) / 1000;
    if (idleFor < 3.5) return;
    this.autoDir = this.autoDir || 1;
    const speed = 26; // pixels monde / seconde
    this.pan.x += speed * dt * this.autoDir;
    const half = this.view.vw / (2 * this.view.scale);
    const min = half, max = WORLD.w - half;
    if (this.pan.x >= max) { this.pan.x = max; this.autoDir = -1; }
    if (this.pan.x <= min) { this.pan.x = min; this.autoDir = 1; }
    this.applyTransform();
  },

  render(now) {
    if (!this.ready) return;
    this.scene.draw(this.surface, this.state, now);
  },

  layout() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const portrait = vh > vw;
    const playH = Math.max(200, vh - DOCK_H * 0.7); // zone de jeu utile
    let scale;
    if (portrait) {
      // Portrait : on zoome pour que la ville soit lisible, quitte à
      // devoir se déplacer latéralement (la caméra le fait toute seule).
      const byWidth = (vw / 640) * 1.55;
      const byHeight = (playH / 360) * 0.78;
      scale = Math.max(vw / 640, Math.min(byWidth, byHeight));
    } else {
      // Paysage / desktop : toute la ville à l'écran
      scale = Math.min(vw / 640, playH / 360);
    }
    scale = Math.max(0.3, Math.min(scale, 4));
    this.view = { scale, vw, vh, portrait };
    if (!this.pan) this.pan = { x: WORLD.w / 2, y: WORLD.h / 2 };
    this.clampPan();
    this.applyTransform();
  },

  clampPan() {
    const { scale, vw, vh } = this.view;
    const playH = this.playH();
    const worldW = WORLD.w * scale, worldH = WORLD.h * scale;
    const halfW = vw / (2 * scale), halfH = playH / (2 * scale);
    this.pan.x = worldW <= vw ? WORLD.w / 2 : clamp(this.pan.x, halfW, WORLD.w - halfW);
    this.pan.y = worldH <= playH ? WORLD.h / 2 : clamp(this.pan.y, halfH, WORLD.h - halfH);
  },

  playH() {
    return Math.max(160, window.innerHeight - DOCK_H * 0.55);
  },

  applyTransform() {
    const { scale, vw, vh } = this.view;
    const wrap = document.getElementById('canvas-wrap');
    if (!wrap) return;
    const dx = vw / 2 - this.pan.x * scale;
    const dy = this.playH() / 2 - this.pan.y * scale;
    wrap.style.transformOrigin = '0 0';
    wrap.style.transform = `translate(${Math.round(dx)}px, ${Math.round(dy)}px) scale(${scale})`;
  },

  panBy(dxPx, dyPx) {
    if (!this.view) return;
    this.lastTouch = Date.now();
    this.pan.x -= dxPx / this.view.scale;
    this.pan.y -= dyPx / this.view.scale;
    this.clampPan();
    this.applyTransform();
  },

  panTo(worldX, worldY) {
    this.pan.x = worldX; this.pan.y = worldY;
    this.clampPan();
    this.applyTransform();
  },

  // ── Entrées : conversion écran → monde ────────────────────
  toWorld(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / r.width) * WORLD.w,
      y: ((clientY - r.top) / r.height) * WORLD.h,
    };
  },

  // ── Tap ───────────────────────────────────────────────────
  tap(clientX, clientY, isDouble = false) {
    const s = this.state;
    this.lastTouch = Date.now();
    const p = this.toWorld(clientX, clientY);
    const hit = this.scene.hitTest(p.x, p.y, s);
    Audio.resume();

    if (hit.type === 'bubble') return this.collectBubble(hit.plot, p);
    if (hit.type === 'taxi') return this.catchTaxi();

    // combo
    s.combo.n = Math.min(s.combo.n + 1, 260);
    s.combo.t = 0;
    const mult = Eco.comboMult(s);
    s.combo.best = Math.max(s.combo.best || 0, mult);

    const gain = Eco.tapValue(s, Date.now());
    Eco.addCoins(s, gain);
    s.taps++;
    tally(s, 'taps', 1);

    const gy = hit.type === 'plot' ? hit.plot.ground : p.y;
    const fy = Math.min(p.y, gy - 6);
    this.scene.addFloat('+' + fmt(gain), p.x, fy, {
      color: mult >= 3 ? 0xffb3ff : 0xffe9a0,
      size: mult >= 3 ? 15 : 13,
      life: 0.85,
    });
    if (s.set.particles) {
      this.scene.burst(p.x, fy + 6, {
        n: isDouble ? 14 : 7,
        colors: mult >= 3 ? [0xff4dd2, 0xff9ff0, 0xfff3c4] : [0xffd166, 0xfff6c4, 0xd8a520],
        speed: 42, up: 40, size: 2, life: 0.6, g: 150,
      });
      this.scene.ripple(p.x, fy + 6, mult >= 3 ? 0xff9ff0 : 0xffe9a0, 16 + mult * 2);
    }
    if (s.set.shake) this.scene.shakeIt(1.2 + Math.min(2.5, mult * 0.3), 0.14);
    if (s.set.haptics) haptic(8);
    Audio.play('tap', { pitch: Math.min(18, s.combo.n) });

    bus.emit('tap', { gain, mult, world: p, hit });
    return { type: 'tap', gain, mult };
  },

  // ── Bonus de bâtiment ─────────────────────────────────────
  collectBubble(plot, world) {
    const s = this.state;
    const d = this.derived || Eco.derive(s);
    const b = plot.bubble;
    plot.bubble = null;
    plot.next = 24 + Math.random() * 30;
    s.collects = (s.collects || 0) + 1;
    tally(s, 'collects', 1);
    const def = plot.def;

    if (b.kind === 'coin') {
      const gain = Math.max(d.income * 45, def.income * (s.buildings[def.id] || 1) * 20, 25);
      Eco.addCoins(s, gain);
      this.scene.addFloat('+' + fmt(gain), world.x, world.y - 8, { color: 0xffe9a0, size: 14, life: 1.1 });
      this.scene.burst(world.x, world.y, { n: 12, colors: [0xffd166, 0xfff6c4, 0xd8a520], speed: 55, up: 55, size: 2, life: 0.7 });
      Audio.play('coin');
      bus.emit('collect', { kind: 'coin', gain, x: world.x, y: world.y });
      return { kind: 'coin', gain };
    }
    if (b.kind === 'gem') {
      const gems = 1 + (Math.random() < 0.25 + s.up.taxi * 0.03 ? 2 : 0);
      s.gems += gems;
      this.scene.addFloat('+' + gems + ' 💎', world.x, world.y - 8, { color: 0xe5ccff, size: 14, life: 1.2 });
      this.scene.burst(world.x, world.y, { n: 14, colors: [0xb06bff, 0xff4dd2, 0xe5ccff], speed: 60, up: 60, size: 2, life: 0.8 });
      Audio.play('gem');
      bus.emit('collect', { kind: 'gem', gain: gems, x: world.x, y: world.y });
      return { kind: 'gem', gain: gems };
    }
    // fusée : boost de production
    const mult = 3 + Math.floor(Math.random() * 3);
    const secs = 45 + Math.floor(Math.random() * 30);
    Eco.applyBoost(s, mult, secs, '🚀', 'Bonus de bâtiment', 'bubble');
    tally(s, 'boosts', 1);
    this.scene.addFloat('×' + mult + ' !', world.x, world.y - 10, { color: 0x6be3ff, size: 16, life: 1.3 });
    this.scene.burst(world.x, world.y, { n: 18, colors: [0x6be3ff, 0xbdf1ff, 0xffffff], speed: 70, up: 70, size: 2, life: 0.9 });
    Audio.play('boost');
    bus.emit('boost', { mult, secs });
    return { kind: 'boost', mult, secs };
  },

  autoCollect() {
    const s = this.state;
    if (!s.up.autoCollect) {
      if (s.autoAcc) s.autoAcc = 0;
      return;
    }
    s.autoAcc = (s.autoAcc || 0) + 3;
    if (s.autoAcc < 20) return;
    s.autoAcc = 0;
    for (const plot of this.scene.plots) {
      if (plot.bubble && (s.buildings[plot.def.id] || 0) > 0) {
        this.collectBubble(plot, { x: plot.bubble.x, y: plot.bubble.y });
      }
    }
  },

  catchTaxi() {
    const s = this.state;
    if (!this.scene.taxi) return { ok: false };
    const d = this.derived || Eco.derive(s);
    const x = this.scene.taxi.x, y = this.scene.taxi.y;
    this.scene.taxi = null;
    s.taxis = (s.taxis || 0) + 1;
    tally(s, 'taxis', 1);
    const roll = Math.random();
    let reward;
    if (roll < 0.5) {
      const gain = Math.max(d.income * 320, 120);
      Eco.addCoins(s, gain);
      reward = { kind: 'coins', gain };
      this.scene.addFloat('TAXI ! +' + fmt(gain), x, y - 16, { color: 0xffd166, size: 17, life: 1.5 });
    } else if (roll < 0.78) {
      const gems = 8 + Math.floor(Math.random() * 8);
      s.gems += gems;
      reward = { kind: 'gems', gain: gems };
      this.scene.addFloat('TAXI ! +' + gems + ' 💎', x, y - 16, { color: 0xe5ccff, size: 17, life: 1.5 });
    } else {
      const mult = 7;
      const secs = 100;
      Eco.applyBoost(s, mult, secs, '🚕', 'Taxi doré', 'taxi');
      tally(s, 'boosts', 1);
      reward = { kind: 'boost', mult, secs };
      this.scene.addFloat('FIÈVRE ×' + mult, x, y - 16, { color: 0xff9ff0, size: 17, life: 1.6 });
    }
    this.scene.burst(x, y - 4, { n: 26, colors: [0xffd166, 0xfff6c4, 0xff4dd2, 0x6be3ff], speed: 90, up: 70, size: 2, life: 1.1, g: 150 });
    if (s.set.shake) this.scene.shakeIt(4, 0.3);
    Audio.play('coin_big');
    if (s.set.haptics) haptic(30);
    bus.emit('taxi', reward);
    return reward;
  },

  // ── Achats de bâtiments ───────────────────────────────────
  buy(id, mode = this.bigBuyMode) {
    const s = this.state;
    const def = BUILDING_BY_ID[id];
    if (!def) return { ok: false };
    if (s.lifetime < def.unlock && (s.buildings[id] || 0) === 0) {
      Audio.play('error');
      bus.emit('notify', { text: `Il manque ${fmt(def.unlock - s.lifetime)} 🪙 gagnées pour débloquer ${def.name}.`, kind: 'info' });
      return { ok: false, why: 'locked' };
    }
    const want = mode === 'max' ? 'max' : Number(mode) || 1;
    const res = Eco.buyBuilding(s, id, want);
    if (!res.ok) {
      Audio.play('error');
      bus.emit('notify', { text: 'Pas assez de pièces pour ' + def.name + '.', kind: 'bad' });
      return res;
    }
    tally(s, 'buys', res.bought);
    Audio.play(res.bought >= 10 ? 'buy10' : 'buy');
    if (res.tierUp) {
      Audio.play('levelup');
      const nm = res.mult;
      this.cityLog(`${def.icon} ${def.name} : palier ×${nm} atteint !`);
      bus.emit('tier', { def, tier: res.tier, mult: nm });
    }
    if (s.set.haptics) haptic(res.tierUp ? 24 : 12);
    bus.emit('buy', { def, ...res });
    return res;
  },

  cityLog(text) {
    this.logs.push({ text, at: Date.now() });
    if (this.logs.length > 6) this.logs.shift();
    bus.emit('log', { text });
  },

  // ── Améliorations ─────────────────────────────────────────
  buyUpgrade(id) {
    const s = this.state;
    const res = Eco.buyGemUpgrade(s, id);
    if (!res.ok) {
      Audio.play('error');
      bus.emit('notify', { text: res.why === 'max' ? 'Niveau maximum atteint.' : 'Pas assez de gemmes 💎', kind: 'bad' });
      return res;
    }
    Audio.play('levelup');
    tally(s, 'gems', res.cost);
    const u = GEM_UPGRADES.find((x) => x.id === id);
    bus.emit('notify', { text: `${u.icon} ${u.name} niveau ${res.level} !`, kind: 'gem' });
    bus.emit('upgrade', { id, level: res.level });
    return res;
  },

  buyUnique(id) {
    const s = this.state;
    const res = Eco.buyUnique(s, id);
    if (!res.ok) {
      Audio.play('error');
      bus.emit('notify', { text: 'Pas assez de gemmes 💎', kind: 'bad' });
      return res;
    }
    const u = GEM_UNIQUE.find((x) => x.id === id);
    tally(s, 'gems', res.cost);
    Audio.play('gem');
    bus.emit('notify', { text: `${u.icon} ${u.name} débloqué !`, kind: 'gem' });
    bus.emit('unique', { id });
    return res;
  },

  useConsumable(id) {
    const s = this.state;
    const c = GEM_CONSUMABLES.find((x) => x.id === id);
    if (!c) return { ok: false };
    if (s.gems < c.cost) {
      Audio.play('error');
      bus.emit('notify', { text: 'Pas assez de gemmes 💎', kind: 'bad' });
      return { ok: false };
    }
    s.gems -= c.cost;
    tally(s, 'gems', c.cost);
    let msg = '';
    if (id === 'bulle') {
      const gain = Eco.instantIncome(s, 600);
      msg = `⏩ +${fmt(gain)} 🪙 (10 min)`;
    } else if (id === 'fete') {
      Eco.applyBoost(s, 5, 90, '🎉', 'Méga fête', 'gem');
      msg = '🎉 Production ×5 pendant 90 s !';
      tally(s, 'boosts', 1);
      Audio.play('boost');
    } else if (id === 'roulette') {
      this.scene.spawnTaxi();
      msg = '🚕 Un taxi doré arrive !';
    } else if (id === 'coffre') {
      const gain = Math.max(Eco.instantIncome(s, 1200), 60);
      msg = `📦 +${fmt(gain)} 🪙`;
    }
    Audio.play('coin_big');
    bus.emit('notify', { text: msg, kind: 'gem' });
    return { ok: true, msg };
  },

  // ── Prestige ──────────────────────────────────────────────
  prestige() {
    const s = this.state;
    const gain = Eco.prestigeGain(s);
    if (gain <= 0) return { ok: false };
    const before = { lifetime: s.lifetime, prestige: s.prestiges };
    const res = Eco.doPrestige(s);
    if (!res.ok) return res;
    tally(s, 'prestiges', 1);
    Audio.play('prestige');
    this.scene.bang();
    if (s.set.shake) this.scene.shakeIt(6, 0.5);
    bus.emit('prestige', { gain, before });
    this.cityLog(`🌟 Prestige ${s.prestiges} : +${gain} étoiles (production ×${Eco.starMult(s).toFixed(2)})`);
    this.save();
    return res;
  },

  // ── Boutique (achats simulés) ─────────────────────────────
  async buyPack(packId, onStep) {
    const s = this.state;
    const pack = packById(packId);
    if (!pack) return { ok: false };
    if (pack.kind === 'once' && s.shop.bought[packId]) return { ok: false, why: 'deja' };
    const price = priceFor(s, pack).price;
    const res = await onStep(pack, price);
    if (!res || !res.ok) return { ok: false };
    const grants = grantPack(s, pack, res.receipt);
    if (pack.id === 'starter' || pack.id === 'vip') s.offer = { id: null, until: 0, shown: true };
    const off = offerActive(s);
    if (off && off.id === pack.id) s.offer.used = true;
    Audio.play('cash');
    this.save();
    bus.emit('purchase', { pack, grants, receipt: res.receipt });
    return { ok: true, pack, grants };
  },

  getVip() { return claimVip(this.state); },
  getRewarded() {
    const res = claimRewarded(this.state);
    if (res.ok) { Audio.play('ad'); bus.emit('rewarded', res); }
    return res;
  },
  maybeOffer() {
    const s = this.state;
    if (s.shop.vip || s.up.noAds) return;
    const offer = offerActive(s);
    if (offer) { if (!offer.shown) { offer.shown = true; bus.emit('offer', offer); } return; }
    const next = rollOffer(s);
    if (next) { next.shown = true; bus.emit('offer', next); }
  },

  // ── Quêtes & succès ───────────────────────────────────────
  refreshQuests() {
    const fresh = refreshDaily(this.state);
    if (fresh) bus.emit('quests:daily');
  },
  claimChain() {
    const res = claimChain(this.state);
    if (!res.ok) return res;
    Audio.play('coin_big');
    bus.emit('quest:chain', res);
    return res;
  },
  claimDaily(id) {
    const res = claimDaily(this.state, id);
    if (!res.ok) return res;
    Audio.play('gem');
    bus.emit('quest:daily', res);
    return res;
  },
  claimDailyChest() {
    const res = claimDailyChest(this.state);
    if (!res.ok) return res;
    Audio.play('coin_big');
    bus.emit('quest:chest', res);
    return res;
  },
  checkQuestReady() {
    const info = chainInfo(this.state);
    const prev = this._chainReady;
    this._chainReady = !!(info && info.ready);
    if (this._chainReady && !prev) {
      Audio.play('coin');
      bus.emit('notify', { text: '📋 Quête terminée — à récupérer !', kind: 'win' });
    }
    for (const q of dailyInfo(this.state)) {
      const key = 'd_' + q.id;
      if (q.ready && !this.seen[key]) {
        this.seen[key] = true;
        bus.emit('notify', { text: `🎯 Défi réussi : ${q.label}`, kind: 'win' });
      }
    }
  },
  checkAch() {
    const got = checkAchievements(this.state);
    if (got.length) bus.emit('ach:many', got);
  },

  /** Révélations de nouveaux bâtiments. */
  checkUnlocks() {
    const s = this.state;
    for (const def of BUILDINGS) {
      const key = 'unlock_' + def.id;
      if (s.lifetime >= def.unlock && !s.seen[key]) {
        s.seen[key] = true;
        if (def.unlock > 0) {
          Audio.play('levelup');
          bus.emit('unlock', { def });
          this.cityLog(`${def.icon} ${def.name} disponible !`);
        }
      }
    }
  },

  // ── Sauvegarde ────────────────────────────────────────────
  save(silent) {
    const size = saveGame(this.state);
    if (!silent) bus.emit('saved', { size });
    return size;
  },
  wipe() {
    wipeSave();
    this.state = S.reset();
    this.scene = new CityScene(this.sprites);
    this.save(true);
    bus.emit('wiped');
  },

  settings() {
    const s = this.state;
    return {
      sfx: s.set.sfx, music: Audio.musicOn, crt: !document.getElementById('crt').classList.contains('off'),
      particles: s.set.particles, shake: s.set.shake, haptics: s.set.haptics,
    };
  },

  toggleSetting(key) {
    const s = this.state;
    switch (key) {
      case 'sfx': s.set.sfx = !s.set.sfx; Audio.setEnabled(s.set.sfx); break;
      case 'music': Audio.toggleMusic(!Audio.musicOn); break;
      case 'crt': document.getElementById('crt').classList.toggle('off'); break;
      case 'particles': s.set.particles = !s.set.particles; break;
      case 'shake': s.set.shake = !s.set.shake; if (!s.set.shake) this.scene.shakeIt(0, 0); break;
      case 'haptics': s.set.haptics = !s.set.haptics; break;
      default: break;
    }
    this.save(true);
    return this.settings();
  },

  fmt,
  fmtShort,
};
