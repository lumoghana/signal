/** Public capture bounds match lumo-access's three-frame / 1.1 MB request contract. */
export const RECOVERY_MAX_PHOTO_BYTES = 262144;
export const RECOVERY_MAX_PHOTO_CHARACTERS = 349551;
export const RECOVERY_MAX_DIMENSION = 720;
const JPEG_PREFIX = 'data:image/jpeg;base64,';
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const captureFailure = () => Object.assign(new Error('Camera photos could not be prepared within the recovery limit. Try again.'), {name:'CameraError'});
function encodedJpegBytes(value) {
  if(typeof value!=='string'||!value.startsWith(JPEG_PREFIX))return 0;
  const body=value.slice(JPEG_PREFIX.length);
  if(!body.length||body.length%4||!BASE64.test(body))return 0;
  return body.length/4*3-(body.endsWith('==')?2:body.endsWith('=')?1:0);
}
function boundedJpeg(value,maxBytes=RECOVERY_MAX_PHOTO_BYTES) {
  const size=encodedJpegBytes(value);
  if(size<4||size>maxBytes||value.length>RECOVERY_MAX_PHOTO_CHARACTERS)return false;
  try{const bytes=atob(value.slice(JPEG_PREFIX.length));return bytes.length===size&&btoa(bytes)===value.slice(JPEG_PREFIX.length)&&bytes.charCodeAt(0)===255&&bytes.charCodeAt(1)===216&&bytes.charCodeAt(bytes.length-2)===255&&bytes.charCodeAt(bytes.length-1)===217;}catch{return false;}
}
export function validRecoveryPhotos(value) {
  return Array.isArray(value)&&value.length===3&&[0,1,2].every(index=>Object.hasOwn(value,index)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,String(index)),'value')&&boundedJpeg(value[index]));
}
/**
 * Encode an existing canvas without changing its pixels or dimensions. The
 * temporary canvas is cleared on every outcome. No photo or frame is retained.
 * Setup can reuse its original capture instead of opening the camera again.
 */
export function encodeRecoveryCanvas(source,{maxBytes=RECOVERY_MAX_PHOTO_BYTES,maxDimension=RECOVERY_MAX_DIMENSION,document=source?.ownerDocument||globalThis.document}={}) {
  if(!Number.isSafeInteger(maxBytes)||maxBytes<4||maxBytes>RECOVERY_MAX_PHOTO_BYTES||!Number.isSafeInteger(maxDimension)||maxDimension<1||maxDimension>RECOVERY_MAX_DIMENSION||!Number.isSafeInteger(source?.width)||source.width<=0||source.width>8192||!Number.isSafeInteger(source?.height)||source.height<=0||source.height>8192||typeof document?.createElement!=='function')throw captureFailure();
  const canvas=document.createElement('canvas'),qualities=[.82,.72,.62,.5,.38,.28];
  try{
    const context=canvas.getContext('2d');if(!context)throw captureFailure();
    let edge=Math.min(maxDimension,Math.max(source.width,source.height));
    const minimum=Math.min(160,edge);
    while(true){
      const scale=Math.min(1,edge/Math.max(source.width,source.height));
      canvas.width=Math.max(1,Math.round(source.width*scale));canvas.height=Math.max(1,Math.round(source.height*scale));
      context.drawImage(source,0,0,canvas.width,canvas.height);
      for(const quality of qualities){
        const photo=canvas.toDataURL('image/jpeg',quality),size=encodedJpegBytes(photo);
        if(size<4)throw captureFailure();
        if(size>maxBytes)continue;
        if(!boundedJpeg(photo,maxBytes))throw captureFailure();
        return photo;
      }
      if(edge<=minimum)break;
      edge=Math.max(minimum,Math.floor(edge*.75));
    }
    throw captureFailure();
  }catch{throw captureFailure();}finally{canvas.width=0;canvas.height=0;}
}

/** Real, transient camera photos. This module makes no liveness/identity verdict. */
export function captureRecoverySelfies({
  signal, document = globalThis.document, mediaDevices = globalThis.navigator?.mediaDevices,
  secureContext = globalThis.isSecureContext === true, wait, frameIntervalMs = 300, frameTimeoutMs = 15000,purpose='recovery',faceMatching='unavailable',
} = {}) {
  const failure = (message, name = 'CameraError') => Object.assign(new Error(message), {name});
  const cancelled = () => failure('Camera capture was cancelled.', 'AbortError');
  if (signal?.aborted) return Promise.reject(cancelled());
  if (!secureContext || !document?.body || typeof document.createElement !== 'function'
      || typeof mediaDevices?.getUserMedia !== 'function') {
    return Promise.reject(failure('Camera capture needs a supported browser and a secure connection.'));
  }
  if (!Number.isFinite(frameIntervalMs) || frameIntervalMs < 0 || !Number.isFinite(frameTimeoutMs) || frameTimeoutMs <= 0)
    return Promise.reject(failure('Camera capture could not be prepared.'));

  return new Promise((resolve, reject) => {
    const previousFocus = document.activeElement, previousOverflow = document.body.style?.overflow || '';
    const listeners = [], timers = new Set(), stopped = new Set(), waiting = new AbortController();
    let stream = null, finished = false, opening = false, ready = false, capturing = false, photos = [];
    const element = (tag, text, className) => {
      const node = document.createElement(tag);
      if (text) node.textContent = text;
      if (className) node.className = className;
      return node;
    };
    const host = element('div', '', 'lumo-recovery-camera-overlay');
    host.setAttribute('role', 'dialog'); host.setAttribute('aria-modal', 'true');
    host.setAttribute('aria-labelledby', 'lumo-recovery-camera-title'); host.tabIndex = -1;
    const panel = element('section', '', 'lumo-recovery-camera-panel');
    const heading = element('h2', 'A little face time.'); heading.id = 'lumo-recovery-camera-title';
    const enrollment=purpose==='enrollment',stored=faceMatching==='stored-template';
    const description = element('p', enrollment&&stored?'Take three photos to prepare your encrypted face profile. Keep your face in view.':stored?'Take three photos with your front camera to compare with your saved face profile.':'Take three photos with your front camera. Keep your face in view.');
    const notice = element('p', stored?'The photos are discarded after processing. Live-person checks are not verified.':'These are camera photos. This capture alone does not verify liveness or identity.', 'lumo-recovery-camera-notice');
    const video = element('video', '', 'lumo-recovery-camera-preview');
    video.muted = true; video.autoplay = true; video.playsInline = true;
    video.setAttribute('playsinline', ''); video.setAttribute('aria-label', 'Live front camera preview');
    const label = element('label', '', 'lumo-recovery-camera-consent');
    const consent = element('input'); consent.type = 'checkbox'; consent.name = 'cameraConsent';
    label.append(consent, element('span', enrollment?'I agree to capture these photos for the face-profile setup I selected.':'I agree to capture these photos for this verification. They will not replace my saved face profile.'));
    const status = element('p', 'Camera is off.', 'lumo-recovery-camera-status');
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const open = element('button', 'Allow camera', 'lumo-recovery-camera-open'); open.type = 'button'; open.disabled = true;
    const capture = element('button', 'Take three photos', 'lumo-recovery-camera-capture'); capture.type = 'button'; capture.disabled = true;
    const cancel = element('button', 'Cancel camera', 'lumo-recovery-camera-cancel'); cancel.type = 'button';
    panel.append(heading, description, notice, video, label, status, open, capture, cancel); host.append(panel);
    document.body.append(host); if (document.body.style) document.body.style.overflow = 'hidden'; host.focus?.();

    function listen(target, name, handler) {
      if (!target?.addEventListener) return;
      target.addEventListener(name, handler); listeners.push(() => target.removeEventListener(name, handler));
    }
    function stopStream(value) {
      for (const track of value?.getTracks?.() || []) {
        if (stopped.has(track)) continue;
        stopped.add(track); try { track.stop(); } catch {}
      }
    }
    function clean() {
      for (const remove of listeners.splice(0)) remove();
      for (const timer of timers) clearTimeout(timer); timers.clear();
      waiting.abort(); stopStream(stream); stream = null;
      try { video.pause?.(); } catch {} video.srcObject = null;
      host.remove(); if (document.body.style) document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected !== false) previousFocus?.focus?.();
    }
    function end(error, result) {
      if (finished) return;
      finished = true; clean(); photos = [];
      if (error) reject(error); else resolve(result);
    }
    function abort() { end(cancelled()); }
    function delay(ms) {
      if (typeof wait === 'function') return wait(ms, {signal: waiting.signal});
      return new Promise((yes, no) => {
        if (waiting.signal.aborted) { no(cancelled()); return; }
        const onAbort = () => {clearTimeout(timer); timers.delete(timer); waiting.signal.removeEventListener('abort', onAbort); no(cancelled());};
        const timer = setTimeout(() => {timers.delete(timer); waiting.signal.removeEventListener('abort', onAbort); yes();}, ms);
        timers.add(timer); waiting.signal.addEventListener('abort', onAbort, {once: true});
      });
    }
    function hasFrame() {
      return video.readyState >= 2 && Number.isFinite(video.videoWidth) && video.videoWidth > 0
        && Number.isFinite(video.videoHeight) && video.videoHeight > 0;
    }
    function liveStream() {
      const tracks = stream?.getVideoTracks?.() || [];
      return tracks.length > 0 && tracks.every(track => track.readyState === 'live');
    }
    function markReady() {
      if (finished || capturing || !stream || !hasFrame() || !liveStream()) return false;
      ready = true; opening = false; capture.disabled = !consent.checked; open.hidden = true;
      status.textContent = 'Camera is on. When you are ready, take three photos.';
      for (const timer of timers) clearTimeout(timer); timers.clear(); return true;
    }
    async function start() {
      if (finished || opening || stream || !consent.checked) return;
      opening = true; open.disabled = true; status.textContent = 'Allow camera access in your browser.';
      const timeout = setTimeout(() => end(failure('The camera did not become ready. Try opening it again.', 'TimeoutError')), frameTimeoutMs);
      timers.add(timeout);
      try {
        const acquired = await mediaDevices.getUserMedia({video: {facingMode: {ideal: 'user'}}, audio: false});
        if (finished) {stopStream(acquired); return;}
        stream = acquired;
        if (!liveStream()) throw failure('No active front camera is available.');
        for (const track of stream.getTracks()) listen(track, 'ended', () => end(failure('The camera disconnected. Start a fresh capture.')));
        video.srcObject = stream;
        await video.play();
        if (finished) return;
        if (!markReady()) status.textContent = 'Waiting for the camera picture.';
      } catch (error) {
        if (finished) return;
        const message = error?.name === 'NotAllowedError' ? 'Allow camera access to capture your photos.'
          : error?.name === 'NotFoundError' ? 'No camera was found on this device.'
            : 'The camera could not open. Close other camera apps and try again.';
        end(failure(message));
      }
    }
    async function takePhotos() {
      if (finished || capturing || !ready || !consent.checked) return;
      capturing = true; capture.disabled = true; consent.disabled = true;
      try {
        for (let index = 0; index < 3; index++) {
          if (index) await delay(frameIntervalMs);
          if (finished) return;
          if (!hasFrame() || !liveStream() || video.srcObject !== stream || !consent.checked)
            throw failure('The camera picture changed. Start a fresh capture.');
          const canvas = document.createElement('canvas'), scale = Math.min(1, RECOVERY_MAX_DIMENSION / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
          let photo;
          try {
            const context = canvas.getContext('2d'); if (!context) throw failure('Camera photos could not be prepared.');
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            photo = encodeRecoveryCanvas(canvas,{document});
          } finally {canvas.width = 0; canvas.height = 0;}
          if (!boundedJpeg(photo))
            throw failure('Camera photos could not be encoded. Try again.');
          photos.push(photo); status.textContent = `Photo ${index + 1} of 3 captured.`;
        }
        end(null, photos.slice());
      } catch { if (!finished) end(failure('Camera photos could not be completed. Start a fresh capture.')); }
    }

    listen(consent, 'change', () => {
      if (finished) return;
      open.disabled = !consent.checked || opening;
      if (!consent.checked && (opening || stream)) abort();
    });
    listen(open, 'click', () => {void start();}); listen(capture, 'click', () => {void takePhotos();});
    listen(cancel, 'click', abort); listen(signal, 'abort', abort);
    for (const event of ['loadedmetadata', 'loadeddata', 'canplay', 'playing', 'resize']) listen(video, event, markReady);
    listen(document, 'visibilitychange', () => {if (document.hidden) abort();});
    listen(document.defaultView || globalThis.window, 'pagehide', abort);
    listen(document, 'keydown', event => {
      if (event.key === 'Escape') {event.preventDefault(); abort(); return;}
      if (event.key !== 'Tab' || finished) return;
      const controls = [consent, open, capture, cancel].filter(control => !control.disabled && !control.hidden);
      const first = controls[0], last = controls.at(-1), active = document.activeElement;
      if (!controls.includes(active) || event.shiftKey && active === first || !event.shiftKey && active === last) {
        event.preventDefault(); (event.shiftKey ? last : first)?.focus?.();
      }
    });
  });
}
