// Transport only. The approved v7 views, forms and domain remain unchanged.
// Only capabilities backed by the shared service are enabled in this build.
export const MERCHANT_CAPABILITIES=Object.freeze({passwordChange:false,passwordRecovery:false,usernameRecovery:false,staffReset:false,ownershipTransfer:false,settlement:false,simulation:false,customerWallet:false});
export const CONNECTED_CONSUMER_ORIGIN='https://lumo-connected-pilot.vercel.app';
const CONFIG={url:'https://iwutbrljiiodamtyoorg.supabase.co',key:'sb_publishable_4dmChQek8k-opkVhO4N_KA_TCGVjWi6'};
const KEY='lumo-approved-merchant-session-v1',AUTH_KEY='lumo-shared-auth-state-v2';
const empty=()=>({session:null,user:null,state:null,users:[],invitations:[],sessions:[],audit:[],devices:[],counter:null,student:null});
const read=()=>{for(const storage of [globalThis.sessionStorage,globalThis.localStorage])try{const value=JSON.parse(storage?.getItem(KEY)||'null');if(value?.session?.access_token||value?.counterCredential===true&&/^[a-f0-9]{64}$/.test(value.merchantToken||''))return value}catch{}return null};
function authState(){let best=null;for(const [storage,key] of [[globalThis.localStorage,AUTH_KEY],[globalThis.sessionStorage,AUTH_KEY+'-tab']])try{const value=JSON.parse(storage?.getItem(key)||'null');if(value?.epoch&&(!best||(value.authVersion||0)>(best.authVersion||0)||(value.authVersion||0)===(best.authVersion||0)&&(value.writtenAt||0)>(best.writtenAt||0)))best=value}catch{}return best;}
let saved=read(),refreshing=null,invitation=null,authChannel=null,authGeneration=0;
let transportEpoch=authState()?.epoch||saved?.authEpoch||null;
const changed=()=>Object.assign(new Error('Your account changed while this request was running. Continue with the current sign-in.'),{status:409,code:'AUTH_CHANGED'});
const signature=value=>JSON.stringify([value?.session?.user?.id,value?.session?.access_token,value?.session?.refresh_token,value?.merchantToken,value?.counterCredential===true]);
function requireCurrent(generation,epoch){const current=authState()?.epoch||transportEpoch;if(generation!==authGeneration||epoch&&current&&epoch!==current)throw changed();}
function persist(value,remember=saved?.remember===true,{broadcast=true,generation=authGeneration,epoch=authState()?.epoch}={}){
 requireCurrent(generation,epoch);saved=value?{...value,remember,authEpoch:epoch||value.authEpoch||null}:null;
 for(const storage of [globalThis.sessionStorage,globalThis.localStorage])try{storage?.removeItem(KEY)}catch{}
 if(saved)try{(remember?globalThis.localStorage:globalThis.sessionStorage)?.setItem(KEY,JSON.stringify(saved))}catch{}
 if(broadcast)try{authChannel?.postMessage({type:'session',value:saved,epoch:epoch||null})}catch{}
}
function locallySignedOut(){const auth=authState();return auth?.locked&&['logout','logged-out'].includes(auth.kind);}
try{if(typeof window!=='undefined'&&typeof BroadcastChannel!=='undefined'){
 authChannel=new BroadcastChannel('lumo-approved-merchant-sessions-v1');authChannel.addEventListener('message',event=>{
  const incoming=event.data,currentEpoch=authState()?.epoch||transportEpoch;
  if(incoming?.type==='request'){if(saved&&!locallySignedOut()&&saved.authEpoch===currentEpoch)authChannel.postMessage({type:'session',value:saved,epoch:saved.authEpoch});return}
  if(incoming?.type==='session'){
   const next=incoming.value;if(incoming.epoch&&currentEpoch&&incoming.epoch!==currentEpoch)return;
   if(next&&(!(next.session?.access_token||next.counterCredential===true&&/^[a-f0-9]{64}$/.test(next.merchantToken||''))||locallySignedOut()||next.authEpoch!==incoming.epoch))return;
   if(signature(next)===signature(saved))return;
   const generation=++authGeneration;refreshing=null;transportEpoch=incoming.epoch||currentEpoch;
   try{persist(next,next?.remember===true,{broadcast:false,generation,epoch:incoming.epoch||currentEpoch});window.dispatchEvent(new Event('lumo-merchant-session-change'));}catch{}
  }
 });authChannel.postMessage({type:'request'});authChannel.unref?.();
}}catch{}
const headers=token=>({'Content-Type':'application/json',Accept:'application/json',apikey:CONFIG.key,...(token?{Authorization:'Bearer '+token}:{})});
const response=(result,status=result.status||200)=>new Response(JSON.stringify(result),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
async function post(path,body,token,signal){const r=await fetch(CONFIG.url+path,{method:'POST',headers:headers(token),body:JSON.stringify(body),signal});return {data:await r.json(),status:r.status};}
async function refresh(signal,generation,epoch){
 requireCurrent(generation,epoch);if(!saved?.session?.refresh_token)return false;
 if(refreshing?.generation===generation)return refreshing.promise;
 const before=saved,refreshToken=before.session.refresh_token;
 const promise=(async()=>{
  const {data}=await post('/auth/v1/token?grant_type=refresh_token',{refresh_token:refreshToken},null,signal);
  requireCurrent(generation,epoch);if(saved?.session?.refresh_token!==refreshToken)throw changed();
  if(data.access_token){if(data.user?.id!==before.session.user?.id)throw changed();persist({...before,session:data},before.remember,{generation,epoch});return true}return false;
 })().finally(()=>{if(refreshing?.promise===promise)refreshing=null});refreshing={generation,promise};return promise;
}
async function authenticate(action,values,signal,generation,epoch){
 const {data,status}=await post('/functions/v1/lumo-approved',{action,mode:'merchant',...values},null,signal);requireCurrent(generation,epoch);
 if(!data.ok||!data.session?.access_token)return response(data,status>=400?status:400);
 persist({session:data.session,merchantToken:null},values.remember===true,{generation,epoch});return null;
}
export async function merchantFetch(path,options={}){
 const pathname=path.split('?')[0],input=options.body?JSON.parse(options.body):{},signal=options.signal,epoch=options.authEpoch||authState()?.epoch;
 if(epoch&&transportEpoch!==epoch){transportEpoch=epoch;authGeneration++;refreshing=null;try{authChannel?.postMessage({type:'request'})}catch{}}
 const explicitAuth=['/api/signup','/api/auth/login','/api/login','/api/invitations/accept'].includes(pathname),logout=['/api/auth/logout','/api/logout'].includes(pathname);
 const generation=explicitAuth||logout?++authGeneration:authGeneration;if(explicitAuth||logout)refreshing=null;
 requireCurrent(generation,epoch);
 if(!explicitAuth&&!logout&&saved?.authEpoch&&epoch&&saved.authEpoch!==epoch)return response({ok:false,status:409,code:'AUTH_CHANGED',error:'Your account changed. Sign in again before continuing.'},409);
 if(pathname==='/api/session'&&!saved?.session?.access_token&&!saved?.counterCredential)return response(empty());
 if(logout&&!saved?.session?.access_token&&!saved?.counterCredential)return response(empty());
 if(pathname==='/api/signup'){
  const creds=input.credentials||input,business=input.business||input;
  const failure=await authenticate('register',{handle:creds.username,password:creds.password,displayName:business.ownerName,phone:business.phone,remember:input.remember===true},signal,generation,epoch);if(failure)return failure;
 }else if(['/api/auth/login','/api/login'].includes(pathname)){
  const failure=await authenticate('login',{handle:input.username,password:input.password,remember:input.remember===true},signal,generation,epoch);if(failure)return failure;
 }else if(pathname==='/api/invitations/accept'){
  const failure=await authenticate('register',{handle:input.username,password:input.password,displayName:input.name||invitation?.name||input.username,phone:input.phone||invitation?.phone,remember:false},signal,generation,epoch);if(failure)return failure;
 }
 if(saved?.session?.expires_at&&saved.session.expires_at*1000<Date.now()+45000)await refresh(signal,generation,epoch);
 requireCurrent(generation,epoch);
 if(pathname==='/api/lux'){
  const owner=saved?.session?.user?.id;if(!owner||!saved?.merchantToken)return response({ok:false,code:'SESSION_INVALID',message:'Sign in to your merchant account to ask Lux.'},401);
  const send=async()=>{const r=await fetch(CONNECTED_CONSUMER_ORIGIN+'/api/merchant-lux',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+saved.session.access_token},body:JSON.stringify({question:input.question,context:input.context,shopId:input.shopId||null,merchantToken:saved.merchantToken}),signal,redirect:'error'});const data=await r.json();if(signal?.aborted)throw new DOMException('Question cancelled','AbortError');if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Lux could not read a response. Please try again.');return{data,status:r.status};};
  let result=await send();requireCurrent(generation,epoch);
  if(result.status===401&&await refresh(signal,generation,epoch)){requireCurrent(generation,epoch);result=await send();requireCurrent(generation,epoch);}
  if(owner!==saved?.session?.user?.id)throw changed();
  if(result.data.ok&&result.data.owner!==owner)throw changed();
  if(result.status===401)result.data.code='SESSION_INVALID';
  return response(result.data,result.status);
 }
 const wrapper={action:'merchant',path,method:options.method||'GET',body:input,...(saved?.merchantToken?{merchantToken:saved.merchantToken}:{}),...(pathname==='/api/auth/step-up'?{password:input.currentPassword}:{})};
 const ownerId=saved?.session?.user?.id;
 let result=await post('/functions/v1/lumo-approved',wrapper,saved?.session?.access_token,signal);requireCurrent(generation,epoch);
 if(['UNAUTHENTICATED','AUTH_REQUIRED','SESSION_REVOKED','JWT_EXPIRED'].includes(result.data.code)&&saved&&await refresh(signal,generation,epoch)){
  result=await post('/functions/v1/lumo-approved',wrapper,saved?.session?.access_token,signal);requireCurrent(generation,epoch);
 }
 if(ownerId!==saved?.session?.user?.id)throw changed();
 const data=result.data;
 if(data.ok!==false&&data.counter&&data.counterTransport===true&&saved){persist({counterCredential:true,merchantToken:data.merchantToken||saved.merchantToken},true,{generation,epoch});delete data.merchantToken;}
 if(Object.hasOwn(data,'merchantToken')&&saved){persist({...saved,merchantToken:data.merchantToken||null},saved.remember,{generation,epoch});delete data.merchantToken;}
 if(data.invitation&&pathname.startsWith('/api/invitations/'))invitation=data.invitation;
 if(logout&&data.ok!==false){const token=saved?.session?.access_token;persist(null,false,{generation,epoch});if(token)post('/auth/v1/logout?scope=local',{},token).catch(()=>{});}
 requireCurrent(generation,epoch);
 return response(data,data.ok===false?(data.status||result.status>=400&&result.status||400):result.status);
}
