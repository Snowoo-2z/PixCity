// ─────────────────────────────────────────────────────────────
//  PixCity · succès (petits objectifs à collectionner)
// ─────────────────────────────────────────────────────────────
import { BUILDINGS } from './data.js';
import { derive } from './economy.js';

export const ACH = [
  { id: 'a1', icon: '👆', name: 'Premier contact', desc: 'Tape 1 fois', gems: 1, test: (s) => s.taps >= 1 },
  { id: 'a2', icon: '💯', name: 'Doigté', desc: 'Tape 100 fois', gems: 3, test: (s) => s.taps >= 100 },
  { id: 'a3', icon: '🖐️', name: 'Doigt en béton', desc: 'Tape 1 000 fois', gems: 8, test: (s) => s.taps >= 1000 },
  { id: 'a4', icon: '🛖', name: 'Hameau', desc: '10 bâtiments construits', gems: 2, test: (s) => total(s) >= 10 },
  { id: 'a5', icon: '🏘️', name: 'Village', desc: '50 bâtiments construits', gems: 5, test: (s) => total(s) >= 50 },
  { id: 'a6', icon: '🏙️', name: 'Métropole', desc: '250 bâtiments construits', gems: 15, test: (s) => total(s) >= 250 },
  { id: 'a7', icon: '🪙', name: 'Petite cagnotte', desc: '1 million de pièces gagnées', gems: 3, test: (s) => s.lifetime >= 1e6 },
  { id: 'a8', icon: '💰', name: 'Maire riche', desc: '1 milliard de pièces gagnées', gems: 10, test: (s) => s.lifetime >= 1e9 },
  { id: 'a9', icon: '🏦', name: 'Fortune cosmique', desc: '1 000 milliards de pièces', gems: 25, test: (s) => s.lifetime >= 1e12 },
  { id: 'a10', icon: '🔥', name: 'Fièvre', desc: 'Combo ×10', gems: 4, test: (s) => s.combo.best >= 10 },
  { id: 'a11', icon: '🌋', name: 'Mains en feu', desc: 'Combo ×25', gems: 12, test: (s) => s.combo.best >= 25 },
  { id: 'a12', icon: '🚕', name: 'Chauffeur doré', desc: '5 taxis dorés', gems: 5, test: (s) => s.taxis >= 5 },
  { id: 'a13', icon: '🎁', name: 'Chasseur de bonus', desc: '50 bonus collectés', gems: 6, test: (s) => (s.collects || 0) >= 50 },
  { id: 'a14', icon: '🎡', name: 'Parc ouvert', desc: 'Parc d’Attractions débloqué', gems: 20, test: (s) => s.lifetime >= 5.5e8 },
  { id: 'a15', icon: '🚀', name: 'Cap sur les étoiles', desc: 'Gare Spatiale débloquée', gems: 40, test: (s) => s.lifetime >= 3.4e9 },
  { id: 'a16', icon: '🔮', name: 'Singularité', desc: 'Quartier Quantique débloqué', gems: 100, test: (s) => s.lifetime >= 2e10 },
  { id: 'a17', icon: '✨', name: 'Nouveau départ', desc: '1ᵉʳ prestige', gems: 10, test: (s) => s.prestiges >= 1 },
  { id: 'a18', icon: '🌟', name: 'Boucle dorée', desc: '5 prestiges', gems: 30, test: (s) => s.prestiges >= 5 },
  { id: 'a19', icon: '⭐', name: 'Centurion', desc: '100 étoiles gagnées', gems: 50, test: (s) => s.stars >= 100 },
  { id: 'a20', icon: '💎', name: 'Minuteur', desc: '500 gemmes accumulées', gems: 5, test: (s) => s.gems >= 500 },
  { id: 'a21', icon: '🧠', name: 'Stratège', desc: '20 améliorations achetées', gems: 12, test: (s) => upLevels(s) >= 20 },
  { id: 'a22', icon: '⏳', name: 'Assidu', desc: '1 heure de jeu', gems: 5, test: (s) => s.playtime >= 3600 },
  { id: 'a23', icon: '🕰️', name: 'Marathonien', desc: '5 heures de jeu', gems: 15, test: (s) => s.playtime >= 18000 },
  { id: 'a24', icon: '🤝', name: 'Bienfaiteur', desc: 'Un achat en boutique', gems: 10, test: (s) => s.shop.count >= 1 },
  { id: 'a25', icon: '👑', name: 'VIP', desc: 'Pass VIP activé', gems: 50, test: (s) => s.shop.vip },
];

function total(s) {
  return BUILDINGS.reduce((a, b) => a + (s.buildings[b.id] || 0), 0);
}
function upLevels(s) {
  return ['productivite', 'doigts', 'robots', 'combo', 'taxi', 'depart'].reduce((a, k) => a + (s.up[k] || 0), 0);
}

export const ACH_BY_ID = Object.fromEntries(ACH.map((a) => [a.id, a]));

/** Vérifie et débloque ; renvoie la liste des nouveaux succès. */
export function checkAchievements(s) {
  const out = [];
  const have = new Set(s.ach);
  for (const a of ACH) {
    if (have.has(a.id)) continue;
    let ok = false;
    try { ok = !!a.test(s); } catch (e) { ok = false; }
    if (ok) {
      s.ach.push(a.id);
      s.gems += a.gems;
      out.push(a);
    }
  }
  return out;
}

export function achProgress(s) {
  return { got: s.ach.length, total: ACH.length };
}
