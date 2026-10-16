// ─────────────────────────────────────────────────────────────
//  PixCity · gestion des panneaux + dock
// ─────────────────────────────────────────────────────────────
import { bus } from '../core/bus.js';
import { qs, qsa, toggle } from './dom.js';
import { Audio } from '../core/audio.js';
import { chainInfo, dailyInfo } from '../core/quests.js';
import { ACH } from '../core/achievements.js';
import { BUILDINGS } from '../core/data.js';
import { costOf } from '../core/economy.js';
import { offerActive, vipAvailable, rewardedAvailable } from '../core/iap.js';

const state = { open: null, refs: {} };

export function initPanels() {
  for (const p of qsa('.panel')) state.refs[p.id] = p;
  qsa('[data-close]').forEach((b) => b.addEventListener('click', () => closePanel()));
  qsa('#dock .dock-btn').forEach((b) => {
    const panel = b.dataset.panel;
    b.addEventListener('click', () => {
      Audio.play('click');
      if (!panel) return bus.emit('open:prestige');
      state.open === panel ? closePanel() : openPanel(panel);
    });
  });
  bus.on('open:panel', (id) => openPanel(id));
  bus.on('close:panels', () => closePanel());
}

export function openPanel(id) {
  const panel = state.refs['panel-' + id];
  if (!panel) return;
  for (const key in state.refs) state.refs[key].classList.toggle('open', key === 'panel-' + id);
  state.open = id;
  qs('#panels').classList.add('open');
  qsa('#dock .dock-btn').forEach((b) => b.classList.toggle('hot', b.dataset.panel === id));
  bus.emit('panel:open', id);
  Audio.play('click');
  panel.querySelector('.panel-body').scrollTop = 0;
}

export function closePanel() {
  for (const key in state.refs) state.refs[key].classList.remove('open');
  if (state.open) Audio.play('close');
  state.open = null;
  qs('#panels').classList.remove('open');
  qsa('#dock .dock-btn').forEach((b) => b.classList.remove('hot'));
}

export function isPanelOpen(id) {
  return state.open === id;
}

/** Pastilles rouges sur le dock : ce qui est prêt à réclamer / acheter. */
export function updateDockBadges(Game) {
  const s = Game.state;
  const d = Game.derived;

  // bâtiments abordables
  let affordable = 0;
  for (const def of BUILDINGS) {
    const n = s.buildings[def.id] || 0;
    const unlocked = s.lifetime >= def.unlock || n > 0;
    if (unlocked && costOf(def, n, 1) <= s.coins) affordable++;
  }
  badge('dot-build', affordable > 0 ? '' : null);

  // améliorations payables
  let up = 0;
  if (s.gems >= 40) up = 1;
  badge('dot-up', up ? '' : null);

  // boutique : offre flash ou récompenses dispo
  const offer = offerActive(s);
  const adReady = rewardedAvailable(s) === 0 && !s.up.noAds;
  const vipReady = vipAvailable(s) > 0;
  badge('dot-shop', offer || adReady || vipReady ? '!' : null);

  // quêtes
  const chain = chainInfo(s);
  const dq = dailyInfo(s).filter((q) => q.ready).length;
  const ready = (chain && chain.ready ? 1 : 0) + dq;
  badge('dot-quests', ready ? String(ready) : null);

  // succès : rien à réclamer (auto), mais on signale les nouveautés
  badge('dot-ach', null);

  // prestige
  const stars = d && s.run > 0 ? Math.floor(Math.pow(s.run / 1e8, 0.5)) : 0;
  badge('dot-prestige', stars > 0 ? String(stars) : null);

  qs('#dock-build').classList.toggle('hot', affordable > 0 && state.open !== 'build');
}

function badge(id, text) {
  const node = qs('#' + id);
  if (!node) return;
  if (text == null) { node.classList.add('hidden'); return; }
  node.classList.remove('hidden');
  if (node.textContent !== text) node.textContent = text;
}
