import test from 'node:test';
import assert from 'node:assert/strict';
import qrcode from '../dist/js/vendor/qrcode.js';
import { parseQrPayload, merchantIdFromCode, decodeQrPixels, qrImageDimensions, decodeQrFile } from '../dist/js/qr-decoder.js';

const origin = 'https://lumo.example';
const parse = value => parseQrPayload(value, { origin });
const paymentLink = fields => `${origin}/?${new URLSearchParams(fields)}`;

function qrPixels(text, { inverted = false } = {}) {
  const qr = qrcode(0, 'M');
  qr.addData(text); qr.make();
  const scale = 6, quiet = 4, modules = qr.getModuleCount();
  const width = (modules + quiet * 2) * scale;
  const data = new Uint8ClampedArray(width * width * 4);
  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const row = Math.floor(y / scale) - quiet, col = Math.floor(x / scale) - quiet;
      const dark = row >= 0 && col >= 0 && row < modules && col < modules && qr.isDark(row, col);
      const value = dark !== inverted ? 0 : 255, offset = (y * width + x) * 4;
      data[offset] = value; data[offset + 1] = value; data[offset + 2] = value; data[offset + 3] = 255;
    }
  }
  return { data, width, height: width };
}

test('same-site payment links become review data with integer pesewas and bounded text', () => {
  assert.deepEqual(parse(paymentLink({ payTo: 'Ama Mensah', amount: '35000', note: 'Lunch split' })), {
    ok: true, payment: { type: 'person', name: 'Ama Mensah', amount: 35000, note: 'Lunch split' },
  });
  assert.deepEqual(parse('?payTo=Kofi'), { ok: true, payment: { type: 'person', name: 'Kofi', amount: 0, note: '' } });
  assert.equal(parse('/?payTo=Ama&amount=1').payment.amount, 1);
  assert.equal(parse('/?payTo=Ama&amount=100000000').payment.amount, 100000000);
  assert.equal(parse(paymentLink({ payTo: 'A'.repeat(60), note: 'n'.repeat(140) })).ok, true);
});

test('campus aliases and catalog IDs resolve only known campus merchants', () => {
  for (const [code, id] of [['GOBE', 'gobe-spot'], ['shuttle', 'campus-shuttle'], [' PRINTS ', 'balme-prints'], ['HALL', 'hall-dues'], ['gobe-spot', 'gobe-spot']]) {
    assert.equal(merchantIdFromCode(code), id);
    assert.deepEqual(parse(`LUMO:merchant:${code.trim()}`), { ok: true, payment: { type: 'merchant', id } });
  }
  assert.deepEqual(parse('merchant:gobe-spot'), { ok: true, payment: { type: 'merchant', id: 'gobe-spot' } });
  for (const code of ['electricity', 'airtime', 'unknown', '__proto__', 'constructor', '', null]) {
    assert.equal(merchantIdFromCode(code), null);
  }
  assert.equal(parse('LUMO:merchant:unknown').ok, false);
});

test('foreign URLs, active content and URL ambiguity never become a payment', () => {
  for (const value of [
    'https://other.example/?payTo=Ama', '//other.example/?payTo=Ama',
    'http://lumo.example/?payTo=Ama', 'https://lumo.example:444/?payTo=Ama',
    'https://user:password@lumo.example/?payTo=Ama',
    'javascript:alert(1)', 'data:text/html,test', 'file:///tmp/?payTo=Ama',
    '/?payTo=Ama#https://other.example', '/?payTo=Ama&payTo=Kofi',
    '/?payTo=Ama&amount=1&amount=2', '/?payTo=Ama&note=x&note=y',
    'lumo.example/?payTo=Ama', 'Just some text', '', null, 'x'.repeat(2049),
  ]) {
    const result = parse(value);
    assert.equal(result.ok, false, String(value));
    assert.equal(typeof result.message, 'string');
    assert.equal(result.payment, undefined);
  }
});

test('malformed amounts and recipient text are rejected rather than silently changed', () => {
  for (const amount of ['', '0', '-1', '0.01', '1e3', 'NaN', 'Infinity', '100000001', '9007199254740992', ' 500', '5,000', '+1']) {
    assert.equal(parse(paymentLink({ payTo: 'Ama', amount })).ok, false, amount);
  }
  for (const fields of [
    {}, { payTo: '' }, { payTo: '   ' }, { payTo: 'A'.repeat(61) },
    { payTo: '<script>' }, { payTo: 'Ama\nMensah' }, { payTo: 'Ama\u007f' },
    { payTo: 'Ama', note: 'n'.repeat(141) }, { payTo: 'Ama', note: 'Lunch\u0000' },
  ]) assert.equal(parse(paymentLink(fields)).ok, false, JSON.stringify(fields));
});

test('the bundled decoder reads real normal and inverted QR pixels', () => {
  const text = paymentLink({ payTo: 'Ama Mensah', amount: '2550', note: 'Campus lunch' });
  for (const inverted of [false, true]) {
    const fixture = qrPixels(text, { inverted });
    const decoded = decodeQrPixels(fixture.data, fixture.width, fixture.height);
    assert.equal(decoded, text);
    assert.equal(parse(decoded).payment.amount, 2550);
  }
  assert.equal(decodeQrPixels(new Uint8ClampedArray(32 * 32 * 4).fill(255), 32, 32), null);
  assert.equal(decodeQrPixels(new Uint8ClampedArray(4), 2, 2), null);
  assert.equal(decodeQrPixels([], 0, 0), null);
});

test('large photos are reduced while keeping their aspect ratio', () => {
  assert.deepEqual(qrImageDimensions(4000, 3000), { width: 1600, height: 1200 });
  assert.deepEqual(qrImageDimensions(3000, 4000), { width: 1200, height: 1600 });
  assert.deepEqual(qrImageDimensions(400, 300), { width: 400, height: 300 });
  for (const dimensions of [[0, 50], [50, -1], [NaN, 100], [Infinity, 100], [50001, 100]]) {
    assert.throws(() => qrImageDimensions(...dimensions), /readable/);
  }
});

test('photo decoding reads local pixels, caps the canvas and releases the bitmap', async () => {
  const file = { type: 'image/png', size: 8 * 1024 * 1024 };
  let closed = 0, drawn, decoded;
  const bitmap = { width: 4000, height: 3000, close() { closed += 1; } };
  const pixels = new Uint8ClampedArray(4);
  const canvas = { getContext() { return {
    drawImage(...args) { drawn = args; },
    getImageData() { return { data: pixels }; },
  }; } };
  const result = await decodeQrFile(file, {
    createBitmap: async input => { assert.equal(input, file); return bitmap; },
    createCanvas: () => canvas,
    decode: (...args) => { decoded = args; return 'merchant:GOBE'; },
  });
  assert.equal(result, 'merchant:GOBE');
  assert.deepEqual([canvas.width, canvas.height], [1600, 1200]);
  assert.deepEqual(drawn, [bitmap, 0, 0, 1600, 1200]);
  assert.deepEqual(decoded, [pixels, 1600, 1200]);
  assert.equal(closed, 1);
});

test('unsupported or oversized files never reach image decoding', async () => {
  let opened = 0;
  for (const file of [null, { type: 'image/svg+xml', size: 100 }, { type: 'text/plain', size: 100 }, { type: 'image/png', size: 0 }, { type: 'image/jpeg', size: 8 * 1024 * 1024 + 1 }]) {
    await assert.rejects(decodeQrFile(file, { createBitmap: async () => { opened += 1; } }), /under 8 MB/);
  }
  assert.equal(opened, 0);
});

test('bitmap resources are released if pixel reading or decoding fails', async () => {
  let closed = 0;
  const bitmap = { width: 100, height: 100, close() { closed += 1; } };
  await assert.rejects(decodeQrFile({ type: 'image/png', size: 100 }, {
    createBitmap: async () => bitmap,
    createCanvas: () => ({ getContext: () => null }),
  }), /cannot read QR photos/);
  assert.equal(closed, 1);
  await assert.rejects(decodeQrFile({ type: 'image/png', size: 100 }, {
    createBitmap: async () => bitmap,
    createCanvas: () => ({ getContext: () => ({ drawImage() {}, getImageData() { return { data: new Uint8ClampedArray(4) }; } }) }),
    decode: () => { throw new Error('decode failed'); },
  }), /decode failed/);
  assert.equal(closed, 2);
});
