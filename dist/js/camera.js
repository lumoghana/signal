/** Live, browser-local capture. Images belong to the caller; nothing is uploaded or persisted. */
const cameraError = (name, message, code = '') => Object.assign(new Error(message), { name, ...(code ? { code } : {}) });
const aborted = () => cameraError('AbortError', 'The camera operation was cancelled.');
const stopTracks = stream => { for (const track of stream?.getTracks?.() || []) { try { track.stop(); } catch {} } };

export function cameraErrorMessage(error) {
  if (error?.code === 'camera-ended') return 'The camera was disconnected. Reconnect it or try another camera.';
  if (error?.code === 'camera-play') return 'The camera preview couldn’t play. Tap Enable camera to try again.';
  switch (error?.name) {
    case 'SecurityError': return 'Camera access needs a secure page. Open Lumo using its HTTPS link.';
    case 'NotAllowedError':
    case 'PermissionDeniedError': return 'Camera access is blocked. Allow camera in your browser’s site settings, then try again.';
    case 'NotFoundError':
    case 'DevicesNotFoundError': return 'No camera was found. Connect a camera or open Lumo on your phone.';
    case 'NotReadableError':
    case 'TrackStartError': return 'The camera is busy or unavailable. Close other camera apps and try again.';
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError': return 'That camera isn’t available. Switch cameras or try again.';
    case 'InvalidStateError': return 'The preview isn’t ready yet. Wait a moment, then capture again.';
    case 'TimeoutError': return 'The camera did not show a preview. Check camera permissions and try again.';
    case 'NotSupportedError': return 'This browser can’t open a camera. Use a current browser on your phone.';
    case 'EncodingError': return 'The photo couldn’t be captured. Please try again.';
    case 'AbortError': return 'Camera stopped. Tap Enable camera to continue.';
    default: return 'We couldn’t start the camera. Please try again.';
  }
}

/** Revoke a caller-owned photo when it is retaken or the signup is left. */
export function releasePhoto(photo, { urlApi = globalThis.URL } = {}) {
  if (typeof photo?.url !== 'string' || !photo.url.startsWith('blob:')) return false;
  try { urlApi?.revokeObjectURL?.(photo.url); return true; } catch { return false; }
}

export function createCameraController({
  mediaDevices = globalThis.navigator?.mediaDevices,
  secureContext = globalThis.isSecureContext !== false,
  createCanvas = () => globalThis.document.createElement('canvas'),
  urlApi = globalThis.URL,
  onEnded = () => {},
  frameTimeoutMs = 10000,
} = {}) {
  let stream = null, video = null, generation = 0, disposed = false;
  let requestedFacing = 'environment', actualFacing = 'environment';
  const cancellations = new Set(), trackListeners = new Map();
  const isCurrent = token => !disposed && token === generation;
  const hasFrame = target => Number(target?.readyState) >= 2 && Number(target?.videoWidth) > 0 && Number(target?.videoHeight) > 0;
  const liveTracks = source => (source?.getVideoTracks?.() || []).some(track => track.readyState !== 'ended');
  const active = () => !disposed && !!stream && video?.srcObject === stream && liveTracks(stream);

  function stop() {
    generation += 1;
    for (const cancel of [...cancellations]) cancel();
    cancellations.clear();
    for (const [track, listener] of trackListeners) track.removeEventListener?.('ended', listener);
    trackListeners.clear();
    const previousStream = stream, previousVideo = video;
    stream = null; video = null;
    if (previousVideo?.srcObject === previousStream && previousStream) {
      try { previousVideo.pause?.(); } catch {}
      previousVideo.srcObject = null;
    }
    stopTracks(previousStream);
  }

  function abortable(promise, token, onLateValue) {
    return new Promise((resolve, reject) => {
      const cancel = () => { cancellations.delete(cancel); reject(aborted()); };
      cancellations.add(cancel);
      Promise.resolve(promise).then(value => {
        cancellations.delete(cancel);
        if (!isCurrent(token)) { onLateValue?.(value); reject(aborted()); }
        else resolve(value);
      }, error => {
        cancellations.delete(cancel);
        reject(isCurrent(token) ? error : aborted());
      });
      if (!isCurrent(token)) cancel();
    });
  }

  function waitForFrame(target, token) {
    if (!isCurrent(token)) return Promise.reject(aborted());
    return new Promise((resolve, reject) => {
      let timer, settled = false, playing = false;
      const events = ['loadedmetadata', 'loadeddata', 'canplay', 'resize'];
      const cleanup = () => {
        clearTimeout(timer); cancellations.delete(cancel);
        for (const event of events) target.removeEventListener?.(event, check);
        target.removeEventListener?.('error', failed);
      };
      const fail = error => { if (settled) return; settled = true; cleanup(); reject(error); };
      const cancel = () => fail(aborted());
      const failed = () => fail(cameraError('NotReadableError', 'The camera preview failed.'));
      const playFailed = error => fail(cameraError(error?.name || 'NotReadableError', 'The camera preview could not play.', 'camera-play'));
      const check = () => {
        if (settled) return;
        if (!isCurrent(token)) return cancel();
        if (playing && hasFrame(target)) { settled = true; cleanup(); resolve(); }
      };
      cancellations.add(cancel);
      for (const event of events) target.addEventListener?.(event, check);
      target.addEventListener?.('error', failed);
      timer = setTimeout(() => fail(cameraError('TimeoutError', 'The camera preview timed out.')), frameTimeoutMs);
      try { Promise.resolve(target.play()).then(() => { playing = true; check(); }, playFailed); }
      catch (error) { playFailed(error); }
    });
  }

  async function start(target, { facingMode = 'environment' } = {}) {
    if (disposed) throw aborted();
    stop();
    const token = generation;
    if (!secureContext) throw cameraError('SecurityError', 'A secure context is required.');
    if (!mediaDevices?.getUserMedia) throw cameraError('NotSupportedError', 'Camera capture is unavailable.');
    if (!target || typeof target.play !== 'function') throw cameraError('InvalidStateError', 'A video preview is required.');
    requestedFacing = facingMode === 'user' ? 'user' : 'environment';
    try {
      const acquired = await abortable(mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: requestedFacing }, width: { ideal: 1280 }, height: { ideal: 720 } },
      }), token, stopTracks);
      if (!isCurrent(token)) { stopTracks(acquired); throw aborted(); }
      if (!liveTracks(acquired)) { stopTracks(acquired); throw cameraError('NotFoundError', 'No live video track was supplied.'); }
      stream = acquired; video = target;
      const setting = acquired.getVideoTracks()[0]?.getSettings?.()?.facingMode;
      actualFacing = ['user', 'environment'].includes(setting) ? setting : requestedFacing;
      target.muted = true; target.autoplay = true; target.playsInline = true;
      target.setAttribute?.('playsinline', '');
      target.srcObject = acquired;
      for (const track of acquired.getVideoTracks()) {
        const ended = () => {
          if (!isCurrent(token) || stream !== acquired) return;
          const error = cameraError('NotReadableError', 'The camera was disconnected.', 'camera-ended');
          stop();
          try { onEnded(error); } catch {}
        };
        track.addEventListener?.('ended', ended); trackListeners.set(track, ended);
      }
      await waitForFrame(target, token);
      if (!isCurrent(token) || !active()) throw aborted();
      return { facingMode: actualFacing };
    } catch (error) {
      if (isCurrent(token)) stop();
      throw error;
    }
  }

  async function capture({ aspectRatio, maxDimension = 1600, quality = .88, mirror = false } = {}) {
    if (!active()) throw cameraError('NotReadableError', 'The camera is not running.');
    if (!hasFrame(video)) throw cameraError('InvalidStateError', 'Wait for a camera frame.');
    if (!Number.isFinite(maxDimension) || maxDimension < 1 || maxDimension > 4096) throw new RangeError('Choose a capture dimension from 1 to 4096.');
    if (aspectRatio !== undefined && (!Number.isFinite(aspectRatio) || aspectRatio <= 0)) throw new RangeError('Choose a positive capture aspect ratio.');
    const token = generation, source = video, sourceStream = stream;
    const sourceWidth = Number(source.videoWidth), sourceHeight = Number(source.videoHeight);
    const ratio = aspectRatio || sourceWidth / sourceHeight;
    let cropWidth = sourceWidth, cropHeight = sourceHeight;
    if (sourceWidth / sourceHeight > ratio) cropWidth = sourceHeight * ratio;
    else cropHeight = sourceWidth / ratio;
    const left = (sourceWidth - cropWidth) / 2, top = (sourceHeight - cropHeight) / 2;
    const scale = Math.min(1, maxDimension / Math.max(cropWidth, cropHeight));
    const width = Math.max(1, Math.round(cropWidth * scale)), height = Math.max(1, Math.round(cropHeight * scale));
    const canvas = createCanvas(); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context || typeof canvas.toBlob !== 'function') throw cameraError('NotSupportedError', 'Photo capture is unavailable.');
    if (mirror) { context.translate(width, 0); context.scale(-1, 1); }
    context.drawImage(source, left, top, cropWidth, cropHeight, 0, 0, width, height);
    const encoded = new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(cameraError('EncodingError', 'The photo was not encoded.')), 'image/jpeg', Number.isFinite(quality) ? Math.min(1, Math.max(0, quality)) : .88);
    });
    const blob = await abortable(encoded, token);
    if (!isCurrent(token) || stream !== sourceStream || video !== source) throw aborted();
    if (typeof urlApi?.createObjectURL !== 'function') throw cameraError('NotSupportedError', 'Local photo previews are unavailable.');
    return { url: urlApi.createObjectURL(blob), blob, width, height };
  }

  return {
    start,
    switch: target => start(target || video, { facingMode: requestedFacing === 'user' ? 'environment' : 'user' }),
    capture,
    stop,
    dispose() { if (disposed) return; stop(); disposed = true; },
    get active() { return active(); },
    get facingMode() { return actualFacing; },
  };
}
