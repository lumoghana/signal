import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccessHandler} from '../supabase/functions/lumo-access/handler.mjs';
const actor='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222',proof='33333333-3333-4333-8333-333333333333',template='44444444-4444-4444-8444-444444444444',attempt='55555555-5555-4555-8555-555555555555',requestId='66666666-6666-4666-8666-666666666666';
const consent='2026-11-16.face.1',modelId='opencv-sface-2021dec-v1',modelSha256='0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79';
const jwt=session=>'e30.'+Buffer.from(JSON.stringify({sub:actor,session_id:session})).toString('base64url')+'.sig';
const photos=[1,2,3].map(n=>'data:image/jpeg;base64,'+Buffer.from([255,216,n,255,217]).toString('base64'));
const hashes=await Promise.all(photos.map(async p=>Buffer.from(await crypto.subtle.digest('SHA-256',Buffer.from(p.slice(23),'base64'))).toString('hex')));
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const enrollment={phoneMasked:'+233••••3456',phoneVerified:false,phoneSimulation:true,backupKeyReady:true,keyRotationAvailable:true,faceEnrolled:true,faceSimulation:false,templateEnrolled:true,templateVersion:1,faceConsentVersion:consent,reEnrollmentRequired:false};
const call=(handler,operation,values={},auth=false)=>handler(new Request('https://edge.example/access',{method:'POST',headers:{'content-type':'application/json',origin:'https://lumo-connected-pilot.vercel.app',...(auth?{authorization:'Bearer '+jwt(sid)}:{})},body:JSON.stringify({module:'consumer',operation,...values})}));
function fixture({available=true,matched=true,processorError='',badModel=false,wrongKey=false,badPassword=false}={}){
 const rpc=[],processing=[],auth=[],sms=[];let legacyFace=0;
 const provider={available:true,simulation:true,environment:'sandbox',sendSms:async input=>{sms.push(input);return{accepted:true,simulation:true,delivered:false};},verifyFace:async()=>{legacyFace++;throw Error('Legacy face simulator must never run');}};
 const face={available,enrollFace:async input=>{processing.push({operation:'enroll',input});if(processorError)throw Object.assign(Error('private processor detail'),{code:processorError});return{modelId,modelSha256:badModel?'f'.repeat(64):modelSha256,keyVersion:'fixture-key',templateId:input.templateId,templateVersion:1,templateCiphertext:'C'.repeat(200),frameHashes:hashes};},verifyFace:async input=>{processing.push({operation:'verify',input});if(processorError)throw Object.assign(Error('private processor detail'),{code:processorError});return{modelId,modelSha256:badModel?'f'.repeat(64):modelSha256,keyVersion:'fixture-key',templateId:input.templateId,templateVersion:1,matched,frameHashes:hashes};}};
 const handler=createAccessHandler({supabaseUrl:'https://project.example',serviceRoleKey:'EDGE_SECRET_ONLY',providerMode:'sandbox',providers:provider,faceTemplateProvider:face,allowedOrigins:['https://lumo-connected-pilot.vercel.app'],fetch:async(url,init)=>{
  if(url.endsWith('/auth/v1/user'))return response({id:actor,email:'ama@pilot.lumo.invalid'});
  if(url.includes('/auth/v1/token?')){auth.push(JSON.parse(init.body));return badPassword?response({},401):response({access_token:jwt(proof)});}
  if(url.includes('/auth/v1/logout'))return new Response(null,{status:204});
  const {p_command:command,p_payload:payload}=JSON.parse(init.body);rpc.push({command,payload});
  if(command==='guard')return response({ok:true,phone:'+233240123456',resetInProgress:false});
  if(command==='auth.rate'||command==='proof.close'||command==='biometric.enroll.store')return response({ok:true});
  if(command==='status')return response({ok:true,enrollment});
  if(command==='biometric.enroll.reserve')return response({ok:true,requestId:payload.requestId,expiresAt:new Date(Date.now()+300000).toISOString(),phoneMasked:'+233••••3456'});
  if(command==='enroll.verify')return response({ok:true,templateEnrolled:true,templateVersion:1,faceConsentVersion:consent,phoneMasked:'+233••••3456',enrollment});
  if(command==='biometric.face.begin')return response(wrongKey?{ok:false,code:'PROOF_INVALID'}:{ok:true,attemptId:attempt,ownerId:actor,templateId:template,templateVersion:1,consentVersion:consent,modelId,modelSha256,keyVersion:'fixture-key',templateCiphertext:'S'.repeat(200)});
  if(command==='biometric.face.finish')return response(payload.matched?{ok:true,faceProofId:attempt}:{ok:false,code:payload.failure==='unavailable'?'IDENTITY_UNAVAILABLE':'FACE_NO_MATCH'});
  if(command==='recovery.verify')return response({ok:true,faceMatched:true,expiresAt:new Date(Date.now()+300000).toISOString()});
  if(command==='biometric.remove')return response({ok:true,removed:true,enrollment:{...enrollment,templateEnrolled:false,faceEnrolled:false,templateVersion:null,faceConsentVersion:null}});
  throw Error('Unexpected RPC '+command);
 }});
 return{handler,rpc,processing,auth,sms,get legacyFace(){return legacyFace;}};
}
test('status distinguishes actual saved-face comparison from simulated SMS and unverified liveness',async()=>{
 const f=fixture(),r=await (await call(f.handler,'status',{},true)).json();assert.equal(r.faceMatching,'stored-template');assert.equal(r.faceSimulation,false);assert.equal(r.livenessVerified,false);assert.equal(r.identityVerified,false);assert.equal(r.requiresBackupKey,true);assert.equal(r.smsSimulation,true);assert.equal(r.enrollment.templateEnrolled,true);assert.equal(r.enrollment.keyRotationAvailable,true);assert.equal(r.enrollment.faceConsentVersion,consent);assert.equal(f.legacyFace,0);
});
test('storage consent, configured processor and current password precede any template enrollment',async()=>{
 for(const faceConsent of [undefined,{version:consent,accepted:false},{version:'old',accepted:true}]){const f=fixture(),r=await call(f.handler,'enrollmentStart',{currentPassword:'FixturePassword8',photos,faceConsent},true);assert.equal(r.status,400);assert.equal(f.processing.length,0);assert.equal(f.auth.length,0);}
 const disabled=fixture({available:false});assert.equal((await call(disabled.handler,'enrollmentStart',{currentPassword:'FixturePassword8',photos,faceConsent:{version:consent,accepted:true}},true)).status,503);assert.equal(disabled.processing.length,0);
 const wrong=fixture({badPassword:true});assert.equal((await call(wrong.handler,'enrollmentStart',{currentPassword:'wrong',photos,faceConsent:{version:consent,accepted:true}},true)).status,403);assert.equal(wrong.processing.length,0);
});
test('enrollment stores only processor ciphertext bound to fresh password proof, model, subject and consent',async()=>{
 const f=fixture(),r=await(await call(f.handler,'enrollmentStart',{currentPassword:'FixturePassword8',photos,faceConsent:{version:consent,accepted:true}},true)).json();assert.equal(r.ok,true);
 const reserve=f.rpc.find(x=>x.command==='biometric.enroll.reserve'),stored=f.rpc.find(x=>x.command==='biometric.enroll.store');assert.equal(reserve.payload.proofSession,proof);assert.deepEqual(reserve.payload.faceDigests,hashes);assert.equal(reserve.payload.consentVersion,consent);assert.equal(reserve.payload.consentAccepted,true);assert.equal(stored.payload.templateCiphertext,'C'.repeat(200));assert.equal(stored.payload.templateId,reserve.payload.templateId);assert.equal(stored.payload.modelSha256,modelSha256);
 assert.deepEqual(f.processing[0].input,{requestId:reserve.payload.requestId,module:'consumer',subjectId:actor,templateId:reserve.payload.templateId,templateVersion:1,consentVersion:consent,photos});assert.equal(f.sms.length,1);assert.equal(f.legacyFace,0);assert.doesNotMatch(JSON.stringify(r),/CCCCCC|templateCiphertext|frameHashes|EDGE_SECRET_ONLY|FixturePassword8/);
});
test('face verification needs saved key before processing and carries one-use job and SQL match proof',async()=>{
 const f=fixture(),r=await(await call(f.handler,'faceVerify',{requestId,backupKey:'LUMO-private-fixture-key',photos})).json();assert.equal(r.ok,true);assert.equal(r.faceMatched,true);assert.equal(r.faceSimulation,false);assert.equal(r.livenessVerified,false);assert.equal(r.requiresBackupKey,true);assert.match(r.resetToken,/^[A-Za-z0-9_-]{43}$/);
 assert.equal(f.processing[0].input.requestId,attempt);assert.equal(f.processing[0].input.templateCiphertext,'S'.repeat(200));assert.equal(f.processing[0].input.subjectId,actor);
 const finish=f.rpc.find(x=>x.command==='biometric.face.finish'),grant=f.rpc.find(x=>x.command==='recovery.verify');assert.equal(finish.payload.attemptId,attempt);assert.equal(finish.payload.matched,true);assert.equal(grant.payload.faceProofId,attempt);assert.deepEqual(grant.payload.faceDigests,hashes);assert.doesNotMatch(JSON.stringify(r),/SSSSSS|templateCiphertext|frameHashes|EDGE_SECRET_ONLY|fixture-key/);assert.equal(f.legacyFace,0);
 const wrong=fixture({wrongKey:true}),failed=await call(wrong.handler,'faceVerify',{requestId,backupKey:'LUMO-wrong-private-key',photos});assert.equal(failed.status,400);assert.equal(wrong.processing.length,0);
});
test('mismatches, invalid signed metadata and processor failure cannot produce reset grants',async()=>{
 for(const config of [{matched:false},{badModel:true},{processorError:'FACE_MODEL_UNAVAILABLE'}]){const f=fixture(config),r=await(await call(f.handler,'faceVerify',{requestId,backupKey:'LUMO-private-fixture-key',photos})).json();assert.equal(r.ok,false);assert.equal(r.resetToken,undefined);assert.equal(f.rpc.some(x=>x.command==='recovery.verify'),false);assert.ok(f.rpc.some(x=>x.command==='biometric.face.finish'&&x.payload.matched===false));assert.doesNotMatch(JSON.stringify(r),/private processor detail|EDGE_SECRET_ONLY/);}
});
test('browser scores, verdicts, encrypted templates and proofs cannot enter the public protocol',async()=>{
 for(const injected of [{matched:true},{faceProofId:attempt},{templateCiphertext:'attacker'},{embedding:[0,1]},{modelId:'attacker'}]){const f=fixture(),r=await call(f.handler,'faceVerify',{requestId,backupKey:'LUMO-private-fixture-key',photos,...injected});assert.equal(r.status,400);assert.equal(f.processing.length,0);assert.equal(f.rpc.length,0);}
});
test('enrollment confirmation requires stored-template metadata and redacts all biometric material',async()=>{
 const f=fixture(),r=await(await call(f.handler,'enrollmentVerify',{requestId,code:'123456'},true)).json();assert.equal(r.ok,true);assert.equal(r.templateEnrolled,true);assert.equal(r.templateVersion,1);assert.equal(r.faceConsentVersion,consent);assert.equal(r.faceMatching,'stored-template');assert.equal(r.faceSimulation,false);assert.equal(r.requiresBackupKey,true);assert.match(r.backupKey,/^LUMO-/);assert.doesNotMatch(JSON.stringify(r),/templateCiphertext|frameHashes|EDGE_SECRET_ONLY/);
});
test('authenticated password-stepup removal works without processor and preserves private-key capability',async()=>{
 const f=fixture({available:false}),r=await(await call(f.handler,'faceRemove',{currentPassword:'FixturePassword8'},true)).json();assert.equal(r.ok,true);assert.equal(r.removed,true);assert.equal(r.templateEnrolled,false);assert.equal(r.enrollment.templateEnrolled,false);assert.equal(r.enrollment.backupKeyReady,true);assert.equal(r.enrollment.keyRotationAvailable,true);assert.equal(f.processing.length,0);assert.equal(f.rpc.find(x=>x.command==='biometric.remove').payload.proofSession,proof);assert.equal(f.auth.length,1);
 const wrong=fixture({badPassword:true});assert.equal((await call(wrong.handler,'faceRemove',{currentPassword:'wrong'},true)).status,403);assert.equal(wrong.rpc.some(x=>x.command==='biometric.remove'),false);
});
