// ─────────────────────────────────────────────────────────────
//  PixCity · DOM minimal pour les tests (Node, sans navigateur)
//  Suffisant pour exécuter tout le jeu : éléments, attributs,
//  classes, événements, sélecteurs simples et canvas 2D factice.
// ─────────────────────────────────────────────────────────────

class ClassList {
  constructor(node) { this.node = node; this.set = new Set(); }
  _sync() { this.node._class = [...this.set].join(' '); }
  add(...names) { names.forEach((n) => this.set.add(n)); this._sync(); }
  remove(...names) { names.forEach((n) => this.set.delete(n)); this._sync(); }
  contains(n) { return this.set.has(n); }
  toggle(n, force) {
    const on = force === undefined ? !this.set.has(n) : !!force;
    on ? this.set.add(n) : this.set.delete(n);
    this._sync();
    return on;
  }
  get value() { return [...this.set].join(' '); }
}

class Node {
  constructor(tag, doc) {
    this.tagName = (tag || 'div').toUpperCase();
    this.nodeType = 1;
    this.ownerDocument = doc;
    this.children = [];
    this.parentNode = null;
    this.attrs = {};
    this.style = new Proxy({}, { set: (t, k, v) => { t[k] = v; return true; }, get: (t, k) => t[k] ?? '' });
    this.dataset = new Proxy({}, {
      set: (t, k, v) => { t[k] = v; this.attrs['data-' + k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())] = v; return true; },
      get: (t, k) => t[k] ?? this.attrs['data-' + k],
    });
    this._class = '';
    this.classList = new ClassList(this);
    this._text = '';
    this._listeners = new Map();
    this._html = '';
  }

  get className() { return this.classList.value; }
  set className(v) {
    this.classList.set = new Set(String(v).split(/\s+/).filter(Boolean));
    this.classList._sync();
  }

  get class() { return this.className; }
  set class(v) { this.className = v; }

  get id() { return this.attrs.id || ''; }
  set id(v) { this.attrs.id = v; }

  get width() { return Number(this.attrs.width || 300); }
  set width(v) { this.attrs.width = v; }
  get height() { return Number(this.attrs.height || 150); }
  set height(v) { this.attrs.height = v; }

  get textContent() {
    if (this.children.length) return this.children.map((c) => c.textContent || '').join('');
    return this._text;
  }
  set textContent(v) { this._text = String(v); this.children = []; }

  get innerHTML() { return this._html; }
  set innerHTML(v) {
    this._html = String(v);
    this.children = [];
    this._text = '';
    if (!v) return;
    // mini-parsing : uniquement des balises simples imbriquées d'un niveau
    const doc = this.ownerDocument;
    const tokens = String(v).match(/<(\/?)([a-zA-Z0-9]+)([^>]*?)(\/?)>|([^<]+)/g) || [];
    const stack = [this];
    for (const tk of tokens) {
      if (tk.startsWith('<')) {
        const m = tk.match(/<(\/?)([a-zA-Z0-9]+)([^>]*?)(\/?)>$/);
        if (!m) continue;
        const [, close, tag, attrStr, self] = m;
        if (close) { if (stack.length > 1) stack.pop(); continue; }
        const node = doc.createElement(tag);
        const am = attrStr.matchAll(/([a-zA-Z-]+)(?:="([^"]*)")?/g);
        for (const a of am) node.attrs[a[1]] = a[2] ?? '';
        if (node.attrs.class) node.className = node.attrs.class;
        if (node.attrs.id) node.attrs.id = node.attrs.id;
        if (node.attrs.style) node.attrs.style = node.attrs.style;
        stack[stack.length - 1].append(node);
        if (!self) stack.push(node);
      } else {
        stack[stack.length - 1]._text += tk;
      }
    }
  }

  append(...nodes) {
    for (const n of nodes) {
      const node = typeof n === 'object' && n !== null ? n : this.ownerDocument.createTextNode(String(n));
      if (node.parentNode) node.parentNode.removeChild(node);
      node.parentNode = this;
      this.children.push(node);
    }
  }
  appendChild(n) { this.append(n); return n; }
  prepend(...nodes) {
    const prepared = [];
    for (const n of nodes) {
      const node = typeof n === 'object' && n !== null ? n : this.ownerDocument.createTextNode(String(n));
      if (node.parentNode) node.parentNode.removeChild(node);
      node.parentNode = this;
      prepared.push(node);
    }
    this.children.unshift(...prepared);
  }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  insertBefore(n, ref) {
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.append(n);
    else { n.parentNode = this; this.children.splice(i, 0, n); }
    return n;
  }
  removeChild(n) {
    const i = this.children.indexOf(n);
    if (i >= 0) this.children.splice(i, 1);
    n.parentNode = null;
    return n;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  contains(n) {
    if (n === this) return true;
    return this.children.some((c) => c.contains && c.contains(n));
  }
  cloneNode(deep) {
    const c = this.ownerDocument.createElement(this.tagName.toLowerCase());
    c.attrs = { ...this.attrs };
    c.className = this.className;
    c._text = this._text;
    c._html = this._html;
    if (deep) for (const k of this.children) c.append(k.cloneNode(true));
    return c;
  }

  setAttribute(k, v) { this.attrs[k] = v; if (k === 'class') this.className = v; if (k === 'id') this.attrs.id = v; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  hasAttribute(k) { return k in this.attrs; }

  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) { this._listeners.get(type)?.delete(fn); }
  dispatchEvent(ev) {
    const type = ev.type || ev;
    const set = this._listeners.get(type);
    if (set) for (const fn of [...set]) fn(ev);
    // remontée vers les parents (bubbling)
    if (this.parentNode && ev.bubbles !== false) this.parentNode.dispatchEvent(ev);
    return true;
  }
  click() { this.dispatchEvent({ type: 'click', target: this, preventDefault() {}, stopPropagation() {} }); }
  focus() {}
  blur() {}
  select() {}
  getBoundingClientRect() {
    if (this.tagName === 'CANVAS') {
      const s = this.ownerDocument.__canvasScale || 1;
      return { left: 0, top: 0, width: this.width * s, height: this.height * s, right: this.width * s, bottom: this.height * s };
    }
    return { left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 };
  }
  getContext() { return this.ownerDocument.__ctx; }
  setPointerCapture() {}
  releasePointerCapture() {}
  get offsetWidth() { return 100; }
  get firstChild() { return this.children[0] || null; }

  /** Sélecteur minimal : #id, .class, tag, [attr], [attr=val], combinaisons descendantes */
  matches(sel) {
    return sel.split(/\s+/).reduce((ok, part, i, arr) => {
      if (!ok) return false;
      if (i < arr.length - 1) return true;
      return matchesSimple(this, part);
    }, true);
  }

  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }

  querySelectorAll(sel) {
    const parts = sel.trim().split(/\s+/);
    const out = [];
    const deep = (node) => {
      for (const c of node.children) {
        if (c.nodeType !== 1) continue;
        if (matchesComplex(c, parts)) out.push(c);
        deep(c);
      }
    };
    deep(this);
    return out;
  }
}

function matchesSimple(node, part) {
  if (!part) return false;
  const idM = part.match(/^#([\w-]+)/);
  if (idM && node.attrs.id !== idM[1]) return false;
  const clsM = [...part.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  for (const c of clsM) if (!node.classList.contains(c)) return false;
  const attrM = part.match(/\[([\w-]+)(?:="?([^"\]]*)"?)?\]/);
  if (attrM) {
    const v = node.attrs[attrM[1]];
    if (v === undefined) return false;
    if (attrM[2] !== undefined && String(v) !== attrM[2]) return false;
  }
  const tagM = part.match(/^([a-zA-Z][\w-]*)/);
  if (tagM && node.tagName !== tagM[1].toUpperCase()) return false;
  return !!(idM || clsM.length || attrM || tagM);
}

function matchesComplex(node, selParts) {
  if (!matchesSimple(node, selParts[selParts.length - 1])) return false;
  let parent = node.parentNode;
  for (let i = selParts.length - 2; i >= 0; i--) {
    let found = false;
    while (parent) {
      if (matchesSimple(parent, selParts[i])) { found = true; parent = parent.parentNode; break; }
      parent = parent.parentNode;
    }
    if (!found) return false;
  }
  return true;
}

class TextNode {
  constructor(t) { this.nodeType = 3; this._text = String(t); this.children = []; this.attrs = {}; this.classList = new ClassList(this); this.dataset = {}; this.style = {}; }
  get textContent() { return this._text; }
  contains() { return false; }
}

function makeCtx(doc) {
  const noop = () => {};
  const grad = { addColorStop: noop };
  return {
    canvas: null,
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'top',
    fillRect: noop, strokeRect: noop, clearRect: noop, drawImage: noop, putImageData: noop,
    save: noop, restore: noop, translate: noop, scale: noop, rotate: noop,
    beginPath: noop, closePath: noop, rect: noop, clip: noop, arc: noop, moveTo: noop, lineTo: noop,
    fill: noop, stroke: noop, fillText: noop, measureText: () => ({ width: 10 }),
    createLinearGradient: () => grad, createRadialGradient: () => grad,
  };
}

function parseHTML(html, doc) {
  const body = doc.createElement('body');
  const stack = [body];
  const tokens = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .match(/<(\/?)([a-zA-Z0-9]+)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>|([^<]+)/g) || [];
  for (const tk of tokens) {
    if (tk[0] === '<') {
      const m = tk.match(/^<(\/?)([a-zA-Z0-9]+)([\s\S]*?)(\/?)>$/);
      if (!m) continue;
      const [, close, tag, attrStr, self] = m;
      const TAG = tag.toUpperCase();
      if (close) { if (stack.length > 1) stack.pop(); continue; }
      const node = doc.createElement(tag);
      for (const a of attrStr.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) {
        node.attrs[a[1]] = a[2] === undefined ? '' : a[2];
        if (a[1] === 'class') node.className = a[2];
      }
      stack[stack.length - 1].append(node);
      const voidTags = ['BR', 'HR', 'IMG', 'INPUT', 'META', 'LINK', 'SOURCE', 'AREA', 'BASE', 'COL'];
      if (!self && !voidTags.includes(TAG)) stack.push(node);
    } else if (tk.trim()) {
      stack[stack.length - 1]._text += tk;
    }
  }
  return body;
}

export function installDom(html, opts = {}) {
  const doc = {
    __ctx: null,
    createElement(tag) {
      const n = new Node(tag, doc);
      if (tag.toLowerCase() === 'canvas') n.getContext = () => doc.__ctx;
      return n;
    },
    createTextNode(t) { return new TextNode(t); },
    _listeners: new Map(),
    addEventListener(type, fn) {
      if (!doc._listeners.has(type)) doc._listeners.set(type, new Set());
      doc._listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) { doc._listeners.get(type)?.delete(fn); },
    dispatchEvent(ev) {
      const set = doc._listeners.get(ev.type);
      if (set) for (const fn of [...set]) fn(ev);
      return true;
    },
    get hidden() { return false; },
  };
  doc.__ctx = makeCtx(doc);
  const body = parseHTML(html, doc);
  doc.body = body;
  doc.documentElement = body;
  doc.getElementById = (id) => {
    const found = body.querySelector('#' + id);
    return found;
  };
  doc.querySelector = (s) => body.querySelector(s);
  doc.querySelectorAll = (s) => body.querySelectorAll(s);

  const win = {
    innerWidth: opts.width || 900,
    innerHeight: opts.height || 640,
    devicePixelRatio: 1,
    _listeners: new Map(),
    addEventListener(type, fn) {
      if (!win._listeners.has(type)) win._listeners.set(type, new Set());
      win._listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) { win._listeners.get(type)?.delete(fn); },
    dispatchEvent(ev) {
      const set = win._listeners.get(ev.type);
      if (set) for (const fn of [...set]) fn(ev);
      return true;
    },
    requestAnimationFrame: null,
    localStorage: makeStorage(),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    navigator: { userAgent: 'node-test', vibrate: null },
  };

  const define = (key, value) => {
    try { globalThis[key] = value; }
    catch (e) { Object.defineProperty(globalThis, key, { value, writable: true, configurable: true }); }
  };
  define('window', win);
  define('document', doc);
  define('localStorage', win.localStorage);
  if (!globalThis.navigator || !globalThis.navigator.vibrate) {
    try { Object.defineProperty(globalThis, 'navigator', { value: win.navigator, writable: true, configurable: true }); }
    catch (e) { win.navigator = globalThis.navigator; }
  }
  win.navigator = globalThis.navigator;
  define('location', { protocol: 'http:', hostname: 'localhost', href: 'http://localhost/', reload() {}, search: '' });
  globalThis.ImageData = class ImageData { constructor(data, w, h) { this.data = data; this.width = w; this.height = h; } };
  globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 8);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  globalThis.devicePixelRatio = 1;
  return { doc, win, body };
}

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    get length() { return map.size; },
    key: (i) => [...map.keys()][i],
  };
}
