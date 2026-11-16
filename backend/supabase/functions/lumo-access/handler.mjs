import {createSandboxProviders} from './sandbox-providers.mjs';
import {createFaceTemplateProvider} from './face-template-provider.mjs';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const HEX=/^[a-f0-9]{64}$/;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const HANDLE=/^[a-z0-9][a-z0-9._-]{2,29}$/;
const MODULES=new Set(['consumer','merchant','admin']);
const FACE_CONSENT='2026-11-16.face.1';
const FACE_MODEL='opencv-sface-2021dec-v1';
const FACE_MODEL_SHA='0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79';
const PRIVATE=new Set(['enrollmentStart','enrollmentVerify','keyRotate','faceRemove']);
const encoder=new TextEncoder();
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,fields)=>object(value)&&Object.keys(value).every(key=>fields.includes(key));
const messages={
 INVALID_INPUT:'Review this recovery step and try again.',
 AUTH_REQUIRED:'Sign in again before changing recovery settings.',
 SESSION_REVOKED:'Your session ended. Sign in again.',
 FORBIDDEN:'This account cannot use that recovery module.',
 PASSWORD_INCORRECT:'Your current password could not be confirmed.',
 PASSWORD_REJECTED:'Use a longer password containing letters and numbers.',
 RECOVERY_FAILED:'This recovery proof could not be confirmed. Check your saved recovery key or start again.',
 RECOVERY_UNAVAILABLE:'Recovery is not set up for these details. Sign in or contact Lumo support.',
 RECOVERY_EXPIRED:'This recovery request expired. Start again.',
 RESET_EXPIRED:'This reset approval expired. Start again.',
 RESET_IN_PROGRESS:'The password change is not yet confirmed. Retry this original request with the same new password.',
 RATE_LIMITED:'Too many attempts. Wait a little before trying again.',
 FACE_PENDING:'A face comparison is already in progress. No password has changed.',
 FACE_NO_MATCH:'These photos could not be matched to your saved face. No password has changed.',
 FACE_SPOOF:'This capture could not be accepted. No password has changed.',
 FACE_CAPTURE_UNCLEAR:'We could not read one clear face in every photo. Retake the photos in good light.',
 FACE_CONSENT_REQUIRED:'Confirm that Lumo may save an encrypted face template before setting up face verification.',
 FACE_SETUP_REQUIRED:'Sign in and save a new face template first. Your saved private recovery key remains available.',
 IDENTITY_UNAVAILABLE:'Face verification is unavailable. Try again later or use your saved private recovery key.',
 SMS_UNAVAILABLE:'The test SMS service is unavailable. Try again later.',
 SERVICE_UNAVAILABLE:'Lumo could not confirm this step. Keep the original request and try again.',
 ORIGIN_NOT_ALLOWED:'This application origin is not allowed.',
};
const failure=(code,status=400)=>Object.assign(new Error(messages[code]||messages.SERVICE_UNAVAILABLE),{code,status});
const base64url=value=>btoa(String.fromCharCode(...value)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const normalizedPhone=value=>{
 const digits=typeof value==='string'?value.replace(/[ ()-]/g,'').replace(/^\+233/,'233').replace(/^0/,'233'):'';
 return /^233[25][0-9]{8}$/.test(digits)?'+'+digits:'';
};
function claims(token){
 try{const part=token.split('.')[1];if(!part||part.length>12000)throw Error();return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(part.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));}
 catch{throw failure('AUTH_REQUIRED',401);}
}
function validPassword(value,module){
 return typeof value==='string'&&value.length>=(module==='admin'?12:10)&&value.length<=(module==='admin'?72:128)
  &&(module!=='admin'||encoder.encode(value).byteLength<=72)&&/[A-Za-z]/.test(value)&&/[0-9]/.test(value);
}
function backup(value){return typeof value==='string'&&value.length>=16&&value.length<=512&&!/[\u0000-\u001f\u007f]/.test(value);}
function photoInput(value){
 if(!Array.isArray(value)||value.length!==3||value.some(photo=>typeof photo!=='string'||photo.length>349551||!photo.startsWith('data:image/jpeg;base64,')))throw failure('INVALID_INPUT');
 try{if(value.some(photo=>atob(photo.slice(23)).length>262144))throw Error();}catch{throw failure('INVALID_INPUT');}
 return value;
}
async function jsonBody(request){
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw failure('INVALID_INPUT');
 const reader=request.body?.getReader();if(!reader)throw failure('INVALID_INPUT');const chunks=[];let size=0;
 try{while(true){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>1100000){await reader.cancel();throw failure('INVALID_INPUT',413);}chunks.push(item.value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
 try{const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!object(value))throw Error();return value;}
 catch{throw failure('INVALID_INPUT');}
}

/**
 * SMS/NIA remain explicitly simulated. Face comparison uses only the configured
 * authenticated server processor and its encrypted enrolled template, never a
 * simulator. A private recovery key remains mandatory because this comparison
 * does not establish liveness or government identity. No photo is persisted,
 * logged or returned. Reset grants are account-bound and one-use.
 */
export function createAccessHandler({supabaseUrl,serviceRoleKey,allowedOrigins=[],providerMode='disabled',
 fetch:transport=globalThis.fetch,crypto:cryptoApi=globalThis.crypto,providers,faceTemplateProvider,faceProcessorUrl='',faceProcessorSecret='',now=Date.now,timeoutMs=15000,maxResponseBytes=65536}={}){
 const base=new URL(supabaseUrl);
 if(base.protocol!=='https:'||base.pathname!=='/'||base.search||base.hash||!serviceRoleKey||!cryptoApi?.subtle||!Number.isSafeInteger(timeoutMs)||timeoutMs<10||timeoutMs>15000||!Number.isSafeInteger(maxResponseBytes)||maxResponseBytes<1024||maxResponseBytes>262144)throw Error('Invalid access service configuration.');
 const origins=new Set(allowedOrigins);
 const provider=providerMode==='sandbox'?(providers||createSandboxProviders({enabled:true,crypto:cryptoApi,now})):null;
 const ready=providerMode==='sandbox'&&provider?.available===true&&provider.environment==='sandbox'&&provider.simulation===true;
 const faceProvider=faceTemplateProvider||createFaceTemplateProvider({url:faceProcessorUrl,secret:faceProcessorSecret,fetch:transport,crypto:cryptoApi,now});
 const random=()=>base64url(cryptoApi.getRandomValues(new Uint8Array(32)));
 const hash=async value=>Array.from(new Uint8Array(await cryptoApi.subtle.digest('SHA-256',encoder.encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
 const otp=()=>{let number;do{number=cryptoApi.getRandomValues(new Uint32Array(1))[0];}while(number>=4294000000);return String(number%1000000).padStart(6,'0');};
 const capHash=(module,value)=>hash('lumo-access-backup-v1\0'+module+'\0'+value);
 const otpHash=(module,id,code)=>hash('lumo-access-otp-v1\0'+module+'\0'+id+'\0'+code);
 const resetHash=(module,id,value)=>hash('lumo-access-reset-v1\0'+module+'\0'+id+'\0'+value);
 const approvedPassword=(handle,password)=>hash('lumo-approved-password-v1\0'+handle+'\0'+password);
 let fingerprintKey;
 async function passwordFingerprint(module,id,password){
  fingerprintKey||=cryptoApi.subtle.importKey('raw',encoder.encode(serviceRoleKey),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return Array.from(new Uint8Array(await cryptoApi.subtle.sign('HMAC',await fingerprintKey,encoder.encode('lumo-access-password-v1\0'+module+'\0'+id+'\0'+password))),b=>b.toString(16).padStart(2,'0')).join('');
 }
 async function upstream(path,body,{token=serviceRoleKey,method='POST',allowFailure=false}={}){
  const controller=new AbortController();let timer;
  const expired=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(failure('SERVICE_UNAVAILABLE',503));},timeoutMs);});
  try{return await Promise.race([(async()=>{
   const response=await transport(base.origin+path,{method,redirect:'error',cache:'no-store',signal:controller.signal,headers:{apikey:serviceRoleKey,Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
   if(response.redirected||!response.ok&&!allowFailure)throw failure('SERVICE_UNAVAILABLE',503);
   if(response.status===204)return {ok:response.ok,status:response.status,data:{}};
   if(!/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(response.headers.get('content-type')||''))throw failure('SERVICE_UNAVAILABLE',503);
   const length=response.headers.get('content-length');if(length&&(!/^\d+$/.test(length)||Number(length)>maxResponseBytes))throw failure('SERVICE_UNAVAILABLE',503);
   const reader=response.body?.getReader();if(!reader)throw failure('SERVICE_UNAVAILABLE',503);const parts=[];let size=0;
   try{while(true){const item=await Promise.race([reader.read(),expired]);if(item.done)break;size+=item.value.byteLength;if(size>maxResponseBytes)throw failure('SERVICE_UNAVAILABLE',503);parts.push(item.value);}}
   finally{reader.cancel().catch(()=>{});reader.releaseLock();}
   const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.byteLength;}
   const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!object(data))throw failure('SERVICE_UNAVAILABLE',503);
   return {ok:response.ok,status:response.status,data};
  })(),expired]);}catch{throw failure('SERVICE_UNAVAILABLE',503);}finally{clearTimeout(timer);controller.abort();}
 }
 async function rpc(command,payload={}){
  const result=await upstream('/rest/v1/rpc/lumo_access_service',{p_command:command,p_payload:payload});
  if(!object(result.data))throw failure('SERVICE_UNAVAILABLE',503);
  if(result.data.ok!==true){const aliases={PROOF_INVALID:'RECOVERY_FAILED',ENROLLMENT_REQUIRED:'RECOVERY_UNAVAILABLE',STEP_UP_REQUIRED:'PASSWORD_INCORRECT',RESET_CONFLICT:'RESET_IN_PROGRESS'};const code=Object.hasOwn(messages,result.data.code)?result.data.code:aliases[result.data.code]||'RECOVERY_FAILED';const error=failure(code,['AUTH_REQUIRED','SESSION_REVOKED'].includes(code)?401:code==='RATE_LIMITED'?429:code==='RESET_IN_PROGRESS'?409:400);if(Number.isSafeInteger(result.data.retryAfter))error.retryAfter=result.data.retryAfter;throw error;}
  return result.data;
 }
 async function identify(token,module){
  if(typeof token!=='string'||token.length>16384)throw failure('AUTH_REQUIRED',401);
  const result=await upstream('/auth/v1/user',undefined,{method:'GET',token,allowFailure:true});
  const user=result.data,claim=claims(token);
  if(!result.ok||!UUID.test(user?.id||'')||claim.sub!==user.id||!UUID.test(claim.session_id||'')||typeof user.email!=='string')throw failure('AUTH_REQUIRED',401);
  const identity={module,actor:user.id,session:claim.session_id};
  const profile=await rpc('guard',identity);
  return {user,token,identity,profile};
 }
 async function withPassword(who,password,rateKey,run){
  if(typeof password!=='string'||!password.length||password.length>128)throw failure('INVALID_INPUT');
  await rpc('auth.rate',{...who.identity,rateKey});
  const email=who.user.email.toLowerCase(),handle=email.split('@')[0];
  if(who.identity.module!=='admin'&&(!HANDLE.test(handle)||email!==handle+'@pilot.lumo.invalid'))throw failure('FORBIDDEN',403);
  let proof;
  try{
   let result=await upstream('/auth/v1/token?grant_type=password',{email,password:who.identity.module==='admin'?password:await approvedPassword(handle,password)},{allowFailure:true});
   if(!result.ok&&who.identity.module!=='admin')result=await upstream('/auth/v1/token?grant_type=password',{email,password},{allowFailure:true});
   if(!result.ok||typeof result.data?.access_token!=='string')throw failure(result.status===429?'RATE_LIMITED':'PASSWORD_INCORRECT',result.status===429?429:403);
   proof=result.data;const claim=claims(proof.access_token);
   if(claim.sub!==who.user.id||!UUID.test(claim.session_id||'')||claim.session_id===who.identity.session)throw failure('AUTH_REQUIRED',401);
   return await run(claim.session_id);
  }finally{
   if(proof?.access_token){
    try{await upstream('/auth/v1/logout?scope=local',{}, {token:proof.access_token,allowFailure:false});}
    catch{try{await rpc('proof.close',{...who.identity,proofSession:claims(proof.access_token).session_id});}catch{/* No secrets escape a failed cleanup. */}}
   }
  }
 }
 async function photoDigests(photos){
  return Promise.all(photos.map(async photo=>{const bytes=Uint8Array.from(atob(photo.slice(23)),c=>c.charCodeAt(0));try{return Array.from(new Uint8Array(await cryptoApi.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}finally{bytes.fill(0);}}));
 }
 function checkedComparison(result,context,{enrollment=false}={}){
  if(result?.modelId!==FACE_MODEL||result?.modelSha256!==FACE_MODEL_SHA||result?.templateId!==context.templateId||result?.templateVersion!==1||typeof result?.keyVersion!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(result.keyVersion)||!Array.isArray(result.frameHashes)||result.frameHashes.length!==3||result.frameHashes.some(value=>!HEX.test(value))||new Set(result.frameHashes).size!==3)throw failure('IDENTITY_UNAVAILABLE',503);
  if(enrollment){if(typeof result.templateCiphertext!=='string'||result.templateCiphertext.length<64||result.templateCiphertext.length>16384||!/^[A-Za-z0-9_-]+$/.test(result.templateCiphertext))throw failure('IDENTITY_UNAVAILABLE',503);}
  else if(typeof result.matched!=='boolean'||result.keyVersion!==context.keyVersion)throw failure('IDENTITY_UNAVAILABLE',503);
  return result.frameHashes;
 }
 const publicEnrollment=value=>({phoneMasked:String(value?.phoneMasked||''),phoneVerified:false,phoneSimulation:true,backupKeyReady:value?.backupKeyReady===true,keyRotationAvailable:value?.keyRotationAvailable===true,faceEnrolled:value?.templateEnrolled===true,faceSimulation:false,templateEnrolled:value?.templateEnrolled===true,templateVersion:value?.templateEnrolled===true&&value.templateVersion===1?1:null,faceConsentVersion:value?.templateEnrolled===true&&value.faceConsentVersion===FACE_CONSENT?FACE_CONSENT:null,reEnrollmentRequired:value?.reEnrollmentRequired===true});
 const labels={simulation:true,environment:'sandbox',identityVerified:false,livenessVerified:false,faceMatching:'stored-template',faceSimulation:false,faceConsentVersion:FACE_CONSENT,requiresBackupKey:true,smsSimulation:true};
 return async request=>{
  const origin=request.headers.get('origin');
  const cors={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',Vary:'Origin',...(origin&&origins.has(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'apikey, authorization, content-type, x-client-info','Access-Control-Max-Age':'600'}:{})};
  const respond=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8'}});
  try{
   if(origin&&!origins.has(origin))throw failure('ORIGIN_NOT_ALLOWED',403);
   if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
   if(request.method!=='POST')throw failure('INVALID_INPUT',405);
   const body=await jsonBody(request),module=body.module,operation=body.operation;
   if(!MODULES.has(module)||typeof operation!=='string')throw failure('INVALID_INPUT');
   if(!ready)throw failure('IDENTITY_UNAVAILABLE',503);
   const ip=request.headers.get('cf-connecting-ip')||request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()||'native-or-unknown';
   const rateKey=await hash('lumo-access-client-v1\0'+ip.slice(0,160));
   const authenticated=PRIVATE.has(operation)||operation==='status'&&request.headers.has('authorization');
   const who=authenticated?await identify(request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1],module):null;
   if(PRIVATE.has(operation)&&who.profile.resetInProgress)throw failure('RESET_IN_PROGRESS',409);
   const values=keys=>{if(!exact(body,['module','operation',...keys]))throw failure('INVALID_INPUT');};
   if(operation==='status'){
    values([]);const status=who?await rpc('status',who.identity):null;
    return respond({ok:true,...labels,smsAvailable:true,faceAvailable:faceProvider.available===true,backupKeyAvailable:true,passwordPolicy:{minLength:module==='admin'?12:10,maxLength:module==='admin'?72:128,...(module==='admin'?{maxBytes:72}:{}),lettersAndNumbers:true},...(who?{enrollment:publicEnrollment(status.enrollment)}:{})});
   }
   if(operation==='enrollmentStart'){
    values(['currentPassword','photos','phone','faceConsent']);photoInput(body.photos);
    if(!exact(body.faceConsent,['version','accepted'])||body.faceConsent?.version!==FACE_CONSENT||body.faceConsent?.accepted!==true)throw failure('FACE_CONSENT_REQUIRED');
    if(faceProvider.available!==true)throw failure('IDENTITY_UNAVAILABLE',503);
    return await withPassword(who,body.currentPassword,rateKey,async proofSession=>{
     const phone=normalizedPhone(body.phone||who.profile.phone);
     if(!phone)throw failure('INVALID_INPUT');
     const faceDigests=await photoDigests(body.photos),requestId=cryptoApi.randomUUID(),templateId=cryptoApi.randomUUID(),code=otp();
     const result=await rpc('biometric.enroll.reserve',{...who.identity,proofSession,requestId,phone,otpHash:await otpHash(module,requestId,code),faceDigests,templateId,consentVersion:FACE_CONSENT,consentAccepted:true});
     const face=await faceProvider.enrollFace({requestId,module,subjectId:who.user.id,templateId,templateVersion:1,consentVersion:FACE_CONSENT,photos:body.photos});
     const checked=checkedComparison(face,{templateId},{enrollment:true});if(checked.some((value,index)=>value!==faceDigests[index]))throw failure('IDENTITY_UNAVAILABLE',503);
     await rpc('biometric.enroll.store',{...who.identity,requestId,templateId,templateVersion:1,faceDigests:checked,modelId:face.modelId,modelSha256:face.modelSha256,keyVersion:face.keyVersion,templateCiphertext:face.templateCiphertext});
     const accepted=await provider.sendSms({to:phone,code,purpose:'enrollment'});
     if(accepted.accepted!==true||accepted.simulation!==true||accepted.delivered!==false)throw failure('SMS_UNAVAILABLE',503);
     return respond({ok:true,...labels,requestId,expiresAt:result.expiresAt,phoneMasked:result.phoneMasked,demoCode:code,message:'Test mode: no SMS was sent. Enter the displayed code to finish recovery setup.'});
    });
   }
   if(operation==='enrollmentVerify'){
    values(['requestId','code']);if(!UUID.test(body.requestId||'')||typeof body.code!=='string'||!/^\d{6}$/.test(body.code))throw failure('INVALID_INPUT');
    const backupKey='LUMO-'+random(),keyReference=cryptoApi.randomUUID();
    const result=await rpc('enroll.verify',{...who.identity,requestId:body.requestId,otpHash:await otpHash(module,body.requestId,body.code),capabilityHash:await capHash(module,backupKey),keyReference});
    if(result.templateEnrolled!==true||result.templateVersion!==1||result.faceConsentVersion!==FACE_CONSENT)throw failure('IDENTITY_UNAVAILABLE',503);
    return respond({ok:true,...labels,enrolled:true,phoneVerified:false,phoneSimulation:true,faceEnrolled:true,templateEnrolled:true,templateVersion:1,phoneMasked:result.phoneMasked,backupKey,backupKeyReference:keyReference,message:'Your encrypted face template is saved. Keep this private recovery key too; face comparison does not prove liveness, and SMS remains simulated.'});
   }
   if(operation==='keyRotate'){
    values(['currentPassword']);
    return await withPassword(who,body.currentPassword,rateKey,async proofSession=>{
     const backupKey='LUMO-'+random(),keyReference=cryptoApi.randomUUID();
     await rpc('key.rotate',{...who.identity,proofSession,capabilityHash:await capHash(module,backupKey),keyReference});
     return respond({ok:true,...labels,backupKey,backupKeyReference:keyReference});
    });
   }
   if(operation==='faceRemove'){
    values(['currentPassword']);
    return await withPassword(who,body.currentPassword,rateKey,async proofSession=>{
     const result=await rpc('biometric.remove',{...who.identity,proofSession});
     return respond({ok:true,...labels,removed:true,templateEnrolled:false,enrollment:publicEnrollment(result.enrollment),message:'Your saved face template was removed. Your private recovery key and SMS option stay as they are.'});
    });
   }
   if(operation==='start'){
    values(['identifier','method']);
    const identifier=typeof body.identifier==='string'?body.identifier.trim().replace(/^@/,'').toLowerCase():'';
    if(!['face','sms','key'].includes(body.method)||(module==='admin'?!identifier||identifier.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(identifier):!HANDLE.test(identifier)))throw failure('INVALID_INPUT');
    const requestId=cryptoApi.randomUUID(),code=otp();
    const result=await rpc('recovery.start',{module,identifier,method:body.method,requestId,otpHash:await otpHash(module,requestId,code),rateKey});
    if(body.method==='sms'){
     const accepted=await provider.sendSms({to:normalizedPhone(result.phone)||'+233200000000',code,purpose:'recovery'});
     if(accepted.accepted!==true||accepted.simulation!==true||accepted.delivered!==false)throw failure('SMS_UNAVAILABLE',503);
    }
    return respond({ok:true,...labels,requestId,expiresAt:result.expiresAt,retryAfter:60,...(body.method==='sms'?{demoCode:code}:{}),message:'Test recovery requires the private recovery key saved while signed in. Account existence is not disclosed.'});
   }
   if(['smsVerify','keyVerify','faceVerify'].includes(operation)){
    values(['requestId','backupKey',...(operation==='smsVerify'?['code']:operation==='faceVerify'?['photos']:[])]);
    if(!UUID.test(body.requestId||'')||!backup(body.backupKey)||operation==='smsVerify'&&(typeof body.code!=='string'||!/^\d{6}$/.test(body.code)))throw failure('INVALID_INPUT');
    const capabilityHash=await capHash(module,body.backupKey),payload={module,requestId:body.requestId,capabilityHash};
    if(operation==='faceVerify'){
     photoInput(body.photos);
     if(faceProvider.available!==true)throw failure('IDENTITY_UNAVAILABLE',503);
     const context=await rpc('biometric.face.begin',payload);
     let face;
     try{
      face=await faceProvider.verifyFace({requestId:context.attemptId,module,subjectId:context.ownerId,templateId:context.templateId,templateVersion:context.templateVersion,consentVersion:context.consentVersion,photos:body.photos,templateCiphertext:context.templateCiphertext});
      payload.faceDigests=checkedComparison(face,context);
     }catch(error){
      try{await rpc('biometric.face.finish',{...payload,attemptId:context.attemptId,matched:false,failure:'unavailable'});}catch{}
      throw failure(['FACE_CAPTURE_UNCLEAR','FACE_NOT_FOUND','MULTIPLE_FACES','FACE_TOO_SMALL','FACE_LIGHTING','FACE_BLURRY','FACE_INCONSISTENT','FACE_CAPTURE_REPLAY','INVALID_IMAGE','INVALID_CAPTURE'].includes(error?.code)?'FACE_CAPTURE_UNCLEAR':'IDENTITY_UNAVAILABLE',503);
     }
     const match=await rpc('biometric.face.finish',{...payload,attemptId:context.attemptId,matched:face.matched,faceDigests:payload.faceDigests,modelId:face.modelId,modelSha256:face.modelSha256,keyVersion:face.keyVersion});
     payload.faceProofId=match.faceProofId;
    }
    if(operation==='smsVerify')payload.otpHash=await otpHash(module,body.requestId,body.code);
    const resetToken=random();payload.resetTokenHash=await resetHash(module,body.requestId,resetToken);
    payload.method=operation==='faceVerify'?'face':operation==='smsVerify'?'sms':'key';
    const result=await rpc('recovery.verify',payload);
    if(operation==='faceVerify'&&result.faceMatched!==true)throw failure('IDENTITY_UNAVAILABLE',503);
    return respond({ok:true,...labels,...(operation==='faceVerify'?{faceMatched:true}:{}),resetToken,expiresAt:result.expiresAt});
   }
   if(operation==='complete'){
    values(['requestId','resetToken','newPassword']);
    if(!UUID.test(body.requestId||'')||typeof body.resetToken!=='string'||!TOKEN.test(body.resetToken)||!validPassword(body.newPassword,module))throw failure('INVALID_INPUT');
    const payload={module,requestId:body.requestId,resetTokenHash:await resetHash(module,body.requestId,body.resetToken),passwordFingerprint:await passwordFingerprint(module,body.requestId,body.newPassword)};
    const begun=await rpc('complete.begin',payload);
    if(begun.resetState!=='completed'){
     if(!UUID.test(begun.ownerId||'')||typeof begun.email!=='string'||module!=='admin'&&(!HANDLE.test(begun.handle||'')||begun.email!==begun.handle+'@pilot.lumo.invalid'))throw failure('RESET_IN_PROGRESS',409);
     try{
      const changed=await upstream('/auth/v1/admin/users/'+begun.ownerId,{password:module==='admin'?body.newPassword:await approvedPassword(begun.handle,body.newPassword)},{method:'PUT',allowFailure:true});
      if(!changed.ok||changed.data?.id!==begun.ownerId)throw failure('RESET_IN_PROGRESS',409);
      await rpc('complete.finish',payload);
     }catch{throw failure('RESET_IN_PROGRESS',409);}
    }
    return respond({ok:true,...labels,completed:true,message:'Your password changed and existing sessions ended. Sign in again, then set up a fresh recovery key. Your transaction PIN is unchanged.'});
   }
   throw failure('INVALID_INPUT');
  }catch(error){
   const code=error?.code==='SANDBOX_INVALID_INPUT'?'INVALID_INPUT':Object.hasOwn(messages,error?.code)?error.code:'SERVICE_UNAVAILABLE';
   const status=Number.isInteger(error?.status)&&error.status>=400&&error.status<=599?error.status:503;
   return respond({ok:false,...(ready?labels:{}),code,message:messages[code],...(Number.isSafeInteger(error?.retryAfter)?{retryAfter:Math.max(1,Math.min(error.retryAfter,3600))}:{})},status);
  }
 };
}

