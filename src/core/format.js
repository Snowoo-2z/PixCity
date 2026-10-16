// ─────────────────────────────────────────────────────────────
//  PixCity · formatage des nombres (style français)
// ─────────────────────────────────────────────────────────────

export const SUFFIXES = ['', 'K', 'M', 'Md', 'Bn', 'Bd', 'Td', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** 1 234 567 -> "1,23 M" */
export function fmt(n) {
  if (!isFinite(n)) return '∞';
  const neg = n < 0;
  n = Math.abs(n);
  if (n < 1000) {
    const r = n < 10 && n % 1 !== 0 ? n.toFixed(1) : Math.floor(n).toString();
    return (neg ? '-' : '') + r.replace('.', ',');
  }
  let tier = Math.floor(Math.log10(n) / 3);
  if (tier >= SUFFIXES.length) tier = SUFFIXES.length - 1;
  const scaled = n / Math.pow(1000, tier);
  let str;
  if (scaled >= 100) str = scaled.toFixed(0);
  else if (scaled >= 10) str = scaled.toFixed(1);
  else str = scaled.toFixed(2);
  str = str.replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1').replace('.', ',');
  return (neg ? '-' : '') + str + ' ' + SUFFIXES[tier];
}

/** Nombre entier avec séparateur d'espace fine : "1 234 567" */
export function fmtFull(n) {
  return Math.floor(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
}

/** 0 décimale sous 1000, puis notation courte. */
export function fmtShort(n) {
  return n < 1000 ? Math.floor(n).toString() : fmt(n);
}

/** Prix : jamais de virgule flottante bizarre. */
export function fmtPrice(n) {
  return fmt(Math.ceil(n));
}

/** 3725 -> "1 h 02", 95 -> "1:35", 45 -> "45 s" */
export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  if (sec < 60) return sec + ' s';
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m < 60) return m + ' min ' + String(s).padStart(2, '0');
  const h = Math.floor(m / 60), mm = m % 60;
  if (h < 24) return h + ' h ' + String(mm).padStart(2, '0');
  const d = Math.floor(h / 24), hh = h % 24;
  return d + ' j ' + String(hh).padStart(2, '0');
}

/** 12 -> "0:12" (compte à rebours compact) */
export function fmtClock(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + String(s).padStart(2, '0');
}

/** "+12,5 %" */
export function fmtPct(x, digits = 0) {
  return (x >= 0 ? '+' : '') + (x * 100).toFixed(digits).replace('.', ',') + ' %';
}

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Petit générateur pseudo-aléatoire déterministe (pour le décor). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
