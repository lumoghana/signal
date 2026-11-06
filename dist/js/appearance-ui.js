import { icon, row } from './ui.js';

const labels = { system: 'System', light: 'Light', dark: 'Dark' };
const appearance = () => window.LumoAppearance;
const symbols = {
  system: '<rect x="7" y="2" width="10" height="20" rx="3"/><path d="M10.5 5h3M11 19h2"/>',
  light: '<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4m0-15.6-1.4 1.4M5.6 18.4l-1.4 1.4"/>',
  dark: '<path d="M20.5 14.5A9 9 0 0 1 9.5 3.5a9 9 0 1 0 11 11Z"/>'
};

export function appearanceRow() {
  return row({ emoji: icon('phone'), title: 'Appearance', sub: labels[appearance()?.getPreference()] || 'Dark', action: 'appearance-open' });
}

export function openAppearance(ctx) {
  const controller = appearance();
  const returnTarget = document.activeElement?.closest('.sheet') ? document.querySelector('[data-shell="menu"]') : document.activeElement;
  ctx.sheet(`<div class="appearance-picker"><h2 id="appearance-title">Appearance</h2><fieldset class="appearance-options"><legend class="sr-only">Choose your appearance</legend>${Object.keys(labels).map(value => `<label class="appearance-choice"><input type="radio" name="appearance" value="${value}" ${controller.getPreference() === value ? 'checked' : ''}><span class="appearance-choice-face"><svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbols[value]}</svg><span>${labels[value]}</span><i aria-hidden="true">${icon('check',12)}</i></span></label>`).join('')}</fieldset><p class="appearance-hint" role="status"></p></div>`, el => {
    el.classList.add('appearance-sheet');
    el.setAttribute('aria-labelledby', 'appearance-title');
    const hint = el.querySelector('.appearance-hint');
    const update = () => {
      el.querySelectorAll('[name="appearance"]').forEach(input => { input.checked = input.value === controller.getPreference(); });
      hint.textContent = controller.getPreference() === 'system' ? 'Follows your phone’s appearance.' : 'Saved for this device.';
      document.querySelectorAll('[data-action="appearance-open"] .row-sub').forEach(node => { node.textContent = labels[controller.getPreference()]; });
    };
    update();
    const unsubscribe = controller.subscribe(update);
    el.querySelectorAll('[name="appearance"]').forEach(input => input.addEventListener('change', () => {
      const result = controller.setPreference(input.value);
      if (!result.saved) hint.textContent = 'Changed for now. Your browser could not save this choice.';
    }));
    // The existing sheet owns focus, dismissal and history. Release our subscription on removal.
    const observer = new MutationObserver(() => { if (!el.isConnected) { unsubscribe(); observer.disconnect(); } });
    observer.observe(document.querySelector('#overlay-root'), { childList: true });
  }, { closeLabel: 'Close appearance', onClose: () => { if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true }); } });
}
