// ─────────────────────────────────────────────────────────────
//  PixCity · offre flash (pop-up latérale avec compte à rebours)
// ─────────────────────────────────────────────────────────────
import { bus } from '../core/bus.js';
import { packById, offerActive } from '../core/iap.js';
import { qs, el, setText } from './dom.js';
import { Audio } from '../core/audio.js';

let node, Game, timer = null;

export function initOffer(g) {
  Game = g;
  node = qs('#offer-pop');
  bus.on('offer', (offer) => show(offer));
  bus.on('offer:end', hide);
  bus.on('purchase', hide);
  setInterval(tick, 500);
}

function show(offer) {
  const pack = packById(offer.id);
  if (!pack || !node) return;
  const card = qs('#offer-card');
  card.innerHTML = '';
  card.append(
    el('div', { class: 'o-mini', text: 'OFFRE FLASH · -' + offer.bonus + '%' }),
    el('div', { class: 'o-big', text: pack.icon }),
    el('div', { class: 'title-xs', text: pack.name }),
    el('div', { class: 'tiny', text: (pack.gives && pack.gives.gems ? (pack.gives.gems + (pack.bonus || 0)) + ' gemmes 💎' : 'Pass VIP') }),
    el('div', { class: 'o-timer', id: 'offer-timer', text: '6:00' }),
    el('button', {
      class: 'btn small primary wide shine', text: 'J’en profite',
      style: { marginTop: '6px' },
      onclick: () => { Audio.play('click'); bus.emit('open:panel', 'shop'); bus.emit('notify', { text: 'Offre valable ' + timeText() + ' !', kind: 'gold' }); },
    }),
    el('button', {
      class: 'offer-close', text: '✕',
      onclick: () => { Audio.play('close'); hide(); },
    }),
  );
  node.classList.add('on');
  visible = true;
  Audio.play('gem');
  bus.emit('notify', { text: '🔥 Offre flash : -' + offer.bonus + ' % sur ' + pack.name + ' !', kind: 'gold', ms: 3600 });
}

function timeText() {
  const off = offerActive(Game.state);
  if (!off) return '—';
  const left = Math.max(0, (off.until - Date.now()) / 1000);
  const m = Math.floor(left / 60), s = Math.floor(left % 60);
  return m + ':' + String(s).padStart(2, '0');
}

function tick() {
  const t = qs('#offer-timer');
  const off = offerActive(Game.state);
  if (!off) {
    if (node && node.classList.contains('on')) hide();
    return;
  }
  if (t) t.textContent = timeText();
}

let visible = false;

function hide() {
  if (!visible) return; // évite la boucle offer:end → hide → offer:end
  visible = false;
  if (node) node.classList.remove('on');
  bus.emit('offer:end');
}
