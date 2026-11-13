import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampusPay,parseCampusAmount} from '../dist/campus-pay.js';

class Storage{constructor(){this.data=new Map()}getItem(k){return this.data.get(k)||null}setItem(k,v){this.data.set(k,v)}removeItem(k){this.data.delete(k)}}
globalThis.FormData=class{constructor(form){this.values=Object.entries(form.values||{})}*[Symbol.iterator](){yield* this.values}};
const form=(kind,values)=>({dataset:{campusForm:kind},values});
const clone=value=>JSON.parse(JSON.stringify(value));
function setup({existing=true,balance=0,fixed=0}={}){
 globalThis.sessionStorage=new Storage();
 let student=existing?{id:'student',name:'Test Student',balance,entries:[]}:null;
 const calls=[],payments=new Map(),funds=new Map();let paymentWrites=0,fundWrites=0,losePaymentResponse=false,loseFundResponse=false;
 const quote={business:{id:'business',name:'Campus Kitchen'},shop:{id:'shop-a',name:'Night Market Counter',code:'LUM-GLOBAL1',accepting:true,open:true},request:fixed?{id:'request',amount:fixed}:null};
 async function api(path,options={}){
  calls.push({path,options:clone(options)});
  if(path==='/api/student')return {student:clone(student)};
  if(path.startsWith('/api/payments/quote?')){const url=new URL(path,'https://example.test');return {...clone(quote),shop:{...quote.shop,id:url.searchParams.get('shopId')}}}
  if(path==='/api/student/open'){student={id:'student',name:options.body.name,balance:0,entries:[]};return {student:clone(student)}}
  if(path==='/api/student/fund'){
   assert.equal(options.body.confirmSandbox,true);assert.ok(options.body.attemptId);
   if(!funds.has(options.body.attemptId)){fundWrites++;student.balance+=options.body.amount;student.entries.unshift({type:'test-funding',amount:options.body.amount,reference:'FUND-1',createdAt:'2026-11-11T10:00:00Z'});funds.set(options.body.attemptId,true)}
   if(loseFundResponse){loseFundResponse=false;throw Error('Connection interrupted after the request. Check again.')}
   return {student:clone(student)};
  }
  if(path==='/api/payments'){
   if(payments.has(options.body.attemptId))return {payment:clone(payments.get(options.body.attemptId)),student:clone(student),replayed:true};
   if(student.balance<options.body.amount)throw Object.assign(Error('Your demo wallet has insufficient funds.'),{code:'INSUFFICIENT_FUNDS'});
   paymentWrites++;student.balance-=options.body.amount;
   const payment={id:'payment',reference:'LM-CONFIRMED',status:'paid',amount:options.body.amount,shopId:options.body.shopId,createdAt:'2026-11-11T10:01:00Z',confirmedAt:'2026-11-11T10:01:00Z'};
   payments.set(options.body.attemptId,payment);student.entries.unshift({type:'merchant-payment',amount:-options.body.amount,reference:payment.reference,transactionId:payment.id,shopId:options.body.shopId,description:'Campus Kitchen · Night Market',createdAt:payment.createdAt});
   if(losePaymentResponse){losePaymentResponse=false;throw Error('Connection interrupted. Check the payment status.')}
   return {payment:clone(payment),student:clone(student)};
  }
  throw Error('Unexpected endpoint '+path);
 }
 return {api,calls,quote,controller:createCampusPay({api}),student:()=>student,counts:()=>({paymentWrites,fundWrites}),losePayment(){losePaymentResponse=true},loseFund(){loseFundResponse=true}};
}
test('cedi input rejects ambiguous and out-of-range values and preserves pesewas',()=>{
 assert.equal(parseCampusAmount('25.05'),2505);assert.equal(parseCampusAmount('0.01'),1);
 for(const value of ['','0','-2','1e3','12.345','1,000','10000.01','NaN'])assert.throws(()=>parseCampusAmount(value));
 assert.equal(parseCampusAmount('1500.00'),150000);assert.equal(parseCampusAmount('10000.00'),1000000);
 assert.throws(()=>parseCampusAmount('1000.01',{funding:true}));assert.equal(parseCampusAmount('1000.00',{funding:true}),100000);
});
test('creating a demo wallet starts at zero and never adds funds or pays automatically',async()=>{
 const s=setup({existing:false});await s.controller.open({id:'shop-a'});
 assert.match(s.controller.render(),/Try Campus Pay/);
 await s.controller.handleSubmit(form('create',{name:'Campus Tester'}));
 assert.equal(s.student().balance,0);assert.equal(s.student().name,'Campus Tester');
 assert.equal(s.calls.filter(call=>['/api/student/fund','/api/payments'].includes(call.path)).length,0);
 assert.match(s.controller.render(),/Pay the right counter/);
});
test('payment requires amount review and explicit confirmation and records the exact server receipt',async()=>{
 const s=setup();await s.controller.open({id:'shop-a'},{method:'code'});
 await s.controller.handleSubmit(form('amount',{amount:'10.05'}));
 assert.match(s.controller.render(),/One final check/);assert.equal(s.counts().paymentWrites,0);
 await s.controller.handleClick('campus-pay-fund');
 await s.controller.handleSubmit(form('fund',{fundAmount:'25.00'}));
 assert.equal(s.student().balance,2500);assert.equal(s.counts().paymentWrites,0);
 await s.controller.handleSubmit(form('amount',{amount:'10.05'}));
 await s.controller.handleClick('campus-pay-confirm');
 assert.equal(s.student().balance,1495);assert.equal(s.counts().paymentWrites,1);
 const html=s.controller.render();assert.match(html,/Payment confirmed/);assert.match(html,/LM-CONFIRMED/);assert.match(html,/Campus Kitchen/);assert.match(html,/LUM-GLOBAL1/);assert.match(html,/GH₵10.05/);
 await s.controller.handleClick('campus-pay-wallet');assert.match(s.controller.render(),/Demo activity/);assert.match(s.controller.render(),/Test money added/);assert.match(s.controller.render(),/−GH₵10.05/);
 assert.doesNotMatch(s.controller.render(),/Continue to payment/);
});
test('a fixed request cannot reopen as an editable amount if its verified quote is missing or replaced',async()=>{
 for(const replacement of [null,{id:'another-request',amount:3000},{id:'request',amount:0}]){
  const s=setup({fixed:3000});s.quote.request=replacement;
  await s.controller.open('shop-a',{requestId:'request'});
  assert.match(s.controller.render(),/fixed-amount request could not be verified/);
  assert.doesNotMatch(s.controller.render(),/data-campus-form="amount"/);
  assert.equal(s.counts().paymentWrites,0);
 }
});
test('fixed QR amount cannot be changed and insufficient funds is recoverable without a success claim',async()=>{
 const s=setup({fixed:3000});await s.controller.open('shop-a',{requestId:'request'});
 assert.match(s.controller.render(),/readonly aria-readonly="true"/);assert.match(s.controller.render(),/Amount locked by the merchant/);
 await s.controller.handleSubmit(form('amount',{amount:'20.00'}));assert.match(s.controller.render(),/must match/);assert.equal(s.counts().paymentWrites,0);
 await s.controller.handleSubmit(form('amount',{amount:'30.00'}));await s.controller.handleClick('campus-pay-confirm');
 assert.match(s.controller.render(),/One final check/);assert.match(s.controller.render(),/insufficient funds/);assert.doesNotMatch(s.controller.render(),/Payment confirmed/);assert.equal(s.student().balance,0);
 await s.controller.handleClick('campus-pay-fund');await s.controller.handleSubmit(form('fund',{fundAmount:'50.00'}));
 await s.controller.handleSubmit(form('amount',{amount:'30.00'}));await s.controller.handleClick('campus-pay-confirm');
 assert.equal(s.counts().paymentWrites,1);assert.equal(s.student().balance,2000);
});
test('uncertain payment retries the same attempt and cannot debit a wallet twice',async()=>{
 const s=setup({balance:5000});await s.controller.open('shop-a');await s.controller.handleSubmit(form('amount',{amount:'12.50'}));
 s.losePayment();await s.controller.handleClick('campus-pay-confirm');
 assert.match(s.controller.render(),/Checking this payment/);assert.doesNotMatch(s.controller.render(),/Payment confirmed/);assert.equal(s.student().balance,3750);
 const first=s.calls.find(call=>call.path==='/api/payments').options.body;
 await s.controller.handleClick('campus-pay-confirm');
 const retries=s.calls.filter(call=>call.path==='/api/payments');assert.equal(retries.length,2);assert.deepEqual(retries[1].options.body,first);
 assert.equal(s.counts().paymentWrites,1);assert.equal(s.student().balance,3750);assert.match(s.controller.render(),/Payment confirmed/);
});
test('reopening on a different shop resolves the earlier uncertain purchase first',async()=>{
 const s=setup({balance:5000});await s.controller.open('shop-a');await s.controller.handleSubmit(form('amount',{amount:'7.00'}));s.losePayment();await s.controller.handleClick('campus-pay-confirm');s.controller.hide();
 const next=createCampusPay({api:s.api});await next.open('shop-b');assert.match(next.render(),/earlier payment/);assert.match(next.render(),/Checking this payment/);
 await next.handleClick('campus-pay-confirm');
 const retries=s.calls.filter(call=>call.path==='/api/payments');assert.equal(retries[1].options.body.shopId,'shop-a');assert.equal(retries[0].options.body.attemptId,retries[1].options.body.attemptId);assert.equal(s.counts().paymentWrites,1);
 assert.match(next.render(),/Campus Kitchen/);assert.match(next.render(),/Payment confirmed/);
});
test('test-money retry is explicit and idempotent after a lost response',async()=>{
 const s=setup();await s.controller.openWallet();await s.controller.handleClick('campus-pay-fund');s.loseFund();await s.controller.handleSubmit(form('fund',{fundAmount:'20.00'}));
 assert.equal(s.student().balance,2000);assert.match(s.controller.render(),/Check test-money addition/);
 await s.controller.handleSubmit(form('fund',{fundAmount:'30.00'}));assert.match(s.controller.render(),/before changing its amount/);assert.equal(s.counts().fundWrites,1);
 await s.controller.handleSubmit(form('fund',{fundAmount:'20.00'}));assert.equal(s.student().balance,2000);assert.equal(s.counts().fundWrites,1);
 const funds=s.calls.filter(call=>call.path==='/api/student/fund');assert.equal(funds[0].options.body.attemptId,funds[1].options.body.attemptId);
});
test('server-reported processing cannot show payment success and merchant strings are escaped',async()=>{
 const s=setup({balance:5000});const api=async(path,options)=>path==='/api/payments'?{payment:{status:'processing',amount:1000},student:s.student()}:path.startsWith('/api/payments/quote?')?{...s.quote,business:{name:'<script>bad()</script>'}}:s.api(path,options);
 const controller=createCampusPay({api});await controller.open('shop-a');await controller.handleSubmit(form('amount',{amount:'10.00'}));await controller.handleClick('campus-pay-confirm');
 assert.match(controller.render(),/Checking this payment/);assert.doesNotMatch(controller.render(),/Payment confirmed/);assert.doesNotMatch(controller.render(),/<script>/);assert.match(controller.render(),/&lt;script&gt;/);
});
test('only a definitive HTTP API funding rejection unlocks changing the amount',async()=>{
 const s=setup();let rejected=false;
 const api=async(path,options)=>{if(path==='/api/student/fund'&&!rejected){rejected=true;throw Object.assign(Error('Choose a smaller test-money addition.'),{code:'FUNDING_LIMIT',status:400})}return s.api(path,options)};
 const ui=createCampusPay({api});await ui.openWallet();await ui.handleClick('campus-pay-fund');await ui.handleSubmit(form('fund',{fundAmount:'25.00'}));
 assert.equal(globalThis.sessionStorage.getItem('lumo-campus-funding-attempt-v1'),null);assert.doesNotMatch(ui.render(),/Check test-money addition/);
 await ui.handleSubmit(form('fund',{fundAmount:'30.00'}));assert.equal(s.student().balance,3000);
});
test('a local authentication-epoch change after funding retains the reference despite its HTTP-like status',async()=>{
 const s=setup();let changed=false;const references=[];
 const api=async(path,options)=>{const result=await s.api(path,options);if(path==='/api/student/fund'){references.push(options.body.attemptId);if(!changed){changed=true;throw Object.assign(Error('Your account changed while this request was running.'),{code:'AUTH_CHANGED',status:409})}}return result};
 const ui=createCampusPay({api});await ui.openWallet();await ui.handleClick('campus-pay-fund');await ui.handleSubmit(form('fund',{fundAmount:'25.00'}));
 assert.ok(globalThis.sessionStorage.getItem('lumo-campus-funding-attempt-v1'));assert.match(ui.render(),/Check test-money addition/);
 await ui.handleSubmit(form('fund',{fundAmount:'25.00'}));assert.equal(references[0],references[1]);assert.equal(s.student().balance,2500);assert.equal(s.counts().fundWrites,1);
});

test('student history loads older cursor pages without losing entries or claiming inserted new activity is loaded',async()=>{
 globalThis.sessionStorage=new Storage();
 const entries=Array.from({length:106},(_,index)=>({id:'entry-'+index,type:'merchant-payment',amount:-1,reference:'LM-'+index,createdAt:new Date(Date.parse('2026-11-11T12:00:00Z')-index*60000).toISOString()}));
 let added=false;
 const api=async(path)=>{
  const url=new URL(path,'https://test.example'),cursor=url.searchParams.get('cursor');
  let start=cursor?entries.findIndex(entry=>entry.id===cursor)+1:0;
  const page=entries.slice(start,start+25),next=start+25<entries.length?page.at(-1).id:null;
  return {student:{id:'history-student',name:'History Student',balance:5000,entries:page},entries:page,history:{nextCursor:next,total:entries.length,limit:25}};
 };
 const ui=createCampusPay({api});await ui.openWallet();assert.match(ui.render(),/25 of 106 activity entries shown/);
 await ui.handleClick('campus-pay-history-more');assert.match(ui.render(),/50 of 106 activity entries shown/);
 entries.unshift({id:'inserted-new',type:'refund',amount:1,reference:'NEW-HEAD',createdAt:'2026-11-11T12:01:00Z'});added=true;
 while(/Load older activity/.test(ui.render()))await ui.handleClick('campus-pay-history-more');
 assert.equal(added,true);assert.match(ui.render(),/106 of 107 activity entries shown/);assert.match(ui.render(),/Refresh new activity/);assert.doesNotMatch(ui.render(),/All activity loaded/);
 await ui.handleClick('campus-pay-refresh-wallet');assert.match(ui.render(),/25 of 107 activity entries shown/);assert.match(ui.render(),/NEW-HEAD/);
 while(/Load older activity/.test(ui.render()))await ui.handleClick('campus-pay-history-more');
 assert.match(ui.render(),/107 of 107 activity entries shown/);assert.match(ui.render(),/All activity loaded/);assert.equal((ui.render().match(/<article>/g)||[]).length,107);
});

test('explicit server rejections release the pending purchase so another merchant can be selected',async()=>{
 for(const code of ['SHOP_PAUSED','REQUEST_STAFF_CHANGED','REQUEST_EXCEEDS_LIMIT','REQUEST_UNAVAILABLE','RECIPIENT_MISMATCH','MERCHANT_NOT_FOUND']){
  const s=setup({balance:5000});
  const api=async(path,options)=>{if(path==='/api/payments')throw Object.assign(Error('This payment was rejected.'),{status:code==='MERCHANT_NOT_FOUND'?404:409,code});return s.api(path,options)};
  const ui=createCampusPay({api});await ui.open('shop-a');await ui.handleSubmit(form('amount',{amount:'10.00'}));await ui.handleClick('campus-pay-confirm');
  assert.match(ui.render(),/Payment is unavailable/);assert.match(ui.render(),/before any wallet debit/);assert.doesNotMatch(ui.render(),/Checking this payment/);
  assert.equal(globalThis.sessionStorage.getItem('lumo-campus-payment-attempt-v1'),null,code);
  await ui.open('shop-b');assert.match(ui.render(),/Pay the right counter/);assert.doesNotMatch(ui.render(),/earlier payment|Checking this payment/);
  const quotes=s.calls.filter(call=>call.path.startsWith('/api/payments/quote?'));assert.equal(new URL(quotes.at(-1).path,'https://test.example').searchParams.get('shopId'),'shop-b');assert.equal(s.student().balance,5000);assert.equal(s.counts().paymentWrites,0);
 }
});
test('unknown conflicts, local account changes and server failures keep the immutable pending purchase',async()=>{
 for(const failure of [{status:409,code:'AUTH_CHANGED'},{status:409,code:'CONCURRENT_UPDATE'},{status:409,code:'REQUEST_PROCESSING'},{status:409,code:'IDEMPOTENCY_MISMATCH'},{status:409,code:'UNRECOGNIZED_CONFLICT'},{status:503,code:'SHOP_PAUSED'},{code:'SHOP_PAUSED'},{}]){
  const s=setup({balance:5000});const sent=[];
  const api=async(path,options)=>{if(path==='/api/payments'){sent.push(clone(options.body));throw Object.assign(Error('The outcome is not known.'),failure)}return s.api(path,options)};
  const ui=createCampusPay({api});await ui.open('shop-a');await ui.handleSubmit(form('amount',{amount:'10.00'}));await ui.handleClick('campus-pay-confirm');
  const pending=JSON.parse(globalThis.sessionStorage.getItem('lumo-campus-payment-attempt-v1'));assert.equal(pending.payload.attemptId,sent[0].attemptId,JSON.stringify(failure));assert.match(ui.render(),/Checking this payment/);
  await ui.open('shop-b');assert.match(ui.render(),/earlier payment/);await ui.handleClick('campus-pay-confirm');assert.deepEqual(sent[1],sent[0]);assert.equal(s.counts().paymentWrites,0);
 }
});
test('a definitive response arriving after the payment screen closes still releases its saved reference',async()=>{
 const s=setup({balance:5000});let rejectPayment,ready;const waiting=new Promise(resolve=>ready=resolve);
 const api=async(path,options)=>path==='/api/payments'?new Promise((_,reject)=>{rejectPayment=reject;ready()}):s.api(path,options);
 const ui=createCampusPay({api});await ui.open('shop-a');await ui.handleSubmit(form('amount',{amount:'10.00'}));const payment=ui.handleClick('campus-pay-confirm');await waiting;ui.hide();
 rejectPayment(Object.assign(Error('This shop paused payments.'),{status:409,code:'SHOP_PAUSED'}));await payment;
 assert.equal(globalThis.sessionStorage.getItem('lumo-campus-payment-attempt-v1'),null);
 const reloaded=createCampusPay({api:s.api});await reloaded.open('shop-b');assert.match(reloaded.render(),/Pay the right counter/);assert.doesNotMatch(reloaded.render(),/earlier payment|Checking this payment/);
});

test('an older cursor response preserves a newer funded wallet core without server revisions',async()=>{
 globalThis.sessionStorage=new Storage();
 const entries=Array.from({length:30},(_,index)=>({id:'versionless-'+index,type:'merchant-payment',amount:-1,createdAt:new Date(Date.parse('2026-11-11T12:00:00Z')-index*1000).toISOString()}));
 let student={id:'versionless-wallet',name:'Original display name',balance:5000},release,capturedResolve;
 const captured=new Promise(resolve=>capturedResolve=resolve);
 const page=(rows,next,total)=>({student:{...student,entries:clone(rows)},entries:clone(rows),history:{nextCursor:next,total,limit:25}});
 const api=async(path,options={})=>{
  if(path==='/api/student')return page(entries.slice(0,25),'tail',30);
  if(path.startsWith('/api/student?')){const old=page(entries.slice(25),null,30);capturedResolve();return new Promise(resolve=>release=()=>resolve(old))}
  if(path==='/api/student/fund'){student={...student,name:'Current display name',balance:6000};return page([{id:'new-funding',type:'test-funding',amount:options.body.amount,createdAt:'2026-11-11T12:01:00Z'},...entries.slice(0,24)],'head-cursor',31)}
  throw Error('Unexpected request '+path);
 };
 const ui=createCampusPay({api});await ui.openWallet();const older=ui.handleClick('campus-pay-history-more');await captured;
 await ui.handleClick('campus-pay-fund');await ui.handleSubmit(form('fund',{fundAmount:'10.00'}));release();await older;
 const html=ui.render();assert.match(html,/campus-wallet-card"><span>TEST MONEY<\/span><strong>GH₵60.00/);assert.match(html,/Current display name/);assert.doesNotMatch(html,/Original display name/);assert.match(html,/31 of 31 activity entries shown/);assert.match(html,/All activity loaded/);assert.equal((html.match(/<article>/g)||[]).length,31);
});

test('an older server revision cannot roll wallet fields or totals back even when its history request was issued later',async()=>{
 globalThis.sessionStorage=new Storage();
 const entries=Array.from({length:30},(_,index)=>({id:'revision-'+index,type:'merchant-payment',amount:-1,createdAt:new Date(Date.parse('2026-11-11T12:00:00Z')-index*1000).toISOString()}));
 const page=(revision,balance,name,rows,next,total)=>({revision,student:{id:'revision-wallet',name,balance,entries:clone(rows)},entries:clone(rows),history:{nextCursor:next,total,limit:25}});
 const api=async(path,options={})=>{
  if(path==='/api/student')return page(2,5000,'Old wallet name',entries.slice(0,25),'tail',30);
  if(path==='/api/student/fund')return page(5,6000,'Current wallet name',[{id:'new-funded-entry',type:'test-funding',amount:options.body.amount,createdAt:'2026-11-11T12:01:00Z'},...entries.slice(0,24)],'new-head',31);
  if(path.startsWith('/api/student?'))return page(3,5000,'Old wallet name',entries.slice(25),null,30);
  throw Error('Unexpected request '+path);
 };
 const ui=createCampusPay({api});await ui.openWallet();await ui.handleClick('campus-pay-fund');await ui.handleSubmit(form('fund',{fundAmount:'10.00'}));await ui.handleClick('campus-pay-history-more');
 const html=ui.render();assert.match(html,/campus-wallet-card"><span>TEST MONEY<\/span><strong>GH₵60.00/);assert.match(html,/Current wallet name/);assert.doesNotMatch(html,/Old wallet name/);assert.match(html,/31 of 31 activity entries shown/);assert.equal((html.match(/<article>/g)||[]).length,31);
});

test('an authoritative matching wallet receipt can resolve a legacy unbound reference without resubmission',async()=>{
 const s=setup({balance:4000});
 s.student().entries.push({id:'legacy-entry',attemptId:'legacy-known',shopId:'shop-a',type:'merchant-payment',status:'paid',amount:-1000,reference:'LM-LEGACY-KNOWN',createdAt:'2026-11-11T11:00:00Z'});
 sessionStorage.setItem('lumo-campus-payment-attempt-v1',JSON.stringify({payload:{shopId:'shop-a',amount:1000,attemptId:'legacy-known'},submitted:true,context:s.quote}));
 const ui=createCampusPay({api:s.api});await ui.open('shop-a');assert.match(ui.render(),/Payment confirmed/);assert.match(ui.render(),/LM-LEGACY-KNOWN/);assert.equal(s.counts().paymentWrites,0);assert.equal(sessionStorage.getItem('lumo-campus-payment-attempt-v1'),null);
});
