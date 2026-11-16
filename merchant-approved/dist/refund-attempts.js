// Every tab shares one immutable refund intent until its authoritative outcome is known.
const PREFIX='lumo-pending-refund-v1:';
const key=(businessId,userId,transactionId)=>PREFIX+[businessId,userId,transactionId].map(encodeURIComponent).join(':');
export function createRefundAttempts(storage,randomId=()=>crypto.randomUUID(),options={}){
 if(storage===undefined)try{storage=globalThis.localStorage}catch{storage=null}
 let locks;
 try{locks=Object.hasOwn(options,'locks')?options.locks:globalThis.navigator?.locks}catch{locks=null}
 function load(businessId,userId,transactionId,strict=false){
  try{
   if(!storage?.getItem)throw new Error('Storage unavailable');
   const raw=storage.getItem(key(businessId,userId,transactionId));if(raw===null||raw===undefined)return null;
   const record=JSON.parse(raw);
   if(!record||typeof record.attemptId!=='string'||!record.attemptId||record.transactionId!==transactionId||!Number.isSafeInteger(record.amount)||record.amount<=0||typeof record.reason!=='string')throw new Error('Invalid saved refund');
   return record;
  }catch{
   if(strict)throw new Error('The saved refund reference could not be read safely. Check the original payment and refund history before starting another refund. No new refund was sent.');
   return null;
  }
 }
 function read(businessId,userId,transactionId){return load(businessId,userId,transactionId)}
 async function update(businessId,userId,transactionId,operation){
  if(typeof locks?.request!=='function')throw new Error('This browser cannot coordinate refunds safely across tabs. Use a current browser to refund payments. No new refund was sent.');
  return locks.request(key(businessId,userId,transactionId),{mode:'exclusive'},()=>operation());
 }
 async function begin(businessId,userId,payload){
  const transactionId=payload?.transactionId;
  if(typeof transactionId!=='string'||!transactionId||!Number.isSafeInteger(payload.amount)||payload.amount<=0)throw new Error('Choose the original payment and enter a valid refund amount.');
  return update(businessId,userId,transactionId,()=>{
   const existing=load(businessId,userId,transactionId,true);if(existing)return existing;
   const record={transactionId,amount:payload.amount,reason:String(payload.reason||'').trim(),attemptId:randomId()},serialized=JSON.stringify(record);
   try{
    storage.setItem(key(businessId,userId,transactionId),serialized);
    if(storage.getItem(key(businessId,userId,transactionId))!==serialized)throw new Error('Reference was not saved');
   }catch{throw new Error('Your browser could not save the refund reference. No new refund was sent. Free some browser storage and try again.')}
   return record;
  });
 }
 // Only an authoritative outcome for this exact attempt may remove its retry reference.
 async function clear(businessId,userId,transactionId,attemptId){
  return update(businessId,userId,transactionId,()=>{
   if(!attemptId)throw new Error('The original refund reference is required to resolve this request.');
   const record=load(businessId,userId,transactionId,true);if(record?.attemptId!==attemptId)return false;
   storage.removeItem(key(businessId,userId,transactionId));return true;
  });
 }
 return {read,begin,clear};
}
