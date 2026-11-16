import {adminMoneySummary} from './summary.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const ROLES=new Set(['support','supervisor','merchant_ops','finance','risk','technical','auditor','super_admin']);
const COMMANDS=new Set(['overview','search','customers.list','customers.get','merchants.list','merchants.get','transactions.list','transactions.get','guest.list','guest.get','cases.list','cases.get','cases.create','cases.update','cases.note','products.list','products.get','services.list','services.update','services.schedule','incidents.list','incidents.get','incidents.create','incidents.update','reconciliation.list','reports','staff.list','staff.update','approvals.list','approvals.get','approvals.create','approvals.decide','audit.list','operations.list','staff.directory']);
for(const command of ['financial.refund.create','financial.refund.get','financial.refund.decide','financial.refund.complete','financial.guest.propose','financial.guest.resolve','financial.exceptions.list','financial.exceptions.create','financial.exceptions.update'])COMMANDS.add(command);
const MESSAGES={AUTH_REQUIRED:'Sign in with your staff account.',STAFF_REQUIRED:'This account does not have access to Lumo Admin.',MFA_REQUIRED:'Verify your authenticator code to continue.',SESSION_REVOKED:'Your staff session has ended. Sign in again.',FORBIDDEN:'Your role does not allow this action.',INVALID_INPUT:'Check the details and try again.',INVALID_SETUP_TOKEN:'This setup link has expired or has already been used.',SETUP_FAILED:'This account could not be created. If this email already has an account, ask your administrator for help.',RATE_LIMITED:'Too many attempts. Wait a little before trying again.',SERVICE_UNAVAILABLE:'Lumo Admin could not complete this request. Try again shortly.',ORIGIN_NOT_ALLOWED:'This application origin is not allowed.',NOT_FOUND:'The record could not be found.',CONFLICT:'The record changed. Refresh it before trying again.'};
Object.assign(MESSAGES,{SETUP_INVALID:MESSAGES.INVALID_SETUP_TOKEN,SELF_APPROVAL_FORBIDDEN:'A different authorised colleague must review your request.',ALREADY_DECIDED:'This request has already been decided.',REASON_REQUIRED:'Record a reason before continuing.',LAST_ADMIN:'Keep at least one active access administrator.',SELF_CHANGE_FORBIDDEN:'Another access administrator must change your permissions.',ALREADY_ENROLLED:'This staff member is already enrolled.',REVISION_CONFLICT:'This record changed. Refresh it before saving.',RESOLUTION_REQUIRED:'Record the resolution before closing this case or incident.'});
Object.assign(MESSAGES,{INVALID_REFUND:'Choose the original merchant payment and its linked support case.',REFUND_EXCEEDS_PAYMENT:'The amount exceeds the remaining original payment or overlaps another approved refund.',APPROVAL_REQUIRED:'A different authorised colleague must approve this request first.',REFUND_EVIDENCE_MISMATCH:'The posted refund does not match the approved original payment, amount and recipient.',EVIDENCE_REQUIRED:'Record the original reference and the evidence reviewed.',INVALID_GUEST_OUTCOME:'Choose an allowed sandbox outcome for the original payment attempt.',CASE_LINK_REQUIRED:'Link the support case to this exact original payment attempt.',OUTCOME_REVIEW_REQUIRED:'A different authorised colleague must review this proposed outcome.',OUTCOME_UNCONFIRMED:'The original payment outcome is still unconfirmed. Keep its reference for review.',FINANCIAL_OPERATION_FAILED:'This operation could not be confirmed. Check the original record before retrying.',PROVIDER_RESULT_MISMATCH:'The returned outcome does not match the original payment details.',PAYMENT_FINAL:'This payment already has a final recorded outcome. Refresh its details.',IDEMPOTENCY_CONFLICT:'This request reference was already used with different details.',STALE_CONTROL:'This request changed. Refresh its current details before continuing.'});
const fail=(code,status=400)=>Object.assign(new Error(MESSAGES[code]||MESSAGES.SERVICE_UNAVAILABLE),{code,status});
const cleanText=(x,max=100)=>typeof x==='string'&&x.trim().length>0&&x.trim().length<=max&&!/[\p{Cc}<>]/u.test(x);
const emailValue=x=>String(x||'').trim().toLowerCase();
const validEmail=x=>x.length<=254&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(x)&&!x.endsWith('.invalid');
function claimsFrom(token){try{const s=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s),c=>c.charCodeAt(0))));}catch{throw fail('AUTH_REQUIRED',401);}}
async function jsonBody(req){
 if(req.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw fail('INVALID_INPUT');
 const reader=req.body?.getReader();if(!reader)throw fail('INVALID_INPUT');let n=0,parts=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>32768){await reader.cancel();throw fail('INVALID_INPUT',413);}parts.push(value);}}finally{reader.releaseLock();}
 try{const bytes=new Uint8Array(n);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}const x=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!plain(x))throw Error();return x;}catch{throw fail('INVALID_INPUT');}
}
export function createAdminHandler({supabaseUrl,serviceRoleKey,allowedOrigins=[],fetch:transport=globalThis.fetch,crypto:cryptoApi=globalThis.crypto}={}){
 const base=new URL(supabaseUrl);if(base.protocol!=='https:'||base.pathname!=='/'||!serviceRoleKey)throw Error('Invalid admin gateway configuration');
 const origins=new Set(allowedOrigins);
 async function upstream(path,body,{token=serviceRoleKey,method='POST',allowFailure=false}={}){
  let response,data;try{response=await transport(base.origin+path,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{apikey:serviceRoleKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})});data=await response.json();}catch{throw fail('SERVICE_UNAVAILABLE',503);}
  if(!response.ok&&!allowFailure)throw fail(response.status===429?'RATE_LIMITED':'SERVICE_UNAVAILABLE',response.status===429?429:503);return {ok:response.ok,status:response.status,data};
 }
 async function rpc(command,payload){const financial=command.startsWith('financial.'),special=command==='operations.list'?'lumo_admin_events':command==='summary'?'lumo_admin_summary':command==='staff.directory'?'lumo_admin_staff_directory':null;const {data}=await upstream('/rest/v1/rpc/'+(financial?'lumo_admin_financial':special||'lumo_admin_service'),special?{p_payload:payload}:{p_command:command,p_payload:payload});if(!plain(data)||typeof data.ok!=='boolean')throw fail('SERVICE_UNAVAILABLE',503);if(!data.ok){const code=typeof data.code==='string'&&/^[A-Z_]{1,80}$/.test(data.code)?data.code:'SERVICE_UNAVAILABLE';throw fail(code,['AUTH_REQUIRED','SESSION_REVOKED'].includes(code)?401:['FORBIDDEN','STAFF_REQUIRED','MFA_REQUIRED'].includes(code)?403:400);}return data;}
 async function identify(token){
  if(typeof token!=='string'||token.length>16384)throw fail('AUTH_REQUIRED',401);
  const verified=await upstream('/auth/v1/user',undefined,{token,method:'GET',allowFailure:true});if(!verified.ok||!UUID.test(verified.data?.id||''))throw fail('AUTH_REQUIRED',401);
  const claims=claimsFrom(token);if(claims.sub!==verified.data.id||!UUID.test(claims.session_id||'')||!Number.isFinite(claims.exp)||claims.exp*1000<=Date.now())throw fail('AUTH_REQUIRED',401);
  const identity={actor:verified.data.id,session:claims.session_id,aal:claims.aal==='aal2'?'aal2':'aal1'};
  const staff=await rpc('session',identity);
  const mfaEnforced=staff.data?.mfaEnforced!==false;
  const mfaRequired=mfaEnforced&&(identity.aal!=='aal2'||!(verified.data.factors||[]).some(f=>f.factor_type==='totp'&&f.status==='verified'));
  return {identity,user:verified.data,staff:staff.data?.staff,capabilities:staff.data?.capabilities,mfaEnforced,mfaRequired,token};
 }
 const hash=async s=>Array.from(new Uint8Array(await cryptoApi.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
 const newToken=()=>btoa(String.fromCharCode(...cryptoApi.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 async function revoke(token){try{await upstream('/auth/v1/logout?scope=local',{}, {token,allowFailure:true});}catch{}}
 async function authenticatedSession(session){
  if(!session?.access_token||!session?.refresh_token)throw fail('AUTH_REQUIRED',401);
  try{const who=await identify(session.access_token);return {ok:true,session,staff:who.staff,mfaRequired:who.mfaRequired,mfaEnforced:who.mfaEnforced};}catch(e){await revoke(session.access_token);throw e;}
 }
 return async request=>{
  const origin=request.headers.get('origin');const cors={'Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',Vary:'Origin',...(origin&&origins.has(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'apikey, authorization, content-type','Access-Control-Max-Age':'600'}:{})};
  const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
  try{
   if(origin&&!origins.has(origin))throw fail('ORIGIN_NOT_ALLOWED',403);
   if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
   if(request.method!=='POST')throw fail('INVALID_INPUT',405);
   const body=await jsonBody(request);
   if(body.action==='login'){
    const email=emailValue(body.email);if(!validEmail(email)||typeof body.password!=='string'||body.password.length<1||body.password.length>128)throw fail('INVALID_INPUT');
    const r=await upstream('/auth/v1/token?grant_type=password',{email,password:body.password},{allowFailure:true});if(!r.ok)throw fail(r.status===429?'RATE_LIMITED':'AUTH_REQUIRED',r.status===429?429:401);
    return respond(await authenticatedSession(r.data));
   }
   if(body.action==='refresh'){
    if(typeof body.refreshToken!=='string'||body.refreshToken.length<10||body.refreshToken.length>4096)throw fail('AUTH_REQUIRED',401);
    const r=await upstream('/auth/v1/token?grant_type=refresh_token',{refresh_token:body.refreshToken},{allowFailure:true});if(!r.ok)throw fail('AUTH_REQUIRED',401);
    return respond(await authenticatedSession(r.data));
   }
   if(body.action==='setup'){
    const email=emailValue(body.email);if(typeof body.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(body.token)||!validEmail(email)||!cleanText(body.name,80)||typeof body.password!=='string'||body.password.length<12||new TextEncoder().encode(body.password).length>72)throw fail('INVALID_INPUT');
    const tokenHash=await hash(body.token);await rpc('setup.reserve',{tokenHash,email,name:body.name.trim()});
    // An existing Auth identity is never modified or attached without its own authentication.
    const r=await upstream('/auth/v1/admin/users',{email,password:body.password,email_confirm:true,app_metadata:{lumo_admin:true}},{allowFailure:true});
    if(r.status===429)throw fail('RATE_LIMITED',429);
    // Authenticate even after creation: an interrupted setup can recover an existing identity
    // only with its own password. Never delete an identity after an unknown RPC outcome.
    const session=await upstream('/auth/v1/token?grant_type=password',{email,password:body.password},{allowFailure:true});if(!session.ok||!UUID.test(session.data?.user?.id||''))throw fail('SETUP_FAILED',409);
    if(r.ok&&r.data?.id!==session.data.user.id)throw fail('SETUP_FAILED',409);
    await rpc('setup.complete',{tokenHash,email,name:body.name.trim(),userId:session.data.user.id});
    return respond(await authenticatedSession(session.data));
   }
   const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];const who=await identify(token);
   if(body.action==='session')return respond({ok:true,data:{staff:who.staff,capabilities:who.capabilities,mfaRequired:who.mfaRequired,mfaEnforced:who.mfaEnforced,requiresMfa:who.mfaRequired,factors:(who.user.factors||[]).filter(f=>f.factor_type==='totp').map(f=>({id:f.id,status:f.status,friendly_name:f.friendly_name,factor_type:f.factor_type}))}});
   if(body.action==='logout'){await revoke(token);return respond({ok:true});}
   if(body.action==='mfa.enroll'){
    const existing=(who.user.factors||[]).find(f=>f.factor_type==='totp'&&f.status==='verified');if(existing)throw fail('CONFLICT',409);
    for(const factor of (who.user.factors||[]).filter(f=>f.factor_type==='totp'&&f.status==='unverified'))await upstream('/auth/v1/factors/'+factor.id,undefined,{token,method:'DELETE'});
    const r=await upstream('/auth/v1/factors',{factor_type:'totp',friendly_name:'Lumo Admin authenticator',issuer:'Lumo Admin'},{token,allowFailure:true});if(!r.ok)throw fail(r.status===429?'RATE_LIMITED':'SERVICE_UNAVAILABLE',r.status===429?429:503);return respond({ok:true,...r.data});
   }
   if(body.action==='mfa.challenge'||body.action==='mfa.verify'){
    if(!UUID.test(body.factorId||'')||!(who.user.factors||[]).some(f=>f.id===body.factorId&&f.factor_type==='totp'))throw fail('INVALID_INPUT');
    const verifying=body.action==='mfa.verify';if(verifying&&(!UUID.test(body.challengeId||'')||!/^\d{6}$/.test(body.code||'')))throw fail('INVALID_INPUT');
    const r=await upstream('/auth/v1/factors/'+body.factorId+(verifying?'/verify':'/challenge'),verifying?{challenge_id:body.challengeId,code:body.code}:{},{token,allowFailure:true});if(!r.ok)throw fail(r.status===429?'RATE_LIMITED':'AUTH_REQUIRED',r.status===429?429:401);return respond({ok:true,...r.data});
   }
   if(who.mfaRequired)throw fail('MFA_REQUIRED',403);
   if(body.action==='invite'){
    const email=emailValue(body.email);if(!validEmail(email)||!cleanText(body.name,80)||!ROLES.has(body.role))throw fail('INVALID_INPUT');
    const invitationToken=newToken();const result=await rpc('staff.invite',{email,name:body.name.trim(),role:body.role,tokenHash:await hash(invitationToken),...who.identity});return respond({...result,invitationToken});
   }
   if(body.action!=='rpc'||!COMMANDS.has(body.command)||body.payload!==undefined&&!plain(body.payload))throw fail('INVALID_INPUT');
   // Caller-supplied identity fields are always overwritten with verified upstream identity.
   const trustedPayload={...(body.payload||{}),...who.identity};
   const result=await rpc(body.command,trustedPayload);
   if(['customers.get','products.get'].includes(body.command)&&!['technical','merchant_ops'].includes(who.staff?.role)){
    try{const source=await rpc('summary',trustedPayload);const summary=adminMoneySummary(source.data?.snapshot);result.data.products={...(result.data.products||{}),summary};}
    catch{result.data.moneySummaryUnavailable=true;}
   }
   return respond(result);
  }catch(e){const code=e?.code&&/^[A-Z_]{1,80}$/.test(e.code)?e.code:'SERVICE_UNAVAILABLE';return respond({ok:false,code,message:MESSAGES[code]||MESSAGES.SERVICE_UNAVAILABLE},e?.status||503);}
 };
}
