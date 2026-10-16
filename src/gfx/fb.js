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

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(buf) {
  let a = 1, b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function deflateStore(buf) {
  const blocks = [];
  const MAX = 65535;
  for (let i = 0; i < buf.length; i += MAX) {
    const chunk = buf.subarray(i, Math.min(i + MAX, buf.length));
    const last = i + MAX >= buf.length ? 1 : 0;
    const head = new Uint8Array(5);
    head[0] = last;
    head[1] = chunk.length & 255;
    head[2] = (chunk.length >> 8) & 255;
    head[3] = ~chunk.length & 255;
    head[4] = (~chunk.length >> 8) & 255;
    blocks.push(head, chunk);
  }
  const total = blocks.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const b of blocks) { out.set(b, o); o += b.length; }
  return out;
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

/** fb -> Uint8Array PNG (RGBA, filtre 0) */
export function fbToPNG(fb) {
  const raw = new Uint8Array((fb.w * 4 + 1) * fb.h);
  const rgbaData = fbToRGBA(fb);
  for (let y = 0; y < fb.h; y++) {
    raw[y * (fb.w * 4 + 1)] = 0;
    raw.set(rgbaData.subarray(y * fb.w * 4, (y + 1) * fb.w * 4), y * (fb.w * 4 + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, fb.w);
  dv.setUint32(4, fb.h);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // flux zlib : en-tête 0x78 0x01 + données + Adler-32
  const deflated = deflateStore(raw);
  const adler = adler32(raw);
  const z = new Uint8Array(deflated.length + 6);
  z[0] = 0x78; z[1] = 0x01;
  z.set(deflated, 2);
  const zv = new DataView(z.buffer);
  zv.setUint32(2 + deflated.length, adler);
  const idat = z;
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
