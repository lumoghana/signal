import {paymentFee} from './payments-parity-model.js';
import {externalSandboxEnabled,externalSimulationNotice} from './external-sandbox.js';
import { esc, icon, pageHead } from './ui.js';
import { RECIPIENT_BANKS, DEMO_MOMO_ACCOUNTS, normalizeMomoNumber, validateRecipientLookup, recipientLookupMatches, createRecipientLookup } from './recipient-lookup.js';

const externalRail = value => value === 'bank' ? 'bank' : 'momo';
const titleFor = rail => rail === 'bank' ? 'Bank transfer' : 'Mobile money';
const initials = name => name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('');
// Group a confirmed Ghanaian phone number for checking without editing its identity.
const displayNumber = (rail, number) => {
  if (rail === 'bank') return number;
  const local = normalizeMomoNumber(number);
  return local ? `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}` : number;
};
const head = (rail, editing, confirmation = false) => {
  const cancelBack = editing && !confirmation;
  const markup = pageHead(titleFor(rail), { back: !cancelBack, action: `<button type="button" class="text-button" data-action="${editing ? 'pay-cancel-edit' : 'pay-cancel'}">${editing ? 'Cancel edit' : 'Cancel'}</button>` });
  return cancelBack ? markup.replace('<span class="head-spacer"></span>', `<button type="button" class="icon-button back-button labelled-back" data-action="pay-cancel-edit" aria-label="Back to review">${icon('back')}<span>Review</span></button>`) : markup;
};
const detailsRoute = (payment, editing = false) => ({ section: 'pay', page: 'recipient', ...(editing ? { edit: true } : {}), backTo: editing ? { section: 'pay', page: 'review' } : payment.flowOrigin || { section: 'pay', page: 'home' } });

export function renderAccountRecipient(ctx, route = {}) {
  const payment = ctx.draft.payment || {}, rail = externalRail(payment.rail), editing = !!route.edit,sandbox=externalSandboxEnabled(ctx);
  if(ctx.connected===true&&!sandbox)return `<section class="page account-recipient" aria-label="${titleFor(rail)} availability">${head(rail,editing)}<div class="recipient-main"><h1>This provider is not connected.</h1><p class="recipient-intro">No bank or mobile money account lookup is available in this shared test. You can pay a registered Lumo person or scan a connected merchant.</p></div><div class="bottom-action">${'<button type="button" class="button" data-action="pay-cancel">Back to Payments</button>'}</div></section>`;
  if (route.page === 'recipient-confirm' && recipientLookupMatches(payment)) {
    const person = payment.recipientLookup.recipient;
    return `<section class="page account-recipient account-recipient--confirm" aria-label="Confirm recipient">
      ${head(rail, editing, true)}
      <div class="recipient-main"><p class="recipient-step">YOUR PERSON</p><h1>Is this<br>your person?</h1>
        <div class="recipient-identity"><div class="recipient-initials" aria-hidden="true">${esc(initials(person.name))}<span>${icon('check', 17)}</span></div><p class="recipient-found">${sandbox?'Simulation destination':'Account found'}</p><h2>${esc(person.name)}</h2><p class="recipient-name-label">${sandbox?'Recipient label · not provider verified':'Registered account name'}</p>
          <dl><div><dt>${rail === 'bank' ? 'Account number' : 'MoMo number'}</dt><dd>${esc(displayNumber(rail, person.number))}</dd></div><div><dt>${rail === 'bank' ? 'Bank' : 'Network'}</dt><dd>${esc(rail === 'bank' ? person.bank : person.network)}</dd></div></dl>
        </div>
        <p class="recipient-demo-note">${sandbox?externalSimulationNotice:'Demo lookup · sample account details'}</p>
      </div><div class="bottom-action recipient-footer"><button type="button" class="button" data-recipient-confirm>Yes, that’s right ${icon('arrow', 19)}</button><button type="button" class="recipient-edit" data-recipient-edit>Edit details</button></div>
    </section>`;
  }
  const form = payment.recipientForms?.[rail] || {};
  return `<section class="page account-recipient account-recipient--${rail}" aria-label="Find ${rail === 'bank' ? 'a bank' : 'a mobile money'} account">
    ${head(rail, editing)}
    <div class="recipient-main"><p class="recipient-step">FIND YOUR PERSON</p><h1>${rail === 'bank' ? 'Let’s find<br>their account.' : 'Got their<br>MoMo number?'}</h1><p class="recipient-intro">${sandbox?'Choose a test destination. Lumo checks the format; no provider verifies the name.':rail === 'bank' ? 'Their account number. Their bank. We’ll find the name.' : 'Just the number. We’ll find the name and network.'}</p>
      <form id="recipient-lookup-form" class="recipient-form" novalidate><label class="recipient-number-field"><span>${rail === 'bank' ? 'Account number' : 'MoMo number'}</span><div>${icon(rail === 'bank' ? 'bank' : 'phone', 23)}<input id="recipient-account-number" name="recipientNumber" type="tel" inputmode="${rail === 'bank' ? 'numeric' : 'tel'}" autocomplete="off" maxlength="24" placeholder="${rail === 'bank' ? 'Enter account number' : '024 555 0182'}" value="${esc(form.number || '')}" aria-describedby="recipient-feedback recipient-error"></div></label>
      ${sandbox&&rail==='momo'?`<label class="recipient-bank-field"><span>Test network</span><select id="recipient-network" name="recipientNetwork" aria-label="Test MoMo network"><option value="">Choose a network</option>${['MTN MoMo','Telecel Cash','AT Money'].map(network=>`<option value="${network}"${form.network===network?' selected':''}>${network}</option>`).join('')}</select></label>`:''}${sandbox?`<label class="recipient-number-field"><span>Recipient label (optional)</span><input name="recipientName" class="input" maxlength="60" placeholder="A name you recognise" value="${esc(form.name||'')}" aria-label="Recipient label, not provider verified"></label>`:''}${rail === 'bank' ? `<label class="recipient-bank-field"><span>Their bank</span><select id="recipient-bank" name="recipientBank" aria-label="Their bank" aria-describedby="recipient-error"><option value="">Choose their bank</option>${RECIPIENT_BANKS.map(bank => `<option value="${esc(bank.label)}"${form.bank === bank.label || form.bank === bank.id ? ' selected' : ''}>${esc(bank.label)}</option>`).join('')}</select></label>` : ''}
      <button type="button" class="recipient-demo" data-recipient-demo>${icon('spark', 16)} ${sandbox?'Use sample details':`Try a demo ${rail === 'bank' ? 'account' : 'number'}`}</button>
      </form><div class="recipient-feedback" id="recipient-feedback" role="status" aria-live="polite"><span class="recipient-loading-dots" hidden aria-hidden="true"><i></i><i></i><i></i></span><span data-recipient-status></span></div><p class="recipient-error" id="recipient-error" role="alert" hidden></p>
    </div><div class="bottom-action recipient-footer"><p class="recipient-demo-note">${sandbox?'Simulation only · No real money reaches this destination.':'Demo lookup · no live account data'}</p><button type="submit" form="recipient-lookup-form" class="button" data-recipient-find>${sandbox?'Review test destination':'Find account'} ${icon('arrow', 19)}</button></div>
  </section>`;
}

/** Recipient lookup prepares a destination. It never reads balances or approves a payment. */
export function bindAccountRecipient(ctx, route = {}, { createLookup = createRecipientLookup } = {}) {
  const root = ctx.$('.account-recipient');
  if (!root) return () => {};
  const sandbox=externalSandboxEnabled(ctx);
  if(ctx.connected===true&&!sandbox)return ()=>{};
  const payment = ctx.draft.payment, rail = externalRail(payment.rail), controller = createLookup(sandbox?{lookup:request=>ctx.shared.lookupExternalRecipient(request),delay:0}:undefined);
  if(sandbox){payment.externalSimulation=true;payment.providerMode='sandbox';}
  const owner=ctx.shared?.user?.id,epoch=ctx.shared?.authVersion;
  let alive = true, busy = false;
  const listeners = [], valid = () => alive && root.isConnected !== false && ctx.draft.payment === payment && payment.rail === rail&&(!sandbox||ctx.shared?.user?.id===owner&&ctx.shared?.authVersion===epoch&&externalSandboxEnabled(ctx));
  const listen = (element, name, handler) => { if (!element) return; element.addEventListener(name, handler); listeners.push(() => element.removeEventListener(name, handler)); };
  const query = selector => root.querySelector(selector), save = () => ctx.saveDraft?.();
  if (route.page === 'recipient-confirm') {
    listen(query('[data-recipient-confirm]'), 'click', event => {
      if (!valid() || busy || event.currentTarget.disabled) return;
      if (!recipientLookupMatches(payment)) return ctx.go(detailsRoute(payment, !!route.edit), { replace: true });
      busy = true; event.currentTarget.disabled = true; ctx.confirmAccountRecipient();
    });
    listen(query('[data-recipient-edit]'), 'click', () => { if (valid()) ctx.go(detailsRoute(payment, !!route.edit), { replace: !!route.edit }); });
  } else {
    const form = query('#recipient-lookup-form'), number = query('[name="recipientNumber"]'), bank = query('[name="recipientBank"]'),network=query('[name="recipientNetwork"]'),name=query('[name="recipientName"]');
    const button = query('[data-recipient-find]'), error = query('#recipient-error'), status = query('[data-recipient-status]'), dots = query('.recipient-loading-dots');
    const capture = () => {
      if (!valid()) return;
      payment.recipientForms ||= {};
      payment.recipientForms[rail] = { number: number.value, ...(bank ? { bank: bank.value } : {}),...(network?{network:network.value}:{}),...(name?{name:name.value}:{}) };
      save();
    };
    const loading = value => {
      busy = value; button.disabled = value; button.setAttribute('aria-busy', String(value));
      button.innerHTML = value ? sandbox?'Checking test details…':'Finding account…' : `${sandbox?'Review test destination':'Find account'} ${icon('arrow', 19)}`;
      dots.hidden = !value; root.classList.toggle('is-looking', value);
      status.textContent = value ? sandbox?'Checking the simulation destination…':'One sec. Finding your person…' : '';
    };
    const clearError = () => { error.hidden = true; error.textContent = ''; number.removeAttribute('aria-invalid'); bank?.removeAttribute('aria-invalid');network?.removeAttribute('aria-invalid');name?.removeAttribute('aria-invalid'); };
    const invalidate = () => {
      controller.cancel(); loading(false); clearError();
      delete payment.recipientLookup; payment.recipient = null; payment.lookupRequired = true;
      capture();
    };
    listen(form, 'input', invalidate); listen(form, 'change', invalidate);
    listen(query('[data-recipient-demo]'), 'click', () => {
      if (!valid()) return;
      if (rail === 'bank') {
        const example = RECIPIENT_BANKS.find(item => item.label === bank.value) || RECIPIENT_BANKS[0];
        number.value = example.example; bank.value = example.label;
      } else {number.value = DEMO_MOMO_ACCOUNTS[0].number;if(network)network.value=DEMO_MOMO_ACCOUNTS[0].network;}
      if(name)name.value='Test recipient';
      invalidate();
    });
    listen(form, 'submit', async event => {
      event.preventDefault();
      if (!valid() || busy) return;
      capture(); clearError();
      const checked = validateRecipientLookup(rail, payment.recipientForms[rail],{sandbox});
      if (!checked.ok) {
        error.textContent = checked.message; error.hidden = false;
        const field = checked.field === 'bank' ? bank : checked.field==='network'?network:checked.field==='name'?name:number; field?.setAttribute('aria-invalid', 'true'); field?.focus(); return;
      }
      delete payment.recipientLookup; payment.recipient = null; payment.lookupRequired = true; save(); loading(true);
      let result;
      try { result = await controller.run(checked.request); }
      catch { result = { ok: false, message: 'The demo lookup took a little too long. Try again.' }; }
      if (!valid() || !result) return;
      const latest = validateRecipientLookup(rail, payment.recipientForms[rail],{sandbox});
      if (!latest.ok || latest.key !== checked.key) return;
      loading(false);
      if (!result.ok) { error.textContent = result.message; error.hidden = false; return; }
      if(sandbox&&(result.providerMode!=='sandbox'||result.simulation!==true||result.labelUnverified!==true||result.fee!==paymentFee(rail))){error.textContent='Lumo could not confirm this test destination. Try again.';error.hidden=false;return;}
      payment.recipientLookup = { key: checked.key, request: checked.request, recipient: { ...result.recipient }, confirmed: false,...(sandbox?{simulation:true,providerMode:'sandbox'}:{}) };
      if (!recipientLookupMatches(payment)) { delete payment.recipientLookup; error.textContent = 'Those details didn’t match. Please try the lookup again.'; error.hidden = false; return; }
      save(); ctx.setCapture?.(null);
      ctx.go({ section: 'pay', page: 'recipient-confirm', ...(route.edit ? { edit: true } : {}), backTo: detailsRoute(payment, !!route.edit) });
    });
  }
  return () => { alive = false; controller.dispose(); listeners.forEach(remove => remove()); };
}
