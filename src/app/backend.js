// ─────────────────────────────────────────────────────────────
//  PixCity · « backend » de la boutique : SIMULÉ
//
//  Ce module imite un vrai service d'achat (connexion, création de
//  commande, paiement, reçu, validation) avec de la latence réseau.
//  Rien ne sort de l'appareil : aucun paiement, aucun serveur.
//  → Pour passer en production : remplacer chaque méthode `sim()`
//    par un fetch() vers ton backend (Stripe / Play Billing…).
// ─────────────────────────────────────────────────────────────
import { storage } from '../core/save.js';

const RECEIPTS_KEY = 'pixcity.receipts.v1';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms) => ms * (0.7 + Math.random() * 0.6);

export const Backend = {
  sim: true,
  session: null,
  latency: { last: 0 },
  calls: 0,
  errors: 0,

  /** Handshake avec la « boutique » */
  async connect() {
    this.calls++;
    const t0 = performance.now();
    await wait(jitter(260));
    this.latency.last = Math.round(performance.now() - t0);
    this.session = {
      id: 'sess_' + Math.random().toString(36).slice(2, 10),
      region: 'eu-west-3 (simulé)',
      at: Date.now(),
    };
    return { ok: true, session: this.session, latency: this.latency.last };
  },

  /** Création d'une commande côté « serveur » */
  async createOrder(pack, price) {
    this.calls++;
    await wait(jitter(340));
    return {
      ok: true,
      order: {
        id: 'PIX-' + Date.now().toString(36).toUpperCase().slice(-6) + '-' + Math.floor(Math.random() * 900 + 100),
        packId: pack.id,
        price,
        currency: 'EUR',
        at: Date.now(),
        status: 'pending',
      },
    };
  },

  /** Le « paiement » : toujours accepté (mode démo) */
  async pay(order, method = 'carte •••• 4242 (démo)') {
    this.calls++;
    await wait(jitter(520));
    return {
      ok: true,
      order: { ...order, status: 'paid', method, paidAt: Date.now() },
      receiptId: 'rcpt_' + Math.random().toString(36).slice(2, 12),
    };
  },

  /** Validation du reçu + droits accordés */
  async validate(receipt) {
    this.calls++;
    await wait(jitter(300));
    return { ok: true, receipt, validatedAt: Date.now(), simulated: true };
  },

  /** Historique local des commandes (transparence : tout est sur l'appareil) */
  saveReceipt(receipt) {
    const list = this.receipts();
    list.unshift(receipt);
    storage.set(RECEIPTS_KEY, JSON.stringify(list.slice(0, 25)));
  },

  receipts() {
    try { return JSON.parse(storage.get(RECEIPTS_KEY) || '[]'); } catch (e) { return []; }
  },

  clearReceipts() { storage.del(RECEIPTS_KEY); },

  /** « Télémétrie » locale : ne part jamais, sert au tableau de bord. */
  track(event, props = {}) {
    try {
      const key = 'pixcity.track.v1';
      const all = JSON.parse(storage.get(key) || '{}');
      all[event] = (all[event] || 0) + 1;
      all['_last'] = { event, props, at: Date.now() };
      storage.set(key, JSON.stringify(all));
    } catch (e) {}
  },

  stats() {
    try {
      const all = JSON.parse(storage.get('pixcity.track.v1') || '{}');
      return { ...all, calls: this.calls, latency: this.latency.last };
    } catch (e) { return { calls: this.calls, latency: this.latency.last }; }
  },
};
