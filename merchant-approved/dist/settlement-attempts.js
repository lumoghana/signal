// Every tab shares one payout intent until its authoritative outcome is known.
const PREFIX='lumo-pending-settlement-v1:';
const key=(businessId,userId)=>PREFIX+[businessId,userId].map(encodeURIComponent).join(':');
const unsupported=()=>new Error('This browser cannot coordinate settlements safely across tabs. Use a current browser to settle funds. No new settlement was sent.');
export function createSettlementAttempts(storage,randomId=()=>crypto.randomUUID(),options={}){
 if(storage===undefined)try{storage=globalThis.localStorage}catch{storage=null}
 let locks;
 try{locks=Object.hasOwn(options,'locks')?options.locks:globalThis.navigator?.locks}catch{locks=null}
 function load(businessId,userId,strict=false){
  try{
   if(!storage?.getItem)throw new Error('Storage unavailable');
   const raw=storage.getItem(key(businessId,userId));if(raw===null||raw===undefined)return null;
   const value=JSON.parse(raw);
   if(!value||typeof value.attemptId!=='string'||!value.attemptId||!Number.isSafeInteger(value.amount)||value.amount<=0||typeof value.destination!=='string'||!value.destination)throw new Error('Invalid saved settlement');
   // An older or damaged state must never be mistaken for an untouched draft.
   return {...value,submitted:value.submitted!==false};
  }catch{
   if(strict)throw new Error('The saved settlement reference could not be read safely. Check payout history before starting another settlement. No new settlement was sent.');
   return null;
  }
 }
 function read(businessId,userId){return load(businessId,userId)}
 async function update(businessId,userId,operation){
  if(typeof locks?.request!=='function')throw unsupported();
  return locks.request(key(businessId,userId),{mode:'exclusive'},()=>operation());
 }
 function save(businessId,userId,record){
  // setItem can be intercepted or silently discarded by restricted storage.
  // The caller may send a payout only after the complete immutable intent and
  // its submitted marker have both survived an exact readback under this lock.
  try{
   const storageKey=key(businessId,userId),serialized=JSON.stringify(record);
   storage.setItem(storageKey,serialized);
   if(storage.getItem(storageKey)!==serialized)throw new Error('Settlement reference was not retained');
  }catch{throw new Error('Your browser could not save the settlement reference. No new settlement was sent. Free some browser storage and try again.')}
  return record;
 }
 function remove(businessId,userId){
  try{
   const storageKey=key(businessId,userId);
   storage.removeItem(storageKey);
   if(storage.getItem(storageKey)!==null)throw new Error('Settlement reference was not removed');
  }catch{throw new Error('Your browser could not clear the saved settlement reference. Keep checking the original settlement before starting another one.')}
 }
 async function begin(businessId,userId,payload){
  return update(businessId,userId,()=>{
   const existing=load(businessId,userId,true);if(existing)return existing;
   const destination=String(payload.destination||'').trim();
   if(!Number.isSafeInteger(payload.amount)||payload.amount<=0||!destination)throw new Error('Enter a valid amount and save a settlement destination first.');
   return save(businessId,userId,{attemptId:randomId(),amount:payload.amount,destination,submitted:false});
  });
 }
 async function markSubmitted(businessId,userId,attemptId){
  return update(businessId,userId,()=>{
   const record=load(businessId,userId,true);if(!attemptId||record?.attemptId!==attemptId)throw new Error('The saved settlement changed. Open its details before continuing.');
   return record.submitted?record:save(businessId,userId,{...record,submitted:true});
  });
 }
 async function cancelDraft(businessId,userId,attemptId){
  return update(businessId,userId,()=>{
   const record=load(businessId,userId,true);
   if(!attemptId||record?.attemptId!==attemptId||record.submitted)return false;
   remove(businessId,userId);return true;
  });
 }
 // Only use clear after a confirmed outcome or a definitive no-debit rejection.
 async function clear(businessId,userId,attemptId){
  return update(businessId,userId,()=>{
   if(!attemptId)throw new Error('The original settlement reference is required to resolve this request.');
   const record=load(businessId,userId,true);if(record?.attemptId!==attemptId)return false;
   remove(businessId,userId);return true;
  });
 }
 return {read,begin,markSubmitted,cancelDraft,clear};
}
