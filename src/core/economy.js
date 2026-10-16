// ─────────────────────────────────────────────────────────────
//  PixCity · moteur économique (coûts, production, prestige…)
// ─────────────────────────────────────────────────────────────
import { BUILDINGS, BUILDING_BY_ID, COST_GROWTH, GEM_UPGRADES, GEM_UNIQUE, START, MILESTONE, tierOf, nextTierAt } from './data.js';

// ── Calculs de coût ──────────────────────────────────────────

/** Coût cumulé pour passer de `n` unités à `n + k` unités. */
export function costOf(def, n, k) {
  const g = COST_GROWTH;
  if (k <= 0) return 0;
  const first = def.cost * Math.pow(g, n);
  return first * (Math.pow(g, k) - 1) / (g - 1);
}

/** Nombre maximum d'unités achetables avec `coins`. */
export function maxAffordable(def, n, coins) {
  const g = COST_GROWTH;
  const first = def.cost * Math.pow(g, n);
  if (coins < first) return 0;
  const k = Math.floor(Math.log(1 + (coins * (g - 1)) / first) / Math.log(g));
  // sécurité numérique
  let kk = Math.min(Math.max(k, 0), 100000);
  while (kk > 0 && costOf(def, n, kk) > coins) kk--;
  while (costOf(def, n, kk + 1) <= coins && kk < 100000) kk++;
  return kk;
}

/** Multiplicateur de palier : ×2 toutes les 25 unités. */
export function milestoneMult(n) {
  return Math.pow(2, Math.floor(n / MILESTONE));
}

/** Production d'un bâtiment (hors multiplicateur global). */
export function buildingIncome(def, n) {
  return n * def.income * milestoneMult(n);
}

// ── Multiplicateurs globaux ──────────────────────────────────

export function starMult(s) {
  return Math.pow(1 + START.starBonus, s.stars);
}

export function boostMult(s, now = Date.now()) {
  return s.boost.until > now ? s.boost.mult : 1;
}

export function activeBoost(s, now = Date.now()) {
  return s.boost.until > now ? s.boost : null;
}

/** Multiplicateurs permanents (hors boost temporaire). */
export function permMult(s) {
  let m = 1;
  m *= starMult(s);
  m *= 1 + 0.25 * (s.up.productivite || 0);
  if (s.shop.vip) m *= 2;
  if (s.shop.bought.starter) m *= 2;
  if (s.shop.founder) m *= 1.5;
  if (s.up.assurance) {
    const tiers = BUILDINGS.reduce((a, b) => a + tierOf(s.buildings[b.id] || 0), 0);
    m *= 1 + 0.01 * tiers;
  }
  return m;
}

export function globalMult(s, now = Date.now()) {
  return permMult(s) * boostMult(s, now);
}

// ── Valeur d'un tap ──────────────────────────────────────────

/** Facteur de combo (1 → ×8 selon la fièvre). */
export function comboMult(s, maxMult) {
  const cap = maxMult || 3 + 0.5 * (s.up.combo || 0);
  const n = Math.min(s.combo.n, 400);
  return Math.min(1 + n * 0.05, cap);
}

export function tapValue(s, now = Date.now()) {
  const lvl = s.up.doigts || 0;
  const base = (START.tapBase + 0.5 * lvl) + 0.05 * incomeNoMult(s) * (1 + 0.25 * lvl);
  return base * globalMult(s, now) * comboMult(s);
}

/** Production par seconde sans les multiplicateurs globaux. */
export function incomeNoMult(s) {
  let total = 0;
  for (const def of BUILDINGS) total += buildingIncome(def, s.buildings[def.id] || 0);
  return total;
}

// ── Vue dérivée prête pour l'UI ──────────────────────────────

export function derive(s, now = Date.now()) {
  const pm = permMult(s);
  const bm = boostMult(s, now);
  const gm = pm * bm;
  const rows = [];
  let income = 0;
  let nextUnlock = null;

  for (const def of BUILDINGS) {
    const n = s.buildings[def.id] || 0;
    const each = buildingIncome(def, n) * gm;
    income += each;
    const unlocked = s.lifetime >= def.unlock || n > 0;
    if (!unlocked && (!nextUnlock || def.unlock < nextUnlock.def.unlock)) nextUnlock = { def, missing: def.unlock - s.lifetime };
    const tier = tierOf(n);
    const nextTier = nextTierAt(n);
    rows.push({
      def, n, unlocked, tier,
      income: each,
      eachUnit: def.income * milestoneMult(n) * gm,
      nextCost: costOf(def, n, 1),
      mult: milestoneMult(n),
      mProgress: (n % MILESTONE) / MILESTONE,
      nextTierAt: nextTier,
      tierProgress: 0,
    });
  }

  // Progression vers le prochain palier (0→1) pour chaque bâtiment
  for (const r of rows) {
    const step = nextTierAt(r.n);
    if (step == null) r.tierProgress = 1;
    else {
      const prev = [0, ...[1, 10, 25, 50, 100, 200].filter((x) => x < step)].pop();
      r.tierProgress = (r.n - prev) / (step - prev);
    }
  }

  return {
    rows, income, permMult: pm, boostMult: bm, globalMult: gm,
    tap: tapValue(s, now), combo: comboMult(s), nextUnlock,
    stars: s.stars, starsNext: starsFor(s.run + 0),
  };
}

// ── Prestige ─────────────────────────────────────────────────

/** Étoiles que rapporterait un prestige maintenant. */
export function starsFor(runEarned) {
  return Math.floor(Math.pow(Math.max(0, runEarned) / START.prestigeDivisor, START.prestigeExp));
}

/** Étoiles déjà gagnées au total (pour info UI). */
export function prestigeGain(s) {
  return starsFor(s.run);
}

export function doPrestige(s) {
  const gain = prestigeGain(s);
  if (gain <= 0) return { ok: false, gain: 0 };
  const keep = {
    gems: s.gems, stars: s.stars + gain, lifetime: s.lifetime, taps: s.taps,
    prestiges: s.prestiges + 1, adsWatched: s.adsWatched, up: s.up, skins: s.skins,
    shop: s.shop, quests: s.quests, ach: s.ach, set: s.set, flags: s.flags,
    freeAd: s.freeAd, offer: s.offer, seen: s.seen, playtime: s.playtime,
    time: s.time, taxis: s.taxis,
  };
  const fresh = s;
  for (const b of BUILDINGS) fresh.buildings[b.id] = 0;
  fresh.coins = 0;
  fresh.run = 0;
  fresh.stars = keep.stars;
  fresh.prestiges = keep.prestiges;
  fresh.lifetime = keep.lifetime;
  fresh.boost = { mult: 1, until: 0, icon: '✨', label: '', src: '' };
  fresh.combo = { n: 0, best: fresh.combo.best, t: 0 };
  fresh.gems = keep.gems;
  // Caisse de départ : bonus de départ offert par l'amélioration
  const lvl = fresh.up.depart || 0;
  if (lvl > 0) {
    const startCoins = Math.max(25, incomeNoMult(fresh) * 600 * lvl * 0.25);
    fresh.coins += startCoins;
  }
  return { ok: true, gain, coins: fresh.coins };
}

// ── Achats ───────────────────────────────────────────────────

export function addCoins(s, amount) {
  s.coins += amount;
  s.lifetime += amount;
  s.run += amount;
}

export function buyBuilding(s, id, amount = 1) {
  const def = BUILDING_BY_ID[id];
  if (!def) return { ok: false, why: 'inconnu' };
  const n = s.buildings[id] || 0;
  const k = amount === 'max' ? maxAffordable(def, n, s.coins) : amount;
  if (k <= 0) return { ok: false, why: 'fond' };
  const cost = costOf(def, n, k);
  if (cost > s.coins) return { ok: false, why: 'fond' };
  s.coins -= cost;
  const before = tierOf(n);
  s.buildings[id] = n + k;
  const after = tierOf(s.buildings[id]);
  return { ok: true, bought: k, cost, tierUp: after > before, tier: after, mult: milestoneMult(s.buildings[id]) };
}

export function gemUpgradeCost(u, level) {
  return Math.ceil(u.base * Math.pow(u.growth, level));
}

export function buyGemUpgrade(s, id) {
  const u = GEM_UPGRADES.find((x) => x.id === id);
  if (!u) return { ok: false };
  const lvl = s.up[id] || 0;
  if (lvl >= u.max) return { ok: false, why: 'max' };
  const cost = gemUpgradeCost(u, lvl);
  if (s.gems < cost) return { ok: false, why: 'gemmes' };
  s.gems -= cost;
  s.up[id] = lvl + 1;
  return { ok: true, cost, level: lvl + 1 };
}

export function buyUnique(s, id) {
  const u = GEM_UNIQUE.find((x) => x.id === id);
  if (!u) return { ok: false };
  if (!u.req(s)) return { ok: false, why: 'deja' };
  if (s.gems < u.cost) return { ok: false, why: 'gemmes' };
  s.gems -= u.cost;
  if (id === 'horsligne2') s.up.horsligne = 1;
  else if (id === 'horsligne3') s.up.horsligne = 2;
  else if (id === 'horsligne4') s.up.horsligne = 3;
  else if (id === 'autoCollect') s.up.autoCollect = true;
  else if (id === 'assurance') s.up.assurance = true;
  else if (id === 'skinNeon') { s.skins.neon = true; s.skins.active = 'neon'; }
  return { ok: true, cost: u.cost };
}

// ── Boosts ───────────────────────────────────────────────────

export function applyBoost(s, mult, seconds, icon, label, src = '') {
  const now = Date.now();
  const current = s.boost.until > now ? s.boost.mult : 1;
  const best = Math.max(current, mult);
  s.boost = { mult: best, until: now + seconds * 1000, icon, label, src };
  return s.boost;
}

/** Gain immédiat : `seconds` de production. */
export function instantIncome(s, seconds) {
  const gain = incomeNoMult(s) * permMult(s) * seconds;
  addCoins(s, gain);
  return gain;
}

// ── Une seconde de simulation ────────────────────────────────

export function tick(s, dt, now = Date.now()) {
  const d = derive(s, now);
  const gain = d.income * dt;
  if (gain > 0) addCoins(s, gain);

  // robots tapoteurs
  const robots = s.up.robots || 0;
  if (robots > 0) {
    s.botAcc = (s.botAcc || 0) + robots * dt;
    const n = Math.floor(s.botAcc);
    if (n > 0) {
      s.botAcc -= n;
      addCoins(s, tapValue(s, now) / comboMult(s) * n);
    }
  }

  // combo : décroissance
  if (s.combo.n > 0) {
    s.combo.t += dt;
    if (s.combo.t > 1.6) {
      const drop = Math.ceil(s.combo.t * 12);
      s.combo.n = Math.max(0, s.combo.n - drop);
      s.combo.t = 0;
      if (s.combo.n === 0) s.combo.best = Math.max(s.combo.best, 0);
    }
  }

  // expiration du boost
  if (s.boost.until && s.boost.until <= now) {
    s.boost = { mult: 1, until: 0, icon: '✨', label: '', src: '' };
  }

  s.playtime += dt;
  return gain;
}

// ── Statistiques ─────────────────────────────────────────────

export function incomePercentOf(def, s, total) {
  const n = s.buildings[def.id] || 0;
  if (total <= 0) return 0;
  return (buildingIncome(def, n) * globalMult(s)) / total;
}

export function stats(s, now = Date.now()) {
  const d = derive(s, now);
  return {
    income: d.income,
    perHour: d.income * 3600,
    tap: d.tap,
    lifetime: s.lifetime,
    stars: s.stars,
    mult: permMult(s),
    playtime: s.playtime,
    prestiges: s.prestiges,
    taps: s.taps,
    bestCombo: s.combo.best,
    buildings: BUILDINGS.reduce((a, b) => a + (s.buildings[b.id] || 0), 0),
  };
}
