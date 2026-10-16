// ─────────────────────────────────────────────────────────────
//  PixCity · options, statistiques, sauvegarde
// ─────────────────────────────────────────────────────────────
import { bus } from '../core/bus.js';
import { stats as ecoStats } from '../core/economy.js';
import { exportSave, importSave, storage } from '../core/save.js';
import { Backend } from '../app/backend.js';
import { fmt, fmtTime } from '../core/format.js';
import { el, qs, qsa, setText } from './dom.js';
import { Audio } from '../core/audio.js';
import { toast } from './toasts.js';
import { confirmModal, openModal, close } from './modal.js';
import { ACH } from '../core/achievements.js';
import { achProgress } from '../core/achievements.js';

let statGrid, Game;
const OPTION_BUTTONS = ['sfx', 'music', 'crt', 'particles', 'shake', 'haptics'];

export function initStatsPanel(g) {
  Game = g;
  statGrid = qs('#stat-grid');
  for (const key of OPTION_BUTTONS) {
    const btn = qs('#opt-' + key);
    if (!btn) continue;
    btn.addEventListener('click', () => {
      Game.toggleSetting(key);
      Audio.play('click');
      paintOptions();
    });
  }
  qs('#btn-save').addEventListener('click', () => {
    Game.save();
    Audio.play('coin');
    toast('Partie sauvegardée 💾', 'win');
  });
  qs('#btn-export').addEventListener('click', showExport);
  qs('#btn-import').addEventListener('click', showImport);
  qs('#btn-wipe').addEventListener('click', () => {
    confirmModal({
      title: '🗑️ Effacer la partie ?',
      text: 'Toute ta ville, tes gemmes et tes bonus seront perdus. Irréversible (mais tes reçus de démo restent dans l’historique).',
      okLabel: 'Tout effacer', danger: true,
      onOk: () => {
        Game.wipe();
        Backend.clearReceipts();
        toast('Partie réinitialisée. Bonne nouvelle ville ! 🏙️', 'info');
        close();
      },
    });
  });
  bus.on('tick', renderStats);
  bus.on('panel:open', (id) => { if (id === 'stats') { paintOptions(); renderStats(true); } });
}

const OPT_LABELS = {
  sfx: ['🔈 Sons', '🔇 Sons'],
  music: ['🎵 Musique', '🔇 Musique'],
  crt: ['📺 CRT', '📺 CRT'],
  particles: ['✨ Particules', '✨ Particules'],
  shake: ['📳 Secousses', '📳 Secousses'],
  haptics: ['📱 Vibrations', '📱 Vibrations'],
};

function paintOptions() {
  const st = Game.settings();
  for (const key of OPTION_BUTTONS) {
    const btn = qs('#opt-' + key);
    if (!btn) continue;
    const on = st[key];
    btn.textContent = OPT_LABELS[key][on ? 0 : 1];
    btn.classList.toggle('green', !!on);
    btn.classList.toggle('off', !on);
  }
}

let statSig = '';
function renderStats(force) {
  const s = Game.state;
  const st = ecoStats(s);
  const sig = [st.income, st.lifetime, st.stars, st.buildings, s.taps, s.gems, Object.keys(s.ach).length, s.prestiges, Math.floor(s.playtime / 30)].join(':');
  if (!force && sig === statSig) return;
  statSig = sig;
  const rows = [
    ['Revenus', fmt(st.income) + ' /s'],
    ['Par heure', fmt(st.perHour)],
    ['Valeur d’un tap', fmt(st.tap)],
    ['Multiplicateur', '×' + st.mult.toFixed(2).replace('.', ',')],
    ['Pièces (total)', fmt(st.lifetime)],
    ['Bâtiments', fmt(st.buildings)],
    ['Étoiles', fmt(st.stars)],
    ['Prestiges', fmt(st.prestiges)],
    ['Taps', fmt(st.taps)],
    ['Meilleur combo', '×' + (st.bestCombo || 1).toFixed(2).replace('.', ',')],
    ['Gemmes', fmt(s.gems)],
    ['Succès', achProgress(s).got + '/' + ACH.length],
    ['Temps de jeu', fmtTime(st.playtime)],
    ['Commandes démo', (s.shop.count || 0) + ' (' + (s.shop.totalSpent || 0).toFixed(2).replace('.', ',') + ' € fictifs)'],
  ];
  statGrid.innerHTML = '';
  for (const [k, v] of rows) {
    statGrid.append(el('div', { class: 'stat' }, [
      el('div', { class: 's-k', text: k }),
      el('div', { class: 's-v', text: v }),
    ]));
  }
}

function showExport() {
  const code = exportSave(Game.state);
  const box = el('textarea', { class: 'save-code', readonly: true });
  box.value = code;
  const h = openModal({
    title: '📤 Exporter la partie',
    body: el('div', {}, [
      el('p', { class: 'small dim', text: 'Copie ce code et garde-le : il contient toute ta ville. Tu pourras le réimporter ici ou ailleurs.' }),
      box,
    ]),
    footer: [
      el('button', {
        class: 'btn grow', text: '📋 Copier',
        onclick: async () => {
          try { await navigator.clipboard.writeText(code); toast('Code copié !', 'win'); }
          catch (e) { box.select(); toast('Sélectionne et copie à la main.', 'info'); }
        },
      }),
      el('button', { class: 'btn primary grow', text: 'Fermer', onclick: () => close() }),
    ],
  });
}

function showImport() {
  const box = el('textarea', { class: 'save-code' });
  box.placeholder = 'Colle ici ton code de sauvegarde…';
  openModal({
    title: '📥 Importer une partie',
    body: el('div', {}, [
      el('p', { class: 'small dim', text: 'Attention : l’import remplace la partie en cours.' }),
      box,
    ]),
    footer: [
      el('button', { class: 'btn grow', text: 'Annuler', onclick: () => close() }),
      el('button', {
        class: 'btn primary grow', text: 'Importer',
        onclick: () => {
          const res = importSave(box.value);
          if (!res.ok) { toast('Code invalide 😕', 'bad'); return; }
          Game.state = res.state;
          Game.save(true);
          toast('Partie importée ! Rechargement…', 'win');
          setTimeout(() => location.reload(), 700);
        },
      }),
    ],
  });
}

/** Historique des commandes simulées (transparence) */
export function showReceipts() {
  const list = Backend.receipts();
  openModal({
    title: '🧾 Historique des commandes (démo)',
    body: list.length ? el('div', { class: 'list' }, list.map((r) => el('div', { class: 'card' }, [
      el('div', { class: 'row spread' }, [
        el('span', { class: 'title-xs', text: r.receiptId || '' }),
        el('span', { class: 'chip gold', text: (r.price || 0).toFixed(2).replace('.', ',') + ' €' }),
      ]),
      el('div', { class: 'tiny dim', text: 'Pack : ' + r.packId + ' · commande ' + r.id }),
      el('div', { class: 'tiny', style: { color: 'var(--green)' }, text: '✓ Validée (simulation) — aucun paiement réel' }),
    ]))) : el('p', { class: 'small dim', text: 'Aucune commande pour le moment.' }),
    footer: [el('button', { class: 'btn primary grow', text: 'Fermer', onclick: () => close() })],
  });
}
