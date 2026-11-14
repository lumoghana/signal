import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createD1} from '../scripts/d1-adapter.mjs';
import {handleAPI} from '../server/api.js';
import {updateNetwork} from '../server/network.js';
import {createCampusPay} from '../dist/campus-pay.js';

class MemoryStorage {data=new Map();getItem(key){return this.data.get(key)??null}setItem(key,value){this.data.set(key,String(value))}removeItem(key){this.data.delete(key)}}
const form=(kind,values)=>({dataset:{campusForm:kind},values});
const registration=(suffix)=>({attemptId:'privacy-'+suffix,name:'Privacy Kitchen '+suffix,ownerName:'Audit Owner',phone:'0245550100',businessType:'sole-trader',destination:'Sandbox Bank · 123456',verification:{phone:true,identity:true,face:true},shop:{name:'Draft Counter '+suffix,area:'Night Market',category:'Food',lat:5.6509,lng:-.1878},credentials:{username:'privacy.'+suffix+'.owner',password:'OwnerTest1234'}});
function harness(){
 const DB=createD1();for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(file=>file.endsWith('.sql')).sort())DB.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));const env={DB};
 function client(){const cookies=new Map();return async(path,options={})=>{const headers={'X-Lumo-Request':'1',Origin:'https://privacy.test','cf-connecting-ip':'privacy-'+crypto.randomUUID()};if(cookies.size)headers.Cookie=[...cookies].map(([key,value])=>key+'='+value).join('; ');if(options.body!==undefined)headers['Content-Type']='application/json';const result=await handleAPI(new Request('https://privacy.test'+path,{method:options.method||'GET',headers,...(options.body===undefined?{}:{body:JSON.stringify(options.body)})}),env);for(const cookie of result.headers.getSetCookie()){const pair=cookie.split(';')[0],at=pair.indexOf('=');cookies.set(pair.slice(0,at),pair.slice(at+1))}const data=await result.json();if(!result.ok)throw Object.assign(new Error(typeof data.error==='string'?data.error:data.error?.message||data.message||'API rejected'),{status:result.status,code:data.error?.code||data.code});return data}}
 return {env,client,close:()=>DB.close()};
}
const post=(body)=>({method:'POST',body});

test('unpublished quote metadata needs assigned merchant access or the explicit unguessable test link',async()=>{
 const h=harness();try{
  const owner=h.client(),visitor=h.client(),unrelated=h.client();const account=await owner('/api/signup',post(registration('draft'))),shop=account.state.shops[0];await unrelated('/api/signup',post(registration('other')));
  assert.match(shop.testAcceptanceToken,/^[a-f0-9]{64}$/);
  const request=await owner('/api/action',post({type:'CREATE_REQUEST',payload:{shopId:shop.id,amount:1500,attemptId:'private-request'}}));
  for(const query of ['shopId='+shop.id,'code='+shop.code,'requestId='+request.entity.id,'accountNumber='+account.state.business.accountNumber,'shopId='+shop.id+'&testKey='+'0'.repeat(64)]){
   await assert.rejects(visitor('/api/payments/quote?'+query),error=>error.status===404&&error.code==='MERCHANT_NOT_FOUND');
  }
  await assert.rejects(unrelated('/api/payments/quote?shopId='+shop.id),error=>error.code==='MERCHANT_NOT_FOUND');
  const ownAccount=await owner('/api/payments/quote?accountNumber='+account.state.business.accountNumber);assert.equal(ownAccount.shop.id,shop.id);
  const own=await owner('/api/payments/quote?shopId='+shop.id);assert.equal(own.shop.id,shop.id);assert.equal(own.testKey,shop.testAcceptanceToken);
  const linked=await visitor('/api/payments/quote?shopId='+shop.id+'&testKey='+shop.testAcceptanceToken);assert.equal(linked.shop.id,shop.id);assert.equal(linked.testKey,shop.testAcceptanceToken);assert.equal(linked.shop.testAcceptanceToken,undefined);
  const dynamic=await visitor('/api/payments/quote?requestId='+request.entity.id+'&testKey='+shop.testAcceptanceToken);assert.equal(dynamic.request.amount,1500);
  await updateNetwork(h.env,n=>{n.businesses[account.state.business.id].shops[0].published=true;return {}});
  const published=await visitor('/api/payments/quote?shopId='+shop.id),directory=await visitor('/api/directory');assert.equal(published.testKey,undefined);assert.equal(published.shop.testAcceptanceToken,undefined);assert.equal(directory.shops[0].testAcceptanceToken,undefined);
 }finally{h.close()}
});

test('test link authorizes only its own counter and is required at payment submission too',async()=>{
 const h=harness();try{
  const owner=h.client(),student=h.client();const account=await owner('/api/signup',post(registration('payment'))),shop=account.state.shops[0];const second=await owner('/api/action',post({type:'ADD_SHOP',payload:{name:'Other private counter',area:'Pentagon',lat:5.65,lng:-.18}}));
  const wallet=await student('/api/student/open',post({name:'Test Payer'}));await student('/api/student/fund',post({amount:5000,attemptId:'private-fund',confirmSandbox:true}));
  const payload={walletId:wallet.student.id,shopId:shop.id,amount:1500,attemptId:'test-link-pay'};
  await assert.rejects(student('/api/payments',post(payload)),error=>error.code==='MERCHANT_NOT_FOUND');
  await assert.rejects(student('/api/payments',post({...payload,testKey:second.entity.testAcceptanceToken})),error=>error.code==='MERCHANT_NOT_FOUND');
  const result=await student('/api/payments',post({...payload,testKey:shop.testAcceptanceToken}));assert.equal(result.payment.status,'paid');assert.equal(result.student.balance,3500);
  const replay=await student('/api/payments',post(payload));assert.equal(replay.replayed,true);assert.equal(replay.student.balance,3500,'own receipt replay remains recoverable without redisclosing the test key');
 }finally{h.close()}
});

test('cashier gets only receipt identity roster fields and its own authentication association',async()=>{
 const h=harness();try{
  const owner=h.client(),cashier=h.client(),manager=h.client();const account=await owner('/api/signup',post(registration('roster'))),shop=account.state.shops[0];
  const m=await owner('/api/invitations',post({name:'Shop Manager',phone:'0555550102',role:'manager',shopIds:[shop.id]}));const acceptedManager=await manager('/api/invitations/accept',post({token:m.invitation.token,username:'privacy.manager',password:'ManagerTest1234'}));
  const c=await owner('/api/invitations',post({name:'Shop Cashier',phone:'0555550103',role:'cashier',shopIds:[shop.id]}));const accepted=await cashier('/api/invitations/accept',post({token:c.invitation.token,username:'privacy.cashier',password:'CashierTest1234'}));
  const session=await cashier('/api/session'),self=session.state.staff.find(person=>person.authUserId===accepted.user.id),other=session.state.staff.find(person=>person.name==='Shop Manager');
  assert.ok(self);assert.ok(other);assert.equal(other.authUserId,undefined);assert.equal(other.phone,undefined);assert.equal(self.phone,undefined);assert.ok(session.state.staff.every(person=>person.active));assert.ok(!JSON.stringify(session.state.staff).includes('0245550100'));
 }finally{h.close()}
});

test('wallet history resolves a lost committed response on reopen without posting another payment',async()=>{
 const h=harness(),previousStorage=globalThis.sessionStorage,previousFormData=globalThis.FormData;globalThis.sessionStorage=new MemoryStorage();globalThis.FormData=class{constructor(value){this.values=Object.entries(value.values)}*[Symbol.iterator](){yield* this.values}};
 try{
  const owner=h.client(),student=h.client();const account=await owner('/api/signup',post(registration('receipt'))),shop=account.state.shops[0];await student('/api/student/open',post({name:'Recovery Payer'}));await student('/api/student/fund',post({amount:5000,attemptId:'receipt-fund',confirmSandbox:true}));
  let lost=true,paymentPosts=0;const api=async(path,options)=>{const result=await student(path,options);if(path==='/api/payments'){paymentPosts++;if(lost){lost=false;throw new TypeError('Committed response lost')}}return result};
  const first=createCampusPay({api});await first.open(shop);await first.handleSubmit(form('amount',{amount:'12.34'}));await first.handleClick('campus-pay-confirm');assert.match(first.render(),/Checking this payment/);first.hide();
  const reopened=createCampusPay({api});await reopened.open(shop);assert.match(reopened.render(),/Payment confirmed/);assert.equal(paymentPosts,1);const wallet=await student('/api/student');assert.equal(wallet.student.balance,3766);assert.equal(wallet.student.entries[0].status,'paid');assert.ok(wallet.student.entries[0].attemptId);assert.equal((await owner('/api/session')).metrics.balance,1234);
  // The public wallet projection also repairs the old persisted entry shape.
  await updateNetwork(h.env,n=>{const entry=Object.values(n.wallets)[0].entries.find(entry=>entry.type==='merchant-payment');delete entry.attemptId;delete entry.status;return {}});
  const repaired=await student('/api/student');assert.equal(repaired.student.entries[0].status,'paid');assert.ok(repaired.student.entries[0].attemptId);
 }finally{h.close();globalThis.sessionStorage=previousStorage;globalThis.FormData=previousFormData}
});
