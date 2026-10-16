// ─────────────────────────────────────────────────────────────
//  PixCity · tunnel d'achat SIMULÉ
//  Reproduit l'expérience d'un vrai achat in-app (connexion,
//  commande, paiement, reçu, validation) — mais tout est local
//  et gratuit. Aucun paiement réel n'est effectué.
// ─────────────────────────────────────────────────────────────
import { el, qs, setText } from './dom.js';
import { openModal, close } from './modal.js';
import { Audio } from '../core/audio.js';
import { Backend } from '../app/backend.js';
import { eur } from '../core/iap.js';
import { confetti, rewardPop } from './fx.js';
import { toast } from './toasts.js';
import { fmt } from '../core/format.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ouvre le tunnel d'achat simulé. Résout { ok, receipt } */
export function startPurchase(Game, pack, priceInfo, onDone) {
  const price = priceInfo.price;
  const method = 'Carte démo •••• 4242';
  const steps = [
    { icon: '🔌', label: 'Connexion à PixStore…' },
    { icon: '🧾', label: 'Création de la commande…' },
    { icon: '💳', label: 'Autorisation du paiement…' },
    { icon: '🔐', label: 'Validation du reçu…' },
  ];

  const stepNodes = steps.map((s) => el('div', { class: 'pay-step' }, [
    el('span', { class: 's-ico', text: s.icon }),
    el('span', { text: s.label }),
  ]));

  const sheet = el('div', { class: 'pay-sheet' }, [
    el('div', { class: 'pay-row' }, [el('span', { class: 'dim', text: 'Article' }), el('span', { text: pack.icon + ' ' + pack.name })]),
    pack.gives && pack.gives.gems ? el('div', { class: 'pay-row' }, [
      el('span', { class: 'dim', text: 'Contenu' }),
      el('span', { text: pack.gives.gems + (pack.bonus ? ' + ' + pack.bonus : '') + ' 💎' }),
    ]) : null,
    el('div', { class: 'pay-row' }, [el('span', { class: 'dim', text: 'Moyen de paiement' }), el('span', { text: method })]),
    el('div', { class: 'pay-row' }, [el('span', { class: 'dim', text: 'Boutique' }), el('span', { text: 'PixStore (simulé · eu-west-3)' })]),
    el('div', { class: 'pay-row total' }, [
      el('span', { text: 'Total' }),
      el('span', { html: (priceInfo.old ? `<s class="price-old">${eur(priceInfo.old)}</s> ` : '') + eur(price) }),
    ]),
  ]);

  const note = el('div', { class: 'notice tiny' }, [
    el('b', { text: 'Mode démo : ' }),
    'le paiement est simulé. Aucun débit réel, aucune donnée bancaire, tout reste sur ton appareil.',
  ]);

  const stepsBox = el('div', { class: 'pay-steps hidden' }, stepNodes);

  const payBtn = el('button', { class: 'btn primary grow shine', text: '💳 Payer ' + eur(price) + ' (démo)' });
  const cancelBtn = el('button', { class: 'btn grow', text: 'Annuler' });

  const holder = openModal({
    title: '🛒 Finaliser l’achat',
    body: el('div', { class: 'pay-box' }, [sheet, note, stepsBox]),
    footer: [cancelBtn, payBtn],
    dismissable: true,
  });

  const t0 = performance.now();

  cancelBtn.addEventListener('click', () => {
    Backend.track('purchase_cancel', { pack: pack.id });
    close();
    onDone && onDone({ ok: false, cancelled: true });
  });

  payBtn.addEventListener('click', async () => {
    payBtn.disabled = true;
    cancelBtn.disabled = true;
    payBtn.textContent = '⏳ Traitement…';
    stepsBox.classList.remove('hidden');
    Audio.play('click');

    const setStep = (i, state) => {
      stepNodes.forEach((n, k) => {
        n.classList.toggle('active', k === i && state === 'run');
        n.classList.toggle('done', k < i || (k === i && state === 'done'));
      });
    };

    try {
      // 1) connexion
      setStep(0, 'run');
      await Backend.connect();
      setStep(0, 'done');
      // 2) commande
      setStep(1, 'run');
      const { order } = await Backend.createOrder(pack, price);
      setStep(1, 'done');
      // 3) paiement
      setStep(2, 'run');
      const paid = await Backend.pay(order, method);
      setStep(2, 'done');
      // 4) validation
      setStep(3, 'run');
      const valid = await Backend.validate({ id: paid.receiptId, order: paid.order });
      const receipt = {
        ...paid.order,
        receiptId: paid.receiptId,
        simulated: true,
        validatedAt: Date.now(),
        latency: Math.round(performance.now() - t0),
      };
      Backend.saveReceipt(receipt);
      Backend.track('purchase_ok', { pack: pack.id, price });
      setStep(3, 'done');
      await wait(280);

      // écran de succès
      // ⚠️ L'achat est crédité ICI : le joueur ne peut pas perdre sa
      // commande en fermant la fenêtre avant de cliquer sur « Récupérer ».
      onDone && onDone({ ok: true, receipt, credited: true });

      const okBox = el('div', { class: 'pay-ok' }, [
        el('div', { class: 'pay-tick', text: '✓' }),
        el('div', { class: 'title-sm gold-text', text: 'ACHAT VALIDÉ' }),
        el('div', { class: 'small center', text: pack.icon + ' ' + pack.name + (pack.gives && pack.gives.gems ? ' · ' + (pack.gives.gems + (pack.bonus || 0)) + ' gemmes 💎' : '') }),
        el('div', { class: 'fake-tag', text: 'SIMULATION · ' + receipt.order }),
        el('div', { class: 'tiny dim center', text: 'Reçu ' + receipt.receiptId + ' · ' + receipt.latency + ' ms (simulé)' }),
      ]);
      holder.body.innerHTML = '';
      holder.body.append(okBox);
      holder.modal.querySelector('.modal-foot').innerHTML = '';
      const grab = el('button', { class: 'btn primary grow shine', text: '🎁 Récupérer' });
      holder.modal.querySelector('.modal-foot').append(grab);
      Audio.play('cash');
      confetti(30);

      grab.addEventListener('click', () => close());
      setTimeout(() => { if (document.body.contains(grab)) { grab.classList.add('pulse'); } }, 1200);
    } catch (e) {
      Backend.errors++;
      Audio.play('error');
      toast('Achat impossible (simulation) : ' + e.message, 'bad');
      payBtn.disabled = false;
      cancelBtn.disabled = false;
      payBtn.textContent = '💳 Réessayer';
      onDone && onDone({ ok: false, error: e });
    }
  });

  return holder;
}
