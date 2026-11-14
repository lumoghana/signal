import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createD1} from '../scripts/d1-adapter.mjs';
import {handleAPI} from '../server/api.js';
import {createCampusPay} from '../dist/campus-pay.js';

globalThis.FormData=class{constructor(form){this.values=Object.entries(form.values||{})}*[Symbol.iterator](){yield* this.values}};
globalThis.sessionStorage={getItem(){return null},setItem(){},removeItem(){}};
const form=(kind,values)=>({dataset:{campusForm:kind},values});
function migrate(DB){for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(file=>file.endsWith('.sql')).sort())DB.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));}
class MemoryStorage{constructor(){this.values=new Map()}getItem(key){return this.values.get(key)||null}setItem(key,value){this.values.set(key,String(value))}removeItem(key){this.values.delete(key)}}
function harness(){
 const DB=createD1();migrate(DB);const env={DB};
 function client(){
  const cookies=new Map();
  return async(path,options={})=>{
   const headers={'X-Lumo-Request':'1',Origin:'https://campus.test','cf-connecting-ip':'test-'+crypto.randomUUID()};
   if(cookies.size)headers.Cookie=[...cookies].map(([k,v])=>`${k}=${v}`).join('; ');
   if(options.body!==undefined)headers['Content-Type']='application/json';
   const response=await handleAPI(new Request('https://campus.test'+path,{method:options.method||'GET',headers,...(options.body===undefined?{}:{body:JSON.stringify(options.body)})}),env);
   for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1))}
   const data=await response.json();if(!response.ok)throw Object.assign(Error(typeof data.error==='string'?data.error:data.error?.message||data.message||'API request failed'),{code:data.error?.code||data.code,status:response.status});return data;
  };
 }
 return {client,close:()=>DB.close()};
}
const registration=suffix=>({attemptId:'campus-signup-'+suffix,name:'Campus Kitchen '+suffix,ownerName:'Akua Test',phone:'0245550100',businessType:'sole-trader',destination:'Sandbox Bank · 123456',verification:{phone:true,identity:true,face:true},shop:{name:'Night Market '+suffix,area:'Night Market',category:'Food & drinks',lat:5.6509,lng:-0.1878},credentials:{username:'campus.'+suffix.replace(/[^a-z0-9]/gi,'').slice(0,10)+'.owner',password:'OwnerTest1234'}});

test('Campus Pay controller connects real shared API wallet debit, owner receipt, close and student refund activity',async()=>{
 globalThis.sessionStorage=new MemoryStorage();
 const DB=createD1();migrate(DB);const env={DB};
 function client(){
  const cookies=new Map();
  return async(path,options={})=>{
   const headers={'X-Lumo-Request':'1',Origin:'https://campus.test','cf-connecting-ip':'test-'+crypto.randomUUID()};
   if(cookies.size)headers.Cookie=[...cookies].map(([k,v])=>`${k}=${v}`).join('; ');
   if(options.body!==undefined)headers['Content-Type']='application/json';
   const response=await handleAPI(new Request('https://campus.test'+path,{method:options.method||'GET',headers,...(options.body===undefined?{}:{body:JSON.stringify(options.body)})}),env);
   for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1))}
   const data=await response.json();if(!response.ok)throw Object.assign(Error(typeof data.error==='string'?data.error:data.error?.message||data.message||'API request failed'),{code:data.error?.code||data.code,status:response.status});return data;
  };
 }
 try{
  const owner=client(),student=client();
  const signup=await owner('/api/signup',{method:'POST',body:{attemptId:'campus-api-first-signup',name:'Campus API Kitchen',ownerName:'Akua Test',phone:'0245550100',businessType:'sole-trader',destination:'Sandbox Bank · 123456',verification:{phone:true,identity:true,face:true},shop:{name:'Night Market API Counter',area:'Night Market',category:'Food & drinks',lat:5.6509,lng:-0.1878},credentials:{username:'campus.api.owner',password:'OwnerTest1234'}}});
  const shop=signup.state.shops[0],controller=createCampusPay({api:student});
  await controller.open(shop,{method:'qr'});assert.match(controller.render(),/Try Campus Pay/);
  await controller.handleSubmit(form('create',{name:'Campus API Student'}));
  await controller.handleSubmit(form('amount',{amount:'12.34'}));await controller.handleClick('campus-pay-confirm');
  assert.match(controller.render(),/One final check/);assert.match(controller.render(),/insufficient funds/);assert.doesNotMatch(controller.render(),/Payment confirmed/);
  await controller.handleClick('campus-pay-fund');await controller.handleSubmit(form('fund',{fundAmount:'50.00'}));
  let wallet=await student('/api/student');assert.equal(wallet.student.balance,5000);
  await controller.handleSubmit(form('amount',{amount:'12.34'}));assert.match(controller.render(),/One final check/);
  let business=await owner('/api/session');assert.equal(business.metrics.balance,0);
  await controller.handleClick('campus-pay-confirm');assert.match(controller.render(),/Payment confirmed/);assert.match(controller.render(),/Campus API Kitchen/);
  wallet=await student('/api/student');assert.equal(wallet.student.balance,3766);assert.equal(wallet.student.entries[0].type,'merchant-payment');
  business=await owner('/api/session');assert.equal(business.metrics.balance,1234);assert.equal(business.state.transactions.length,1);assert.equal(business.state.transactions[0].shopId,shop.id);
  const payment=business.state.transactions[0];assert.match(controller.render(),new RegExp(payment.reference));
  const closed=await owner('/api/action',{method:'POST',body:{type:'CLOSE_DAY',payload:{shopId:shop.id}}});assert.equal(closed.metrics.balance,1234);assert.equal(closed.metrics.currentNet,0);
  await owner('/api/action',{method:'POST',body:{type:'REFUND',payload:{transactionId:payment.id,amount:1234,reason:'Campus API test refund',attemptId:'campus-api-first-refund'}}});
  await controller.openWallet();assert.match(controller.render(),/Refund received/);assert.match(controller.render(),/\+GH₵12.34/);
  wallet=await student('/api/student');assert.equal(wallet.student.balance,5000);
 }finally{DB.close()}
});

test('a real committed funding response followed by DOM TimeoutError retries the identical reference and never credits twice',async()=>{
 const h=harness();globalThis.sessionStorage=new MemoryStorage();
 try{
  const student=h.client();await student('/api/student/open',{method:'POST',body:{name:'Timeout Student'}});
  let timedOut=false;const references=[];
  const api=async(path,options={})=>{const result=await student(path,options);if(path==='/api/student/fund'){references.push(options.body.attemptId);if(!timedOut){timedOut=true;throw new DOMException('The operation timed out.','TimeoutError')}}return result;};
  const ui=createCampusPay({api});await ui.openWallet();await ui.handleClick('campus-pay-fund');
  await ui.handleSubmit(form('fund',{fundAmount:'25.00'}));
  assert.equal(new DOMException('Timed out','TimeoutError').code,23);
  assert.ok(globalThis.sessionStorage.getItem('lumo-campus-funding-attempt-v1'));assert.match(ui.render(),/Check test-money addition/);
  assert.equal((await student('/api/student')).student.balance,2500);
  ui.hide();const resumed=createCampusPay({api});await resumed.openWallet();await resumed.handleClick('campus-pay-fund');
  await resumed.handleSubmit(form('fund',{fundAmount:'25.00'}));
  const wallet=(await student('/api/student')).student;
  assert.equal(references.length,2);assert.equal(references[0],references[1]);assert.equal(wallet.balance,2500);assert.equal(wallet.entries.filter(entry=>entry.type==='test-funding').length,1);assert.equal(globalThis.sessionStorage.getItem('lumo-campus-funding-attempt-v1'),null);
 }finally{h.close()}
});

test('a real GH1500 merchant request can be reviewed and paid from a GH2000 demo wallet',async()=>{
 const h=harness();globalThis.sessionStorage=new MemoryStorage();
 try{
  const owner=h.client(),student=h.client();
  const registered=await owner('/api/signup',{method:'POST',body:registration('large-payment')}),shopId=registered.state.shops[0].id,testKey=registered.state.shops[0].testAcceptanceToken;
  const request=await owner('/api/action',{method:'POST',body:{type:'CREATE_REQUEST',payload:{shopId,amount:150000}}});
  await student('/api/student/open',{method:'POST',body:{name:'Large Payment Student'}});
  for(const attemptId of ['large-fund-one','large-fund-two'])await student('/api/student/fund',{method:'POST',body:{amount:100000,confirmSandbox:true,attemptId}});
  const ui=createCampusPay({api:student});await ui.open(shopId,{requestId:request.entity.id,testKey});assert.match(ui.render(),/readonly/);
  await ui.handleSubmit(form('amount',{amount:'1500.00'}));assert.match(ui.render(),/One final check/);
  await ui.handleClick('campus-pay-confirm');assert.match(ui.render(),/Payment confirmed/);assert.match(ui.render(),/GH₵1,500.00/);
  assert.equal((await student('/api/student')).student.balance,50000);assert.equal((await owner('/api/session')).metrics.balance,150000);
 }finally{h.close()}
});

test('student wallet cursor history reaches records beyond the first hundred and remains honest about new arrivals',async()=>{
 const h=harness();globalThis.sessionStorage=new MemoryStorage();
 try{
  const owner=h.client(),student=h.client(),registered=await owner('/api/signup',{method:'POST',body:registration('history')});
  const shopId=registered.state.shops[0].id,testKey=registered.state.shops[0].testAcceptanceToken;
  await student('/api/student/open',{method:'POST',body:{name:'History Student'}});
  await student('/api/student/fund',{method:'POST',body:{amount:100000,confirmSandbox:true,attemptId:'history-fund'}});
  for(let index=0;index<105;index++)await student('/api/payments',{method:'POST',body:{shopId,testKey,amount:1,attemptId:'history-payment-'+index,method:'qr'}});
  const first=await student('/api/student');assert.equal(first.entries.length,25);assert.equal(first.history.total,106);assert.ok(first.history.nextCursor);
  const otherStudent=h.client();await otherStudent('/api/student/open',{method:'POST',body:{name:'Other Student'}});
  await assert.rejects(()=>otherStudent('/api/student?'+new URLSearchParams({cursor:first.history.nextCursor,limit:'25'})));
  const ui=createCampusPay({api:student});await ui.openWallet();assert.match(ui.render(),/25 of 106 activity entries shown/);
  await ui.handleClick('campus-pay-history-more');assert.match(ui.render(),/50 of 106 activity entries shown/);
  await student('/api/payments',{method:'POST',body:{shopId,testKey,amount:1,attemptId:'history-new-head',method:'qr'}});
  for(let index=0;index<10&&ui.render().includes('Load older activity');index++)await ui.handleClick('campus-pay-history-more');
  assert.match(ui.render(),/106 of 107 activity entries shown/);assert.match(ui.render(),/Refresh new activity/);assert.doesNotMatch(ui.render(),/All activity loaded/);
  assert.match(ui.render(),/Test money added/);
  await ui.handleClick('campus-pay-refresh-wallet');
  for(let index=0;index<10&&ui.render().includes('Load older activity');index++)await ui.handleClick('campus-pay-history-more');
  assert.match(ui.render(),/107 of 107 activity entries shown/);assert.match(ui.render(),/All activity loaded/);assert.equal((ui.render().match(/<article>/g)||[]).length,107);
  assert.equal((await student('/api/student')).student.balance,100000-106);
 }finally{h.close()}
});

test('a shop paused after payment review rejects without debit and lets the student pay another shop',async()=>{
 const h=harness();globalThis.sessionStorage=new MemoryStorage();
 try{
  const owner=h.client(),student=h.client(),registered=await owner('/api/signup',{method:'POST',body:registration('pausedreview')});
  const first=registered.state.shops[0];
  const added=await owner('/api/action',{method:'POST',body:{type:'ADD_SHOP',payload:{name:'Another counter',area:'Pentagon',category:'Other',lat:5.6535,lng:-.1845}}});
  const second=added.entity;
  await student('/api/student/open',{method:'POST',body:{name:'Paused Review Student'}});
  await student('/api/student/fund',{method:'POST',body:{amount:5000,confirmSandbox:true,attemptId:'paused-review-fund'}});
  const ui=createCampusPay({api:student});await ui.open(first);await ui.handleSubmit(form('amount',{amount:'10.00'}));
  await owner('/api/action',{method:'POST',body:{type:'UPDATE_SHOP',payload:{id:first.id,accepting:false}}});
  await ui.handleClick('campus-pay-confirm');assert.match(ui.render(),/Payment is unavailable/);assert.match(ui.render(),/before any wallet debit/);assert.doesNotMatch(ui.render(),/Checking this payment/);
  assert.equal(globalThis.sessionStorage.getItem('lumo-campus-payment-attempt-v1'),null);
  assert.equal((await student('/api/student')).student.balance,5000);assert.equal((await owner('/api/session')).state.transactions.length,0);
  ui.hide();const resumed=createCampusPay({api:student});await resumed.open(second);assert.match(resumed.render(),/Another counter/);assert.match(resumed.render(),/Pay the right counter/);
  await resumed.handleSubmit(form('amount',{amount:'5.00'}));await resumed.handleClick('campus-pay-confirm');assert.match(resumed.render(),/Payment confirmed/);
  const business=await owner('/api/session');assert.equal(business.state.transactions.length,1);assert.equal(business.state.transactions[0].shopId,second.id);assert.equal(business.state.transactions[0].amount,500);assert.equal((await student('/api/student')).student.balance,4500);
 }finally{h.close()}
});

test('a delayed real history page extends loaded activity without undoing a later test-money addition',async()=>{
 const h=harness();globalThis.sessionStorage=new MemoryStorage();
 try{
  const owner=h.client(),student=h.client(),registered=await owner('/api/signup',{method:'POST',body:registration('historyfundrace')}),shopId=registered.state.shops[0].id,testKey=registered.state.shops[0].testAcceptanceToken;
  await student('/api/student/open',{method:'POST',body:{name:'History Funding Student'}});
  await student('/api/student/fund',{method:'POST',body:{amount:10000,confirmSandbox:true,attemptId:'history-fund-race-initial'}});
  for(let index=0;index<30;index++)await student('/api/payments',{method:'POST',body:{shopId,testKey,amount:1,attemptId:'history-fund-race-payment-'+index,method:'qr'}});
  let release,capturedResolve,delay=true;const captured=new Promise(resolve=>capturedResolve=resolve);
  const ui=createCampusPay({api:async(path,options)=>{const result=await student(path,options);if(delay&&path.startsWith('/api/student?')){delay=false;capturedResolve();return new Promise(resolve=>release=()=>resolve(result))}return result}});
  await ui.openWallet();assert.match(ui.render(),/25 of 31 activity entries shown/);const loading=ui.handleClick('campus-pay-history-more');await captured;
  await ui.handleClick('campus-pay-fund');await ui.handleSubmit(form('fund',{fundAmount:'10.00'}));assert.match(ui.render(),/campus-wallet-card"><span>TEST MONEY<\/span><strong>GH₵109.70/);
  release();await loading;
  const html=ui.render(),remote=(await student('/api/student')).student;
  assert.equal(remote.balance,10970);assert.match(html,/campus-wallet-card"><span>TEST MONEY<\/span><strong>GH₵109.70/);assert.match(html,/\+GH₵10.00/);assert.match(html,/32 of 32 activity entries shown/);assert.match(html,/All activity loaded/);assert.equal((html.match(/<article>/g)||[]).length,32);
  await ui.handleClick('campus-pay-refresh-wallet');while(ui.render().includes('Load older activity'))await ui.handleClick('campus-pay-history-more');assert.match(ui.render(),/32 of 32 activity entries shown/);assert.equal((ui.render().match(/<article>/g)||[]).length,32);
 }finally{h.close()}
});

test('a refreshed real refund head invalidates an older in-flight history cursor without losing funds or pagination',async()=>{
 const h=harness();globalThis.sessionStorage=new MemoryStorage();
 try{
  const owner=h.client(),student=h.client(),registered=await owner('/api/signup',{method:'POST',body:registration('historyrefundrace')}),shopId=registered.state.shops[0].id,testKey=registered.state.shops[0].testAcceptanceToken;
  await student('/api/student/open',{method:'POST',body:{name:'History Refund Student'}});
  await student('/api/student/fund',{method:'POST',body:{amount:10000,confirmSandbox:true,attemptId:'history-refund-race-initial'}});
  const payments=[];for(let index=0;index<30;index++)payments.push(await student('/api/payments',{method:'POST',body:{shopId,testKey,amount:1,attemptId:'history-refund-race-payment-'+index,method:'qr'}}));
  let release,capturedResolve,delay=true;const captured=new Promise(resolve=>capturedResolve=resolve);
  const ui=createCampusPay({api:async(path,options)=>{const result=await student(path,options);if(delay&&path.startsWith('/api/student?')){delay=false;capturedResolve();return new Promise(resolve=>release=()=>resolve(result))}return result}});
  await ui.openWallet();const loading=ui.handleClick('campus-pay-history-more');await captured;
  await owner('/api/action',{method:'POST',body:{type:'REFUND',payload:{transactionId:payments[0].payment.id,amount:1,reason:'History race check',attemptId:'history-race-refund'}}});
  await ui.handleClick('campus-pay-refresh-wallet');assert.match(ui.render(),/campus-wallet-card"><span>TEST MONEY<\/span><strong>GH₵99.71/);assert.match(ui.render(),/Refund received/);assert.match(ui.render(),/25 of 32 activity entries shown/);
  release();await loading;
  assert.match(ui.render(),/25 of 32 activity entries shown/,'An old cursor must not advance a newly refreshed history chain');assert.match(ui.render(),/campus-wallet-card"><span>TEST MONEY<\/span><strong>GH₵99.71/);
  while(ui.render().includes('Load older activity'))await ui.handleClick('campus-pay-history-more');assert.match(ui.render(),/32 of 32 activity entries shown/);assert.match(ui.render(),/All activity loaded/);assert.equal((ui.render().match(/<article>/g)||[]).length,32);assert.equal((await student('/api/student')).student.balance,9971);
 }finally{h.close()}
});

test('unavailable or silently failing storage prevents new real API payment and funding requests',async()=>{
 for(const mode of ['throw','silent','malformed']){
  const h=harness(),owner=h.client(),student=h.client();let paymentCalls=0,fundCalls=0;
  const values=new Map();globalThis.sessionStorage={getItem:key=>mode==='malformed'?'invalid saved reference':values.get(key)||null,setItem(){if(mode==='throw')throw new DOMException('Storage denied','SecurityError')},removeItem:key=>values.delete(key)};
  try{
   const registered=await owner('/api/signup',{method:'POST',body:registration('storage-'+mode)}),shopId=registered.state.shops[0].id,testKey=registered.state.shops[0].testAcceptanceToken;
   await student('/api/student/open',{method:'POST',body:{name:'Storage Failure Student'}});await student('/api/student/fund',{method:'POST',body:{amount:5000,confirmSandbox:true,attemptId:'initial-storage-'+mode}});
   const api=async(path,options)=>{if(path==='/api/payments')paymentCalls++;if(path==='/api/student/fund')fundCalls++;return student(path,options)};
   const ui=createCampusPay({api});await ui.open(shopId,{testKey});await ui.handleSubmit(form('amount',{amount:'10.00'}));await ui.handleClick('campus-pay-confirm');
   assert.match(ui.render(),/could not safely save/);assert.match(ui.render(),/One final check/);assert.equal(paymentCalls,0);
   ui.hide();await ui.open(shopId,{testKey});await ui.handleSubmit(form('amount',{amount:'10.00'}));await ui.handleClick('campus-pay-confirm');assert.equal(paymentCalls,0);
   await ui.handleClick('campus-pay-fund');await ui.handleSubmit(form('fund',{fundAmount:'10.00'}));assert.match(ui.render(),/could not safely save/);assert.equal(fundCalls,0);
   assert.equal((await student('/api/student')).student.balance,5000);assert.equal((await owner('/api/session')).state.transactions.length,0);
  }finally{h.close()}
 }
});

test('a committed payment keeps its in-memory reference through storage failure and close/reopen',async()=>{
 const h=harness();let blocked=false;const storage=new MemoryStorage();globalThis.sessionStorage={getItem(key){if(blocked)throw Error('storage denied');return storage.getItem(key)},setItem(key,value){if(blocked)throw Error('storage denied');storage.setItem(key,value)},removeItem(key){if(blocked)throw Error('storage denied');storage.removeItem(key)}};
 try{
  const owner=h.client(),student=h.client(),registered=await owner('/api/signup',{method:'POST',body:registration('memory-resume')}),shopId=registered.state.shops[0].id,testKey=registered.state.shops[0].testAcceptanceToken;
  await student('/api/student/open',{method:'POST',body:{name:'Memory Resume Student'}});await student('/api/student/fund',{method:'POST',body:{amount:5000,confirmSandbox:true,attemptId:'memory-initial'}});
  const references=[];let lose=true;
  const api=async(path,options)=>{
   if(path==='/api/payments'){references.push(options.body.attemptId);const result=await student(path,options);if(lose){lose=false;blocked=true;throw Error('Committed response lost')}return result}
   const result=await student(path,options);
   // Keep the receipt out of this status page to require a retry of the original attempt.
   if(path==='/api/student'&&blocked){result.entries=[];result.student.entries=[]}return result;
  };
  const ui=createCampusPay({api});await ui.open(shopId,{testKey});await ui.handleSubmit(form('amount',{amount:'10.00'}));await ui.handleClick('campus-pay-confirm');assert.match(ui.render(),/Checking this payment/);
  ui.hide();await ui.open(shopId,{testKey});assert.match(ui.render(),/Checking this payment/);await ui.handleClick('campus-pay-confirm');assert.equal(references.length,1,'blocked storage cannot send another request');assert.match(ui.render(),/could not safely save/);
  blocked=false;await ui.handleClick('campus-pay-confirm');assert.equal(references.length,2);assert.equal(references[0],references[1]);assert.match(ui.render(),/Payment confirmed/);
  assert.equal((await student('/api/student')).student.balance,4000);assert.equal((await owner('/api/session')).state.transactions.length,1);
 }finally{h.close()}
});

test('a lost funding response stays recoverable in memory while browser storage becomes unavailable',async()=>{
 const h=harness(),storage=new MemoryStorage();let blocked=false;globalThis.sessionStorage={getItem(key){if(blocked)throw Error('storage denied');return storage.getItem(key)},setItem(key,value){if(blocked)throw Error('storage denied');storage.setItem(key,value)},removeItem(key){if(blocked)throw Error('storage denied');storage.removeItem(key)}};
 try{
  const student=h.client();await student('/api/student/open',{method:'POST',body:{name:'Funding Memory Student'}});let lose=true;const references=[];
  const api=async(path,options)=>{const result=await student(path,options);if(path==='/api/student/fund'){references.push(options.body.attemptId);if(lose){lose=false;blocked=true;throw Error('Committed response lost')}}return result};
  const ui=createCampusPay({api});await ui.openWallet();await ui.handleClick('campus-pay-fund');await ui.handleSubmit(form('fund',{fundAmount:'25.00'}));assert.match(ui.render(),/Check test-money addition/);
  ui.hide();await ui.openWallet();await ui.handleClick('campus-pay-fund');await ui.handleSubmit(form('fund',{fundAmount:'25.00'}));assert.equal(references.length,1);assert.match(ui.render(),/could not safely save/);
  blocked=false;await ui.handleSubmit(form('fund',{fundAmount:'25.00'}));assert.deepEqual(references,[references[0],references[0]]);assert.equal((await student('/api/student')).student.balance,2500);assert.equal((await student('/api/student')).entries.filter(x=>x.type==='test-funding').length,1);
 }finally{h.close()}
});

test('an older payment success cannot clear a newer unresolved payment reference',async()=>{
 const h=harness();globalThis.sessionStorage=new MemoryStorage();
 try{
  const owner=h.client(),student=h.client(),registered=await owner('/api/signup',{method:'POST',body:registration('stale-payment')}),shopId=registered.state.shops[0].id,testKey=registered.state.shops[0].testAcceptanceToken;
  await student('/api/student/open',{method:'POST',body:{name:'Stale Payment Student'}});await student('/api/student/fund',{method:'POST',body:{amount:5000,confirmSandbox:true,attemptId:'stale-payment-fund'}});
  let releaseFirst,firstReady;const ready=new Promise(resolve=>firstReady=resolve),references=[];let loseSecond=true;
  const api=async(path,options)=>{const result=await student(path,options);if(path==='/api/payments'){references.push(options.body.attemptId);if(references.length===1){firstReady();return new Promise(resolve=>releaseFirst=()=>resolve(result))}if(options.body.attemptId!==references[0]&&loseSecond){loseSecond=false;throw Error('Second committed response lost')}}return result};
  const ui=createCampusPay({api});await ui.open(shopId,{testKey});await ui.handleSubmit(form('amount',{amount:'10.00'}));const first=ui.handleClick('campus-pay-confirm');await ready;ui.hide();await ui.open(shopId,{testKey});await ui.handleClick('campus-pay-confirm');assert.match(ui.render(),/Payment confirmed/);
  await ui.open(shopId,{testKey});await ui.handleSubmit(form('amount',{amount:'10.00'}));await ui.handleClick('campus-pay-confirm');const pending=globalThis.sessionStorage.getItem('lumo-campus-payment-attempt-v1');assert.match(ui.render(),/Checking this payment/);
  releaseFirst();await first;assert.equal(globalThis.sessionStorage.getItem('lumo-campus-payment-attempt-v1'),pending);assert.match(ui.render(),/Checking this payment/);
  await ui.handleClick('campus-pay-confirm');assert.equal(references.length,3);assert.notEqual(references[0],references[1]);assert.equal(references[1],references[2]);assert.equal((await student('/api/student')).student.balance,3000);assert.equal((await owner('/api/session')).state.transactions.length,2);
 }finally{h.close()}
});

test('an unresolved purchase is bound to its original wallet across replacement and restoration',async()=>{
 const h=harness();globalThis.sessionStorage=new MemoryStorage();
 try{
  const owner=h.client(),a=h.client(),b=h.client(),registered=await owner('/api/signup',{method:'POST',body:registration('wallet-bind-pay')}),shopId=registered.state.shops[0].id,testKey=registered.state.shops[0].testAcceptanceToken;
  for(const [api,name,attemptId]of [[a,'Original Wallet','wallet-bind-a'],[b,'Replacement Wallet','wallet-bind-b']]){await api('/api/student/open',{method:'POST',body:{name}});await api('/api/student/fund',{method:'POST',body:{amount:5000,confirmSandbox:true,attemptId}})}
  let active=a,lose=true;const sent=[];
  const ui=createCampusPay({api:async(path,options)=>{if(path==='/api/payments')sent.push({...options.body});const result=await active(path,options);if(path==='/api/payments'&&lose){lose=false;throw Error('Committed payment response lost')}return result}});
  await ui.open(shopId,{testKey});await ui.handleSubmit(form('amount',{amount:'10.00'}));await ui.handleClick('campus-pay-confirm');assert.match(ui.render(),/Checking this payment/);
  const saved=JSON.parse(sessionStorage.getItem('lumo-campus-payment-attempt-v1'));assert.equal(saved.walletId,(await a('/api/student')).student.id);assert.equal(saved.payload.walletId,saved.walletId);
  active=b;ui.hide();await ui.open(shopId,{testKey});assert.match(ui.render(),/Your student wallet changed/);assert.match(ui.render(),new RegExp(saved.payload.attemptId));assert.doesNotMatch(ui.render(),/data-action="campus-pay-confirm"/);
  await ui.handleClick('campus-pay-confirm');await ui.handleSubmit(form('amount',{amount:'10.00'}));await ui.handleSubmit(form('fund',{fundAmount:'10.00'}));assert.equal(sent.length,1);assert.equal((await b('/api/student')).student.balance,5000);assert.equal((await owner('/api/session')).state.transactions.length,1);
  active=a;await ui.handleClick('campus-pay-retry');assert.match(ui.render(),/Payment confirmed/);await ui.handleClick('campus-pay-confirm');assert.equal(sent.length,1,'authoritative history resolves the original wallet without reposting');assert.equal((await a('/api/student')).student.balance,4000);assert.equal((await b('/api/student')).student.balance,5000);assert.equal((await owner('/api/session')).metrics.balance,1000);
 }finally{h.close()}
});

test('an unresolved funding request cannot credit a replacement wallet and resumes only in the original wallet',async()=>{
 const h=harness();globalThis.sessionStorage=new MemoryStorage();
 try{
  const a=h.client(),b=h.client();await a('/api/student/open',{method:'POST',body:{name:'Funding Original'}});await b('/api/student/open',{method:'POST',body:{name:'Funding Replacement'}});
  let active=a,lose=true;const sent=[];const ui=createCampusPay({api:async(path,options)=>{if(path==='/api/student/fund')sent.push({...options.body});const result=await active(path,options);if(path==='/api/student/fund'&&lose){lose=false;throw Error('Committed funding response lost')}return result}});
  await ui.openWallet();await ui.handleClick('campus-pay-fund');await ui.handleSubmit(form('fund',{fundAmount:'25.00'}));const saved=JSON.parse(sessionStorage.getItem('lumo-campus-funding-attempt-v1'));assert.equal(saved.walletId,(await a('/api/student')).student.id);
  active=b;ui.hide();await ui.openWallet();assert.match(ui.render(),/Your student wallet changed/);await ui.handleSubmit(form('fund',{fundAmount:'25.00'}));assert.equal(sent.length,1);assert.equal((await b('/api/student')).student.balance,0);
  active=a;await ui.handleClick('campus-pay-retry');await ui.handleClick('campus-pay-fund');await ui.handleSubmit(form('fund',{fundAmount:'25.00'}));assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);assert.equal((await a('/api/student')).student.balance,2500);assert.equal((await a('/api/student')).entries.filter(entry=>entry.type==='test-funding').length,1);
 }finally{h.close()}
});

test('wallet replacement while payment review stays open requires a new review without sending the old purchase',async()=>{
 const h=harness();globalThis.sessionStorage=new MemoryStorage();
 try{
  const owner=h.client(),a=h.client(),b=h.client(),registered=await owner('/api/signup',{method:'POST',body:registration('wallet-review')}),shopId=registered.state.shops[0].id,testKey=registered.state.shops[0].testAcceptanceToken;
  for(const [api,name,attemptId]of [[a,'Review Original','review-original'],[b,'Review Replacement','review-replacement']]){await api('/api/student/open',{method:'POST',body:{name}});await api('/api/student/fund',{method:'POST',body:{amount:5000,confirmSandbox:true,attemptId}})}
  let active=a,paymentCalls=0;const ui=createCampusPay({api:async(path,options)=>{if(path==='/api/payments')paymentCalls++;return active(path,options)}});
  await ui.open(shopId,{testKey});await ui.handleSubmit(form('amount',{amount:'10.00'}));active=b;await ui.handleClick('campus-pay-confirm');assert.match(ui.render(),/Your student wallet changed/);assert.equal(paymentCalls,0);
  ui.hide();await ui.open(shopId,{testKey});assert.match(ui.render(),/Pay the right counter/);await ui.handleSubmit(form('amount',{amount:'10.00'}));await ui.handleClick('campus-pay-confirm');assert.match(ui.render(),/Payment confirmed/);assert.equal(paymentCalls,1);assert.equal((await a('/api/student')).student.balance,5000);assert.equal((await b('/api/student')).student.balance,4000);
 }finally{h.close()}
});

test('legacy unbound payment and funding references fail closed rather than being rebound to a current wallet',async()=>{
 const h=harness();
 try{
  const owner=h.client(),student=h.client(),registered=await owner('/api/signup',{method:'POST',body:registration('legacy-wallet')}),shopId=registered.state.shops[0].id,testKey=registered.state.shops[0].testAcceptanceToken;
  await student('/api/student/open',{method:'POST',body:{name:'Legacy Reference Student'}});await student('/api/student/fund',{method:'POST',body:{amount:5000,confirmSandbox:true,attemptId:'legacy-starting-fund'}});
  for(const kind of ['payment','funding']){
   globalThis.sessionStorage=new MemoryStorage();let writes=0;const key=kind==='payment'?'lumo-campus-payment-attempt-v1':'lumo-campus-funding-attempt-v1';
   sessionStorage.setItem(key,JSON.stringify(kind==='payment'?{payload:{shopId,amount:1000,attemptId:'legacy-pending-pay'},submitted:true,context:{business:{name:'Legacy merchant'},shop:{id:shopId,name:'Legacy shop'}}}:{amount:1000,attemptId:'legacy-pending-fund',confirmSandbox:true}));
   const original=sessionStorage.getItem(key),ui=createCampusPay({api:async(path,options)=>{if(options?.method==='POST')writes++;return student(path,options)}});
   if(kind==='payment')await ui.open(shopId,{testKey});else await ui.openWallet();assert.match(ui.render(),/no wallet identity/);await ui.handleClick('campus-pay-confirm');await ui.handleSubmit(form('fund',{fundAmount:'10.00'}));assert.equal(writes,0);assert.equal(sessionStorage.getItem(key),original);
  }
 }finally{h.close()}
});

test('a delayed completed purchase cannot replace a newer wallet view with the old wallet',async()=>{
 const h=harness();globalThis.sessionStorage=new MemoryStorage();
 try{
  const owner=h.client(),a=h.client(),b=h.client(),registered=await owner('/api/signup',{method:'POST',body:registration('late-wallet')}),shopId=registered.state.shops[0].id,testKey=registered.state.shops[0].testAcceptanceToken;
  for(const [api,name,attemptId]of [[a,'Late Original','late-original'],[b,'Late Replacement','late-replacement']]){await api('/api/student/open',{method:'POST',body:{name}});await api('/api/student/fund',{method:'POST',body:{amount:5000,confirmSandbox:true,attemptId}})}
  let active=a,release,ready;const waiting=new Promise(resolve=>ready=resolve);const ui=createCampusPay({api:async(path,options)=>{const result=await active(path,options);if(path==='/api/payments'){ready();return new Promise(resolve=>release=()=>resolve(result))}return result}});
  await ui.open(shopId,{testKey});await ui.handleSubmit(form('amount',{amount:'10.00'}));const posting=ui.handleClick('campus-pay-confirm');await waiting;ui.hide();active=b;await ui.openWallet();assert.match(ui.render(),/Your student wallet changed/);release();await posting;
  await ui.handleClick('campus-pay-retry');assert.match(ui.render(),/Late Replacement/);assert.match(ui.render(),/GH₵50.00/);assert.doesNotMatch(ui.render(),/Late Original/);assert.equal((await owner('/api/session')).state.transactions.length,1);assert.equal((await b('/api/student')).student.balance,5000);
 }finally{h.close()}
});

test('the server rejects a wallet cookie change between the client preflight and payment submission',async()=>{
 const h=harness();globalThis.sessionStorage=new MemoryStorage();
 try{
  const owner=h.client(),a=h.client(),b=h.client(),registered=await owner('/api/signup',{method:'POST',body:registration('preflight-wallet')}),shopId=registered.state.shops[0].id,testKey=registered.state.shops[0].testAcceptanceToken;
  for(const [api,name,attemptId]of [[a,'Preflight Original','preflight-original'],[b,'Preflight Replacement','preflight-replacement']]){await api('/api/student/open',{method:'POST',body:{name}});await api('/api/student/fund',{method:'POST',body:{amount:5000,confirmSandbox:true,attemptId}})}
  let active=a,flip=false,paymentPosts=0;const ui=createCampusPay({api:async(path,options)=>{if(path==='/api/payments')paymentPosts++;const result=await active(path,options);if(path==='/api/student'&&flip){flip=false;active=b}return result}});
  await ui.open(shopId,{testKey});await ui.handleSubmit(form('amount',{amount:'10.00'}));flip=true;await ui.handleClick('campus-pay-confirm');assert.match(ui.render(),/Your student wallet changed/);assert.ok(sessionStorage.getItem('lumo-campus-payment-attempt-v1'));assert.equal(paymentPosts,1,'The API rejects the mismatched wallet before changing funds');assert.equal((await a('/api/student')).student.balance,5000);assert.equal((await b('/api/student')).student.balance,5000);assert.equal((await owner('/api/session')).state.transactions.length,0);
 }finally{h.close()}
});

test('a wallet change during the post-payment status read retains the original request instead of claiming the new wallet paid',async()=>{
 const h=harness();globalThis.sessionStorage=new MemoryStorage();
 try{
  const owner=h.client(),a=h.client(),b=h.client(),registered=await owner('/api/signup',{method:'POST',body:registration('status-wallet')}),shopId=registered.state.shops[0].id,testKey=registered.state.shops[0].testAcceptanceToken;
  for(const [api,name,attemptId]of [[a,'Status Original','status-original'],[b,'Status Replacement','status-replacement']]){await api('/api/student/open',{method:'POST',body:{name}});await api('/api/student/fund',{method:'POST',body:{amount:5000,confirmSandbox:true,attemptId}})}
  let active=a,posts=0;const ui=createCampusPay({api:async(path,options)=>{const result=await active(path,options);if(path==='/api/payments'){posts++;active=b}return result}});
  await ui.open(shopId,{testKey});await ui.handleSubmit(form('amount',{amount:'10.00'}));await ui.handleClick('campus-pay-confirm');assert.match(ui.render(),/Your student wallet changed/);assert.doesNotMatch(ui.render(),/Payment confirmed/);assert.ok(sessionStorage.getItem('lumo-campus-payment-attempt-v1'));await ui.handleClick('campus-pay-confirm');assert.equal(posts,1);assert.equal((await a('/api/student')).student.balance,4000);assert.equal((await b('/api/student')).student.balance,5000);assert.equal((await owner('/api/session')).state.transactions.length,1);
 }finally{h.close()}
});
