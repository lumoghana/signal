const PREFIX = 'lumo:shared:v1:';
export const SHARED_CONSUMER_ORIGIN = 'https://lumo-connected-pilot.vercel.app';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HANDLE = /^[a-z0-9][a-z0-9._-]{2,29}$/;
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

/** A tappable wrapper carries exactly the same identity, never payment authority. */
export function encodeSharedQrLink(value) {
  const url=new URL('/',SHARED_CONSUMER_ORIGIN);
  url.searchParams.set('lumoCode',encodeSharedQr(value));
  return url.href;
}

export function parseSharedQrLink(raw) {
  try {
    const url=new URL(raw);
    if(url.origin!==SHARED_CONSUMER_ORIGIN||url.pathname!=='/'||url.username||url.password||url.hash||url.searchParams.getAll('lumoCode').length!==1||[...url.searchParams.keys()].some(key=>key!=='lumoCode'))throw invalid();
    return parseSharedQr(url.searchParams.get('lumoCode'));
  }catch{throw invalid();}
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

