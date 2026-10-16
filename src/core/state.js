// ─────────────────────────────────────────────────────────────
//  PixCity · état de la partie (sérialisable tel quel)
// ─────────────────────────────────────────────────────────────
import { START, BUILDINGS } from './data.js';

export const SAVE_VERSION = 1;

export function newState() {
  const s = {
    v: SAVE_VERSION,
    coins: START.coins,
    gems: START.gems,
    stars: 0,
    lifetime: 0,        // pièces gagnées depuis toujours
    run: 0,             // pièces gagnées depuis le dernier prestige
    taps: 0,
    prestiges: 0,
    taxis: 0,
    adsWatched: 0,
    playtime: 0,
    buildings: {},
    up: {
      productivite: 0, doigts: 0, robots: 0, combo: 0, taxi: 0, depart: 0,
      horsligne: 0, autoCollect: false, assurance: false,
    },
    skins: { neon: false, active: 'classique' },
    boost: { mult: 1, until: 0, icon: '✨', label: '', src: '' },
    combo: { n: 0, best: 0, t: 0 },
    quests: { chain: 0, daily: [], dailyAt: 0, dailyDone: 0, streak: 0, streakBest: 0, chestDay: 0, tally: null },
    ach: [],
    shop: {
      bought: {}, vip: false, vipClaim: 0, noAds: false, founder: false,
      totalSpent: 0, count: 0, firstBuyAt: 0, lastBuyAt: 0,
    },
    flags: { intro: false, tutorial: 0, notice: {} },
    set: { sfx: true, haptics: true, particles: true, shake: true },
    freeAd: { at: 0 },
    offer: { id: null, until: 0, shown: false },
    seen: {},           // notification « déjà vu »
    time: { created: Date.now(), lastSeen: Date.now(), session: Date.now() },
  };
  for (const b of BUILDINGS) s.buildings[b.id] = 0;
  return s;
}

/** Champs manquants comblés (mise à jour de version). */
export function migrate(s) {
  const base = newState();
  const deep = (t, src) => {
    for (const k in src) {
      if (t[k] === undefined) t[k] = src[k];
      else if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) deep(t[k], src[k]);
    }
  };
  deep(s, base);
  for (const b of BUILDINGS) if (typeof s.buildings[b.id] !== 'number') s.buildings[b.id] = 0;
  s.v = SAVE_VERSION;
  return s;
}

export const S = {
  /** Instance vivante de l'état (remplie au démarrage). */
  state: null,
  get() { return S.state; },
  set(s) { S.state = s; },
  reset() { S.state = newState(); return S.state; },
};
