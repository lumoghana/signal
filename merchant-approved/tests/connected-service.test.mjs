// Production Supabase HTTP transport checks with synthetic sessions and mocked HTTP.
// Kept aligned with backend/tests/approved-merchant-transport.test.mjs; no D1 substitution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const KEY='lumo-approved-merchant-session-v1',AUTH_KEY='lumo-shared-auth-state-v2';
const ids={a:'00000000-0000-4000-8000-000000000001',b:'00000000-0000-4000-8000-000000000002'};
const session=(name,expired=false)=>({access_token:name+'-access',refresh_token:name+'-refresh',expires_at:Math.floor(Date.now()/1000)+(expired?-5:3600),user:{id:ids[name],email:name+'@pilot.lumo.invalid'}});
const state=(name,expired=false)=>({session:session(name,expired),merchantToken:name.repeat(64),remember:false,authEpoch:'epoch-'+name});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const storage=()=>{const items=new Map();return {getItem:key=>items.get(key)??null,setItem:(key,value)=>items.set(key,String(value)),removeItem:key=>items.delete(key)}};
async function staleOutcome(promise){try{const result=await promise;assert.equal((await result.json()).ok,false,'a stale response must not report success')}catch(error){assert.ok(['AUTH_CHANGED','SESSION_CHANGED','AbortError'].includes(error.code||error.name),'a stale response rejects as an account change')}}
async function setup({expired=false}={}){
 const originals=new Map(['fetch','localStorage','sessionStorage','window','BroadcastChannel'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const local=storage(),tab=storage(),calls=[],channels=[];tab.setItem(KEY,JSON.stringify(state('a',expired)));
 local.setItem(AUTH_KEY,JSON.stringify({epoch:'epoch-a',authVersion:1,locked:false,kind:'authenticated'}));
 class Channel{
  constructor(name){this.name=name;this.listeners=[];this.sent=[];channels.push(this)}
  addEventListener(type,fn){if(type==='message')this.listeners.push(fn)}
  postMessage(data){this.sent.push(data)}
  unref(){}
  close(){}
  emit(data){for(const listener of this.listeners)listener({data})}
 }
 for(const [key,value]of Object.entries({localStorage:local,sessionStorage:tab,window:{dispatchEvent(){}},BroadcastChannel:Channel}))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 let transport=async()=>{throw Error('Unexpected request')};
 globalThis.fetch=async(url,options={})=>{const call={url:String(url),options,body:options.body?JSON.parse(options.body):null};calls.push(call);return transport(call)};
 const source=await readFile(new URL('../dist/connected-service.js',import.meta.url),'utf8');
 const module=await import('data:text/javascript;base64,'+Buffer.from('// isolated transport '+Math.random()+'\n'+source).toString('base64'));
 function auth(name,version=2){local.setItem(AUTH_KEY,JSON.stringify({epoch:'epoch-'+name,authVersion:version,locked:false,kind:'authenticated'}))}
 const stored=()=>{const text=tab.getItem(KEY)||local.getItem(KEY);return text?JSON.parse(text):null};
 function configure(fn){transport=fn}
 async function loginB(){auth('b');return module.merchantFetch('/api/auth/login',{method:'POST',body:JSON.stringify({username:'b',password:'B-password-123'})})}
 function usual(call){
  if(call.body?.action==='login')return response({ok:true,session:session('b')});
  if(call.body?.action==='merchant'&&call.body.path==='/api/auth/login')return response({ok:true,merchantToken:'b'.repeat(64),session:{userId:ids.b,username:'b'}});
  if(call.url.includes('/auth/v1/logout'))return response({});
  throw Error('Unexpected request '+new URL(call.url).pathname);
 }
 const cleanup=()=>{for(const [key,descriptor]of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}};
 return {module,calls,channels,configure,usual,loginB,stored,auth,cleanup};
}

test('an old account refresh cannot replace the new account after sign-in',async()=>{
 const f=await setup({expired:true}),pending=deferred(),started=deferred();
 try{
  f.configure(call=>{if(call.url.includes('grant_type=refresh_token')){started.resolve();return pending.promise}return f.usual(call)});
  const old=f.module.merchantFetch('/api/session');await started.promise;
  const signedIn=await f.loginB();assert.equal((await signedIn.json()).ok,true);
  pending.resolve(response({...session('a'),access_token:'a-refreshed-access'}));await staleOutcome(old);
  assert.equal(f.stored().session.user.id,ids.b);assert.equal(f.stored().session.access_token,'b-access');assert.equal(f.stored().merchantToken,'b'.repeat(64));
 }finally{f.cleanup()}
});

test('a delayed merchant reply cannot install an old merchant token after account change',async()=>{
 const f=await setup(),pending=deferred(),started=deferred();
 try{
  f.configure(call=>{if(call.body?.action==='merchant'&&call.body.path==='/api/session'){started.resolve();return pending.promise}return f.usual(call)});
  const old=f.module.merchantFetch('/api/session');await started.promise;await f.loginB();
  pending.resolve(response({ok:true,merchantToken:'c'.repeat(64),session:{userId:ids.a}}));await staleOutcome(old);
  assert.equal(f.stored().session.user.id,ids.b);assert.equal(f.stored().merchantToken,'b'.repeat(64));
 }finally{f.cleanup()}
});

test('a delayed logout cannot clear or revoke a newer account session',async()=>{
 const f=await setup(),pending=deferred(),started=deferred();
 try{
  f.configure(call=>{if(call.body?.action==='merchant'&&call.body.path==='/api/auth/logout'){started.resolve();return pending.promise}return f.usual(call)});
  const old=f.module.merchantFetch('/api/auth/logout',{method:'POST',body:'{}'});await started.promise;await f.loginB();
  pending.resolve(response({ok:true,merchantToken:'',session:null}));await staleOutcome(old);
  assert.equal(f.stored().session.user.id,ids.b);assert.equal(f.stored().merchantToken,'b'.repeat(64));
  assert.ok(f.calls.filter(call=>call.url.includes('/auth/v1/logout')).every(call=>call.options.headers.Authorization!=='Bearer b-access'),'the newer shared session is never revoked by the old logout');
 }finally{f.cleanup()}
});

test('a delayed cross-tab session from an older auth epoch cannot replace the current account',async()=>{
 const f=await setup();
 try{
  f.configure(f.usual);await f.loginB();
  assert.ok(f.channels.length>0,'the approved transport synchronizes open tabs');
  for(const channel of f.channels)channel.emit({type:'session',value:state('a'),epoch:'epoch-a',authEpoch:'epoch-a',authVersion:1});
  await Promise.resolve();
  assert.equal(f.stored().session.user.id,ids.b);assert.equal(f.stored().merchantToken,'b'.repeat(64));
 }finally{f.cleanup()}
});


test('a stale cross-tab responder cannot relabel its old session with the new shared epoch',async()=>{
 const f=await setup();
 try{
  f.auth('b');
  for(const channel of f.channels)channel.emit({type:'request'});
  const replies=f.channels.flatMap(channel=>channel.sent).filter(message=>message.type==='session');
  assert.ok(replies.every(message=>message.value?.authEpoch===message.epoch),'a stored session is broadcast only under the epoch that authenticated it');
  assert.ok(replies.every(message=>!(message.epoch==='epoch-b'&&message.value?.session?.user?.id===ids.a)),'an old account is never relabeled as the new account epoch');
 }finally{f.cleanup()}
});

test('a cross-tab session with mismatched inner and outer epochs is ignored',async()=>{
 const f=await setup();
 try{
  f.configure(f.usual);await f.loginB();
  for(const channel of f.channels)channel.emit({type:'session',value:state('a'),epoch:'epoch-b'});
  await Promise.resolve();
  assert.equal(f.stored().session.user.id,ids.b);assert.equal(f.stored().authEpoch,'epoch-b');
 }finally{f.cleanup()}
});

test('an epoch mismatch cannot turn a protected account change into anonymous success',async()=>{
 const f=await setup();try{
  f.auth('b');
  const result=await f.module.merchantFetch('/api/auth/password',{method:'POST',body:'{}'}),body=await result.json();
  assert.equal(result.status,409);assert.equal(body.ok,false);assert.equal(body.code,'AUTH_CHANGED');assert.equal(f.calls.length,0);assert.equal(f.stored().session.user.id,ids.a);
 }finally{f.cleanup()}
});

const luxReply=(owner=ids.a)=>({ok:true,owner,mode:'recorded',answer:{title:'Confirmed records',paragraphs:[],stats:[]},state:{business:{id:'synthetic-business'}}});
const luxRequest={method:'POST',body:JSON.stringify({question:'What is still processing?',context:{questions:[]},shopId:'night-market',state:{openingBalance:999999}})};
test('merchant Lux sends questions and session authority, never local financial records',async()=>{
 const f=await setup();try{
  f.configure(call=>{assert.equal(call.url,'https://lumo-connected-pilot.vercel.app/api/merchant-lux');assert.equal(call.options.headers.Authorization,'Bearer a-access');assert.equal(call.body.merchantToken,'a'.repeat(64));assert.equal(call.body.shopId,'night-market');assert.equal(call.body.state,undefined);assert.equal(call.body.question,'What is still processing?');return response({...luxReply(),merchantToken:'c'.repeat(64)})});
  const result=await f.module.merchantFetch('/api/lux',luxRequest);assert.equal((await result.json()).ok,true);assert.equal(f.calls.length,1);assert.equal(f.stored().merchantToken,'a'.repeat(64));
 }finally{f.cleanup()}
});
test('merchant Lux discards an old account answer after another account signs in',async()=>{
 const f=await setup(),pending=deferred(),started=deferred();try{
  f.configure(call=>{if(call.url.endsWith('/api/merchant-lux')){started.resolve();return pending.promise}return f.usual(call)});
  const old=f.module.merchantFetch('/api/lux',luxRequest);await started.promise;await f.loginB();pending.resolve(response(luxReply()));await staleOutcome(old);assert.equal(f.stored().session.user.id,ids.b);
 }finally{f.cleanup()}
});
test('merchant Lux rejects answers addressed to another shared user',async()=>{
 const f=await setup();try{f.configure(()=>response(luxReply(ids.b)));await staleOutcome(f.module.merchantFetch('/api/lux',luxRequest));assert.equal(f.stored().session.user.id,ids.a)}finally{f.cleanup()}
});
test('merchant Lux refreshes an expired shared credential before reading records',async()=>{
 const f=await setup({expired:true});try{
  f.configure(call=>{if(call.url.includes('grant_type=refresh_token'))return response({...session('a'),access_token:'a-renewed'});assert.equal(call.options.headers.Authorization,'Bearer a-renewed');return response(luxReply())});
  assert.equal((await(await f.module.merchantFetch('/api/lux',luxRequest)).json()).ok,true);assert.equal(f.calls.length,2);assert.equal(f.stored().merchantToken,'a'.repeat(64));
 }finally{f.cleanup()}
});
test('merchant Lux cancellation cannot return a late successful answer',async()=>{
 const f=await setup(),pending=deferred(),started=deferred(),controller=new AbortController();try{
  f.configure(()=>{started.resolve();return pending.promise});const result=f.module.merchantFetch('/api/lux',{...luxRequest,signal:controller.signal});await started.promise;controller.abort();pending.resolve(response(luxReply()));await assert.rejects(result,{name:'AbortError'});assert.equal(f.stored().merchantToken,'a'.repeat(64));
 }finally{f.cleanup()}
});
test('merchant Lux handles a malformed service reply with a focused retry',async()=>{
 const f=await setup();try{f.configure(()=>response(null));await assert.rejects(f.module.merchantFetch('/api/lux',luxRequest),/could not read a response/)}finally{f.cleanup()}
});

test('counter setup removes the owner access and refresh tokens from phone storage',async()=>{
 const f=await setup();
 try{
  f.configure(call=>{
   assert.equal(call.body.action,'merchant');
   if(call.body.path==='/api/counter/setup')return response({ok:true,counterTransport:true,counter:{id:'counter-1',locked:true},session:{role:'cashier'}});
   assert.equal(call.body.path,'/api/counter');
   assert.equal(call.options.headers.Authorization,undefined,'counter requests carry no owner JWT');
   assert.equal(call.body.merchantToken,'a'.repeat(64));
   return response({ok:true,counterTransport:true,counter:{id:'counter-1',locked:true},session:{role:'cashier'}});
  });
  await f.module.merchantFetch('/api/counter/setup',{method:'POST',body:JSON.stringify({mode:'shared'})});
  assert.equal(f.stored().counterCredential,true);
  assert.equal(f.stored().session,undefined);
  assert.equal(JSON.stringify(f.stored()).includes('a-access'),false);
  assert.equal(JSON.stringify(f.stored()).includes('a-refresh'),false);
  assert.equal((await f.module.merchantFetch('/api/counter')).status,200);
 }finally{f.cleanup()}
});

test('counter sign-out ends only the scoped merchant credential without an owner JWT call',async()=>{
 const f=await setup();
 try{
  f.configure(call=>{
   assert.equal(call.body.action,'merchant');
   if(call.body.path==='/api/counter/setup')return response({ok:true,counterTransport:true,counter:{id:'counter-1',locked:true},session:{role:'cashier'}});
   assert.equal(call.body.path,'/api/auth/logout');
   assert.equal(call.options.headers.Authorization,undefined);
   return response({ok:true,session:null,merchantToken:''});
  });
  await f.module.merchantFetch('/api/counter/setup',{method:'POST',body:'{}'});
  await f.module.merchantFetch('/api/auth/logout',{method:'POST',body:'{}'});
  assert.equal(f.stored(),null);
  assert.equal(f.calls.some(call=>call.url.includes('/auth/v1/logout')),false);
 }finally{f.cleanup()}
});
