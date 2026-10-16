// ─────────────────────────────────────────────────────────────
//  PixCity · quêtes de progression + défis du jour
// ─────────────────────────────────────────────────────────────
import { BUILDINGS } from './data.js';
import { derive } from './economy.js';
import { mulberry32 } from './format.js';

export const REWARDS = { coins: 'rn', gems: 'rg' };

/** Chaîne principale : chaque quête est validée sur un compteur ABSOLU. */
export const CHAIN = [
  { id: 'c1', icon: '👆', label: 'Tape 30 fois sur la ville', kind: 'taps', goal: 30, coins: 60, gems: 2 },
  { id: 'c2', icon: '🛖', label: 'Construis 12 bâtiments', kind: 'buildings', goal: 12, coins: 320, gems: 2 },
  { id: 'c3', icon: '🍞', label: 'Ouvre la 2ᵉ catégorie : 80 pièces gagnées', kind: 'lifetime', goal: 80, coins: 700, gems: 3 },
  { id: 'c4', icon: '🖱️', label: 'Tape 120 fois', kind: 'taps', goal: 120, coins: 2600, gems: 3 },
  { id: 'c5', icon: '🏪', label: 'Construis 25 bâtiments', kind: 'buildings', goal: 25, coins: 9000, gems: 4 },
  { id: 'c6', icon: '⚡', label: 'Atteins 40 pièces / seconde', kind: 'income', goal: 40, coins: 30000, gems: 4 },
  { id: 'c7', icon: '☕', label: 'Ouvre un Café', kind: 'building', bid: 'cafe', goal: 1, coins: 60000, gems: 5 },
  { id: 'c8', icon: '🚕', label: 'Attrape 2 taxis dorés', kind: 'taxis', goal: 2, coins: 150000, gems: 6 },
  { id: 'c9', icon: '🎁', label: 'Collecte 15 bonus de bâtiments', kind: 'collects', goal: 15, coins: 400000, gems: 6 },
  { id: 'c10', icon: '🏢', label: 'Monte un Immeuble', kind: 'building', bid: 'immeuble', goal: 1, coins: 1.2e6, gems: 8 },
  { id: 'c11', icon: '🔥', label: 'Combo ×15 atteint', kind: 'combo', goal: 15, coins: 3e6, gems: 8 },
  { id: 'c12', icon: '📈', label: '10 000 pièces / seconde', kind: 'income', goal: 10000, coins: 8e6, gems: 10 },
  { id: 'c13', icon: '✨', label: 'Réalise un premier prestige', kind: 'prestiges', goal: 1, coins: 0, gems: 25 },
  { id: 'c14', icon: '🎬', label: 'Ouvre un Cinéma', kind: 'building', bid: 'cinema', goal: 1, coins: 3e7, gems: 12 },
  { id: 'c15', icon: '🌠', label: '500 000 pièces / seconde', kind: 'income', goal: 5e5, coins: 2e8, gems: 20 },
];

const DAILY_POOL = [
  { id: 'tap', icon: '👆', label: (g) => `Tape ${g} fois sur la ville`, kind: 'taps', goals: [200, 350, 500], gems: 8 },
  { id: 'coin', icon: '🪙', label: (g) => `Gagne ${g} pièces aujourd’hui`, kind: 'coins', gems: 10 },
  { id: 'buy', icon: '🏗️', label: (g) => `Achète ${g} bâtiments`, kind: 'buys', goals: [30, 45, 70], gems: 8 },
  { id: 'taxi', icon: '🚕', label: (g) => `Attrape ${g} taxis dorés`, kind: 'taxis', goals: [2, 3, 4], gems: 10 },
  { id: 'collect', icon: '🎁', label: (g) => `Collecte ${g} bonus de bâtiments`, kind: 'collects', goals: [10, 18, 25], gems: 8 },
  { id: 'boost', icon: '🚀', label: (g) => `Profite de ${g} boost${g > 1 ? 's' : ''}`, kind: 'boosts', goals: [1, 2, 3], gems: 8 },
  { id: 'gem', icon: '💎', label: (g) => `Dépense ${g} gemmes`, kind: 'gems', goals: [20, 40, 60], gems: 12 },
];

function todayStamp(now) {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** (Re)génère les 3 défis du jour. */
export function refreshDaily(s, now = Date.now(), force = false) {
  const stamp = todayStamp(now);
  const q = s.quests;
  if (!force && q.dailyAt === stamp && q.daily && q.daily.length) return false;
  // série de jours consécutifs de connexion
  if (q.dailyAt) {
    const gap = Math.round((stamp - q.dailyAt) / 86400000);
    q.streak = gap === 1 ? (q.streak || 0) + 1 : gap > 1 ? 1 : (q.streak || 1);
  } else {
    q.streak = 1;
  }
  q.streakBest = Math.max(q.streakBest || 0, q.streak);
  const rng = mulberry32((stamp / 86400000) | 0);
  const pick = [...DAILY_POOL];
  const daily = [];
  const income = Math.max(1000, derive(s, now).income * 3600 * 0.6);
  for (let i = 0; i < 3; i++) {
    const idx = Math.floor(rng() * pick.length);
    const def = pick.splice(idx, 1)[0];
    const diff = Math.min(2, s.prestiges > 0 ? 1 + (s.prestiges > 3 ? 1 : 0) : 0);
    let goal;
    if (def.id === 'coin') goal = Math.ceil(income * (0.5 + 0.25 * diff));
    else goal = def.goals[Math.min(diff, def.goals.length - 1)];
    if (def.id === 'taps' || def.id === 'buys') goal = Math.ceil(goal * (1 + 0.15 * s.prestiges));
    daily.push({ id: def.id, icon: def.icon, label: def.label(goal), kind: def.kind, goal, gems: def.gems, prog: 0, done: false });
  }
  q.daily = daily;
  q.dailyAt = stamp;
  q.dailyDone = 0;
  q.tally = { taps: 0, coins: 0, buys: 0, taxis: 0, collects: 0, boosts: 0, gems: 0, prestiges: 0 };
  return true;
}

/** Compteurs cumulés du jour. */
export function tally(s, key, amount = 1) {
  const q = s.quests;
  if (!q.tally) q.tally = { taps: 0, coins: 0, buys: 0, taxis: 0, collects: 0, boosts: 0, gems: 0, prestiges: 0 };
  q.tally[key] = (q.tally[key] || 0) + amount;
}

function progressOf(s, d, q) {
  switch (q.kind) {
    case 'taps': return s.taps;
    case 'lifetime': return s.lifetime;
    case 'buildings': return BUILDINGS.reduce((a, b) => a + (s.buildings[b.id] || 0), 0);
    case 'building': return s.buildings[q.bid] || 0;
    case 'income': return d.income;
    case 'taxis': return s.taxis;
    case 'collects': return s.collects || 0;
    case 'combo': return s.combo.best;
    case 'prestiges': return s.prestiges;
    case 'coins': return (s.quests.tally && s.quests.tally.coins) || 0;
    case 'buys': return (s.quests.tally && s.quests.tally.buys) || 0;
    case 'boosts': return (s.quests.tally && s.quests.tally.boosts) || 0;
    case 'gems': return (s.quests.tally && s.quests.tally.gems) || 0;
    default: return 0;
  }
}

/** Renvoie la quête de chaîne courante avec sa progression. */
export function chainInfo(s, now = Date.now()) {
  const idx = s.quests.chain || 0;
  if (idx >= CHAIN.length) return null;
  const q = CHAIN[idx];
  const d = derive(s, now);
  const prog = Math.min(progressOf(s, d, q), q.goal);
  return { q, index: idx, prog, ready: prog >= q.goal, total: CHAIN.length };
}

export function claimChain(s, now = Date.now()) {
  const info = chainInfo(s, now);
  if (!info || !info.ready) return { ok: false };
  const { q } = info;
  s.quests.chain = info.index + 1;
  const r = { coins: q.coins || 0, gems: q.gems || 0 };
  if (r.coins) { s.coins += r.coins; s.lifetime += r.coins; s.run += r.coins; }
  s.gems += r.gems;
  return { ok: true, reward: r, label: q.label };
}

export function dailyInfo(s, now = Date.now()) {
  refreshDaily(s, now);
  return s.quests.daily.map((q) => {
    const d = derive(s, now);
    const prog = Math.min(progressOf(s, d, q), q.goal);
    return { ...q, prog, ready: !q.done && prog >= q.goal };
  });
}

export function claimDaily(s, id, now = Date.now()) {
  const list = dailyInfo(s, now);
  const q = list.find((x) => x.id === id);
  if (!q || !q.ready) return { ok: false };
  const raw = s.quests.daily.find((x) => x.id === id);
  raw.done = true;
  s.quests.dailyDone = (s.quests.dailyDone || 0) + 1;
  const gems = q.gems * (s.shop.vip ? 2 : 1);
  s.gems += gems;
  return { ok: true, gems, allDone: s.quests.daily.every((x) => x.done) };
}

/** Bonus quand les 3 défis du jour sont terminés. */
export function claimDailyChest(s, now = Date.now()) {
  if (!s.quests.daily.every((q) => q.done)) return { ok: false };
  if (s.quests.chestDay === s.quests.dailyAt) return { ok: false };
  s.quests.chestDay = s.quests.dailyAt;
  const coins = Math.max(500, derive(s, now).income * 1800);
  const gems = 25 * (s.shop.vip ? 2 : 1);
  s.coins += coins; s.lifetime += coins; s.run += coins;
  s.gems += gems;
  return { ok: true, coins, gems };
}
