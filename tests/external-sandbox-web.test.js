import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmptyState} from '../dist/js/model.js';
import {renderPayments,bindPayments,paymentReceiptText} from '../dist/js/payments.js';
import {renderPaymentsHub,bindPaymentsHub} from '../dist/js/payments-hub.js';
import {renderAccountRecipient,bindAccountRecipient} from '../dist/js/payment-recipient.js';
import {validateRecipientLookup,recipientLookupMatches} from '../dist/js/recipient-lookup.js';
import {paymentFee} from '../dist/js/payments-parity-model.js';
import {createApprovedService} from '../dist/js/approved-service.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
class Node{constructor(value=''){this.value=value;this.isConnected=true;this.disabled=false;this.hidden=false;this.handlers=new Map();this.innerHTML='';this.attributes=new Map();this.classList={toggle(){},remove(){}};}addEventListener(name,fn){const items=this.handlers.get(name)||[];items.push(fn);this.handlers.set(name,items)}removeEventListener(name,fn){this.handlers.set(name,(this.handlers.get(name)||[]).filter(item=>item!==fn))}setAttribute(k,v){this.attributes.set(k,v)}removeAttribute(k){this.attributes.delete(k)}focus(){}emit(name,event={}){return Promise.all((this.handlers.get(name)||[]).map(fn=>fn({target:this,currentTarget:this,preventDefault(){},...event})))}}
const owner='11111111-1111-4111-8111-111111111111';
const formFor=rail=>rail==='bank'?{number:'01234009876',bank:'Ecobank Ghana',name:'My test bank recipient'}:{number:'0241234567',network:'Telecel Cash',name:'My test MoMo recipient'};
function quote(rail,form=formFor(rail)){const checked=validateRecipientLookup(rail,form,{sandbox:true});assert.equal(checked.ok,true,checked.message);return{ok:true,simulation:true,providerMode:'sandbox',fee:paymentFee(rail),labelUnverified:true,recipient:{...checked.request,name:checked.request.name||(rail==='momo'?'Test MoMo recipient':'Test bank recipient'),lookupSource:'sandbox'}};}
function paymentFor(rail){const form=formFor(rail),checked=validateRecipientLookup(rail,form,{sandbox:true}),response=quote(rail,form);return{rail,externalSimulation:true,providerMode:'sandbox',recipientForms:{[rail]:form},recipientLookup:{key:checked.key,request:checked.request,recipient:response.recipient,simulation:true,providerMode:'sandbox',confirmed:true},recipient:response.recipient,lookupRequired:true,amount:1000,category:'Other',note:'Test transfer',idempotencyKey:'external-test-'+rail};}
function paymentHarness(rail){
 const state=createEmptyState();state.onboardingDone=true;state.wallet=100000;state.buffer=0;
 const nodes=new Map(),calls=[],auth=[],messages=[];let quoteCalls=0;
 const ctx={connected:true,state,draft:{payment:paymentFor(rail)},route:{section:'pay',page:'review'},shared:{user:{id:owner},authVersion:1,capabilities:{externalTransferSandbox:true},async lookupExternalRecipient(){quoteCalls++;return quote(rail)}},$(selector){return nodes.get(selector)||null},$$(selector){if(!nodes.has(selector))nodes.set(selector,new Node());return[nodes.get(selector)]},saveDraft(){},savePaymentRecovery(){return true},setCapture(){},refresh(){},closeSheet(){},toast(text){messages.push(text)},go(route){ctx.route=route},finish(route){ctx.route=route},auth(options){auth.push(options)},async actAsync(type,payload){calls.push({type,payload});const tx={id:'external-posted-'+rail,type:'payment',rail,status:'success',direction:'out',amount:payload.amount,fee:payload.fee,merchant:payload.recipient.name,recipient:payload.recipient,externalSimulation:true,providerMode:'sandbox',at:'2026-11-15T12:00:00Z'};state.wallet-=tx.amount+tx.fee;state.transactions.unshift(tx);return{ok:true,id:tx.id,transaction:tx};}};
 bindPayments(ctx,ctx.route);return{ctx,calls,auth,messages,nodes,get quoteCalls(){return quoteCalls},click:name=>nodes.get(`[data-action="${name}"]`)?.emit('click')};
}
test('shared send-money rails open only when explicit sandbox capability is present; bills remain unavailable',async()=>{
 const h=paymentHarness('momo'),ctx=h.ctx,html=renderPaymentsHub(ctx,{hubTab:'send'});assert.match(html,/Test-money transfer/);
 const handlers={},starts=[];ctx.$=()=>({isConnected:true,addEventListener(t,fn){handlers[t]=fn},removeEventListener(){}});ctx.startPayment=(...args)=>starts.push(args);const dispose=bindPaymentsHub(ctx,{hubTab:'send'});
 for(const rail of ['momo','bank'])await handlers.click({target:{closest:()=>({dataset:{hubAction:rail}})}});assert.deepEqual(starts,[[null,'momo'],[null,'bank']]);dispose();
 assert.match(renderPaymentsHub(ctx,{hubTab:'bills'}),/Not connected in this test/);
});
test('sandbox recipient form labels network and optional name as simulation, never provider verified',()=>{
 for(const rail of ['momo','bank']){const h=paymentHarness(rail),html=renderAccountRecipient(h.ctx,{page:'recipient'});assert.match(html,/No real money reaches/);assert.match(html,/Recipient label \(optional\)/);assert.match(html,/no provider verifies the name/);assert.equal(html.includes('name="recipientNetwork"'),rail==='momo');assert.equal(html.includes('name="recipientBank"'),rail==='bank');const confirmed=renderAccountRecipient(h.ctx,{page:'recipient-confirm'});assert.match(confirmed,/Simulation destination/);assert.match(confirmed,/not provider verified/);assert.doesNotMatch(confirmed,/Registered account name|Account found/);}
});
test('sandbox destination matching is bound to entered number, bank, network and name',()=>{
 for(const rail of ['momo','bank']){const payment=paymentFor(rail);assert.equal(recipientLookupMatches(payment,{confirmed:true}),true);for(const field of rail==='momo'?['number','network','name']:['number','bank','name']){const changed=structuredClone(payment);changed.recipientForms[rail][field]='changed';assert.equal(recipientLookupMatches(changed,{confirmed:true}),false,field);}}
});
test('MoMo and bank review preserve fees, sandbox disclosure, destination recheck and PIN before any test-money debit',async()=>{
 for(const rail of ['momo','bank']){const h=paymentHarness(rail),before=h.ctx.state.wallet,html=renderPayments(h.ctx,h.ctx.route);assert.match(html,/Your Lumo test balance will decrease/);assert.match(html,/No real money reaches/);assert.match(html,rail==='momo'?/GH₵0.50/:/GH₵1.00/);await h.click('pay-review-next');assert.equal(h.quoteCalls,1);assert.equal(h.calls.length,0);assert.equal(h.ctx.state.wallet,before);assert.equal(h.auth.length,1);await h.auth[0].onSuccess();await h.auth[0].onSuccess();assert.equal(h.calls.length,1);assert.equal(h.calls[0].payload.externalSimulation,true);assert.equal(h.calls[0].payload.providerMode,'sandbox');assert.equal(h.calls[0].payload.fee,paymentFee(rail));assert.equal(h.ctx.state.wallet,before-1000-paymentFee(rail));const success=renderPayments(h.ctx,h.ctx.route);assert.match(success,/Test money sent/);assert.match(success,/No real money reached/);assert.match(paymentReceiptText(h.ctx.state.transactions[0]),/Sandbox simulation/);assert.match(paymentReceiptText(h.ctx.state.transactions[0]),/No real MoMo or bank transfer occurred/);}
});
test('cancelled PIN or a late changed-account quote does not submit an external transfer',async()=>{
 const h=paymentHarness('momo');await h.click('pay-review-next');h.auth[0].onCancel();assert.equal(h.calls.length,0);
 const other=paymentHarness('bank');let release;other.ctx.shared.lookupExternalRecipient=()=>new Promise(resolve=>release=resolve);const pending=other.click('pay-review-next');other.ctx.shared.authVersion++;release(quote('bank'));await pending;assert.equal(other.auth.length,0);assert.equal(other.calls.length,0);
});
test('recipient binding sends chosen network/name and ignores callbacks after account change',async()=>{
 for(const switched of [false,true]){const form=formFor('momo'),nodes=new Map(),root=new Node(),routes=[],requests=[];for(const selector of ['#recipient-lookup-form','[name="recipientNumber"]','[name="recipientNetwork"]','[name="recipientName"]','[data-recipient-find]','#recipient-error','[data-recipient-status]','.recipient-loading-dots'])nodes.set(selector,new Node());nodes.get('[name="recipientNumber"]').value=form.number;nodes.get('[name="recipientNetwork"]').value=form.network;nodes.get('[name="recipientName"]').value=form.name;root.querySelector=s=>nodes.get(s)||null;let release;const ctx={connected:true,draft:{payment:{rail:'momo'}},shared:{user:{id:owner},authVersion:1,capabilities:{externalTransferSandbox:true},lookupExternalRecipient(request){requests.push(request);return new Promise(resolve=>release=resolve)}},$:()=>root,saveDraft(){},setCapture(){},go(route){routes.push(route)}};const dispose=bindAccountRecipient(ctx,{page:'recipient'});const submitting=nodes.get('#recipient-lookup-form').emit('submit');await tick();assert.equal(requests[0].network,form.network);assert.equal(requests[0].name,form.name);if(switched)ctx.shared.authVersion++;release(quote('momo'));await submitting;await tick();assert.equal(routes.length,switched?0:1);dispose();}
});
test('shared transport discovers sandbox capability and sends externalRecipient without inventing outcome or live provider',async()=>{
 const values=new Map([['lumo-approved-session-v1',JSON.stringify({access_token:'synthetic-session',user:{id:owner}})]]),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},sent=[];
 const service=createApprovedService({storage,modeStorage:storage,fetch:async(url,options)=>{const body=JSON.parse(options.body);sent.push(body);return new Response(JSON.stringify(body.action==='snapshot'?{ok:true,capabilities:{externalTransferSandbox:true,momo:false,bank:false}}:quote('momo')),{status:200});}});
 assert.equal(service.capabilities.externalTransferSandbox,undefined);await service.snapshot();assert.equal(service.capabilities.externalTransferSandbox,true);assert.equal(service.capabilities.momo,false);await service.lookupExternalRecipient({rail:'momo',...formFor('momo')});assert.equal(sent.at(-1).action,'externalRecipient');assert.equal(sent.at(-1).network,'Telecel Cash');assert.equal(sent.at(-1).status,undefined);
});

import {exportAccountData,statementCSV} from '../dist/js/account-model.js';
test('shared receipt, JSON export and statement CSV preserve sandbox labels and sanitized destination',async()=>{
 const h=paymentHarness('bank');await h.click('pay-review-next');await h.auth[0].onSuccess();const tx=h.ctx.state.transactions[0];tx.recipient={...tx.recipient,access_token:'must-not-export'};
 const receipt=paymentReceiptText(tx);assert.match(receipt,/Sandbox simulation/);assert.match(receipt,/No real MoMo or bank transfer/);
 const exported=exportAccountData(h.ctx.state,{connected:true}),record=exported.transactions[0];assert.equal(record.externalSimulation,true);assert.equal(record.providerMode,'sandbox');assert.match(record.description,/Test money only/);assert.equal(record.recipient.number,'01234009876');assert.equal(JSON.stringify(exported).includes('must-not-export'),false);
 const csv=statementCSV(h.ctx.state,{from:'2026-11-01',to:'2026-11-30'});assert.match(csv,/Sandbox simulation.*No real MoMo or bank transfer/);
});
test('PIN approval after the signed-in account changes cannot debit that new account',async()=>{
 const h=paymentHarness('momo');await h.click('pay-review-next');h.ctx.shared.authVersion++;h.ctx.shared.user={id:'another-owner'};await h.auth[0].onSuccess();assert.equal(h.calls.length,0);
});

test('an uncertain external response preserves the original payload and reference for checking instead of making a second transfer',async()=>{
 for(const rail of ['momo','bank']){
  const h=paymentHarness(rail),original=h.ctx.actAsync;let first=true,saved;
  h.ctx.actAsync=async(type,payload)=>{if(first){first=false;saved=structuredClone(payload);return{ok:false,unknown:true,attemptId:'original-external-attempt',message:'Result not confirmed'};}assert.deepEqual(payload,saved);return original(type,payload);};
  await h.click('pay-review-next');await h.auth[0].onSuccess();assert.equal(h.ctx.state.wallet,100000);assert.equal(h.ctx.draft.payment.submissionState,'unknown');assert.equal(h.ctx.draft.payment.submittedPayload.idempotencyKey,'external-test-'+rail);
  h.nodes.clear();bindPayments(h.ctx,h.ctx.route);await h.click('pay-check-original');await h.auth.at(-1).onSuccess();assert.equal(h.calls.length,1);assert.equal(h.ctx.state.wallet,100000-1000-paymentFee(rail));assert.equal(h.calls[0].payload.idempotencyKey,saved.idempotencyKey);
 }
});
