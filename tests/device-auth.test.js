import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { deviceAuthSupport, deviceCredentialStatus, registerDeviceCredential, authenticateDevice, consumeDeviceProof } from '../dist/js/device-auth.js';

const enc = new TextEncoder();
const b64 = b => Buffer.from(b).toString('base64url');
function derSignature(raw) {
  const integer = b => {
    let value = Buffer.from(b);
    while (value.length > 1 && value[0] === 0) value = value.subarray(1);
    if (value[0] & 0x80) value = Buffer.concat([Buffer.from([0]), value]);
    return Buffer.concat([Buffer.from([2, value.length]), value]);
  };
  const parts = Buffer.concat([integer(raw.slice(0, 32)), integer(raw.slice(32))]);
  return Buffer.concat([Buffer.from([0x30, parts.length]), parts]);
}
async function fixture({ algorithm = -7 } = {}) {
  const keyOptions = algorithm === -7 ? { name: 'ECDSA', namedCurve: 'P-256' } :
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
  const keys = await webcrypto.subtle.generateKey(keyOptions, true, ['sign', 'verify']);
  const publicKey = await webcrypto.subtle.exportKey('spki', keys.publicKey);
  const rawId = webcrypto.getRandomValues(new Uint8Array(24));
  const state = { counter: 0, flags: 5, mutateClient: d => d, registrationOptions: null, authOptions: null, now: Date.now() };
  const env = { crypto: webcrypto, secureContext: true, origin: 'https://lumo.example', now: () => state.now,
    publicKeyCredential: { isUserVerifyingPlatformAuthenticatorAvailable: async () => true }, credentials: {} };
  async function authData(registration = false) {
    const data = new Uint8Array(registration ? 55 + rawId.length : 37);
    data.set(new Uint8Array(await webcrypto.subtle.digest('SHA-256', enc.encode('lumo.example'))));
    data[32] = state.flags | (registration ? 0x40 : 0);
    new DataView(data.buffer).setUint32(33, state.counter, false);
    if (registration) { new DataView(data.buffer).setUint16(53, rawId.length, false); data.set(rawId, 55); }
    if (state.wrongRp) data[0] ^= 255;
    return data;
  }
  const client = (options, type) => enc.encode(JSON.stringify(state.mutateClient({ type, challenge: b64(options.challenge), origin: env.origin, crossOrigin: false })));
  env.credentials.create = async ({ publicKey: options, signal }) => {
    state.registrationOptions = options;
    if (state.error) throw state.error;
    if (state.abortAfterCreate) state.abortAfterCreate.abort();
    const auth = await authData(true);
    return { type: 'public-key', id: b64(rawId), rawId, authenticatorAttachment: 'platform', response: {
      clientDataJSON: client(options, 'webauthn.create'), getAuthenticatorData: () => auth,
      getPublicKey: () => publicKey, getPublicKeyAlgorithm: () => algorithm,
    } };
  };
  env.credentials.get = async ({ publicKey: options }) => {
    state.authOptions = options;
    if (state.error) throw state.error;
    const clientDataJSON = client(options, 'webauthn.get'), authenticatorData = await authData();
    const hash = new Uint8Array(await webcrypto.subtle.digest('SHA-256', clientDataJSON));
    const signed = Buffer.concat([authenticatorData, hash]);
    const raw = new Uint8Array(await webcrypto.subtle.sign(algorithm === -7 ? { name: 'ECDSA', hash: 'SHA-256' } : keyOptions, keys.privateKey, signed));
    const signature = algorithm === -7 ? derSignature(raw) : raw;
    if (state.badSignature) signature[signature.length - 1] ^= 1;
    if (state.abortAfterGet) state.abortAfterGet.abort();
    return { type: 'public-key', id: state.wrongId ? b64(new Uint8Array([1, 2, 3])) : b64(rawId), rawId,
      authenticatorAttachment: 'platform', response: { clientDataJSON, authenticatorData, signature,
        userHandle: state.registrationOptions?.user.id || null } };
  };
  const register = () => registerDeviceCredential({ username: 'ama.student', displayName: 'Ama' }, env);
  const authenticate = (record, purpose = 'login', signal) => authenticateDevice(record, { purpose, signal }, env);
  return { env, state, register, authenticate };
}

test('unsupported or insecure device verification never opens a native prompt', async () => {
  const f = await fixture(); let calls = 0;
  f.env.credentials.create = async () => { calls++; };
  f.env.secureContext = false;
  assert.equal((await deviceAuthSupport(f.env)).available, false);
  assert.equal((await f.register()).code, 'unavailable');
  assert.equal(calls, 0);
  f.env.secureContext = true; f.env.publicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = async () => false;
  assert.equal((await f.register()).ok, false);
  assert.equal(calls, 0);
});

test('registration requires platform user verification and returns public material only', async () => {
  const f = await fixture(), result = await f.register();
  assert.equal(result.ok, true);
  assert.equal(f.state.registrationOptions.authenticatorSelection.authenticatorAttachment, 'platform');
  assert.equal(f.state.registrationOptions.authenticatorSelection.userVerification, 'required');
  assert.equal(f.state.registrationOptions.attestation, 'none');
  assert.deepEqual(Object.keys(result.credential).sort(), ['algorithm', 'counter', 'createdAt', 'id', 'origin', 'publicKey', 'rpId', 'userHandle']);
  result.credential.publicKey = 'tampered';
  const verified = consumeDeviceProof(result.proof, { purpose: 'register', credentialId: result.credential.id }, f.env);
  assert.notEqual(verified.credential.publicKey, 'tampered');
  assert.equal(consumeDeviceProof(result.proof, { purpose: 'register', credentialId: result.credential.id }, f.env), false);
});

test('registration rejects wrong origin, challenge, site hash and missing user verification', async () => {
  for (const mode of ['origin', 'challenge', 'rp', 'uv', 'crossOrigin']) {
    const f = await fixture();
    if (mode === 'origin') f.state.mutateClient = data => ({ ...data, origin: 'https://other.example' });
    if (mode === 'challenge') f.state.mutateClient = data => ({ ...data, challenge: 'wrong' });
    if (mode === 'crossOrigin') f.state.mutateClient = data => ({ ...data, crossOrigin: true });
    if (mode === 'rp') f.state.wrongRp = true;
    if (mode === 'uv') f.state.flags = 1;
    const result = await f.register(); assert.equal(result.ok, false, mode); assert.equal(result.proof, undefined);
  }
});

test('verified login and transaction assertions use fresh challenges and one-use purpose-bound proofs', async () => {
  const f = await fixture(), registered = await f.register(), record = registered.credential;
  consumeDeviceProof(registered.proof, { purpose: 'register', credentialId: record.id }, f.env);
  const creationChallenge = b64(f.state.registrationOptions.challenge);
  f.state.counter = 1; const login = await f.authenticate(record);
  assert.equal(login.ok, true); assert.equal(f.state.authOptions.userVerification, 'required');
  assert.notEqual(b64(f.state.authOptions.challenge), creationChallenge);
  const loginChallenge = b64(f.state.authOptions.challenge);
  assert.equal(consumeDeviceProof(login.proof, { purpose: 'transaction', credentialId: record.id }, f.env), false);
  assert.equal(consumeDeviceProof(login.proof, { purpose: 'login', credentialId: record.id }, f.env), false);
  f.state.counter = 2; const transaction = await f.authenticate(record, 'transaction');
  assert.equal(transaction.ok, true); assert.notEqual(b64(f.state.authOptions.challenge), loginChallenge);
  assert.deepEqual(consumeDeviceProof(transaction.proof, { purpose: 'transaction', credentialId: record.id }, f.env),
    { purpose: 'transaction', credentialId: record.id, counter: 2 });
  assert.equal(consumeDeviceProof(transaction.proof, { purpose: 'transaction', credentialId: record.id }, f.env), false);
});

test('assertions reject tampered signatures, stale counters, wrong credentials and absent verification', async () => {
  for (const mode of ['signature', 'counter', 'credential', 'uv', 'rp', 'origin', 'type']) {
    const f = await fixture(), registered = await f.register();
    f.state.counter = 1;
    if (mode === 'signature') f.state.badSignature = true;
    if (mode === 'counter') registered.credential.counter = 1;
    if (mode === 'credential') f.state.wrongId = true;
    if (mode === 'uv') f.state.flags = 1;
    if (mode === 'rp') f.state.wrongRp = true;
    if (mode === 'origin') f.state.mutateClient = data => ({ ...data, origin: 'https://other.example' });
    if (mode === 'type') f.state.mutateClient = data => ({ ...data, type: 'webauthn.create' });
    const result = await f.authenticate(registered.credential); assert.equal(result.ok, false, mode); assert.equal(result.proof, undefined);
  }
});

test('a previous signed response cannot be reused against a new challenge', async () => {
  const f = await fixture(), registered = await f.register();
  f.state.counter = 1;
  const get = f.env.credentials.get; let captured;
  f.env.credentials.get = async options => captured = await get(options);
  assert.equal((await f.authenticate(registered.credential)).ok, true);
  f.env.credentials.get = async () => captured;
  const replay = await f.authenticate(registered.credential);
  assert.equal(replay.ok, false); assert.match(replay.message, /match this request/);
});

test('zero-counter authenticators work with fresh challenges while RSA signatures also verify', async () => {
  for (const algorithm of [-7, -257]) {
    const f = await fixture({ algorithm }), registered = await f.register();
    assert.equal(registered.ok, true);
    assert.equal((await f.authenticate(registered.credential)).ok, true);
    assert.equal((await f.authenticate(registered.credential, 'transaction')).ok, true);
  }
});

test('native cancellation, late response after abort and expired proofs never authorise', async () => {
  const f = await fixture(), registered = await f.register();
  f.state.error = Object.assign(Error('dismissed'), { name: 'NotAllowedError' });
  assert.equal((await f.authenticate(registered.credential)).code, 'cancelled');
  delete f.state.error;
  const controller = new AbortController(); f.state.abortAfterGet = controller;
  assert.equal((await f.authenticate(registered.credential, 'transaction', controller.signal)).code, 'cancelled');
  delete f.state.abortAfterGet;
  const result = await f.authenticate(registered.credential);
  assert.equal(result.ok, true); f.state.now += 60_001;
  assert.equal(consumeDeviceProof(result.proof, { purpose: 'login', credentialId: registered.credential.id }, f.env), false);
});


test('saved-key inspection is honest, does not open a prompt, and does not authorise', async () => {
  const f = await fixture(), registered = await f.register(), before = structuredClone(registered.credential);
  let prompts = 0;
  const get = f.env.credentials.get;
  f.env.credentials.get = async options => { prompts++; return get(options); };
  const result = await deviceCredentialStatus(registered.credential, f.env);
  assert.equal(result.status, 'saved'); assert.equal(result.needsSetup, false);
  assert.match(result.message, /saved here/); assert.doesNotMatch(result.message, /ready|verified|private key exists/i);
  assert.equal(prompts, 0); assert.equal(result.proof, undefined);
  assert.deepEqual(registered.credential, before);
  f.state.counter = 1; assert.equal((await f.authenticate(registered.credential)).ok, true);
});

test('definitely absent, foreign or unreadable saved credentials offer setup without a native prompt', async () => {
  const f = await fixture(), registered = await f.register();
  let prompts = 0; f.env.credentials.get = async () => { prompts++; throw Error('Must not prompt'); };
  assert.equal((await deviceCredentialStatus(null, f.env)).status, 'unset');
  const changes = [
    record => null,
    record => ({ ...record, origin: 'https://other.example' }),
    record => ({ ...record, rpId: 'other.example' }),
    record => ({ ...record, id: '!' }),
    record => ({ ...record, publicKey: '!' }),
    record => ({ ...record, publicKey: b64(new Uint8Array([1, 2, 3])) }),
    record => ({ ...record, algorithm: -8 }),
    record => ({ ...record, counter: -1 }),
    record => ({ ...record, counter: 0x100000000 }),
    record => ({ ...record, userHandle: b64(new Uint8Array(65)) }),
  ];
  for (const change of changes) {
    const record = change(registered.credential), before = structuredClone(record);
    if (record) {
      const status = await deviceCredentialStatus(record, f.env);
      assert.equal(status.status, 'setup-needed'); assert.equal(status.needsSetup, true);
    }
    const result = await f.authenticate(record);
    assert.equal(result.code, 'setup-needed'); assert.equal(result.needsSetup, true);
    assert.match(result.message, /Security & access/); assert.equal(result.proof, undefined);
    assert.deepEqual(record, before);
  }
  assert.equal(prompts, 0);
});

test('temporary support loss and prompt cancellation never invalidate a saved credential', async () => {
  const f = await fixture(), registered = await f.register(), before = structuredClone(registered.credential);
  f.env.secureContext = false;
  let status = await deviceCredentialStatus(registered.credential, f.env);
  assert.equal(status.status, 'unavailable'); assert.equal(status.needsSetup, false);
  assert.equal((await f.authenticate(registered.credential)).code, 'unavailable');
  f.env.secureContext = true;
  f.env.publicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = async () => false;
  status = await deviceCredentialStatus(registered.credential, f.env);
  assert.equal(status.status, 'unavailable'); assert.equal(status.needsSetup, false);
  f.env.publicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = async () => true;
  for (const name of ['NotAllowedError', 'AbortError']) {
    f.state.error = Object.assign(Error('cancelled, timed out or no matching credential'), { name });
    const result = await f.authenticate(registered.credential);
    assert.equal(result.code, 'cancelled'); assert.notEqual(result.needsSetup, true);
    assert.equal(result.proof, undefined); assert.deepEqual(registered.credential, before);
  }
  delete f.state.error;
  status = await deviceCredentialStatus(registered.credential, f.env);
  assert.equal(status.status, 'saved');
  f.state.counter = 1; assert.equal((await f.authenticate(registered.credential)).ok, true);
});


test('an aborted stale-credential check remains cancellation rather than a setup diagnosis', async () => {
  const f = await fixture(), controller = new AbortController(); controller.abort();
  let prompts = 0; f.env.credentials.get = async () => { prompts++; };
  const result = await f.authenticate(null, 'login', controller.signal);
  assert.equal(result.code, 'cancelled'); assert.notEqual(result.needsSetup, true);
  assert.equal(prompts, 0); assert.equal(result.proof, undefined);
});
