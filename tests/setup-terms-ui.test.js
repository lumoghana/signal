import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSetupTerms, bindSetupTerms } from '../dist/js/setup-terms.js';
import { createOnboardingDraft } from '../dist/js/onboarding-model.js';
import { SETUP_TERMS_VERSION, acceptSetupTerms, hasAcceptedSetupTerms } from '../dist/js/setup-terms-model.js';

function harness({ accepted = false, stale = false, result = { ok: true } } = {}) {
  const draft = { onboarding: createOnboardingDraft() };
  draft.onboarding.name = 'Ama';
  if (accepted) assert.equal(acceptSetupTerms(draft.onboarding, { accepted: true, now: '2026-11-08T00:00:00.000Z' }).ok, true);
  if (stale && draft.onboarding.termsAcceptance) draft.onboarding.termsAcceptance.version = 'old-terms';
  const calls = [], listeners = new Map();
  let exits = 0;
  const ctx = {
    draft, $: () => root,
    completeSetupTerms(payload) { calls.push(payload); return result; },
    exitSetupTerms() { exits++; },
    get state() { throw new Error('Terms UI must not read or alter account money'); },
    act() { throw new Error('Terms UI must not perform financial actions'); },
  };
  const before = JSON.stringify(draft), html = renderSetupTerms(ctx);
  const checkboxAttributes = html.match(/<input\b([^>]*name="setupTerms"[^>]*)>/)?.[1];
  const buttonAttributes = html.match(/<button\b([^>]*data-terms-action="continue"[^>]*)>/)?.[1];
  assert.ok(checkboxAttributes); assert.ok(buttonAttributes);
  const checkbox = { checked: /\bchecked\b/.test(checkboxAttributes) };
  const button = { dataset: { termsAction: 'continue' }, disabled: /\bdisabled\b/.test(buttonAttributes) };
  const back = { dataset: { termsAction: 'exit' }, disabled: false }, error = { textContent: '' };
  const root = {
    isConnected: true,
    querySelector: selector => ({ '[name="setupTerms"]': checkbox, '[data-terms-action="continue"]': button, '.setup-terms-error': error })[selector] || null,
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name, callback) { if (listeners.get(name) === callback) listeners.delete(name); },
  };
  const cleanup = bindSetupTerms(ctx);
  return {
    ctx, draft, before, html, root, checkbox, button, back, error, calls, listeners, cleanup,
    get exits() { return exits; },
    change(checked) { checkbox.checked = checked; listeners.get('change')?.({ target: checkbox }); },
    click(target = button) { listeners.get('click')?.({ target: { closest: () => target } }); },
  };
}

test('new terms render unchecked with Continue disabled and rendering records no acceptance', () => {
  const h = harness();
  assert.equal(h.checkbox.checked, false); assert.equal(h.button.disabled, true);
  assert.equal(hasAcceptedSetupTerms(h.draft.onboarding), false);
  assert.equal(JSON.stringify(h.draft), h.before);
  assert.deepEqual(h.calls, []); assert.equal(h.exits, 0);
  h.cleanup();
});

test('only a current explicit prior acceptance restores the checked, enabled Continue state', () => {
  const current = harness({ accepted: true });
  assert.equal(current.checkbox.checked, true); assert.equal(current.button.disabled, false);
  assert.match(current.html, /Continue setup/);
  assert.equal(JSON.stringify(current.draft), current.before); assert.deepEqual(current.calls, []);
  current.cleanup();
  const stale = harness({ accepted: true, stale: true });
  assert.equal(stale.checkbox.checked, false); assert.equal(stale.button.disabled, true);
  assert.equal(JSON.stringify(stale.draft), stale.before); assert.deepEqual(stale.calls, []);
  stale.cleanup();
});

test('checkbox changes enable or disable the button without accepting terms or starting setup', () => {
  const h = harness();
  h.change(true); assert.equal(h.button.disabled, false);
  assert.equal(hasAcceptedSetupTerms(h.draft.onboarding), false); assert.deepEqual(h.calls, []);
  h.change(false); assert.equal(h.button.disabled, true);
  assert.equal(JSON.stringify(h.draft), h.before); assert.deepEqual(h.calls, []); assert.equal(h.exits, 0);
  h.cleanup();
});

test('Continue refuses an unchecked agreement even if its disabled UI is bypassed', () => {
  const h = harness();
  h.click(); assert.deepEqual(h.calls, []);
  h.button.disabled = false; h.click();
  assert.deepEqual(h.calls, []); assert.match(h.error.textContent, /agree.*terms/i);
  assert.equal(JSON.stringify(h.draft), h.before);
  h.cleanup();
});

test('an explicit checked Continue calls the completion boundary once with accepted true', () => {
  const h = harness(); h.change(true); h.click();
  assert.deepEqual(h.calls, [{ accepted: true }]); assert.equal(h.button.disabled, true);
  h.click(); h.button.disabled = false; h.click();
  assert.equal(h.calls.length, 1, 'repeated events cannot create duplicate acceptance or signup transitions');
  assert.equal(JSON.stringify(h.draft), h.before, 'the UI delegates acceptance to the app boundary');
  assert.equal(h.exits, 0);
  h.cleanup();
});

test('a rejected completion shows its error and allows a new explicit attempt', () => {
  const h = harness({ result: { ok: false, message: 'Setup could not be saved. Try again.' } });
  h.change(true); h.click();
  assert.match(h.error.textContent, /could not be saved/); assert.equal(h.button.disabled, false);
  assert.equal(hasAcceptedSetupTerms(h.draft.onboarding), false);
  h.click(); assert.equal(h.calls.length, 2);
  h.cleanup();
});

test('Back exits without accepting, even after the checkbox was selected', () => {
  const h = harness(); h.change(true); h.click(h.back);
  assert.equal(h.exits, 1); assert.deepEqual(h.calls, []);
  assert.equal(JSON.stringify(h.draft), h.before); assert.equal(hasAcceptedSetupTerms(h.draft.onboarding), false);
  h.cleanup();
});

test('cleanup removes handlers and stale callbacks cannot accept or leave a later screen', () => {
  const h = harness(), staleClick = h.listeners.get('click'), staleChange = h.listeners.get('change');
  h.cleanup(); assert.equal(h.listeners.size, 0);
  h.checkbox.checked = true;
  staleChange({ target: h.checkbox });
  assert.equal(h.button.disabled, true, 'disposed controls cannot update');
  h.button.disabled = false;
  staleClick({ target: { closest: () => h.button } });
  staleClick({ target: { closest: () => h.back } });
  assert.deepEqual(h.calls, []); assert.equal(h.exits, 0); assert.equal(JSON.stringify(h.draft), h.before);
  h.cleanup();
});

test('a detached terms screen cannot complete setup through an old Continue callback', () => {
  const h = harness(); h.change(true); h.root.isConnected = false; h.click(); h.click(h.back);
  assert.deepEqual(h.calls, []); assert.equal(h.exits, 0); assert.equal(JSON.stringify(h.draft), h.before);
  h.cleanup();
});

test('terms distinguish the GCB account, Lumo digital experience, support and banking-dispute routes', () => {
  const h = harness(), html = h.html;
  assert.match(html, /Your account is with GCB Bank/);
  assert.match(html, /Your experience is with Lumo/);
  assert.match(html, /account is opened in your name with GCB Bank/);
  assert.match(html, /GCB Bank provides the banking account and holds your money/);
  assert.match(html, /digital-only account, through Lumo/);
  assert.match(html, /Lumo is your first point of contact for day-to-day service and support/);
  assert.match(html, /banking dispute directly with GCB Bank/);
  assert.match(html, /after the bank’s response.*Bank of Ghana complaints process/);
  assert.match(html, /href="https:\/\/www\.gcbbank\.com\.gh\/contact" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /href="https:\/\/www\.bog\.gov\.gh\/supervision-regulation\/complaints-procedures\/" target="_blank" rel="noopener noreferrer"/);
  h.cleanup();
});

test('prototype terms clearly avoid opening a live account or replacing later identity-data consent', () => {
  const h = harness(), html = h.html;
  assert.match(html, /Prototype terms/);
  assert.match(html, /simulated verification, accounts and account numbers/);
  assert.match(html, /No live bank account is opened/);
  assert.match(html, /prototype Terms &amp; Conditions/);
  assert.match(html, /Identity verification has its own explanation and consent step for Ghana Card and selfie information/);
  assert.match(html, /Agreeing here does not replace that separate consent/);
  assert.match(html, /final live-service terms will be confirmed with GCB Bank/);
  assert.ok(html.includes(`Version ${SETUP_TERMS_VERSION}`));
  assert.equal(h.draft.onboarding.consent, false);
  h.cleanup();
});
