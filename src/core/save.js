// ─────────────────────────────────────────────────────────────
//  PixCity · sauvegarde locale + gains hors-ligne
// ─────────────────────────────────────────────────────────────
import { START } from './data.js';
import { newState, migrate, SAVE_VERSION } from './state.js';
import { incomeNoMult, permMult, addCoins } from './economy.js';

const KEY = 'pixcity.save.v1';
const SETTINGS_KEY = 'pixcity.settings.v1';

const mem = new Map();
let lsOk = true;
try {
  localStorage.setItem('pixcity.probe', '1');
  localStorage.removeItem('pixcity.probe');
} catch (e) {
  lsOk = false;
  console.warn('[PixCity] stockage local indisponible, sauvegarde en mémoire pour cette session');
}

/** Stockage robuste : localStorage, sinon mémoire (iframe restreinte). */
export const storage = {
  memoryOnly: !lsOk,
  get(k) {
    if (!lsOk) return mem.has(k) ? mem.get(k) : null;
    try { return localStorage.getItem(k); } catch (e) { return mem.get(k) ?? null; }
  },
  set(k, v) {
    mem.set(k, v);
    if (!lsOk) return false;
    try { localStorage.setItem(k, v); return true; } catch (e) { return false; }
  },
  del(k) {
    mem.delete(k);
    if (!lsOk) return;
    try { localStorage.removeItem(k); } catch (e) {}
  },
};

export function saveGame(s) {
  s.time.lastSeen = Date.now();
  const raw = JSON.stringify(s);
  storage.set(KEY, raw);
  storage.set(SETTINGS_KEY, JSON.stringify({ sfx: s.set.sfx, haptics: s.set.haptics, particles: s.set.particles, shake: s.set.shake }));
  return raw.length;
}

export function loadGame() {
  const raw = storage.get(KEY);
  if (!raw) return { state: newState(), fresh: true };
  try {
    const parsed = JSON.parse(raw);
    const s = migrate(parsed);
    if (!s.time.lastSeen) s.time.lastSeen = Date.now();
    return { state: s, fresh: false };
  } catch (e) {
    console.warn('[PixCity] sauvegarde illisible, on repart de zéro', e);
    return { state: newState(), fresh: true, broken: true };
  }
}

export function wipeSave() {
  storage.del(KEY);
  storage.del(SETTINGS_KEY);
}

export function exportSave(s) {
  const json = JSON.stringify(s);
  return btoa(unescape(encodeURIComponent(json)));
}

export function importSave(code) {
  try {
    const json = decodeURIComponent(escape(atob(code.trim())));
    const s = migrate(JSON.parse(json));
    return { ok: true, state: s };
  } catch (e) {
    return { ok: false };
  }
}

/** Plafond et efficacité hors-ligne selon l'amélioration « Veilleuse ». */
export function offlineRules(s) {
  const lvl = Math.max(0, Math.min(3, s.up.horsligne || 0));
  const hours = START.offlineCapsHours[Math.min(lvl, START.offlineCapsHours.length - 1)];
  const eff = lvl === 0 ? START.offlineEfficiency : lvl === 1 ? 0.5 : lvl === 2 ? 0.65 : 0.8;
  return { hours, eff };
}

/** Calcule le butin hors-ligne (sans l'appliquer). */
export function offlineGain(s, now = Date.now()) {
  const elapsed = Math.max(0, (now - (s.time.lastSeen || now)) / 1000);
  const { hours, eff } = offlineRules(s);
  const cap = hours * 3600;
  const counted = Math.min(elapsed, cap);
  const income = incomeNoMult(s) * permMult(s);
  const coins = income * counted * eff;
  return { elapsed, counted, capped: elapsed > cap, cap, eff, coins, income, hours };
}

export function applyOffline(s, res) {
  if (res && res.coins > 0) addCoins(s, res.coins);
  return res ? res.coins : 0;
}

/** Petites statistiques de suivi local (aucun envoi réseau). */
export function localTelemetry(s) {
  return {
    sessions: (Number(storage.get('pixcity.sessions')) || 0) + 1,
    version: SAVE_VERSION,
  };
}
