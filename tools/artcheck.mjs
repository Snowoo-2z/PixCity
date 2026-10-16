// ─────────────────────────────────────────────────────────────
//  PixCity · audit des assets d'illustration
//  Vérifie que chaque image respecte l'identité visuelle
//  (docs/ARTSTYLE.md) : palette, lumière, cadrage.
//    node tools/artcheck.mjs [--json]
// ─────────────────────────────────────────────────────────────
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readPNG, analyse } from './pngread.mjs';

/** Vrai si ce fichier est exécuté directement (et non importé). */
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

const ART = new URL('../assets/art/', import.meta.url).pathname;

/** Seuils de conformité (voir docs/ARTSTYLE.md). */
export const RULES = {
  minWidth: 512,
  minPaletteCoverage: 0.42,  // part des pixels dans la palette officielle
  minWarmRatio: 0.05,        // présence de la lumière chaude
  minColdRatio: 0.12,        // présence du monde froid (indigo/navy) — l'ADN PixCity
  maxLuma: 165,              // jamais lumineux à outrance : c'est la nuit
  maxUniqueTop: 8,
};

export function auditImage(path) {
  const img = readPNG(readFileSync(path));
  const a = analyse(img, { stride: 2, tolerance: 62 });
  return { path, width: img.width, height: img.height, ...a };
}

export function auditAll() {
  const files = readdirSync(ART).filter((f) => f.endsWith('.png')).sort();
  return files.map((f) => auditImage(join(ART, f)));
}

function verdict(r) {
  const fails = [];
  if (r.width < RULES.minWidth) fails.push('largeur < ' + RULES.minWidth + 'px');
  if (r.paletteCoverage < RULES.minPaletteCoverage) fails.push('palette ' + pct(r.paletteCoverage) + ' < ' + pct(RULES.minPaletteCoverage));
  if (r.warmRatio < RULES.minWarmRatio) fails.push('trop peu de lumière chaude (' + pct(r.warmRatio) + ')');
  if (r.coldRatio < RULES.minColdRatio) fails.push('monde froid insuffisant (' + pct(r.coldRatio) + ')');
  if (r.meanLuma > RULES.maxLuma) fails.push('luminosité moyenne ' + r.meanLuma.toFixed(0) + ' > ' + RULES.maxLuma);
  return fails;
}

const pct = (x) => (x * 100).toFixed(1) + ' %';

const json = process.argv.includes('--json');
const results = isMain ? auditAll() : [];

if (isMain && json) {
  console.log(JSON.stringify(results.map((r) => ({ ...r, fails: verdict(r) })), null, 2));
} else if (isMain) {
  console.log('\n🎨  PixCity · audit d’identité visuelle\n');
  let bad = 0;
  for (const r of results) {
    const fails = verdict(r);
    if (fails.length) bad++;
    const name = r.path.split('/').pop();
    console.log((fails.length ? '  ✗ ' : '  ✓ ') + name.padEnd(16) +
      r.width + '×' + r.height +
      '  palette ' + pct(r.paletteCoverage).padStart(6) +
      '  chaud ' + pct(r.warmRatio).padStart(5) +
      '  froid ' + pct(r.coldRatio).padStart(5) +
      '  luma ' + r.meanLuma.toFixed(0).padStart(3));
    console.log('      dominantes : ' + r.topColours.slice(0, 4).map((c) => c.hex + ' ' + pct(c.ratio)).join(' · '));
    if (fails.length) console.log('      ⚠ ' + fails.join(' · '));
  }
  console.log('\n  ' + (results.length - bad) + '/' + results.length + ' assets conformes à l’identité visuelle\n');
  process.exit(bad ? 1 : 0);
}
