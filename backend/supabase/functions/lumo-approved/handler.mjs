import {partnerRespond,publicPartnerInbox} from './partners.mjs';
import {actionFingerprint,buildState,clone,envelope,prepareMutation,sha256,canonicalJson} from './engine.mjs';
const HANDLE=/^[a-z0-9][a-z0-9._-]{2,29}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const phone=value=>String(value||'').replace(/[\s()-]/g,'').replace(/^\+233/,'0');
const failure=(code,message,status=400)=>Object.assign(new Error(message||code),{code,status});
const messages={AUTH_REQUIRED:'Sign in before continuing.',SESSION_REVOKED:'Sign in again to use your shared Lumo account.',PIN_REQUIRED:'Check your transaction PIN. After five incorrect attempts wait one minute.',RECIPIENT_NOT_FOUND:'This handle or phone is not registered in the connected pilot.',REVISION_CONFLICT:'Your records changed. Open the current details and try again.',IDEMPOTENCY_CONFLICT:'That send reference belongs to different details.',ALIAS_UNAVAILABLE:'That username or phone is already registered.',CREDENTIALS_INCORRECT:'That username and password could not be verified.',DEVICE_PROOF_INVALID:'Device verification expired or did not match. Use your PIN.',SERVICE_UNAVAILABLE:'Lumo could not confirm this request. Keep the send reference and try again.',REQUEST_UNAVAILABLE:'This merchant request is unavailable or already paid.',FORBIDDEN:'Use your own signed-in account.',INVALID_INPUT:'Check the details and try again.',INSUFFICIENT_FUNDS:'There is not enough available money for this action.',WALLET_LIMIT:'This amount exceeds the pilot account limit.'};
const b64url=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unbase64=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9_+/-]+={0,2}$/.test(value)||value.length>8192)throw failure('DEVICE_PROOF_INVALID');return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));};
const jwtClaims=token=>{try{return JSON.parse(new TextDecoder().decode(unbase64(token.split('.')[1])));}catch{throw failure('AUTH_REQUIRED',null,401);}};
/** Android SHA256withECDSA signatures are DER; WebCrypto expects fixed-width r || s. */
export function ecdsaRaw(bytes){
 const b=new Uint8Array(bytes);if(b.length===64)return b;
 let n=1;if(b[0]!==48)throw failure('DEVICE_PROOF_INVALID');let length=b[n++];if(length&128){const count=length&127;if(count>2)throw failure('DEVICE_PROOF_INVALID');length=0;for(let k=0;k<count;k++)length=(length<<8)|b[n++];}
 if(n+length!==b.length||b[n++]!==2)throw failure('DEVICE_PROOF_INVALID');const rl=b[n++],r=b.slice(n,n+rl);n+=rl;if(b[n++]!==2)throw failure('DEVICE_PROOF_INVALID');const sl=b[n++],s=b.slice(n,n+sl);n+=sl;if(n!==b.length)throw failure('DEVICE_PROOF_INVALID');
 const out=new Uint8Array(64);for(const [part,offset]of[[r,0],[s,32]]){const p=part.length===33&&part[0]===0?part.slice(1):part;if(p.length>32||p.length<1)throw failure('DEVICE_PROOF_INVALID');out.set(p,offset+32-p.length);}return out;
}
export async function verifyDeviceSignature(record,signature,cryptoApi=globalThis.crypto){
 const algorithm=record.algorithm==='ES256'?{name:'ECDSA',namedCurve:'P-256'}:{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'};
 const key=await cryptoApi.subtle.importKey('spki',unbase64(record.publicKey),algorithm,false,['verify']);
 const raw=unbase64(signature);return cryptoApi.subtle.verify(record.algorithm==='ES256'?{name:'ECDSA',hash:'SHA-256'}:{name:'RSASSA-PKCS1-v1_5'},key,record.algorithm==='ES256'?ecdsaRaw(raw):raw,unbase64(record.challenge));
}
async function boundedJson(request){
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw failure('INVALID_INPUT');
 const reader=request.body?.getReader();if(!reader)throw failure('INVALID_INPUT');let size=0;const parts=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>3_000_000){await reader.cancel();throw failure('REQUEST_TOO_LARGE',null,413);}parts.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let n=0;for(const part of parts){bytes.set(part,n);n+=part.byteLength;}
 let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw failure('INVALID_INPUT');}if(!plain(body))throw failure('INVALID_INPUT');return body;
}
export function createApprovedHandler({supabaseUrl,serviceRoleKey,allowedOrigins=[],fetch:transport=globalThis.fetch,crypto:cryptoApi=globalThis.crypto,merchantHandler=null}={}){
 const base=new URL(supabaseUrl);if(base.protocol!=='https:'||base.pathname!=='/'||!serviceRoleKey)throw Error('Invalid gateway configuration');
 const origins=new Set(allowedOrigins);
 async function upstream(path,body,{token=serviceRoleKey,method='POST',allowFailure=false}={}){
  let response;try{response=await transport(base.origin+path,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{apikey:serviceRoleKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})});}catch{throw failure('SERVICE_UNAVAILABLE',null,503);}
  let data;try{data=await response.json();}catch{throw failure('SERVICE_UNAVAILABLE',null,503);}
  if(!response.ok&&!allowFailure)throw failure('SERVICE_UNAVAILABLE',null,503);return {ok:response.ok,status:response.status,data};
 }
 async function serviceRpc(name,args){const {data}=await upstream('/rest/v1/rpc/'+name,args);if(!plain(data))throw failure('SERVICE_UNAVAILABLE',null,503);return data;}
 async function service(command,payload){return serviceRpc('lumo_approved_service',{p_command:command,p_payload:payload});}
 const requireOk=value=>{if(!value?.ok)throw failure(value?.code||'SERVICE_UNAVAILABLE',messages[value?.code],value?.code==='SESSION_REVOKED'?401:400);return value;};
 async function identify(token){
  if(!token)throw failure('AUTH_REQUIRED',null,401);const {ok,data:user}=await upstream('/auth/v1/user',undefined,{token,method:'GET',allowFailure:true});
  if(!ok||!UUID.test(user?.id)||user?.app_metadata?.lumo_pilot!==true)throw failure('AUTH_REQUIRED',null,401);
  const claims=jwtClaims(token);if(claims.sub!==user.id||!UUID.test(claims.session_id||''))throw failure('AUTH_REQUIRED',null,401);
  return {userId:user.id,sessionId:claims.session_id,accessToken:token,user};
 }
 function repository(identity){
  const identityPayload={actor:identity.userId,session:identity.sessionId};return {
   service:(command,payload={})=>service(command,{...payload,...identityPayload}),
   resolve:query=>service('resolve',{...identityPayload,query:String(query||'')}),
   quote:async payload=>{const access=await serviceRpc('lumo_approved_merchant_access',{p_shop:payload.shopId,p_test_key:payload.testKey||''});if(!access?.ok)return access;const {data}=await upstream('/rest/v1/rpc/lumo_rpc',{p_command:'payment.quote',p_payload:payload},{token:identity.accessToken});return {...data,merchantAccessApproved:data?.ok===true};},
   rpc:async(command,payload={})=>(await upstream('/rest/v1/rpc/lumo_rpc',{p_command:command,p_payload:payload},{token:identity.accessToken})).data,
  };
 }
 const passwordValue=(handle,password)=>sha256('lumo-approved-password-v1\0'+handle+'\0'+password,cryptoApi);
 async function passwordSession(handle,password){
  const derived=await passwordValue(handle,password);
  let r=await upstream('/auth/v1/token?grant_type=password',{email:`${handle}@pilot.lumo.invalid`,password:derived},{allowFailure:true});
  // Existing 2.6 pilot accounts retain their original password. New approved accounts use the full
  // approved 10–128 character input without bcrypt's 72-byte truncation.
  if(!r.ok)r=await upstream('/auth/v1/token?grant_type=password',{email:`${handle}@pilot.lumo.invalid`,password},{allowFailure:true});
  if(!r.ok||!r.data?.access_token||!r.data?.refresh_token)throw failure(r.status===429?'RATE_LIMITED':'CREDENTIALS_INCORRECT',null,r.status===429?429:401);return r.data;
 }
 async function revoke(session){try{await upstream('/auth/v1/logout?scope=local',{}, {token:session.access_token,allowFailure:true});}catch{}}
 async function authenticate(body,request){
  const handle=String(body.handle||'').trim().toLowerCase(),password=body.password;
  if(!HANDLE.test(handle)||typeof password!=='string'||password.length<(body.action==='register'?10:8)||password.length>128||!password.trim())throw failure('INVALID_INPUT');
  const ip=(request.headers.get('x-forwarded-for')||'unknown').split(',').at(-1).trim().slice(0,160)||'unknown';const ipHash=await sha256('lumo-pilot-auth:'+ip,cryptoApi);
  const bootstrap=async(action,payload)=>requireOk(await serviceRpc('lumo_pilot_bootstrap',{p_action:action,p_payload:payload}));
  if(body.action==='login'){
   await bootstrap('login.check',{handle,ipHash});const session=await passwordSession(handle,password),identity=await identify(session.access_token),repo=repository(identity);
   try{return {...envelope(requireOk(await repo.service('load'))),session};}catch(error){await revoke(session);throw error;}
  }
  const displayName=typeof body.displayName==='string'?body.displayName.trim():'',registeredPhone=phone(body.phone);
  const isMerchant=body.mode==='merchant';let pin=body.pin;
  if(isMerchant)pin=String(100000+cryptoApi.getRandomValues(new Uint32Array(1))[0]%900000);
  if(!displayName||displayName.length>80||/[\p{Cc}<>]/u.test(displayName)||!isMerchant&&!/^0\d{9}$/.test(registeredPhone)||typeof pin!=='string'||!/^\d{4,6}$/.test(pin))throw failure('INVALID_INPUT');
  const reservation=await bootstrap('register.reserve',{handle,ipHash});
  if(reservation.mode==='new'){
   const created=await upstream('/auth/v1/admin/users',{email:`${handle}@pilot.lumo.invalid`,password:await passwordValue(handle,password),email_confirm:true,app_metadata:{lumo_pilot:true,lumo_approved_password:true,contact_verified:false}},{allowFailure:true});
   if(!created.ok){const aborted=await bootstrap('register.abort',{handle,registrationId:reservation.registrationId});if(!aborted.identityPresent)throw failure(created.status===429?'RATE_LIMITED':'INVALID_INPUT');}
  }
  const session=await passwordSession(handle,password),identity=await identify(session.access_token),repo=repository(identity);
  try{
   await bootstrap('register.bind',{handle,registrationId:reservation.registrationId,userId:identity.userId});
   const snapshot=requireOk(await repo.service('provision',{handle,displayName,phone:registeredPhone||null,pin}));
   await bootstrap('register.complete',{handle,registrationId:reservation.registrationId,userId:identity.userId});
   return {...envelope(snapshot),session};
  }catch(error){await revoke(session);throw error;}
 }
 async function runAutomatic(repo,snapshot){
  for(let n=0;n<4;n++){
   const state=buildState(snapshot),seen=new Set(state._sharedIncomeSeen||[]),today=new Date().toISOString().slice(0,10);
   const due=(state.boxes||[]).filter(b=>b.hack?.type==='scheduled'&&b.hack.nextRun<=today).map(b=>[b.id,b.hack.nextRun]);
   const income=state.transactions.filter(t=>t.type==='income'&&t.direction==='in'&&t.status==='success'&&t.ledgerJournalId&&!seen.has(t.ledgerJournalId)).map(t=>t.ledgerJournalId);
   if(!due.length&&!income.length)return snapshot;
   const attemptId='automatic-'+(await sha256(canonicalJson({due,income}),cryptoApi)).slice(0,48),fingerprint=await actionFingerprint('runAutomaticSavings',{},attemptId);
   const prepared=await prepareMutation(snapshot,'runAutomaticSavings',{},attemptId,repo);if(!prepared.ok)return snapshot;
   const committed=await repo.service('commit',{attemptId,fingerprint,expectedRevision:snapshot.revision,expectedWallet:prepared.expectedWallet,state:prepared.durableState,groups:prepared.groups,boxes:prepared.boxes,intents:prepared.intents,requests:prepared.requests,partners:prepared.partners,requiresAuth:false,result:prepared.result});
   if(committed.code==='REVISION_CONFLICT'){snapshot=requireOk(await repo.service('load'));continue;}requireOk(committed);return committed.snapshot;
  }return requireOk(await repo.service('load'));
 }
 let merchant=null;
 return async request=>{
  const origin=request.headers.get('origin');const cors={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',Vary:'Origin',...(origin&&origins.has(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'apikey, authorization, content-type, x-client-info','Access-Control-Max-Age':'600'}:{})};
  const respond=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json'}});
  try{
   if(origin&&!origins.has(origin))throw failure('ORIGIN_NOT_ALLOWED',null,403);if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});if(request.method!=='POST')throw failure('METHOD_NOT_ALLOWED',null,405);
   const body=await boundedJson(request);if(body.action==='register'||body.action==='login')return respond(await authenticate(body,request));
   const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
   if(body.action==='merchant'&&!token&&merchantHandler){merchant||=merchantHandler({serviceRpc});return respond(await merchant({body,identity:null}));}
   const identity=await identify(token),repo=repository(identity);
   if(body.action==='partnerInbox'){const loaded=requireOk(await repo.service('load'));return respond({ok:true,inbox:publicPartnerInbox(loaded.partners||[],identity.userId)});}
   if(body.action==='partnerRespond')return respond(await partnerRespond({body,identity,repo}));
   if(body.action==='snapshot')return respond(envelope(await runAutomatic(repo,requireOk(await repo.service('load')))));
   if(body.action==='resolve')return respond(requireOk(await repo.resolve(body.query)));
   if(body.action==='quote'){let shopId=body.shopId;if(!shopId&&body.query){const lookup=requireOk(await serviceRpc('lumo_approved_merchant_lookup',{p_query:body.query}));shopId=lookup.shopId;}return respond(requireOk(await repo.quote({shopId,requestId:body.requestId,testKey:body.testKey})));}
   if(body.action==='verifyPin')return respond(requireOk(await repo.service('verifyPin',{pin:body.pin})));
   if(body.action==='changeCredentials')throw failure('CREDENTIAL_CHANGES_UNAVAILABLE','Changing shared login details is not connected yet. Your existing username and password are unchanged.',409);
   if(body.action==='changePin'){
    const out=requireOk(await repo.service('pin.change',{oldPin:body.currentPin,newPin:body.pin}));return respond({...envelope(requireOk(await repo.service('load'))),result:{ok:true,message:'Your transaction PIN is updated.'},...out});
   }
   if(body.action==='registerDevice'){
    const algorithm=body.algorithm||'ES256';if(!['ES256','RS256'].includes(algorithm))throw failure('INVALID_INPUT');
    await cryptoApi.subtle.importKey('spki',unbase64(body.publicKey),algorithm==='ES256'?{name:'ECDSA',namedCurve:'P-256'}:{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    return respond(requireOk(await repo.service('device.register',{deviceId:body.deviceId,publicKey:body.publicKey,algorithm,pin:body.pin})));
   }
   if(body.action==='challenge'){
    if(typeof body.type!=='string'||!plain(body.payload)||!/^[A-Za-z0-9_.:-]{10,100}$/.test(body.attemptId||''))throw failure('INVALID_INPUT');
    const fingerprint=await actionFingerprint(body.type,body.payload,body.attemptId),nonce=cryptoApi.getRandomValues(new Uint8Array(32));
    const challenge=b64url(new TextEncoder().encode(canonicalJson({version:1,user:identity.userId,session:identity.sessionId,device:body.deviceId,attemptId:body.attemptId,fingerprint,nonce:b64url(nonce)})));
    return respond(requireOk(await repo.service('device.challenge',{deviceId:body.deviceId,challenge,fingerprint,attemptId:body.attemptId})));
   }
   if(body.action==='merchant'){
    if(body.password){const stepup=await passwordSession(identity.user.email.split('@')[0],body.password);if(stepup.user?.id!==identity.userId){await revoke(stepup);throw failure('FORBIDDEN');}identity.passwordVerified=true;await revoke(stepup);}
    if(!merchantHandler)throw failure('SERVICE_UNAVAILABLE',null,503);merchant||=merchantHandler({serviceRpc});return respond(await merchant({body,identity,repo}));
   }
   if(body.action==='recover'){if(typeof body.type!=='string'||!plain(body.payload)||!/^[A-Za-z0-9_.:-]{10,100}$/.test(body.attemptId||''))throw failure('INVALID_INPUT');const fingerprint=await actionFingerprint(body.type,body.payload,body.attemptId),replay=requireOk(await repo.service('attempt',{attemptId:body.attemptId,fingerprint}));return respond(envelope(replay.found?replay.snapshot:requireOk(await repo.service('load')),replay.found?replay.result.result:{ok:true,message:'This reference is still being checked. Retry only these same details.'},{found:replay.found===true,replayed:replay.found===true,postedReceipts:replay.result?.receipts||[]}));}
   if(body.action!=='action'||typeof body.type!=='string'||body.type.length>80||!plain(body.payload)||!/^[A-Za-z0-9_.:-]{10,100}$/.test(body.attemptId||''))throw failure('INVALID_INPUT');
   if(Object.keys(body).some(k=>!['action','type','payload','attemptId','pin','deviceProof'].includes(k)))throw failure('INVALID_INPUT');
   const fingerprint=await actionFingerprint(body.type,body.payload,body.attemptId);
   const cached=await repo.service('attempt',{attemptId:body.attemptId,fingerprint});
   if(cached?.ok&&cached.found)return respond(envelope(cached.snapshot,cached.result.result,{replayed:true,postedReceipts:cached.result.receipts||[]}));
   if(cached?.code==='IDEMPOTENCY_CONFLICT')requireOk(cached);
   let verifiedChallengeId;
   if(body.deviceProof){
    const record=requireOk(await repo.service('device.get',{deviceId:body.deviceProof.deviceId,challengeId:body.deviceProof.challengeId}));
    if(record.fingerprint!==fingerprint||record.attemptId!==body.attemptId||!await verifyDeviceSignature(record,body.deviceProof.signature,cryptoApi))throw failure('DEVICE_PROOF_INVALID');verifiedChallengeId=body.deviceProof.challengeId;
   }
   for(let retry=0;retry<4;retry++){
    const replay=await repo.service('attempt',{attemptId:body.attemptId,fingerprint});
    if(replay?.ok&&replay.found)return respond(envelope(replay.snapshot,replay.result.result,{replayed:true,postedReceipts:replay.result.receipts||[]}));
    if(replay?.code==='IDEMPOTENCY_CONFLICT')requireOk(replay);
    const snapshot=await runAutomatic(repo,requireOk(await repo.service('load')));
    const prepared=await prepareMutation(snapshot,body.type,body.payload,body.attemptId,repo);
    if(!prepared.ok)return respond({...envelope(snapshot),ok:false,code:'DOMAIN_REJECTED',message:prepared.result.message,result:prepared.result});
    const committed=await repo.service('commit',{attemptId:body.attemptId,fingerprint,expectedRevision:snapshot.revision,expectedWallet:prepared.expectedWallet,state:prepared.durableState,groups:prepared.groups,boxes:prepared.boxes,intents:prepared.intents,requiresAuth:prepared.requiresAuth,requests:prepared.requests,partners:prepared.partners,profileChange:prepared.profileChange,result:prepared.result,pin:body.pin,...(verifiedChallengeId?{verifiedChallengeId}:{})});
    if(committed.code==='REVISION_CONFLICT')continue;
    requireOk(committed);return respond(envelope(committed.snapshot,committed.result,{postedReceipts:committed.receipts||[],replayed:committed.replayed===true}));
   }
   throw failure('REVISION_CONFLICT',null,409);
  }catch(error){const code=error?.code||'SERVICE_UNAVAILABLE',message=messages[code]||error?.message||messages.SERVICE_UNAVAILABLE;return respond({ok:false,sandbox:true,currency:'GHS',code,message,result:{ok:false,message},error:{code,message}},error?.status||400);}
 };
}
