// ─────────────────────────────────────────────────────────────
//  PixCity · framebuffer pixel-art
//  Tout le pixel-art est dessiné avec ces primitives, sur un
//  Uint32Array. En navigateur on le « cuit » (bake) dans un canvas,
//  en Node on l'exporte en PNG pour vérifier le rendu.
//  Format interne : 0xAABBGGRR (compatible ImageData little-endian)
// ─────────────────────────────────────────────────────────────

export const TRANSPARENT = 0;

export function rgba(r, g, b, a = 255) {
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export function hex(c) {
  return rgba((c >> 16) & 255, (c >> 8) & 255, c & 255, 255);
}

export function shade(color, amount) {
  const r = color & 255, g = (color >> 8) & 255, b = (color >> 16) & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + 255 * amount)));
  return rgba(f(r), f(g), f(b), (color >>> 24) & 255);
}

export function mixColor(a, b, t) {
  const ar = a & 255, ag = (a >> 8) & 255, ab = (a >> 16) & 255;
  const br = b & 255, bg = (b >> 8) & 255, bb = (b >> 16) & 255;
  return rgba(
    Math.round(ar + (br - ar) * t),
    Math.round(ag + (bg - ag) * t),
    Math.round(ab + (bb - ab) * t), 255);
}

export class FB {
  constructor(w, h, fill = TRANSPARENT) {
    this.w = w; this.h = h;
    this.data = new Uint32Array(w * h);
    if (fill) this.data.fill(fill >>> 0);
  }

  get width() { return this.w; }
  get height() { return this.h; }

  clear(c = TRANSPARENT) { this.data.fill(c >>> 0); return this; }

  idx(x, y) { return y * this.w + x; }

  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }

  px(x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    if (c >>> 24 === 0) return;
    if ((c >>> 24) === 255) { this.data[y * this.w + x] = c >>> 0; return; }
    // mélange alpha (rare, pour les ombres/ombrages doux)
    const i = y * this.w + x;
    const dst = this.data[i];
    const a = ((c >>> 24) & 255) / 255;
    const dr = dst & 255, dg = (dst >> 8) & 255, db = (dst >> 16) & 255;
    const sr = c & 255, sg = (c >> 8) & 255, sb = (c >> 16) & 255;
    const r = Math.round(dr + (sr - dr) * a), g = Math.round(dg + (sg - dg) * a), b = Math.round(db + (sb - db) * a);
    this.data[i] = rgba(r, g, b, 255);
  }

  get(x, y) {
    if (!this.inside(x, y)) return 0;
    return this.data[y * this.w + x];
  }

  rect(x, y, w, h, c) {
    x |= 0; y |= 0; w |= 0; h |= 0;
    const x0 = Math.max(0, x), y0 = Math.max(0, y);
    const x1 = Math.min(this.w, x + w), y1 = Math.min(this.h, y + h);
    const col = c >>> 0;
    for (let yy = y0; yy < y1; yy++) {
      const row = yy * this.w;
      for (let xx = x0; xx < x1; xx++) this.data[row + xx] = col;
    }
    return this;
  }

  outline(x, y, w, h, c) {
    this.rect(x, y, w, 1, c);
    this.rect(x, y + h - 1, w, 1, c);
    this.rect(x, y, 1, h, c);
    this.rect(x + w - 1, y, 1, h, c);
    return this;
  }

  hline(x, y, w, c) { return this.rect(x, y, w, 1, c); }
  vline(x, y, h, c) { return this.rect(x, y, 1, h, c); }

  /** Cercle plein (Bresenham disque) */
  disk(cx, cy, r, c) {
    cx |= 0; cy |= 0;
    for (let y = -r; y <= r; y++) {
      const dx = Math.floor(Math.sqrt(Math.max(0, r * r - y * y)));
      this.hline(cx - dx, cy + y, dx * 2 + 1, c);
    }
    return this;
  }

  ring(cx, cy, r, c, thick = 1) {
    for (let a = 0; a < 360; a += Math.max(1, Math.floor(180 / Math.max(1, r)))) {
      const rad = (a * Math.PI) / 180;
      for (let t = 0; t < thick; t++) {
        this.px(cx + Math.round(Math.cos(rad) * (r - t)), cy + Math.round(Math.sin(rad) * (r - t)), c);
      }
    }
    return this;
  }

  line(x0, y0, x1, y1, c) {
    let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
    return this;
  }

  /** Triangle rectangle « toit » : sommet centré en haut */
  roofTriangle(cx, topY, halfW, height, c) {
    for (let i = 0; i < height; i++) {
      const w = Math.round(((halfW * 2) * (i + 1)) / height);
      this.hline(cx - Math.floor(w / 2), topY + i, w, c);
    }
    return this;
  }

  /** Blit d'un autre framebuffer (respecte l'alpha 0) */
  blit(src, dx, dy, tint = 0, tintAmount = 0) {
    for (let y = 0; y < src.h; y++) {
      const ty = dy + y;
      if (ty < 0 || ty >= this.h) continue;
      for (let x = 0; x < src.w; x++) {
        const tx = dx + x;
        if (tx < 0 || tx >= this.w) continue;
        const c = src.data[y * src.w + x];
        const a = (c >>> 24) & 255;
        if (!a) continue;
        let col = c;
        if (tint && tintAmount > 0) col = mixColor(c, tint, tintAmount);
        if (a === 255) this.data[ty * this.w + tx] = col >>> 0;
        else this.px(tx, ty, col);
      }
    }
    return this;
  }

  /** Rectangle arrondi pixel-art (coins coupés) */
  roundRect(x, y, w, h, c, cut = 1) {
    this.rect(x + cut, y, w - cut * 2, h, c);
    this.rect(x, y + cut, cut, h - cut * 2, c);
    this.rect(x + w - cut, y + cut, cut, h - cut * 2, c);
    return this;
  }
}

// ── Export PNG (Node) : encodeur minimal sans dépendance ──────

export function fbToRGBA(fb) {
  const out = new Uint8ClampedArray(fb.w * fb.h * 4);
  const view = new Uint32Array(out.buffer);
  for (let i = 0; i < fb.data.length; i++) {
    const c = fb.data[i];
    const a = (c >>> 24) & 255;
    if (a === 255) view[i] = c;
    else view[i] = rgba(c & 255, (c >> 8) & 255, (c >> 16) & 255, a);
  }
  return out;
}

import { zlibDeflate } from './deflate.js';

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = data.length;
  const out = new Uint8Array(12 + len);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, len);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + len, crc32(out.subarray(4, 8 + len)));
  return out;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Applique le filtre PNG qui minimise la somme des écarts (heuristique standard). */
function filterRows(raw, width, height, bpp) {
  const stride = width * bpp;
  const out = new Uint8Array((stride + 1) * height);
  const cand = [new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride)];
  const score = new Array(5).fill(0);
  for (let y = 0; y < height; y++) {
    const cur = raw.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? raw.subarray((y - 1) * stride, y * stride) : null;
    score.fill(0);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= bpp ? prev[i - bpp] : 0;
      const v = cur[i];
      cand[0][i] = v;
      cand[1][i] = (v - a) & 255;
      cand[2][i] = (v - b) & 255;
      cand[3][i] = (v - ((a + b) >> 1)) & 255;
      cand[4][i] = (v - paeth(a, b, c)) & 255;
      for (let k = 0; k < 5; k++) score[k] += Math.abs(cand[k][i] < 128 ? cand[k][i] : cand[k][i] - 256);
    }
    let best = 0;
    for (let k = 1; k < 5; k++) if (score[k] < score[best]) best = k;
    out[y * (stride + 1)] = best;
    out.set(cand[best], y * (stride + 1) + 1);
  }
  return out;
}

function pngAssemble(width, height, bitDepth, colorType, raw, extraChunks = []) {
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = bitDepth;
  ihdr[9] = colorType;
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, pngChunk('IHDR', ihdr), ...extraChunks, pngChunk('IDAT', zlibDeflate(raw)), pngChunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** fb -> PNG RGBA8 (filtres PNG + DEFLATE maison). */
export function fbToPNG(fb) {
  const rgba = fbToRGBA(fb);
  const raw = filterRows(rgba, fb.w, fb.h, 4);
  return pngAssemble(fb.w, fb.h, 8, 6, raw);
}

/** RGBA8 (Uint8ClampedArray) -> fb */
export function fbFromRGBA(rgba, w, h) {
  const fb = new FB(w, h);
  const view = new Uint32Array(rgba.buffer, rgba.byteOffset, w * h);
  fb.data.set(view);
  return fb;
}

/** Réduction par moyenne de blocs (box filter) — bien plus doux que le plus proche. */
export function fbDownscale(src, dstW, dstH) {
  const dst = new FB(dstW, dstH);
  const sx = src.w / dstW, sy = src.h / dstH;
  for (let y = 0; y < dstH; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < dstW; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const c = src.data[yy * src.w + xx];
          r += c & 255; g += (c >> 8) & 255; b += (c >> 16) & 255; a += (c >>> 24) & 255;
          n++;
        }
      }
      dst.data[y * dstW + x] = rgba(Math.round(r / n), Math.round(g / n), Math.round(b / n), Math.round(a / n));
    }
  }
  return dst;
}

/**
 * Quantification par popularité puis écriture PNG indexée (1 octet/pixel) :
 * indispensable pour garder les illustrations légères.
 * Les couleurs officielles de la palette sont toujours conservées.
 */
export function fbToPNGIndexed(fb, official = [], maxColors = 256) {
  // 1. comptage par bucket 5 bits/canal
  const buckets = new Map();
  for (let i = 0; i < fb.data.length; i++) {
    const c = fb.data[i];
    if (!(c >>> 24)) continue;
    const key = ((c & 255) >> 3) << 10 | (((c >> 8) & 255) >> 3) << 5 | (((c >> 16) & 255) >> 3);
    let b = buckets.get(key);
    if (!b) { b = { n: 0, r: 0, g: 0, b: 0 }; buckets.set(key, b); }
    b.n++; b.r += c & 255; b.g += (c >> 8) & 255; b.b += (c >> 16) & 255;
  }
  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n);
  const palette = [];
  const addColour = (r, g, b) => {
    for (const p of palette) if (p[0] === r && p[1] === g && p[2] === b) return;
    palette.push([r, g, b]);
  };
  for (const p of official) addColour((p >> 16) & 255, (p >> 8) & 255, p & 255);
  for (const b of sorted) {
    if (palette.length >= maxColors) break;
    addColour(Math.round(b.r / b.n), Math.round(b.g / b.n), Math.round(b.b / b.n));
  }
  // 2. table de correspondance par bucket (calcul paresseux)
  const cache = new Map();
  const nearest = (r, g, b) => {
    const key = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3);
    let idx = cache.get(key);
    if (idx !== undefined) return idx;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const dr = r - palette[i][0], dg = g - palette[i][1], db = b - palette[i][2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bestD) { bestD = d; best = i; }
    }
    cache.set(key, best);
    return best;
  };
  const idx = new Uint8Array(fb.w * fb.h);
  let err = 0;
  for (let i = 0; i < fb.data.length; i++) {
    const c = fb.data[i];
    const r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
    const k = nearest(r, g, b);
    idx[i] = k;
    const p = palette[k];
    err += Math.abs(r - p[0]) + Math.abs(g - p[1]) + Math.abs(b - p[2]);
  }
  const plte = new Uint8Array(palette.length * 3);
  palette.forEach((p, i) => { plte[i * 3] = p[0]; plte[i * 3 + 1] = p[1]; plte[i * 3 + 2] = p[2]; });
  const raw = filterRows(idx, fb.w, fb.h, 1);
  const png = pngAssemble(fb.w, fb.h, 8, 3, raw, [pngChunk('PLTE', plte)]);
  png.palette = palette;
  png.meanError = err / (fb.w * fb.h * 3);
  return png;
}
