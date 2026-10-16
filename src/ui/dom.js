// ─────────────────────────────────────────────────────────────
//  PixCity · petits utilitaires DOM
// ─────────────────────────────────────────────────────────────
export function qs(sel, root = document) { return root.querySelector(sel); }
export function qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }

/** Crée un élément : el('div', {class:'x', onclick:fn}, [enfants]) */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class' || k === 'className') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'dataset' && typeof v === 'object') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function setText(node, text) {
  if (node && node.textContent !== text) node.textContent = text;
}

export function setBar(node, ratio) {
  if (node) node.style.width = Math.max(0, Math.min(1, ratio)) * 100 + '%';
}

export function toggle(node, on, cls = 'on') {
  if (!node) return;
  node.classList.toggle(cls, !!on);
}

/** N'affiche le HTML que si le contenu a changé (évite les re-render inutiles) */
export function paint(container, html) {
  if (container._lastHtml === html) return false;
  container._lastHtml = html;
  container.innerHTML = html;
  return true;
}

export function fmtClass(n, thresholds = [1e3, 1e6]) {
  return n >= thresholds[0] ? 'gold-text' : '';
}

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/** Tween simple (retourne une fonction à appeler chaque frame) */
export function tween(from, to, ms, onUpdate, onDone) {
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    const eased = 1 - Math.pow(1 - k, 3);
    onUpdate(from + (to - from) * eased);
    if (k < 1) requestAnimationFrame(step);
    else onDone && onDone();
  };
  requestAnimationFrame(step);
}

/** Formate en compteur animé (nombre qui défile) */
export class Counter {
  constructor(node, format) {
    this.node = node;
    this.format = format;
    this.value = 0;
    this.target = 0;
    this.shown = 0;
  }
  set(v) { this.target = v; }
  jump(v) { this.value = v; this.target = v; this.shown = v; this.render(); }
  update(dt) {
    this.target = this.target;
    const diff = this.target - this.shown;
    if (Math.abs(diff) < 0.01) { this.shown = this.target; this.render(); return; }
    const speed = Math.max(Math.abs(diff) * 6, Math.abs(diff) * 0.02 + 0.5);
    this.shown += Math.sign(diff) * Math.min(Math.abs(diff), speed * dt);
    this.render();
  }
  render() {
    const txt = this.format(this.shown);
    if (this.node && this.node.textContent !== txt) this.node.textContent = txt;
  }
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
