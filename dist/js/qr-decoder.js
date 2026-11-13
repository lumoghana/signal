import {parseSharedQr} from './approved-qr.js';
import jsQR from './vendor/jsqr.js';
import { isCampusCodeService } from './payment-catalog.js';

const fail = message => ({ ok: false, message });
const aliases = Object.freeze({ GOBE: 'gobe-spot', SHUTTLE: 'campus-shuttle', PRINTS: 'balme-prints', HALL: 'hall-dues' });

export function merchantIdFromCode(input) {
  if (typeof input !== 'string' || input.length > 100) return null;
  const value = input.trim();
  const id = Object.hasOwn(aliases, value.toUpperCase()) ? aliases[value.toUpperCase()] : value.toLowerCase();
  return isCampusCodeService(id) ? id : null;
}

/** A QR is payment input, never permission to open a URL or move money. */
export function parseQrPayload(input, { origin = globalThis.location?.origin } = {}) {
  if (typeof input !== 'string' || !input.trim() || input.length > 2048) return fail('That is not a supported Lumo code.');
  const value = input.trim();
  if(value.startsWith('lumo:shared:v1:')){try{const parsed=parseSharedQr(value);return {ok:true,payment:parsed.kind==='merchant'?{type:'merchant',id:parsed.shopId,shopId:parsed.shopId,...(parsed.requestId?{requestId:parsed.requestId}:{})}:{type:'person',handle:parsed.handle,name:'@'+parsed.handle,amount:0,note:''}};}catch{return fail('This shared code is invalid. Ask for a fresh Lumo code.');}}
  const merchant = /^(?:lumo:)?merchant:([^\s]+)$/i.exec(value);
  if (merchant) {
    const id = merchantIdFromCode(merchant[1]);
    return id ? { ok: true, payment: { type: 'merchant', id } } : fail('That campus merchant code is not recognised.');
  }
  let url, base;
  try { base = new URL(origin); url = new URL(value, base); } catch { return fail('That is not a supported Lumo code.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== base.origin || url.username || url.password || url.hash || !value.match(/^(?:https?:\/\/|\/|\?)/i)) return fail('Use a Lumo payment code. Other links cannot be opened here.');
  if(url.searchParams.has('pay')){const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,shopId=url.searchParams.get('pay'),requestId=url.searchParams.get('request'),testKey=url.searchParams.get('testKey');if(testKey&&!/^[a-f0-9]{64}$/i.test(testKey))return fail('This private merchant code is invalid. Ask for a fresh code.');if(!uuid.test(shopId||'')||(requestId&&!uuid.test(requestId))||url.searchParams.getAll('pay').length!==1||url.searchParams.getAll('request').length>1)return fail('This merchant code is invalid. Ask for a fresh code.');return {ok:true,payment:{type:'merchant',id:shopId,shopId,...(requestId?{requestId}:{}),...(testKey?{testKey}:{})}};}
  if (url.searchParams.getAll('payTo').length !== 1 || url.searchParams.getAll('amount').length > 1 || url.searchParams.getAll('note').length > 1) return fail('This payment code has conflicting details.');
  const name = (url.searchParams.get('payTo') || '').trim();
  const note = url.searchParams.get('note') || '';
  if (!name || name.length > 60 || /[<>\u0000-\u001f\u007f]/.test(name) || note.length > 140 || /[\u0000-\u001f\u007f]/.test(note)) return fail('This payment code has invalid recipient details.');
  const raw = url.searchParams.get('amount');
  const amount = raw === null ? 0 : /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(amount) || (raw !== null && amount <= 0) || amount > 100000000) return fail('This payment code has an invalid amount.');
  return { ok: true, payment: { type: 'person', name, amount, note } };
}

export function decodeQrPixels(data, width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096 || !data || data.length !== width * height * 4) return null;
  return jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })?.data || null;
}

export function qrImageDimensions(width, height, limit = 1600) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width > 50000 || height > 50000) throw new Error('Choose a readable QR image.');
  const scale = Math.min(1, limit / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Decode the local file in memory. No image URL or pixel data is retained. */
export async function decodeQrFile(file, {
  createBitmap = globalThis.createImageBitmap,
  createCanvas = () => globalThis.document.createElement('canvas'),
  decode = decodeQrPixels,
} = {}) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'].includes(file.type) || !Number.isFinite(file.size) || file.size < 1 || file.size > 8 * 1024 * 1024) throw new Error('Choose a QR photo under 8 MB (PNG, JPG or WebP).');
  if (typeof createBitmap !== 'function') throw new Error('This browser cannot read that QR photo. Try a newer browser or enter the merchant code.');
  let bitmap;
  try {
    bitmap = await createBitmap(file);
    const size = qrImageDimensions(bitmap.width, bitmap.height);
    const canvas = createCanvas(); canvas.width = size.width; canvas.height = size.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('This browser cannot read QR photos.');
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const pixels = context.getImageData(0, 0, size.width, size.height);
    return decode(pixels.data, size.width, size.height);
  } finally { bitmap?.close?.(); }
}
