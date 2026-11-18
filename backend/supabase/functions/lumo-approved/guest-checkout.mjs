import {trustedWebProxyIp} from './web-proxy-context.mjs';
import {lookupGuestPayer} from './guest-payer-lookup.mjs';

const TOKEN=/^[a-f0-9]{64}$/;
const ATTEMPT=/^[A-Za-z0-9_.:-]{10,100}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fields={resolve:['shopId','requestId'],quote:['link'],lookup:['link','phone'],initiate:['link','amount','phone','network','attemptId','recoveryToken'],status:['attemptId','recoveryToken'],sandboxResult:['attemptId','recoveryToken','outcome']};
const errors={SERVICE_PAUSED:'Mobile money is temporarily unavailable. Please use another payment method or try again later.',INVALID_INPUT:'Check the payment details and try again.',LINK_UNAVAILABLE:'This payment link is unavailable. Ask the merchant for a current link.',SHOP_UNAVAILABLE:'This shop cannot receive payments right now.',AMOUNT_CHANGED:'The amount must match this merchant’s fixed payment request.',REQUEST_PROCESSING:'A payment is already awaiting confirmation for this request. Keep the original reference.',IDEMPOTENCY_CONFLICT:'This payment reference belongs to different details. Reopen your original payment.',RECOVERY_REQUIRED:'Open the original browser to check this payment. Its private receipt key could not be verified.',RATE_LIMITED:'Too many attempts. Wait a moment and try again.',PAYMENT_FINAL:'This payment already has a final provider result.',PROVIDER_UNAVAILABLE:'A live MoMo provider is not connected. This checkout supports clearly labelled test payments only.'};
const failure=(code,message=errors[code]||'Lumo could not confirm this payment. Keep the original reference.',status=400)=>Object.assign(new Error(message),{code,status,noMutation:true});
export async function guestHash(value,cryptoApi=globalThis.crypto){return Array.from(new Uint8Array(await cryptoApi.subtle.digest('SHA-256',new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('');}

/** Shared adapter guard. Live callbacks remain disabled until a provider and its
 * signature verification are configured. Sandbox results use stored values. */
export function validateGuestProviderResult(result,attempt){
 if(!object(result)||!object(attempt)||result.reference!==attempt.providerReference||result.amount!==attempt.amount||result.currency!=='GHS'||result.currency!==attempt.currency||result.shopId!==attempt.shopId||result.merchantId!==attempt.merchantId||result.providerMode!==attempt.providerMode)return false;
 return ['approved','declined','cancelled','pending'].includes(result.status);
}

export function createGuestCheckout({serviceRpc,crypto:cryptoApi=globalThis.crypto,webProxyPublicKeys}){
 if(typeof serviceRpc!=='function')throw Error('Guest checkout needs its private service RPC.');
 return async(body,request)=>{
  const operation=body.operation,allowed=fields[operation];
  if(!allowed||Object.keys(body).some(key=>!['action','operation',...allowed].includes(key)))throw failure('INVALID_INPUT');
  if(['quote','lookup','initiate'].includes(operation)&&!TOKEN.test(body.link||''))throw failure('INVALID_INPUT');
  if(operation==='resolve'&&(!UUID.test(body.shopId||'')||body.requestId!==undefined&&!UUID.test(body.requestId)))throw failure('INVALID_INPUT');
  if(['initiate','status','sandboxResult'].includes(operation)&&(!ATTEMPT.test(body.attemptId||'')||!TOKEN.test(body.recoveryToken||'')))throw failure('INVALID_INPUT');
  const payload={};
  if(body.link)payload.link=body.link;
  if(operation==='resolve'){payload.shopId=body.shopId;if(body.requestId)payload.requestId=body.requestId;}
  if(body.attemptId){payload.attemptId=body.attemptId;payload.recoveryHash=await guestHash('lumo-guest-recovery-v1:'+body.recoveryToken,cryptoApi);}
  if(operation==='initiate'){
   if(!Number.isSafeInteger(body.amount)||body.amount<1||body.amount>1000000)throw failure('INVALID_INPUT');
   // Repeat the server adapter for every new initiation. Old clients may still
   // send a network, but it never chooses the stored network or provider route.
   const found=await lookupGuestPayer(body.phone,{crypto:cryptoApi});
   Object.assign(payload,{phone:found.phone,network:found.payer.network,amount:body.amount});
  }
  if(operation==='sandboxResult'){
   if(!['approve','decline','delay','cancel'].includes(body.outcome))throw failure('INVALID_INPUT');
   payload.outcome=body.outcome;
  }
  const ip=await trustedWebProxyIp(request,body,{cryptoApi,publicKeys:webProxyPublicKeys})||(request?.headers?.get('x-forwarded-for')||'unknown').split(',').at(-1).trim().slice(0,160)||'unknown';
  payload.rateKey=await guestHash('lumo-guest-rate-v1:'+ip,cryptoApi);
  const result=await serviceRpc('lumo_guest_checkout',{p_operation:operation,p_payload:payload});
  if(!result?.ok)throw failure(result?.code||'PROVIDER_UNAVAILABLE',errors[result?.code],result?.code==='RATE_LIMITED'?429:result?.code==='RECOVERY_REQUIRED'?403:400);
  // Validate the public destination and its existing rate limit before any
  // number lookup. This endpoint never reads a signed-in consumer profile.
  if(operation==='lookup')return {...result,payer:(await lookupGuestPayer(body.phone,{crypto:cryptoApi})).payer};
  return result;
 };
}
