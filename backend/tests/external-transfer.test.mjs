import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {externalRecipient,externalTransfer} from '../supabase/functions/lumo-approved/external-transfer.mjs';
import {prepareMutation,buildState,envelope} from '../supabase/functions/lumo-approved/engine.mjs';
import {createEmptyState} from '../supabase/functions/lumo-approved/domain/model.js';
import {createApprovedHandler} from '../supabase/functions/lumo-approved/handler.mjs';
Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
const actor='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222';
const repo={resolve:async userId=>({ok:true,recipient:{userId,name:'Test Person'}})};
const payload=(rail='momo')=>({rail,externalSimulation:true,providerMode:'sandbox',amount:2500,fee:rail==='momo'?50:100,recipient:{name:'Campus friend',number:rail==='momo'?'+233 24 123 4567':'1234567890123',...(rail==='momo'?{network:'MTN MoMo'}:{bank:'GCB Bank'})},category:'Food',note:'Test lunch',paymentKind:'person'});
function snapshot(balance=10000){const state=createEmptyState({name:'Test Person'});state.onboardingDone=true;state.wallet=balance;state.buffer=0;return {ok:true,account:{id:'33333333-3333-4333-8333-333333333333',userId:actor,displayName:'Test Person',balance,status:'active'},state,revision:1,receipts:[],groups:[],boxes:[],requests:[],partners:[]};}
for(const rail of ['momo','bank'])test(rail+' simulation posts principal plus exact fee to existing test funding, without a personal recipient credit',async()=>{
 const before=snapshot(),p=payload(rail),out=await prepareMutation(before,'payment',p,'sandbox-send-0001',repo);
 assert.equal(out.ok,true);assert.equal(out.state.wallet,10000-p.amount-p.fee);assert.equal(out.requiresAuth,true);assert.equal(out.intents.length,1);
 assert.deepEqual(out.intents[0].destination,{kind:'funding'});assert.equal(out.intents[0].kind,'external_simulation');assert.equal(out.intents[0].amount,2500+p.fee);assert.equal(out.intents[0].metadata.principalAmount,2500);assert.equal('amount'in out.intents[0].metadata,false,'metadata cannot overwrite the canonical journal amount');
 const tx=out.state.transactions[0];assert.equal(tx.status,'success');assert.equal(tx.amount,2500);assert.equal(tx.fee,p.fee);assert.equal(tx.externalSimulation,true);assert.equal(tx.providerMode,'sandbox');assert.equal(tx.recipient.lookupSource,'sandbox');assert.equal(out.durableState.transactions[0].simulation,true);assert.equal(before.state.wallet,10000);
 const capabilities=envelope(before).capabilities;assert.equal(capabilities.externalTransferSandbox,true);assert.equal(capabilities.bank,false);assert.equal(capabilities.momo,false);assert.equal(capabilities.bills,false);
});
test('format-only recipient labels are never presented as provider verification',()=>{
 assert.deepEqual(externalRecipient({rail:'momo',number:'0241234567',network:'mtn'}),{rail:'momo',name:'Test MoMo recipient',number:'0241234567',network:'MTN MoMo',lookupSource:'sandbox'});
 for(const network of ['Telecel Cash','AT Money'])assert.equal(externalRecipient({rail:'momo',number:'0555550124',network}).network,network,'ported phone prefix never chooses its network');
 assert.equal(externalRecipient({rail:'bank',number:'1234 5678',bank:'GCB Bank'}).number,'12345678');
});
for(const patch of [{externalSimulation:false},{externalSimulation:undefined},{providerMode:'live'},{fee:0},{fee:51},{recipient:{name:'Friend',number:'0241234567',network:'unknown'}},{recipient:{name:'Friend',number:'0311234567',network:'mtn'}},{recipient:{name:'Friend',number:'0241234567',network:'mtn',bank:'GCB'}},{requestId:'request'},{iouId:'debt'},{groupId:'group'},{shopId:'shop'},{serviceId:'electricity'},{paymentKind:'service'},{amount:0},{amount:'2500'},{amount:1.5},{amount:999951},{status:'pending'},{status:'failed'}])test('invalid or unsupported external details cannot prepare a debit: '+JSON.stringify(patch),async()=>{
 const s=snapshot(),before=JSON.stringify(s);await assert.rejects(prepareMutation(s,'payment',{...payload(),...patch},'sandbox-rejected-0001',{}));assert.equal(JSON.stringify(s),before);
});
test('exact total-debit pilot limit includes the fee',async()=>{
 for(const rail of ['momo','bank']){const p=payload(rail);p.amount=1000000-p.fee;const out=await prepareMutation(snapshot(1000000),'payment',p,'sandbox-limit-'+rail,repo);assert.equal(out.intents[0].amount,1000000);assert.equal(out.state.wallet,0)}
});
test('insufficient funds includes fee and cannot change the plan or ledger intents',async()=>{
 const p=payload(),out=await prepareMutation(snapshot(2549),'payment',p,'sandbox-no-funds',repo);assert.equal(out.ok,false);assert.match(out.result.message,/including the fee|available money/);assert.equal(out.intents,undefined);
});
test('client outcome and reference hints cannot choose a provider outcome or receipt',async()=>{
 const out=await prepareMutation(snapshot(),'payment',{...payload(),status:'success',outcome:'failed',providerResult:{status:'approved'},reference:'forged'},'sandbox-outcome-0001',repo);assert.equal(out.result.transaction.status,'success');assert.equal(out.result.transaction.reference,undefined);assert.equal(out.intents[0].metadata.reference,undefined);
});
test('canonical plan spending uses principal while savings hacks remain ledger-backed',async()=>{
 const s=snapshot(20000);s.state.budget={...s.state.budget,created:true,endDate:'2099-12-31',items:[{id:'food',name:'Food',amount:10000,spent:0}]};
 s.state.boxes=[{id:'box-roundup',name:'Books',emoji:'📚',target:10000,balance:0,archived:false,hack:{type:'roundup',value:100}}];s.boxes=[{id:'box-roundup',balance:0}];
 const out=await prepareMutation(s,'payment',{...payload(),amount:2535,budgetItemId:'food'},'sandbox-with-plan',repo);assert.equal(out.ok,true);assert.equal(out.state.budget.items[0].spent,2535);assert.equal(out.result.transaction.fee,50);
 assert.ok(out.intents.some(intent=>intent.kind==='box_save'&&intent.amount===65));assert.equal(out.state.wallet,20000-2535-50-65);
});
test('cold receipt recovery keeps principal, fee and explicit sandbox identity',()=>{
 const s=snapshot(7450);s.receipts=[{id:'journal-external',type:'external_simulation',amount:2550,principalAmount:2500,simulationFee:50,totalDebited:2550,rail:'momo',recipient:{name:'Campus friend',number:'0241234567',network:'MTN MoMo'},providerMode:'sandbox',payerAccountId:s.account.id,payeeAccountId:'funding',reference:'LUMO-EXTERNAL-TEST',createdAt:'2026-11-14T00:00:00Z'}];
 const state=buildState(s),tx=state.transactions[0];assert.equal(tx.amount,2500);assert.equal(tx.total,2550);assert.equal(tx.fee,50);assert.equal(tx.rail,'momo');assert.equal(tx.providerMode,'sandbox');assert.equal(tx.externalSimulation,true);assert.equal(tx.labelUnverified,true);assert.equal(tx.direction,'out');assert.equal(state.wallet,7450);
 const corrupt=structuredClone(s);corrupt.receipts[0].principalAmount=2600;assert.throws(()=>buildState(corrupt),{code:'UNBACKED_STATE'});
});
const bearer='x.'+Buffer.from(JSON.stringify({sub:actor,session_id:session})).toString('base64url')+'.x';
function gateway({personal=true,closed=false}={}){
 let current=snapshot(),commits=0;const attempts=new Map(),calls=[];
 if(closed){current.account.status='closed';current.state.account.status='closed'}
 const handler=createApprovedHandler({supabaseUrl:'https://external.test',serviceRoleKey:'synthetic-only',crypto:webcrypto,fetch:async(url,options)=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:actor,app_metadata:{lumo_pilot:true}});
  const body=JSON.parse(options.body);calls.push(body);
  assert.ok(url.endsWith('/rest/v1/rpc/lumo_approved_service'));const p=body.p_payload;assert.equal(p.actor,actor);assert.equal(p.session,session);
  if(!personal)return Response.json({ok:false,code:'PERSONAL_ACCOUNT_REQUIRED'});
  if(body.p_command==='load')return Response.json(current);
  if(body.p_command==='resolve')return Response.json({ok:true,recipient:{userId:actor,name:'Test Person'}});
  if(body.p_command==='attempt'){const saved=attempts.get(p.attemptId);return Response.json(saved?saved.fingerprint===p.fingerprint?{ok:true,found:true,result:saved,snapshot:current}:{ok:false,code:'IDEMPOTENCY_CONFLICT'}:{ok:true,found:false});}
  if(body.p_command==='commit'){
   if(p.pin!=='1234')return Response.json({ok:false,code:'PIN_REQUIRED'});commits++;
   current={...current,state:p.state,account:{...current.account,balance:p.state.wallet},revision:current.revision+1};const result={ok:true,result:p.result,receipts:[]};attempts.set(p.attemptId,{fingerprint:p.fingerprint,result:p.result,receipts:[]});return Response.json({...result,snapshot:current});
  }
  throw Error('Unexpected command '+body.p_command);
 }});
 const call=async(body,auth=true)=>{const response=await handler(new Request('https://gateway.test',{method:'POST',headers:{'content-type':'application/json',...(auth?{Authorization:'Bearer '+bearer}:{})},body:JSON.stringify(body)}));return response.json()};
 return {call,calls,commits:()=>commits};
}
test('read-only external destination check requires a live personal account and never creates a payment',async()=>{
 const f=gateway(),out=await f.call({action:'externalRecipient',rail:'momo',number:'0241234567',network:'mtn'});assert.equal(out.ok,true);assert.equal(out.labelUnverified,true);assert.equal(out.fee,50);assert.deepEqual(f.calls.map(x=>x.p_command),['load','resolve']);assert.equal(f.commits(),0);
 assert.equal((await gateway({personal:false}).call({action:'externalRecipient',rail:'momo',number:'0241234567',network:'mtn'})).code,'PERSONAL_ACCOUNT_REQUIRED');assert.equal((await gateway({closed:true}).call({action:'externalRecipient',rail:'momo',number:'0241234567',network:'mtn'})).code,'ACCOUNT_CLOSED');assert.equal((await f.call({action:'externalRecipient',rail:'momo',number:'0241234567',network:'mtn'},false)).code,'AUTH_REQUIRED');
});
test('existing mutation authority enforces PIN and replays one original reference',async()=>{
 const f=gateway(),body={action:'action',type:'payment',payload:payload(),attemptId:'sandbox-idempotent-0001'};
 const rejected=await f.call({...body,pin:'0000'});assert.equal(rejected.code,'PIN_REQUIRED');assert.equal(f.commits(),0);
 const one=await f.call({...body,pin:'1234'});assert.equal(one.ok,true);assert.equal(one.state.wallet,7450);const two=await f.call({...body,pin:'1234'});assert.equal(two.ok,true);assert.equal(two.replayed,true);assert.equal(f.commits(),1);
 const conflict=await f.call({...body,pin:'1234',payload:{...payload(),amount:2600}});assert.equal(conflict.code,'IDEMPOTENCY_CONFLICT');assert.equal(f.commits(),1);
});
