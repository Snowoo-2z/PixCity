// ─────────────────────────────────────────────────────────────
//  PixCity · HUD : pièces, gemmes, revenus, combo, boost
// ─────────────────────────────────────────────────────────────
import { bus } from '../core/bus.js';
import { fmt, fmtClock } from '../core/format.js';
import { comboMult, activeBoost } from '../core/economy.js';
import { Counter, qs, setBar, setText, toggle } from './dom.js';
import { Audio } from '../core/audio.js';

let coinCounter, gemCounter, rateNode, comboBox, cbNum, cbBar, boostBox, bMult, bTime, bLabel;
let coinBox, starsNode, cityNode, boostChip, boostChipTxt;
let tapHint;

export function initHud(Game) {
  coinCounter = new Counter(qs('#coin-val'), (v) => fmt(v));
  gemCounter = new Counter(qs('#gem-val'), (v) => fmt(v));
  rateNode = qs('#rate');
  coinBox = qs('#coin-box');
  comboBox = qs('#combo');
  cbNum = qs('#cb-num');
  cbBar = qs('#cb-bar');
  boostBox = qs('#boost');
  bMult = qs('#b-mult');
  bTime = qs('#b-time');
  bLabel = qs('#b-label');
  starsNode = qs('#stars-val');
  cityNode = qs('#city-count');
  boostChip = qs('#boost-chip');
  boostChipTxt = qs('#boost-chip-txt');
  tapHint = qs('#tap-hint');

  qs('#gem-box').addEventListener('click', () => bus.emit('open:panel', 'shop'));
  let n = 0;
  coinCounter.jump(Game.state.coins);
  gemCounter.jump(Game.state.gems);

  bus.on('tap', () => {
    coinBox.classList.remove('pump');
    void coinBox.offsetWidth;
    coinBox.classList.add('pump');
    n++;
    if (n >= 3) hideHint();
  });
  bus.on('open:panel', hideHint);
  bus.on('wiped', () => {
    coinCounter.jump(0);
    gemCounter.jump(0);
    n = 0;
    showHint();
  });
  // rappel discret si le joueur n'a toujours rien construit après 45 s
  setTimeout(() => { if (!Object.values(Game.state.buildings).some((x) => x > 0)) showHint(); }, 45000);
}

export function updateHud(Game, dt) {
  const s = Game.state;
  const d = Game.derived;
  coinCounter.set(s.coins);
  coinCounter.update(dt);
  gemCounter.set(s.gems);
  gemCounter.update(dt);
  setText(rateNode, '+' + fmt(d ? d.income : 0) + ' / s');
  rateNode.classList.toggle('big', (d ? d.income : 0) > 0);

  // combo
  const mult = comboMult(s);
  const active = s.combo.n > 0 && mult > 1.02;
  toggle(comboBox, active);
  if (active) {
    setText(cbNum, '×' + mult.toFixed(2).replace('.', ','));
    setBar(cbBar, Math.min(1, (s.combo.n % 1 === 0 ? s.combo.n : s.combo.n) / Math.max(40, s.combo.n + 1)));
    cbBar.style.width = Math.min(100, (s.combo.n / 100) * 100) + '%';
    comboBox.classList.toggle('hot', mult >= 3);
  }

  // boost
  const b = activeBoost(s);
  toggle(boostBox, !!b);
  if (b) {
    setText(bMult, '×' + (b.mult % 1 === 0 ? b.mult : b.mult.toFixed(1)));
    setText(bTime, fmtClock((b.until - Date.now()) / 1000));
    setText(bLabel, b.label || '');
  }
  toggle(boostChip, !!b);
  if (b) setText(boostChipTxt, '×' + b.mult + ' · ' + fmtClock((b.until - Date.now()) / 1000));

  setText(starsNode, fmt(s.stars));
  let total = 0;
  for (const k in s.buildings) total += s.buildings[k];
  setText(cityNode, fmt(total));
}

let hintHidden = false;
function hideHint() {
  if (hintHidden) return;
  hintHidden = true;
  if (tapHint) tapHint.style.display = 'none';
}
function showHint() {
  if (!hintHidden) return;
  hintHidden = false;
  if (tapHint) tapHint.style.display = '';
}
