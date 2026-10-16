// ─────────────────────────────────────────────────────────────
//  PixCity · boutique : packs (achats SIMULÉS), gemmes, VIP,
//  pub récompensée simulée, consommables.
// ─────────────────────────────────────────────────────────────
import { bus } from '../core/bus.js';
import { IAP_PACKS, priceFor, offerActive, vipAvailable, rewardedAvailable, eur } from '../core/iap.js';
import { REWARDED_AD, GEM_CONSUMABLES } from '../core/data.js';
import { fmt, fmtClock } from '../core/format.js';
import { el, qs, setText, toggle } from './dom.js';
import { Audio } from '../core/audio.js';
import { startPurchase } from './pay.js';
import { toast, cityLog } from './toasts.js';
import { rewardPop, confetti } from './fx.js';

let gridNode, adNode, gemsNode, Game;

export function initShopPanel(g) {
  Game = g;
  gridNode = qs('#shop-list');
  adNode = qs('#shop-ad');
  gemsNode = qs('#shop-gems');
  renderShop();
  bus.on('tick', () => {
    setText(gemsNode, fmt(Game.state.gems) + ' 💎');
    updateRewarded();
    updateConsumables();
  });
  bus.on('purchase', () => { lastSig = ''; renderShop(); });
  bus.on('offer', () => { lastSig = ''; renderShop(); });
  bus.on('offer:end', () => { lastSig = ''; renderShop(); });
}

let lastSig = '';

function renderShop() {
  const s = Game.state;
  const sig = JSON.stringify({
    b: s.shop.bought, vip: s.shop.vip, noAds: s.up.noAds,
    offer: offerActive(s) ? offerActive(s).id + ':' + offerActive(s).bonus : '',
  });
  if (sig === lastSig && gridNode.children.length) return;
  lastSig = sig;
  gridNode.innerHTML = '';
  const packsGrid = el('div', { class: 'shop-grid' });
  gridNode.append(packsGrid);

  for (const pack of IAP_PACKS) {
    const owned = pack.kind === 'once' && s.shop.bought[pack.id];
    const p = priceFor(s, pack);
    const gems = pack.gives && pack.gives.gems ? pack.gives.gems + (pack.bonus || 0) : 0;
    const hasBadge = !!(pack.badge || pack.color);
    const node = el('div', { class: 'pack ' + (pack.color || '') + (owned ? ' dimmed' : '') + (hasBadge ? ' has-badge' : '') }, [
      pack.badge ? el('div', { class: 'p-badge', text: pack.badge }) : (pack.color ? el('div', { class: 'p-badge', text: pack.kind === 'pass' ? 'PASS' : 'OFFRE' }) : null),
      el('div', { class: 'p-ico', text: pack.icon }),
      el('div', { class: 'title-sm', text: pack.name }),
      gems ? el('div', { class: 'p-gems', text: '💎 ' + gems }) : null,
      pack.bonus ? el('div', { class: 'p-bonus', text: '+' + pack.bonus + ' bonus offerts' }) : null,
      pack.extras && pack.extras.length ? el('div', { class: 'p-extras' }, pack.extras.map((x) => el('div', { text: x }))) : null,
      el('div', { class: 'tiny dimmer', text: pack.desc || '' }),
      pack.per ? el('div', { class: 'p-per', text: pack.per }) : null,
      el('div', { class: 'price-btn' }, [
        p.old ? el('div', { class: 'price-old', text: eur(p.old) }) : null,
        p.promo ? el('div', { class: 'badge gold', text: '-' + p.pct + '% FLASH' }) : null,
        el('button', {
          class: 'btn ' + (pack.color === 'gold' ? 'primary' : pack.color === 'vip' ? 'purple' : 'green') + ' wide ' + (p.promo ? 'shine' : ''),
          text: owned ? '✓ Acheté' : eur(p.price),
          onclick: () => onPackClick(pack, p),
        }),
      ]),
    ]);
    if (owned) node.querySelector('button').disabled = true;
    packsGrid.append(node);
  }

  // VIP quotidien
  if (s.shop.vip) {
    const avail = vipAvailable(s);
    const vipRow = el('div', { class: 'card vip', style: { marginTop: '8px' } }, [
      el('div', { class: 'row spread' }, [
        el('span', { class: 'title-sm', text: '👑 Pass VIP' }),
        el('span', { class: 'chip green', text: 'ACTIF' }),
      ]),
      el('div', { class: 'tiny dim', text: 'Bonus quotidien : +250 gemmes · production ×2 permanante' }),
      el('div', { class: 'b-actions' }, [
        el('button', {
          class: 'btn small ' + (avail ? 'primary pulse' : ''),
          text: avail ? '🎁 Récupérer 250 💎' : 'Déjà récupéré aujourd’hui',
          onclick: () => {
            const res = Game.getVip();
            if (res.ok) {
              toast('+' + res.gems + ' gemmes 💎 (VIP)', 'gem');
              rewardPop('👑', 'BONUS VIP', '+' + res.gems + ' 💎');
              lastSig = '';
              renderShop();
            }
          },
        }),
      ]),
    ]);
    gridNode.append(vipRow);
  }

  // consommables
  gridNode.append(el('div', { class: 'hr' }));
  gridNode.append(el('div', { class: 'title-xs', text: 'Objets à usage unique' }));
  const cons = el('div', { class: 'list', style: { marginTop: '6px' } });
  for (const c of GEM_CONSUMABLES) {
    cons.append(el('div', { class: 'card up-item', 'data-cons': c.id }, [
      el('div', { class: 'up-ico', text: c.icon }),
      el('div', { class: 'grow col', style: { gap: '2px' } }, [
        el('div', { class: 'row spread' }, [el('span', { text: c.name }), el('span', { class: 'chip purple', text: c.cost + ' 💎' })]),
        el('div', { class: 'tiny dim', text: c.desc }),
      ]),
      el('button', {
        class: 'btn small ' + (Game.state.gems >= c.cost ? 'purple' : ''),
        text: 'Utiliser',
        disabled: Game.state.gems < c.cost,
        onclick: () => { Game.useConsumable(c.id); lastSig = ''; renderShop(); },
      }),
    ]));
  }
  gridNode.append(cons);
  renderAd();
}

function onPackClick(pack, p) {
  const s = Game.state;
  Audio.play('click');
  // startPurchase appelle onDone UNE fois, après validation du « paiement » :
  // c'est le seul endroit où l'achat est crédité (res.credited === true).
  startPurchase(Game, pack, p, async (res) => {
    if (!res.ok || !res.credited) return;
    const done = await Game.buyPack(pack.id, async () => res);
    lastSig = '';
    renderShop();
    if (!done.ok) console.warn('[shop] achat non appliqué', done.why);
  });
}

/** Pub récompensée simulée (compte à rebours + petite animation) */
function renderAd() {
  const s = Game.state;
  if (s.up.noAds) {
    adNode.innerHTML = '';
    adNode.append(el('div', { class: 'notice tiny' }, [
      el('b', { text: 'Pack Zen actif : ' }), 'les offres flash sont désactivées. Merci 💛',
    ]));
    return;
  }
  adNode.innerHTML = '';
  const left = rewardedAvailable(s);
  const btn = el('button', {
    class: 'btn small cyan' + (left === 0 ? ' pulse' : ''),
    text: left === 0 ? '▶️ Regarder (5 s)' : '⏳ ' + fmtClock(left),
    disabled: left > 0,
    onclick: () => watchAd(btn),
  });
  adNode.append(el('div', { class: 'ad-box' }, [
    el('span', { class: 'd-ico', text: '📺' }),
    el('div', { class: 'grow col', style: { gap: '2px' } }, [
      el('div', { class: 'row spread' }, [
        el('span', { class: 'title-xs', text: 'Pub récompensée (simulée)' }),
        el('span', { class: 'chip purple', text: '+' + REWARDED_AD.gems + ' 💎' }),
      ]),
      el('div', { class: 'tiny dim', id: 'ad-state', text: 'Regarde une mini-pub fictive pour gagner des gemmes.' }),
    ]),
    btn,
  ]));
}

/** Garde les boutons d'objets synchronisés avec le solde de gemmes. */
function updateConsumables() {
  const gems = Game.state.gems;
  for (const c of GEM_CONSUMABLES) {
    const card = gridNode.querySelector('[data-cons="' + c.id + '"]');
    if (!card) continue;
    const btn = card.querySelector('button');
    if (!btn) continue;
    const afford = gems >= c.cost;
    btn.disabled = !afford;
    btn.classList.toggle('purple', afford);
  }
}

function updateRewarded() {
  const btn = adNode.querySelector('button');
  if (!btn) return;
  const left = rewardedAvailable(Game.state);
  btn.disabled = left > 0;
  btn.textContent = left === 0 ? '▶️ Regarder (5 s)' : '⏳ ' + fmtClock(left);
  btn.classList.toggle('pulse', left === 0);
}

async function watchAd(btn) {
  const state = adNode.querySelector('#ad-state');
  if (!state) return;
  const duration = REWARDED_AD.adDuration;
  btn.disabled = true;
  for (let i = duration; i > 0; i--) {
    if (state) state.textContent = '📺 Publicité fictive… ' + i + ' s';
    btn.textContent = '⏳ ' + i + ' s';
    await new Promise((r) => setTimeout(r, 1000));
  }
  const res = Game.getRewarded();
  if (res.ok) {
    if (state) state.textContent = '✅ +' + res.gems + ' gemmes récupérées !';
    toast('+' + res.gems + ' gemmes 💎 (pub simulée)', 'gem');
    rewardPop('📺', 'PUB SIMULÉE', '+' + res.gems + ' 💎', 1400);
    Audio.play('ad');
  }
  renderAd();
}

export function refreshShop() { lastSig = ''; renderShop(); }
