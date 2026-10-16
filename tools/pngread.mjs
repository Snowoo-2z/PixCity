// ─────────────────────────────────────────────────────────────
//  PixCity · lecteur PNG minimal (Node) — pour auditer les assets
//  d'illustration : taille, palette, luminosité, familles de
//  couleurs. Aucune dépendance : zlib natif + dé-filtrage PNG.
// ─────────────────────────────────────────────────────────────
import { inflateSync } from 'node:zlib';

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** @returns {{width:number,height:number,data:Uint8Array}} data = RGBA8 */
export function readPNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('pas un PNG');
  let pos = 8;
  let ihdr = null;
  const idat = [];
  let plte = null;
  let trns = null;

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const start = pos + 8;
    const chunk = buf.subarray(start, start + len);
    if (type === 'IHDR') {
      ihdr = {
        width: chunk.readUInt32BE(0),
        height: chunk.readUInt32BE(4),
        depth: chunk[8],
        colorType: chunk[9],
        compression: chunk[10],
        filter: chunk[11],
        interlace: chunk[12],
      };
    } else if (type === 'PLTE') plte = Buffer.from(chunk);
    else if (type === 'tRNS') trns = Buffer.from(chunk);
    else if (type === 'IDAT') idat.push(Buffer.from(chunk));
    else if (type === 'IEND') break;
    pos = start + len + 4;
  }

  if (!ihdr) throw new Error('IHDR manquant');
  if (ihdr.depth !== 8) throw new Error('profondeur non gérée : ' + ihdr.depth);
  if (ihdr.interlace) throw new Error('PNG entrelacé non géré');

  const raw = inflateSync(Buffer.concat(idat));
  const ch = CHANNELS[ihdr.colorType];
  if (!ch) throw new Error('type couleur non géré : ' + ihdr.colorType);
  const bpp = ch;
  const stride = ihdr.width * bpp;
  const out = new Uint8Array(ihdr.width * ihdr.height * 4);

  // dé-filtrage (filtres 0..4)
  const prev = new Uint8Array(stride);
  const line = new Uint8Array(stride);
  let rp = 0;
  for (let y = 0; y < ihdr.height; y++) {
    const ft = raw[rp++];
    for (let i = 0; i < stride; i++) line[i] = raw[rp + i];
    rp += stride;
    switch (ft) {
      case 0: break;
      case 1: for (let i = bpp; i < stride; i++) line[i] = (line[i] + line[i - bpp]) & 255; break;
      case 2: for (let i = 0; i < stride; i++) line[i] = (line[i] + prev[i]) & 255; break;
      case 3:
        for (let i = 0; i < stride; i++) {
          const a = i >= bpp ? line[i - bpp] : 0;
          line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255;
        }
        break;
      case 4:
        for (let i = 0; i < stride; i++) {
          const a = i >= bpp ? line[i - bpp] : 0;
          const b = prev[i];
          const c = i >= bpp ? prev[i - bpp] : 0;
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          line[i] = (line[i] + pr) & 255;
        }
        break;
      default: throw new Error('filtre inconnu ' + ft);
    }
    prev.set(line);

    for (let x = 0; x < ihdr.width; x++) {
      const o = (y * ihdr.width + x) * 4;
      const s = x * bpp;
      if (ihdr.colorType === 2) { out[o] = line[s]; out[o + 1] = line[s + 1]; out[o + 2] = line[s + 2]; out[o + 3] = 255; }
      else if (ihdr.colorType === 6) { out[o] = line[s]; out[o + 1] = line[s + 1]; out[o + 2] = line[s + 2]; out[o + 3] = line[s + 3]; }
      else if (ihdr.colorType === 0) { out[o] = out[o + 1] = out[o + 2] = line[s]; out[o + 3] = 255; }
      else if (ihdr.colorType === 4) { out[o] = out[o + 1] = out[o + 2] = line[s]; out[o + 3] = line[s + 1]; }
      else if (ihdr.colorType === 3 && plte) {
        const pi = line[s] * 3;
        out[o] = plte[pi]; out[o + 1] = plte[pi + 1]; out[o + 2] = plte[pi + 2];
        out[o + 3] = trns && line[s] < trns.length ? trns[line[s]] : 255;
      }
    }
  }
  return { width: ihdr.width, height: ihdr.height, data: out };
}

// ── Analyse ──────────────────────────────────────────────────

/** Palette officielle PixCity (familles + cible). */
export const PALETTE = [
  { name: 'nuit indigo', hex: 0x0a0e1c },
  { name: 'bleu nuit', hex: 0x1b2550 },
  { name: 'navy', hex: 0x232c4f },
  { name: 'orange crépuscule', hex: 0xff9a5c },
  { name: 'or', hex: 0xffd166 },
  { name: 'crème', hex: 0xfff3c4 },
  { name: 'fenêtre allumée', hex: 0xffe9a0 },
  { name: 'cyan néon', hex: 0x6be3ff },
  { name: 'magenta néon', hex: 0xff4dd2 },
  { name: 'violet', hex: 0xb06bff },
  { name: 'vert herbe', hex: 0x3f7a3c },
  { name: 'vert sombre', hex: 0x2f5d33 },
  { name: 'gris pierre', hex: 0x8a8f96 },
];

const WARM = [0xff9a5c, 0xffd166, 0xfff3c4, 0xffe9a0];
const COLD = [0x0a0e1c, 0x1b2550, 0x232c4f, 0x6be3ff];

const dist = (r1, g1, b1, r2, g2, b2) => Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);

function hexToRgb(h) { return [(h >> 16) & 255, (h >> 8) & 255, h & 255]; }

/**
 * Statistiques d'une image.
 * @param {number} tolerance distance RGB tolérée pour « appartenir » à la palette
 */
export function analyse(img, { stride = 3, tolerance = 62 } = {}) {
  const { width, height, data } = img;
  let n = 0, luminance = 0, inPalette = 0, warm = 0, cold = 0;
  const buckets = new Map();
  const perFamily = new Map();

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const o = (y * width + x) * 4;
      const r = data[o], g = data[o + 1], b = data[o + 2];
      n++;
      luminance += 0.299 * r + 0.587 * g + 0.114 * b;

      // quantification grossière pour repérer les dominantes
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      buckets.set(key, (buckets.get(key) || 0) + 1);

      let best = 1e9, bestName = null;
      for (const p of PALETTE) {
        const [pr, pg, pb] = hexToRgb(p.hex);
        const d = dist(r, g, b, pr, pg, pb);
        if (d < best) { best = d; bestName = p.name; }
      }
      if (best <= tolerance) {
        inPalette++;
        perFamily.set(bestName, (perFamily.get(bestName) || 0) + 1);
      }
      let bestWarm = 1e9, bestCold = 1e9;
      for (const c of WARM) { const [cr, cg, cb] = hexToRgb(c); bestWarm = Math.min(bestWarm, dist(r, g, b, cr, cg, cb)); }
      for (const c of COLD) { const [cr, cg, cb] = hexToRgb(c); bestCold = Math.min(bestCold, dist(r, g, b, cr, cg, cb)); }
      if (bestWarm <= tolerance) warm++;
      if (bestCold <= tolerance) cold++;
    }
  }

  const top = [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, c]) => ({
      hex: '#' + (((k >> 8) & 15) * 17).toString(16).padStart(2, '0') +
        ((((k >> 4) & 15) * 17)).toString(16).padStart(2, '0') +
        (((k & 15) * 17)).toString(16).padStart(2, '0'),
      ratio: c / n,
    }));

  return {
    sampled: n,
    paletteCoverage: inPalette / n,
    warmRatio: warm / n,
    coldRatio: cold / n,
    meanLuma: luminance / n,
    topColours: top,
    families: [...perFamily.entries()].sort((a, b) => b[1] - a[1]).map(([name, c]) => ({ name, ratio: c / n })),
  };
}
