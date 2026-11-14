/**
 * Device verification for this browser-local prototype, using real WebAuthn.
 * Only public keys are saved. Your device keeps its biometric templates/private key.
 * A production bank must issue/verify these challenges on its trusted server.
 * WebAuthn user verification can use biometrics OR the device's screen lock.
 */
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const proofs = new Map();
const observedCounters = new Map();
const MAX_PROOF_AGE = 60_000;
const PURPOSES = new Set(['login', 'transaction']);

const fail = (code, message) => ({ ok: false, code, message });
const bytes = value => value instanceof Uint8Array ? value : new Uint8Array(value);
const clone = value => JSON.parse(JSON.stringify(value));
const runtime = overrides => ({
  crypto: globalThis.crypto,
  credentials: globalThis.navigator?.credentials,
  publicKeyCredential: globalThis.PublicKeyCredential,
  secureContext: globalThis.isSecureContext === true,
  origin: globalThis.location?.origin,
  now: () => Date.now(),
  ...overrides,
});
function base64url(value) {
  let binary = '';
  for (const byte of bytes(value)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decode64(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw Error('Invalid encoded credential.');
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
const equal = (a, b) => {
  a = bytes(a); b = bytes(b);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
};
function random(env, length = 32) { return env.crypto.getRandomValues(new Uint8Array(length)); }
function originDetails(env) {
  const url = new URL(env.origin);
  if (url.origin !== env.origin || !['https:', 'http:'].includes(url.protocol)) throw Error('Invalid site origin.');
  return { origin: url.origin, rpId: url.hostname };
}
function publicCredential(credential) {
  return credential?.type === 'public-key' && credential.rawId && credential.response &&
    credential.id === base64url(credential.rawId) && credential.authenticatorAttachment !== 'cross-platform';
}
function clientData(response, expected, env) {
  const data = JSON.parse(decoder.decode(response.clientDataJSON));
  if (data.type !== expected.type || data.challenge !== base64url(expected.challenge) || data.origin !== env.origin ||
      data.crossOrigin === true || (data.topOrigin && data.topOrigin !== env.origin)) throw Error('Device verification did not match this request.');
  return bytes(response.clientDataJSON);
}
async function authenticatorData(data, rpId, env) {
  const raw = bytes(data);
  if (raw.length < 37) throw Error('Incomplete device response.');
  const expectedHash = new Uint8Array(await env.crypto.subtle.digest('SHA-256', encoder.encode(rpId)));
  if (!equal(raw.slice(0, 32), expectedHash)) throw Error('Device response is for another site.');
  // UP and UV are independent. Both are mandatory for every accepted result.
  if ((raw[32] & 0x05) !== 0x05) throw Error('Your device did not verify you.');
  const counter = new DataView(raw.buffer, raw.byteOffset, raw.byteLength).getUint32(33, false);
  return { raw, counter };
}
function keyAlgorithm(algorithm) {
  if (algorithm === -7) return { name: 'ECDSA', namedCurve: 'P-256' };
  if (algorithm === -257) return { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
  throw Error('This device key is not supported here.');
}
async function importKey(record, env) {
  return env.crypto.subtle.importKey('spki', decode64(record.publicKey), keyAlgorithm(record.algorithm), false, ['verify']);
}
/** WebAuthn ECDSA signatures use ASN.1 DER; WebCrypto verify expects r || s. */
function ecdsaSignature(signature) {
  const raw = bytes(signature);
  if (raw.length < 8 || raw[0] !== 0x30 || raw[1] !== raw.length - 2 || raw[2] !== 0x02) throw Error('Invalid device signature.');
  const rLength = raw[3], sStart = 4 + rLength;
  if (!rLength || sStart + 2 > raw.length || raw[sStart] !== 0x02) throw Error('Invalid device signature.');
  const sLength = raw[sStart + 1];
  if (!sLength || sStart + 2 + sLength !== raw.length) throw Error('Invalid device signature.');
  const r = raw.slice(4, sStart), s = raw.slice(sStart + 2);
  const normalize = integer => {
    if ((integer[0] & 0x80) || integer.length > 33 || (integer.length === 33 && integer[0] !== 0)) throw Error('Invalid device signature.');
    if (integer.length > 1 && integer[0] === 0 && !(integer[1] & 0x80)) throw Error('Invalid device signature.');
    const number = integer[0] === 0 ? integer.slice(1) : integer;
    if (number.length > 32) throw Error('Invalid device signature.');
    const padded = new Uint8Array(32); padded.set(number, 32 - number.length); return padded;
  };
  const joined = new Uint8Array(64); joined.set(normalize(r)); joined.set(normalize(s), 32); return joined;
}
function issueProof(value, env) {
  for (const [key, item] of proofs) if (item.expiresAt <= env.now()) proofs.delete(key);
  const token = base64url(random(env));
  proofs.set(token, { ...clone(value), expiresAt: env.now() + MAX_PROOF_AGE });
  return token;
}
/** Consumed exactly once, including when purpose/credential does not match. */
export function consumeDeviceProof(proof, { purpose, credentialId } = {}, overrides) {
  if (typeof proof !== 'string') return false;
  const result = proofs.get(proof); proofs.delete(proof);
  if (!result || result.expiresAt <= runtime(overrides).now() || result.purpose !== purpose ||
      result.credentialId !== credentialId) return false;
  const { expiresAt, ...verified } = result;
  return clone(verified);
}
function errorResult(error, signal) {
  if (signal?.aborted || ['AbortError', 'NotAllowedError'].includes(error?.name))
    return fail('cancelled', 'Device verification was cancelled or not completed. You can use your backup instead.');
  if (['NotSupportedError', 'SecurityError'].includes(error?.name))
    return fail('unavailable', 'Device verification is unavailable here. Open Lumo in your phone browser or use your backup.');
  if (error?.name === 'InvalidStateError')
    return fail('already-registered', 'A device key already exists. Use your existing key or your backup.');
  return fail('verification-failed', error?.message || 'Your device could not verify you. Try again or use your backup.');
}

export async function deviceAuthSupport(overrides) {
  const env = runtime(overrides);
  if (!env.secureContext || !env.crypto?.subtle || !env.credentials?.create || !env.credentials?.get ||
      typeof env.publicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable !== 'function')
    return { available: false, reason: 'Device verification needs a supported phone browser and a secure connection.' };
  try {
    originDetails(env);
    const available = await env.publicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return { available: available === true, reason: available ? '' : 'Set up your phone’s face, fingerprint or screen lock first.' };
  } catch {
    return { available: false, reason: 'Device verification is unavailable in this browser. Your backup still works.' };
  }
}

/**
 * Inspect only facts this browser can establish without asking for verification.
 * A saved public key does not prove the private key still exists on the phone.
 * NotAllowedError from a later prompt is ambiguous (cancel, timeout or no match),
 * so callers must keep the backup and offer explicit reactivation, not revoke it.
 */
function storedCredentialProblem(record, env) {
  if (!record || typeof record !== 'object' || Array.isArray(record))
    return 'Phone verification is not set up here. Sign in with your password, then activate it in Security & access.';
  try {
    const { origin, rpId } = originDetails(env);
    if (record.origin !== origin || record.rpId !== rpId)
      return 'This saved phone verification belongs to another Lumo address. Use your backup, then reactivate it in Security & access.';
    if (!Number.isSafeInteger(record.counter) || record.counter < 0 || record.counter > 0xffffffff)
      throw Error('Invalid verification counter.');
    keyAlgorithm(record.algorithm);
    const id = decode64(record.id), publicKey = decode64(record.publicKey);
    if (!id.length || id.length > 1024 || !publicKey.length || publicKey.length > 8192 ||
        base64url(id) !== record.id || base64url(publicKey) !== record.publicKey)
      throw Error('Invalid saved device key.');
    if (record.userHandle) {
      const handle = decode64(record.userHandle);
      if (!handle.length || handle.length > 64 || base64url(handle) !== record.userHandle)
        throw Error('Invalid saved device account.');
    }
    return '';
  } catch {
    return 'This saved phone verification cannot be used. Use your backup, then reactivate it in Security & access.';
  }
}
const setupFailure = message => ({ ...fail('setup-needed', message), needsSetup: true });

export async function deviceCredentialStatus(record, overrides) {
  const env = runtime(overrides), support = await deviceAuthSupport(env);
  if (!support.available) return { status: 'unavailable', available: false, needsSetup: false, message: support.reason };
  if (!record) return { status: 'unset', available: true, needsSetup: false, message: 'Activate phone verification when you are ready. Your password and transaction PIN remain available.' };
  const problem = storedCredentialProblem(record, env);
  if (problem) return { status: 'setup-needed', available: true, needsSetup: true, message: problem };
  try { await importKey(record, env); }
  catch { return { status: 'setup-needed', available: true, needsSetup: true, message: 'This saved phone verification cannot be read. Use your backup, then reactivate it in Security & access.' }; }
  return { status: 'saved', available: true, needsSetup: false, message: 'Phone verification is saved here. Your phone will check it when you use it.' };
}

export async function registerDeviceCredential({ username, displayName, signal } = {}, overrides) {
  const env = runtime(overrides);
  try {
    const support = await deviceAuthSupport(env);
    if (!support.available) return fail('unavailable', support.reason);
    if (signal?.aborted) return errorResult(null, signal);
    if (typeof username !== 'string' || !username.trim()) return fail('invalid-user', 'Set your username and password first.');
    const { origin, rpId } = originDetails(env), challenge = random(env), userHandle = random(env);
    const credential = await env.credentials.create({
      publicKey: {
        challenge, rp: { id: rpId, name: 'Lumo prototype' },
        user: { id: userHandle, name: username.trim(), displayName: String(displayName || username).slice(0, 64) },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
        timeout: MAX_PROOF_AGE, attestation: 'none',
      }, ...(signal ? { signal } : {}),
    });
    if (signal?.aborted) return errorResult(null, signal);
    if (!publicCredential(credential)) throw Error('The device did not return a valid platform key.');
    clientData(credential.response, { type: 'webauthn.create', challenge }, env);
    if (typeof credential.response.getPublicKey !== 'function' || typeof credential.response.getAuthenticatorData !== 'function')
      return fail('unavailable', 'This browser cannot save a verified device key. Use username and password here.');
    const { raw: registeredAuth, counter } = await authenticatorData(credential.response.getAuthenticatorData(), rpId, env);
    if (!(registeredAuth[32] & 0x40) || registeredAuth.length < 55) throw Error('The device did not attest a new credential.');
    const idLength = new DataView(registeredAuth.buffer, registeredAuth.byteOffset, registeredAuth.byteLength).getUint16(53, false);
    if (!idLength || registeredAuth.length < 55 + idLength || !equal(registeredAuth.slice(55, 55 + idLength), credential.rawId))
      throw Error('The new device key did not match its registration.');
    const publicKey = credential.response.getPublicKey(), algorithm = credential.response.getPublicKeyAlgorithm();
    if (!publicKey) throw Error('The device did not return a public key.');
    const record = { id: credential.id, publicKey: base64url(publicKey), algorithm, rpId, origin,
      userHandle: base64url(userHandle), counter, createdAt: new Date(env.now()).toISOString() };
    await importKey(record, env);
    if (signal?.aborted) return errorResult(null, signal);
    observedCounters.set(record.id, counter);
    const proof = issueProof({ purpose: 'register', credentialId: record.id, counter, credential: record }, env);
    return { ok: true, credential: clone(record), proof };
  } catch (error) { return errorResult(error, signal); }
}

export async function authenticateDevice(record, { purpose, signal } = {}, overrides) {
  const env = runtime(overrides);
  try {
    if (!PURPOSES.has(purpose)) return fail('invalid-purpose', 'Choose sign in or transaction approval.');
    if (signal?.aborted) return errorResult(null, signal);
    const support = await deviceAuthSupport(env);
    if (signal?.aborted) return errorResult(null, signal);
    if (!support.available) return fail('unavailable', support.reason);
    const { rpId } = originDetails(env), problem = storedCredentialProblem(record, env);
    if (problem) return setupFailure(problem);
    let key;
    try { key = await importKey(record, env); }
    catch { return signal?.aborted ? errorResult(null, signal) : setupFailure('This saved phone verification cannot be read. Use your backup, then reactivate it in Security & access.'); }
    if (signal?.aborted) return errorResult(null, signal);
    const challenge = random(env);
    const credential = await env.credentials.get({ publicKey: {
      challenge, rpId, allowCredentials: [{ id: decode64(record.id), type: 'public-key', transports: ['internal'] }],
      userVerification: 'required', timeout: MAX_PROOF_AGE,
    }, ...(signal ? { signal } : {}) });
    if (signal?.aborted) return errorResult(null, signal);
    if (!publicCredential(credential) || credential.id !== record.id) throw Error('The device key does not match this account.');
    if (credential.response.userHandle && record.userHandle && !equal(credential.response.userHandle, decode64(record.userHandle)))
      throw Error('The device key belongs to a different account.');
    const client = clientData(credential.response, { type: 'webauthn.get', challenge }, env);
    const { raw: auth, counter } = await authenticatorData(credential.response.authenticatorData, rpId, env);
    const previous = Math.max(record.counter, observedCounters.get(record.id) || 0);
    if ((previous > 0 || counter > 0) && counter <= previous) throw Error('This device response has already been used. Try a fresh verification.');
    const hash = new Uint8Array(await env.crypto.subtle.digest('SHA-256', client));
    const signed = new Uint8Array(auth.length + hash.length); signed.set(auth); signed.set(hash, auth.length);
    const verified = await env.crypto.subtle.verify(record.algorithm === -7 ? { name: 'ECDSA', hash: 'SHA-256' } : { name: 'RSASSA-PKCS1-v1_5' },
      key, record.algorithm === -7 ? ecdsaSignature(credential.response.signature) : credential.response.signature, signed);
    if (!verified) throw Error('The device signature could not be verified.');
    if (signal?.aborted) return errorResult(null, signal);
    // Check again after async signature verification to reject concurrent equal counters.
    if (counter > 0 && counter <= (observedCounters.get(record.id) || 0)) throw Error('This device response has already been used.');
    observedCounters.set(record.id, counter);
    return { ok: true, counter, proof: issueProof({ purpose, credentialId: record.id, counter }, env) };
  } catch (error) { return errorResult(error, signal); }
}
