// ─────────────────────────────────────────────────────────────
//  PixCity · toutes les données d'équilibrage du jeu
// ─────────────────────────────────────────────────────────────

/** Paliers de progression : 25 unités = ×2 de production pour ce bâtiment. */
export const MILESTONE = 25;
export const COST_GROWTH = 1.115;

/** Les 12 bâtiments de la ville. `unlock` = pièces gagnées pour le révéler. */
export const BUILDINGS = [
  {
    id: 'cabane', name: 'Cabane', icon: '🛖', cost: 15, income: 0.15, unlock: 0,
    blurb: 'Le début de tout grand empire.',
    pal: { wall: 0xb07a45, dark: 0x7d5227, light: 0xd8ab74, roof: 0x8c3b2f, win: 0xffd98a, accent: 0x6fbf73 },
  },
  {
    id: 'epicerie', name: 'Épicerie', icon: '🏪', cost: 110, income: 1.1, unlock: 80,
    blurb: 'Le quartier achète enfin ses carottes ici.',
    pal: { wall: 0xe8dcc0, dark: 0xb9a582, light: 0xfff6e2, roof: 0xd0504c, win: 0xffe9a8, accent: 0x3aa7a0 },
  },
  {
    id: 'cafe', name: 'Café', icon: '☕', cost: 950, income: 8, unlock: 800,
    blurb: 'Un expresso serré, deux croissants.',
    pal: { wall: 0xb0674a, dark: 0x7c422c, light: 0xd9926f, roof: 0x4a3226, win: 0xffcf7a, accent: 0xe0a020 },
  },
  {
    id: 'immeuble', name: 'Immeuble', icon: '🏢', cost: 8000, income: 55, unlock: 7000,
    blurb: 'Douze voisins, douze histoires, un ascenseur.',
    pal: { wall: 0x9aa7b8, dark: 0x6c7787, light: 0xc7d2e0, roof: 0x5a6678, win: 0xffe9a0, accent: 0xffd166 },
  },
  {
    id: 'cinema', name: 'Cinéma', icon: '🎬', cost: 60000, income: 380, unlock: 52000,
    blurb: 'Séance à 21 h 30, pop-corn illimité.',
    pal: { wall: 0x3a2f52, dark: 0x241c38, light: 0x584a78, roof: 0x241c38, win: 0xffe9a0, accent: 0xff4d6d },
  },
  {
    id: 'centre', name: 'Centre Commercial', icon: '🏬', cost: 400000, income: 2400, unlock: 350000,
    blurb: 'Tout, tout de suite, sur trois étages.',
    pal: { wall: 0xcfd6e0, dark: 0x9aa4b4, light: 0xeef3fa, roof: 0x6b7a90, win: 0x9fe8ff, accent: 0x37c5ff },
  },
  {
    id: 'hopital', name: 'Hôpital', icon: '🏥', cost: 2.6e6, income: 15000, unlock: 2.2e6,
    blurb: 'La ville grandit, les bobos aussi.',
    pal: { wall: 0xf2f5f8, dark: 0xc3ccd6, light: 0xffffff, roof: 0xd7dee6, win: 0xbfe6ff, accent: 0xff5566 },
  },
  {
    id: 'bureaux', name: 'Tour de Bureaux', icon: '🏙️', cost: 1.6e7, income: 95000, unlock: 1.4e7,
    blurb: 'Verre, réunions, vue imprenable.',
    pal: { wall: 0x2f4a6b, dark: 0x1d3049, light: 0x486c96, roof: 0x172437, win: 0xa8f0ff, accent: 0x6be3ff },
  },
  {
    id: 'gratteciel', name: 'Gratte-ciel', icon: '🌆', cost: 1e8, income: 600000, unlock: 8.5e7,
    blurb: 'Il chatouille les nuages, gentiment.',
    pal: { wall: 0x38405c, dark: 0x252b42, light: 0x525c80, roof: 0x1c2136, win: 0xffd98a, accent: 0xffd166 },
  },
  {
    id: 'parc', name: "Parc d'Attractions", icon: '🎡', cost: 6.5e8, income: 3.7e6, unlock: 5.5e8,
    blurb: 'La grande roue ne s’arrête jamais.',
    pal: { wall: 0xff9f43, dark: 0xc96b1c, light: 0xffc078, roof: 0xff4dd2, win: 0xfff3c4, accent: 0x6be3ff },
  },
  {
    id: 'gare', name: 'Gare Spatiale', icon: '🚀', cost: 4e9, income: 2.4e7, unlock: 3.4e9,
    blurb: 'Départ vers Kepler-22b dans 4 minutes.',
    pal: { wall: 0xd0d6e2, dark: 0x8e98ab, light: 0xf4f8ff, roof: 0x6a7488, win: 0xb8fff0, accent: 0x7ef2c0 },
  },
  {
    id: 'quantique', name: 'Quartier Quantique', icon: '🔮', cost: 2.5e10, income: 1.5e8, unlock: 2e10,
    blurb: 'Les habitants existent dans deux fuseaux.',
    pal: { wall: 0x2a1e4a, dark: 0x1a1230, light: 0x453573, roof: 0x140d26, win: 0xd0b8ff, accent: 0xb06bff },
  },
];

export const BUILDING_BY_ID = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));

/** Paliers visuels : à partir de combien d'unités le bâtiment change d'allure. */
export const TIER_STEPS = [1, 10, 25, 50, 100, 200];
export function tierOf(n) {
  let t = 0;
  for (let i = 0; i < TIER_STEPS.length; i++) if (n >= TIER_STEPS[i]) t = i;
  return t;
}
export function nextTierAt(n) {
  for (const s of TIER_STEPS) if (n < s) return s;
  return null;
}

/** Améliorations permanentes achetées avec des gemmes. */
export const GEM_UPGRADES = [
  {
    id: 'productivite', name: 'Productivité', icon: '🏗️', max: 30, base: 60, growth: 1.45,
    effect: (l) => `Production ×${(1 + 0.25 * l).toFixed(2).replace('.', ',')}`,
    desc: '+25 % de production totale par niveau.',
  },
  {
    id: 'doigts', name: 'Doigts d’or', icon: '👆', max: 20, base: 40, growth: 1.5,
    effect: (l) => `Taper ×${(1 + 0.5 * l).toFixed(1).replace('.', ',')}`,
    desc: 'Chaque tap rapporte davantage (part de revenu incluse).',
  },
  {
    id: 'robots', name: 'Robots tapoteurs', icon: '🤖', max: 15, base: 150, growth: 1.55,
    effect: (l) => `${l} tap${l > 1 ? 's' : ''}/s automatique${l > 1 ? 's' : ''}`,
    desc: 'Des robots tapotent la ville à ta place, en continu.',
  },
  {
    id: 'combo', name: 'Fièvre du tap', icon: '🔥', max: 10, base: 70, growth: 1.5,
    effect: (l) => `Combo max ×${(3 + 0.5 * l).toFixed(1).replace('.', ',')}`,
    desc: 'Le multiplicateur de combo monte plus haut.',
  },
  {
    id: 'taxi', name: 'Chance dorée', icon: '🚕', max: 6, base: 100, growth: 1.6,
    effect: (l) => `Taxi ×${Math.pow(0.82, l).toFixed(2).replace('.', ',')}`,
    desc: 'Le taxi doré traverse la ville bien plus souvent.',
  },
  {
    id: 'depart', name: 'Caisse de départ', icon: '💰', max: 10, base: 90, growth: 1.5,
    effect: (l) => `${l}\u202f×\u202f10 min de production au prestige`,
    desc: 'Commence chaque nouvelle ville avec un magot.',
  },
];

/** Améliorations uniques (une seule fois). */
export const GEM_UNIQUE = [
  {
    id: 'horsligne2', name: 'Veilleuse', icon: '🌙', cost: 150, req: (s) => s.up.horsligne === 0,
    desc: 'Revenus hors-ligne : 4 h au lieu de 2 h.',
  },
  {
    id: 'horsligne3', name: 'Bougie longue', icon: '🕯️', cost: 420, req: (s) => s.up.horsligne === 1,
    desc: 'Revenus hors-ligne : 8 h, et 65 % d’efficacité.',
  },
  {
    id: 'horsligne4', name: 'Réacteur nocturne', icon: '🌌', cost: 1200, req: (s) => s.up.horsligne === 2,
    desc: 'Revenus hors-ligne : 24 h à 80 % d’efficacité.',
  },
  {
    id: 'autoCollect', name: 'Maire automatique', icon: '🧑‍💼', cost: 900, req: (s) => !s.up.autoCollect,
    desc: 'Collecte automatiquement les bonus de bâtiments toutes les 20 s.',
  },
  {
    id: 'skinNeon', name: 'Skin « Néon »', icon: '🌈', cost: 500, req: (s) => !s.skins.neon,
    desc: 'Habille toute la ville d’un éclairage néon.',
  },
  {
    id: 'assurance', name: 'Assurance anti-crash', icon: '🛡️', cost: 300, req: (s) => !s.up.assurance,
    desc: '+1 % de production par palier de bâtiment atteint, pour toujours.',
  },
];

/** Objets consommables (gemmes). */
export const GEM_CONSUMABLES = [
  { id: 'bulle', name: 'Bulle temporelle', icon: '⏩', cost: 35, desc: 'Encaisse 10 minutes de production immédiatement.' },
  { id: 'fete', name: 'Méga fête', icon: '🎉', cost: 50, desc: 'Production ×5 pendant 90 secondes.' },
  { id: 'roulette', name: 'Taxi garanti', icon: '🚕', cost: 20, desc: 'Fait débarquer un taxi doré tout de suite.' },
  { id: 'coffre', name: 'Coffre du maire', icon: '📦', cost: 15, desc: 'Un coffre de pièces : 20 minutes de production.' },
];

/**
 * Packs boutique. LES ACHATS SONT SIMULÉS : le flux de paiement est joué
 * côté client, aucun paiement réel n'est effectué. Voir src/core/iap.js
 */
export const IAP_PACKS = [
  {
    id: 'starter', kind: 'once', badge: 'MEILLEURE OFFRE', price: 2.99, oldPrice: 9.99,
    name: 'Pack Fondateur', icon: '🎁', color: 'gold',
    gives: { gems: 400 },
    extras: ['Production ×2 pour toujours', 'Skin « Néon » offert', 'Badge Fondateur'],
    desc: 'Offre unique, réservée au premier achat.',
  },
  {
    id: 'gems500', kind: 'gems', price: 4.99, name: 'Poignée de gemmes', icon: '💎', gives: { gems: 500 },
    extras: [], desc: '500 gemmes', per: '1,00 € / 100 💎',
  },
  {
    id: 'gems1200', kind: 'gems', badge: 'POPULAIRE', price: 9.99, name: 'Sac de gemmes', icon: '💰',
    gives: { gems: 1200 }, bonus: 300, extras: [], desc: '1 200 gemmes', per: '0,83 € / 100 💎',
  },
  {
    id: 'gems3000', kind: 'gems', price: 19.99, name: 'Coffre de gemmes', icon: '🧰',
    gives: { gems: 3000 }, bonus: 1000, extras: [], desc: '3 000 gemmes', per: '0,67 € / 100 💎',
  },
  {
    id: 'gems8000', kind: 'gems', badge: 'MIEUX RENTABLE', price: 49.99, name: 'Banque de gemmes', icon: '🏦',
    gives: { gems: 8000 }, bonus: 3000, extras: [], desc: '8 000 gemmes', per: '0,62 € / 100 💎',
  },
  {
    id: 'vip', kind: 'pass', price: 9.99, name: 'Pass VIP', icon: '👑', color: 'vip',
    gives: { gems: 300 }, extras: ['Production ×2 permanente', '+250 gemmes chaque jour', 'Aucune offre publique', 'Badge VIP'],
    desc: 'Le pass des maires sérieux.',
  },
  {
    id: 'noads', kind: 'once', price: 3.99, name: 'Pack Zen', icon: '🧘', gives: {},
    extras: ['Supprime toutes les offres flash', 'Pubs récompensées ×2', 'Badge Zen'],
    desc: 'Une ville tranquille, sans pop-up.',
  },
];

/** Récompense de la « pub récompensée » (simulée aussi). */
export const REWARDED_AD = { gems: 25, delaySec: 120, adDuration: 5 };

/** Multiplicateurs de combo. */
export const COMBO = { window: 1.6, perTap: 0.05, maxTaps: 40, decay: 12 };

/** Prix / récompenses globales. */
export const START = {
  // On démarre avec de quoi poser la première Cabane : le joueur
  // découvre la boucle « taper → bâtir → revenus » en 10 secondes.
  coins: 30, gems: 25, tapBase: 1, tapIncomeShare: 0.05,
  offlineEfficiency: 0.5, offlineCapsHours: [2, 4, 8, 24, 48],
  starBonus: 0.1, prestigeDivisor: 1e8, prestigeExp: 0.5,
  events: { minDelay: 75, maxDelay: 165 },
};
