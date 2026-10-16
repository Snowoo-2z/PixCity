// ─────────────────────────────────────────────────────────────
//  PixCity · modales génériques (empilables, fermables)
// ─────────────────────────────────────────────────────────────
import { Audio } from '../core/audio.js';
import { el, qs } from './dom.js';

let root;
const stack = [];

export function initModal() {
  root = qs('#modals');
  root.addEventListener('click', (e) => {
    if (e.target === root && stack.length && stack[stack.length - 1].dismissable) close();
  });
}

/**
 * openModal({ title, body, footer, wide, dismissable, onClose })
 * body / footer : Node ou tableau de Node
 */
export function openModal(o = {}) {
  if (!root) initModal();
  const body = el('div', { class: 'modal-body' }, o.body || []);
  const modal = el('div', { class: 'modal' + (o.wide ? ' wide' : '') }, [
    o.title ? el('div', { class: 'modal-head row spread' }, [
      el('span', { class: 'title-sm gold-text', text: o.title }),
      o.dismissable === false ? null : el('button', {
        class: 'btn small ghost', text: '✕', onclick: () => close(),
      }),
    ]) : null,
    body,
    o.footer ? el('div', { class: 'modal-foot' }, o.footer) : null,
  ]);
  const entry = { modal, dismissable: o.dismissable !== false, onClose: o.onClose, closing: false };
  root.append(modal);
  root.classList.add('open');
  const esc = (e) => { if (e.key === 'Escape' && entry.dismissable) close(); };
  document.addEventListener('keydown', esc);
  entry.esc = esc;
  stack.push(entry);
  Audio.play('click');
  return { modal, body, close: () => close(entry) };
}

export function close(entry) {
  const e = entry || stack[stack.length - 1];
  if (!e || e.closing) return;
  e.closing = true;
  e.modal.style.transition = 'transform .18s ease, opacity .18s ease';
  e.modal.style.transform = 'scale(.92)';
  e.modal.style.opacity = '0';
  setTimeout(() => {
    e.modal.remove();
    document.removeEventListener('keydown', e.esc);
    const i = stack.indexOf(e);
    if (i >= 0) stack.splice(i, 1);
    if (!stack.length) root.classList.remove('open');
    e.onClose && e.onClose();
  }, 180);
  Audio.play('close');
}

export function closeAll() { while (stack.length) close(stack[stack.length - 1]); }

export function isOpen() { return stack.length > 0; }

/** Raccourci : confirmation simple */
export function confirmModal({ title, text, okLabel = 'OK', cancelLabel = 'Annuler', danger = false, onOk }) {
  const h = openModal({
    title,
    body: el('p', { class: 'small', text, style: { margin: '4px 0 12px' } }),
    footer: [
      el('button', { class: 'btn grow', text: cancelLabel, onclick: () => close() }),
      el('button', { class: 'btn grow ' + (danger ? 'danger' : 'primary'), text: okLabel, onclick: () => { close(); onOk && onOk(); } }),
    ],
  });
  return h;
}

/** Bandeau d'information (sans fermeture au clic extérieur) */
export function infoModal({ title, body, okLabel = 'Compris !' }) {
  return openModal({
    title, body,
    footer: [el('button', { class: 'btn primary grow', text: okLabel, onclick: () => close() })],
  });
}
