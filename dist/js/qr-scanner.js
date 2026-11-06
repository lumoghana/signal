import { createCameraController } from './camera.js';
import { decodeQrPixels, qrImageDimensions } from './qr-decoder.js';

/** A local, cancellable scan loop. A decoded code is still only payment input. */
export function createQrScanner({
  onCode = () => false,
  onError = () => {},
  cameraFactory = createCameraController,
  createCanvas = () => globalThis.document.createElement('canvas'),
  decode = decodeQrPixels,
  schedule = callback => setTimeout(callback, 280),
  cancel = timer => clearTimeout(timer),
} = {}) {
  let generation = 0, disposed = false, timer = null, video = null;
  let lastCode = '', lastSeenAt = 0;
  const camera = cameraFactory({ onEnded: error => { stop(); onError(error); } });
  const isCurrent = token => !disposed && token === generation;

  function stop() {
    generation += 1;
    if (timer !== null) cancel(timer);
    timer = null; video = null;
    camera.stop();
  }

  function scan(token) {
    timer = null;
    if (!isCurrent(token) || !camera.active || !video) return;
    try {
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        const size = qrImageDimensions(video.videoWidth, video.videoHeight, 960);
        const canvas = createCanvas(); canvas.width = size.width; canvas.height = size.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('QR scanning is unavailable in this browser.');
        context.drawImage(video, 0, 0, size.width, size.height);
        const pixels = context.getImageData(0, 0, size.width, size.height);
        const code = decode(pixels.data, size.width, size.height);
        if (code && (code !== lastCode || Date.now() - lastSeenAt > 3000)) {
          lastCode = code; lastSeenAt = Date.now();
          if (onCode(code) === true) { stop(); return; }
        }
      }
    } catch (error) { stop(); onError(error); return; }
    if (isCurrent(token)) timer = schedule(() => scan(token));
  }

  return {
    async start(target) {
      if (disposed) return false;
      stop();
      const token = generation; video = target; lastCode = ''; lastSeenAt = 0;
      try {
        await camera.start(target, { facingMode: 'environment' });
        if (!isCurrent(token)) return false;
        timer = schedule(() => scan(token));
        return true;
      } catch (error) {
        if (isCurrent(token) && error?.name !== 'AbortError') { stop(); onError(error); }
        return false;
      }
    },
    stop,
    dispose() { if (disposed) return; stop(); disposed = true; camera.dispose(); },
    get active() { return !disposed && camera.active; },
  };
}
