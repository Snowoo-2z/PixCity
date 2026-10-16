// ─────────────────────────────────────────────────────────────
//  PixCity · point d'entrée
// ─────────────────────────────────────────────────────────────
import { Game } from './game.js';
import { bus } from '../core/bus.js';
import { Audio } from '../core/audio.js';
import { fmt, fmtTime } from '../core/format.js';
import { BUILDINGS } from '../core/data.js';
import { WORLD } from '../gfx/city.js';
import { qs, el, setText } from '../ui/dom.js';
import { initToasts, toast, cityLog } from '../ui/toasts.js';
import { initFx, rewardPop, confetti, shakeScreen } from '../ui/fx.js';
import { initModal, openModal, close, infoModal } from '../ui/modal.js';
import { initHud, updateHud } from '../ui/hud.js';
import { initPanels, closePanel, openPanel, isPanelOpen, updateDockBadges } from '../ui/panels.js';
import { initBuildPanel } from '../ui/panelBuild.js';
import { initUpPanel } from '../ui/panelUp.js';
import { initShopPanel, refreshShop } from '../ui/panelShop.js';
import { initQuestPanel } from '../ui/panelQuests.js';
import { initAchPanel } from '../ui/panelAch.js';
import { initStatsPanel, showReceipts } from '../ui/panelStats.js';
import { initTutorial } from '../ui/tutorial.js';
import { initOffer } from '../ui/offer.js';
import { showIntro, showOffline, showPrestige, showUnlock } from '../ui/screens.js';
import { Backend } from './backend.js';

const TIPS = [
  'Astuce : tape vite pour monter le combo 🔥',
  'Les bulles 💰 au-dessus des bâtiments donnent de gros bonus',
  'Toutes les 25 unités, un bâtiment double de puissance',
  'Le taxi doré 🚕 traverse la ville : attrape-le !',
  'Le prestige 🌟 transforme ta fortune en étoiles permanentes',
  'Les gemmes 💎 s’obtiennent aussi gratuitement : quêtes, succès, pub simulée',
  'Tu peux fermer l’onglet : ta ville continue de produire 🏙️',
  'Le mode MAX achète tout ce que tu peux te permettre',
];

let tipTimer = null;

async function boot() {
  const canvas = qs('#scene');
  const bar = qs('#boot-bar');
  const tip = qs('#boot-tip');

  let ti = 0;
  setText(tip, TIPS[0]);
  tipTimer = setInterval(() => {
    ti = (ti + 1) % TIPS.length;
    if (tip) tip.textContent = TIPS[ti];
  }, 2600);

  const { fresh, broken } = Game.init(canvas);

  const setProgress = (p) => { if (bar) bar.style.width = Math.round(p * 100) + '%'; };
  setProgress(0.05);
  await Game.sprites.preload((p) => setProgress(0.05 + p * 0.9), false);

  // ── câblage UI ──────────────────────────────────────────
  initToasts();
  initFx();
  initModal();
  initHud(Game);
  initPanels();
  initBuildPanel(Game);
  initUpPanel(Game);
  initShopPanel(Game);
  initQuestPanel(Game);
  initAchPanel(Game);
  initStatsPanel(Game);
  initOffer(Game);

  wireGlobalEvents();
  wireInput(canvas);

  setProgress(1);
  await new Promise((r) => setTimeout(r, 260));
  qs('#boot').classList.add('gone');
  setTimeout(() => qs('#boot').remove(), 500);
  clearInterval(tipTimer);

  // ── démarrage ───────────────────────────────────────────
  const off = Game.start();

  if (broken) {
    toast('Sauvegarde illisible : nouvelle ville créée.', 'bad', 3600);
  }
  if (fresh) {
    Backend.track('new_game');
    showIntro(Game, () => {
      initTutorial(Game);
      Game.cityLog('Bienvenue, maire ! Tape la ville pour commencer.');
    });
  } else {
    initTutorial(Game);
    if (off && off.coins > 1) showOffline(Game, off);
  }

  registerSW();
  setTimeout(() => bus.emit('boot:firstcity'), 400);
  console.log('%cPixCity', 'font:bold 20px monospace;color:#ffd166', 'v1.0 · achats simulés (démo)');
}

// ── Événements globaux ──────────────────────────────────────
function wireGlobalEvents() {
  // succès
  bus.on('ach:many', (list) => {
    const gems = list.reduce((a, b) => a + b.gems, 0);
    const last = list[list.length - 1];
    bus.emit('notify', { text: `🏆 Succès : ${last.name} (+${gems} 💎)`, kind: 'gem', ms: 3000 });
    cityLog(`🏆 ${last.name} débloqué (+${gems} 💎)`);
    Audio.play('gem');
  });

  // nouveaux bâtiments
  bus.on('unlock', ({ def }) => {
    showUnlock(Game, def);
  });

  // palier atteint
  bus.on('tier', ({ def, mult }) => {
    rewardPop(def.icon, def.name.toUpperCase(), 'PALIER ×' + mult, 1500);
    confetti(20);
  });

  // achats
  bus.on('purchase', ({ pack, grants }) => {
    const bits = [];
    if (grants.gems) bits.push('+' + fmt(grants.gems) + ' 💎');
    if (grants.extras.length) bits.push(grants.extras.join(' · '));
    rewardPop(pack.icon, 'ACHAT VALIDÉ', bits.join('  '), 2200);
    toast(`${pack.name} ajouté à ta ville ! (simulation)`, 'win', 3200);
    cityLog(`🛒 ${pack.name} — commande ${grants.order} (démo)`);
    confetti(40);
    refreshShop();
  });

  // prestige
  bus.on('prestige', ({ gain }) => {
    rewardPop('🌟', 'NOUVELLE ÈRE', '+' + gain + ' étoiles', 2400);
    bus.emit('notify', { text: `Prestige ${Game.state.prestiges} · production ×${Math.pow(1.1, Game.state.stars).toFixed(2)}`, kind: 'win', ms: 3200 });
  });

  bus.on('taxi', (r) => {
    if (r.kind === 'boost') toast('🚕 Taxi doré : production ×' + r.mult + ' !', 'gold', 3000);
    else if (r.kind === 'gems') toast('🚕 Taxi doré : +' + r.gain + ' gemmes 💎', 'gem', 3000);
    else toast('🚕 Taxi doré : +' + fmt(r.gain) + ' pièces !', 'gold', 3000);
    cityLog('🚕 Taxi doré attrapé !');
  });

  bus.on('offline', (off) => {
    Game.cityLog(`🌙 +${fmt(off.coins)} 🪙 gagnés pendant ton absence (${fmtTime(off.elapsed)})`);
  });

  bus.on('wiped', () => {
    toast('Nouvelle ville créée !', 'info');
    Game.cityLog('Ville réinitialisée.');
  });

  bus.on('saved', () => {});

  // options
  qs('#btn-menu').addEventListener('click', () => { Audio.play('click'); openPanel('stats'); });
  qs('#btn-sfx').addEventListener('click', () => { Game.toggleSetting('sfx'); paintQuickToggles(); });
  qs('#btn-music').addEventListener('click', () => { Game.toggleSetting('music'); paintQuickToggles(); Audio.play('click'); });
  qs('#btn-crt').addEventListener('click', () => { Game.toggleSetting('crt'); paintQuickToggles(); });

  bus.on('panel:open', (id) => {
    if (id === 'quests') { Game.refreshQuests(); }
    Audio.resume();
  });

  // prestige depuis le dock
  bus.on('open:prestige', () => {
    if (Game.state.lifetime < 1e7) {
      infoModal({
        title: '🌟 Prestige',
        body: el('p', { class: 'small', html: `Le prestige remet la ville à zéro contre des <b>étoiles permanentes</b>. Il faut avoir gagné au moins <b>${fmt(1e8)} 🪙</b> dans le cycle pour obtenir la première étoile.<br><br>Pour l’instant tu as gagné <b>${fmt(Game.state.run)} 🪙</b> dans ce cycle.` }),
      });
      return;
    }
    showPrestige(Game);
  });
}

function paintQuickToggles() {
  const st = Game.settings();
  qs('#btn-sfx').classList.toggle('on', st.sfx);
  qs('#btn-music').classList.toggle('on', st.music);
  qs('#btn-crt').classList.toggle('on', st.crt);
}

// ── Entrées tactiles / souris ───────────────────────────────
function wireInput(canvas) {
  let downPos = null, downTime = 0, moved = false, lastTap = 0, lastTapPos = { x: 0, y: 0 };
  const pointers = new Map();

  const isDraggable = () => Game.view && WORLD.w * Game.view.scale > Game.view.vw + 2;

  canvas.addEventListener('pointerdown', (e) => {
    Audio.resume();
    if (!Audio._musicTimer && Audio.musicOn) Audio.startMusic();
    canvas.setPointerCapture?.(e.pointerId);
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    downPos = { x: e.clientX, y: e.clientY };
    downTime = performance.now();
    moved = false;

    // Faire disparaître un panneau ouvert
    if (isPanelOpen()) { closePanel(); downPos = null; return; }

    // Feedback immédiat : on encaisse le tap dès l'appui (bien plus nerveux)
    if (pointers.size <= 3) {
      const now = performance.now();
      const near = Math.hypot(e.clientX - lastTapPos.x, e.clientY - lastTapPos.y) < 40;
      const isDouble = now - lastTap < 280 && near;
      lastTap = now;
      lastTapPos = { x: e.clientX, y: e.clientY };
      Game.tap(e.clientX, e.clientY, isDouble);
    } else {
      downPos = null;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!downPos) return;
    const dist = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
    if (dist > 10) moved = true;
    if (moved && isDraggable()) Game.panBy(-(e.clientX - prev.x), -(e.clientY - prev.y));
  });

  const end = (e) => {
    pointers.delete(e.pointerId);
    if (moved && isDraggable() && Game.view) {
      // on garde la caméra là où le doigt l'a laissée
      Game.lastTouch = Date.now();
    }
    downPos = null;
  };

  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); downPos = null; });
  canvas.addEventListener('pointerleave', (e) => { pointers.delete(e.pointerId); });

  // clavier (desktop)
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (e.code === 'Space') {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      Game.tap(r.left + r.width * (0.36 + Math.random() * 0.28), r.top + r.height * 0.62, false);
    } else if (k === 'b') openPanel('build');
    else if (k === 'u') openPanel('up');
    else if (k === 's') openPanel('shop');
    else if (k === 'q') openPanel('quests');
    else if (k === 'a') openPanel('ach');
    else if (k === 'p') bus.emit('open:prestige');
    else if (k === 'escape') closePanel();
    else if (k === 'r') showReceipts();
    else if (k === 'f' && Game.scene) { Game.scene.spawnTaxi(); }
  });

  // le premier geste débloque l'audio (politique des navigateurs)
  const unlock = () => { Audio.resume(); if (Audio.musicOn) Audio.startMusic(); };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  // pas de menu contextuel ni de zoom gestuel qui casse le tap
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
}

// ── Boucle UI (HUD, badges) ─────────────────────────────────
let last = performance.now(), badgeT = 0, logT = 0;
function uiLoop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (Game.ready) {
    updateHud(Game, dt);
    badgeT += dt;
    if (badgeT > 0.4) { badgeT = 0; updateDockBadges(Game); }
  }
  requestAnimationFrame(uiLoop);
}

// ── Service worker (PWA) ────────────────────────────────────
function registerSW() {
  if (!navigator.serviceWorker || typeof navigator.serviceWorker.register !== 'function') return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  setTimeout(() => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }, 2500);
}

// Démarrage
boot().then(() => {
  paintQuickToggles();
  requestAnimationFrame(uiLoop);
}).catch((e) => {
  console.error(e);
  document.getElementById('boot-tip').textContent = 'Erreur au démarrage : ' + e.message;
});

window.PixCity = { Game, bus };
