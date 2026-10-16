// ─────────────────────────────────────────────────────────────
//  PixCity · boutique — ACHATS SIMULÉS
//
//  ⚠️  Aucun paiement réel n'est effectué. Le « paiement » est joué
//  côté client : on affiche un écran de connexion à la boutique, puis
//  l'achat est validé automatiquement. Tout est local.
//  Pour brancher un vrai système (Stripe / Play Billing / App Store),
//  il suffit de remplacer `chargeSimule()` par l'appel réseau réel.
// ─────────────────────────────────────────────────────────────
import { IAP_PACKS, REWARDED_AD } from './data.js';

export const PACKS = IAP_PACKS;
export { IAP_PACKS, REWARDED_AD };
export const packById = (id) => IAP_PACKS.find((p) => p.id === id);

export const STORE_STEPS = [
  { t: 260, label: 'Connexion à la boutique PixStore…', icon: '🔌' },
  { t: 420, label: 'Vérification du compte…', icon: '🔐' },
  { t: 700, label: 'traitement du paiement…', icon: '💳' },
  { t: 380, label: 'Validation de la commande…', icon: '🧾' },
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Paiement simulé. Renvoie toujours une commande validée (sauf annulation).
 * @returns {Promise<{ok:boolean, order:string, pack:object, cancelled?:boolean}>}
 */
export async function chargeSimule(pack, onStep = () => {}) {
  let elapsed = 0;
  for (let i = 0; i < STORE_STEPS.length; i++) {
    onStep(STORE_STEPS[i], i);
    await wait(STORE_STEPS[i].t + Math.random() * 160);
    elapsed += STORE_STEPS[i].t;
  }
  const order = 'PIX-' + Date.now().toString(36).toUpperCase().slice(-6) + '-' + Math.floor(Math.random() * 900 + 100);
  return { ok: true, order, pack, simulated: true, at: Date.now() };
}

/** Applique les effets d'un pack à l'état. */
export function grantPack(s, pack, receipt) {
  const grants = { gems: 0, extras: [], order: receipt ? receipt.order : '' };
  const g = pack.gives || {};
  if (g.gems) {
    const total = g.gems + (pack.bonus || 0);
    s.gems += total;
    grants.gems = total;
  }
  if (pack.id === 'starter') { s.up.productivite; s.shop.bought.starter = true; s.shop.founder = true; s.skins.neon = true; s.skins.active = 'neon'; }
  if (pack.id === 'vip') { s.shop.vip = true; s.shop.vipClaim = 0; grants.extras.push('Pass VIP activé'); }
  if (pack.id === 'noads') { s.shop.noAds = true; s.up.noAds = true; grants.extras.push('Offres flash désactivées'); }
  s.shop.bought[pack.id] = true;
  s.shop.count = (s.shop.count || 0) + 1;
  s.shop.totalSpent = +(s.shop.totalSpent + pack.price).toFixed(2);
  if (!s.shop.firstBuyAt) s.shop.firstBuyAt = Date.now();
  s.shop.lastBuyAt = Date.now();
  s.shop.lastOrder = receipt ? receipt.order : '';
  return grants;
}

/** Gemmes VIP quotidiennes (à réclamer). */
export function vipAvailable(s) {
  if (!s.shop.vip) return 0;
  const DAY = 22 * 3600 * 1000;
  if (!s.shop.vipClaim) return 250;
  return Date.now() - s.shop.vipClaim >= DAY ? 250 : 0;
}

export function claimVip(s) {
  const amount = vipAvailable(s);
  if (!amount) return { ok: false };
  s.gems += amount;
  s.shop.vipClaim = Date.now();
  return { ok: true, gems: amount };
}

/** Pub récompensée simulée : un compte à rebours puis +25 gemmes. */
export function rewardedAvailable(s) {
  const free = s.freeAd || { at: 0 };
  const left = REWARDED_AD.delaySec * 1000 - (Date.now() - free.at);
  return s.shop.noAds ? 0 : Math.max(0, Math.ceil(left / 1000));
}

export function claimRewarded(s) {
  if (s.shop.noAds) return { ok: false };
  if (rewardedAvailable(s) > 0) return { ok: false };
  const gems = REWARDED_AD.gems * (s.shop.bought.noads || s.up.noAds ? 2 : 1);
  s.gems += gems;
  s.adsWatched = (s.adsWatched || 0) + 1;
  s.freeAd = { at: Date.now() };
  return { ok: true, gems };
}

/** Offre flash : remise temporaire sur un pack. */
export function rollOffer(s, now = Date.now()) {
  if (s.shop.vip || s.up.noAds || (s.offer && s.offer.until > now)) return null;
  if (s.prestiges < 1 && s.lifetime < 250000) return null;
  const pool = ['gems1200', 'gems3000', 'gems8000', 'vip'];
  const id = pool[Math.floor(Math.random() * pool.length)];
  const bonus = id === 'vip' ? 40 : 60;
  s.offer = { id, bonus, until: now + 6 * 60 * 1000, shown: false, used: false };
  return s.offer;
}

export function offerActive(s, now = Date.now()) {
  return s.offer && s.offer.until > now && !s.offer.used ? s.offer : null;
}

export function priceFor(s, pack, now = Date.now()) {
  const off = offerActive(s, now);
  if (off && off.id === pack.id) {
    const pct = off.bonus / 100;
    return { price: +((pack.price * (1 - pct)).toFixed(2)), old: pack.price, pct: off.bonus, promo: true };
  }
  return { price: pack.price, old: null, pct: 0, promo: false };
}

export function eur(n) {
  return n.toFixed(2).replace('.', ',') + ' €';
}
