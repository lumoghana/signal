import { cash, esc, icon } from './ui.js';
import { cameraErrorMessage } from './camera.js';
import { decodeQrFile, parseQrPayload } from './qr-decoder.js';
import { createQrScanner } from './qr-scanner.js';
import { openMerchantCodeSheet } from './merchant-code.js';

const imageIcon = '<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5-6 7-3-3-4 5"/></svg>';
const modeOf = route => route.mode === 'code' ? 'code' : 'scan';

export function renderQrScreen(ctx, route = {}) {
  const mode = modeOf(route), code = mode === 'code';
  // The supplied SVG encodes the same live request used by Collect and Share.
  const markup = code ? ctx.qrCodeMarkup() : '';
  const request = ctx.draft.collect || {}, name = ctx.state.profile?.name || 'Your Lumo';
  return `<section class="qr-screen ${code ? 'qr-code-screen' : 'qr-scan-screen'}" data-qr-screen>
    <header class="qr-topbar"><button type="button" class="qr-close" data-qr-close aria-label="Close QR screen">${icon('close',22)}</button><span>lumo</span><span class="qr-header-spacer" aria-hidden="true"></span></header>
    <div class="qr-tabs" role="tablist" aria-label="Lumo QR code"><button type="button" role="tab" id="qr-scan-tab" aria-controls="qr-panel" aria-selected="${!code}" data-qr-mode="scan">Scan</button><button type="button" role="tab" id="qr-code-tab" aria-controls="qr-panel" aria-selected="${code}" data-qr-mode="code">My code</button></div>
    <div class="qr-panel" id="qr-panel" role="tabpanel" aria-labelledby="${code ? 'qr-code-tab' : 'qr-scan-tab'}">
      ${code ? `<h1>Money, coming<br>your way.</h1><div class="qr-my-code"><div class="qr-code-art" role="img" aria-label="Payment QR code for ${esc(name)}">${markup}</div><h2>${esc(name)}</h2><p>${request.amount ? cash(request.amount) : 'Scan to pay me with Lumo'}</p>${request.note ? `<p class="qr-request-note">${esc(request.note)}</p>` : ''}</div><button type="button" class="qr-edit-request" data-qr-edit>${request.amount ? 'Edit amount' : 'Add an amount'} ${icon('chevron',16)}</button><div class="qr-code-actions"><button type="button" class="qr-upload" data-qr-share>${icon('share',21)} Share my code</button><button type="button" class="qr-text-link" data-qr-copy>Copy payment link</button></div>` : `<h1>Scan QR code to pay</h1><div class="qr-scan-stage"><div class="qr-camera-frame" data-qr-frame><video class="qr-camera-video" data-qr-video muted playsinline aria-label="Live QR scanner camera"></video><span class="qr-camera-placeholder" aria-hidden="true">${icon('scan',44)}</span><i class="qr-corner qr-corner-tl"></i><i class="qr-corner qr-corner-tr"></i><i class="qr-corner qr-corner-bl"></i><i class="qr-corner qr-corner-br"></i></div><p class="qr-frame-hint">Position the QR code inside the frame</p></div><div class="qr-camera-feedback"><p class="qr-status" data-qr-status role="status" aria-live="polite">Starting your camera…</p><button type="button" class="qr-retry" data-qr-retry hidden>Start camera</button></div><div class="qr-scan-actions"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" data-qr-file hidden aria-label="Choose a QR image"><button type="button" class="qr-upload" data-qr-upload>${imageIcon} Upload QR file</button><button type="button" class="qr-text-link" data-qr-person>Find a Lumo person</button><button type="button" class="qr-text-link" data-qr-merchant>Enter merchant code</button></div>`}
    </div>
  </section>`;
}

function conciseCameraError(error) {
  if (['NotFoundError', 'DevicesNotFoundError'].includes(error?.name)) return 'No camera found. You can upload a QR photo.';
  if (['NotAllowedError', 'PermissionDeniedError'].includes(error?.name)) return 'Allow camera access, or upload a QR photo.';
  if (error?.name === 'NotSupportedError') return 'Use a QR photo or enter a merchant code.';
  return cameraErrorMessage(error).replace('Enable camera', 'Start camera');
}

export function bindQrScreen(ctx, route = {}, {
  createScanner = createQrScanner,
  decodeFile = decodeQrFile,
  document: doc = globalThis.document,
} = {}) {
  const root = ctx.$('[data-qr-screen]');
  if (!root) return () => {};
  let alive = true, fileGeneration = 0, busy = false, closeMerchantCode = () => {};
  const listeners = [], mode = modeOf(route);
  const query = selector => root.querySelector(selector);
  const listen = (el, event, callback) => { if (!el) return; el.addEventListener(event, callback); listeners.push(() => el.removeEventListener(event, callback)); };
  const status = query('[data-qr-status]'), retry = query('[data-qr-retry]'), frame = query('[data-qr-frame]');
  const connected = () => alive && root.isConnected !== false;
  const showStatus = (message, { canRetry = false, live = false } = {}) => {
    if (!connected()) return;
    if (status) status.textContent = message;
    if (retry) retry.hidden = !canRetry;
    frame?.classList.toggle('qr-camera-live', live);
  };
  let scanner;
  const stop = () => { fileGeneration += 1; scanner?.stop(); frame?.classList.remove('qr-camera-live'); };
  const openPayment = raw => {
    if (!connected()) return false;
    const result = parseQrPayload(raw, { origin: globalThis.location?.origin });
    if (!result.ok) { showStatus(result.message, { live: scanner?.active }); return false; }
    stop(); showStatus('Code found. Let’s check the details.');
    if (result.payment.type === 'merchant') ctx.openQrMerchant(result.payment.id);
    else ctx.openQrPayment(result.payment);
    return true;
  };
  scanner = createScanner({ onCode: openPayment, onError: error => showStatus(conciseCameraError(error), { canRetry: true }) });

  listen(query('[data-qr-close]'), 'click', () => { stop(); ctx.back(); });
  root.querySelectorAll('[data-qr-mode]').forEach(button => listen(button, 'click', () => {
    if (button.dataset.qrMode === mode) return;
    stop(); ctx.go({ ...route, section: 'pay', page: 'scan', mode: button.dataset.qrMode }, { replace: true });
  }));
  listen(query('[data-qr-edit]'), 'click', () => ctx.editQrRequest());
  listen(query('[data-qr-share]'), 'click', () => ctx.shareQrCode());
  listen(query('[data-qr-copy]'), 'click', () => ctx.copyQrCode());

  const startCamera = async () => {
    if (!connected() || mode !== 'scan' || busy || doc?.hidden) return;
    showStatus('Starting your camera…');
    if (await scanner.start(query('[data-qr-video]'))) showStatus('Ready when you are.', { live: true });
  };
  listen(retry, 'click', startCamera);
  listen(query('[data-qr-upload]'), 'click', () => query('[data-qr-file]')?.click());
  listen(query('[data-qr-file]'), 'change', async event => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || busy) return;
    stop(); const token = fileGeneration; busy = true;
    query('[data-qr-upload]').disabled = true;
    showStatus('Reading your QR photo…');
    try {
      const raw = await decodeFile(file);
      if (!connected() || token !== fileGeneration || doc?.hidden) return;
      if (!raw) showStatus('No QR code found. Try a clearer photo.', { canRetry: true });
      else if (!openPayment(raw)) { if (retry) retry.hidden = false; }
    } catch (error) {
      if (connected() && token === fileGeneration) showStatus(error?.message || 'That photo could not be read. Try another.', { canRetry: true });
    } finally {
      busy = false;
      if (connected()) query('[data-qr-upload]').disabled = false;
    }
  });
  listen(query('[data-qr-person]'), 'click', () => { stop(); ctx.findQrPerson(); });
  listen(query('[data-qr-merchant]'), 'click', () => {
    stop(); showStatus('Enter a merchant code, or start the camera again.', { canRetry: true });
    closeMerchantCode();
    closeMerchantCode = openMerchantCodeSheet(ctx, { isCurrent: connected });
  });
  const visibility = () => {
    if (doc.hidden) { stop(); showStatus('Camera paused. Tap Start camera when you’re ready.', { canRetry: true }); }
  };
  if (mode === 'scan') { listen(doc, 'visibilitychange', visibility); void startCamera(); }
  return () => { alive = false; closeMerchantCode(); stop(); scanner.dispose(); listeners.forEach(remove => remove()); };
}
