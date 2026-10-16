// ─────────────────────────────────────────────────────────────
//  PixCity · abstraction de dessin
//  La scène (city.js) dessine via cette interface, ce qui permet
//  de la rendre en navigateur (canvas) OU en Node (framebuffer),
//  avec exactement le même code.
// ─────────────────────────────────────────────────────────────
import { rgba, FB } from './fb.js';

const hexToInt = (c) => {
  if (typeof c === 'number') return c;
  if (typeof c === 'string') return parseInt(c.replace('#', ''), 16);
  return 0;
};

const intToCss = (c) => '#' + (c & 0xffffff).toString(16).padStart(6, '0');

/** Rendu dans un FB (Node, tests) */
export class FBSurface {
  constructor(fb) { this.fb = fb; this.alpha = 1; this.clip = null; this.oy = 0; }

  /** Calque hors-écran en mémoire (permet de tester le cache en Node). */
  offscreen(w, h, offsetY = 0) {
    const fb = new FB(w, h);
    const s = new FBSurface(fb);
    s.oy = offsetY;
    s.layerCanvas = fb;
    return s;
  }
  get width() { return this.fb.w; }
  get height() { return this.fb.h; }

  fillRect(x, y, w, h, color) {
    x = Math.round(x); y = Math.round(y + this.oy); w = Math.round(w); h = Math.round(h);
    const c = hexToInt(color);
    const a = this.alpha;
    if (a >= 1) { this.fb.rect(x, y, w, h, rgba((c >> 16) & 255, (c >> 8) & 255, c & 255, 255)); return; }
    if (a <= 0) return;
    const col = rgba((c >> 16) & 255, (c >> 8) & 255, c & 255, Math.round(a * 255));
    for (let yy = Math.max(0, y); yy < Math.min(this.fb.h, y + h); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(this.fb.w, x + w); xx++) this.fb.px(xx, yy, col);
    }
  }

  gradient(x, y, w, h, stops) {
    for (let i = 0; i < h; i++) {
      const t = h <= 1 ? 0 : i / (h - 1);
      const col = sampleStops(stops, t);
      this.fillRect(x, y + i, w, 1, col);
    }
  }

  sprite(img, x, y) { this.fb.blit(img, Math.round(x), Math.round(y + this.oy)); }

  line(x0, y0, x1, y1, width, color) {
    const c = hexToInt(color);
    this.fb.line(Math.round(x0), Math.round(y0 + this.oy), Math.round(x1), Math.round(y1 + this.oy), rgba((c >> 16) & 255, (c >> 8) & 255, c & 255, 255));
  }

  circle(cx, cy, r, color) {
    const c = hexToInt(color);
    this.fb.disk(Math.round(cx), Math.round(cy + this.oy), Math.max(0, Math.round(r)), rgba((c >> 16) & 255, (c >> 8) & 255, c & 255, 255));
  }

  ring(cx, cy, r, color, thick = 1) {
    const c = hexToInt(color);
    for (let i = 0; i < thick; i++) this.fb.ring(cx, cy + this.oy, Math.max(0, r - i), rgba((c >> 16) & 255, (c >> 8) & 255, c & 255, 255), 1);
  }

  /** Pas de texte en Node : le rendu texte est propre au navigateur. */
  text() {}

  pushAlpha(a) { const prev = this.alpha; this.alpha = prev * a; return prev; }
  setAlpha(a) { this.alpha = a; }
  pushClip() {}
  popClip() {}
  save() {}
  restore() {}
}

/** Rendu dans un canvas 2D (navigateur) */
export class CanvasSurface {
  constructor(ctx, canvasEl) {
    this.ctx = ctx;
    this.canvas = canvasEl || ctx.canvas;
    this.ctx.imageSmoothingEnabled = false;
  }

  /** Crée un canvas hors-écran (pour cuire les couches statiques). */
  offscreen(w, h, offsetY = 0) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    if (offsetY) cx.translate(0, offsetY);
    const s = new CanvasSurface(cx, c);
    s.layerCanvas = c;
    return s;
  }

  get width() { return this.canvas.width; }
  get height() { return this.canvas.height; }

  fillRect(x, y, w, h, color) {
    this.ctx.fillStyle = intToCss(hexToInt(color));
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  gradient(x, y, w, h, stops) {
    const g = this.ctx.createLinearGradient(0, y, 0, y + h);
    for (const [t, c] of stops) g.addColorStop(Math.max(0, Math.min(1, t)), intToCss(hexToInt(c)));
    this.ctx.fillStyle = g;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  sprite(img, x, y) { this.ctx.drawImage(img, Math.round(x), Math.round(y)); }

  line(x0, y0, x1, y1, width, color) {
    this.ctx.strokeStyle = intToCss(hexToInt(color));
    this.ctx.lineWidth = width;
    this.ctx.beginPath();
    this.ctx.moveTo(Math.round(x0) + 0.5, Math.round(y0) + 0.5);
    this.ctx.lineTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5);
    this.ctx.stroke();
  }

  circle(cx, cy, r, color) {
    this.ctx.fillStyle = intToCss(hexToInt(color));
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, Math.max(0.2, r), 0, Math.PI * 2);
    this.ctx.fill();
  }

  ring(cx, cy, r, color, thick = 1) {
    this.ctx.strokeStyle = intToCss(hexToInt(color));
    this.ctx.lineWidth = thick;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, Math.max(0.2, r), 0, Math.PI * 2);
    this.ctx.stroke();
  }

  text(str, x, y, o = {}) {
    const ctx = this.ctx;
    const size = o.size || 8;
    ctx.font = `${o.weight || ''} ${size}px ${o.font || 'VT323, monospace'}`.trim();
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.baseline || 'top';
    if (o.shadow !== false) {
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillText(str, Math.round(x) + (o.shadowX ?? 1), Math.round(y) + (o.shadowY ?? 1));
    }
    ctx.fillStyle = intToCss(hexToInt(o.color ?? 0xffffff));
    ctx.fillText(str, Math.round(x), Math.round(y));
  }

  pushAlpha(a) {
    const prev = this.ctx.globalAlpha;
    this.ctx.globalAlpha = prev * a;
    return prev;
  }
  setAlpha(a) { this.ctx.globalAlpha = a; }

  pushClip(x, y, w, h) {
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(x, y, w, h);
    this.ctx.clip();
  }
  popClip() { this.ctx.restore(); }
  save() { this.ctx.save(); }
  restore() { this.ctx.restore(); }
}

function sampleStops(stops, t) {
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i], [t1, c1] = stops[i + 1];
    if (t <= t1) {
      const k = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
      const a = hexToInt(c0), b = hexToInt(c1);
      const r = Math.round(((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * k);
      const g = Math.round(((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * k);
      const bl = Math.round((a & 255) + ((b & 255) - (a & 255)) * k);
      return (r << 16) | (g << 8) | bl;
    }
  }
  return hexToInt(stops[stops.length - 1][1]);
}

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
