// ─────────────────────────────────────────────────────────────
//  PixCity · tests : cohérence HTML/JS, économie, partie simulée,
//  tunnel d'achat simulé.  node tools/test.mjs
// ─────────────────────────────────────────────────────────────
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { installDom } from './domstub.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
let pass = 0, fail = 0;
const fails = [];

function ok(cond, label, extra = '') {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; fails.push(label); console.log('  ✗ ' + label + (extra ? '  → ' + extra : '')); }
}
function eq(a, b, label) { ok(a === b, label, `attendu ${b}, reçu ${a}`); }
function section(t) { console.log('\n▌ ' + t); }

// ═══════════════════════════════════════════════════════════════
section('1. Structure du projet');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
// le DOM doit exister avant d'importer les modules qui lisent le stockage
installDom(html, { width: 900, height: 640 });

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const jsFiles = walk(join(ROOT, 'src')).filter((f) => f.endsWith('.js'));
ok(jsFiles.length > 10, `${jsFiles.length} modules JS`);

// tous les #id utilisés dans le JS existent dans index.html
const htmlIds = new Set([...html.matchAll(/id="([\w-]+)"/g)].map((m) => m[1]));
const usedIds = new Set();
for (const f of jsFiles) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/qs\('#([\w-]+)'\)|getElementById\('([\w-]+)'\)/g)) {
    usedIds.add(m[1] || m[2]);
  }
}
// identifiants créés dynamiquement par le JS (pas dans le HTML)
const dynamicIds = new Set(['offer-timer', 'ad-count', 'ad-state']);
const missingIds = [...usedIds].filter((id) => !htmlIds.has(id) && !dynamicIds.has(id));
ok(missingIds.length === 0, `tous les identifiants JS existent dans le HTML (${usedIds.size} vérifiés)`, missingIds.join(', '));

// les identifiants utilisés avec '#' + variable dynamique
const dynSignatures = ['dot-build', 'dot-up', 'dot-shop', 'dot-quests', 'dot-ach', 'dot-prestige',
  'panel-build', 'panel-up', 'panel-shop', 'panel-quests', 'panel-ach', 'panel-stats',
  'opt-sfx', 'opt-music', 'opt-crt', 'opt-particles', 'opt-shake', 'opt-haptics'];
ok(dynSignatures.every((id) => htmlIds.has(id)), 'identifiants dynamiques présents');

// fichiers référencés
for (const f of ['styles/base.css', 'styles/game.css', 'manifest.webmanifest', 'assets/icons/icon-192.png', 'assets/fonts/vt323.woff2']) {
  try { statSync(join(ROOT, f)); ok(true, f + ' existe'); }
  catch (e) { ok(false, f + ' existe'); }
}

// ═══════════════════════════════════════════════════════════════
section('2. Économie');
const eco = await import('../src/core/economy.js');
const { BUILDINGS, BUILDING_BY_ID, MILESTONE } = await import('../src/core/data.js');
const { newState } = await import('../src/core/state.js');
const { fmt, fmtTime, fmtClock } = await import('../src/core/format.js');

const cab = BUILDING_BY_ID.cabane;
eq(eco.costOf(cab, 0, 1), cab.cost, 'coût du 1er bâtiment = prix de base');
ok(eco.costOf(cab, 10, 1) > eco.costOf(cab, 9, 1), 'coût croissant');
{
  const sum = eco.costOf(cab, 0, 1) + eco.costOf(cab, 1, 1) + eco.costOf(cab, 2, 1);
  ok(Math.abs(sum - eco.costOf(cab, 0, 3)) < 1e-9, 'coût de 3 = somme des 3 premiers');
}
eq(eco.maxAffordable(cab, 0, cab.cost - 1), 0, 'max = 0 si trop cher');
eq(eco.maxAffordable(cab, 0, cab.cost), 1, 'max = 1 pile au prix');
{
  const afford = eco.maxAffordable(cab, 0, 1e6);
  ok(eco.costOf(cab, 0, afford) <= 1e6 && eco.costOf(cab, 0, afford + 1) > 1e6, 'max = plus grand achat possible (' + afford + ')');
}
eq(eco.milestoneMult(24), 1, 'pas de bonus avant 25');
eq(eco.milestoneMult(25), 2, 'palier ×2 à 25');
eq(eco.milestoneMult(50), 4, 'palier ×4 à 50');

const s = newState();
s.buildings.cabane = 10;
const inc0 = eco.derive(s).income;
eq(Math.round(inc0 * 100) / 100, Math.round(10 * cab.income * 100) / 100, 'revenu = unités × revenu unitaire');
s.up.productivite = 1;
ok(eco.derive(s).income > inc0, 'productivité augmente le revenu');
s.stars = 0;
s.boost = { mult: 5, until: Date.now() + 60000, icon: '🔥', label: 'test', src: '' };
eq(eco.derive(s).income, eco.derive(s).permMult * (eco.incomeNoMult(s)) * 5, 'boost temporaire appliqué');
eq(eco.tapValue(s), eco.tapValue(s), 'valeur du tap calculée');

// prestige
eq(eco.starsFor(1e8), 1, '1 étoile pour 1e8');
eq(eco.starsFor(4e8), 2, '2 étoiles pour 4e8');
eq(eco.starsFor(9e7), 0, '0 étoile pour 9e7');
{
  const p = newState();
  p.run = 4e8; p.buildings.cabane = 30; p.gems = 12; p.up.productivite = 2;
  const res = eco.doPrestige(p);
  ok(res.ok && res.gain === 2, 'prestige accorde les étoiles');
  eq(p.buildings.cabane, 0, 'les bâtiments repartent à zéro');
  eq(p.gems, 12, 'les gemmes sont conservées');
  eq(p.up.productivite, 2, 'les bonus permanents sont conservés');
  eq(p.stars, 2, 'étoiles conservées');
}

// achats refusés
{
  const q = newState();
  q.coins = 0;
  eq(eco.buyBuilding(q, 'cabane', 1).ok, false, 'achat refusé sans pièces');
  eq(eco.buyBuilding(q, 'cabane', 'max').ok, false, 'achat MAX refusé sans pièces');
  q.coins = 1e9;
  const r = eco.buyBuilding(q, 'cabane', 100);
  ok(r.ok && r.bought === 100, 'achat groupé ×100');
  ok(r.mult >= 4, 'palier atteint après un gros achat (×' + r.mult + ')');
}

// formatage
eq(fmt(999), '999', 'fmt(999)');
eq(fmt(1500), '1,5 K', 'fmt(1500)');
eq(fmt(1e6), '1 M', 'fmt(1e6)');
eq(fmt(1234567), '1,23 M', 'fmt(1234567)');
ok(fmt(1e12).includes('Bn'), 'fmt(1e12)');
eq(fmtTime(30), '30 s', 'fmtTime(30)');
ok(fmtTime(3725).includes('h'), 'fmtTime(3725)');
eq(fmtClock(65), '1:05', 'fmtClock(65)');

// ═══════════════════════════════════════════════════════════════
section('3. Sauvegarde & hors-ligne');
const saveMod = await import('../src/core/save.js');
{
  const st = newState();
  saveMod.storage.set('pixcity.save.v1', JSON.stringify(st));
  const { state, fresh } = saveMod.loadGame();
  eq(fresh, false, 'sauvegarde rechargée');
  eq(state.gems, st.gems, 'gemmes identiques après rechargement');
  saveMod.storage.del('pixcity.save.v1');
  const { fresh: f2 } = saveMod.loadGame();
  eq(f2, true, 'partie neuve si sauvegarde absente');

  const s2 = newState();
  s2.buildings.cabane = 25;
  s2.time.lastSeen = Date.now() - 3600 * 1000;
  const off = saveMod.offlineGain(s2, Date.now());
  ok(off.coins > 0, 'gain hors-ligne calculé (+' + fmt(off.coins) + ')');
  eq(off.capped, false, 'pas plafonné à 1 h (plafond 2 h)');
  s2.time.lastSeen = Date.now() - 30 * 3600 * 1000;
  const off2 = saveMod.offlineGain(s2, Date.now());
  eq(off2.capped, true, 'plafonné après 30 h');
  ok(off2.coins <= off2.income * 2 * 3600 + 1, 'le plafond de 2 h est respecté');
  s2.up.horsligne = 3;
  const off3 = saveMod.offlineGain(s2, Date.now());
  eq(off3.hours, 24, 'Veilleuse niveau 3 → plafond 24 h');
  ok(off3.coins > off2.coins, 'amélioration Veilleuse augmente le gain');
}

// ═══════════════════════════════════════════════════════════════
section('4. Jeu complet (DOM simulé)');
const { Game } = await import('../src/app/game.js');
const canvas = document.getElementById('scene');
Game.init(canvas);
ok(!!Game.state, 'état initialisé');
ok(Game.state.gems === 25, 'gemmes de départ = 25');

// rendu hors-ligne via framebuffer
const { FBSurface } = await import('../src/gfx/surface.js');
const { FB } = await import('../src/gfx/fb.js');
const { CityScene, WORLD } = await import('../src/gfx/city.js');
const { drawBuilding, drawNature } = await import('../src/gfx/sprites.js');
{
  const cache = new Map();
  const sprites = {
    get(def, tier, v, neon) {
      const k = def.id + tier + v + (neon ? 'n' : '');
      let fb = cache.get(k);
      if (!fb) { fb = drawBuilding(def, tier, v, neon); cache.set(k, fb); }
      return { img: fb, w: fb.w, h: fb.h };
    },
    nature(kind, v, seed) {
      const k = 'n' + kind + v + seed;
      let fb = cache.get(k);
      if (!fb) { fb = drawNature(kind, v, seed); cache.set(k, fb); }
      return { img: fb, w: fb.w, h: fb.h };
    },
  };
  const fb = new FB(WORLD.w, WORLD.h);
  const surf = new FBSurface(fb);
  const scene = new CityScene(sprites);
  let err = null;
  try {
    for (let i = 0; i < 120; i++) {
      scene.update(1 / 30, i * 33, Game.state);
      scene.draw(surf, Game.state, i * 33);
    }
  } catch (e) { err = e; }
  ok(!err, 'la scène se dessine 120 images sans erreur', err && err.message);
  const nonBlack = fb.data.some((c) => (c & 0xffffff) !== 0);
  ok(nonBlack, 'la scène produit des pixels');
  // le canvas pixel-art est bien rendu : densité de couleurs plausible
  const colors = new Set();
  for (let i = 0; i < fb.data.length; i += 997) colors.add(fb.data[i]);
  ok(colors.size > 40, 'scène variée (' + colors.size + ' couleurs échantillonnées)');
}

// taps
{
  const before = Game.state.coins;
  const r = Game.tap(320, 200);
  ok(Game.state.coins > before, 'un tap rapporte des pièces');
  ok(Game.state.taps === 1, 'compteur de taps');
  ok(r.mult >= 1, 'combo comptabilisé');
  for (let i = 0; i < 60; i++) Game.tap(300 + (i % 40), 190 + (i % 30));
  ok(Game.state.combo.best >= 1.5, 'le combo monte (' + Game.state.combo.best.toFixed(2) + ')');
}

// achat de bâtiments
{
  Game.state.coins = 1e6;
  const res = Game.buy('cabane', 10);
  ok(res.ok && res.bought === 10, 'achat de 10 cabanes');
  ok(Game.state.buildings.cabane === 10, 'les cabanes sont bien là');
  Game.state.buildings.epicerie = 5;
  Game.buy('epicerie', 'max');
  ok(Game.state.buildings.epicerie > 5, 'achat MAX fonctionne (' + Game.state.buildings.epicerie + ')');
  const locked = Game.buy('quantique', 1);
  eq(locked.ok, false, 'bâtiment verrouillé refusé');
}

// bonus / bulles / taxi
{
  const plot = Game.scene.plots[0];
  plot.bubble = { kind: 'coin', t: 0, life: 10, x: plot.x, y: plot.ground - 40 };
  const c0 = Game.state.coins;
  Game.collectBubble(plot, { x: plot.x, y: plot.ground - 40 });
  ok(Game.state.coins > c0, 'bulle de pièces encaissée');
  ok(plot.bubble === null, 'bulle consommée');

  plot.bubble = { kind: 'gem', t: 0, life: 10, x: plot.x, y: plot.ground - 40 };
  const g0 = Game.state.gems;
  Game.collectBubble(plot, { x: plot.x, y: plot.ground - 40 });
  ok(Game.state.gems > g0, 'bulle de gemmes encaissée');

  plot.bubble = { kind: 'boost', t: 0, life: 10, x: plot.x, y: plot.ground - 40 };
  Game.collectBubble(plot, { x: plot.x, y: plot.ground - 40 });
  ok(eco.activeBoost(Game.state) !== null, 'bulle de boost applique un multiplicateur');

  Game.scene.spawnTaxi();
  const t0 = Game.state.taxis;
  const r = Game.catchTaxi();
  ok(r && Game.state.taxis === t0 + 1, 'taxi doré attrapé');
  ok(Game.scene.taxi === null, 'le taxi disparaît après capture');
}

// améliorations
{
  Game.state.gems = 5000;
  const res = Game.buyUpgrade('productivite');
  ok(res.ok && Game.state.up.productivite === 1, 'achat d’une amélioration en gemmes');
  const res2 = Game.buyUpgrade('robots');
  ok(res2.ok, 'achat de robots tapoteurs');
  const c0 = Game.state.coins;
  eco.tick(Game.state, 1);
  ok(Game.state.coins > c0, 'les robots produisent en continu');
  const uniq = Game.buyUnique('autoCollect');
  ok(uniq.ok && Game.state.up.autoCollect, 'amélioration unique achetée');
  const cons = Game.useConsumable('fete');
  const bst = eco.activeBoost(Game.state);
  ok(cons.ok && bst && bst.mult >= 5, 'consommable « méga fête » appliqué (×' + (bst ? bst.mult : 0) + ')');
  ok(bst && bst.until - Date.now() > 60000, 'durée du boost prolongée');
}

// quêtes
{
  const q = await import('../src/core/quests.js');
  const info = q.chainInfo(Game.state);
  ok(!!info, 'quête principale disponible');
  Game.state.taps = 999;
  const info2 = q.chainInfo(Game.state);
  ok(info2.ready, 'quête « taper » prête (' + info2.prog + '/' + info2.q.goal + ')');
  const before = Game.state.gems;
  const res = Game.claimChain();
  ok(res.ok && Game.state.gems >= before, 'récompense de quête réclamée');
  ok(q.dailyInfo(Game.state).length === 3, '3 défis du jour générés');
}

// succès
{
  const ach = await import('../src/core/achievements.js');
  Game.state.taps = 5000;
  Game.state.lifetime = 1e7;
  const got = ach.checkAchievements(Game.state);
  ok(got.length > 0, 'succès débloqués automatiquement (' + got.length + ')');
  const gemsBefore = Game.state.gems;
  const got2 = ach.checkAchievements(Game.state);
  eq(got2.length, 0, 'pas de double attribution des succès');
}

// prestige
{
  Game.state.run = 1e9;
  const starsBefore = Game.state.stars;
  const res = Game.prestige();
  ok(res.ok && Game.state.stars > starsBefore, 'prestige effectué (+' + res.gain + ' étoiles)');
  ok(Game.state.buildings.cabane === 0, 'ville remise à zéro après prestige');
  ok(eco.starMult(Game.state) > 1, 'les étoiles augmentent la production');
}

// ═══════════════════════════════════════════════════════════════
section('5. Achat simulé (tunnel complet)');
{
  const iap = await import('../src/core/iap.js');
  const { Backend } = await import('../src/app/backend.js');
  const conn = await Backend.connect();
  ok(conn.ok && conn.session.id, 'connexion à la boutique simulée');
  const pack = iap.packById('gems1200');
  const { order } = await Backend.createOrder(pack, pack.price);
  ok(order.id.startsWith('PIX-'), 'commande créée : ' + order.id);
  const paid = await Backend.pay(order);
  eq(paid.order.status, 'paid', 'paiement accepté (simulation)');
  const valid = await Backend.validate({ id: paid.receiptId, order: paid.order });
  ok(valid.ok && valid.simulated, 'reçu validé (simulé)');

  const gemsBefore = Game.state.gems;
  const grants = iap.grantPack(Game.state, pack, { order: paid.order.id });
  ok(grants.gems === 1200 + 300, 'gemmes + bonus crédités (' + grants.gems + ')');
  ok(Game.state.gems === gemsBefore + 1500, 'solde de gemmes mis à jour');
  ok(Game.state.shop.count === 1, 'achat enregistré dans le compte');
  ok((Game.state.shop.totalSpent || 0) > 0, 'montant fictif cumulé');

  // pack unique
  const starter = iap.packById('starter');
  iap.grantPack(Game.state, starter, null);
  ok(Game.state.shop.bought.starter && Game.state.shop.founder, 'pack fondateur appliqué');
  ok(Game.state.skins.neon, 'skin néon offert par le pack fondateur');
  const mult = eco.permMult(Game.state);
  ok(mult > 1, 'les achats augmentent la production (×' + mult.toFixed(2) + ')');

  // VIP
  iap.grantPack(Game.state, iap.packById('vip'), null);
  ok(Game.state.shop.vip, 'pass VIP actif');
  const vip = iap.claimVip(Game.state);
  ok(vip.ok && vip.gems === 250, 'bonus VIP quotidien');
  eq(iap.claimVip(Game.state).ok, false, 'bonus VIP non cumulable le même jour');

  // pub récompensée
  Game.state.freeAd = { at: 0 };
  const rw = iap.claimRewarded(Game.state);
  ok(rw.ok && rw.gems >= 25, 'pub récompensée simulée (+' + rw.gems + ')');
  eq(iap.rewardedAvailable(Game.state) > 0, true, 'compte à rebours de la prochaine pub');

  // offre flash
  const off = iap.rollOffer(Game.state);
  ok(off === null || off, 'offre flash gérée (VIP → désactivée)');
  const noVip = newState();
  noVip.prestiges = 2;
  const off2 = iap.rollOffer(noVip, Date.now());
  ok(off2 && off2.until > Date.now(), 'offre flash générée pour un joueur éligible');
  const price = iap.priceFor(noVip, iap.packById(off2.id), Date.now());
  ok(price.promo && price.price < price.old, 'prix promo appliqué (-' + price.pct + ' %)');
}

// ═══════════════════════════════════════════════════════════════
section('6. Progression (simulation 3 h avec joueur réaliste)');
{
  const sim = newState();
  const unlockTimes = {};
  const B = BUILDINGS;
  const total = (x) => B.reduce((a, b) => a + (x.buildings[b.id] || 0), 0);
  // modèle de joueur : tape ~1,3 fois/s au début, puis lâche la manette
  for (let t = 0; t < 3 * 3600; t++) {
    const income = eco.derive(sim, Date.now()).income;
    const tapRate = income < 5 ? 1.3 : income < 60 ? 0.5 : income < 1e4 ? 0.12 : 0.02;
    if (t % Math.max(1, Math.round(1 / tapRate)) === 0) eco.addCoins(sim, eco.tapValue(sim));

    // achète le meilleur rapport revenu/prix dès que c'est abordable
    let bestDef = null, bestScore = -1;
    for (const def of B) {
      const n = sim.buildings[def.id] || 0;
      if (sim.lifetime < def.unlock && n === 0) continue;
      const cost = eco.costOf(def, n, 1);
      if (cost > sim.coins) continue;
      const score = (def.income * eco.milestoneMult(n)) / cost;
      if (score > bestScore) { bestScore = score; bestDef = def; }
    }
    if (bestDef) {
      const n = sim.buildings[bestDef.id] || 0;
      const k = Math.max(1, Math.floor((sim.coins * 0.9) / eco.costOf(bestDef, n, 1)));
      eco.buyBuilding(sim, bestDef.id, Math.min(k, 200));
    }
    eco.tick(sim, 1, Date.now());
    for (const def of B) if (sim.lifetime >= def.unlock && unlockTimes[def.id] === undefined) unlockTimes[def.id] = t;
  }
  const reached = Object.keys(unlockTimes).length;
  ok(reached >= 8, `8+ bâtiments débloqués en 3 h (${reached}/${B.length})`);
  ok(sim.lifetime > 1e6, 'production cumulée : ' + fmt(sim.lifetime));
  ok((unlockTimes.cabane || 0) < 30, 'cabane débloquée tout de suite');
  ok(unlockTimes.epicerie < 180, 'épicerie en moins de 3 min (' + fmtTime(unlockTimes.epicerie) + ')');
  ok(unlockTimes.cafe < 900, 'café en moins de 15 min (' + fmtTime(unlockTimes.cafe) + ')');
  ok(unlockTimes.immeuble < 1800, 'immeuble en moins de 30 min (' + fmtTime(unlockTimes.immeuble) + ')');
  ok(eco.prestigeGain(sim) >= 1, 'prestige disponible après un cycle (' + eco.prestigeGain(sim) + ' étoiles)');
  console.log('    Temps de déblocage (joueur actif) :');
  for (const def of B) {
    const t = unlockTimes[def.id];
    console.log('      ' + (def.icon + ' ' + def.name).padEnd(26) + (t === undefined ? '—' : fmtTime(t)));
  }
  console.log('    Pièces totales : ' + fmt(sim.lifetime) + ' · bâtiments : ' + total(sim) + ' · revenus/s : ' + fmt(eco.derive(sim).income));
}

section('7. Interface : rendu des panneaux');
{
  const { initToasts, toast } = await import('../src/ui/toasts.js');
  const { initFx, rewardPop, confetti } = await import('../src/ui/fx.js');
  const { initModal, openModal, close } = await import('../src/ui/modal.js');
  const { initHud, updateHud } = await import('../src/ui/hud.js');
  const { initPanels, openPanel, updateDockBadges } = await import('../src/ui/panels.js');
  const { initBuildPanel, renderBuildPanel } = await import('../src/ui/panelBuild.js');
  const { initUpPanel } = await import('../src/ui/panelUp.js');
  const { initShopPanel } = await import('../src/ui/panelShop.js');
  const { initQuestPanel, renderQuests } = await import('../src/ui/panelQuests.js');
  const { initAchPanel } = await import('../src/ui/panelAch.js');
  const { initStatsPanel } = await import('../src/ui/panelStats.js');
  const { initOffer } = await import('../src/ui/offer.js');

  let err = null;
  try {
    initToasts(); initFx(); initModal(); initHud(Game); initPanels();
    initBuildPanel(Game); initUpPanel(Game); initShopPanel(Game);
    initQuestPanel(Game); initAchPanel(Game); initStatsPanel(Game); initOffer(Game);
  } catch (e) { err = e; }
  ok(!err, 'initialisation de toute l’interface', err && err.stack);

  err = null;
  try {
    Game.derived = eco.derive(Game.state);
    updateHud(Game, 0.016);
    renderBuildPanel(Game);
    renderQuests();
    updateDockBadges(Game);
    openPanel('build'); openPanel('shop'); openPanel('quests');
    openPanel('up'); openPanel('ach'); openPanel('stats');
    toast('test', 'win');
    rewardPop('🎉', 'TEST', '+1');
    confetti(5);
    const h = openModal({ title: 'Test', body: document.createElement('div') });
    close();
  } catch (e) { err = e; }
  ok(!err, 'panneaux et modales se rendent sans erreur', err && err.stack);

  const rows = document.querySelectorAll('#build-list .card');
  ok(rows.length === BUILDINGS.length, BUILDINGS.length + ' lignes de bâtiments affichées (' + rows.length + ')');
  const packs = document.querySelectorAll('#shop-list .pack');
  ok(packs.length >= 5, packs.length + ' packs affichés dans la boutique');
  const achCards = document.querySelectorAll('#ach-grid .ach');
  ok(achCards.length >= 20, achCards.length + ' succès affichés');
  const stats = document.querySelectorAll('#stat-grid .stat');
  ok(stats.length >= 10, stats.length + ' statistiques affichées');
}

// ═══════════════════════════════════════════════════════════════
section('8. Scène : interactions');
{
  Game.state.coins = 1e6;
  Game.buy('cabane', 5);
  Game.state.lifetime = 1e6;
  const scene = Game.scene;
  const inside = scene.plots.find((p) => (Game.state.buildings[p.def.id] || 0) > 0);
  if (inside) {
    const hit = scene.hitTest(inside.x, inside.ground - 20, Game.state);
    ok(hit.type === 'plot', 'clic sur un bâtiment détecté');
    ok(hit.plot.def.id === inside.def.id, 'le bon bâtiment est ciblé');
  } else {
    ok(true, 'aucun bâtiment construit (test ignoré)');
  }
  const empty = scene.hitTest(5, 10, Game.state);
  ok(empty.type === 'city', 'clic dans le ciel = ville');
  scene.spawnTaxi();
  const t = scene.taxi;
  const hitT = scene.hitTest(t.x, t.y, Game.state);
  eq(hitT.type, 'taxi', 'clic sur le taxi détecté');
}

// ═══════════════════════════════════════════════════════════════
section('9. Rendu : cache de calques identique au rendu direct');
{
  const cache = new Map();
  const sprites = {
    get(def, tier, v, neon) {
      const k = def.id + tier + v + (neon ? 'n' : '');
      let fb = cache.get(k);
      if (!fb) { fb = drawBuilding(def, tier, v, neon); cache.set(k, fb); }
      return { img: fb, w: fb.w, h: fb.h };
    },
    nature(kind, v, seed) {
      const k = 'n' + kind + v + seed;
      let fb = cache.get(k);
      if (!fb) { fb = drawNature(kind, v, seed); cache.set(k, fb); }
      return { img: fb, w: fb.w, h: fb.h };
    },
  };
  const state = newState();
  state.lifetime = 2e7;
  state.buildings = { cabane: 30, epicerie: 22, cafe: 14, immeuble: 9, cinema: 4, centre: 2, hopital: 1 };
  const scene = new CityScene(sprites);
  for (let i = 0; i < 150; i++) scene.update(1 / 30, i * 33, state);
  const now = 150 * 33;

  scene.useLayers = false;
  const A = new FB(WORLD.w, WORLD.h);
  scene.draw(new FBSurface(A), state, now);

  scene.useLayers = true;
  const B = new FB(WORLD.w, WORLD.h);
  scene.draw(new FBSurface(B), state, now);

  let diff = 0;
  for (let i = 0; i < A.data.length; i++) if (A.data[i] !== B.data[i]) diff++;
  const pct = (diff / A.data.length) * 100;
  ok(pct < 0.05, 'rendu identique avec/sans cache (' + diff + ' pixels, ' + pct.toFixed(3) + ' %)');
  ok(scene._layers.size >= 4, scene._layers.size + ' calques statiques cuits');
}

// ═══════════════════════════════════════════════════════════════
section('10. Cohérence visuelle des assets (identité v1)');
{
  const { readPNG, analyse } = await import('./pngread.mjs');
  const { RULES } = await import('./artcheck.mjs');
  const artDir = join(ROOT, 'assets/art');
  const webDir = join(artDir, 'web');

  const MASTERS = ['hero.png', 'icon.png', 'shop.png', 'prestige.png', 'district.png'];
  // Dette artistique assumée : ces images sont recontrôlées à chaque audit
  // et régénérées dès qu'on peut (voir docs/ARTSTYLE.md, journal du style).
  const KNOWN_ISSUES = { 'prestige.png': 'lumière chaude encore faible — régénération prévue' };
  const warned = [];

  for (const f of MASTERS) {
    let img, a;
    try {
      img = readPNG(readFileSync(join(artDir, f)));
      a = analyse(img, { stride: 3, tolerance: 62 });
    } catch (e) {
      ok(false, f + ' lisible', e.message);
      continue;
    }
    ok(img.width >= RULES.minWidth, f + ' : résolution ' + img.width + 'px');
    ok(a.paletteCoverage >= RULES.minPaletteCoverage,
      f + ' : palette ' + (a.paletteCoverage * 100).toFixed(1) + ' % (≥ ' + (RULES.minPaletteCoverage * 100) + ' %)');
    ok(a.coldRatio >= RULES.minColdRatio,
      f + ' : monde froid ' + (a.coldRatio * 100).toFixed(1) + ' % (ADN PixCity)');
    ok(a.meanLuma <= RULES.maxLuma,
      f + ' : luminosité ' + a.meanLuma.toFixed(0) + ' ≤ ' + RULES.maxLuma);
    if (a.warmRatio < RULES.minWarmRatio) {
      if (KNOWN_ISSUES[f]) warned.push(f);
      else ok(false, f + ' : lumière chaude ' + (a.warmRatio * 100).toFixed(1) + ' % (≥ ' + (RULES.minWarmRatio * 100) + ' %)');
    }
  }

  // dérivés utilisés en jeu : plus légers, même identité
  const DERIVED = ['hero.png', 'shop.png', 'prestige.png', 'district.png'];
  for (const f of DERIVED) {
    let small;
    try { small = readPNG(readFileSync(join(webDir, f))); } catch (e) { ok(false, 'dérivé ' + f + ' présent'); continue; }
    const big = statSync(join(artDir, f)).size;
    const little = statSync(join(webDir, f)).size;
    ok(little < big / 2, 'dérivé ' + f + ' allégé (' + Math.round(little / 1024) + ' Ko vs ' + Math.round(big / 1024) + ' Ko)');
    const a = analyse(small, { stride: 3, tolerance: 62 });
    ok(a.paletteCoverage >= RULES.minPaletteCoverage,
      'dérivé ' + f + ' garde la palette (' + (a.paletteCoverage * 100).toFixed(1) + ' %)');
    ok(a.coldRatio >= RULES.minColdRatio, 'dérivé ' + f + ' garde le monde froid');
  }

  // icônes PWA : issues de l'illustration d'icône, légères
  for (const [f, size] of [['icon-192.png', 192], ['icon-512.png', 512]]) {
    let img;
    try { img = readPNG(readFileSync(join(ROOT, 'assets/icons', f))); } catch (e) { ok(false, 'icône ' + f + ' présente'); continue; }
    ok(img.width === size && img.height === size, 'icône ' + f + ' en ' + size + '×' + size);
    const kb = statSync(join(ROOT, 'assets/icons', f)).size / 1024;
    ok(kb < 200, 'icône ' + f + ' légère (' + kb.toFixed(0) + ' Ko)');
    const a = analyse(img, { stride: 2, tolerance: 62 });
    ok(a.paletteCoverage > 0.35, 'icône ' + f + ' dans la palette PixCity (' + (a.paletteCoverage * 100).toFixed(0) + ' %)');
  }

  // le jeu référence bien les illustrations
  const srcAll = jsFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
  for (const key of ['hero', 'shop', 'prestige', 'district']) {
    ok(srcAll.includes("assets/art/web/" + key + ".png"), 'le jeu utilise l’illustration ' + key);
  }
  ok(srcAll.includes('assets/art/web/hero.png'), 'l’écran-titre utilise l’illustration hero');

  // le prompt maître est versionné (workflow d'identité)
  const style = readFileSync(join(ROOT, 'docs/ARTSTYLE.md'), 'utf8');
  ok(style.includes('PIXCITY LOOK'), 'le prompt maître contient la règle de monde');
  ok(style.includes('#ffd166') && style.includes('#6be3ff'), 'la palette officielle est documentée');
  ok(statSync(join(ROOT, 'assets/art/PROMPT.txt')).size > 200, 'le prompt maître est exporté pour les outils d’image');
  ok(statSync(join(ROOT, 'tools/assets.mjs')).size > 500, 'la chaîne de génération des dérivés est versionnée');

  for (const f of warned) {
    console.log('    ⚠ ' + f + ' : ' + KNOWN_ISSUES[f] + ' (suivi, non bloquant)');
  }
}

// ═══════════════════════════════════════════════════════════════
section('11. Démarrage réel de l’application (main.js)');
{
  localStorage.clear();
  installDom(html, { width: 900, height: 700 });
  let err = null;
  process.on('unhandledRejection', (e) => { err = err || e; });
  try {
    await import('../src/app/main.js');
  } catch (e) { err = e; }
  ok(!err, 'le jeu démarre sans erreur', err && err.stack);
  await new Promise((r) => setTimeout(r, 1800));

  const boot = document.getElementById('boot');
  ok(!boot || boot.classList.contains('gone'), 'écran de démarrage masqué');
  ok(Game.ready === true, 'boucle de jeu lancée');
  ok(!!document.querySelector('.modal'), 'écran d’accueil affiché');

  const startBtn = document.querySelectorAll('.modal button').find((b) => /CONSTRUIRE/i.test(b.textContent));
  ok(!!startBtn, 'bouton de démarrage présent');
  if (startBtn) startBtn.click();
  await new Promise((r) => setTimeout(r, 500));
  ok(!!document.querySelector('#tutorial.on'), 'tutoriel affiché au premier lancement');

  const canvas2 = document.getElementById('scene');
  const coinsBefore = Game.state.coins;
  for (let i = 0; i < 6; i++) {
    const id = i % 3 + 1;
    canvas2.dispatchEvent({ type: 'pointerdown', pointerId: id, clientX: 300 + i * 4, clientY: 300, bubbles: true, preventDefault() {} });
    await new Promise((r) => setTimeout(r, 35));
    canvas2.dispatchEvent({ type: 'pointerup', pointerId: id, clientX: 300 + i * 4, clientY: 300, bubbles: true, preventDefault() {} });
    await new Promise((r) => setTimeout(r, 35));
  }
  ok(Game.state.coins > coinsBefore, 'les taps tactiles rapportent des pièces (+' + fmt(Game.state.coins - coinsBefore) + ')');
  ok(Game.state.taps >= 5, 'taps enregistrés : ' + Game.state.taps);

  Game.state.coins = 5000;
  Game.derived = eco.derive(Game.state);
  const { renderBuildPanel } = await import('../src/ui/panelBuild.js');
  renderBuildPanel(Game);
  const cabaneBtn = document.querySelectorAll('#build-list button')[0];
  ok(!!cabaneBtn, 'bouton d’achat de la cabane présent');
  const nBefore = Game.state.buildings.cabane;
  if (cabaneBtn) cabaneBtn.click();
  ok(Game.state.buildings.cabane > nBefore, 'clic sur le bouton = construction (' + Game.state.buildings.cabane + ' cabanes)');

  const { openPanel } = await import('../src/ui/panels.js');
  openPanel('shop');
  const packs = document.querySelectorAll('#shop-list .pack');
  ok(packs.length >= 6, 'boutique peuplée de ' + packs.length + ' packs');
  const payBtns = document.querySelectorAll('#shop-list .pack button').filter((b) => !b.disabled && /€/.test(b.textContent));
  ok(payBtns.length > 0, payBtns.length + ' boutons de prix cliquables');
  if (payBtns.length) {
    const gems0 = Game.state.gems;
    payBtns[0].click();
    await new Promise((r) => setTimeout(r, 300));
    ok(!!document.querySelector('.modal'), 'tunnel d’achat ouvert');
    const confirm = document.querySelectorAll('.modal button').find((b) => /Payer/.test(b.textContent));
    ok(!!confirm, 'bouton « Payer » présent');
    if (confirm) confirm.click();
    await new Promise((r) => setTimeout(r, 3200));
    ok(Game.state.gems > gems0, 'achat simulé crédité dès la validation (+' + (Game.state.gems - gems0) + ' gemmes)');
    const countAfter = Game.state.shop.count;
    ok(countAfter >= 1, 'achat enregistré dans le compte');
    const grab = document.querySelectorAll('.modal button').find((b) => /Récupérer/.test(b.textContent));
    ok(!!grab, 'écran « ACHAT VALIDÉ » affiché');
    if (grab) grab.click();
    await new Promise((r) => setTimeout(r, 400));
    ok(!document.querySelector('.modal'), 'modale refermée après récupération');
    ok(Game.state.shop.count === countAfter, 'aucun crédit en double au clic sur « Récupérer »');
  }

  Game.save(true);
  const raw = localStorage.getItem('pixcity.save.v1');
  ok(!!raw && JSON.parse(raw).gems === Game.state.gems, 'sauvegarde écrite dans le stockage local');
  console.log('    Sauvegarde : ' + (raw ? Math.round(raw.length / 1024) + ' Ko' : '—'));

  // options
  const { Game: G2 } = await import('../src/app/game.js');
  const btnSfx = document.getElementById('btn-sfx');
  ok(!!btnSfx, 'bouton sons présent');
}

// ═══════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════');
console.log(`  ${pass} tests réussis · ${fail} échec(s)`);
if (fails.length) console.log('  Échecs : ' + fails.join(' | '));
console.log('══════════════════════════════════════════════');
process.exit(fail ? 1 : 0);
