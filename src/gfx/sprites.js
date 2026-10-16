// ─────────────────────────────────────────────────────────────
//  PixCity · dessin des bâtiments en pixel-art (procédural)
//  Chaque bâtiment est décrit par une recette ; le dessin se fait
//  dans un FB, puis est « cuit » en canvas (navigateur) ou en PNG
//  (Node) pour vérification.
// ─────────────────────────────────────────────────────────────
import { FB, hex, rgba, shade, mixColor } from './fb.js';
import { BAYER4 } from './surface.js';
import { mulberry32 } from '../core/format.js';

/** Recette graphique de chaque bâtiment. */
export const ART = {
  cabane: { style: 'house', w: 26, floors: 1, floorH: 7, floorGain: 0.5, wGain: 0.8, roof: 'gable', chimney: true },
  epicerie: { style: 'shop', w: 30, floors: 1, floorH: 9, floorGain: 0.85, wGain: 0.5, roof: 'awning', sign: true, awning: true },
  cafe: { style: 'shop', w: 32, floors: 1, floorH: 10, floorGain: 0.85, wGain: 0.5, roof: 'awning', sign: true, awning: true, chim: true },
  immeuble: { style: 'tower', w: 28, floors: 3, floorH: 8, floorGain: 1.1, wGain: 0.4, roof: 'flat', balconies: true },
  cinema: { style: 'hall', w: 40, floors: 1, floorH: 16, floorGain: 0.8, wGain: 0.7, roof: 'marquee', marquee: true },
  centre: { style: 'hall', w: 46, floors: 2, floorH: 11, floorGain: 0.9, wGain: 0.9, roof: 'glass', glass: true },
  hopital: { style: 'hall', w: 36, floors: 2, floorH: 11, floorGain: 0.9, wGain: 0.6, roof: 'flat', cross: true },
  bureaux: { style: 'tower', w: 34, floors: 5, floorH: 9, floorGain: 1.1, wGain: 0.6, roof: 'flatGlass', glass: true, antenna: true },
  gratteciel: { style: 'tower', w: 38, floors: 8, floorH: 9, floorGain: 1.5, wGain: 0.7, roof: 'spire', glass: true, antenna: true },
  parc: { style: 'wheel', w: 62, floors: 0, floorH: 0, floorGain: 0, wGain: 1.2, roof: 'none' },
  gare: { style: 'rocket', w: 50, floors: 1, floorH: 13, floorGain: 0.4, wGain: 0.6, roof: 'dome' },
  quantique: { style: 'quantum', w: 46, floors: 4, floorH: 9, floorGain: 1, wGain: 0.6, roof: 'ring' },
};

const SHADOW = rgba(0, 0, 0, 70);

export function spriteSize(def, tier, neon = false) {
  const a = ART[def.id];
  const floors = Math.max(0, Math.round(a.floors + tier * a.floorGain));
  const w = Math.round(a.w + Math.floor((tier * a.wGain) / 2));
  let h;
  switch (a.style) {
    case 'wheel': h = 46 + tier * 4; break;
    case 'rocket': h = 34 + floors * a.floorH + 22 + tier * 1; break;
    case 'quantum': h = floors * a.floorH + 16 + tier * 3; break;
    default: h = floors * a.floorH + roofHeight(a, tier) + 6;
  }
  return { w: w + 8, h: h + 8 }; // marge pour ombre et débordements
}

function roofHeight(a, tier) {
  switch (a.roof) {
    case 'gable': return 8;
    case 'awning': return 5 + (tier > 2 ? 1 : 0);
    case 'marquee': return 9;
    case 'glass': return 6;
    case 'flatGlass': return 5;
    case 'spire': return 12;
    case 'dome': return 7;
    case 'flat': return 4;
    case 'ring': return 8;
    default: return 4;
  }
}

/** Volets / fenêtres allumées selon la variante d'animation. */
function lit(rnd, variant, x, y) {
  const n = (x * 7 + y * 13 + variant * 31) % 11;
  return n < 5 + variant;
}

/**
 * Dessine un bâtiment dans un FB.
 * Le bâtiment repose sur la ligne groundY, centré horizontalement.
 */
export function drawBuilding(def, tier, variant = 0, neon = false) {
  const a = ART[def.id];
  const size = spriteSize(def, tier, neon);
  const fb = new FB(size.w, size.h);
  const pal = neon ? neonPal(def.pal) : def.pal;
  const ctx = {
    fb, w: size.w, h: size.h, a, tier, variant, pal, neon,
    groundY: size.h - 3,
    rnd: mulberry32(hash(def.id) + tier * 977 + 1),
  };
  ctx.pal = {
    wall: hex(pal.wall), dark: hex(pal.dark), light: hex(pal.light),
    roof: hex(pal.roof), win: hex(pal.win), accent: hex(pal.accent),
  };
  switch (a.style) {
    case 'house': drawHouse(ctx); break;
    case 'shop': drawShop(ctx); break;
    case 'tower': drawTower(ctx); break;
    case 'hall': drawHall(ctx); break;
    case 'wheel': drawCarnival(ctx); break;
    case 'rocket': drawRocket(ctx); break;
    case 'quantum': drawQuantum(ctx); break;
    default: drawHouse(ctx);
  }
  outlineSilhouette(fb);
  if (neon) applyNeon(fb, size);
  return fb;
}

/**
 * Ajoute un contour sombre d'un pixel autour de la silhouette.
 * C'est ce qui fait « claquer » un sprite pixel-art sur n'importe quel
 * fond (et qui manquait cruellement aux bâtiments).
 */
export function outlineSilhouette(fb, colour = 0x0a0e1c) {
  const src = fb.data.slice();
  const c = hex(colour);
  const solid = (i) => (src[i] >>> 24) >= 200;
  for (let y = 0; y < fb.h; y++) {
    const row = y * fb.w;
    for (let x = 0; x < fb.w; x++) {
      const i = row + x;
      if (solid(i)) continue;
      if ((y > 0 && solid(i - fb.w)) || (y < fb.h - 1 && solid(i + fb.w)) ||
          (x > 0 && solid(i - 1)) || (x < fb.w - 1 && solid(i + 1))) {
        fb.data[i] = c;
      }
    }
  }
  return fb;
}

/**
 * Halo tramé (lampe, fenêtre, enseigne, phare…). Rendu une seule fois
 * puis simplement étiré : un halo doux coûterait trop cher par image.
 */
export function drawGlow(radius, colour, power = 2.1) {
  const d = radius * 2 + 1;
  const fb = new FB(d, d);
  const r = (colour >> 16) & 255, g = (colour >> 8) & 255, b = colour & 255;
  for (let y = 0; y < d; y++) {
    for (let x = 0; x < d; x++) {
      const dx = x - radius, dy = y - radius;
      const dist = Math.sqrt(dx * dx + dy * dy) / radius;
      if (dist > 1) continue;
      const a = Math.pow(1 - dist, power) * 0.85;
      const th = (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
      if (a <= th) continue;
      fb.data[y * d + x] = rgba(r, g, b, Math.round(Math.min(1, a) * 255));
    }
  }
  return fb;
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function neonPal(pal) {
  return {
    wall: mixInt(pal.wall, 0x2a1b4d, 0.45),
    dark: mixInt(pal.dark, 0x120a2a, 0.55),
    light: mixInt(pal.light, 0x6a4bd0, 0.35),
    roof: mixInt(pal.roof, 0xff2fd0, 0.35),
    win: mixInt(pal.win, 0x22e0ff, 0.5),
    accent: mixInt(pal.accent, 0xff2fd0, 0.4),
  };
}

function mixInt(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t), g = Math.round(ag + (bg - ag) * t), bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/** Liseré néon (bord gauche chaud / bord droit froid). */
function applyNeon(fb, size) {
  for (let y = 0; y < size.h; y++) {
    const t = y / size.h;
    const rim = mixColor(0xff2fd0, 0x22e0ff, t);
    for (let x = 0; x < size.w; x++) {
      const c = fb.data[y * size.w + x];
      if (!(c >>> 24)) continue;
      const left = x === 0 ? 1 : 0;
      fb.data[y * size.w + x] = mixColor(c, rim, left ? 0.35 : 0.12);
    }
  }
}

// ── Aides de dessin ──────────────────────────────────────────

function shadow(ctx, w) {
  const { fb, groundY } = ctx;
  fb.rect(w / -2 + 2, groundY + 1, w - 4, 1, SHADOW);
  fb.rect(w / -2 + 4, groundY + 2, w - 8, 1, rgba(0, 0, 0, 40));
}

/** Grille de fenêtres. */
function windows(ctx, x0, y0, cols, rows, cw, ch, gapx, gapy, variant, frame = true) {
  const { fb, pal } = ctx;
  const darkGlass = mixColor(pal.dark, 0x0a1020, 0.55);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = x0 + c * (cw + gapx);
      const y = y0 + r * (ch + gapy);
      const on = lit(ctx.rnd, variant, x, y);
      if (frame) fb.rect(x, y, cw, ch, pal.dark);
      const inner = frame ? { x: x + 1, y: y + 1, w: cw - 2, h: ch - 2 } : { x, y, w: cw, h: ch };
      if (inner.w <= 0 || inner.h <= 0) continue;
      if (on) {
        fb.rect(inner.x, inner.y, inner.w, inner.h, pal.win);
        fb.rect(inner.x, inner.y, inner.w, 1, shade(pal.win, 0.14));
        if (inner.h > 3) fb.rect(inner.x, inner.y + inner.h - 1, inner.w, 1, shade(pal.win, -0.28));
        // silhouette derrière la vitre (donne de la profondeur)
        if (inner.w > 5 && inner.h > 4) {
          const sx = inner.x + 1 + Math.floor(ctx.rnd() * (inner.w - 3));
          fb.rect(sx, inner.y + inner.h - 3, 2, 2, shade(pal.win, -0.45));
          fb.rect(sx + 1, inner.y + inner.h - 4, 1, 2, shade(pal.win, -0.45));
        }
      } else {
        fb.rect(inner.x, inner.y, inner.w, inner.h, darkGlass);
        fb.rect(inner.x, inner.y, inner.w, 1, shade(darkGlass, 0.22));
        // reflet en diagonale
        if (inner.w > 4 && inner.h > 3) {
          fb.rect(inner.x + 1, inner.y + 1, 1, 1, shade(darkGlass, 0.42));
          fb.rect(inner.x + 2, inner.y + 1, 1, 1, shade(darkGlass, 0.3));
        }
      }
      // stores / rideaux sur certaines fenêtres
      const style = Math.floor(ctx.rnd() * 7);
      if (style === 0 && inner.h > 3) {
        fb.rect(inner.x, inner.y + 1, inner.w, 1, on ? shade(pal.win, -0.35) : shade(darkGlass, 0.3));
      } else if (style === 1) {
        fb.vline(inner.x, inner.y + 1, Math.max(1, inner.h - 2), on ? shade(pal.win, -0.4) : shade(darkGlass, 0.25));
      } else if (style === 2 && cw >= 5 && ch >= 5) {
        // climatiseur sous la fenêtre
        fb.rect(x + Math.floor(cw / 2) - 2, y + ch, 4, 3, mixColor(pal.light, 0x8a8f96, 0.6));
        fb.rect(x + Math.floor(cw / 2) - 2, y + ch + 2, 4, 1, shade(pal.dark, -0.1));
        fb.px(x + Math.floor(cw / 2) - 1, y + ch + 1, shade(pal.dark, 0.2));
      }
    }
  }
}

/** Corps de bâtiment : mur + contour + ombrage. */
function body(ctx, x, y, w, h) {
  const { fb, pal } = ctx;
  fb.rect(x, y, w, h, pal.wall);
  fb.rect(x, y, w, 1, shade(pal.wall, 0.1));
  fb.rect(x, y + h - 1, w, 1, pal.dark);
  fb.vline(x, y, h, pal.dark);
  fb.vline(x + w - 1, y, h, pal.dark);
  fb.hline(x + 1, y + 1, w - 2, pal.light);
  // ombre côté droit
  fb.vline(x + w - 3, y + 2, h - 3, shade(pal.wall, -0.08));
  // occlusion ambiante en pied de façade : pose le bâtiment au sol
  if (h > 6) {
    fb.hline(x + 1, y + h - 2, w - 2, shade(pal.wall, -0.16));
    if (h > 10) fb.hline(x + 1, y + h - 3, w - 2, shade(pal.wall, -0.08));
  }
}

/** Détails de toit : ça remplit le vide et raconte une ville vivante. */
function roofDetails(ctx, bx, by, w, pal, opts = {}) {
  const { fb, rnd, tier } = ctx;
  const r = Math.floor(rnd() * 4);
  const light = mixColor(pal.light, 0x8a8f96, 0.45);
  const dark = shade(pal.dark, 0.1);

  // petits blocs techniques (clim, gaines)
  const n = 1 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) {
    const bw = 3 + Math.floor(rnd() * 3);
    const bx2 = bx + 2 + Math.floor(rnd() * Math.max(1, w - bw - 4));
    const bh = 2 + Math.floor(rnd() * 3);
    fb.rect(bx2, by - bh, bw, bh, light);
    fb.hline(bx2, by - bh, bw, shade(light, 0.18));
    fb.hline(bx2, by - 1, bw, shade(pal.wall, -0.28));
    if (bw >= 4) fb.rect(bx2 + 1, by - bh + 1, bw - 2, 1, shade(pal.dark, -0.1));
  }
  // évents / cheminées de ventilation
  for (let i = 0; i < 2; i++) {
    const vx = bx + 2 + Math.floor(rnd() * Math.max(1, w - 4));
    fb.rect(vx, by - 3, 2, 3, shade(pal.dark, 0.2));
    fb.px(vx, by - 4, shade(pal.dark, 0.4));
  }
  // château d'eau sur les toits plats des grandes tours
  if (opts.water && tier >= 2 && w > 20) {
    const wx = bx + w - 10;
    fb.rect(wx + 1, by - 4, 1, 4, dark);
    fb.rect(wx + 5, by - 4, 1, 4, dark);
    fb.rect(wx, by - 9, 7, 5, mixColor(pal.wall, 0x9a7a52, 0.5));
    fb.hline(wx, by - 9, 7, mixColor(pal.wall, 0xd8ab74, 0.5));
    fb.hline(wx, by - 5, 7, shade(pal.dark, -0.1));
    fb.rect(wx + 2, by - 10, 3, 1, shade(pal.dark, 0.3));
  }
  // jardin de toit sur les bâtiments paisibles
  if (opts.garden && tier >= 3 && w > 18) {
    const gx = bx + 3;
    fb.rect(gx, by - 3, 10, 2, hex(0x3f7a3c));
    fb.hline(gx, by - 3, 10, hex(0x59b95c));
    for (let i = 0; i < 3; i++) {
      const tx = gx + 1 + i * 3;
      fb.rect(tx, by - 6, 1, 3, hex(0x6b4a2a));
      fb.disk(tx, by - 7, 1, i % 2 ? hex(0x2f7a35) : hex(0x3f9c45));
    }
  }
  // feu de balisage clignotant (animé par variante)
  if (opts.beacon) {
    const lx = bx + Math.floor(w / 2);
    const on = (ctx.variant + 1) % 2 === 0;
    fb.rect(lx, by - 2, 1, 1, on ? hex(0xff4d6d) : shade(pal.dark, 0.3));
  }
}

function door(ctx, x, groundY, w, h) {
  const { fb, pal } = ctx;
  fb.rect(x, groundY - h, w, h, shade(pal.dark, -0.15));
  fb.outline(x, groundY - h, w, h, pal.dark);
  fb.rect(x + w - 2, groundY - Math.floor(h / 2), 1, 1, pal.win);
  fb.rect(x, groundY - h, 1, h, shade(pal.wall, 0.05));
}

// ── Styles ───────────────────────────────────────────────────

function drawHouse(ctx) {
  const { fb, pal, a, tier, groundY, variant } = ctx;
  const floors = Math.max(1, Math.round(a.floors + tier * a.floorGain));
  const w = Math.round(a.w + Math.floor((tier * a.wGain) / 2));
  const bodyH = floors * a.floorH;
  const cx = Math.round(ctx.w / 2);
  const bx = cx - Math.floor(w / 2);
  const by = groundY - bodyH;

  shadow(ctx, w + 4);
  body(ctx, bx, by, w, bodyH);

  // Pierre de fondation
  fb.rect(bx, groundY - 1, w, 1, shade(pal.dark, -0.2));

  // Fenêtres
  const cols = w > 30 ? 3 : 2;
  const gapx = Math.max(2, Math.floor((w - cols * 5 - 4) / Math.max(1, cols - 1)));
  windows(ctx, bx + 3, by + 3, cols, floors, 4, Math.min(5, a.floorH - 3), Math.max(2, gapx - 4), 2, variant);

  // Porte
  door(ctx, cx - 2, groundY, 5, 8);

  // ── Toit ────────────────────────────────────────────────
  const roofH = roofHeight(a, tier);
  const over = 3;
  if (a.roof === 'gable') {
    const base = w + over * 2;
    const halfBase = Math.floor(base / 2);
    // cheminée d'abord : le toit recouvre sa base
    if (a.chimney) {
      const chx = bx + w - 8, chTop = by - roofH - 3;
      fb.rect(chx, chTop, 3, 6, shade(pal.roof, -0.42));
      fb.vline(chx, chTop, 6, shade(pal.roof, -0.28));
      fb.hline(chx - 1, chTop, 5, shade(pal.roof, -0.55));
      fb.hline(chx - 1, chTop - 1, 5, shade(pal.roof, -0.3));
      fb.px(chx + 1, chTop - 3, rgba(196, 206, 226, 90));
      fb.px(chx, chTop - 5, rgba(196, 206, 226, 55));
    }
    // versants : gauche éclairé, droit à l'ombre
    for (let i = 0; i < roofH; i++) {
      const half = Math.max(2, Math.round(halfBase * ((i + 1) / roofH)));
      const y = by - roofH + i;
      fb.rect(cx - half, y, half, 1, pal.roof);
      fb.rect(cx, y, half, 1, shade(pal.roof, -0.14));
      if (i % 2) fb.hline(cx - half, y, half, shade(pal.roof, 0.1));
    }
    // arête faîtière
    const topHalf = Math.max(2, Math.round(halfBase / roofH));
    fb.hline(cx - topHalf, by - roofH - 1, topHalf * 2, shade(pal.roof, 0.28));
    fb.px(cx - topHalf - 1, by - roofH - 1, shade(pal.roof, 0.05));
    fb.px(cx + topHalf, by - roofH - 1, shade(pal.roof, 0.05));
    // égout et gouttière
    fb.hline(cx - halfBase, by - 1, base, shade(pal.roof, 0.1));
    fb.hline(cx - halfBase, by, halfBase, shade(pal.roof, -0.35));
    fb.hline(cx, by, halfBase, shade(pal.roof, -0.45));
  } else if (a.roof === 'awning') {
    fb.rect(bx - over, by - 2, w + over * 2, 2, pal.roof);
    fb.hline(bx - over, by - 1, w + over * 2, shade(pal.roof, -0.3));
  }
  // Plante / jardin
  if (tier >= 1) {
    fb.rect(bx - 3, groundY - 2, 3, 2, hex(0x4f8f3a));
    fb.rect(bx + w, groundY - 3, 3, 3, hex(0x3d7a2e));
    fb.px(bx + w + 1, groundY - 4, hex(0xd8f07a));
  }
  // lampe murale au-dessus de la porte (s'allume la nuit via le halo)
  fb.rect(cx - 3, groundY - 11, 1, 1, pal.dark);
  fb.px(cx - 4, groundY - 10, pal.win);
  fb.px(cx - 2, groundY - 10, pal.win);
  // oiseau posé sur le versant gauche
  if (tier >= 2) {
    fb.px(cx - 6, by - roofH - 1, shade(pal.dark, -0.2));
    fb.rect(cx - 8, by - roofH, 3, 2, shade(pal.dark, -0.35));
    fb.px(cx - 5, by - roofH - 1, shade(pal.dark, 0.05));
  }
}

function drawShop(ctx) {
  const { fb, pal, a, tier, groundY, variant } = ctx;
  const floors = Math.max(1, Math.round(a.floors + tier * a.floorGain));
  const w = Math.round(a.w + Math.floor((tier * a.wGain) / 2));
  const bodyH = floors * a.floorH;
  const cx = Math.round(ctx.w / 2);
  const bx = cx - Math.floor(w / 2);
  const by = groundY - bodyH;

  shadow(ctx, w + 4);
  body(ctx, bx, by, w, bodyH);

  // ── rez-de-chaussée : grande vitrine ─────────────────────
  const vitH = Math.min(a.floorH - 1, 8 + Math.min(tier, 3));
  const vY = groundY - vitH - 1;
  const vX = bx + 2, vW = w - 4;
  // encadrement + verre chaud
  fb.rect(vX, vY, vW, vitH, mixColor(pal.win, 0x2a1a08, 0.5));
  fb.rect(vX + 1, vY + 1, vW - 2, vitH - 2, mixColor(pal.win, 0xc08a30, 0.35));
  fb.rect(vX + 1, vY + 1, vW - 2, 1, shade(pal.win, 0.2));
  // meneaux de la vitrine
  const panes = Math.max(2, Math.floor(w / 11));
  for (let i = 1; i < panes; i++) {
    fb.vline(vX + Math.round((vW * i) / panes), vY + 1, vitH - 2, pal.dark);
  }
  fb.outline(vX - 1, vY - 1, vW + 2, vitH + 2, pal.dark);
  // rayonnages et produits à l'intérieur
  const shelfY = groundY - 3;
  fb.rect(vX + 2, shelfY, vW - 4, 1, pal.dark);
  for (let i = 0; i < Math.max(2, Math.floor((vW - 6) / 6)); i++) {
    const px = vX + 3 + i * 6;
    const kinds = [pal.accent, shade(pal.win, -0.3), hex(0xd0504c), hex(0x6bc47a)];
    fb.rect(px, shelfY - 3, 3, 3, kinds[i % kinds.length]);
    fb.px(px + 1, shelfY - 4, shade(kinds[i % kinds.length], 0.25));
  }
  // caisses et parking de livraison devant
  fb.rect(vX + 1, groundY - 2, 4, 2, hex(0x9a6b3a));
  fb.rect(vX + w - 6, groundY - 3, 4, 3, hex(0x8a5a30));
  fb.px(vX + w - 5, groundY - 4, hex(0xd8c88a));

  // ── auvent rayé, posé JUSTE au-dessus de la vitrine ──────
  const awH = 4 + (tier >= 3 ? 1 : 0);
  const awY = vY - awH - 1;
  const awW = w + 4, awX = bx - 2;
  for (let i = 0; i < awW; i++) {
    const c = (Math.floor(i / 3) % 2) ? pal.accent : hex(0xf7f2e0);
    fb.rect(awX + i, awY, 1, awH, c);
  }
  fb.hline(awX, awY, awW, shade(pal.accent, -0.25));
  fb.hline(awX, awY + awH - 1, awW, shade(pal.dark, -0.05));
  // festons qui pendent sous l'auvent
  for (let i = 0; i < awW; i += 3) {
    const c = (Math.floor(i / 3) % 2) ? shade(pal.accent, -0.15) : hex(0xdcd6c2);
    fb.rect(awX + i, awY + awH, 2, 1, c);
    fb.px(awX + i, awY + awH + 1, c);
  }

  // ── enseigne lumineuse au-dessus de l'auvent ─────────────
  const sgH = 5;
  const sgY = awY - sgH - 1;
  fb.rect(bx + 1, sgY, w - 2, sgH, shade(pal.dark, 0.12));
  fb.outline(bx + 1, sgY, w - 2, sgH, pal.dark);
  const litC = mixColor(pal.win, 0xffffff, 0.2);
  for (let i = 0; i < Math.floor((w - 6) / 3); i++) {
    const on = (variant + i) % 3 !== 2;
    fb.rect(bx + 3 + i * 3, sgY + 1, 2, sgH - 2, on ? litC : shade(pal.dark, 0.3));
  }
  fb.hline(bx + 1, sgY, w - 2, shade(pal.win, 0.15));

  // ── étages supérieurs ───────────────────────────────────
  if (floors > 1) {
    const upY = by + 2;
    const upH = sgY - by - 3;
    const cols = Math.max(2, Math.floor((w - 6) / 9));
    const cw = Math.max(4, Math.floor((w - 6 - (cols - 1) * 3) / cols));
    windows(ctx, bx + 3, upY, cols, 1, cw, Math.max(5, Math.min(upH - 1, a.floorH - 4)), 3, 0, variant);
    // bandeau de séparation
    fb.hline(bx + 1, sgY - 2, w - 2, shade(pal.wall, -0.12));
  }

  // ── toit ────────────────────────────────────────────────
  fb.rect(bx - 2, by - 5, w + 4, 4, pal.roof);
  fb.hline(bx - 2, by - 5, w + 4, shade(pal.roof, 0.22));
  fb.hline(bx - 2, by - 2, w + 4, shade(pal.roof, -0.3));
  roofDetails(ctx, bx + 1, by - 5, w - 2, pal, { garden: tier >= 4 });
  if (a.chim) {
    fb.rect(bx + w - 8, by - 10, 3, 6, shade(pal.dark, 0.12));
    fb.hline(bx + w - 8, by - 10, 3, shade(pal.dark, 0.3));
  }
  if (tier >= 3) {
    // bacs à fleurs suspendus sous les fenêtres du haut
    for (let i = 0; i < 2; i++) {
      const fx = bx + 4 + i * Math.max(8, w - 12);
      fb.rect(fx, by + 1, 5, 2, hex(0x9a6b3a));
      fb.px(fx + 1, by, hex(0xff4d6d));
      fb.px(fx + 3, by, hex(0xffd166));
    }
  }
}

function drawTower(ctx) {
  const { fb, pal, a, tier, groundY, variant } = ctx;
  const floors = Math.max(1, Math.round(a.floors + tier * a.floorGain));
  const w = Math.round(a.w + Math.floor((tier * a.wGain) / 2));
  const bodyH = floors * a.floorH;
  const cx = Math.round(ctx.w / 2);
  const bx = cx - Math.floor(w / 2);
  const by = groundY - bodyH;

  shadow(ctx, w + 6);
  body(ctx, bx, by, w, bodyH);

  // bandes horizontales
  for (let f = 0; f < floors; f++) {
    const fy = by + f * a.floorH;
    fb.hline(bx + 1, fy + a.floorH - 1, w - 2, shade(pal.wall, -0.12));
  }

  // fenêtres : 2 ou 3 colonnes
  const cols = Math.max(2, Math.floor(w / 10));
  const cw = Math.max(3, Math.floor((w - 8) / cols) - 2);
  for (let f = 0; f < floors; f++) {
    const fy = by + f * a.floorH + 2;
    for (let c = 0; c < cols; c++) {
      const fx = bx + 4 + c * Math.floor((w - 8) / cols);
      const on = lit(ctx.rnd, variant, fx, fy);
      const winH = Math.min(a.floorH - 4, 5);
      if (a.glass) {
        fb.rect(fx, fy, cw, winH, on ? pal.win : mixColor(pal.dark, 0x0c1830, 0.4));
        fb.hline(fx, fy, cw, shade(pal.win, 0.25));
        fb.vline(fx, fy, winH, shade(pal.dark, 0.3));
      } else {
        windows(ctx, fx, fy, 1, 1, cw, winH, 0, 0, variant);
      }
    }
  }

  // Balcons
  if (a.balconies) {
    for (let f = 1; f < floors; f += 2) {
      const fy = by + f * a.floorH;
      fb.rect(bx - 2, fy - 1, w + 4, 2, shade(pal.dark, 0.05));
      fb.hline(bx - 2, fy - 2, w + 4, pal.win);
    }
  }

  // Rez-de-chaussée : entrée
  const entH = Math.min(9, a.floorH);
  fb.rect(cx - 5, groundY - entH, 10, entH, shade(pal.dark, -0.1));
  fb.outline(cx - 5, groundY - entH, 10, entH, pal.dark);
  fb.rect(cx - 3, groundY - entH + 2, 6, 3, pal.win);
  fb.rect(cx + 3, groundY - entH / 2, 1, 1, pal.accent);

  // Toit
  const rh = roofHeight(a, tier);
  if (a.roof === 'spire') {
    fb.rect(bx - 2, by - 3, w + 4, 4, pal.roof);
    fb.hline(bx - 2, by - 3, w + 4, shade(pal.roof, 0.25));
    const steps = Math.floor(rh / 2);
    for (let i = 0; i <= steps; i++) {
      const sw = Math.max(2, w - i * Math.floor(w / (steps + 1.6)));
      fb.rect(cx - Math.floor(sw / 2), by - 3 - i * 2 - 2, sw, 2, i === 0 ? pal.roof : mixColor(pal.roof, pal.light, i / steps * 0.5));
    }
    if (tier >= 3) {
      fb.vline(cx, by - 3 - steps * 2 - 8, 6, pal.win);
      fb.px(cx, by - 3 - steps * 2 - 9, hex(0xff4d6d));
    }
  } else if (a.roof === 'flatGlass') {
    fb.rect(bx - 1, by - 3, w + 2, 4, mixColor(pal.light, pal.dark, 0.35));
    fb.hline(bx - 1, by - 3, w + 2, shade(pal.win, 0.2));
    fb.hline(bx, by - 1, w, shade(pal.dark, 0.1));
  } else {
    fb.rect(bx - 1, by - 2, w + 2, 3, pal.dark);
    fb.hline(bx - 1, by - 2, w + 2, shade(pal.dark, 0.35));
  }
  if (a.antenna) {
    const ax = bx + 3;
    fb.vline(ax, by - rh - 7, 6, shade(pal.dark, 0.25));
    fb.px(ax, by - rh - 8, variant === 1 ? hex(0xff4d6d) : pal.accent);
    const bx2 = bx + w - 4;
    fb.vline(bx2, by - rh - 4, 3, shade(pal.dark, 0.25));
    fb.px(bx2, by - rh - 5, variant === 0 ? hex(0xff4d6d) : pal.accent);
  }
  roofDetails(ctx, bx + 1, by - 3, w - 2, pal, { water: true, beacon: true });
  // entrée éclairée + auvent de porte
  fb.rect(cx - 7, groundY - entH - 2, 14, 1, shade(pal.dark, 0.25));
  fb.px(cx - 7, groundY - entH - 1, pal.win);
  if (tier >= 2) {
    // quelques voitures garées le long de la tour
    for (let i = 0; i < 2; i++) {
      const px2 = bx - 6 + i * (w + 8);
      fb.rect(px2, groundY - 4, 7, 3, i % 2 ? hex(0x3aa7a0) : hex(0xd0504c));
      fb.rect(px2 + 1, groundY - 6, 4, 2, hex(0x9fe8ff));
      fb.rect(px2, groundY - 1, 2, 1, hex(0x1a1d22));
      fb.rect(px2 + 5, groundY - 1, 2, 1, hex(0x1a1d22));
    }
  }
}

function drawHall(ctx) {
  const { fb, pal, a, tier, groundY, variant } = ctx;
  const floors = Math.max(1, Math.round(a.floors + tier * a.floorGain));
  const w = Math.round(a.w + Math.floor((tier * a.wGain) / 2));
  const bodyH = floors * a.floorH;
  const cx = Math.round(ctx.w / 2);
  const bx = cx - Math.floor(w / 2);
  const by = groundY - bodyH;

  shadow(ctx, w + 6);
  body(ctx, bx, by, w, bodyH);

  if (a.glass) {
    // Façade vitrée : grandes baies
    const bays = Math.max(3, Math.floor(w / 9));
    for (let i = 0; i < bays; i++) {
      const gx = bx + 3 + i * Math.floor((w - 6) / bays);
      const gw = Math.floor((w - 6) / bays) - 2;
      fb.rect(gx, by + 3, gw, bodyH - 6, mixColor(pal.win, 0x0d1a30, 0.45));
      fb.hline(gx, by + 3, gw, shade(pal.win, 0.3));
      fb.vline(gx, by + 3, bodyH - 6, pal.dark);
      if (lit(ctx.rnd, variant, gx, by)) fb.rect(gx + 1, by + 4, gw - 2, 2, pal.win);
      if (i < bays - 1) fb.rect(gx + gw, by + 3, 2, bodyH - 6, pal.dark);
    }
  } else {
    windows(ctx, bx + 4, by + 4, Math.max(3, Math.floor(w / 11)), floors, 5, Math.min(7, a.floorH - 6), 5, 3, variant);
  }

  // Entrée
  const entH = Math.min(11, a.floorH - 2);
  fb.rect(cx - 6, groundY - entH, 12, entH, shade(pal.dark, -0.2));
  fb.outline(cx - 6, groundY - entH, 12, entH, pal.dark);
  fb.rect(cx - 4, groundY - entH + 2, 8, 4, pal.win);
  fb.vline(cx, groundY - entH + 2, 4, pal.dark);
  // colonnes
  fb.rect(cx - 9, groundY - entH, 2, entH, pal.light);
  fb.rect(cx + 7, groundY - entH, 2, entH, pal.light);

  // Croix d'hôpital
  if (a.cross) {
    const cxx = cx, cyy = by + 5;
    fb.rect(cxx - 4, cyy - 2, 9, 5, hex(0xffffff));
    fb.rect(cxx - 2, cyy - 4, 5, 9, hex(0xffffff));
    fb.rect(cxx - 2, cyy - 2, 5, 5, pal.accent);
    fb.rect(cxx - 4, cyy - 2, 9, 5, hex(0xffffff));
    fb.rect(cxx - 3, cyy - 3, 7, 7, pal.accent);
    fb.rect(cxx - 2, cyy - 2, 5, 5, hex(0xffffff));
  }

  // Marquee de cinéma
  if (a.marquee) {
    fb.rect(bx + 2, by + 2, w - 4, 3, shade(pal.dark, 0.2));
    for (let i = 0; i < w - 6; i++) {
      const on = lit(ctx.rnd, variant, bx + 3 + i, by + 2);
      fb.px(bx + 3 + i, by + 3, on ? pal.win : pal.accent);
    }
    fb.hline(bx + 2, by + 1, w - 4, shade(pal.accent, 0.3));
  }

  // Toit
  const rh = roofHeight(a, tier);
  if (a.roof === 'marquee') {
    fb.rect(bx - 2, by - 5, w + 4, 6, pal.roof);
    fb.hline(bx - 2, by - 5, w + 4, shade(pal.roof, 0.3));
    // lettres
    for (let i = 0; i < Math.floor((w - 6) / 4); i++) {
      const on = lit(ctx.rnd, variant, bx + i * 4, by - 4);
      fb.rect(bx + 4 + i * 4, by - 4, 2, 3, on ? hex(0xffe9a0) : shade(pal.roof, -0.3));
    }
  } else if (a.roof === 'glass') {
    fb.rect(bx - 2, by - 4, w + 4, 5, mixColor(pal.light, pal.dark, 0.25));
    for (let i = 0; i < w + 4; i += 4) fb.vline(bx - 2 + i, by - 4, 5, shade(pal.dark, 0.15));
    fb.hline(bx - 2, by - 4, w + 4, shade(pal.win, 0.25));
  } else {
    fb.rect(bx - 2, by - 3, w + 4, 4, shade(pal.dark, 0.18));
    fb.hline(bx - 2, by - 3, w + 4, shade(pal.light, -0.05));
    if (tier >= 3) {
      fb.rect(bx + 6, by - 7, 8, 4, pal.accent);
      fb.rect(bx + w - 14, by - 7, 8, 4, pal.accent);
    }
    roofDetails(ctx, bx + 2, by - 3, w - 4, pal, { garden: true, beacon: true });
  }
  // éclairage public devant le bâtiment
  for (let i = 0; i < Math.max(1, Math.floor(w / 22)); i++) {
    const lx2 = bx + 6 + i * 22;
    fb.vline(lx2, groundY - 12, 11, shade(pal.dark, 0.15));
    fb.rect(lx2 - 1, groundY - 15, 4, 3, shade(pal.dark, 0.05));
    fb.rect(lx2, groundY - 14, 2, 1, pal.win);
  }
}

function drawCarnival(ctx) {
  const { fb, pal, tier, groundY, variant } = ctx;
  const w = Math.round(ART.parc.w + Math.floor((tier * ART.parc.wGain) / 2));
  const cx = Math.round(ctx.w / 2);
  const R = 13 + Math.min(tier, 4) * 2;
  const wheelCy = groundY - 12 - R;
  shadow(ctx, w + 6);

  // Sol du parc
  fb.rect(cx - Math.floor(w / 2), groundY - 2, w, 2, mixColor(pal.wall, 0x000000, 0.25));
  fb.hline(cx - Math.floor(w / 2), groundY - 2, w, pal.light);

  // Grande roue
  const rot = variant * 0.26;
  fb.ring(cx, wheelCy, R, pal.accent, 1);
  const spokes = 8;
  for (let i = 0; i < spokes; i++) {
    const a = rot + (i * Math.PI * 2) / spokes;
    const ex = cx + Math.round(Math.cos(a) * R);
    const ey = wheelCy + Math.round(Math.sin(a) * R);
    fb.line(cx, wheelCy, ex, ey, shade(pal.light, -0.05));
    const cab = i % 2 ? pal.accent : hex(0xffd166);
    fb.rect(ex - 1, ey, 3, 3, cab);
    fb.px(ex, ey - 1, shade(cab, 0.25));
  }
  fb.disk(cx, wheelCy, 2, hex(0xf7f2e0));
  // supports
  fb.line(cx - 1, wheelCy, cx - 7, groundY - 1, pal.dark);
  fb.line(cx + 1, wheelCy, cx + 7, groundY - 1, pal.dark);
  fb.rect(cx - 9, groundY - 2, 19, 2, pal.dark);

  // Chapiteau (tente) sur la gauche
  const tx = cx - Math.floor(w / 2) + 10;
  const tentW = 16, tentH = 11;
  for (let i = 0; i < tentH; i++) {
    const tw = Math.round(tentW * (1 - i / (tentH + 1)));
    for (let x = 0; x < tw; x++) {
      const c = (x % 6 < 3) ? pal.roof : hex(0xf7f2e0);
      fb.px(tx - Math.floor(tw / 2) + x, groundY - tentH + i, c);
    }
  }
  fb.rect(tx - Math.floor(tentW / 2) - 1, groundY - 2, tentW + 2, 2, shade(pal.roof, -0.3));
  fb.rect(tx - 3, groundY - 8, 6, 6, pal.dark);
  fb.px(tx, groundY - 12, hex(0xff4d6d));

  // Stands / lumières
  for (let i = 0; i < 4; i++) {
    const lx = cx + Math.floor(w / 2) - 4 - i * 5;
    const on = lit(ctx.rnd, variant, lx, groundY);
    fb.rect(lx, groundY - 5, 3, 3, on ? hex(0xffe9a0) : pal.dark);
    fb.px(lx + 1, groundY - 6, on ? hex(0xff4d6d) : shade(pal.dark, 0.3));
  }
  // arbres
  fb.rect(cx + Math.floor(w / 2) - 2, groundY - 9, 2, 8, hex(0x6b4a2a));
  fb.disk(cx + Math.floor(w / 2) - 1, groundY - 12, 4, hex(0x3f8f3a));
}

function drawRocket(ctx) {
  const { fb, pal, a, tier, groundY, variant } = ctx;
  const w = Math.round(a.w + Math.floor((tier * a.wGain) / 2));
  const cx = Math.round(ctx.w / 2);
  const cxB = cx;
  const baseH = 14;
  const by = groundY - baseH;
  shadow(ctx, w + 6);

  // plateforme
  fb.rect(cxB - Math.floor(w / 2), by, w, baseH, pal.wall);
  fb.rect(cxB - Math.floor(w / 2), by, w, 1, pal.light);
  fb.hline(cxB - Math.floor(w / 2), groundY - 1, w, pal.dark);
  fb.vline(cxB - Math.floor(w / 2), by, baseH, pal.dark);
  fb.vline(cxB + Math.floor(w / 2) - 1, by, baseH, pal.dark);

  // baies vitrées + rampe
  for (let i = 0; i < Math.floor(w / 8); i++) {
    const gx = cxB - Math.floor(w / 2) + 3 + i * 7;
    const on = lit(ctx.rnd, variant, gx, by);
    fb.rect(gx, by + 3, 5, 5, on ? pal.win : mixColor(pal.dark, 0x0d1a30, 0.4));
    fb.outline(gx, by + 3, 5, 5, pal.dark);
  }
  // tour de contrôle
  fb.rect(cxB + Math.floor(w / 2) - 9, by - 12, 7, 12, shade(pal.dark, 0.15));
  fb.rect(cxB + Math.floor(w / 2) - 10, by - 16, 9, 5, mixColor(pal.win, 0x0d1a30, 0.25));
  fb.outline(cxB + Math.floor(w / 2) - 10, by - 16, 9, 5, pal.dark);
  fb.hline(cxB + Math.floor(w / 2) - 10, by - 16, 9, shade(pal.win, 0.3));
  fb.vline(cxB + Math.floor(w / 2) - 5, by - 21, 5, pal.dark);
  fb.px(cxB + Math.floor(w / 2) - 5, by - 22, variant === 1 ? hex(0x7ef2c0) : hex(0xff4d6d));

  // Fusée (sur la plateforme)
  const rx = cxB - Math.floor(w / 2) + 12;
  const H = 20 + Math.min(tier, 4) * 3;
  const rw = 9;
  const top = by - H;
  const rl = rx - Math.floor(rw / 2);
  // vapeur d'oxygène au pied de la fusée (tramée, animée par la variante)
  for (let i = 0; i < 7; i++) {
    const sx = rl - 4 + i * 3 + (variant % 3);
    fb.px(sx, by - 1 - ((i + variant) % 2), rgba(214, 236, 255, 90));
    fb.px(sx + 1, by - 2 - (i % 2), rgba(214, 236, 255, 55));
  }
  // tour de lancement (à droite)
  const tw = rl + rw + 4;
  fb.vline(tw + 3, top + 4, H - 4, shade(pal.dark, 0.2));
  fb.vline(tw, top + 4, H - 4, shade(pal.dark, 0.32));
  fb.rect(tw, by - 3, 6, 3, shade(pal.dark, 0.25));
  for (let i = 0; i < 5; i++) {
    const sy = top + 6 + i * Math.floor((H - 10) / 5);
    fb.rect(tw, sy, 4, 1, shade(pal.dark, 0.18));
  }
  // bras d'accostage vers la fusée
  fb.rect(tw - 4, top + 12, 4, 1, shade(pal.dark, 0.08));
  fb.rect(tw - 4, top + 15, 4, 1, shade(pal.dark, 0.08));
  fb.px(tw - 5, top + 12, shade(pal.dark, 0.2));
  // corps
  fb.rect(rl, top, rw, H, pal.light);
  fb.vline(rl, top, H, shade(pal.light, -0.22));
  fb.vline(rl + rw - 1, top, H, shade(pal.light, -0.34));
  fb.hline(rl + 1, top, rw - 2, shade(pal.light, 0.3));
  // nez (du sommet vers la base : étroit → large)
  for (let i = 0; i < 6; i++) {
    const nw = Math.max(2, Math.round((rw * (i + 1)) / 6));
    const nx = rx - Math.floor(nw / 2);
    fb.rect(nx, top - 6 + i, nw, 1, pal.accent);
    fb.px(nx + nw - 1, top - 6 + i, shade(pal.accent, -0.3));
    fb.px(nx, top - 6 + i, shade(pal.accent, 0.25));
  }
  // bandes et hublot
  fb.rect(rl, top + 4, rw, 2, pal.accent);
  fb.rect(rl, top + 13, rw, 1, shade(pal.accent, -0.1));
  fb.rect(rx - 2, top + 8, 4, 4, mixColor(pal.win, 0x0d1a30, 0.2));
  fb.outline(rx - 2, top + 8, 4, 4, pal.dark);
  fb.px(rx - 1, top + 9, shade(pal.win, 0.3));
  // ailerons en escalier
  for (let i = 0; i < 4; i++) {
    fb.rect(rl - 4 + i, by - 5 + i, 4 - i >= 1 ? 1 : 1, 1, pal.accent);
    fb.rect(rl - 4, by - 5 + i, 1 + i, 1, pal.accent);
    fb.rect(rl + rw + 3 - i, by - 5 + i, 1 + i, 1, shade(pal.accent, -0.2));
  }
  // moteur, flamme courte et halo d'allumage sur la dalle
  fb.rect(rl + 1, by - 2, rw - 2, 2, mixColor(pal.dark, 0x2a2f45, 0.4));
  fb.rect(rl + 1, by - 2, rw - 2, 1, shade(pal.dark, 0.15));
  const flame = 2 + (variant % 2);
  fb.rect(rx - 2, by, 5, 1, hex(0xffd166));
  fb.rect(rx - 1, by + 1, 3, flame, hex(0xff9f43));
  fb.px(rx, by + 1 + flame, hex(0xffe9a0));
  for (let i = -6; i <= 6; i++) {
    const dy = Math.round(2 * Math.sqrt(Math.max(0, 1 - (i / 6) ** 2)));
    for (let j = 0; j <= dy; j++) {
      if (((i + j) & 1)) continue;
      fb.px(rx + i, by + 2 + j, rgba(255, 150, 70, 70));
    }
  }
}

function drawQuantum(ctx) {
  const { fb, pal, a, tier, groundY, variant } = ctx;
  const floors = Math.max(1, Math.round(a.floors + tier * a.floorGain));
  const w = Math.round(a.w + Math.floor((tier * a.wGain) / 2));
  const bodyH = floors * a.floorH;
  const cx = Math.round(ctx.w / 2);
  const bx = cx - Math.floor(w / 2);
  const by = groundY - bodyH;

  shadow(ctx, w + 8);
  body(ctx, bx, by, w, bodyH);

  // fenêtres violettes
  const cols = Math.max(2, Math.floor(w / 14));
  for (let f = 0; f < floors; f++) {
    const fy = by + f * a.floorH + 3;
    for (let c = 0; c < cols; c++) {
      const fx = bx + 5 + c * Math.floor((w - 10) / cols);
      const on = lit(ctx.rnd, variant, fx, fy);
      fb.rect(fx, fy, 8, 5, on ? pal.win : mixColor(pal.dark, 0x1a0f38, 0.5));
      fb.hline(fx, fy, 8, shade(pal.win, 0.3));
      fb.rect(fx, fy, 8, 1, pal.accent);
    }
  }
  // ── socle lumineux ──────────────────────────────────────
  fb.rect(bx + 2, groundY - 3, w - 4, 2, shade(pal.accent, 0.2));
  fb.hline(bx + 2, groundY - 1, w - 4, pal.win);
  for (let i = 0; i < w - 6; i += 2) {
    fb.px(bx + 3 + i, groundY - 4, rgba(176, 107, 255, 70));
  }

  // ── cœur antigravité sur le toit ────────────────────────
  const coreY = by - 5;
  fb.rect(cx - 5, coreY, 10, 4, shade(pal.dark, 0.1));
  fb.rect(cx - 4, coreY + 1, 8, 3, mixColor(pal.accent, pal.win, 0.35));
  fb.hline(cx - 3, coreY + 2, 6, pal.win);
  fb.px(cx, coreY + 2, 0xfff3c4);
  // anneau incliné (deux arcs de 2 px)
  const rxr = 15, ryr = 4;
  for (let x = -rxr; x <= rxr; x++) {
    const t = x / rxr;
    const y = Math.round(ryr * Math.sqrt(Math.max(0, 1 - t * t)));
    const back = x < 0;
    if (!back || (x & 1)) {
      fb.px(cx + x, coreY - y - 2, back ? shade(pal.win, -0.25) : pal.win);
      fb.px(cx + x, coreY - y - 3, rgba(208, 184, 255, 110));
    }
    if (back || (x & 1)) {
      fb.px(cx + x, coreY + y + 1, back ? shade(pal.accent, -0.15) : pal.accent);
      fb.px(cx + x, coreY + y + 2, rgba(176, 107, 255, 120));
    }
  }
  // cubes flottants
  for (let i = 0; i < 3; i++) {
    const fx = cx - 9 + i * 9 + ((variant + i) % 2) * 2;
    const fy = coreY - 12 - (i % 2) * 4;
    fb.rect(fx, fy, 4, 4, mixColor(pal.light, 0xffffff, 0.25));
    fb.hline(fx, fy, 4, pal.win);
    fb.px(fx + 1, fy + 3, shade(pal.accent, -0.1));
    fb.px(fx + 1, fy + 5, rgba(208, 184, 255, 90));
    fb.px(fx + 2, fy + 7, rgba(208, 184, 255, 55));
  }
  roofDetails(ctx, bx + 2, by - 4, w - 4, pal, {});
  // dalle et véhicule lévitant
  fb.rect(bx - 4, groundY - 2, w + 8, 1, pal.accent);
  fb.rect(bx - 4, groundY - 1, w + 8, 1, shade(pal.accent, -0.35));
  const vx = bx - 11;
  fb.rect(vx, groundY - 7, 9, 3, mixColor(pal.light, 0xffffff, 0.4));
  fb.hline(vx, groundY - 7, 9, pal.win);
  fb.rect(vx + 1, groundY - 10, 4, 3, mixColor(pal.win, 0x2a1e4a, 0.45));
  fb.px(vx + 5, groundY - 8, pal.win);
  for (let i = 0; i < 7; i++) {
    if (i & 1) continue;
    fb.px(vx + i, groundY - 3, rgba(176, 107, 255, 90));
    fb.px(vx + i, groundY - 2, rgba(176, 107, 255, 45));
  }
}

// ── Décor : nature et mobilier urbain ────────────────────────

export function drawNature(kind, variant = 0, seed = 1) {
  const fb = drawNatureRaw(kind, variant, seed);
  return outlineSilhouette(fb, 0x0a0e1c);
}

function drawNatureRaw(kind, variant = 0, seed = 1) {
  const rnd = mulberry32(seed);
  switch (kind) {
    case 'tree': {
      const fb = new FB(14, 18);
      const h = 8 + Math.floor(rnd() * 3);
      fb.rect(6, 10, 2, h - 2, hex(0x6b4a2a));
      fb.disk(7, 8, 6, hex(0x2f7a35));
      fb.disk(6, 7, 5, hex(0x3f9c45));
      fb.disk(5, 6, 3, hex(0x59b95c));
      fb.disk(9, 9, 3, hex(0x276b2d));
      if (variant === 1) { fb.px(6, 5, hex(0xd8f07a)); fb.px(4, 7, hex(0xd8f07a)); }
      return fb;
    }
    case 'pine': {
      const fb = new FB(12, 20);
      fb.rect(5, 14, 2, 5, hex(0x5a3a22));
      for (let i = 0; i < 3; i++) {
        const w = 9 - i * 2;
        const y = 12 - i * 4;
        for (let k = 0; k < 4; k++) {
          const ww = Math.round(w * (1 - k / 4.5));
          fb.hline(6 - Math.floor(ww / 2), y - 3 + k, ww, i === 0 ? hex(0x276b2d) : hex(0x2f7a35));
        }
      }
      return fb;
    }
    case 'bush': {
      const fb = new FB(10, 8);
      fb.disk(4, 5, 3, hex(0x2f7a35));
      fb.disk(6, 4, 3, hex(0x3f9c45));
      fb.disk(5, 3, 2, hex(0x59b95c));
      return fb;
    }
    case 'rock': {
      const fb = new FB(8, 6);
      fb.rect(1, 3, 6, 3, hex(0x8a8f98));
      fb.rect(2, 2, 4, 1, hex(0xa8adb6));
      fb.px(2, 5, hex(0x6b7079));
      return fb;
    }
    case 'flower': {
      const fb = new FB(5, 7);
      fb.vline(2, 3, 4, hex(0x3f9c45));
      const c = variant === 0 ? hex(0xff4d6d) : variant === 1 ? hex(0xffd166) : hex(0xb06bff);
      fb.px(2, 2, c); fb.px(1, 3, c); fb.px(3, 3, c); fb.px(2, 1, shade(c, 0.2));
      return fb;
    }
    case 'lamp': {
      const fb = new FB(9, 22);
      fb.rect(4, 8, 1, 14, hex(0x2b2f36));
      fb.rect(1, 3, 7, 2, hex(0x2b2f36));
      fb.rect(2, 5, 5, 3, variant ? hex(0xffe9a0) : hex(0xd8c88a));
      fb.hline(2, 5, 5, hex(0xfff6c4));
      fb.rect(2, 20, 5, 2, hex(0x1a1d22));
      return fb;
    }
    case 'bench': {
      const fb = new FB(12, 8);
      fb.rect(0, 3, 12, 2, hex(0x8a5a30));
      fb.rect(1, 5, 2, 3, hex(0x4a3a22));
      fb.rect(9, 5, 2, 3, hex(0x4a3a22));
      fb.rect(0, 1, 12, 1, hex(0x9a6a3a));
      return fb;
    }
    case 'fountain': {
      const fb = new FB(18, 14);
      fb.rect(0, 8, 18, 6, hex(0xb9b3a6));
      fb.rect(0, 8, 18, 1, hex(0xd8d2c4));
      fb.rect(2, 7, 14, 2, hex(0x4fa8d8));
      fb.rect(7, 3, 4, 5, hex(0xcfc8b8));
      fb.rect(6, 2, 6, 2, hex(0xb9b3a6));
      fb.px(9, 0, hex(0x9fe8ff));
      fb.rect(4, 6, 1, 1, hex(0xd8f4ff));
      fb.rect(13, 6, 1, 1, hex(0xd8f4ff));
      return fb;
    }
    case 'car': {
      const fb = new FB(16, 10);
      const body = variant === 0 ? hex(0xd0504c) : variant === 1 ? hex(0x3aa7a0) : hex(0xffd166);
      fb.rect(1, 4, 14, 4, body);
      fb.rect(4, 2, 8, 2, shade(body, -0.1));
      fb.rect(5, 2, 3, 2, hex(0x9fe8ff));
      fb.rect(9, 2, 3, 2, hex(0x9fe8ff));
      fb.rect(1, 4, 14, 1, shade(body, 0.25));
      fb.rect(2, 8, 3, 2, hex(0x22242a));
      fb.rect(11, 8, 3, 2, hex(0x22242a));
      fb.px(15, 5, hex(0xffe9a0));
      return fb;
    }
    case 'sign': {
      const fb = new FB(10, 16);
      fb.rect(4, 6, 1, 10, hex(0x555b64));
      fb.rect(0, 1, 10, 6, hex(0x2f7a35));
      fb.outline(0, 1, 10, 6, hex(0x215a27));
      fb.rect(2, 3, 6, 2, hex(0xe8f4d8));
      return fb;
    }
    case 'birch': {
      const fb = new FB(12, 20);
      fb.rect(5, 8, 2, 10, hex(0xd8d2c0));
      for (let i = 0; i < 4; i++) fb.rect(5, 9 + i * 2, i % 2 ? 1 : 2, 1, hex(0x4a4438));
      fb.disk(6, 7, 5, hex(0x4f9c45));
      fb.disk(5, 6, 4, hex(0x67bb55));
      fb.disk(8, 8, 3, hex(0x2f7a35));
      fb.px(4, 5, hex(0xd8f07a));
      return fb;
    }
    case 'hydrant': {
      const fb = new FB(7, 11);
      fb.rect(2, 3, 3, 7, hex(0xd0504c));
      fb.rect(2, 3, 3, 1, hex(0xf07a72));
      fb.rect(1, 5, 1, 2, hex(0xd0504c));
      fb.rect(5, 5, 1, 2, hex(0xd0504c));
      fb.rect(3, 1, 1, 2, hex(0xd0504c));
      fb.rect(1, 10, 5, 1, hex(0x8a3b38));
      return fb;
    }
    case 'mailbox': {
      const fb = new FB(9, 13);
      fb.rect(4, 7, 1, 6, hex(0x555b64));
      fb.rect(1, 3, 7, 4, hex(0x2f4a6b));
      fb.rect(1, 3, 7, 1, hex(0x486c96));
      fb.rect(2, 4, 5, 2, hex(0xffe9a0));
      fb.rect(1, 7, 7, 1, hex(0x1d3049));
      return fb;
    }
    case 'bin': {
      const fb = new FB(8, 10);
      fb.rect(1, 3, 6, 6, hex(0x3d4a3a));
      fb.rect(0, 2, 8, 2, hex(0x55604f));
      fb.rect(1, 4, 6, 1, hex(0x2b332a));
      fb.rect(2, 6, 2, 1, hex(0x55604f));
      return fb;
    }
    case 'busstop': {
      const fb = new FB(20, 20);
      fb.rect(1, 4, 1, 15, hex(0x555b64));
      fb.rect(17, 4, 1, 15, hex(0x555b64));
      fb.rect(0, 2, 20, 3, hex(0x3aa7a0));
      fb.rect(0, 2, 20, 1, hex(0x6dd6cf));
      fb.rect(2, 8, 15, 1, hex(0x8a8f96));
      fb.rect(2, 15, 15, 2, hex(0x8a5a30));
      fb.rect(3, 17, 2, 2, hex(0x4a3a22));
      fb.rect(14, 17, 2, 2, hex(0x4a3a22));
      fb.rect(5, 5, 8, 3, hex(0xffe9a0));
      return fb;
    }
    case 'traffic': {
      const fb = new FB(8, 22);
      fb.rect(3, 8, 2, 14, hex(0x3a3f48));
      fb.rect(2, 1, 4, 8, hex(0x2b2f36));
      fb.outline(2, 1, 4, 8, hex(0x15181d));
      fb.px(4, 3, hex(0xff4d6d));
      fb.px(4, 5, hex(0xffd166));
      fb.px(4, 7, hex(0x6bc47a));
      fb.rect(1, 20, 6, 2, hex(0x22252b));
      return fb;
    }
    case 'stall': {
      const fb = new FB(22, 18);
      fb.rect(0, 6, 22, 2, hex(0x8a5a30));
      fb.rect(0, 8, 22, 8, hex(0x6b4a2a));
      for (let i = 0; i < 22; i += 3) fb.px(i, 12, hex(0x4a3a22));
      for (let i = 0; i < 22; i += 3) {
        const c = (i / 3) % 2 ? hex(0xd0504c) : hex(0xf7f2e0);
        fb.rect(i, 2, 3, 4, c);
      }
      fb.rect(0, 2, 22, 1, hex(0xe8e4d8));
      for (let i = 0; i < 3; i++) fb.rect(3 + i * 7, 5, 3, 2, i === 1 ? hex(0xffd166) : hex(0xd0504c));
      return fb;
    }
    default: return new FB(4, 4);
  }
}
