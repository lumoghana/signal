import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmptyState,applyAction} from '../dist/js/model.js';
import {prepareFailedPaymentRetry,prepareIOURepayment,bindPayments,renderPayments,paymentReceiptText} from '../dist/js/payments.js';
import {getTopUpShortcuts,prepareServicePayment} from '../dist/js/payment-catalog.js';
import {bindLife} from '../dist/js/life.js';
import {bindPaymentService,renderPaymentService} from '../dist/js/payment-services.js';

const account=()=>{const s=createEmptyState({name:'Ama',phone:'024 555 0182'});s.onboardingDone=true;s.wallet=100000;s.buffer=0;return s;};
const action=(s,type,p)=>{const r=applyAction(s,type,p);assert.equal(r.ok,true,r.message);return r;};
const date=new Date().toISOString().slice(0,10);

test('failed MoMo and bank retry restores recorded destination and requires fresh verification and new key',()=>{
 for(const rail of ['momo','bank']){
  const tx={id:'failed-original',type:'payment',status:'failed',amount:2550,rail,category:'Food',note:'0201111222 is only a note',recipient:{name:'Esi',number:rail==='bank'?'0123456789':'0205550166',bank:'Ecobank Ghana',network:'Telecel Cash'},iouId:'debt',idempotencyKey:'old'};
  const before=structuredClone(tx),a=prepareFailedPaymentRetry(tx),b=prepareFailedPaymentRetry(tx);
  assert.equal(a.recipient,null);assert.equal(a.lookupRequired,true);assert.equal(a.recipientForms[rail].number,tx.recipient.number);
  if(rail==='bank')assert.equal(a.recipientForms.bank.bank,'Ecobank Ghana');
  assert.equal(a.recipientLookup,undefined);assert.equal(a.amount,2550);assert.equal(a.note,tx.note);assert.equal(a.iouId,'debt');
  assert.notEqual(a.idempotencyKey,tx.idempotencyKey);assert.notEqual(a.idempotencyKey,b.idempotencyKey);assert.deepEqual(tx,before);
 }
 const legacy=prepareFailedPaymentRetry({id:'legacy',type:'payment',status:'failed',rail:'bank',amount:100,merchant:'Esi',recipientNumber:'0012345678',bank:'Ecobank Ghana',note:'Lunch'});
 assert.equal(legacy.recipientForms.bank.number,'0012345678');assert.equal(legacy.recipientForms.bank.bank,'Ecobank Ghana');
 assert.equal(prepareFailedPaymentRetry({type:'payment',status:'pending'}),null);
});

test('IOU setup preserves amount but requires an explicitly selected recipient, lookup and authorisation',()=>{
 const state=account(),iou=action(state,'createIOU',{type:'owedByMe',name:'Kofi',amount:5000,due:date}).iou;
 const before=JSON.stringify(state),routes=[],errors=[],ctx={state,draft:{},setCapture(){},saveDraft(){},closeSheet(){},go:r=>routes.push(r),toast:m=>errors.push(m)};
 assert.equal(prepareIOURepayment(ctx,iou,2000,'momo'),true);assert.equal(JSON.stringify(state),before);
 assert.equal(ctx.draft.payment.amount,2000);assert.equal(ctx.draft.payment.iouId,iou.id);assert.equal(ctx.draft.payment.recipient,null);assert.equal(ctx.draft.payment.recipientForms.momo.number,'');
 assert.equal(routes.at(-1).page,'recipient');assert.equal(routes.at(-1).backTo.id,iou.id);
 assert.equal(prepareIOURepayment({...ctx,draft:{}},iou,6000,'lumo'),false);
 const incoming=action(state,'createIOU',{type:'owedToMe',name:'Esi',amount:1000,due:date}).iou;
 assert.equal(prepareIOURepayment({...ctx,draft:{}},incoming,100,'lumo'),false);
 action(state,'payment',{iouId:iou.id,amount:4000,rail:'lumo',recipient:{name:'Kofi',number:'@kofi'},merchant:'Kofi',category:'IOU',status:'pending',idempotencyKey:'pending-reserved'});
 assert.equal(prepareIOURepayment({...ctx,draft:{}},iou,1001,'momo'),false);assert.equal(errors.length,3);
});

class Node{constructor(value=''){this.value=value;this.handlers={};this.disabled=false;this.isConnected=true;this.hidden=false;}addEventListener(t,fn){this.handlers[t]=fn;}removeEventListener(){}setAttribute(){}removeAttribute(){}click(){this.handlers.click?.();}}
function paymentHarness(state,payment){const nodes=new Map(),auth=[],routes=[],calls=[];const node=selector=>{if(!nodes.has(selector))nodes.set(selector,new Node());return nodes.get(selector);};const ctx={state,draft:{payment},route:{section:'pay',page:'review'},$:node,$$:s=>[node(s)],setCapture(){},saveDraft(){},refresh(){},toast(){},closeSheet(){},go:r=>routes.push(r),finish:r=>routes.push(r),auth:o=>auth.push(o),act:(type,p)=>{calls.push({type,p});return applyAction(state,type,p);}};bindPayments(ctx,ctx.route);return{ctx,nodes,auth,routes,calls,node};}

test('IOU review forwards Pending/Failed to the real ledger and only confirmation reduces the debt',()=>{
 for(const outcome of ['pending','failed','success']){
  const s=account(),iou=action(s,'createIOU',{type:'owedByMe',name:'Kofi',amount:2000,due:date}).iou;
  const p={iouId:iou.id,iouName:'Kofi',rail:'lumo',recipient:{name:'Kofi',number:'@kofi'},category:'IOU',amount:1000,idempotencyKey:'iou-'+outcome};
  const h=paymentHarness(s,p),before=s.wallet;
  h.node('#payment-outcome').handlers.change({target:{value:outcome}});h.node('[data-action="pay-review-next"]').click();assert.equal(h.calls.length,0);assert.equal(h.auth.length,1);
  h.auth[0].onSuccess();h.auth[0].onSuccess();assert.equal(h.calls.length,1);assert.equal(s.transactions.length,1);assert.equal(s.transactions[0].status,outcome);
  assert.equal(iou.paid,outcome==='success'?1000:0);assert.equal(s.wallet,before-(outcome==='failed'?0:1000));
  if(outcome==='pending'){action(s,'resolvePayment',{id:s.transactions[0].id,status:'success'});assert.equal(iou.paid,1000);}
  assert.match(renderPayments(h.ctx,{section:'pay',page:'review'}),/Towards your IOU with Kofi/);
 }
});

function delivered(id='data',fields={network:'Telecel',phone:'0205550166',bundle:'monthly'}){const p=prepareServicePayment(id,fields).payment;return{id:'last-'+id,type:'payment',direction:'out',status:'success',at:'2026-11-06T08:00:00.000Z',serviceId:id,serviceFields:p.serviceFields,amount:p.amount,delivery:{status:'delivered'}};}
test('top-up shortcuts use the saved number and verified last delivered form; pending is checkable, never repeated',()=>{
 const s=account();s.transactions=[delivered()];const before=JSON.stringify(s),short=getTopUpShortcuts(s,'data');
 assert.equal(short.phone,'0245550182');assert.equal(short.network,'Telecel');assert.equal(short.previous.bundle,'monthly');assert.equal(short.previous.phone,'0205550166');assert.equal(JSON.stringify(s),before);
 s.transactions.unshift({...delivered(),id:'waiting',at:'2026-11-06T09:00:00.000Z',delivery:{status:'pending'}});
 assert.deepEqual(getTopUpShortcuts(s,'data').waiting,{id:'waiting'});assert.equal(getTopUpShortcuts(s,'data').previous,null);
 s.transactions[0].status='failed';assert.equal(getTopUpShortcuts(s,'data').previous.bundle,'monthly');
 s.transactions[1].serviceFields.bundle='not-a-bundle';assert.equal(getTopUpShortcuts(s,'data').previous,null);
});

test('top-up shortcuts fill only a private draft; actual review and payment are still separate',()=>{
 const s=account();s.transactions=[delivered()];const handlers={},routes=[],prepared=[],root={isConnected:true,querySelectorAll:()=>[],querySelector:()=>null,addEventListener(t,fn){handlers[t]=fn;},removeEventListener(){}};
 const ctx={draft:{},$:()=>root,topUpShortcuts:id=>getTopUpShortcuts(s,id),saveDraft(){},setCapture(){},refresh(){},go:r=>routes.push(r),startServicePayment:p=>prepared.push(p)};
 const route={section:'pay',page:'service',id:'data'},before=JSON.stringify(s);assert.match(renderPaymentService(ctx,route),/My number/);assert.match(renderPaymentService(ctx,route),/Use last top-up/);const cleanup=bindPaymentService(ctx,route);
 const click=action=>handlers.click({target:{closest:()=>({dataset:{serviceAction:action},disabled:false})}});
 click('my-number');assert.equal(ctx.draft.servicePayment.data.phone,'0245550182');assert.equal(prepared.length,0);
 click('last-topup');assert.equal(ctx.draft.servicePayment.data.phone,'0205550166');assert.equal(ctx.draft.servicePayment.data.bundle,'monthly');assert.equal(prepared.length,0);assert.equal(JSON.stringify(s),before);
 click('review');assert.equal(prepared.length,1);assert.equal(prepared[0].amount,5000);assert.equal(JSON.stringify(s),before);cleanup();
});

test('outside IOU repayments have a truthful record and share text without pretending a Lumo debit',()=>{
 const tx={id:'outside',type:'iou-manual-repayment',direction:'out',status:'success',amount:3000,merchant:'Kofi',rail:'cash',at:new Date().toISOString()};
 const text=paymentReceiptText(tx);assert.match(text,/To Kofi/);assert.match(text,/Paid using Cash/);assert.match(text,/Lumo balance unchanged/);assert.doesNotMatch(text,/Lumo payment/);
 const html=renderPayments({state:{transactions:[tx]},draft:{}},{section:'pay',page:'transaction',id:tx.id});assert.match(html,/as paid outside Lumo/);assert.match(html,/Paid using/);assert.doesNotMatch(html,/Simulate reversal/);
});


function settlementHarness() {
 const state=account(),iou=action(state,'createIOU',{type:'owedByMe',name:'Kofi',amount:5000,due:date}).iou;
 const button=new Node();button.dataset={action:'life-iou-settle'};
 const root={querySelectorAll:()=>[button]},previousDocument=globalThis.document;
 globalThis.document={querySelector:()=>root};
 const auth=[],calls=[],routes=[],sheets=[];
 const ctx={state,draft:{},saveDraft(){},setCapture(){},closeSheet(){},refresh(){},toast(){},go:r=>routes.push(r),auth:a=>auth.push(a),act:(type,p)=>{calls.push({type,p});return applyAction(state,type,p);},sheet:(html,bind)=>{
  const nodes=new Map([['[name="settleAmount"]',new Node('30.00')],['[name="repaymentMethod"]',new Node('lumo')],['[name="outsideDestination"]',new Node('')],['[data-outside-choice]',new Node()],['[data-action="life-settlement-close"]',new Node()],['form',new Node()],['.life-form-error',new Node()]]);
  const el={querySelector:s=>nodes.get(s)||null};sheets.push({html,nodes});bind(el);
 }};
 bindLife(ctx,{section:'life',page:'iou-detail',id:iou.id});button.click();
 return {state,iou,ctx,auth,calls,routes,sheets,restore(){if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}};
}

test('outgoing IOU method chooser opens the real MoMo recipient journey without moving or authorising money',()=>{
 const h=settlementHarness();try{
  const sheet=h.sheets[0];assert.match(sheet.html,/Pay a Lumo person/);assert.match(sheet.html,/Send to mobile money/);assert.match(sheet.html,/I already paid outside Lumo/);
  sheet.nodes.get('[name="repaymentMethod"]').handlers.change({target:{value:'momo'}});
  sheet.nodes.get('form').onsubmit({preventDefault(){}});
  assert.equal(h.routes.at(-1).page,'recipient');assert.equal(h.ctx.draft.payment.iouId,h.iou.id);assert.equal(h.ctx.draft.payment.amount,3000);assert.equal(h.ctx.draft.payment.rail,'momo');assert.equal(h.auth.length,0);assert.equal(h.calls.length,0);assert.equal(h.iou.paid,0);
 }finally{h.restore();}
});

test('recording an outside cash repayment requires explicit choice and PIN, preserves wallet and deduplicates',()=>{
 const h=settlementHarness();try{
  const sheet=h.sheets[0],before=h.state.wallet;
  sheet.nodes.get('[name="repaymentMethod"]').handlers.change({target:{value:'outside'}});
  sheet.nodes.get('[name="outsideDestination"]').handlers.change({target:{value:'cash'}});
  sheet.nodes.get('form').onsubmit({preventDefault(){}});assert.equal(h.calls.length,0);assert.equal(h.auth.length,1);assert.match(h.auth[0].title,/Record outside repayment/);
  h.auth[0].onSuccess();h.auth[0].onSuccess();assert.equal(h.state.wallet,before);assert.equal(h.iou.paid,3000);assert.equal(h.state.transactions.length,1);assert.equal(h.state.transactions[0].type,'iou-manual-repayment');assert.equal(h.state.transactions[0].direction,'out');assert.equal(h.calls[0].p.outside,true);
 }finally{h.restore();}
});
