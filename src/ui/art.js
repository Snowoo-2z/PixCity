// ─────────────────────────────────────────────────────────────
//  PixCity · illustrations (identité visuelle v1)
//
//  Les images de assets/art/web/ sont dérivées des masters générés
//  avec le prompt maître (docs/ARTSTYLE.md). Elles ne sont chargées
//  qu'à l'affichage : elles n'alourdissent pas le démarrage.
// ─────────────────────────────────────────────────────────────
import { el } from './dom.js';

export const ART_FILES = {
  hero: 'assets/art/web/hero.png',
  shop: 'assets/art/web/shop.png',
  prestige: 'assets/art/web/prestige.png',
  district: 'assets/art/web/district.png',
  icon: 'assets/art/web/icon-share.png',
};

const cache = new Map();

/** <img> de bandeau, chargée paresseusement. */
export function artBanner(name, opts = {}) {
  const src = ART_FILES[name];
  const img = el('img', {
    class: 'art-banner' + (opts.class ? ' ' + opts.class : ''),
    src,
    alt: opts.alt || '',
    loading: 'lazy',
    decoding: 'async',
    draggable: 'false',
    style: opts.height ? { maxHeight: opts.height + 'px' } : undefined,
  });
  img.addEventListener('error', () => { img.style.display = 'none'; });
  return img;
}

/** Préchargement explicite (ex. écran-titre). */
export function preloadArt(name) {
  const src = ART_FILES[name];
  if (!src || cache.has(src)) return cache.get(src);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(src);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  cache.set(src, p);
  return p;
}

export function preloadAllArt() {
  return Promise.all(Object.keys(ART_FILES).map(preloadArt));
}
