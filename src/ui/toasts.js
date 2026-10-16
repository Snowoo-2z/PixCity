// ─────────────────────────────────────────────────────────────
//  PixCity · notifications (toasts) + journal de la ville
// ─────────────────────────────────────────────────────────────
import { bus } from '../core/bus.js';
import { el, qs } from './dom.js';

const MAX = 4;
let layer, logLayer;
const logs = [];

export function initToasts() {
  layer = qs('#toasts');
  logLayer = qs('#logs');

  bus.on('notify', ({ text, kind = 'info', ms = 2600 }) => toast(text, kind, ms));
  bus.on('log', ({ text }) => cityLog(text));
  bus.on('saved', () => {});
}

export function toast(text, kind = 'info', ms = 2600) {
  if (!layer) return;
  const icons = { info: 'ℹ️', win: '✅', bad: '⛔', gem: '💎', gold: '🪙' };
  const node = el('div', { class: 'toast ' + kind }, [
    el('span', { class: 't-ico', text: icons[kind] || 'ℹ️' }),
    el('span', { class: 'grow', text }),
  ]);
  layer.append(node);
  while (layer.children.length > MAX) layer.firstChild.remove();
  setTimeout(() => {
    node.classList.add('out');
    setTimeout(() => node.remove(), 260);
  }, ms);
}

export function cityLog(text) {
  if (!logLayer) return;
  const node = el('div', { class: 'log', text });
  logLayer.append(node);
  logs.push(node);
  while (logs.length > 5) {
    const old = logs.shift();
    old.classList.add('out');
    setTimeout(() => old.remove(), 420);
  }
  setTimeout(() => {
    node.classList.add('out');
    setTimeout(() => node.remove(), 420);
  }, 7000);
}
