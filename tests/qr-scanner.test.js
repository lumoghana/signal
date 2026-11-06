import test from 'node:test';
import assert from 'node:assert/strict';
import { createQrScanner } from '../dist/js/qr-scanner.js';

const defer = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
function setup({ pending = false, decode = () => null, onCode = () => false } = {}) {
  const waiting = defer(), jobs = new Map(), errors = [], camera = {
    active: false, stops: 0, disposed: 0, starts: [],
    async start(video, options) { this.starts.push({ video, options }); if (pending) await waiting.promise; this.active = true; },
    stop() { this.active = false; this.stops += 1; },
    dispose() { this.stop(); this.disposed += 1; },
  };
  let next = 0, canvas;
  const scanner = createQrScanner({
    cameraFactory: () => camera, decode, onCode, onError: error => errors.push(error),
    schedule: callback => { jobs.set(++next, callback); return next; }, cancel: id => jobs.delete(id),
    createCanvas: () => (canvas = { width: 0, height: 0, getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(canvas.width * canvas.height * 4) }) }) }),
  });
  const video = { readyState: 4, videoWidth: 1920, videoHeight: 1080 };
  const scanFrame = () => { const [id, callback] = jobs.entries().next().value || []; jobs.delete(id); callback?.(); };
  return { scanner, camera, jobs, errors, video, waiting, scanFrame, get canvas() { return canvas; } };
}

test('camera scan requests the rear feed, caps decoded frames, and stops after accepted payment input', async () => {
  const results = [], x = setup({ decode: (data, width, height) => { assert.equal(width, 960); assert.equal(height, 540); return 'merchant:GOBE'; }, onCode: value => { results.push(value); return true; } });
  assert.equal(await x.scanner.start(x.video), true);
  assert.deepEqual(x.camera.starts[0].options, { facingMode: 'environment' });
  x.scanFrame();
  assert.deepEqual(results, ['merchant:GOBE']);
  assert.equal(x.scanner.active, false);
  assert.equal(x.jobs.size, 0);
  x.scanner.dispose();
});

test('an unsupported QR keeps scanning without repeatedly announcing the same code', async () => {
  const results = [], x = setup({ decode: () => 'https://other.example', onCode: value => { results.push(value); return false; } });
  await x.scanner.start(x.video);
  x.scanFrame(); x.scanFrame();
  assert.deepEqual(results, ['https://other.example']);
  assert.equal(x.scanner.active, true);
  assert.equal(x.jobs.size, 1);
  x.scanner.dispose();
  assert.equal(x.jobs.size, 0);
});

test('leaving while camera permission is pending cannot launch a late scan loop', async () => {
  const x = setup({ pending: true });
  const starting = x.scanner.start(x.video);
  x.scanner.dispose(); x.waiting.resolve();
  assert.equal(await starting, false);
  assert.equal(x.jobs.size, 0);
  assert.equal(x.camera.disposed, 1);
  assert.deepEqual(x.errors, []);
});

test('pixel-read failures stop capture and expose a recoverable scanner error', async () => {
  const x = setup({ decode: () => { throw new Error('Unreadable frame'); } });
  await x.scanner.start(x.video); x.scanFrame();
  assert.equal(x.scanner.active, false);
  assert.equal(x.jobs.size, 0);
  assert.equal(x.errors[0].message, 'Unreadable frame');
  x.scanner.dispose();
});
