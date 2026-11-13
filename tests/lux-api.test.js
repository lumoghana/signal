import test from 'node:test';
import assert from 'node:assert/strict';
import { handleLux, interpretLux, safeLuxInput, luxRuntimeCredential } from '../api/lux.mjs';
import { createEmptyState } from '../dist/js/model.js';
const OWNER='11111111-1111-4111-8111-111111111111';
const request={method:'POST',authorization:'Bearer a.b.c',body:{question:'Can I afford GHS 30 lunch?',context:{questions:[]}}};
const account=()=>{const state=createEmptyState({name:'Ama'});state.wallet=20000;state.budget.created=true;return{ok:true,state,account:{userId:OWNER},sandbox:true,currency:'GHS'};};
const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
const plan={task:'afford',confidence:.98,amount:3000,alternative:null,days:null,subject:'lunch',period:null,start:null,end:null};
const provider=()=>response({choices:[{message:{content:JSON.stringify(plan)}}]});
const options=fetcher=>({fetcher:async(url,init)=>url.includes('/rpc/lumo_lux_reserve')?response({allowed:true}):fetcher(url,init),credential:'synthetic-oidc',limiter:new Map(),now:new Date('2026-11-13T12:00:00Z')});
test('hosted OIDC comes from the current invocation, separately from the customer token',()=>{
  assert.equal(luxRuntimeCredential({'x-vercel-oidc-token':'rotated-1',authorization:'Bearer customer'},{VERCEL_OIDC_TOKEN:'old-local'}),'rotated-1');
  assert.equal(luxRuntimeCredential({'x-vercel-oidc-token':'rotated-2'},{}),'rotated-2');
  assert.equal(luxRuntimeCredential({authorization:'Bearer customer'},{}),undefined);
});

test('auth and shape checks happen before inference or account reads',async()=>{
  let calls=0;const fetcher=async()=>{calls++;throw Error();};
  for(const req of [{...request,authorization:''},{...request,method:'GET'},{...request,body:{question:'x'.repeat(401)}},{...request,origin:'https://evil.test'}])assert.ok((await handleLux(req,options(fetcher))).status>=400);
  assert.equal(calls,0);
});
test('a revoked or wrong account cannot reach the provider',async()=>{
  let calls=0;const result=await handleLux(request,options(async()=>{calls++;return response({ok:false},401);}));assert.equal(result.status,401);assert.equal(calls,1);
});
test('live interpreter receives questions only and numbers come from a final authenticated snapshot',async()=>{
  const calls=[],fresh=account();fresh.state.wallet=35000;let reads=0;
  const fetcher=async(url,init)=>{calls.push({url,body:JSON.parse(init.body),headers:init.headers});if(url.includes('ai-gateway'))return provider();reads++;return response(reads===1?account():fresh);};
  const result=await handleLux(request,options(fetcher));assert.equal(result.status,200);assert.equal(result.body.mode,'ai');assert.equal(reads,2);assert.match(result.body.answer.basis[0],/GH₵350.00/);
  const prompt=JSON.stringify(calls.find(x=>x.url.includes('ai-gateway')).body.messages);assert.doesNotMatch(prompt,/wallet|35000|20000|a\.b\.c|synthetic-oidc|moneySnapshot/);assert.equal(calls.some(x=>x.body.action==='action'),false);
});
test('session revocation during inference suppresses the answer',async()=>{
  let reads=0;const result=await handleLux(request,options(async url=>url.includes('ai-gateway')?provider():++reads===1?response(account()):response({ok:false},401)));assert.equal(result.status,401);assert.equal(result.body.answer,undefined);
});
test('provider errors remain honest recorded-money answers without leaking a provider error',async()=>{
  for(const status of [401,402,403,429,500]){
    const result=await handleLux(request,options(async url=>url.includes('ai-gateway')?response({secret:'do not expose'},status):response(account())));
    assert.equal(result.body.mode,'recorded');assert.equal(result.body.answer.engine,'recorded');assert.doesNotMatch(JSON.stringify(result.body),/do not expose/);assert.ok(result.body.answer.stats.length);
  }
});
test('invented model prices, malformed JSON and arbitrary commands fall back without executing',async()=>{
  for(const content of ['not json',JSON.stringify({...plan,amount:999999}),JSON.stringify({...plan,task:'payment'})]){
    const result=await handleLux(request,options(async url=>url.includes('ai-gateway')?response({choices:[{message:{content}}]}):response(account())));assert.equal(result.body.mode,'recorded');assert.equal(result.body.answer.context.amount,3000);
  }
});
test('PINs and identity numbers are never sent for inference',async()=>{
  for(const question of ['My PIN is 1234','Ghana card GHA-123456789-0','my password: secret1234']){
    let inference=0;const result=await handleLux({...request,body:{question}},options(async url=>{if(url.includes('ai-gateway'))inference++;return response(account());}));assert.equal(inference,0);assert.equal(result.body.reason,'PRIVATE_INPUT');assert.match(result.body.answer.title,/private/);
  }
});
test('warm-instance rate limit is scoped to authenticated owner before provider cost',async()=>{
  const limiter=new Map([[OWNER,{count:12,until:Date.now()+100000}]]);let inference=0;
  const result=await handleLux(request,{...options(async url=>{if(url.includes('ai-gateway'))inference++;return response(account());}),now:new Date(),limiter});assert.equal(result.status,429);assert.equal(inference,0);
});
test('missing provider setup is explicit and never described as live AI',async()=>{
  const a=await interpretLux(safeLuxInput(request.body),{credential:''});assert.deepEqual(a,{mode:'recorded',reason:'AI_NOT_CONFIGURED'});
});
test('a private earlier question is omitted without blocking a safe new question',async()=>{
  const input=safeLuxInput({question:'Explain my balance',context:{questions:['my PIN is 1234','Can I afford lunch?']}});assert.equal(input.sensitive,false);assert.deepEqual(input.context.questions,['Can I afford lunch?']);
});
test('durable shared quota fails closed before any model request',async()=>{
  for(const data of [{allowed:false,reason:'AI_DAILY_CAP'},{allowed:false,reason:'AI_RATE_LIMITED'},{code:'RPC_FAILED'}]){
    let inference=0;const fetcher=async url=>{if(url.includes('ai-gateway')){inference++;return provider();}return url.includes('/rpc/')?response(data):response(account());};
    const r=await handleLux(request,{fetcher,credential:'synthetic-oidc',limiter:new Map()});assert.equal(r.body.mode,'recorded');assert.equal(inference,0);
  }
});
