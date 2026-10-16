// ─────────────────────────────────────────────────────────────
//  PixCity · chaîne d'assets d'illustration
//
//  Les illustrations sont générées par IA avec le prompt maître
//  (docs/ARTSTYLE.md) puis versionnées dans assets/art/ : ce sont
//  les MASTERS, jamais modifiés.
//
//  Ce script en dérive les fichiers utilisés par le jeu :
//    - réduction par moyenne de blocs
//    - quantification sur une palette de 256 couleurs (les couleurs
//      officielles de PixCity sont toujours conservées)
//    - PNG indexé compressé par notre propre DEFLATE
//
//    node tools/assets.mjs
// ─────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, statSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readPNG, analyse, PALETTE } from './pngread.mjs';
import { fbFromRGBA, fbDownscale, fbToPNGIndexed } from '../src/gfx/fb.js';

const ROOT = new URL('..', import.meta.url).pathname;
const ART = join(ROOT, 'assets/art');
const WEB = join(ART, 'web');
const ICONS = join(ROOT, 'assets/icons');
mkdirSync(WEB, { recursive: true });
mkdirSync(ICONS, { recursive: true });

const OFFICIAL = PALETTE.map((p) => p.hex);

const ko = (n) => (n / 1024).toFixed(0) + ' Ko';

/** Les illustrations du jeu (largeur cible en pixels). */
const JOBS = [
  { src: 'hero.png', out: join(WEB, 'hero.png'), width: 1280, use: 'écran-titre + accueil' },
  { src: 'shop.png', out: join(WEB, 'shop.png'), width: 960, use: 'boutique' },
  { src: 'prestige.png', out: join(WEB, 'prestige.png'), width: 960, use: 'prestige' },
  { src: 'district.png', out: join(WEB, 'district.png'), width: 960, use: 'nouveau bâtiment' },
];

/** Icônes de l'application (générées depuis l'illustration d'icône). */
const ICON_JOBS = [
  { size: 512, out: join(ICONS, 'icon-512.png') },
  { size: 192, out: join(ICONS, 'icon-192.png') },
  { size: 256, out: join(ART, 'web', 'icon-share.png'), forOg: true },
];

function convert(fb, out, label, maxColours = 256) {
  const png = fbToPNGIndexed(fb, OFFICIAL, maxColours);
  writeFileSync(out, Buffer.from(png));
  const size = statSync(out).size;
  console.log('  ✓ ' + label.padEnd(22) + fb.w + '×' + fb.h +
    '  ' + ko(size).padStart(7) +
    '  palette ' + String(png.palette.length).padStart(3) +
    '  erreur ' + png.meanError.toFixed(1) + '/255');
  return { size, colours: png.palette.length, error: png.meanError };
}

console.log('\n🖼️  PixCity · génération des dérivés d’illustration\n');
console.log('  MASTERS (inchangés) :');
let masterTotal = 0;
for (const j of JOBS) {
  const s = statSync(join(ART, j.src)).size;
  masterTotal += s;
}
for (const f of ['hero.png', 'icon.png', 'shop.png', 'prestige.png', 'district.png']) {
  const s = statSync(join(ART, f)).size;
  const img = readPNG(readFileSync(join(ART, f)));
  console.log('    ' + f.padEnd(14) + img.width + '×' + img.height + '  ' + ko(s).padStart(7));
}
console.log('    total ' + ko(masterTotal));

console.log('\n  DÉRIVÉS WEB (utilisés par le jeu) :');
let webTotal = 0;
for (const j of JOBS) {
  const img = readPNG(readFileSync(join(ART, j.src)));
  const fb = fbFromRGBA(img.data, img.width, img.height);
  const h = Math.round(fb.h * (j.width / fb.w));
  const small = fbDownscale(fb, j.width, h);
  const r = convert(small, j.out, j.src.replace('.png', ' → web'), 256);
  webTotal += r.size;
  // contrôle : la version réduite reste-t-elle dans l'identité ?
  const a = analyse({ width: small.w, height: small.h, data: fbToRGBAOf(small) }, { stride: 3 });
  const okPal = a.paletteCoverage >= 0.42;
  console.log('      identité : palette ' + (a.paletteCoverage * 100).toFixed(1) + ' %  chaud ' +
    (a.warmRatio * 100).toFixed(1) + ' %  froid ' + (a.coldRatio * 100).toFixed(1) + ' %  ' + (okPal ? '✓' : '⚠'));
}

function fbToRGBAOf(fb) {
  const out = new Uint8ClampedArray(fb.w * fb.h * 4);
  const view = new Uint32Array(out.buffer);
  view.set(fb.data);
  return out;
}

console.log('\n  ICÔNES DE L’APPLICATION (depuis art/icon.png) :');
const iconImg = readPNG(readFileSync(join(ART, 'icon.png')));
const iconFb = fbFromRGBA(iconImg.data, iconImg.width, iconImg.height);
let iconTotal = 0;
for (const j of ICON_JOBS) {
  const small = fbDownscale(iconFb, j.size, j.size);
  // les icônes sont quantifiées plus fort : plus nettes et plus légères
  const r = convert(small, j.out, 'icon ' + j.size + 'px', j.forOg ? 128 : 96);
  iconTotal += r.size;
}

console.log('\n  Bilan : masters ' + ko(masterTotal) + ' → dérivés ' + ko(webTotal + iconTotal) +
  '  (' + (100 * (webTotal + iconTotal) / masterTotal).toFixed(1) + ' % des masters)\n');
