// ─────────────────────────────────────────────────────────────
//  PixCity · dessin des bâtiments en pixel-art (procédural)
//  Chaque bâtiment est décrit par une recette ; le dessin se fait
//  dans un FB, puis est « cuit » en canvas (navigateur) ou en PNG
//  (Node) pour vérification.
// ─────────────────────────────────────────────────────────────
import { FB, hex, rgba, shade, mixColor } from './fb.js';
import { mulberry32 } from '../core/format.js';

/** Recette graphique de chaque bâtiment. */
export const ART = {
  cabane: { style: 'house', w: 26, floors: 1, floorH: 7, floorGain: 0.4, wGain: 1, roof: 'gable', chimney: true },
  epicerie: { style: 'shop', w: 32, floors: 1, floorH: 9, floorGain: 0.5, wGain: 1, roof: 'awning', sign: true, awning: true },
  cafe: { style: 'shop', w: 34, floors: 1, floorH: 10, floorGain: 0.5, wGain: 1, roof: 'awning', sign: true, awning: true, chim: true },
  immeuble: { style: 'tower', w: 28, floors: 3, floorH: 8, floorGain: 1, wGain: 0.5, roof: 'flat', balconies: true },
  cinema: { style: 'hall', w: 42, floors: 1, floorH: 16, floorGain: 0.4, wGain: 1.5, roof: 'marquee', marquee: true },
  centre: { style: 'hall', w: 50, floors: 2, floorH: 11, floorGain: 0.6, wGain: 2, roof: 'glass', glass: true },
  hopital: { style: 'hall', w: 38, floors: 2, floorH: 11, floorGain: 0.5, wGain: 1.5, roof: 'flat', cross: true },
  bureaux: { style: 'tower', w: 34, floors: 5, floorH: 9, floorGain: 1, wGain: 1, roof: 'flatGlass', glass: true, antenna: true },
  gratteciel: { style: 'tower', w: 38, floors: 8, floorH: 9, floorGain: 1.4, wGain: 1, roof: 'spire', glass: true, antenna: true },
  parc: { style: 'wheel', w: 62, floors: 0, floorH: 0, floorGain: 0, wGain: 2, roof: 'none' },
  gare: { style: 'rocket', w: 50, floors: 1, floorH: 13, floorGain: 0.3, wGain: 1, roof: 'dome' },
  quantique: { style: 'quantum', w: 46, floors: 4, floorH: 9, floorGain: 0.8, wGain: 1, roof: 'ring' },
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
  if (neon) applyNeon(fb, size);
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
        fb.rect(inner.x, inner.y, inner.w, 1, shade(pal.win, 0.12));
        if (inner.h > 3) fb.rect(inner.x, inner.y + inner.h - 1, inner.w, 1, shade(pal.win, -0.25));
      } else {
        const dark = mixColor(pal.dark, 0x0a1020, 0.55);
        fb.rect(inner.x, inner.y, inner.w, inner.h, dark);
        fb.rect(inner.x, inner.y, inner.w, 1, shade(dark, 0.18));
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

  // Toit
  const roofH = roofHeight(a, tier);
  const over = 3;
  if (a.roof === 'gable') {
    for (let i = 0; i < roofH; i++) {
      const rw = Math.round((w + over * 2) * (1 - i / (roofH + 1.5)));
      fb.hline(cx - Math.floor(rw / 2), by - roofH + i, rw, i === 0 ? pal.roof : (i % 2 ? pal.roof : shade(pal.roof, 0.06)));
    }
    fb.hline(cx - Math.floor((w + over * 2) / 2), by - 1, w + over * 2, shade(pal.roof, -0.3));
    // tuiles
    for (let i = 1; i < roofH; i += 2) {
      const rw = Math.round((w + over * 2) * (1 - i / (roofH + 1.5)));
      fb.hline(cx - Math.floor(rw / 2), by - roofH + i, rw, shade(pal.roof, -0.18));
    }
  } else if (a.roof === 'awning') {
    fb.rect(bx - over, by - 2, w + over * 2, 2, pal.roof);
    fb.hline(bx - over, by - 1, w + over * 2, shade(pal.roof, -0.3));
  }
  // Cheminée
  if (a.chimney) {
    const chx = bx + 3;
    fb.rect(chx, by - roofH + 1, 4, 7, shade(pal.dark, 0.05));
    fb.rect(chx, by - roofH + 1, 4, 1, pal.win);
  }
  // Plante / jardin
  if (tier >= 1) {
    fb.rect(bx - 3, groundY - 2, 3, 2, hex(0x4f8f3a));
    fb.rect(bx + w, groundY - 3, 3, 3, hex(0x3d7a2e));
    fb.px(bx + w + 1, groundY - 4, hex(0xd8f07a));
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

  // Grande vitrine au rez-de-chaussée
  const winY = groundY - Math.min(9, a.floorH - 2);
  fb.rect(bx + 2, winY, w - 4, groundY - winY - 1, mixColor(pal.win, 0x1a1208, 0.35));
  fb.rect(bx + 2, winY, w - 4, 1, pal.dark);
  fb.outline(bx + 2, winY, w - 4, groundY - winY - 1, pal.dark);
  // silhouettes de produits
  for (let i = 0; i < 3; i++) {
    const px = bx + 5 + i * Math.floor((w - 10) / 3);
    fb.rect(px, groundY - 5, 3, 3, i === 1 ? pal.accent : shade(pal.win, -0.4));
  }
  // étages supérieurs
  if (floors > 1) {
    windows(ctx, bx + 4, by + 3, 3, floors - 1, 4, a.floorH - 5, 3, 3, variant);
  }
  // Auvent rayé
  if (a.awning) {
    const aw = 4;
    for (let i = 0; i < w; i++) {
      const c = (Math.floor(i / 3) % 2) ? pal.accent : hex(0xf7f2e0);
      fb.rect(bx + i, by + bodyH - 8, 1, aw, c);
    }
    fb.rect(bx - 2, by + bodyH - 8, w + 4, 1, shade(pal.accent, -0.2));
    // festons
    for (let i = 0; i < w + 4; i += 3) {
      const c = (Math.floor(i / 3) % 2) ? shade(pal.accent, -0.15) : hex(0xdcd6c2);
      fb.px(bx - 2 + i, by + bodyH - 4, c);
      fb.px(bx - 1 + i, by + bodyH - 4, c);
    }
    fb.rect(bx - 2, by + bodyH - 12, w + 4, 2, pal.roof);
    fb.hline(bx - 2, by + bodyH - 12, w + 4, shade(pal.roof, 0.15));
  }
  // Enseigne
  if (a.sign) {
    const sy = by - 1;
    fb.rect(bx + 2, sy - 4, w - 4, 5, shade(pal.dark, 0.1));
    fb.outline(bx + 2, sy - 4, w - 4, 5, pal.dark);
    const litC = mixColor(pal.win, 0xffffff, 0.15);
    for (let i = 0; i < Math.floor((w - 8) / 3); i++) {
      fb.rect(bx + 4 + i * 3, sy - 3, 2, 3, litC);
    }
    if (tier >= 2) fb.rect(bx + 2, sy - 4, w - 4, 1, shade(pal.win, 0.2));
  }
  // Toit
  if (a.roof === 'awning') {
    fb.rect(bx - 2, by - 6, w + 4, 3, pal.roof);
    fb.hline(bx - 2, by - 6, w + 4, shade(pal.roof, 0.2));
    fb.hline(bx - 2, by - 4, w + 4, shade(pal.roof, -0.3));
  }
  if (a.chim) {
    fb.rect(bx + w - 6, by - 9, 3, 5, shade(pal.dark, 0.1));
  }
  if (tier >= 3) {
    // enseigne lumineuse supplémentaire
    fb.rect(bx + 2, by - 10, w - 4, 3, pal.accent);
    fb.hline(bx + 2, by - 10, w - 4, shade(pal.accent, 0.3));
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
  fb.rect(rx - Math.floor(rw / 2), top, rw, H, pal.light);
  fb.vline(rx - Math.floor(rw / 2), top, H, shade(pal.light, -0.25));
  fb.vline(rx + Math.floor(rw / 2) - 1, top, H, shade(pal.light, -0.35));
  // nez
  for (let i = 0; i < 6; i++) {
    const nw = Math.max(1, rw - Math.round(i * 1.2));
    fb.rect(rx - Math.floor(nw / 2), top - 6 + i, nw, 1, pal.accent);
  }
  fb.rect(rx - 2, top + 7, 4, 4, mixColor(pal.win, 0x0d1a30, 0.2));
  fb.outline(rx - 2, top + 7, 4, 4, pal.dark);
  fb.rect(rx - Math.floor(rw / 2) + 1, top + 14, rw - 2, 1, pal.accent);
  // ailerons
  fb.rect(rx - Math.floor(rw / 2) - 3, by - 8, 3, 8, pal.accent);
  fb.rect(rx + Math.floor(rw / 2), by - 8, 3, 8, pal.accent);
  fb.rect(rx - Math.floor(rw / 2) - 3, by - 8, 3, 1, shade(pal.accent, 0.3));
  fb.rect(rx + Math.floor(rw / 2), by - 8, 3, 1, shade(pal.accent, 0.3));
  // flammes
  const flame = 4 + (variant % 2) * 3;
  fb.rect(rx - 2, by - 1, 5, 1, hex(0xffd166));
  fb.rect(rx - 1, by, 3, flame, hex(0xff9f43));
  fb.px(rx, by + flame, hex(0xffe9a0));
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
  // anneaux quantiques
  const ringY = by - 6;
  for (let i = 0; i < 3; i++) {
    const r = 6 + i * 4;
    const yy = ringY - i * 2 - (variant % 2);
    fb.ring(cx, yy, r, i === 1 ? pal.win : pal.accent, 1);
  }
  // socle lumineux
  fb.rect(bx + 2, groundY - 3, w - 4, 2, shade(pal.accent, 0.2));
  fb.hline(bx + 2, groundY - 1, w - 4, pal.win);
  // particules flottantes
  for (let i = 0; i < 5; i++) {
    const px = bx + 3 + ((i * 7 + variant * 3) % (w - 6));
    const py = by - 4 - ((i * 5 + variant * 2) % 12);
    fb.px(px, py, i % 2 ? pal.win : pal.accent);
  }
}

// ── Décor : nature et mobilier urbain ────────────────────────

export function drawNature(kind, variant = 0, seed = 1) {
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
    default: return new FB(4, 4);
  }
}
