// ─────────────────────────────────────────────────────────────
//  PixCity · panneau « Bonus permanents » (améliorations à gemmes)
// ─────────────────────────────────────────────────────────────
import { bus } from '../core/bus.js';
import { GEM_UPGRADES, GEM_UNIQUE, BUILDINGS, tierOf } from '../core/data.js';
import { gemUpgradeCost } from '../core/economy.js';
import { fmt } from '../core/format.js';
import { el, qs, setText } from './dom.js';
import { rewardPop } from './fx.js';

let listNode, uniqueNode, gemsNode, Game, lastSig = '';

export function initUpPanel(g) {
  Game = g;
  listNode = qs('#up-list');
  uniqueNode = qs('#unique-list');
  gemsNode = qs('#up-gems');
  render();
  bus.on('tick', () => {
    setText(gemsNode, fmt(Game.state.gems) + ' 💎');
    render();
  });
  bus.on('purchase', () => { lastSig = ''; render(); });
  bus.on('ach:many', () => { lastSig = ''; render(); });
}

function render() {
  const s = Game.state;
  const sig = GEM_UPGRADES.map((u) => (s.up[u.id] || 0)).join(',') + '|' + s.gems + '|' +
    GEM_UNIQUE.map((u) => (u.req(s) ? 1 : 0)).join('') + '|' + (s.skins.neon ? 1 : 0) + '|' + s.achievements;
  if (sig === lastSig) return;
  lastSig = sig;

  listNode.innerHTML = '';
  for (const u of GEM_UPGRADES) {
    const lvl = s.up[u.id] || 0;
    const maxed = lvl >= u.max;
    const cost = gemUpgradeCost(u, lvl);
    const afford = s.gems >= cost;
    const pips = [];
    for (let i = 0; i < u.max; i++) pips.push(el('i', { class: i < lvl ? 'on' : '' }));

    listNode.append(el('div', { class: 'card up-item' }, [
      el('div', { class: 'up-ico', text: u.icon }),
      el('div', { class: 'grow col', style: { gap: '2px' } }, [
        el('div', { class: 'row spread' }, [
          el('span', { class: 'small', text: u.name + ' ' + (lvl > 0 ? 'niv. ' + lvl : '') }),
          el('span', { class: 'chip purple', text: maxed ? 'MAX' : cost + ' 💎' }),
        ]),
        el('div', { class: 'tiny dim', text: u.desc }),
        el('div', { class: 'pips' }, pips),
        lvl > 0 ? el('div', { class: 'tiny', style: { color: 'var(--green)' }, text: 'Actuel : ' + u.effect(lvl) }) : null,
      ]),
      el('button', {
        class: 'btn small ' + (afford && !maxed ? 'purple' : ''),
        text: maxed ? '✓' : 'Améliorer',
        disabled: maxed || !afford,
        onclick: () => {
          const res = Game.buyUpgrade(u.id);
          if (res.ok) {
            rewardPop(u.icon, u.name.toUpperCase(), 'NIVEAU ' + res.level, 1300);
            lastSig = '';
            render();
          }
        },
      }),
    ]));
  }

  uniqueNode.innerHTML = '';
  for (const u of GEM_UNIQUE) {
    const available = u.req(s);
    const afford = s.gems >= u.cost;
    if (u.id.startsWith('horsligne') && !available) continue; // les niveaux suivants apparaissent au fur et à mesure
    uniqueNode.append(el('div', { class: 'card up-item' + (available ? '' : ' dimmed') }, [
      el('div', { class: 'up-ico', text: u.icon }),
      el('div', { class: 'grow col', style: { gap: '2px' } }, [
        el('div', { class: 'row spread' }, [
          el('span', { class: 'small', text: u.name }),
          el('span', { class: 'chip purple', text: available ? u.cost + ' 💎' : '✓' }),
        ]),
        el('div', { class: 'tiny dim', text: u.desc }),
      ]),
      el('button', {
        class: 'btn small ' + (available && afford ? 'purple' : ''),
        text: available ? 'Débloquer' : 'Acquis',
        disabled: !available || !afford,
        onclick: () => {
          const res = Game.buyUnique(u.id);
          if (res.ok) {
            rewardPop(u.icon, u.name.toUpperCase(), 'DÉBLOQUÉ', 1500);
            lastSig = '';
            render();
          }
        },
      }),
    ]));
  }

  // état de la veilleuse
  const lvl = s.up.horsligne || 0;
  const caps = [2, 4, 8, 24, 48];
  const effs = [50, 50, 65, 80, 80];
  uniqueNode.append(el('div', { class: 'card' }, [
    el('div', { class: 'row spread' }, [
      el('span', { class: 'title-xs', text: '🌙 REVENUS HORS-LIGNE' }),
      el('span', { class: 'chip cyan', text: caps[lvl] + ' h · ' + effs[lvl] + ' %' }),
    ]),
    el('div', { class: 'tiny dim', text: 'Ta ville produit pendant ton absence. Améliore la veilleuse pour allonger la durée.' }),
  ]));

  // compte des paliers (assurance)
  const tiers = BUILDINGS.reduce((a, b) => a + tierOf(s.buildings[b.id] || 0), 0);
  uniqueNode.append(el('div', { class: 'card' }, [
    el('div', { class: 'row spread' }, [
      el('span', { class: 'title-xs', text: '🛡️ PALIERS ATTEINTS' }),
      el('span', { class: 'chip', text: tiers + ' / ' + (BUILDINGS.length * 6) }),
    ]),
    el('div', { class: 'tiny dim', text: s.up.assurance ? 'Assurance active : +' + tiers + ' % de production.' : 'Avec l’Assurance anti-crash : +1 % de production par palier, pour toujours.' }),
  ]));
}
