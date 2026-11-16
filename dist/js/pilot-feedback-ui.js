const labels = ['Strongly disagree', 'Disagree', 'Neither agree nor disagree', 'Agree', 'Strongly agree'];

export function openPilotFeedback(ctx, pilot, {onDone = () => {}} = {}) {
  const owner = pilot.identity(); if (!owner) return;
  let disposed = false, busy = false, attempt = null;
  const dismiss = () => { if (pilot.identity() === owner) pilot.dismiss(); onDone(); ctx.closeSheet(); };
  ctx.sheet(`<div class="pilot-feedback"><span class="pilot-feedback-eyebrow">OPTIONAL PILOT CHECK-IN</span><h2>How clear does your money feel?</h2><form data-pilot-survey><fieldset><legend>Lumo helped me understand what I could afford to spend.</legend>${labels.map((label, index) => `<label class="pilot-rating"><input type="radio" name="pilotRating" value="${index + 1}" required><span class="pilot-rating-number">${index + 1}</span><span>${label}</span></label>`).join('')}</fieldset><label class="pilot-comment">Anything you would like us to understand? <span>Optional</span><textarea class="input" name="pilotComment" rows="3" maxlength="500" aria-describedby="pilot-feedback-privacy"></textarea></label><p id="pilot-feedback-privacy" class="pilot-feedback-note">Your response is linked to your account so we count one response per pilot. Please leave out private account details.</p><p class="error" data-pilot-error role="status"></p><button type="submit" class="button" data-pilot-submit>Send feedback</button><button type="button" class="button text" data-pilot-dismiss>Not now</button></form></div>`, element => {
    element.setAttribute('aria-label', 'Optional pilot feedback');
    const form = element.querySelector('[data-pilot-survey]'), error = element.querySelector('[data-pilot-error]'), submit = element.querySelector('[data-pilot-submit]');
    element.querySelector('[data-pilot-dismiss]').addEventListener('click', dismiss);
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (busy || disposed || pilot.identity() !== owner) return;
      if (!attempt) {
        const selected = form.querySelector('[name="pilotRating"]:checked');
        if (!selected) { error.textContent = 'Choose the response that best matches your experience.'; return; }
        const id = globalThis.crypto?.randomUUID?.(); if (!id) { error.textContent = 'Feedback is unavailable in this browser.'; return; }
        attempt = {id, rating: Number(selected.value), comment: form.querySelector('[name="pilotComment"]').value.trim()};
      }
      busy = true; error.textContent = ''; submit.disabled = true; submit.textContent = 'Saving…';
      // Keep an uncertain response unchanged so Retry checks the same request.
      for (const input of form.querySelectorAll('input,textarea')) input.disabled = true;
      const result = await pilot.submit(attempt);
      if (pilot.identity() !== owner) return;
      if (disposed) {if (result.ok) onDone(); return;}
      busy = false; submit.disabled = false;
      if (result.ok) { onDone(); ctx.closeSheet(); ctx.toast('Thank you. Your feedback has been saved.'); return; }
      error.textContent = result.message; submit.textContent = 'Retry same response';
    });
  }, {onDispose: () => {disposed = true;}, closeLabel: 'Close optional feedback'});
}

/** A voluntary Home link, never a popup in the payment journey. */
export function bindPilotFeedback(ctx, pilot, root) {
  let alive = true; const owner = pilot.identity();
  if (!owner || ctx.route?.section !== 'home') return () => {};
  void pilot.getContext().then(() => {
    if (!alive || !root.isConnected || pilot.identity() !== owner || ctx.route?.section !== 'home' || !pilot.eligible(ctx.state)) return;
    const target = root.querySelector('.home-hero'); if (!target || target.querySelector('[data-pilot-feedback]')) return;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'home-pilot-feedback'; button.dataset.pilotFeedback = '';
    const title = document.createElement('strong'); title.textContent = 'Help us improve Lumo';
    const note = document.createElement('span'); note.textContent = 'An optional check-in about your money clarity';
    button.append(title, note); button.addEventListener('click', () => openPilotFeedback(ctx, pilot, {onDone: () => button.remove()})); target.append(button);
  });
  return () => {alive = false;};
}
