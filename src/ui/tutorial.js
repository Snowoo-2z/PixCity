// ─────────────────────────────────────────────────────────────
//  PixCity · tutoriel : 4 étapes, uniquement à la première partie
// ─────────────────────────────────────────────────────────────
import { bus } from '../core/bus.js';
import { el, qs } from './dom.js';
import { Audio } from '../core/audio.js';

let node, Game, step = 0, active = false;

const STEPS = [
  {
    done: (s) => s.taps > 0,
    html: '1/4 · <b>Tape sur la ville</b> pour gagner tes premières pièces 🪙',
    pos: () => ({ left: '50%', top: '16%', transform: 'translateX(-50%)' }),
    hand: () => ({ left: '46%', top: '44%' }),
  },
  {
    done: (s) => Object.values(s.buildings).some((n) => n > 0),
    html: '2/4 · Ouvre <b>BÂTIR</b> et construis ta première <b>Cabane</b> 🛖',
    pos: () => ({ left: '10px', bottom: '96px' }),
    spot: () => ({ left: '4px', bottom: '72px', width: '18%', height: '62px' }),
  },
  {
    done: (s) => (s.collects || 0) > 0,
    html: '3/4 · Attrape une <b>bulle 💰</b> au-dessus d’un bâtiment : gros bonus !',
    pos: () => ({ left: '50%', top: '16%', transform: 'translateX(-50%)' }),
  },
  {
    done: () => false,
    html: '4/4 · Les <b>gemmes 💎</b> paient les bonus permanents, et le <b>prestige 🌟</b> multiplie tout. Amuse-toi bien, maire !',
    pos: () => ({ left: '50%', top: '28%', transform: 'translateX(-50%)' }),
    last: true,
  },
];

export function initTutorial(g) {
  Game = g;
  node = qs('#tutorial');
  if (Game.state.flags.intro) return;
  step = Game.state.flags.tutorial || 0;
  active = true;
  bus.on('tick', check);
  render();
}

/** Vérifie si l'étape courante est accomplie (par le jeu réel, pas par un bouton). */
function check() {
  if (!active) return;
  const s = Game.state;
  const st = STEPS[step];
  if (!st) return finish();
  if (!st.last && st.done(s)) {
    step++;
    s.flags.tutorial = step;
    Game.save(true);
    Audio.play('coin');
    render();
  }
}

function render() {
  if (!node) return;
  const st = STEPS[step];
  if (!st) return finish();
  node.classList.add('on');
  node.innerHTML = '';
  node.append(el('div', { class: 'tut-bubble', style: st.pos() }, [
    el('div', { class: 'row', style: { gap: '6px', alignItems: 'flex-start' } }, [
      el('div', { class: 't-txt grow', html: st.html }),
      st.last ? null : el('button', {
        class: 'btn tiny ghost', text: 'Passer', title: 'Ignorer le tutoriel',
        onclick: () => { Audio.play('click'); finish(); },
      }),
    ]),
    st.last ? el('button', {
      class: 'btn small primary', text: 'C’est parti ! 🎉',
      onclick: () => { Audio.play('levelup'); finish(); },
    }) : null,
  ]));
  if (st.hand) node.append(el('div', { class: 'tut-hand', style: st.hand(), text: '👆' }));
  if (st.spot) node.append(el('div', { class: 'tut-spot', style: st.spot() }));
}

function finish() {
  active = false;
  if (node) { node.classList.remove('on'); node.innerHTML = ''; }
  if (Game) {
    Game.state.flags.intro = true;
    Game.state.flags.tutorial = STEPS.length;
    Game.save(true);
  }
  bus.off('tick', check);
}

export function replayTutorial(g) {
  if (g) Game = g;
  step = 0;
  active = true;
  bus.off('tick', check);
  bus.on('tick', check);
  render();
}
