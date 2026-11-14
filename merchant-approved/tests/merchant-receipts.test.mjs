import test from 'node:test';
import assert from 'node:assert/strict';
import {receivingPayments,shopPaymentReceipts} from '../dist/merchant-receipts.js';
import {createCashier,cashierShiftSummary} from '../dist/cashier.js';
import {createDevices} from '../dist/devices.js';

const paid=(id,extra={})=>({id,shopId:'shop-a',payer:'MoMo guest · ••••4567',amount:2500,status:'paid',reference:'LM-'+id,confirmedAt:'2026-11-14T12:00:00Z',createdAt:'2026-11-14T12:00:00Z',...extra});
const click=(controller,action,dataset={})=>controller.handleClick({dataset:{action:'cashier-'+action,...dataset}});
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)}};

test('the receiving feed merges canonical and shop-only receipts by identity without assigning a cashier',()=>{
 const canonical=paid('counter',{staffId:'staff-a',counterId:'counter-a',shiftId:'shift-a',requestId:'request-a'});
 const state={transactions:[canonical],shopQRReceipts:[paid('static',{requestId:null}),paid('counter',{requestId:'request-a'}),paid('not-confirmed',{status:'processing'})],shopLinkReceipts:[paid('guest',{requestId:'remote-order',source:'guest-momo',staffId:'incorrect',counterId:'incorrect',shiftId:'incorrect'}),paid('static',{requestId:null})]};
 const feed=receivingPayments(state);assert.equal(feed.length,3);assert.equal(feed.find(value=>value.id==='counter'),canonical);const guest=feed.find(value=>value.id==='guest');assert.equal(guest.staffId,null);assert.equal(guest.counterId,null);assert.equal(guest.shiftId,null);assert.equal(guest.unattributed,true);assert.equal(canonical.staffId,'staff-a');
 assert.deepEqual(shopPaymentReceipts({...state,shopLinkReceipts:[...state.shopLinkReceipts,paid('elsewhere',{shopId:'shop-b'})]},'shop-a').map(value=>value.id).sort(),['guest','static']);
});

test('a same-amount guest online receipt is viewable without completing a cashier QR or changing shift collections',async()=>{
 const request={id:'counter-qr',shopId:'shop-a',staffId:'staff-a',counterId:'counter-a',shiftId:'shift-a',amount:2500,status:'open',createdAt:'2026-11-14T11:00:00Z',expiresAt:'2099-11-14T11:15:00Z'};
 const state={business:{id:'business'},shops:[{id:'shop-a',name:'Night Market',code:'LM123'}],staff:[],shifts:[{id:'shift-a',shopId:'shop-a',staffId:'staff-a',status:'open'}],requests:[request],transactions:[],refunds:[],shopLinkReceipts:[paid('guest',{requestId:'online-order',intentChannel:'online',method:'online-request',source:'guest-momo',unattributed:true})]};
 const actor={shopId:'shop-a',staffId:'staff-a'},counter={id:'counter-a',locked:false},view=createCashier({getState:()=>state,getActor:()=>actor,getCounter:()=>counter,getSession:()=>({id:'session'}),getShop:()=>state.shops[0],getConnectivity:()=> 'online',qrSvg:()=>'<svg></svg>',paymentLink:()=> 'https://pay.test/'});
 await click(view,'request',{id:request.id});assert.match(view.render(),/Waiting for payment/);assert.doesNotMatch(view.render(),/Payment received/);assert.equal(cashierShiftSummary(state,actor,counter).gross,0);
 await click(view,'shop-receipts');assert.match(view.render(),/Guest MoMo · test payment/);assert.match(view.render(),/LM-guest/);assert.match(view.render(),/no cashier assigned/);
 await click(view,'receipt',{id:'guest'});assert.match(view.render(),/Online request · no cashier assigned/);assert.match(view.render(),/Request a refund/);
 await click(view,'close');assert.match(view.render(),/Waiting for payment/);assert.equal(cashierShiftSummary(state,actor,counter).gross,0);
 state.transactions.push(paid('matching',{staffId:'staff-a',counterId:'counter-a',shiftId:'shift-a',requestId:request.id}));assert.match(view.render(),/Payment received/);assert.match(view.render(),/LM-matching/);
});

test('a cashier refund request for an unattributed shop receipt retains its original canonical payment ID',async()=>{
 const originalFormData=globalThis.FormData;globalThis.FormData=class{constructor(form){return new Map(Object.entries(form.values))}};
 try{
  const state={business:{id:'business'},shops:[{id:'shop-a',name:'Night Market'}],staff:[],requests:[],transactions:[],refunds:[],shifts:[],shopLinkReceipts:[paid('guest',{requestId:'remote',intentChannel:'online',source:'guest-momo',refundedAmount:500})]};let sent;
  const view=createCashier({getState:()=>state,getActor:()=>({shopId:'shop-a',staffId:'staff-a'}),getCounter:()=>({id:'counter-a',locked:false}),getSession:()=>({id:'session'}),getShop:()=>state.shops[0],onRefundRequest:async payload=>{sent=payload}});
  await click(view,'receipt',{id:'guest'});await click(view,'refund');assert.match(view.render(),/max="20\.00"/);
  await view.handleSubmit({dataset:{form:'cashier',cashierForm:'refund'},values:{amount:'5.00',reason:'Wrong item'}});assert.equal(sent.transactionId,'guest');assert.equal(sent.amount,500);assert.match(view.render(),/Refund request sent for approval/);assert.equal(state.transactions.length,0);
 }finally{globalThis.FormData=originalFormData;}
});

test('confirmed guest shop receipts announce once after voice enable and never replay on duplicate projection or staff handover',async()=>{
 const oldFormData=globalThis.FormData;globalThis.FormData=class{constructor(form){return new Map(Object.entries(form.values))}};
 try{
  let session={id:'session',businessId:'business',userId:'staff-a',role:'cashier',shopIds:['shop-a']},records=[];
  const state={business:{id:'business'},shops:[{id:'shop-a',businessId:'business',name:'Night Market'}],transactions:[],shopQRReceipts:[],shopLinkReceipts:[paid('old-guest',{requestId:'old-remote'})]};
  const api=async(path,{method='GET',body}={})=>{if(path==='/api/devices'&&method==='POST'){records=[{id:body.deviceId,...body,businessId:'business',userId:session.userId,sessionId:session.id,enabled:true,soundReady:false,lastSeen:new Date().toISOString()}];return {devices:records}}if(path==='/api/devices')return {devices:records};const device=records[0];if(body.action==='test'){device.soundReady=true;device.testedAt=new Date().toISOString()}return {devices:records};};
  const receiver=createDevices({api,storage:storage(),getState:()=>state,getSession:()=>session,getShopId:()=> 'shop-a',onTestVoice:async()=>{}});
  await receiver.handleSubmit({values:{label:'Front phone',shopId:'shop-a'}});await receiver.handleClick('device-test');assert.equal(receiver.canAnnounce('shop-a'),true);assert.deepEqual(receiver.consumePayments(receivingPayments(state)),[]);
  state.shopLinkReceipts.push(paid('guest',{requestId:'online-order',source:'guest-momo'}));let fresh=receiver.consumePayments(receivingPayments(state));assert.deepEqual(fresh.map(value=>value.id),['guest']);assert.deepEqual(receiver.consumePayments(receivingPayments(state)),[]);
  state.shopQRReceipts.push(paid('guest',{requestId:null,source:'guest-momo'}));assert.deepEqual(receiver.consumePayments(receivingPayments(state)),[]);
  session={...session,userId:'staff-b'};assert.deepEqual(receiver.consumePayments(receivingPayments(state)),[]);assert.equal(receiver.canAnnounce('shop-a'),false);receiver.stop();
 }finally{globalThis.FormData=oldFormData;}
});
