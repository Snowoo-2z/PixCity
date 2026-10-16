// ─────────────────────────────────────────────────────────────
//  PixCity · effets plein écran : confettis, pop de récompense
// ─────────────────────────────────────────────────────────────
import { qs, el } from './dom.js';

let layer, popLayer;

export function initFx() {
  layer = qs('#fx-layer');
  popLayer = qs('#fx-pop');
}

export function confetti(count = 40, colors = [0xffd166, 0xff4dd2, 0x6be3ff, 0x6bc47a, 0xb06bff]) {
  if (!layer) return;
  for (let i = 0; i < count; i++) {
    const c = colors[Math.floor(Math.random() * colors.length)];
    const node = el('i', {
      class: 'confetti',
      style: {
        left: Math.random() * 100 + '%',
        top: '-20px',
        background: '#' + c.toString(16).padStart(6, '0'),
        animationDuration: (1.6 + Math.random() * 1.6) + 's',
        animationDelay: (Math.random() * 0.5) + 's',
        transform: `rotate(${Math.random() * 360}deg)`,
      },
    });
    layer.append(node);
    setTimeout(() => node.remove(), 3800);
  }
}

/** Gros pop central : icône + titre + sous-titre */
export function rewardPop(icon, title, sub = '', ms = 1700) {
  if (!popLayer) return;
  const node = el('div', { class: 'reward-pop' }, [
    el('div', { class: 'r-ico', text: icon }),
    el('div', { class: 'r-txt', text: title }),
    sub ? el('div', { class: 'r-sub', text: sub }) : null,
  ]);
  popLayer.append(node);
  setTimeout(() => {
    node.style.transition = 'opacity .3s, transform .3s';
    node.style.opacity = '0';
    node.style.transform = 'translate(-50%, -80%) scale(1.1)';
    setTimeout(() => node.remove(), 320);
  }, ms);
  confetti(26);
}

export function flash(ms = 160) {
  const f = el('div', { style: { position: 'absolute', inset: 0, background: '#fff', opacity: '0.65', transition: `opacity ${ms}ms` } });
  if (!layer) return;
  layer.append(f);
  requestAnimationFrame(() => { f.style.opacity = '0'; });
  setTimeout(() => f.remove(), ms + 60);
}

export function shakeScreen(mag = 6) {
  const app = qs('#app');
  if (!app) return;
  app.style.transition = 'transform .08s';
  let n = 0;
  const iv = setInterval(() => {
    const dx = (Math.random() - 0.5) * mag, dy = (Math.random() - 0.5) * mag;
    app.style.transform = `translate(${dx}px, ${dy}px)`;
    if (++n > 5) { clearInterval(iv); app.style.transform = ''; }
  }, 40);
}
