import test from 'node:test';
import assert from 'node:assert/strict';
import {bindPayments,renderPayments,openSharedMerchant,prepareIOURepayment,hasUnresolvedPayment} from '../dist/js/payments.js';
import {createEmptyState} from '../dist/js/model.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 const handlers=new Map(),messages=[],calls=[],routes=[],controls=new Map();
 const state=createEmptyState();state.onboardingDone=true;state.wallet=100000;
 const payment={rail:'lumo',recipient:{handle:'other.student',name:'Other Student'},amount:1000,category:'Other',note:'Lunch',idempotencyKey:'original-reviewed-reference'};
 const ctx={state,draft:{payment},route:{section:'pay',page:'review'},connected:true,shared:{user:{id:'owner-one'},authVersion:1,account:{handle:'owner.student'},resolve:async()=>({ok:true,recipient:{handle:'other.student',name:'Other Student'}})},
  $(selector){return null},$$(selector){return[{addEventListener(type,callback){handlers.set(selector,callback)}}]},setCapture(){},saveDraft(){},refresh(){},closeSheet(){},toast:value=>messages.push(value),go(route){routes.push(route);ctx.route=route},finish(route){routes.push(route);ctx.route=route},auth({onSuccess}){calls.push('auth');return onSuccess()},
  sheet(html,bind,options){ctx.lastSheet={html,options};bind({querySelector(selector){if(!controls.has(selector))controls.set(selector,{});return controls.get(selector)}})},
  actAsync:async(type,payload)=>{calls.push({type,payload:structuredClone(payload)});return {ok:false,unknown:true,attemptId:'original-server-attempt',message:'Result not yet confirmed'}},
 };
 const bind=()=>{handlers.clear();bindPayments(ctx,ctx.route)};
 const click=async action=>{const callback=handlers.get(`[data-action="${action}"]`);assert.ok(callback,action+' is bound');callback();await tick();await tick()};
 return {ctx,payment,calls,messages,routes,controls,bind,click};
}

test('unknown payment keeps the reviewed request, prevents replacement and checks the same payload after restart',async()=>{
 const h=harness();h.bind();await h.click('pay-review-next');
 assert.equal(hasUnresolvedPayment(h.ctx.draft.payment),true);assert.equal(h.payment.submissionAttemptId,'original-server-attempt');
 const sent=h.calls.find(value=>typeof value==='object').payload;
 assert.equal(sent.idempotencyKey,'original-reviewed-reference');assert.equal(sent.submissionState,undefined);
 const html=renderPayments(h.ctx,h.ctx.route);assert.match(html,/may already have completed/);assert.match(html,/original-server-attempt/);assert.doesNotMatch(html,/Edit amount|Start a new payment|No money moved/);
 let quoted=0;h.ctx.shared.quote=async()=>{quoted++;return {ok:true}};
 await openSharedMerchant(h.ctx,'LUM100001');assert.equal(quoted,0);assert.equal(h.ctx.draft.payment,h.payment);
 assert.equal(prepareIOURepayment(h.ctx,{id:'not-a-new-payment'},1000),false);
 // A page restart retains the frozen request and original server reference, not an in-memory busy flag.
 h.ctx.draft.payment=JSON.parse(JSON.stringify(h.payment));const restored=h.ctx.draft.payment;
 h.ctx.actAsync=async(type,payload)=>{h.calls.push({type,payload:structuredClone(payload)});return {ok:true,transaction:{id:'one-receipt',type:'payment',status:'success',amount:1000,merchant:'Other Student'}}};
 h.bind();await h.click('pay-check-original');
 const actions=h.calls.filter(value=>typeof value==='object');assert.equal(actions.length,2);assert.deepEqual(actions[1].payload,sent);
 assert.equal(restored.completed,true);assert.equal(restored.lastTransactionId,'one-receipt');assert.equal(hasUnresolvedPayment(restored),false);assert.equal(h.routes.at(-1).id,'one-receipt');
});

test('a submitted request remains guarded during response loss and repeated checks are single-flight',async()=>{
 const h=harness();let complete;h.ctx.actAsync=async(type,payload)=>{h.calls.push({type,payload});return new Promise(resolve=>{complete=resolve})};
 h.bind();await h.click('pay-review-next');assert.equal(h.payment.submissionState,'submitting');
 // The old page's cancel handler may already be queued when the submission starts.
 await h.click('pay-cancel');assert.match(h.messages.at(-1),/result still needs confirmation/);assert.doesNotMatch(h.messages.at(-1),/No money moved/);
 h.ctx.route={section:'pay',page:'review'};h.bind();await h.click('pay-check-original');await h.click('pay-check-original');
 assert.equal(h.calls.filter(value=>value==='auth').length,1);assert.equal(h.calls.filter(value=>typeof value==='object').length,1);
 complete({ok:false,unknown:true,message:'Still checking'});await tick();assert.equal(h.payment.submissionState,'unknown');
});

test('a definitive rejection releases editing with a fresh reference, without inventing a receipt',async()=>{
 const h=harness();h.ctx.actAsync=async()=>({ok:false,unknown:false,code:'INSUFFICIENT_FUNDS',message:'Not enough money'});
 h.bind();await h.click('pay-review-next');assert.equal(hasUnresolvedPayment(h.payment),false);assert.equal(h.payment.submittedPayload,undefined);
 assert.notEqual(h.payment.idempotencyKey,'original-reviewed-reference');assert.equal(h.ctx.draft.lastPayment,undefined);assert.match(h.messages.at(-1),/Not enough/);
});

test('an unresolved request cannot be submitted with another account, an unproven legacy owner, or a late PIN callback',async()=>{
 for(const owner of ['different-owner',undefined]){
  const h=harness();Object.assign(h.payment,{submissionState:'unknown',submissionOwnerId:owner,submittedPayload:{rail:'lumo',recipient:{name:'Private original name'},amount:1000,idempotencyKey:h.payment.idempotencyKey}});
  h.bind();await h.click('pay-check-original');assert.equal(h.calls.length,0);
  const html=renderPayments(h.ctx,h.ctx.route);assert.match(html,/Use the original account/);assert.doesNotMatch(html,/Private original name|GH₵10\.00/);
 }
 const h=harness();Object.assign(h.payment,{submissionState:'unknown',submissionOwnerId:'owner-one',submittedPayload:{rail:'lumo',amount:1000,idempotencyKey:h.payment.idempotencyKey}});
 let approved;h.ctx.auth=({onSuccess})=>{approved=onSuccess};h.bind();await h.click('pay-check-original');
 h.ctx.shared.user={id:'owner-two'};h.ctx.shared.authVersion++;await approved();assert.equal(h.calls.length,0);
});

test('a request is not sent if its owner-scoped recovery record cannot be saved',async()=>{
 const h=harness();h.ctx.savePaymentRecovery=()=>false;h.bind();await h.click('pay-review-next');
 assert.equal(h.calls.filter(value=>typeof value==='object').length,0);assert.equal(hasUnresolvedPayment(h.payment),false);assert.match(h.messages.at(-1),/No new request was sent/);
});

const quote={ok:true,merchant:{name:'Campus Kitchen'},shop:{id:'11111111-1111-4111-8111-111111111111',name:'Night Market counter',code:'LUM100001',area:'Night Market'},request:{id:'22222222-2222-4222-8222-222222222222',amount:2500,note:'Lunch'}};
test('a merchant quote cannot navigate or replace a draft after the page, account or scan changes',async()=>{
 for(const change of ['route','account','scan','draft']){
  const h=harness();let finish,current=true;h.ctx.shared.quote=()=>new Promise(resolve=>{finish=resolve});
  const operation=openSharedMerchant(h.ctx,'LUM100001',{isCurrent:()=>current});
  if(change==='route')h.ctx.route={section:'plan',page:'home'};
  if(change==='account')h.ctx.shared.authVersion++;
  if(change==='scan')current=false;
  if(change==='draft')h.ctx.draft.payment={...h.payment,note:'Newer work'};
  const before=h.ctx.draft.payment;finish(quote);const result=await operation;
  assert.equal(result.cancelled,true);assert.equal(h.ctx.draft.payment,before);assert.equal(h.routes.length,0);
 }
});

test('a merchant asks before replacing saved work and review displays the quoted receiving shop',async()=>{
 const h=harness();h.ctx.shared.quote=async()=>quote;await openSharedMerchant(h.ctx,'LUM100001');
 assert.equal(h.ctx.draft.payment,h.payment);assert.match(h.ctx.lastSheet.html,/unfinished payment is saved/);assert.equal(h.routes.length,0);
 h.controls.get('[data-action="merchant-use-payment"]').onclick();
 assert.equal(h.ctx.draft.payment.rail,'merchant');assert.equal(h.ctx.draft.payment.amount,2500);
 const html=renderPayments(h.ctx,h.ctx.route);assert.match(html,/Night Market counter/);assert.match(html,/LUM100001/);assert.match(html,/The merchant confirmed this exact amount/);
});
