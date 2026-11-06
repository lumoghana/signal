import test from 'node:test';
import assert from 'node:assert/strict';
import { openMerchantCodeSheet } from '../dist/js/merchant-code.js';

class Form extends EventTarget {
  constructor() {
    super(); this.isConnected = true;
    this.elements = { merchantCode: { value: '' } };
    this.error = { hidden: true, textContent: '' };
    this.button = { disabled: false };
  }
  querySelector(selector) { return selector === '[data-merchant-error]' ? this.error : selector === '[type="submit"]' ? this.button : null; }
  submit() { this.dispatchEvent(new Event('submit', { cancelable: true })); }
}

function harness(options = {}) {
  const form = new Form(), found = [], calls = { closed: 0, focused: 0, dismissed: 0 };
  let sheetOptions, html;
  const ctx = {
    sheet(markup, bind, opts) {
      html = markup; sheetOptions = opts;
      bind({ querySelector(selector) { return selector === 'form' ? form : selector === 'input' ? { focus() { calls.focused++; } } : null; } });
    },
    closeSheet() { calls.closed++; }, openQrMerchant(id) { found.push(id); },
    go() { throw new Error('The code sheet cannot navigate arbitrary URLs.'); },
    act() { throw new Error('The code sheet cannot approve or execute a payment.'); },
  };
  const dispose = openMerchantCodeSheet(ctx, { onClose() { calls.dismissed++; }, ...options });
  return { form, found, calls, dispose, get html() { return html; }, dismiss() { sheetOptions.onClose(); } };
}

test('unknown and unsafe merchant codes stay on the sheet, then a corrected code selects a known destination once', () => {
  const h = harness();
  for (const code of ['', 'not-a-merchant', 'electricity', '__proto__', 'https://example.com/?payTo=Someone', '<script>']) {
    h.form.elements.merchantCode.value = code; h.form.submit();
    assert.equal(h.calls.closed, 0); assert.deepEqual(h.found, []);
    assert.equal(h.form.error.hidden, false); assert.match(h.form.error.textContent, /Check it and try again/);
    assert.equal(h.form.button.disabled, false);
  }
  h.form.elements.merchantCode.value = '  gobe  '; h.form.submit(); h.form.submit();
  assert.deepEqual(h.found, ['gobe-spot']); assert.equal(h.calls.closed, 1); assert.equal(h.form.button.disabled, true);
  assert.equal(h.calls.focused, 1); assert.match(h.html, /Merchant code/); assert.match(h.html, /in this demo/);
  h.dismiss(); assert.equal(h.calls.dismissed, 0, 'accepting a code is not a later dismissal');
  h.dispose();
});

test('all advertised aliases still select the intended campus destination, including relocated hall dues', () => {
  for (const [code, id] of [['GOBE', 'gobe-spot'], ['SHUTTLE', 'campus-shuttle'], ['PRINTS', 'balme-prints'], ['HALL', 'hall-dues']]) {
    const h = harness(); h.form.elements.merchantCode.value = code; h.form.submit();
    assert.deepEqual(h.found, [id]); assert.equal(h.calls.closed, 1); h.dispose();
  }
});

test('a detached or superseded screen cannot act through a retained code form', () => {
  let current = true;
  const h = harness({ isCurrent: () => current });
  h.form.elements.merchantCode.value = 'GOBE'; current = false; h.form.submit();
  assert.deepEqual(h.found, []); assert.equal(h.calls.closed, 0);
  current = true; h.form.isConnected = false; h.form.submit();
  assert.deepEqual(h.found, []); assert.equal(h.calls.closed, 0); h.dispose();
});

test('dismissal and disposal remove the submission handler and ignore repeated close callbacks', () => {
  const dismissed = harness(); dismissed.form.elements.merchantCode.value = 'GOBE';
  dismissed.dismiss(); dismissed.dismiss(); dismissed.form.submit();
  assert.equal(dismissed.calls.dismissed, 1); assert.deepEqual(dismissed.found, []); assert.equal(dismissed.calls.closed, 0);
  const disposed = harness(); disposed.form.elements.merchantCode.value = 'GOBE';
  disposed.dispose(); disposed.dispose(); disposed.form.submit(); disposed.dismiss();
  assert.equal(disposed.calls.dismissed, 0); assert.deepEqual(disposed.found, []); assert.equal(disposed.calls.closed, 0);
});

test('a caller can handle the known destination while the helper closes the sheet first', () => {
  const selected = [];
  const h = harness({ onFound: id => { assert.equal(h.calls.closed, 1); selected.push(id); } });
  h.form.elements.merchantCode.value = 'PRINTS'; h.form.submit();
  assert.deepEqual(selected, ['balme-prints']); assert.deepEqual(h.found, []); h.dispose();
});
