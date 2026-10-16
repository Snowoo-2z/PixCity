// ─────────────────────────────────────────────────────────────
//  PixCity · panneau « Bâtiments » (achat ×1 / ×10 / ×100 / MAX)
// ─────────────────────────────────────────────────────────────
import { bus } from '../core/bus.js';
import { BUILDINGS, tierOf, nextTierAt, MILESTONE } from '../core/data.js';
import { costOf, maxAffordable, starMult } from '../core/economy.js';
import { fmt, fmtShort, fmtPct } from '../core/format.js';
import { el, qs, qsa, setText, toggle } from './dom.js';
import { Audio } from '../core/audio.js';

let listNode, lastSignature = '';
const canvases = new Map();

export function initBuildPanel(Game) {
  listNode = qs('#build-list');
  qsa('[data-buymode]').forEach((b) => {
    b.addEventListener('click', () => {
      const mode = b.dataset.buymode === 'max' ? 'max' : Number(b.dataset.buymode);
      Game.bigBuyMode = mode;
      Audio.play('click');
      qsa('[data-buymode]').forEach((x) => x.classList.toggle('primary', x === b));
      lastSignature = '';
      renderBuildPanel(Game);
    });
  });
  qsa('[data-buymode]')[0].classList.add('primary');
  bus.on('tick', () => renderBuildPanel(Game));
  bus.on('boot:firstcity', () => renderBuildPanel(Game));
}

export function renderBuildPanel(Game) {
  const s = Game.state;
  const d = Game.derived;
  if (!listNode) return;
  setText(qs('#build-income'), '+' + fmt(d.income) + ' / s');
  setText(qs('#build-mult'), '×' + d.globalMult.toFixed(2).replace('.', ','));

  // signature : ne redessine que si quelque chose de visible change
  const mode = Game.bigBuyMode;
  const sig = BUILDINGS.map((def) => {
    const n = s.buildings[def.id] || 0;
    const unlocked = s.lifetime >= def.unlock || n > 0;
    const cost = costOf(def, n, mode === 'max' ? 1 : mode);
    return [def.id, n, unlocked, Math.min(9, Math.floor(Math.log10(Math.max(1, s.coins / Math.max(1, cost)) + 1) * 2)), tierOf(n)].join(':');
  }).join('|') + '|' + mode + '|' + s.lifetime.toFixed(0) + '|' + (s.gems > 0);

  if (sig === lastSignature) {
    // mise à jour légère des boutons seulement
    updateAffordable(Game);
    return;
  }
  lastSignature = sig;

  if (!listNode.children.length) {
    for (const def of BUILDINGS) listNode.append(buildRow(Game, def));
  }
  BUILDINGS.forEach((def, i) => paintRow(Game, def, listNode.children[i]));
}

function buildRow(Game, def) {
  const row = el('div', { class: 'card b-item', id: 'brow-' + def.id });
  const art = el('div', { class: 'b-art', id: 'bart-' + def.id });
  const main = el('div', { class: 'b-main' });
  row.append(art, main);
  return row;
}

function paintRow(Game, def, row) {
  const s = Game.state;
  const n = s.buildings[def.id] || 0;
  const unlocked = s.lifetime >= def.unlock || n > 0;
  const art = row.querySelector('.b-art');
  const main = row.querySelector('.b-main');
  row.classList.toggle('b-locked', !unlocked);
  main.innerHTML = '';

  if (!unlocked) {
    art.className = 'b-art mystery';
    art.innerHTML = '<span>❓</span>';
    main.append(
      el('div', { class: 'row spread' }, [
        el('span', { class: 'b-name', text: '???' }),
        el('span', { class: 'chip cyan', text: '🔒 ' + fmt(def.unlock) }),
      ]),
      el('div', { class: 'b-sub', text: 'Bâtiment mystère — continue à gagner des pièces.' }),
      el('div', { class: 'bar cyan' }, [el('i', { style: { width: Math.min(100, (s.lifetime / def.unlock) * 100) + '%' } })]),
      el('div', { class: 'tiny dim', text: 'Débloqué à ' + fmt(def.unlock) + ' 🪙 gagnées (' + Math.floor(Math.min(1, s.lifetime / def.unlock) * 100) + ' %)' }),
    );
    return;
  }

  // vignette pixel-art (le canvas est réutilisé, jamais cloné : un clone perd son bitmap)
  art.className = 'b-art';
  const key = def.id + tierOf(n) + (s.skins.neon ? 'n' : '');
  let cached = canvases.get(key);
  if (!cached) {
    const spr = Game.sprites.get(def, tierOf(n), 0, s.skins.neon);
    const c = document.createElement('canvas');
    c.width = spr.w; c.height = spr.h;
    c.getContext('2d').drawImage(spr.img, 0, 0);
    const scale = Math.max(1, Math.min(2, Math.round(46 / Math.max(spr.w, spr.h)) + 1));
    c.style.width = spr.w * scale + 'px';
    c.style.height = spr.h * scale + 'px';
    cached = c;
    canvases.set(key, c);
    if (canvases.size > 120) canvases.delete(canvases.keys().next().value);
  }
  art.innerHTML = '';
  art.append(cached);

  const mode = Game.bigBuyMode;
  const maxK = mode === 'max' ? maxAffordable(def, n, s.coins) : mode;
  const amount = Math.max(1, Math.min(maxK, 1000));
  const cost = costOf(def, n, amount);
  const afford = cost <= s.coins;
  const gm = Game.derived ? Game.derived.permMult : 1;
  const incNow = n * def.income * Math.pow(2, Math.floor(n / MILESTONE)) * gm;
  const incAfter = (n + amount) * def.income * Math.pow(2, Math.floor((n + amount) / MILESTONE)) * gm;
  const gain = incAfter - incNow;
  const tier = tierOf(n);
  const nextStep = nextTierAt(n);
  const prevStep = [0, ...[1, 10, 25, 50, 100, 200]].filter((x) => x <= n).pop() || 0;
  const prog = nextStep == null ? 1 : (n - prevStep) / (nextStep - prevStep);
  const nextMult = nextStep == null ? null : Math.pow(2, Math.floor(n / MILESTONE) + 1);

  const btn = el('button', {
    class: 'btn ' + (afford ? 'green' : '') + ' small wide',
    onclick: () => Game.buy(def.id, mode),
  }, [
    el('span', { class: 'ico', text: '🪙' }),
    el('span', { text: '×' + amount + ' · ' + fmt(cost) }),
  ]);
  btn.disabled = !afford;
  btn.dataset.cost = String(cost);
  btn.dataset.amount = String(amount);

  main.append(
    el('div', { class: 'row spread' }, [
      el('span', { class: 'b-name', text: def.icon + ' ' + def.name }),
      el('span', { class: 'chip gold', text: '×' + n }),
    ]),
    el('div', { class: 'b-sub row spread' }, [
      el('span', { text: n > 0 ? '+' + fmt(incNow) + ' /s' : 'pas encore construit' }),
      gain > 0 ? el('span', { class: 'tiny', style: { color: 'var(--green)' }, text: '+' + fmt(gain) + ' /s' }) : null,
    ]),
    el('div', { class: 'row', style: { gap: '6px' } }, [
      el('div', { class: 'grow col', style: { gap: '3px' } }, [
        el('div', { class: 'bar' }, [el('i', { style: { width: Math.round(prog * 100) + '%' } })]),
        el('div', {
          class: 'tiny dimmer',
          text: nextStep == null
            ? 'PALIER MAX ×' + Math.pow(2, Math.floor(n / MILESTONE))
            : n + ' / ' + nextStep + ' unités → ×' + nextMult,
        }),
      ]),
      el('div', { class: 'tier-pips' }, Array.from({ length: 6 }, (_, i) => el('i', { class: i <= tier ? 'on' : (i === tier + 1 ? 'next' : '') }))),
    ]),
    el('div', { class: 'b-actions' }, [btn]),
    el('div', { class: 'tiny dimmer ellipsis', text: def.blurb }),
  );
}

function updateAffordable(Game) {
  const s = Game.state;
  for (const def of BUILDINGS) {
    const row = qs('#brow-' + def.id);
    if (!row) continue;
    const btn = row.querySelector('button.btn.green, button.btn.small');
    if (!btn || !btn.dataset.cost) continue;
    const afford = Number(btn.dataset.cost) <= s.coins;
    btn.disabled = !afford;
    btn.classList.toggle('green', afford);
  }
}
