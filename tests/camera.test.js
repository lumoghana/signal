import test from 'node:test';
import assert from 'node:assert/strict';
import { createCameraController, cameraErrorMessage, releasePhoto } from '../dist/js/camera.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise(resolve => setImmediate(resolve));
const namedError = name => Object.assign(new Error(name), { name });

class Track extends EventTarget {
  constructor(facingMode = 'environment', log = []) { super(); this.readyState = 'live'; this.facingMode = facingMode; this.stops = 0; this.log = log; }
  getSettings() { return { facingMode: this.facingMode }; }
  stop() { this.stops += 1; this.readyState = 'ended'; this.log.push('stop'); }
}
const makeStream = (track = new Track(), extraTracks = []) => ({
  track,
  getTracks: () => [track, ...extraTracks],
  getVideoTracks: () => [track],
});
class Video extends EventTarget {
  constructor() { super(); this.readyState = 4; this.videoWidth = 1920; this.videoHeight = 1080; this.srcObject = null; this.attributes = {}; this.pauses = 0; }
  play() { return Promise.resolve(); }
  pause() { this.pauses += 1; }
  setAttribute(name, value) { this.attributes[name] = value; }
}
function photos({ hold = false, result = new Blob(['photo'], { type: 'image/jpeg' }) } = {}) {
  const calls = { draws: [], transforms: [], encoded: [], created: [], revoked: [] };
  let finish;
  const canvas = {
    getContext: () => ({
      drawImage: (...args) => calls.draws.push(args),
      translate: (...args) => calls.transforms.push(['translate', ...args]),
      scale: (...args) => calls.transforms.push(['scale', ...args]),
    }),
    toBlob(callback, type, quality) {
      calls.encoded.push({ type, quality });
      finish = () => callback(result);
      if (!hold) queueMicrotask(finish);
    },
  };
  const urlApi = {
    createObjectURL(blob) { calls.created.push(blob); return `blob:local-photo-${calls.created.length}`; },
    revokeObjectURL(url) { calls.revoked.push(url); },
  };
  return { canvas, calls, urlApi, createCanvas: () => canvas, finish: () => finish() };
}
function setup(options = {}) {
  const stream = makeStream(), video = new Video(), requests = [];
  const camera = createCameraController({
    secureContext: true,
    mediaDevices: { getUserMedia: async constraints => { requests.push(constraints); return stream; } },
    ...options,
  });
  return { camera, stream, video, requests };
}

test('starts a muted inline real-video preview without requesting a microphone', async () => {
  const { camera, stream, video, requests } = setup();
  assert.deepEqual(await camera.start(video), { facingMode: 'environment' });
  assert.deepEqual(requests, [{ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } }]);
  assert.equal(video.srcObject, stream);
  assert.equal(video.muted, true);
  assert.equal(video.autoplay, true);
  assert.equal(video.playsInline, true);
  assert.equal(video.attributes.playsinline, '');
  assert.equal(camera.active, true);
  camera.dispose();
});

test('waits for a playable frame with real dimensions', async () => {
  const { camera, video } = setup();
  video.readyState = 1; video.videoWidth = 0; video.videoHeight = 0;
  let ready = false;
  const starting = camera.start(video).then(() => { ready = true; });
  await tick();
  assert.equal(ready, false);
  video.dispatchEvent(new Event('loadedmetadata'));
  await tick();
  assert.equal(ready, false);
  video.videoWidth = 1280; video.videoHeight = 720; video.readyState = 2;
  video.dispatchEvent(new Event('loadeddata'));
  await starting;
  assert.equal(camera.active, true);
  camera.dispose();
});

test('bounds a stalled preview and a stalled play promise, releasing their tracks', async () => {
  for (const stalledPlay of [false, true]) {
    const { camera, video, stream } = setup({ frameTimeoutMs: 15 });
    if (stalledPlay) video.play = () => new Promise(() => {});
    else { video.readyState = 1; video.videoWidth = 0; }
    await assert.rejects(camera.start(video), { name: 'TimeoutError' });
    assert.equal(stream.track.stops, 1);
    assert.equal(video.srcObject, null);
    assert.equal(camera.active, false);
  }
});

test('permission, missing-camera and insecure-context errors give useful next actions', async () => {
  for (const [name, message] of [
    ['NotAllowedError', /Allow camera/], ['NotFoundError', /No camera/],
    ['NotReadableError', /Close other camera apps/], ['OverconstrainedError', /Switch cameras/],
  ]) {
    const { camera, video } = setup({ mediaDevices: { getUserMedia: async () => { throw namedError(name); } } });
    await assert.rejects(camera.start(video), { name });
    assert.match(cameraErrorMessage(namedError(name)), message);
    assert.equal(camera.active, false);
  }
  const { camera, video, requests } = setup({ secureContext: false });
  await assert.rejects(camera.start(video), { name: 'SecurityError' });
  assert.equal(requests.length, 0);
  assert.match(cameraErrorMessage(namedError('SecurityError')), /HTTPS/);
  const unavailable = createCameraController({ secureContext: true, mediaDevices: {} });
  await assert.rejects(unavailable.start(video), { name: 'NotSupportedError' });
});

test('playback rejection releases the acquired camera and asks the user to retry the preview', async () => {
  const { camera, video, stream } = setup();
  video.play = async () => { throw namedError('NotAllowedError'); };
  const error = await camera.start(video).catch(error => error);
  assert.equal(error.code, 'camera-play');
  assert.match(cameraErrorMessage(error), /preview couldn’t play/);
  assert.equal(stream.track.stops, 1);
  assert.equal(video.srcObject, null);
});

test('stop releases every track but only clears a preview it still owns', async () => {
  const audioTrack = new Track(), stream = makeStream(new Track(), [audioTrack]);
  const { camera, video } = setup({ mediaDevices: { getUserMedia: async () => stream } });
  await camera.start(video);
  const replacement = { unrelated: true };
  video.srcObject = replacement;
  camera.stop();
  assert.equal(stream.track.stops, 1);
  assert.equal(audioTrack.stops, 1);
  assert.equal(video.srcObject, replacement);
  assert.equal(video.pauses, 0);
  assert.equal(camera.active, false);
  camera.stop();
  assert.equal(stream.track.stops, 1);
});

test('switch stops the previous camera before requesting the other facing mode', async () => {
  const log = [], first = makeStream(new Track('environment', log)), second = makeStream(new Track('user', log));
  const facing = [];
  const { camera, video } = setup({ mediaDevices: { getUserMedia: async constraints => {
    facing.push(constraints.video.facingMode.ideal); log.push('request');
    return facing.length === 1 ? first : second;
  } } });
  await camera.start(video);
  assert.deepEqual(await camera.switch(video), { facingMode: 'user' });
  assert.deepEqual(log, ['request', 'stop', 'request']);
  assert.deepEqual(facing, ['environment', 'user']);
  assert.equal(camera.facingMode, 'user');
  assert.equal(video.srcObject, second);
  camera.dispose();
});

test('late permission after disposal immediately releases the stream without attaching it', async () => {
  const permission = deferred(), stream = makeStream();
  const { camera, video } = setup({ mediaDevices: { getUserMedia: () => permission.promise } });
  const result = camera.start(video).catch(error => error);
  camera.dispose();
  assert.equal((await result).name, 'AbortError');
  permission.resolve(stream);
  await tick();
  assert.equal(stream.track.stops, 1);
  assert.equal(video.srcObject, null);
  assert.equal(camera.active, false);
  await assert.rejects(camera.start(video), { name: 'AbortError' });
});

test('the latest concurrent request owns the preview and a late older stream is stopped', async () => {
  const first = deferred(), oldStream = makeStream(), newStream = makeStream(new Track('user'));
  let requests = 0;
  const { camera, video } = setup({ mediaDevices: { getUserMedia: () => ++requests === 1 ? first.promise : Promise.resolve(newStream) } });
  const oldResult = camera.start(video).catch(error => error);
  await camera.start(video, { facingMode: 'user' });
  first.resolve(oldStream);
  assert.equal((await oldResult).name, 'AbortError');
  await tick();
  assert.equal(oldStream.track.stops, 1);
  assert.equal(newStream.track.stops, 0);
  assert.equal(video.srcObject, newStream);
  assert.equal(camera.active, true);
  camera.dispose();
});

test('a late failure from an obsolete request cannot close the newer preview', async () => {
  const first = deferred(), newStream = makeStream();
  let requests = 0;
  const { camera, video } = setup({ mediaDevices: { getUserMedia: () => ++requests === 1 ? first.promise : Promise.resolve(newStream) } });
  const oldResult = camera.start(video).catch(error => error);
  await camera.start(video);
  first.reject(namedError('NotAllowedError'));
  assert.equal((await oldResult).name, 'AbortError');
  await tick();
  assert.equal(camera.active, true);
  assert.equal(newStream.track.stops, 0);
  camera.dispose();
});

test('a disconnected track releases the preview and reports a recoverable camera error', async () => {
  const errors = [], { camera, video, stream } = setup({ onEnded: error => errors.push(error) });
  await camera.start(video);
  stream.track.readyState = 'ended';
  stream.track.dispatchEvent(new Event('ended'));
  assert.equal(camera.active, false);
  assert.equal(video.srcObject, null);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'camera-ended');
  assert.match(cameraErrorMessage(errors[0]), /disconnected/);
  stream.track.dispatchEvent(new Event('ended'));
  assert.equal(errors.length, 1);
});

test('captures a centred crop as JPEG at the requested size and keeps it through stop/dispose', async () => {
  const photoTools = photos(), { camera, video } = setup(photoTools);
  await camera.start(video);
  const photo = await camera.capture({ aspectRatio: 1, maxDimension: 800, quality: .9, mirror: true });
  assert.deepEqual(photoTools.calls.draws[0], [video, 420, 0, 1080, 1080, 0, 0, 800, 800]);
  assert.deepEqual(photoTools.calls.transforms, [['translate', 800, 0], ['scale', -1, 1]]);
  assert.deepEqual(photoTools.calls.encoded, [{ type: 'image/jpeg', quality: .9 }]);
  assert.equal(photo.width, 800); assert.equal(photo.height, 800);
  assert.equal(photo.blob.type, 'image/jpeg');
  assert.equal(photo.url, 'blob:local-photo-1');
  camera.stop(); camera.dispose();
  assert.deepEqual(photoTools.calls.revoked, []);
  assert.equal(releasePhoto(photo, { urlApi: photoTools.urlApi }), true);
  assert.deepEqual(photoTools.calls.revoked, [photo.url]);
});

test('portrait capture crops the top and bottom while keeping an unmirrored card readable', async () => {
  const photoTools = photos(), { camera, video } = setup(photoTools);
  video.videoWidth = 1080; video.videoHeight = 1920;
  await camera.start(video);
  const photo = await camera.capture({ aspectRatio: 1.5, maxDimension: 1600 });
  assert.deepEqual(photoTools.calls.draws[0], [video, 0, 600, 1080, 720, 0, 0, 1080, 720]);
  assert.deepEqual(photoTools.calls.transforms, []);
  assert.equal(photo.width, 1080); assert.equal(photo.height, 720);
  camera.dispose(); releasePhoto(photo, { urlApi: photoTools.urlApi });
});

test('capture rejects an inactive or empty preview and invalid dimensions without allocating a URL', async () => {
  const photoTools = photos(), { camera, video } = setup(photoTools);
  await assert.rejects(camera.capture(), { name: 'NotReadableError' });
  await camera.start(video);
  video.videoWidth = 0;
  await assert.rejects(camera.capture(), { name: 'InvalidStateError' });
  video.videoWidth = 1920;
  await assert.rejects(camera.capture({ aspectRatio: 0 }), RangeError);
  await assert.rejects(camera.capture({ maxDimension: Infinity }), RangeError);
  assert.equal(photoTools.calls.created.length, 0);
  camera.dispose();
});

test('stop aborts an encoding in progress, and its late result never gets an object URL', async () => {
  const photoTools = photos({ hold: true }), { camera, video } = setup(photoTools);
  await camera.start(video);
  const capture = camera.capture().catch(error => error);
  camera.stop();
  assert.equal((await capture).name, 'AbortError');
  photoTools.finish();
  await tick();
  assert.equal(photoTools.calls.created.length, 0);
});

test('failed JPEG encoding releases nothing and gives a retry message', async () => {
  const photoTools = photos({ result: null }), { camera, video } = setup(photoTools);
  await camera.start(video);
  await assert.rejects(camera.capture(), { name: 'EncodingError' });
  assert.match(cameraErrorMessage(namedError('EncodingError')), /try again/);
  assert.equal(photoTools.calls.created.length, 0);
  camera.dispose();
});

test('releasePhoto accepts local photo URLs only', () => {
  const revoked = [], urlApi = { revokeObjectURL: url => revoked.push(url) };
  assert.equal(releasePhoto(null, { urlApi }), false);
  assert.equal(releasePhoto({ url: 'https://example.com/photo.jpg' }, { urlApi }), false);
  assert.equal(releasePhoto({ url: 'blob:local' }, { urlApi }), true);
  assert.deepEqual(revoked, ['blob:local']);
});
