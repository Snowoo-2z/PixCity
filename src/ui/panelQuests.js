// ─────────────────────────────────────────────────────────────
//  PixCity · panneau Quêtes (chaîne principale + défis du jour)
// ─────────────────────────────────────────────────────────────
import { bus } from '../core/bus.js';
import { chainInfo, dailyInfo } from '../core/quests.js';
import { fmt, fmtClock } from '../core/format.js';
import { el, qs, setText, setBar } from './dom.js';
import { rewardPop } from './fx.js';
import { toast } from './toasts.js';

let chainNode, dailyNode, doneNode, timerNode, streakNode, Game, lastSig = '';

export function initQuestPanel(g) {
  Game = g;
  chainNode = qs('#chain-card');
  dailyNode = qs('#daily-list');
  doneNode = qs('#daily-done');
  timerNode = qs('#daily-timer');
  streakNode = qs('#streak-chip');
  renderQuests();
  bus.on('tick', () => renderQuests());
  bus.on('quest:chain', renderQuests);
  bus.on('quest:daily', renderQuests);
  bus.on('quest:daily', () => {});
}

export function renderQuests() {
  const s = Game.state;
  const info = chainInfo(s);
  const dailies = dailyInfo(s);
  const done = dailies.filter((q) => q.done).length;

  setText(doneNode, done + '/3');
  const msLeft = s.quests.dailyAt + 86400000 - Date.now();
  setText(timerNode, '(dans ' + fmtClock(msLeft / 1000) + ')');
  setText(streakNode, '🔥 ' + (s.quests.streak || 0) + ' j');

  // chaîne
  const cSig = info ? info.index + ':' + Math.floor(info.prog) + ':' + (info.ready ? 1 : 0) : 'end';
  if (chainNode._sig !== cSig) {
    chainNode._sig = cSig;
    chainNode.innerHTML = '';
    if (!info) {
      chainNode.append(
        el('div', { class: 'title-sm gold-text', text: '🎖️ Toutes les quêtes terminées !' }),
        el('div', { class: 'tiny dim', text: 'Bravo maire. Les défis du jour prennent le relais.' }),
      );
    } else {
      const { q, prog, ready, index, total } = info;
      chainNode.append(
        el('div', { class: 'row spread' }, [
          el('span', { class: 'title-xs', text: 'QUÊTE PRINCIPALE ' + (index + 1) + '/' + total }),
          ready ? el('span', { class: 'badge gold', text: 'PRÊTE' }) : null,
        ]),
        el('div', { class: 'row', style: { margin: '8px 0 6px' } }, [
          el('span', { class: 'q-ico', text: q.icon }),
          el('span', { class: 'grow small', text: q.label }),
        ]),
        el('div', { class: 'bar green' }, [el('i', { style: { width: Math.min(100, (prog / q.goal) * 100) + '%' } })]),
        el('div', { class: 'row spread', style: { marginTop: '5px' } }, [
          el('span', { class: 'tiny dim', text: fmt(prog) + ' / ' + fmt(q.goal) }),
          el('span', { class: 'tiny', html: (q.coins ? '🪙 ' + fmt(q.coins) + ' ' : '') + (q.gems ? '💎 ' + q.gems : '') }),
        ]),
        el('button', {
          class: 'btn ' + (ready ? 'primary pulse' : '') + ' wide',
          text: ready ? '🎁 RÉCUPÉRER' : 'En cours…',
          disabled: !ready,
          style: { marginTop: '8px' },
          onclick: () => {
            const res = Game.claimChain();
            if (!res.ok) return;
            rewardPop(q.icon, 'QUÊTE RÉUSSIE', (res.reward.coins ? '+' + fmt(res.reward.coins) + ' 🪙 ' : '') + (res.reward.gems ? '+' + res.reward.gems + ' 💎' : ''));
            renderQuests();
          },
        }),
      );
    }
  }

  // défis du jour
  const dsig = dailies.map((q) => q.id + q.goal + (q.done ? 1 : 0) + Math.floor((q.prog / q.goal) * 20)).join('|');
  if (dailyNode._sig !== dsig) {
    dailyNode._sig = dsig;
    dailyNode.innerHTML = '';
    for (const q of dailies) {
      const pct = Math.min(100, (q.prog / q.goal) * 100);
      dailyNode.append(el('div', { class: 'card q-item' + (q.done ? ' dimmed' : q.ready ? ' hi' : '') }, [
        el('div', { class: 'q-ico', text: q.icon }),
        el('div', { class: 'grow col', style: { gap: '4px' } }, [
          el('div', { class: 'row spread' }, [
            el('span', { class: 'small', text: q.label }),
            el('span', { class: 'chip purple', text: q.gems + ' 💎' }),
          ]),
          el('div', { class: 'bar purple' }, [el('i', { style: { width: pct + '%' } })]),
          el('div', { class: 'row spread' }, [
            el('span', { class: 'tiny dimmer', text: fmt(q.prog) + ' / ' + fmt(q.goal) }),
            q.done ? el('span', { class: 'tiny', style: { color: 'var(--green)' }, text: '✓ Terminé' })
              : el('button', {
                class: 'btn tiny ' + (q.ready ? 'primary' : ''),
                text: q.ready ? 'RÉCLAMER' : 'En cours',
                disabled: !q.ready,
                onclick: () => {
                  const res = Game.claimDaily(q.id);
                  if (!res.ok) return;
                  rewardPop(q.icon, 'DÉFI RÉUSSI', '+' + res.gems + ' 💎');
                  if (res.allDone) {
                    const chest = Game.claimDailyChest();
                    if (chest.ok) {
                      toast('Coffre du jour : +' + fmt(chest.coins) + ' 🪙 et +' + chest.gems + ' 💎', 'win');
                      rewardPop('🎁', 'COFFRE DU JOUR', '+' + fmt(chest.coins) + ' 🪙 · +' + chest.gems + ' 💎', 2200);
                    }
                  }
                  renderQuests();
                },
              }),
          ]),
        ]),
      ]));
    }
    if (done === 3) {
      const got = s.quests.chestDay === s.quests.dailyAt;
      dailyNode.append(el('div', { class: 'card hi center' }, [
        el('div', { class: 'title-xs gold-text', text: 'TOUS LES DÉFIS DU JOUR TERMINÉS' }),
        el('div', { class: 'tiny dim', text: got ? 'Coffre récupéré, à demain !' : 'Le coffre a été ouvert automatiquement.' }),
      ]));
    }
  }
}
