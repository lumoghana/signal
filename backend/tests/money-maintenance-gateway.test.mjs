import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createApprovedHandler} from '../supabase/functions/lumo-maintenance/approved/handler.mjs';
import {buildState,clone,envelope,isMoneyMaintenanceAction,prepareMutation} from '../supabase/functions/lumo-maintenance/approved/engine.mjs';
import {createEmptyState} from '../supabase/functions/lumo-maintenance/approved/domain/model.js';
import {getMoneyMaintenance,prepareEssentialReuse} from '../supabase/functions/lumo-maintenance/approved/domain/money-maintenance-model.js';

Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
const actor='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222';
const other='33333333-3333-4333-8333-333333333333',otherSession='44444444-4444-4444-8444-444444444444';
const account='55555555-5555-4555-8555-555555555555',origin='https://maintenance.fixture';
const token=(userId=actor,sessionId=session)=>'x.'+Buffer.from(JSON.stringify({sub:userId,session_id:sessionId})).toString('base64url')+'.x';
function snapshot(){
 const state=createEmptyState({name:'Ama fixture',phone:'0241000001'});state.onboardingDone=true;state.wallet=10000;state.buffer=0;
 state.externalBalances=[{id:'outside-cash',type:'cash',name:'Cash in hand',balance:5000,updatedAt:'2026-11-01T12:00:00.000Z'}];
 state.budget={...state.budget,created:true,periodId:'period-current',startDate:'2026-11-01',endDate:'2026-11-30',items:[{id:'food',name:'Food',amount:5000,spent:500}]};
 state.boxes=[{id:'box-due',name:'Books',emoji:'📚',target:20000,balance:0,archived:false,hack:{type:'scheduled',value:100,frequency:'daily',nextRun:new Date().toISOString().slice(0,10),monthlyCap:500,floor:0}}];
 return {ok:true,account:{id:account,userId:actor,handle:'ama.fixture',displayName:'Ama fixture',balance:10000,status:'active',currency:'GHS'},phone:'0241000001',state,revision:3,receipts:[],groups:[],boxes:[{id:'box-due',balance:0}],requests:[],partners:[]};
}
function unchangedMoney(saved,prepared){
 assert.equal(prepared.ok,true,prepared.result?.message);assert.equal(prepared.requiresAuth,false);
 assert.equal(prepared.state.wallet,saved.account.balance);assert.equal(prepared.expectedWallet,saved.account.balance);
 for(const key of ['intents','groups','boxes','requests','partners','privateReports'])assert.deepEqual(prepared[key],[],key+' stays outside a maintenance save');
 assert.deepEqual(prepared.state.transactions,buildState(saved).transactions);
 assert.deepEqual(prepared.state.boxes,buildState(saved).boxes);
 assert.deepEqual(prepared.state.income,buildState(saved).income);
 assert.equal(prepared.durableState.settings.pin,undefined);
}
const prepare=(saved,type,payload={},attemptId='maintenance-original-0001')=>prepareMutation(saved,type,payload,attemptId,{});

test('maintenance action allowlist is exact and seven record updates cannot post shared money',async()=>{
 const cases=[
  ['externalMovement',{id:'outside-cash',direction:'out',amount:1000,expectedRevision:0,budgetItemId:'food'}],
  ['confirmExternalBalance',{id:'outside-cash',balance:4750,expectedRevision:0}],
  ['saveCommitment',{name:'Printing',amount:2000,recurring:false,expectedRevision:0}],
  ['setEssentialRecurring',{id:'food',recurring:true}],
  ['setMaintenancePreferences',{experience:'minimal',checkDay:2}],
  ['completeMoneyCheck',{}],
 ];
 for(const [type,payload]of cases){assert.equal(isMoneyMaintenanceAction(type),true);const saved=snapshot(),original=JSON.stringify(saved),out=await prepare(saved,type,payload);unchangedMoney(saved,out);assert.equal(JSON.stringify(saved),original,'source snapshot is immutable');}
 const saved=snapshot(),state=buildState(saved),reuse=prepareEssentialReuse(state);
 assert.equal(isMoneyMaintenanceAction('reuseEssentialPlan'),true);
 const {sourcePeriodId,sourceFingerprint,expectedRevision,startDate,endDate,buffer}=reuse;
 const out=await prepare(saved,'reuseEssentialPlan',{sourcePeriodId,sourceFingerprint,expectedRevision,startDate,endDate,buffer,items:[...reuse.items,...reuse.oneOffItems],includeOneOffIds:['food']});unchangedMoney(saved,out);
 assert.equal(isMoneyMaintenanceAction('fund'),false);assert.equal(isMoneyMaintenanceAction('constructor'),false);assert.equal(isMoneyMaintenanceAction('__proto__'),false);
});

test('outside movements use only the owner record and stale baselines never overwrite it',async()=>{
 const saved=snapshot(),out=await prepare(saved,'externalMovement',{externalBalanceId:'outside-cash',direction:'out',amount:1000,expectedRevision:0,expectedBalance:5000,budgetItemId:'food'});
 unchangedMoney(saved,out);assert.equal(out.state.externalBalances[0].balance,4000);assert.equal(out.state.budget.items[0].spent,1500);
 assert.equal(out.state.externalBalances[0].confirmedAt,'2026-11-01T12:00:00.000Z','a remembered movement does not pretend the remaining balance was independently checked');
 assert.equal(out.state.externalBalances[0].revision,1);
 assert.ok(out.state.externalBalanceHistory.length>0);
 const persisted={...saved,state:clone(out.durableState),revision:4};
 const stale=await prepare(persisted,'externalMovement',{id:'outside-cash',direction:'out',amount:1000,expectedRevision:0});assert.equal(stale.ok,false);assert.equal(stale.state.externalBalances[0].balance,4000);
 for(const payload of [
  {id:'another-users-record',direction:'out',amount:1000,expectedRevision:0},
  {id:'outside-cash',direction:'out',amount:5001,expectedRevision:0},
  {id:'outside-cash',direction:'out',amount:1000},
  {id:'outside-cash',direction:'out',amount:1000,expectedRevision:0,expectedBalance:4999},
  {id:'outside-cash',direction:'out',amount:1000,expectedUpdatedAt:'2026-11-02T00:00:00Z'},
 ]){const rejected=await prepare(saved,'externalMovement',payload);assert.equal(rejected.ok,false,JSON.stringify(payload));assert.deepEqual(rejected.state.externalBalances,buildState(saved).externalBalances);}
});

test('outside confirmation refreshes its manual timestamp without changing wallet or unrelated essentials',async()=>{
 const saved=snapshot(),out=await prepare(saved,'confirmExternalBalance',{id:'outside-cash',balance:4800,expectedUpdatedAt:'2026-11-01T12:00:00.000Z'});
 unchangedMoney(saved,out);assert.equal(out.state.externalBalances[0].balance,4800);assert.notEqual(out.state.externalBalances[0].confirmedAt,'2026-11-01T12:00:00.000Z');assert.deepEqual(out.state.budget,saved.state.budget);
 const fresh={...saved,state:clone(out.durableState)};
 const stale=await prepare(fresh,'confirmExternalBalance',{id:'outside-cash',balance:4900,expectedRevision:0});assert.equal(stale.ok,false);assert.equal(stale.state.externalBalances[0].balance,4800);
});

test('a plan rollover cannot redirect a reviewed outside expense or commitment into another period',async()=>{
 const saved=snapshot(),expectedPlanFingerprint=getMoneyMaintenance(buildState(saved)).planFingerprint;
 const changed=clone(saved);changed.state.budget.periodId='new-period';
 for(const [type,payload]of [
  ['externalMovement',{id:'outside-cash',direction:'out',amount:1000,expectedRevision:0,budgetItemId:'food',expectedPlanFingerprint}],
  ['saveCommitment',{name:'Printing',amount:1000,expectedRevision:0,expectedPlanFingerprint}],
 ]){const rejected=await prepare(changed,type,payload);assert.equal(rejected.ok,false);assert.equal(rejected.state.budget.items[0].spent,500);assert.equal(rejected.state.externalBalances[0].balance,5000);}
 const accepted=await prepare(saved,'externalMovement',{id:'outside-cash',direction:'out',amount:1000,expectedRevision:0,budgetItemId:'food',expectedPlanFingerprint});unchangedMoney(saved,accepted);
});

test('the existing absolute outside-balance editor honors the same supplied revision guard',async()=>{
 const saved=snapshot(),updated=await prepare(saved,'updateExternalBalance',{id:'outside-cash',type:'cash',name:'Cash in hand',balance:4800,expectedRevision:0,expectedUpdatedAt:'2026-11-01T12:00:00.000Z'});
 assert.equal(updated.ok,true,updated.result?.message);assert.equal(updated.state.wallet,10000);assert.deepEqual(updated.intents,[]);assert.equal(updated.state.externalBalances[0].revision,1);
 const stale=await prepare({...saved,state:clone(updated.durableState)},'updateExternalBalance',{id:'outside-cash',balance:4900,expectedRevision:0});assert.equal(stale.ok,false);assert.equal(stale.state.externalBalances[0].balance,4800);
});

test('commitment saves retain recorded spending and reused plans require the current source fingerprint',async()=>{
 const saved=snapshot(),out=await prepare(saved,'saveCommitment',{name:'Food',amount:2000,expectedRevision:0});
 unchangedMoney(saved,out);assert.equal(out.state.budget.items[0].amount,7000);assert.equal(out.state.budget.items[0].spent,500);
 const updated={...saved,state:clone(out.durableState),revision:4};
 assert.equal((await prepare(updated,'saveCommitment',{name:'Printing',amount:1000,expectedRevision:0})).ok,false,'old planning review cannot overwrite a newer maintenance revision');
 const reuse=prepareEssentialReuse(buildState(saved)),{sourcePeriodId,sourceFingerprint,expectedRevision,startDate,endDate,buffer}=reuse;
 const payload={sourcePeriodId,sourceFingerprint,expectedRevision,startDate,endDate,buffer,items:[...reuse.items,...reuse.oneOffItems],includeOneOffIds:['food']};
 assert.equal((await prepare(updated,'reuseEssentialPlan',payload)).ok,false,'old source fingerprint and revision cannot replace a changed current plan');
 const changed=clone(saved);changed.state.budget.items[0].spent=600;
 assert.equal((await prepare(changed,'reuseEssentialPlan',payload)).ok,false,'even without a metadata revision bump, newly recorded spending invalidates the source fingerprint');
 const valid=await prepare(saved,'reuseEssentialPlan',payload);unchangedMoney(saved,valid);assert.equal(valid.state.budget.items[0].spent,0);assert.notEqual(valid.state.budget.items[0].id,'food');
 assert.equal(valid.state.budgetHistory[0].items[0].spent,500,'old spending remains in its original period');
});

test('unapproved writable fields and top-level ownership hints cannot enter maintenance state',async()=>{
 for(const [type,payload]of [
  ['externalMovement',{id:'outside-cash',direction:'out',amount:100,expectedRevision:0,wallet:100000}],
  ['confirmExternalBalance',{id:'outside-cash',balance:100,expectedRevision:0,userId:other}],
  ['saveCommitment',{name:'Food',amount:100,spent:0}],
  ['setEssentialRecurring',{id:'food',recurring:true,actorId:'me'}],
  ['setMaintenancePreferences',{experience:'minimal',settings:{pin:'9999'}}],
  ['completeMoneyCheck',{state:{wallet:100000}}],
  ['reuseEssentialPlan',{sourcePeriodId:'period-current',state:{}}],
  ['externalMovement',{id:'outside-cash',externalBalanceId:'different-record',direction:'out',amount:100,expectedRevision:0}],
  ['saveCommitment',{name:{unexpected:'object'},amount:100}],
 ])await assert.rejects(prepare(snapshot(),type,payload),error=>error.code==='INVALID_INPUT'&&error.noMutation===true);
});

function gateway({conflictOnce=false,closed=false,sessionRejected=false}={}){
 let current=snapshot(),commits=0,conflicted=false;const calls=[],attempts=new Map();
 if(closed){current.account.status='closed';current.state.account.status='closed';}
 const handler=createApprovedHandler({supabaseUrl:'https://maintenance.supabase.fixture',serviceRoleKey:'fixture-server-only',allowedOrigins:[origin],crypto:webcrypto,fetch:async(url,init)=>{
  const path=new URL(url).pathname;
  if(path==='/auth/v1/user')return Response.json({id:actor,app_metadata:{lumo_pilot:true}});
  assert.equal(path,'/rest/v1/rpc/lumo_approved_service');const body=JSON.parse(init.body),p=body.p_payload;calls.push(body);
  assert.equal(p.actor,actor,'verified Auth identity controls RPC actor');assert.equal(p.session,session,'verified session controls RPC scope');
  if(sessionRejected)return Response.json({ok:false,code:'SESSION_REVOKED'});
  if(body.p_command==='attempt'){const old=attempts.get(p.attemptId);return Response.json(!old?{ok:true,found:false}:old.fingerprint!==p.fingerprint?{ok:false,code:'IDEMPOTENCY_CONFLICT'}:{ok:true,found:true,snapshot:current,result:{result:old.result,receipts:[]}});}
  if(body.p_command==='load')return Response.json(current);
  if(body.p_command==='commit'){
   assert.equal(p.requiresAuth,false);assert.deepEqual(p.intents,[]);assert.deepEqual(p.boxes,[]);assert.equal(p.expectedWallet,10000);assert.equal(p.state.wallet,10000);
   if(conflictOnce&&!conflicted){conflicted=true;current={...current,revision:current.revision+1};return Response.json({ok:false,code:'REVISION_CONFLICT'});}
   if(p.expectedRevision!==current.revision)return Response.json({ok:false,code:'REVISION_CONFLICT'});
   commits++;current={...current,state:clone(p.state),revision:current.revision+1};attempts.set(p.attemptId,{fingerprint:p.fingerprint,result:p.result});return Response.json({ok:true,result:p.result,snapshot:current,receipts:[]});
  }
  throw Error('Unexpected command '+body.p_command);
 }});
 const call=async(body,{auth=token()}={})=>{const response=await handler(new Request(origin,{method:'POST',headers:{'content-type':'application/json',Origin:origin,...(auth?{authorization:'Bearer '+auth}:{})},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()};};
 return {call,calls,commits:()=>commits,state:()=>current};
}
const movement={action:'action',type:'externalMovement',payload:{id:'outside-cash',direction:'out',amount:1000,expectedRevision:0,budgetItemId:'food'},attemptId:'outside-movement-original'};

test('signed-in HTTP maintenance saves skip automatic savings and recover the original attempt exactly once',async()=>{
 const f=gateway(),one=await f.call(movement);assert.equal(one.body.ok,true,one.body.message);assert.equal(one.body.state.externalBalances[0].balance,4000);assert.equal(one.body.state.wallet,10000);assert.equal(one.body.state.boxes[0].balance,0);
 assert.equal(f.commits(),1);assert.ok(f.calls.every(c=>!c.p_payload.attemptId?.startsWith('automatic-')),'metadata writes do not run a due saving rule');
 const replay=await f.call(movement);assert.equal(replay.body.replayed,true);assert.equal(f.commits(),1);assert.equal(replay.body.state.budget.items[0].spent,1500);
 const recover=await f.call({...movement,action:'recover'});assert.equal(recover.body.found,true);assert.equal(recover.body.replayed,true);assert.equal(f.commits(),1);
 const conflict=await f.call({...movement,payload:{...movement.payload,amount:1100}});assert.equal(conflict.body.code,'IDEMPOTENCY_CONFLICT');assert.equal(f.commits(),1);
 const refreshed=envelope(f.state());assert.equal(refreshed.state.moneyMaintenance.revision,1);assert.equal(refreshed.state.externalBalances[0].balance,4000);assert.equal(refreshed.state.settings.pin,undefined);
});

test('a revision race retries current owner state without duplicating the recorded movement',async()=>{
 const f=gateway({conflictOnce:true}),out=await f.call(movement);assert.equal(out.body.ok,true,out.body.message);assert.equal(f.commits(),1);assert.equal(out.body.state.externalBalances[0].balance,4000);assert.equal(out.body.state.budget.items[0].spent,1500);
 assert.equal(f.calls.filter(c=>c.p_command==='commit').length,2);
});

test('unauthenticated, changed-owner, revoked-session and closed-account requests cannot save metadata',async()=>{
 const f=gateway();assert.equal((await f.call(movement,{auth:''})).body.code,'AUTH_REQUIRED');
 assert.equal((await f.call(movement,{auth:token(other,otherSession)})).body.code,'AUTH_REQUIRED');
 const revoked=gateway({sessionRejected:true});assert.equal((await revoked.call(movement)).body.code,'SESSION_REVOKED');assert.equal(revoked.commits(),0);
 const closed=gateway({closed:true}),out=await closed.call(movement);assert.equal(out.body.ok,false);assert.match(out.body.message,/closed/i);assert.equal(closed.commits(),0);assert.equal(out.body.noMutation,true);
 const forged=await f.call({...movement,actor:other});assert.equal(forged.body.code,'INVALID_INPUT');assert.equal(f.commits(),0);
});
