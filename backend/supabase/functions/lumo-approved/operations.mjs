import {servicesForAction} from './availability.mjs';

const MUTATIONS=new Set(['fund','payment','settleIOU','saveBox','withdrawBox','createBox','createGroup','contributeGroup','requestGroupPayout','approveGroupPayout','executeGroupPayout','accountSupportCreate','accountDeletionRequest','closeAccount','runAutomaticSavings']);
const READS=new Set(['snapshot','resolve','searchPeople','quote','externalRecipient','recover','serviceStatus','partnerInbox','pinRepairStatus']);
const GUEST=new Set(['quote','initiate','status','sandboxResult']);
const INFRA=new Set(['SERVICE_UNAVAILABLE','COMMIT_FAILED','GUEST_SERVICE_ERROR','MERCHANT_COMMIT_FAILED','STORAGE_UNAVAILABLE']);
const ATTEMPT=/^[A-Za-z0-9_.:-]{10,100}$/;
const CODE=/^[A-Z_]{1,80}$/;
const ORIGINS={
 'https://lumo-connected-pilot.vercel.app':'consumer_web',
 'https://lumo-new-experience.oness15.chatgpt.site':'consumer_web',
 'https://lumo-merchant-mobile.oness15.chatgpt.site':'merchant_web',
};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

/** Extract only bounded routing metadata. Identity, amounts and free text are never copied. */
async function routingMetadata(request){
 if(request.method!=='POST'||!request.headers.get('content-type')?.startsWith('application/json'))return null;
 const reader=request.clone().body?.getReader();if(!reader)return null;
 let bytes=0;const parts=[];
 try{
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>32768){void reader.cancel();return null;}parts.push(value);}
  const all=new Uint8Array(bytes);let at=0;for(const p of parts){all.set(p,at);at+=p.length;}
  const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));
  if(!body||typeof body!=='object'||Array.isArray(body))return null;
  // Registration, credentials, PIN checks and MFA belong to Auth's own protected logs.
  let action,read=false;
  if(body.action==='action'){action='action.'+(MUTATIONS.has(body.type)?body.type:'other');}
  else if(body.action==='guestCheckout'){action='guest.'+(GUEST.has(body.operation)?body.operation:'other');read=body.operation==='quote'||body.operation==='status';}
  else if(body.action==='merchant'){action='merchant.request';read=body.method==='GET';}
  else if(READS.has(body.action)){action=body.action;read=true;}
  else return null;
  let channel=ORIGINS[request.headers.get('origin')]||'unknown';
  if(body.action==='guestCheckout'&&channel!=='unknown')channel='guest_web';
  const services=servicesForAction(body);
  return {action,read,serviceId:services[0]||({guestCheckout:'guest_checkout',merchant:'merchant'}[body.action])||'shared_gateway',attemptId:ATTEMPT.test(body.attemptId||'')?body.attemptId:null,channel};
 }catch{return null;}finally{try{reader.releaseLock();}catch{}}
}

/** Observability must never change a financial result or infer that a timeout failed. */
export function operationOutcome(response){
 const errorCode=CODE.test(response.headers.get('X-Lumo-Error-Code')||'')?response.headers.get('X-Lumo-Error-Code'):null;
 const noMutation=response.headers.get('X-Lumo-No-Mutation')==='true';
 const declared=response.headers.get('X-Lumo-Outcome');
 const outcome=(response.status>=500||INFRA.has(errorCode))&&!noMutation?'unknown':declared==='ok'?'ok':declared==='rejected'||response.status>=400?'rejected':'unknown';
 return {outcome,errorCode,httpStatus:response.status};
}

export function withOperationEvents(handler,{supabaseUrl,serviceRoleKey,fetch:transport=globalThis.fetch,crypto:cryptoApi=globalThis.crypto,timeoutMs=900,now=()=>performance.now()}={}){
 const base=new URL(supabaseUrl);if(base.protocol!=='https:'||base.pathname!=='/'||!serviceRoleKey||typeof handler!=='function')throw Error('Invalid operational event configuration');
 return async request=>{
  const started=now(),requestId=cryptoApi.randomUUID(),metadata=routingMetadata(request);
  // Keep the original handler authoritative, including its error/status semantics.
  let response,thrown;
  try{response=await handler(request);}catch(error){thrown=error;response=new Response(null,{status:503,headers:{'X-Lumo-Outcome':'unknown','X-Lumo-Error-Code':'SERVICE_UNAVAILABLE'}});}
  const route=await Promise.race([metadata,pause(25).then(()=>null)]);
  const outcome=operationOutcome(response);
  if(!route||route.read&&outcome.outcome==='ok'){if(thrown)throw thrown;return response;}
  const event={requestId,serviceId:route.serviceId,action:route.action,attemptId:route.attemptId,channel:route.channel,...outcome,durationMs:Math.max(0,Math.min(300000,Math.round(now()-started)))};
  const controller=new AbortController();let timer;
  const timeout=new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve();},Math.min(975,Math.max(1,timeoutMs)));});
  try{
   const recording=transport(base.origin+'/rest/v1/rpc/lumo_record_operation_event',{method:'POST',redirect:'error',signal:controller.signal,headers:{apikey:serviceRoleKey,Authorization:`Bearer ${serviceRoleKey}`,'Content-Type':'application/json'},body:JSON.stringify({p_payload:event})}).catch(()=>null);
   await Promise.race([recording,timeout]);
  }catch{}finally{clearTimeout(timer);}
  // A random trace reference is safe to give support; no request data is returned in it.
  try{response.headers.set('X-Lumo-Request-Id',requestId);}catch{}
  if(thrown)throw thrown;return response;
 };
}
