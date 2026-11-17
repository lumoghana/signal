import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const KEY='lumo-approved-merchant-session-v1',AUTH='lumo-shared-auth-state-v2';
const USER='11111111-1111-4111-8111-111111111111';
const storage=()=>{const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)}};
async function fixture({signedIn=true}={}){
 const original=new Map(['fetch','localStorage','sessionStorage','window'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const local=storage(),tab=storage(),calls=[];
 local.setItem(AUTH,JSON.stringify({epoch:'original-account',authVersion:1,locked:false,kind:'authenticated'}));
 if(signedIn)tab.setItem(KEY,JSON.stringify({session:{access_token:'synthetic-access',refresh_token:'synthetic-refresh',user:{id:USER}},merchantToken:'a'.repeat(64),authEpoch:'original-account'}));
 for(const [key,value]of Object.entries({localStorage:local,sessionStorage:tab,window:undefined}))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 let handler=async()=>Response.json({ok:true});
 globalThis.fetch=async(url,options)=>{const call={url,options,body:JSON.parse(options.body)};calls.push(call);return handler(call)};
 const source=await readFile(new URL('../dist/connected-service.js',import.meta.url),'utf8');
 const transport=await import('data:text/javascript;base64,'+Buffer.from('// recovery isolate '+Math.random()+'\n'+source).toString('base64'));
 return {transport,calls,local,tab,setHandler:value=>handler=value,restore(){for(const[key,descriptor]of original){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}};
}

test('all public merchant recovery steps omit account credentials and force the merchant audience',async()=>{
 const f=await fixture();try{
  for(const operation of ['status','start','smsVerify','keyVerify','complete'])await f.transport.accessRecovery(operation,{module:'admin',identifier:'campus.owner',resetToken:'synthetic-reset-token'});
  assert.equal(f.calls.length,5);
  for(const call of f.calls){assert.match(call.url,/\/functions\/v1\/lumo-access$/);assert.equal(call.options.headers.Authorization,undefined);assert.equal(call.options.credentials,'omit');assert.equal(call.options.redirect,'error');assert.equal(call.options.cache,'no-store');assert.equal(call.body.module,'merchant');assert.equal(call.body.merchantToken,undefined);assert.equal(call.body.access_token,undefined);}
  assert.equal(JSON.parse(f.tab.getItem(KEY)).session.user.id,USER);
 }finally{f.restore()}
});
test('enrollment, authenticated status and key rotation use only the current session and never install public data',async()=>{
 const f=await fixture();try{
  f.setHandler(()=>Response.json({ok:true,session:{access_token:'injected'},state:{business:{id:'injected'}}}));
  for(const operation of ['status','enrollmentStart','enrollmentVerify','keyRotate','faceRemove'])await f.transport.accessRecovery(operation,{currentPassword:'SyntheticCurrent123'},{authenticated:true});
  for(const call of f.calls){assert.equal(call.options.headers.Authorization,'Bearer synthetic-access');assert.equal(call.body.module,'merchant');assert.equal(call.body.merchantToken,undefined);}
  const saved=JSON.parse(f.tab.getItem(KEY));assert.equal(saved.session.access_token,'synthetic-access');assert.equal(saved.merchantToken,'a'.repeat(64));assert.equal(saved.state,undefined);
 }finally{f.restore()}
});
test('a caller cannot attach an authenticated session to a public proof or reset request',async()=>{
 const f=await fixture();try{
  for(const operation of ['start','smsVerify','keyVerify','complete'])await assert.rejects(f.transport.accessRecovery(operation,{}, {authenticated:true}),error=>error.code==='INVALID_INPUT');
  assert.equal(f.calls.length,0);
 }finally{f.restore()}
});
test('protected recovery management fails before network access when there is no session',async()=>{
 const f=await fixture({signedIn:false});try{
  for(const operation of ['status','enrollmentStart','enrollmentVerify','keyRotate','faceRemove'])await assert.rejects(f.transport.accessRecovery(operation,{}, {authenticated:true}),error=>error.code==='AUTH_REQUIRED');
  assert.equal(f.calls.length,0);
 }finally{f.restore()}
});
test('locally locked or mismatched cached sessions cannot authorize recovery management',async()=>{
 for(const state of [{epoch:'original-account',authVersion:2,locked:true,kind:'signed-out'},{epoch:'another-account',authVersion:2,locked:false,kind:'authenticated'}]){
  const f=await fixture();try{
   f.local.setItem(AUTH,JSON.stringify(state));
   await assert.rejects(f.transport.accessRecovery('keyRotate',{currentPassword:'SyntheticCurrent123'},{authenticated:true}),error=>error.code==='AUTH_REQUIRED');
   assert.equal(f.calls.length,0);
   await f.transport.accessRecovery('start',{identifier:'campus.owner',method:'sms'});assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.headers.Authorization,undefined);
  }finally{f.restore()}
 }
});
test('late recovery proofs and enrollment responses are rejected after an account transition',async()=>{
 for(const operation of ['smsVerify','enrollmentVerify','faceRemove']){
  const f=await fixture();try{
   let release;f.setHandler(()=>new Promise(resolve=>{release=resolve}));
   const pending=f.transport.accessRecovery(operation,{requestId:'synthetic-request',code:'654321'},{authenticated:operation!=='smsVerify'});
   f.local.setItem(AUTH,JSON.stringify({epoch:'different-account',authVersion:2,locked:false,kind:'authenticated'}));
   release(Response.json({ok:true,resetToken:'obsolete-proof',backupKey:'obsolete-key'}));
   await assert.rejects(pending,error=>error.code==='AUTH_CHANGED');assert.equal(JSON.parse(f.tab.getItem(KEY)).session.access_token,'synthetic-access');
  }finally{f.restore()}
 }
});
