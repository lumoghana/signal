/** Session-only, owner-scoped recovery of a reviewed request. Never stores credentials. */
const prefix='lumo-payment-recovery-v1:';
const secretKey=/^(?:pin|password|currentpassword|newpassword|currentpin|newpin|confirmpin|credential|passwordproof|currentpasswordproof|access_token|refresh_token|deviceproof|authorization|privatekey|servicerolekey)$/i;
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
function containsSecret(value){return Array.isArray(value)?value.some(containsSecret):object(value)?Object.entries(value).some(([key,item])=>secretKey.test(key)||containsSecret(item)):false}
export const loyaltyPreparationPending=payment=>!!payment&&!payment.completed&&['submitting','unknown'].includes(payment.loyaltyPreparation?.state);
export const recoveryPending=payment=>!!payment&&!payment.completed&&(['submitting','unknown'].includes(payment.submissionState)||loyaltyPreparationPending(payment));
const reference=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{10,120}$/.test(value);
function preparationRecord(owner,payment){
  const preparation=payment?.loyaltyPreparation,payload=preparation?.payload;
  if(!loyaltyPreparationPending(payment)||preparation.ownerId!==owner||!reference(preparation.attemptId)||!object(payload)||containsSecret(payload)||Object.keys(payload).some(key=>!['membershipId','shopId','grossAmount','rewardId','description'].includes(key))||typeof payload.membershipId!=='string'||!payload.membershipId||typeof payload.shopId!=='string'||!payload.shopId||typeof payload.rewardId!=='string'||!payload.rewardId||!Number.isSafeInteger(payload.grossAmount)||payload.grossAmount<=0||!reference(payment.idempotencyKey))return null;
  const clean={rail:'merchant',shopId:payload.shopId,amount:payload.grossAmount,amountText:(payload.grossAmount/100).toFixed(2),category:String(payment.category||'Other'),note:String(payment.note||'').slice(0,140),idempotencyKey:payment.idempotencyKey,recipient:{id:payload.shopId,name:String(payment.recipient?.name||'Lumo merchant').slice(0,100),emoji:String(payment.recipient?.emoji||'').slice(0,4)},shopName:String(payment.shopName||'').slice(0,100),shopCode:String(payment.shopCode||'').slice(0,30),shopArea:String(payment.shopArea||'').slice(0,100),loyaltyIntent:{membershipId:payload.membershipId,rewardId:payload.rewardId},loyaltyPreparation:{ownerId:owner,state:preparation.state,attemptId:preparation.attemptId,payload:{...payload},...(reference(preparation.cancelAttemptId)?{cancelAttemptId:preparation.cancelAttemptId}:{}),...(preparation.cancelRequested===true?{cancelRequested:true}:{})},lastRoute:{section:'pay',page:'review'},flowOrigin:{section:'pay',page:'rewards',membershipId:payload.membershipId}};
  return containsSecret(clean)?null:clean;
}
function record(owner,payment){
  if(typeof owner==='string'&&owner&&loyaltyPreparationPending(payment)&&!['submitting','unknown'].includes(payment.submissionState))return preparationRecord(owner,payment);
  const payload=payment?.submittedPayload;
  if(typeof owner!=='string'||!owner||payment?.submissionOwnerId!==owner||!recoveryPending(payment)||!object(payload)||typeof payload.idempotencyKey!=='string'||!payload.idempotencyKey||payload.idempotencyKey!==payment.idempotencyKey||containsSecret(payload))return null;
  return {...payload,submittedPayload:payload,submissionOwnerId:owner,submissionState:payment.submissionState,...(typeof payment.submissionAttemptId==='string'?{submissionAttemptId:payment.submissionAttemptId}:{}),lastRoute:{section:'pay',page:'review'}};
}
export function savePaymentRecovery(owner,payment,storage=globalThis.sessionStorage){
  try{const saved=record(owner,payment);if(!saved)return false;const encoded=JSON.stringify(saved),key=prefix+encodeURIComponent(owner);storage.setItem(key,encoded);return storage.getItem(key)===encoded;}catch{return false;}
}
export function loadPaymentRecovery(owner,storage=globalThis.sessionStorage){
  try{if(!owner)return null;return record(owner,JSON.parse(storage.getItem(prefix+encodeURIComponent(owner))||'null'));}catch{return null;}
}
export function clearPaymentRecovery(owner,storage=globalThis.sessionStorage){
  try{if(owner)storage.removeItem(prefix+encodeURIComponent(owner));}catch{}
}
export function ownsSavedSession(saved,{connected,userId}={}){
  if(!object(saved))return false;
  if(!connected)return saved.mode!=='shared';
  if(saved.mode==='shared')return (saved.sharedUserId||null)===(userId||null);
  // Older pre-account signup may resume; signed-in or sample drafts need proven ownership.
  return !saved.mode&&(!userId&&!!saved.draft?.onboarding&&!saved.draft.onboarding.preview||!!userId&&saved.draft?.activation?.sharedUserId===userId);
}
