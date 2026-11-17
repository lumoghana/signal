import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccessHandler} from '../supabase/functions/lumo-access/handler.mjs';
const actor='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222',proof='33333333-3333-4333-8333-333333333333',requestId='44444444-4444-4444-8444-444444444444',template='55555555-5555-4555-8555-555555555555',attempt='66666666-6666-4666-8666-666666666666';
const jwt=s=>'e30.'+Buffer.from(JSON.stringify({sub:actor,session_id:s})).toString('base64url')+'.sig';
const photos=[1,2,3].map(n=>'data:image/jpeg;base64,'+Buffer.from([255,216,n,255,217]).toString('base64'));
const hashes=await Promise.all(photos.map(async x=>Buffer.from(await crypto.subtle.digest('SHA-256',Buffer.from(x.slice(23),'base64'))).toString('hex')));
const metadata={modelId:'opencv-sface-2021dec-v1',modelSha256:'0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79',keyVersion:'fixture-key',templateVersion:1,frameHashes:hashes};
const consent='2026-11-16.face.1',expiresAt=()=>new Date(Date.now()+300000).toISOString();
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
function fixture({prototypeFaceOnly=true,providerMode='sandbox',url='https://iwutbrljiiodamtyoorg.supabase.co',available=true,matched=true,processorError=false}={}){
 const calls=[],processing=[];
 const face={available,enrollFace:async p=>{processing.push(p);return{...metadata,templateId:p.templateId,templateCiphertext:'C'.repeat(200)};},verifyFace:async p=>{processing.push(p);if(processorError)throw Error();return{...metadata,templateId:p.templateId,matched};}};
 const handler=createAccessHandler({supabaseUrl:url,serviceRoleKey:'FIXTURE_SERVER_ONLY',providerMode,prototypeFaceOnly,faceTemplateProvider:face,fetch:async(u,init)=>{
  if(u.endsWith('/auth/v1/user'))return response({id:actor,email:'fixture@pilot.lumo.invalid'});
  if(u.includes('/auth/v1/token?'))return response({access_token:jwt(proof)});
  if(u.includes('/auth/v1/logout'))return new Response(null,{status:204});
  const{p_command:command,p_payload:payload}=JSON.parse(init.body);calls.push({url:u,command,payload});
  if(command==='guard')return response({ok:true,phone:'+233240123456'});
  if(['auth.rate','proof.close','biometric.enroll.store'].includes(command))return response({ok:true});
  if(command==='status')return response({ok:true,enrollment:{templateEnrolled:true,templateVersion:1,faceConsentVersion:consent,backupKeyReady:true,keyRotationAvailable:true}});
  if(command==='recovery.start'||command==='biometric.enroll.reserve')return response({ok:true,expiresAt:expiresAt()});
  if(command==='enroll.verify')return response({ok:true,templateEnrolled:true,templateVersion:1,faceConsentVersion:consent});
  if(command==='biometric.face.begin')return response({ok:true,attemptId:attempt,ownerId:actor,templateId:template,templateVersion:1,consentVersion:consent,keyVersion:'fixture-key',templateCiphertext:'C'.repeat(200)});
  if(command==='biometric.face.finish')return response(payload.matched?{ok:true,faceProofId:attempt}:{ok:false,code:'FACE_NO_MATCH'});
  if(command==='recovery.verify')return response({ok:true,faceMatched:true,expiresAt:expiresAt()});
  throw Error('Unexpected RPC '+command);
 }});
 const call=async(operation,values={},auth=false,module='consumer')=>{const r=await handler(new Request('https://edge.example/access',{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer '+jwt(sid)}:{})},body:JSON.stringify({module,operation,...values})}));return{status:r.status,...await r.json()};};
 return{call,calls,processing};
}
test('prototype status is explicit, pilot-only and hides all key or SMS recovery capabilities',async()=>{
 for(const module of ['consumer','merchant','admin']){
  const f=fixture(),r=await f.call('status',{},true,module);assert.equal(r.ok,true);assert.equal(r.recoveryMode,'prototype-face-only');assert.equal(r.prototypeOnly,true);assert.equal(r.requiresBackupKey,false);assert.equal(r.simulation,true);assert.equal(r.environment,'sandbox');assert.equal(r.faceSimulation,false);assert.equal(r.livenessVerified,false);assert.equal(r.livenessSimulation,true);assert.equal(r.smsAvailable,false);assert.equal(r.backupKeyAvailable,false);assert.equal(r.enrollment.backupKeyReady,false);assert.equal(r.enrollment.keyRotationAvailable,false);assert.ok(f.calls.every(x=>x.url.endsWith('/lumo_access_prototype_service')));
 }
 for(const config of [{url:'https://other.supabase.co'},{providerMode:'production'}]){const f=fixture(config),r=await f.call('status');assert.equal(r.ok,false);assert.equal(f.calls.length,0);assert.notEqual(r.requiresBackupKey,false);}
 const old=fixture({prototypeFaceOnly:false}),r=await old.call('status');assert.equal(r.requiresBackupKey,true);assert.equal(r.recoveryMode,undefined);assert.equal(r.smsAvailable,true);
});
test('simulated SMS/key resets and client-selected prototype flags cannot reach account state',async()=>{
 for(const operation of ['keyRotate','smsVerify','keyVerify']){const f=fixture(),r=await f.call(operation);assert.equal(r.ok,false);assert.equal(f.calls.length,0);assert.equal(f.processing.length,0);}
 for(const method of ['sms','key']){const f=fixture(),r=await f.call('start',{identifier:'fixture',method});assert.equal(r.ok,false);assert.equal(f.calls.length,0);}
 for(const injected of [{recoveryMode:'prototype-face-only'},{prototypeOnly:true},{livenessVerified:true},{backupKey:'LUMO-client-secret'}]){const f=fixture(),r=await f.call('faceVerify',{requestId,photos,...injected});assert.equal(r.ok,false);assert.equal(f.calls.length,0);assert.equal(f.processing.length,0);}
});
test('keyless face recovery still requires real saved-template matching and one-use SQL proof',async()=>{
 const f=fixture(),r=await f.call('faceVerify',{requestId,photos});assert.equal(r.ok,true);assert.equal(r.faceMatched,true);assert.equal(r.requiresBackupKey,false);assert.equal(r.livenessResult,'simulated-pass');assert.ok(r.resetToken);assert.equal(f.processing.length,1);assert.ok(f.calls.every(x=>!Object.hasOwn(x.payload,'capabilityHash')));assert.equal(f.calls.find(x=>x.command==='recovery.verify').payload.faceProofId,attempt);
 for(const config of [{matched:false},{processorError:true},{available:false}]){const f=fixture(config),r=await f.call('faceVerify',{requestId,photos});assert.equal(r.ok,false);assert.equal(r.resetToken,undefined);assert.equal(r.livenessResult,undefined);assert.equal(f.calls.some(x=>x.command==='recovery.verify'),false);}
});
test('enrollment confirmation returns a saved face receipt without generating or sending a recovery key',async()=>{
 const f=fixture(),r=await f.call('enrollmentVerify',{requestId,code:'123456'},true);assert.equal(r.ok,true);assert.equal(r.enrolled,true);assert.equal(r.templateEnrolled,true);assert.equal(r.backupKey,undefined);assert.equal(r.backupKeyReference,undefined);assert.equal(r.requiresBackupKey,false);const sent=f.calls.find(x=>x.command==='enroll.verify').payload;assert.equal(Object.hasOwn(sent,'capabilityHash'),false);assert.equal(Object.hasOwn(sent,'keyReference'),false);assert.doesNotMatch(r.message,/Keep this private|recovery key/);
});
