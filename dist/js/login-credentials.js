/** Browser-local prototype credentials. Password text is never persisted. */
export const LOGIN_ITERATIONS = 210000;
const hex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
const unhex = value => Uint8Array.from(value.match(/../g) || [], byte => Number.parseInt(byte, 16));
export const normalizeUsername = value => String(value ?? '').trim().toLowerCase();
// Public payment usernames accept the familiar @ prefix at entry, never in storage.
export const normalizeLumoUsername = value => normalizeUsername(value).replace(/^@/,'');
export const validUsername = value => /^[a-z0-9][a-z0-9._-]{2,29}$/.test(normalizeUsername(value));
export function validateLoginPassword(password) {
  if (typeof password !== 'string' || password.length < 10) return 'Use at least 10 characters for your login password.';
  if (password.length > 128) return 'Keep your password within 128 characters.';
  if (!password.trim()) return 'Choose a password with more than spaces.';
  return '';
}
export function validLoginCredential(record) {
  return !!record && record.version === 1 && record.algorithm === 'PBKDF2-SHA-256' &&
    record.iterations === LOGIN_ITERATIONS && /^[a-f0-9]{32}$/.test(record.salt || '') && /^[a-f0-9]{64}$/.test(record.verifier || '');
}
export function passwordProofMatches(proof, record) {
  if (!validLoginCredential(record) || typeof proof !== 'string' || proof.length !== 64) return false;
  let different = 0;
  for (let i = 0; i < 64; i++) different |= proof.charCodeAt(i) ^ record.verifier.charCodeAt(i);
  return different === 0;
}
export async function derivePasswordProof(password, credential, { crypto = globalThis.crypto } = {}) {
  if (typeof password !== 'string' || password.length > 128 || !validLoginCredential(credential)) throw new Error('Your saved login needs to be set up again.');
  if (!crypto?.subtle) throw new Error('Secure password setup needs a supported browser over HTTPS.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt:unhex(credential.salt), iterations:credential.iterations}, key, 256));
}
export async function createLoginCredential(password, { crypto = globalThis.crypto } = {}) {
  const error = validateLoginPassword(password);
  if (error) throw new Error(error);
  if (!crypto?.getRandomValues || !crypto?.subtle) throw new Error('Secure password setup needs a supported browser over HTTPS.');
  const credential = { version:1, algorithm:'PBKDF2-SHA-256', iterations:LOGIN_ITERATIONS, salt:hex(crypto.getRandomValues(new Uint8Array(16))), verifier:'0'.repeat(64) };
  credential.verifier = await derivePasswordProof(password, credential, { crypto });
  return credential;
}
