import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPasswordRecovery,FACE_CONSENT_VERSION} from '../dist/password-recovery.js';

const instant=Date.UTC(2026,10,17,6),expiresAt=new Date(instant+300000).toISOString();
const requestId='11111111-1111-4111-8111-111111111111',resetToken='r'.repeat(43);
const photos=[1,2,3].map(value=>'data:image/jpeg;base64,'+Buffer.from([255,216,value,255,217]).toString('base64'));
const prototype={ok:true,simulation:true,environment:'sandbox',prototypeOnly:true,recoveryMode:'prototype-face-only',requiresBackupKey:false,backupKeyAvailable:false,smsAvailable:false,smsSimulation:true,faceAvailable:true,faceMatching:'stored-template',faceSimulation:false,identityVerified:false,livenessVerified:false,livenessSimulation:true,livenessMode:'prototype-simulation',faceConsentVersion:FACE_CONSENT_VERSION};
const storage=()=>{const records=new Map();return {records,getItem:key=>records.get(key)||null,setItem:(key,value)=>records.set(key,String(value)),removeItem:key=>records.delete(key)};};

async function fixture({status=prototype,grant={...prototype,faceMatched:true,livenessResult:'simulated-pass',resetToken,expiresAt}}={}){
 const original=new Map(['fetch','localStorage','sessionStorage','window'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const local=storage(),tab=storage(),calls=[],views=[];let captures=0;
 for(const [key,value]of Object.entries({localStorage:local,sessionStorage:tab,window:undefined}))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 globalThis.fetch=async(url,options)=>{
  const body=JSON.parse(options.body);calls.push({url,options,body});
  if(body.operation==='status')return Response.json(status);
  if(body.operation==='start')return Response.json({...prototype,requestId,expiresAt,demoCode:'123456'});
  if(body.operation==='faceVerify')return Response.json(grant);
  if(body.operation==='complete')return Response.json({...prototype,completed:true});
  throw Error('Unexpected recovery step '+body.operation);
 };
 const source=await readFile(new URL('../dist/connected-service.js',import.meta.url),'utf8');
 const transport=await import('data:text/javascript;base64,'+Buffer.from('// prototype recovery isolate '+crypto.randomUUID()+'\n'+source).toString('base64'));
 const flow=createPasswordRecovery({module:'merchant',now:()=>instant,request:transport.accessRecovery,capture:async options=>{captures++;assert.equal(options.purpose,'recovery');assert.equal(options.faceMatching,'stored-template');assert.equal(options.livenessSimulation,true);return photos;},onChange:value=>views.push(value)});
 return {flow,calls,views,local,tab,get captures(){return captures;},restore(){flow.dispose();for(const[key,descriptor]of original){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}};
}

test('merchant prototype recovery carries fresh photos without key, SMS proof or signed-in credentials',async()=>{
 const f=await fixture();try{
  assert.equal(await f.flow.start(),true);
  assert.equal(await f.flow.action('sms'),false);assert.equal(await f.flow.action('key'),false);
  assert.equal(await f.flow.submit({identifier:'campus.owner'}),true);
  assert.doesNotMatch(f.flow.render(),/name="backupKey"|name="code"|private recovery key|Test code:/i);
  assert.equal(await f.flow.submit({backupKey:'ignored-client-key',code:'654321',prototypeOnly:false}),true);
  assert.equal(f.captures,1);assert.equal(f.flow.view.phase,'password');
  const proof=f.calls.find(call=>call.body.operation==='faceVerify');
  assert.deepEqual(Object.keys(proof.body).sort(),['module','operation','photos','requestId']);
  assert.deepEqual(proof.body.photos,photos);assert.equal(proof.body.requestId,requestId);
  assert.equal(await f.flow.submit({newPassword:'MerchantNewPassword8',confirmPassword:'MerchantNewPassword8'}),true);
  assert.equal(f.flow.view.phase,'success');
  assert.deepEqual(f.calls.map(call=>call.body.operation),['status','start','faceVerify','complete']);
  for(const call of f.calls){assert.match(call.url,/\/functions\/v1\/lumo-access$/);assert.equal(call.body.module,'merchant');assert.equal(call.options.headers.Authorization,undefined);assert.equal(call.options.credentials,'omit');assert.equal(call.options.cache,'no-store');assert.equal(call.options.redirect,'error');}
  assert.equal(f.local.records.size,0);assert.equal(f.tab.records.size,0);assert.doesNotMatch(JSON.stringify(f.views),/data:image|ignored-client-key|rrrrrrrr|MerchantNewPassword8/);
 }finally{f.restore();}
});

test('merchant recovery cannot disable its key gate from incomplete or production-labelled server metadata',async()=>{
 for(const changed of [{prototypeOnly:false},{recoveryMode:'production'},{environment:'production'},{simulation:false},{livenessSimulation:false},{livenessVerified:true},{faceSimulation:true}]){
  const f=await fixture({status:{...prototype,...changed}});try{
   assert.equal(await f.flow.start(),false);assert.equal(f.flow.view.phase,'unavailable');
   assert.equal(await f.flow.submit({identifier:'campus.owner',prototypeOnly:true,recoveryMode:'prototype-face-only'}),false);
   assert.equal(f.captures,0);assert.deepEqual(f.calls.map(call=>call.body.operation),['status']);
  }finally{f.restore();}
 }
});

test('merchant face-only recovery rejects mismatches and a changed server mode before resetting a password',async()=>{
 for(const changed of [{faceMatched:false},{prototypeOnly:false},{requiresBackupKey:true},{environment:'production'},{faceSimulation:true}]){
  const f=await fixture({grant:{...prototype,faceMatched:true,livenessResult:'simulated-pass',resetToken,expiresAt,...changed}});try{
   await f.flow.start();await f.flow.submit({identifier:'campus.owner'});
   assert.equal(await f.flow.submit({}),false);assert.equal(f.flow.view.phase,'verify-face');
   assert.equal(await f.flow.submit({newPassword:'MerchantNewPassword8',confirmPassword:'MerchantNewPassword8'}),false);
   assert.equal(f.calls.some(call=>call.body.operation==='complete'),false);assert.equal(f.flow.view.livenessResult,'');
  }finally{f.restore();}
 }
});

test('merchant keyless prototype offers no SMS or recovery-key escape when the matcher is unavailable',async()=>{
 const f=await fixture({status:{...prototype,faceAvailable:false}});try{
  await f.flow.start();assert.equal(f.flow.view.phase,'unavailable');
  assert.doesNotMatch(f.flow.render(),/data-password-recovery-action="(?:key|sms)"/);
  assert.equal(await f.flow.action('sms'),false);assert.equal(await f.flow.action('key'),false);
  assert.equal(await f.flow.submit({identifier:'campus.owner'}),false);
  assert.equal(f.captures,0);assert.deepEqual(f.calls.map(call=>call.body.operation),['status']);
 }finally{f.restore();}
});
