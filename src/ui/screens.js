// ─────────────────────────────────────────────────────────────
//  PixCity · écrans : intro, gains hors-ligne, prestige, paliers
// ─────────────────────────────────────────────────────────────
import { bus } from '../core/bus.js';
import { fmt, fmtTime } from '../core/format.js';
import { starMult, permMult, prestigeGain, incomeNoMult, instantIncome } from '../core/economy.js';
import { BUILDINGS } from '../core/data.js';
import { el, qs, setText } from './dom.js';
import { openModal, close, infoModal } from './modal.js';
import { rewardPop, confetti } from './fx.js';
import { Audio } from '../core/audio.js';
import { artBanner } from './art.js';

/** Écran d'accueil au premier lancement */
export function showIntro(Game, onStart) {
  const h = openModal({
    title: '🏙️ Bienvenue à PixCity',
    dismissable: false,
    body: el('div', { class: 'col' }, [
      artBanner('hero', { class: 'front', alt: 'PixCity au crépuscule', height: 200 }),
      el('p', { class: 'small', style: { margin: 0 }, html: 'Tape sur la ville, construis des bâtiments, encaisse en continu. C’est tout : <b>ça devient vite incontrôlable</b> (dans le bon sens).' }),
      el('div', { class: 'card' }, [
        el('div', { class: 'kv' }, [el('span', { class: 'k', text: '👆 1.' }), el('span', { class: 'v', text: 'Tape la ville → pièces 🪙' })]),
        el('div', { class: 'kv' }, [el('span', { class: 'k', text: '🏗️ 2.' }), el('span', { class: 'v', text: 'Achète des bâtiments → revenus /s' })]),
        el('div', { class: 'kv' }, [el('span', { class: 'k', text: '💎 3.' }), el('span', { class: 'v', text: 'Gemmes → bonus permanents' })]),
        el('div', { class: 'kv' }, [el('span', { class: 'k', text: '🌟 4.' }), el('span', { class: 'v', text: 'Prestige → étoiles ×production' })]),
      ]),
      el('div', { class: 'notice tiny' }, [
        el('b', { text: 'Jeu de démonstration : ' }),
        'la boutique fonctionne en mode simulé. Tu peux tester tous les achats, gratuitement — aucun paiement réel, aucune donnée bancaire.',
      ]),
      el('p', { class: 'tiny dimmer', style: { margin: 0 }, text: 'Astuce : garde ton doigt appuyé et tape vite pour faire grimper le combo 🔥' }),
    ]),
    footer: [el('button', {
      class: 'btn primary grow shine', text: '🚀 CONSTRUIRE MA VILLE',
      onclick: () => { close(); Audio.play('levelup'); onStart && onStart(); },
    })],
  });
  return h;
}

export function showOffline(Game, off) {
  const s = Game.state;
  const h = openModal({
    title: '🌙 Ta ville a tourné sans toi',
    body: el('div', { class: 'col', style: { alignItems: 'center', textAlign: 'center' } }, [
      el('div', { style: { fontSize: '52px' }, text: '🪙' }),
      el('div', { class: 'title-md gold-text', text: '+' + fmt(off.coins) }),
      el('div', { class: 'small dim', text: 'Absence : ' + fmtTime(off.elapsed) + (off.capped ? ` (plafonné à ${off.hours} h)` : '') }),
      el('div', { class: 'tiny dimmer', text: `Efficacité ${Math.round(off.eff * 100)} % · ${fmt(off.income)} /s` }),
      off.capped ? el('div', { class: 'notice tiny' }, [
        'Le plafond de revenus hors-ligne est de ' + off.hours + ' h. ',
        el('b', { text: 'La Veilleuse' }), ' (boutique → bonus) l’allonge jusqu’à 24 h.',
      ]) : null,
    ]),
    footer: [
      el('button', {
        class: 'btn primary grow', text: '🪙 ENCAISSER',
        onclick: () => { close(); Audio.play('coin_big'); rewardPop('🪙', 'BIENVENUE', '+' + fmt(off.coins), 1400); },
      }),
      el('button', {
        class: 'btn cyan grow', text: '📺 +15 min (pub simulée)',
        onclick: async () => {
          const ok = await pretendAd();
          if (!ok) return;
          const gain = instantIncome(s, 900);
          close();
          Audio.play('cash');
          rewardPop('📺', 'BONUS SIMULÉ', '+' + fmt(gain), 1500);
        },
      }),
    ],
  });
  return h;
}

/** « Pub » simulée ultra-courte pour doubler une récompense. */
async function pretendAd() {
  const h = openModal({
    title: '📺 Bonus x2',
    dismissable: false,
    body: el('div', { class: 'col center', style: { alignItems: 'center', padding: '10px 0' } }, [
      el('div', { style: { fontSize: '40px' }, text: '📺' }),
      el('div', { class: 'small', text: 'Pub simulée — 3 secondes' }),
      el('div', { class: 'title-md gold-text', id: 'ad-count', text: '3' }),
    ]),
  });
  for (let i = 3; i > 0; i--) {
    setText(h.body.querySelector('#ad-count'), String(i));
    await new Promise((r) => setTimeout(r, 900));
  }
  close();
  Audio.play('ad');
  return true;
}

export function showPrestige(Game) {
  const s = Game.state;
  const gain = prestigeGain(s);
  const newStars = s.stars + gain;
  const before = starMult(s);
  const after = Math.pow(1.1, newStars);
  const canDo = gain > 0;
  const h = openModal({
    title: '🌟 Prestige',
    body: el('div', { class: 'col' }, [
      artBanner('prestige', { class: 'front', alt: 'PixCity s’élève vers les étoiles', height: 200 }),
      el('p', { class: 'small', style: { margin: 0 }, html: 'Tu remets la ville à zéro pour gagner des <b>étoiles permanentes</b> : chaque étoile augmente <b>toutes</b> tes productions de 10 %.' }),
      el('div', { class: 'card hi' }, [
        el('div', { class: 'row spread' }, [
          el('span', { class: 'small', text: 'Étoiles gagnées' }),
          el('span', { class: 'title-md gold-text', text: '+' + fmt(gain) }),
        ]),
        el('div', { class: 'row spread' }, [
          el('span', { class: 'small', text: 'Multiplicateur' }),
          el('span', { class: 'small', text: '×' + before.toFixed(2).replace('.', ',') + ' → ×' + after.toFixed(2).replace('.', ',') }),
        ]),
        el('div', { class: 'row spread' }, [
          el('span', { class: 'small', text: 'Pièces gagnées (cycle)' }),
          el('span', { class: 'small', text: fmt(s.run) }),
        ]),
      ]),
      el('div', { class: 'card' }, [
        el('div', { class: 'title-xs', text: 'CE QUI RESTE' }),
        el('div', { class: 'tiny dim', text: '💎 gemmes · ⭐ étoiles · ✨ bonus permanents · 🏆 succès · 📋 quêtes' }),
        el('div', { class: 'title-xs', style: { marginTop: '6px' }, text: 'CE QUI REPART À ZÉRO' }),
        el('div', { class: 'tiny dim', text: '🏗️ bâtiments · 🪙 pièces' }),
      ]),
      !canDo ? el('div', { class: 'notice tiny', text: 'Il faut au moins ' + fmt(1e8) + ' 🪙 gagnées pendant ce cycle pour obtenir 1 étoile. Continue !' }) : null,
      el('div', { class: 'tiny dimmer', text: 'Prestiges effectués : ' + s.prestiges }),
    ]),
    footer: [
      el('button', { class: 'btn grow', text: 'Plus tard', onclick: () => close() }),
      el('button', {
        class: 'btn purple grow ' + (canDo ? 'pulse' : ''), text: canDo ? '🌟 PRESTIGE !' : 'Pas encore',
        disabled: !canDo,
        onclick: () => {
          close();
          const res = Game.prestige();
          if (res.ok) {
            confetti(60);
            rewardPop('🌟', 'NOUVELLE ÈRE', '+' + res.gain + ' étoiles');
          }
        },
      }),
    ],
  });
  return h;
}

/** Révélation d'un nouveau bâtiment (avec l'illustration « district »). */
export function showUnlock(Game, def) {
  Audio.play('levelup');
  confetti(34);
  const h = openModal({
    title: '🏗️ Nouveau bâtiment débloqué',
    body: el('div', { class: 'col' }, [
      artBanner('district', { class: 'front', alt: 'Chantier de PixCity', height: 200 }),
      el('div', { class: 'row', style: { gap: '10px' } }, [
        el('div', { style: { fontSize: '34px' }, text: def.icon }),
        el('div', { class: 'col grow', style: { gap: '2px' } }, [
          el('div', { class: 'title-sm gold-text', text: def.name.toUpperCase() }),
          el('div', { class: 'small dim', text: def.blurb }),
        ]),
      ]),
      el('div', { class: 'card' }, [
        el('div', { class: 'kv' }, [el('span', { class: 'k', text: 'Bâtiment disponible' }), el('span', { class: 'v', text: 'dès maintenant' })]),
        el('div', { class: 'kv' }, [el('span', { class: 'k', text: 'Revenu de base' }), el('span', { class: 'v', text: fmt(def.income) + ' /s par unité' })]),
      ]),
    ]),
    footer: [el('button', {
      class: 'btn primary grow shine', text: '🏗️ CONSTRUIRE',
      onclick: () => { close(); bus.emit('open:panel', 'build'); },
    })],
  });
  bus.emit('notify', { text: `${def.icon} ${def.name} débloqué !`, kind: 'win', ms: 3200 });
  return h;
}

/** Fin de la chaîne de quêtes */
export function showQuestDone(text) {
  infoModal({ title: '📋 Quête terminée', body: el('p', { class: 'small', text }) });
}
