// ─────────────────────────────────────────────────────────────
//  PixCity · panneau Succès
// ─────────────────────────────────────────────────────────────
import { bus } from '../core/bus.js';
import { ACH } from '../core/achievements.js';
import { el, qs, setText } from './dom.js';

let gridNode, countNode, Game;

export function initAchPanel(g) {
  Game = g;
  gridNode = qs('#ach-grid');
  countNode = qs('#ach-count');
  renderAch();
  bus.on('ach:many', () => renderAch());
  bus.on('wiped', () => renderAch());
}

export function renderAch() {
  const s = Game.state;
  const have = new Set(s.ach);
  setText(countNode, have.size + '/' + ACH.length);
  const sig = s.ach.join(',');
  if (gridNode._sig === sig) return;
  gridNode._sig = sig;
  gridNode.innerHTML = '';
  for (const a of ACH) {
    const got = have.has(a.id);
    gridNode.append(el('div', {
      class: 'ach ' + (got ? 'got' : 'locked'),
      title: a.name + ' — ' + a.desc + (got ? ' (obtenu, +' + a.gems + ' 💎)' : ''),
    }, [
      el('span', { text: a.icon }),
      el('span', { class: 'a-name', text: got ? a.name : '???' }),
      got ? el('span', { class: 'tiny gold-text', text: '+' + a.gems }) : null,
    ]));
  }
}
