import { icon } from './ui.js';
import { merchantIdFromCode } from './qr-decoder.js';

/** A campus code selects a destination. The customer still reviews and approves payment. */
export function openMerchantCodeSheet(ctx, {
  onFound = id => ctx.openQrMerchant(id),
  isCurrent = () => true,
  onClose,
} = {}) {
  let alive = true, submitted = false, form = null;
  const current = () => alive && !!form && isCurrent() && form.isConnected !== false;
  const dispose = () => { alive = false; form?.removeEventListener('submit', submit); };
  const submit = event => {
    event.preventDefault();
    if (!current() || submitted) return;
    const id = merchantIdFromCode(form.elements.merchantCode.value);
    if (!id) {
      const error = form.querySelector('[data-merchant-error]');
      if (error) { error.textContent = 'We couldn’t find that code. Check it and try again.'; error.hidden = false; }
      return;
    }
    submitted = true;
    const button = form.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    dispose();
    ctx.closeSheet();
    onFound(id);
  };
  ctx.sheet(`<form class="qr-merchant-form" novalidate><p class="eyebrow">Campus Pay</p><h2>Which campus spot?</h2><label class="field"><span>Merchant code</span><input class="input" name="merchantCode" placeholder="e.g. GOBE" maxlength="100" autocapitalize="characters" autocomplete="off" required></label><p class="muted small">Try GOBE, SHUTTLE, PRINTS or HALL in this demo.</p><p class="error" data-merchant-error role="alert" hidden></p><button type="submit" class="button">Find merchant ${icon('arrow',19)}</button></form>`, sheet => {
    if (!alive) return;
    form = sheet.querySelector('form');
    form?.addEventListener('submit', submit);
    sheet.querySelector('input')?.focus();
  }, { onClose: () => { const wasAlive = alive; dispose(); if (wasAlive) onClose?.(); } });
  return dispose;
}
