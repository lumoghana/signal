import test from 'node:test';
import assert from 'node:assert/strict';
import {createMerchantHandler,hydrateMerchantNetwork} from '../supabase/functions/lumo-approved/merchant/handler.mjs';
import {emptyNetwork} from '../supabase/functions/lumo-approved/merchant/server/network.js';

test('public directory uses only the indexed public RPC rather than reading any financial network',async()=>{
 const calls=[],shops=[{id:crypto.randomUUID(),businessName:'Synthetic shop',published:true,accepting:true}];
 const handler=createMerchantHandler({readScalingEnabled:true,serviceRpc:async(name,args)=>{calls.push({name,args});assert.equal(name,'lumo_approved_public_directory');return {ok:true,revision:7,shops};}});
 const reply=await handler({identity:null,body:{path:'/api/directory',method:'GET'}});
 assert.equal(reply.ok,true);assert.equal(reply.status,200);assert.deepEqual(reply.shops,shops);
 assert.deepEqual(calls,[{name:'lumo_approved_public_directory',args:{}}]);
 assert.equal(reply.state,undefined);assert.equal(reply.ledger,undefined);assert.equal(reply.merchantToken,undefined);
});

test('a failed indexed-directory read fails closed without falling back to all merchants and receipts',async()=>{
 let calls=0;const handler=createMerchantHandler({readScalingEnabled:true,serviceRpc:async name=>{calls++;assert.equal(name,'lumo_approved_public_directory');throw Error('Synthetic unavailable database');}});
 const reply=await handler({identity:null,body:{path:'/api/directory',method:'GET'}});
 assert.equal(reply.ok,false);assert.equal(reply.status,503);assert.equal(calls,1);
});

test('linear merchant hydration keeps every canonical payment/refund and resolves operators within their own business',()=>{
 const state=emptyNetwork(),shared=crypto.randomUUID(),ledger=[],requests=[],balances={};
 for(let n=0;n<40;n++){
  const id='business-'+n,shop='shop-'+n,user='user-'+n;
  state.businesses[id]={business:{id,name:'Synthetic '+n},shops:[{id:shop}],transactions:[],refunds:[],requests:[]};
  state.users.push({id:user,businessId:id,_sharedUserId:shared,role:n===0?'owner':'cashier',name:'Operator '+n});
  for(let j=0;j<10;j++){
   const request='request-'+n+'-'+j,payment='payment-'+n+'-'+j;
   requests.push({id:request,shopId:shop,createdBySharedUserId:shared,status:'paid'});
   ledger.push({id:payment,merchantId:id,type:'merchant_payment',shopId:shop,requestId:request,amount:100,createdAt:'2026-11-18T00:00:00Z'});
   ledger.push({id:'refund-'+n+'-'+j,merchantId:id,type:'refund',shopId:shop,originalPaymentId:payment,amount:25,createdAt:'2026-11-18T01:00:00Z'});
  }
  balances[id]={accountId:'account-'+n,balance:750};
 }
 const hydrated=hydrateMerchantNetwork({state,ledger,requests,balances});
 assert.equal(Object.keys(hydrated.businesses).length,40);
 for(let n=0;n<40;n++){
  const b=hydrated.businesses['business-'+n];
  assert.equal(b.transactions.length,10);assert.equal(b.refunds.length,10);assert.equal(b.openingBalance,0);
  assert.equal(b.transactions.reduce((sum,t)=>sum+t.amount,0),1000);
  assert.equal(b.refunds.reduce((sum,t)=>sum+t.amount,0),250);
  assert.ok(b.requests.every(r=>r.staffName==='Operator '+n));
  assert.ok(b.refunds.every(r=>b.transactions.some(t=>t.id===r.transactionId)));
 }
 assert.equal(state.businesses['business-0'].transactions.length,0,'input authority is never mutated');
});
