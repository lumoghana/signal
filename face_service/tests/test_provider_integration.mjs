import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {webcrypto} from 'node:crypto';
import {createFaceTemplateProvider,FACE_CONSENT_VERSION} from '../../backend/supabase/functions/lumo-access/face-template-provider.mjs';
const python=process.env.FACE_TEST_PYTHON;
if(!python)throw Error('Set FACE_TEST_PYTHON to the pinned face-service runtime.');
const root=new URL('../../',import.meta.url).pathname;
const secret=Buffer.from(Array.from({length:32},(_,i)=>i)).toString('base64url'),key=Buffer.from(Array.from({length:32},(_,i)=>i+32)).toString('base64url');
const fixtures=spawnSync(python,['-c',"import json;from face_service.tests.test_face_service import portrait,photos;print(json.dumps({'enroll':photos(portrait('face-a.png'),1),'same':photos(portrait('face-a.png'),11),'other':photos(portrait('face-b.jpg'),11)}))"],{cwd:root,encoding:'utf8',maxBuffer:2_000_000});if(fixtures.status)throw Error('Cannot prepare public offline fixtures');
const images=JSON.parse(fixtures.stdout),provider=createFaceTemplateProvider({url:'https://lumo-connected-pilot.vercel.app/api/face',secret,crypto:webcrypto,fetch:async(_,init)=>{
 const child=spawnSync(python,['-m','face_service.tests.bridge'],{cwd:root,encoding:'utf8',input:JSON.stringify({body:init.body,headers:init.headers,secret,keys:{'test-v1':key},activeKey:'test-v1'}),maxBuffer:100000});
 if(child.status)throw Error('Private Python test process failed');const result=JSON.parse(child.stdout);return new Response(result.body,{status:result.status,headers:result.headers});
}});
const context={requestId:'11111111-1111-4111-8111-111111111111',module:'consumer',subjectId:'22222222-2222-4222-8222-222222222222',templateId:'33333333-3333-4333-8333-333333333333',templateVersion:1,consentVersion:FACE_CONSENT_VERSION};
const enrolled=await provider.enrollFace({...context,photos:images.enroll});assert.ok(enrolled.templateCiphertext);
const same=await provider.verifyFace({...context,templateCiphertext:enrolled.templateCiphertext,photos:images.same});assert.equal(same.matched,true);
const other=await provider.verifyFace({...context,templateCiphertext:enrolled.templateCiphertext,photos:images.other});assert.equal(other.matched,false);
await assert.rejects(provider.verifyFace({...context,module:'admin',templateCiphertext:enrolled.templateCiphertext,photos:images.same}),e=>e.code==='FACE_TEMPLATE_UNAVAILABLE');
console.log(JSON.stringify({status:'passed',checks:4,actualEdgeProvider:true,actualPythonInference:true,sameEnrolledFaceMatched:true,differentFaceRejected:true,crossModuleCiphertextRejected:true,customerImagesUsed:false,independentCameraCaptureVerified:false}));
