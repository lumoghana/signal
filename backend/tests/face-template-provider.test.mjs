import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,createHash,webcrypto} from 'node:crypto';
import {createFaceTemplateProvider,FACE_MODEL_ID,FACE_MODEL_SHA256,FACE_CONSENT_VERSION} from '../supabase/functions/lumo-access/face-template-provider.mjs';
const secret=Buffer.from(Array.from({length:32},(_,i)=>i)),encoded=secret.toString('base64url');
const base={requestId:'11111111-1111-4111-8111-111111111111',module:'consumer',subjectId:'22222222-2222-4222-8222-222222222222',templateId:'33333333-3333-4333-8333-333333333333',templateVersion:1,consentVersion:FACE_CONSENT_VERSION,photos:['/9j/2Q==','/9j/2A==','/9j/3Q=='].map(x=>'data:image/jpeg;base64,'+x)};
const now=1794830400000;
function reply(init,change=()=>{},options={}){
 const request=JSON.parse(init.body),data={ok:true,requestId:request.requestId,modelId:FACE_MODEL_ID,modelSha256:FACE_MODEL_SHA256,templateId:request.templateId,templateVersion:1,frameHashes:['1','2','3'].map(x=>x.repeat(64)),keyVersion:'fixture-key',...(request.operation==='enroll'?{templateCiphertext:'opaque-encrypted-fixture'.repeat(3)}:{matched:true})};change(data);
 const text=JSON.stringify(data),timestamp=String(now/1000),digest=createHash('sha256').update(init.body).digest('hex');
 const signature=createHmac('sha256',secret).update('lumo-face-response-v1\n'+timestamp+'\n'+request.requestId+'\n'+digest+'\n'+text).digest('hex');
 return new Response(text,{status:options.status||200,headers:{'content-type':'application/json','x-lumo-face-timestamp':options.timestamp||timestamp,'x-lumo-face-signature':options.unsigned?'0'.repeat(64):signature}});
}
const make=(fetch,more={})=>createFaceTemplateProvider({url:'https://lumo-connected-pilot.vercel.app/api/face',secret:encoded,crypto:webcrypto,now:()=>now,fetch,...more});

test('matcher configuration is private, exact-origin and fails closed without keys',async()=>{
 for(const config of [{url:'https://attacker.test/api/face'},{secret:''},{secret:'short'}]){
  const provider=make(()=>{throw Error('must not send photos');},config);assert.equal(provider.available,false);await assert.rejects(provider.enrollFace(base),e=>e.code==='FACE_CONFIGURATION_UNAVAILABLE');
 }
});
test('request HMAC covers exact operation/context/photos; enrollment returns no browser verdict',async()=>{
 let sent;const provider=make(async(url,init)=>{sent={url,...init};return reply(init);});
 const result=await provider.enrollFace(base),expected=createHmac('sha256',secret).update('lumo-face-request-v1\n'+String(now/1000)+'\n'+sent.body).digest('hex');
 assert.equal(sent.headers['X-Lumo-Face-Signature'],expected);assert.equal(sent.headers.Authorization,undefined);assert.equal(sent.redirect,'error');assert.equal(sent.cache,'no-store');assert.equal(result.modelId,FACE_MODEL_ID);assert.ok(result.templateCiphertext);assert.equal('matched' in result,false);assert.equal('photos' in result,false);
});
test('client-supplied embeddings, scores, unsupported consent and mutable extra fields are rejected before transport',async()=>{
 let calls=0;const p=make(async(_,init)=>{calls++;return reply(init);});
 for(const change of [{matched:true},{embedding:[1]},{score:1},{consentVersion:'other'},{templateVersion:2},{module:'unknown'}])await assert.rejects(p.enrollFace({...base,...change}),e=>e.code==='INVALID_INPUT');
 assert.equal(calls,0);
});
test('unsigned, wrong-owner/model/context and stale or malformed processor responses cannot produce a match',async()=>{
 const input={...base,templateCiphertext:'encrypted-template-fixture'};
 const variants=[init=>reply(init,()=>{},{unsigned:true}),init=>reply(init,d=>d.templateId='44444444-4444-4444-8444-444444444444'),init=>reply(init,d=>d.modelSha256='f'.repeat(64)),init=>reply(init,d=>d.matched='true'),init=>reply(init,d=>d.score=1),init=>reply(init,()=>{},{timestamp:'1'})];
 for(const variant of variants){const p=make(async(_,init)=>variant(init));await assert.rejects(p.verifyFace(input),e=>e.code==='FACE_PROCESSING_UNAVAILABLE');}
});
test('valid mismatch is an explicit false result; capture failures remain bounded codes',async()=>{
 const p=make(async(_,init)=>reply(init,d=>d.matched=false));assert.equal((await p.verifyFace({...base,templateCiphertext:'encrypted-template-fixture'})).matched,false);
 const bad=make(async(_,init)=>reply(init,d=>{for(const k of Object.keys(d))delete d[k];Object.assign(d,{ok:false,requestId:base.requestId,code:'FACE_CAPTURE_REPLAY'});}));
 await assert.rejects(bad.enrollFace(base),e=>e.code==='FACE_CAPTURE_REPLAY'&&!e.message.includes('photo'));
});
test('processor timeout does not release an unsigned or guessed result',async()=>{
 const p=make(()=>new Promise(()=>{}),{timeoutMs:10});const start=performance.now();await assert.rejects(p.enrollFace(base),e=>e.code==='FACE_PROCESSING_UNAVAILABLE');assert.ok(performance.now()-start<200);
});
