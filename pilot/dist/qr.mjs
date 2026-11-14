import qrcode from './vendor/qrcode.js';
import jsQR from './vendor/jsqr.js';

const PREFIX = 'lumo:shared:v1:';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HANDLE = /^[a-z][a-z0-9_]{2,29}$/;
const INVALID = 'This is not a valid shared Lumo code. Ask for a fresh QR.';
const invalid = () => new Error(INVALID);

function intent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const keys = Object.keys(value);
  if (value.kind === 'person') {
    if (keys.length !== 2 || keys.some(key => !['kind', 'handle'].includes(key)) || typeof value.handle !== 'string' || !HANDLE.test(value.handle)) throw invalid();
    return Object.freeze({kind: 'person', handle: value.handle});
  }
  if (value.kind === 'merchant') {
    if (keys.some(key => !['kind', 'shopId', 'requestId'].includes(key)) || typeof value.shopId !== 'string' || !UUID.test(value.shopId)) throw invalid();
    if (Object.hasOwn(value, 'requestId') && (typeof value.requestId !== 'string' || !UUID.test(value.requestId))) throw invalid();
    return Object.freeze({kind: 'merchant', shopId: value.shopId.toLowerCase(), ...(Object.hasOwn(value, 'requestId') ? {requestId: value.requestId.toLowerCase()} : {})});
  }
  throw invalid();
}

function base64url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// This protocol is a flat string object. Reading pairs explicitly rejects duplicate keys
// instead of accepting JSON.parse's last-value-wins behaviour for payment identities.
function parseObject(source) {
  let position = 0;
  const object = Object.create(null);
  const space = () => { while (/\s/.test(source[position] || '') && position < source.length) position++; };
  function string() {
    const match = /^"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/.exec(source.slice(position));
    if (!match) throw invalid();
    position += match[0].length;
    return JSON.parse(match[0]);
  }
  space(); if (source[position++] !== '{') throw invalid(); space();
  if (source[position] === '}') throw invalid();
  for (;;) {
    const key = string();
    if (Object.hasOwn(object, key)) throw invalid();
    space(); if (source[position++] !== ':') throw invalid(); space();
    object[key] = string();
    space();
    const next = source[position++];
    if (next === '}') break;
    if (next !== ',') throw invalid();
    space();
  }
  space(); if (position !== source.length) throw invalid();
  return object;
}

/** QR identities carry no names, amounts, credentials or authority to pay. */
export function encodeSharedQr(value) {
  return PREFIX + base64url(JSON.stringify(intent(value)));
}

export function parseSharedQr(raw) {
  try {
    if (typeof raw !== 'string' || raw.length > 2048 || !raw.startsWith(PREFIX)) throw invalid();
    const encoded = raw.slice(PREFIX.length);
    if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) throw invalid();
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - encoded.length % 4) % 4));
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const decoded = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
    if (base64url(decoded) !== encoded) throw invalid();
    return intent(parseObject(decoded));
  } catch { throw invalid(); }
}

/** Only the QR library's generated SVG is returned. Payloads are validated first. */
export function renderQr(raw) {
  parseSharedQr(raw);
  const qr = qrcode(0, 'M');
  qr.addData(raw, 'Byte'); qr.make();
  return qr.createSvgTag({cellSize: 4, margin: 16, scalable: true, alt: 'Shared Lumo payment QR'});
}

function cameraMessage(error) {
  if (['NotAllowedError', 'PermissionDeniedError'].includes(error?.name)) return 'Allow camera access in your browser, or choose a QR photo.';
  if (['NotFoundError', 'DevicesNotFoundError'].includes(error?.name)) return 'No camera was found. Choose a QR photo or paste the code.';
  if (['NotReadableError', 'TrackStartError'].includes(error?.name)) return 'The camera is busy. Close other camera apps and try again.';
  return 'The camera could not open. Choose a QR photo or paste the code.';
}

const stopTracks = stream => { for (const track of stream?.getTracks?.() || []) { try { track.stop(); } catch {} } };

/** Camera pixels stay on the device. Call the returned stop function when leaving the screen. */
export async function mountScanner(video, onDecoded, onError = () => {}, options = {}) {
  const media = options.mediaDevices || globalThis.navigator?.mediaDevices;
  const document = options.document || globalThis.document;
  const requestFrame = options.requestFrame || globalThis.requestAnimationFrame;
  const cancelFrame = options.cancelFrame || globalThis.cancelAnimationFrame;
  const canvas = options.createCanvas ? options.createCanvas() : document?.createElement('canvas');
  const signal = options.signal;
  let stream = null, frame = null, stopped = false, lastFrame = 0;
  const trackListeners = [];
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (frame != null) cancelFrame?.(frame);
    document?.removeEventListener?.('visibilitychange', hidden);
    signal?.removeEventListener?.('abort', stop);
    for (const [track, listener] of trackListeners) track.removeEventListener?.('ended', listener);
    stopTracks(stream);
    if (video?.srcObject === stream) { try { video.pause?.(); } catch {} video.srcObject = null; }
  };
  const hidden = () => { if (document?.hidden) stop(); };
  const fail = message => { stop(); onError(new Error(message)); };
  try {
    if (signal?.aborted || document?.hidden) { stop(); return stop; }
    if (!media?.getUserMedia || !video || !canvas || typeof requestFrame !== 'function') throw new Error('unavailable');
    signal?.addEventListener?.('abort', stop, {once: true});
    document?.addEventListener?.('visibilitychange', hidden);
    const acquired = await media.getUserMedia({video: {facingMode: {ideal: 'environment'}, width: {ideal: 1280}, height: {ideal: 720}}, audio: false});
    if (stopped) { stopTracks(acquired); return stop; }
    stream = acquired;
    video.srcObject = stream; video.muted = true; video.playsInline = true;
    for (const track of stream.getVideoTracks?.() || []) {
      const listener = () => { if (!stopped) fail('The camera disconnected. Open it again or choose a QR photo.'); };
      track.addEventListener?.('ended', listener); trackListeners.push([track, listener]);
    }
    await video.play();
    if (stopped) return stop;
    const context = canvas.getContext('2d', {willReadFrequently: true});
    if (!context) throw new Error('unavailable');
    const tick = timestamp => {
      if (stopped) return;
      if (timestamp - lastFrame >= 160 && video.readyState >= 2 && video.videoWidth && video.videoHeight) {
        lastFrame = timestamp;
        try {
          const ratio = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.max(1, Math.round(video.videoWidth * ratio));
          canvas.height = Math.max(1, Math.round(video.videoHeight * ratio));
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
          const result = jsQR(pixels.data, pixels.width, pixels.height, {inversionAttempts: 'attemptBoth'});
          if (result?.data) { stop(); onDecoded(result.data); return; }
        } catch { fail('This camera frame could not be read. Choose a QR photo instead.'); return; }
      }
      frame = requestFrame(tick);
    };
    frame = requestFrame(tick);
  } catch (error) { if (!stopped) fail(cameraMessage(error)); }
  return stop;
}

/** Reads a user-selected QR image locally and releases every image/canvas resource. */
export async function decodeQrImage(file, options = {}) {
  if (!file || file.size > 15 * 1024 * 1024 || !/^image\/(png|jpe?g|webp|gif|bmp)$/i.test(file.type || '')) throw new Error('Choose a QR image smaller than 15 MB.');
  const bitmapFactory = options.createImageBitmap || globalThis.createImageBitmap;
  const createCanvas = options.createCanvas || (() => globalThis.document.createElement('canvas'));
  if (typeof bitmapFactory !== 'function') throw new Error('This browser cannot read QR photos. Use your camera or paste the code.');
  let image;
  try {
    image = await bitmapFactory(file);
    if (!image.width || !image.height || image.width * image.height > 40000000) throw new Error('image-size');
    const ratio = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = createCanvas(); canvas.width = Math.max(1, Math.round(image.width * ratio)); canvas.height = Math.max(1, Math.round(image.height * ratio));
    const context = canvas.getContext('2d', {willReadFrequently: true});
    if (!context) throw new Error('image-context');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const decoded = jsQR(pixels.data, pixels.width, pixels.height, {inversionAttempts: 'attemptBoth'});
    if (!decoded?.data) throw new Error('no-code');
    return decoded.data;
  } catch { throw new Error('No readable QR was found. Choose a clearer photo or paste the code.'); }
  finally { image?.close?.(); }
}
