import test from 'node:test';
import assert from 'node:assert/strict';
import {createCashier} from '../dist/cashier.js';
import {renderCollections,renderAdministration} from '../dist/collections-ui.js';

const click=(view,action,extra={})=>view.handleClick({dataset:{action:'cashier-'+action,...extra}});
const request=(id,extra={})=>({id,shopId:'shop-a',staffId:'cashier-a',counterId:'counter-a',amount:2500,description:'Lunch',status:'open',createdAt:'2026-11-17T10:00:00Z',expiresAt:'2099-11-17T10:15:00Z',...extra});
const receipt=(id,extra={})=>({id,shopId:'shop-a',staffId:'cashier-a',counterId:'counter-a',amount:2500,status:'paid',payer:'Member',reference:'LM-'+id,confirmedAt:new Date().toISOString(),...extra});
function fixture({counter=true,sample=false}={}){
 const state={business:{id:'business-a'},shops:[{id:'shop-a',name:'Night Market',accepting:true,open:true}],staff:[],requests:[],transactions:[],refunds:[],shifts:[{id:'shift-a',shopId:'shop-a',staffId:'cashier-a',status:'open'}]};
 let counterState=counter?{id:'counter-a',shopId:'shop-a',locked:false,shiftId:'shift-a',mode:'dedicated'}:null,actor={shopId:'shop-a',staffId:'cashier-a'},connection='online',session={id:'session-a',businessId:'business-a'};
 const saved=new Map(),calls=[];
 const config={getState:()=>state,getActor:()=>actor,getCounter:()=>counterState,getShop:()=>state.shops[0],getSession:()=>session,getConnectivity:()=>connection,isSample:()=>sample,onLoyalty:payload=>calls.push(payload),storage:{getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)},qrSvg:()=>'<svg></svg>',paymentLink:()=>'/pay'};
 return {state,config,calls,saved,view:createCashier(config),lock:()=>{counterState={...counterState,locked:true};},offline:()=>{connection='offline';},switchActor:()=>{actor={shopId:'shop-b',staffId:'cashier-b'};session={...session,id:'session-b'};}};
}

test('personal and unlocked paired cashiers can open loyalty with the exact amount draft without posting a payment',async()=>{
 for(const counter of [false,true]){
  const f=fixture({counter});f.view.handleChange({name:'cashierAmount',value:'25.50'});f.view.handleChange({name:'cashierNote',value:'Lunch'});
  assert.match(f.view.render(),/Customer loyalty/);await click(f.view,'loyalty');
  assert.deepEqual(f.calls,[{shopId:'shop-a',returnTo:'cashier',amount:2550,description:'Lunch'}]);
  assert.equal(f.state.requests.length,0);assert.equal(f.saved.size,0);assert.match(f.view.render(),/value="25.50"/);
 }
});

test('loyalty is not offered or opened from a locked counter or browser sample',async()=>{
 const sample=fixture({sample:true});assert.doesNotMatch(sample.view.render(),/Customer loyalty/);await click(sample.view,'loyalty');assert.equal(sample.calls.length,0);
 const locked=fixture();locked.lock();assert.doesNotMatch(locked.view.render(),/Customer loyalty/);await click(locked.view,'loyalty');assert.equal(locked.calls.length,0);
});

test('offline and unresolved payment creation cannot become a second loyalty collection',async()=>{
 const offline=fixture();offline.offline();await click(offline.view,'loyalty');assert.equal(offline.calls.length,0);
 const f=fixture();let paymentCalls=0;f.config.onCreateRequest=async()=>{paymentCalls++;throw new Error('Response lost');};
 f.view.handleChange({name:'cashierAmount',value:'25.00'});await click(f.view,'create');const saved=[...f.saved.values()];
 await click(f.view,'loyalty');assert.equal(f.calls.length,0);assert.equal(paymentCalls,1);assert.deepEqual([...f.saved.values()],saved);
 assert.match(f.view.render(),/Retrieve the outstanding payment QR/);
});

test('an existing waiting QR only passes its original request for member association',async()=>{
 const f=fixture();f.state.requests.push(request('original'));const before=JSON.stringify(f.state.requests);
 await click(f.view,'request',{id:'original'});assert.match(f.view.render(),/Link a loyalty member/);await click(f.view,'loyalty-request');
 assert.deepEqual(f.calls,[{shopId:'shop-a',returnTo:'cashier',requestId:'original',amount:2500,description:'Lunch'}]);assert.equal(JSON.stringify(f.state.requests),before);
});

test('processing requests cannot be replaced by a new loyalty request through the menu or stale actions',async()=>{
 const f=fixture();f.state.requests.push(request('original'));f.state.transactions.push(receipt('processing',{requestId:'original',status:'processing'}));
 await click(f.view,'request',{id:'original'});assert.doesNotMatch(f.view.render(),/Link a loyalty member/);await click(f.view,'loyalty-request');await click(f.view,'menu');await click(f.view,'loyalty');
 assert.equal(f.calls.length,0);assert.match(f.view.render(),/Wait for this payment to be confirmed/);
});

test('only a confirmed accessible receipt with a remaining purchase is offered for loyalty',async()=>{
 const f=fixture();f.state.transactions.push(receipt('mine'),receipt('other-shop',{shopId:'shop-b'}),receipt('pending',{status:'processing'}),receipt('returned'));
 f.state.refunds.push({id:'refund',transactionId:'returned',amount:2500,status:'paid'});
 await click(f.view,'receipt',{id:'mine'});assert.match(f.view.render(),/Link this purchase to loyalty/);await click(f.view,'loyalty-receipt');
 assert.deepEqual(f.calls,[{shopId:'shop-a',returnTo:'cashier',transactionId:'mine'}]);
 for(const id of ['other-shop','pending','returned','missing'])await click(f.view,'loyalty-receipt',{id});
 assert.equal(f.calls.length,1);
});

test('the loyalty menu at a confirmed request opens that receipt rather than starting another collection',async()=>{
 const f=fixture();f.state.requests.push(request('paid-request'));f.state.transactions.push(receipt('paid',{requestId:'paid-request'}));
 await click(f.view,'request',{id:'paid-request'});await click(f.view,'menu');await click(f.view,'loyalty');
 assert.deepEqual(f.calls,[{shopId:'shop-a',returnTo:'cashier',transactionId:'paid'}]);
 assert.equal(f.state.requests.length,1);
});

test('cashier can display only a server-created request within its current shop and operator scope',()=>{
 const f=fixture();f.state.requests.push(request('loyalty-net',{amount:2000}),request('other-shop',{shopId:'shop-b'}),request('other-counter',{counterId:'counter-b',staffId:'cashier-b'}));
 assert.equal(f.view.openRequest('other-shop'),false);assert.equal(f.view.openRequest('other-counter'),false);assert.equal(f.view.openRequest('loyalty-net'),true);
 assert.match(f.view.render(),/GH₵ 20.00/);assert.match(f.view.render(),/Ready to scan/);
 f.lock();assert.equal(f.view.openRequest('loyalty-net'),false);assert.doesNotMatch(f.view.render(),/GH₵ 20.00|Ready to scan/);
});

test('cashier preserves the unresolved original attempt instead of opening a different server request',async()=>{
 const f=fixture();f.config.onCreateRequest=async()=>{throw new Error('Response lost');};f.view.handleChange({name:'cashierAmount',value:'25.00'});await click(f.view,'create');
 f.state.requests.push(request('different'));assert.equal(f.view.openRequest('different'),false);assert.match(f.view.render(),/Retrieve payment QR/);
});

test('an unknown loyalty request blocks before creating a second ordinary attempt and stays reachable',async()=>{
 const f=fixture();let requestCalls=0;f.config.hasPendingLoyaltyCollection=()=>true;f.config.onCreateRequest=()=>{requestCalls++;};
 f.view.handleChange({name:'cashierAmount',value:'25.00'});await click(f.view,'create');
 assert.equal(requestCalls,0);assert.equal(f.saved.size,0);assert.match(f.view.render(),/saved loyalty payment request needs an outcome/);assert.doesNotMatch(f.view.render(),/Retrieve payment QR/);
 await click(f.view,'loyalty');assert.equal(f.calls.length,1);
});

test('a definitive local loyalty guard rejection clears only the unposted ordinary attempt',async()=>{
 const f=fixture();f.config.onCreateRequest=async()=>{throw Object.assign(new Error('Resolve loyalty first'),{code:'LOYALTY_COLLECTION_PENDING',definitiveNoMutation:true});};
 f.view.handleChange({name:'cashierAmount',value:'25.00'});await click(f.view,'create');
 assert.equal(f.saved.size,0);assert.doesNotMatch(f.view.render(),/Retrieve payment QR/);await click(f.view,'loyalty');assert.equal(f.calls.length,1);
 const unknown=fixture();unknown.config.onCreateRequest=async()=>{throw Object.assign(new Error('Response lost'),{code:'LOYALTY_COLLECTION_PENDING'});};unknown.view.handleChange({name:'cashierAmount',value:'25.00'});await click(unknown.view,'create');assert.equal(unknown.saved.size,1);
});

function collectionFixture(extra={}){
 return {state:{business:{name:'Ama Kitchen'},transactions:[],requests:[],refunds:[]},ui:{role:'owner',collectMode:'amount',charge:'25',collectionNote:''},shop:{id:'shop-a',name:'Night Market',code:'LUM1',accepting:true,open:true},metrics:{balance:0,currentNet:0},shopMetrics:{currentNet:0},money:value=>'GH₵ '+value,E:String,icon:()=>'',qrSvg:()=>'',paymentLink:()=>'',time:String,shops:[],shared:true,registered:true,loyaltyAvailable:true,...extra};
}

test('owner and manager collection entry preserves pending-request guard and sample separation',()=>{
 assert.match(renderCollections(collectionFixture()),/data-action="loyalty-open"/);
 assert.match(renderCollections(collectionFixture({pending:true})),/data-action="loyalty-open" disabled/);
 assert.match(renderCollections(collectionFixture({submitting:true})),/data-action="loyalty-open" disabled/);
 assert.doesNotMatch(renderCollections(collectionFixture({shared:false})),/data-action="loyalty-open"/);
 assert.doesNotMatch(renderCollections(collectionFixture({loyaltyAvailable:false})),/data-action="loyalty-open"/);
});

test('administration offers a loyalty route without leaking owner programme controls to shop staff',()=>{
 const owner=renderAdministration(collectionFixture());assert.match(owner,/data-page="loyalty"/);assert.match(owner,/Customers &amp; loyalty|Customers & loyalty/);
 const manager=renderAdministration(collectionFixture({ui:{role:'manager'}}));assert.match(manager,/data-page="loyalty"/);assert.match(manager,/Find a member and use eligible rewards/);assert.doesNotMatch(manager,/Your members, programme rules and rewards/);
 assert.doesNotMatch(renderAdministration(collectionFixture({registered:false})),/data-page="loyalty"/);
});
