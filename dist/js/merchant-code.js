import { icon } from './ui.js';
import { merchantIdFromCode } from './qr-decoder.js';

/** A campus code selects a destination. The customer still reviews and approves payment. */
export function openMerchantCodeSheet(ctx, {
  onFound = (id,options) => ctx.openQrMerchant(id,options),
  isCurrent = () => true,
  onClose,
} = {}) {
  let alive = true, submitted = false, form = null;
  const current = () => alive && !!form && isCurrent() && form.isConnected !== false;
  const dispose = () => { alive = false; form?.removeEventListener('submit', submit); };
  const submit = event => {
    event.preventDefault();
    if (!current() || submitted) return;
    const id = ctx.connected?form.elements.merchantCode.value.trim():merchantIdFromCode(form.elements.merchantCode.value);
    if (!id) {
      const error = form.querySelector('[data-merchant-error]');
      if (error) { error.textContent = 'We couldn’t find that code. Check it and try again.'; error.hidden = false; }
      return;
    }
    submitted = true;
    const button = form.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    if(ctx.connected){
      const failure=message=>{if(!current())return;submitted=false;if(button)button.disabled=false;const error=form.querySelector('[data-merchant-error]');if(error){error.textContent=message||'We could not check this merchant. Try again.';error.hidden=false;}};
      Promise.resolve().then(()=>{if(!current())return {ok:false,cancelled:true};return onFound(id,{isCurrent:current});}).then(result=>{
        if(!current())return;
        if(result?.ok===false){if(!result.cancelled)failure(result.message);return;}
        dispose();ctx.closeSheet();
      }).catch(()=>failure());
      return;
    }
    dispose();
    ctx.closeSheet();
    onFound(id);
  };
  ctx.sheet(`<form class="qr-merchant-form" novalidate><p class="eyebrow">Campus Pay</p><h2>Which campus spot?</h2><label class="field"><span>Merchant code</span><input class="input" name="merchantCode" placeholder="e.g. GOBE" maxlength="100" autocapitalize="characters" autocomplete="off" required></label><p class="muted small">Try GOBE, SHUTTLE, PRINTS or HALL in this demo.</p><p class="error" data-merchant-error role="alert" hidden></p><button type="submit" class="button">Find merchant ${icon('arrow',19)}</button></form>`, sheet => {
    if (!alive) return;
    form = sheet.querySelector('form');
    form?.addEventListener('submit', submit);
    sheet.querySelector('input')?.focus();
  }, { onDispose:()=>form?.removeEventListener('submit',submit),onClose: () => { const wasAlive = alive; dispose(); if (wasAlive) onClose?.(); } });
  return dispose;
}
