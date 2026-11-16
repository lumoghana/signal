import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createMaintenanceHandler,MAINTENANCE_ORIGINS,MAINTENANCE_TYPES} from '../supabase/functions/lumo-maintenance/handler.mjs';
import {createEmptyState} from '../supabase/functions/lumo-maintenance/approved/domain/model.js';
import {buildState} from '../supabase/functions/lumo-maintenance/approved/engine.mjs';
import {prepareEssentialReuse} from '../supabase/functions/lumo-maintenance/approved/domain/money-maintenance-model.js';

Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
const actor='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222';
const token='x.'+Buffer.from(JSON.stringify({sub:actor,session_id:session})).toString('base64url')+'.x';
const origin=MAINTENANCE_ORIGINS[0],functionUrl='https://maintenance.supabase.fixture/functions/v1/lumo-maintenance';
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const state=createEmptyState({name:'Maintenance fixture'});state.onboardingDone=true;state.wallet=10000;state.buffer=0;
 state.externalBalances=[{id:'cash-fixture',type:'cash',name:'Cash fixture',balance:5000,updatedAt:'2026-11-01T12:00:00.000Z'}];
 state.budget={...state.budget,created:true,periodId:'fixture-plan',items:[{id:'food-fixture',name:'Food',amount:5000,spent:500}]};
 state.boxes=[{id:'due-box-fixture',name:'Books',emoji:'📚',target:20000,balance:0,archived:false,hack:{type:'scheduled',value:100,frequency:'daily',nextRun:new Date().toISOString().slice(0,10),monthlyCap:500,floor:0}}];
 let snapshot={ok:true,account:{id:'33333333-3333-4333-8333-333333333333',userId:actor,displayName:'Maintenance fixture',handle:'maintenance.fixture',balance:10000,status:'active',currency:'GHS'},state,revision:1,receipts:[],groups:[],boxes:[{id:'due-box-fixture',balance:0}],requests:[],partners:[]};
 const calls=[],attempts=new Map();let commits=0;
 const handler=createMaintenanceHandler({supabaseUrl:'https://maintenance.supabase.fixture',serviceRoleKey:'fixture-server-only',crypto:webcrypto,fetch:async(url,init)=>{
  const path=new URL(url).pathname,body=init.body?JSON.parse(init.body):null;calls.push({path,body});
  if(path==='/auth/v1/user')return Response.json({id:actor,app_metadata:{lumo_pilot:true}});
  assert.equal(path,'/rest/v1/rpc/lumo_approved_service');const p=body.p_payload;
  assert.equal(p.actor,actor);assert.equal(p.session,session);
  assert.ok(['load','attempt','commit'].includes(body.p_command),'No provider, money, auth-write or merchant RPC is reachable');
  if(body.p_command==='load')return Response.json(snapshot);
  if(body.p_command==='attempt'){
   const previous=attempts.get(p.attemptId);return Response.json(!previous?{ok:true,found:false}:previous.fingerprint!==p.fingerprint?{ok:false,code:'IDEMPOTENCY_CONFLICT'}:{ok:true,found:true,snapshot,result:{result:previous.result,receipts:[]}});
  }
  assert.equal(p.requiresAuth,false);assert.equal(p.expectedWallet,10000);assert.equal(p.state.wallet,10000);assert.equal(p.closeAccount,false);assert.equal(p.profileChange,null);
  for(const key of ['intents','groups','boxes','requests','partners','privateReports'])assert.deepEqual(p[key],[],key+' must remain empty');
  assert.equal(p.state.boxes[0].balance,0,'A record update does not run a saving rule');
  assert.deepEqual(p.state.transactions,snapshot.state.transactions);assert.equal(p.state.settings.pin,undefined);
  snapshot={...snapshot,state:clone(p.state),revision:snapshot.revision+1};commits++;attempts.set(p.attemptId,{fingerprint:p.fingerprint,result:p.result});return Response.json({ok:true,result:p.result,snapshot,receipts:[]});
 }});
 const request=async(body,{method='POST',requestOrigin=origin,auth=token,contentType='application/json'}={})=>{
  const headers={...(requestOrigin?{Origin:requestOrigin}:{}),...(auth?{Authorization:'Bearer '+auth}:{}),...(contentType?{'Content-Type':contentType}:{})};
  const response=await handler(new Request(functionUrl,{method,headers,...(!['GET','HEAD','OPTIONS'].includes(method)?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}));
  return {status:response.status,headers:response.headers,body:response.status===204?null:await response.json()};
 };
 return {request,calls,commits:()=>commits,snapshot:()=>snapshot};
}
const requestFor=(type,payload={})=>({action:'action',type,payload,attemptId:'isolated-'+type+'-original'});

test('standalone maintenance allows exactly seven record types and preserves the deployed financial gateway boundary',async()=>{
 assert.deepEqual([...MAINTENANCE_TYPES].sort(),['completeMoneyCheck','confirmExternalBalance','externalMovement','reuseEssentialPlan','saveCommitment','setEssentialRecurring','setMaintenancePreferences']);
 const cases=[
  ['externalMovement',{id:'cash-fixture',direction:'out',amount:1000,expectedRevision:0,budgetItemId:'food-fixture'}],
  ['confirmExternalBalance',{id:'cash-fixture',balance:4700,expectedRevision:0}],
  ['saveCommitment',{name:'Printing',amount:1000,expectedRevision:0}],
  ['setEssentialRecurring',{id:'food-fixture',recurring:true}],
  ['setMaintenancePreferences',{experience:'minimal',checkDay:1}],
  ['completeMoneyCheck',{}],
 ];
 for(const [type,payload]of cases){const f=fixture(),out=await f.request(requestFor(type,payload));assert.equal(out.body.ok,true,type+': '+out.body.message);assert.equal(f.commits(),1);assert.equal(out.body.state.wallet,10000);assert.deepEqual(out.body.postedReceipts,[]);}
 const f=fixture(),review=prepareEssentialReuse(buildState(f.snapshot())),{sourcePeriodId,sourceFingerprint,expectedRevision,startDate,endDate,buffer}=review;
 const reuse=await f.request(requestFor('reuseEssentialPlan',{sourcePeriodId,sourceFingerprint,expectedRevision,startDate,endDate,buffer,items:[...review.items,...review.oneOffItems],includeOneOffIds:['food-fixture']}));assert.equal(reuse.body.ok,true,reuse.body.message);assert.equal(f.commits(),1);
});

test('all authentication, financial, merchant, admin and arbitrary gateway routes stop before any upstream call',async()=>{
 const blocked=[
  ...['register','login','merchant','guestCheckout','snapshot','serviceStatus','externalRecipient','resolve','quote','verifyPin','changePin','changeCredentials','registerDevice','challenge','partnerInbox','partnerRespond','caseInbox','admin'].map(action=>({action})),
  ...['payment','fund','contributeBox','withdrawBox','contributeGroup','executePayout','accountClose','accountStartRecovery','runAutomaticSavings','constructor','__proto__'].map(type=>requestFor(type,{})),
  {action:'recover',type:'payment',payload:{},attemptId:'financial-recovery-blocked'},
 ];
 const f=fixture();for(const body of blocked){const out=await f.request(body);assert.equal(out.status,400,JSON.stringify(body));assert.equal(out.body.code,'MAINTENANCE_ACTION_REQUIRED');assert.equal(out.body.noMutation,true);}
 assert.deepEqual(f.calls,[]);assert.equal(f.commits(),0);
});

test('strict envelopes, unsupported origins and invalid methods cannot reach reused code',async()=>{
 const f=fixture(),base=requestFor('completeMoneyCheck');
 for(const body of [{...base,pin:'1234'},{...base,deviceProof:{}},{...base,actor:'another-owner'},{...base,payload:[]},{...base,attemptId:'short'},[],null]){
  const out=await f.request(body);assert.equal(out.body.code,'MAINTENANCE_ACTION_REQUIRED');
 }
 assert.equal((await f.request(base,{requestOrigin:'https://merchant.unlisted.example'})).status,403);
 assert.equal((await f.request(base,{method:'GET'})).status,405);
 assert.equal((await f.request(base,{contentType:'text/plain'})).body.code,'INVALID_INPUT');
 assert.equal((await f.request('{invalid-json')).body.code,'INVALID_INPUT');
 assert.equal((await f.request(JSON.stringify({...base,payload:{text:'x'.repeat(140000)}}))).status,413);
 assert.deepEqual(f.calls,[]);
 const cors=await f.request(null,{method:'OPTIONS'});assert.equal(cors.status,204);assert.equal(cors.headers.get('access-control-allow-origin'),origin);assert.deepEqual(f.calls,[]);
});

test('native no-Origin calls remain authenticated and original metadata references recover read-only',async()=>{
 const f=fixture(),body=requestFor('externalMovement',{id:'cash-fixture',direction:'out',amount:1000,expectedRevision:0});
 const denied=await f.request(body,{requestOrigin:null,auth:''});assert.equal(denied.body.code,'AUTH_REQUIRED');assert.equal(f.commits(),0);
 const one=await f.request(body,{requestOrigin:null});assert.equal(one.body.ok,true);assert.equal(one.body.state.externalBalances[0].balance,4000);
 const replay=await f.request(body,{requestOrigin:null});assert.equal(replay.body.replayed,true);assert.equal(f.commits(),1);
 const recovered=await f.request({...body,action:'recover'},{requestOrigin:null});assert.equal(recovered.body.found,true);assert.equal(recovered.body.replayed,true);assert.equal(f.commits(),1);
 const absent=await f.request({...body,action:'recover',attemptId:'metadata-never-submitted'},{requestOrigin:null});assert.equal(absent.body.found,false);assert.equal(f.commits(),1);
 const changed=await f.request({...body,action:'recover',payload:{...body.payload,amount:1100}},{requestOrigin:null});assert.equal(changed.body.code,'IDEMPOTENCY_CONFLICT');assert.equal(f.commits(),1);
});

test('allowed action names cannot smuggle ledger instructions through their payloads',async()=>{
 const f=fixture(),out=await f.request(requestFor('completeMoneyCheck',{wallet:100000,intents:[{kind:'test_funding',amount:100000}]}));
 assert.equal(out.body.ok,false);assert.equal(out.body.code,'INVALID_INPUT');assert.equal(out.body.noMutation,true);assert.equal(f.commits(),0);assert.equal(f.snapshot().account.balance,10000);
});

test('isolated dependencies retain baseline plus explicit maintenance/audit deltas and exclude merchant code',async()=>{
 const base=new URL('../supabase/functions/lumo-maintenance/',import.meta.url),sourceBase=new URL('../supabase/functions/lumo-approved/',import.meta.url);
 const baseline=JSON.parse(await readFile(new URL('../verification/maintenance-2.12.0/approved18-baseline-sha256.json',import.meta.url),'utf8'));
 const delta=JSON.parse(await readFile(new URL('../verification/maintenance-2.12.0/approved-release-delta.json',import.meta.url),'utf8'));
 const audit=JSON.parse(await readFile(new URL('../verification/audit-2026-11-16/reviewed-source-delta.json',import.meta.url),'utf8'));
 const auditMain=audit.functions['lumo-approved'],auditMaintenance=audit.functions['lumo-maintenance'];
 assert.deepEqual(Object.keys(auditMaintenance.deltas),['approved/engine.mjs']);
 const closure=new Set();
 async function visit(name){
  if(closure.has(name))return;closure.add(name);const url=new URL(name,base),bytes=await readFile(url),source=bytes.toString('utf8');
  if(name.startsWith('approved/')){
   const original=name.slice('approved/'.length);assert.ok(!original.startsWith('merchant/'));assert.notEqual(original,'index.ts');assert.notEqual(original,'operations.mjs');
   assert.equal(createHash('sha256').update(bytes).digest('hex'),auditMaintenance.deltas[name]?.afterSha256||delta.files[original]||baseline.files[original],name+' must retain explicitly reviewed source bytes');
   if(!Object.hasOwn(delta.files,original)&&!Object.hasOwn(auditMain.deltas,original))assert.deepEqual(bytes,await readFile(new URL(original,sourceBase)));
  }
  const imports=[...source.matchAll(/^\s*(?:import|export)\s+(?:type\s+)?(?:(?:\*\s+as\s+[$\w]+|\*|\{[^}]*\}|[$\w]+(?:\s*,\s*\{[^}]*\})?)\s+from\s*)?["']([^"']+)["']/gm)].map(match=>match[1]);
  for(const specifier of imports){assert.ok(specifier.startsWith('.'));const dependency=new URL(specifier,url);assert.ok(dependency.href.startsWith(base.href));await visit(decodeURIComponent(dependency.href.slice(base.href.length)));}
 }
 await visit('index.ts');assert.equal(closure.size,31);assert.equal([...closure].filter(name=>name.startsWith('approved/')).length,29);
 assert.equal(closure.has('approved/domain/partner-code.js'),false);
});
