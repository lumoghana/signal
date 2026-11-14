import test from 'node:test';
import assert from 'node:assert/strict';
import {buildState,prepareMutation,publicState,clone} from '../supabase/functions/lumo-approved/engine.mjs';
import {createEmptyState} from '../supabase/functions/lumo-approved/domain/model.js';

const actor='10000000-0000-4000-8000-000000000001',account='20000000-0000-4000-8000-000000000001';
function snapshot(balance=0){
 const state=createEmptyState({name:'Ama Mensah',phone:'0241000001'});state.onboardingDone=true;state.wallet=balance;
 return {account:{id:account,userId:actor,displayName:'Ama Mensah',handle:'ama.1',balance,currency:'GHS',sandbox:true},phone:'0241000001',revision:0,state,groups:[],boxes:[],requests:[],partners:[],receipts:[]};
}
const receipt=(id,type,values={})=>({id,reference:'LM-'+id,type,amount:1000,payerAccountId:'other-account',payeeAccountId:account,createdAt:'2026-11-13T10:00:00.000Z',...values});
const prepare=(saved,payload)=>prepareMutation(saved,'activationCheckpoint',payload,'checkpoint-'+payload.step,{});
function funded(){const saved=snapshot(50000);saved.receipts=[receipt('first-top-up','test_funding',{transactionId:'first-funding',amount:50000})];saved.state.transactions=[{id:'first-funding',type:'income',direction:'in',amount:50000,status:'success',merchant:'Pilot test funds',category:'Income',rail:'internal',at:'2026-11-13T10:00:00.000Z',note:'Added to your available money'}];return saved;}
function persist(saved,prepared){assert.equal(prepared.ok,true);assert.deepEqual(prepared.intents,[]);assert.deepEqual(prepared.groups,[]);saved.state=clone(prepared.durableState);saved.revision++;return saved;}

test('incoming Activity uses the real counterparty and sender note with approved Income vocabulary',()=>{
 const saved=snapshot(1700);saved.receipts=[receipt('transfer-1','transfer',{amount:1700,payerName:'Kojo Mensah',payerHandle:'kojo.2',note:'Lunch share'})];
 const tx=buildState(saved).transactions[0];
 assert.equal(tx.merchant,'Kojo Mensah');assert.equal(tx.note,'Lunch share');assert.equal(tx.category,'Income');assert.equal(tx.type,'income');assert.equal(tx.amount,1700);assert.equal(tx.status,'success');assert.equal(tx.direction,'in');assert.equal(tx.ledgerJournalId,'transfer-1');
 saved.receipts[0].payerName={name:'not a display string'};const withoutName=buildState(saved).transactions[0];assert.equal(withoutName.merchant,'@kojo.2');assert.doesNotMatch(JSON.stringify(withoutName),/Shared money|Confirmed pilot test-money ledger entry|\[object Object\]/);
});

test('unmatched merchant payments and refunds keep the shop identity, category and receipt linkage',()=>{
 const saved=snapshot(3000);saved.receipts=[receipt('returned','refund',{amount:500,shopId:'shop-1',originalPaymentId:'purchase'}),receipt('purchase','merchant_payment',{amount:2500,payerAccountId:account,payeeAccountId:'merchant-account',merchantName:'Akua’s Kitchen',shopName:'Night Market',category:'Food',shopId:'shop-1',note:'Lunch'})];
 const state=buildState(saved),payment=state.transactions.find(tx=>tx.ledgerJournalId==='purchase'),refund=state.transactions.find(tx=>tx.ledgerJournalId==='returned');
 assert.equal(payment.merchant,'Akua’s Kitchen');assert.equal(payment.paymentKind,'merchant');assert.equal(payment.category,'Food');assert.equal(payment.note,'Lunch');assert.equal(payment.shopId,'shop-1');
 assert.equal(refund.merchant,'Akua’s Kitchen');assert.equal(refund.type,'refund');assert.equal(refund.category,'Food');assert.equal(refund.note,'Refund received');assert.equal(refund.parentPaymentId,payment.id);assert.equal(refund.originalPaymentId,'purchase');assert.equal(state.wallet,3000);
});

test('internal Box and Group moves retain approved labels and never become generic incoming earnings',()=>{
 const cases=[
  ['box_save',{type:'saving',category:'Money Box',direction:'out',note:'Added to your Money Box'}],
  ['box_withdraw',{type:'withdrawal',category:'Money Box',direction:'in',note:'Moved back to available money'}],
  ['group_contribution',{type:'contribution',category:'Group collection',direction:'out',note:'Your contribution to shared money'}],
  ['group_refund',{type:'groupRefund',category:'Group refund',direction:'in',note:'Unused group money returned to its original source'}],
 ];
 for(const [kind,expected]of cases){
  const saved=snapshot(3000);saved.receipts=[receipt(kind,kind,{...(expected.direction==='out'?{payerAccountId:account,payeeAccountId:'internal-account'}:{}),approvedBoxId:kind.startsWith('box')?'books':undefined,boxName:'Books',approvedGroupId:kind.startsWith('group')?'project':undefined,groupName:'Project printing'})];
  const state=buildState(saved),tx=state.transactions[0];for(const [key,value]of Object.entries(expected))assert.equal(tx[key],value,kind+' '+key);
  assert.equal(tx.merchant,kind.startsWith('box')?'Books':'Project printing');assert.equal(tx.rail,'internal');assert.equal(tx.excludeFromSpending,true);assert.equal(tx.amount,1000);assert.equal(state.wallet,3000);
 }
 const saved=snapshot(1000);saved.receipts=[receipt('payout','group_payout',{groupName:'Project printing',note:'Print balance'})];const payout=buildState(saved).transactions[0];assert.equal(payout.merchant,'Project printing');assert.equal(payout.category,'Group payout');assert.equal(payout.note,'Print balance');
});

test('only former synthesized technical placeholders are repaired; genuine user notes and allocations survive',()=>{
 const saved=snapshot(1000);saved.receipts=[receipt('incoming','transfer',{payerHandle:'kojo.2',note:'Books repayment'})];
 const old=buildState(saved);Object.assign(old.transactions[0],{merchant:'Shared money',note:'Confirmed pilot test-money ledger entry',category:'Education',reaction:'💚',iouAllocations:[{iouId:'book-iou',amount:500}]});saved.state=old;
 const repaired=buildState(saved).transactions[0];assert.equal(repaired.merchant,'@kojo.2');assert.equal(repaired.note,'Books repayment');assert.equal(repaired.category,'Education');assert.equal(repaired.reaction,'💚');assert.deepEqual(repaired.iouAllocations,[{iouId:'book-iou',amount:500}]);assert.equal(repaired.id,'ledger-incoming');
 saved.state.transactions[0].id='user-authored-move';saved.receipts[0].transactionId='user-authored-move';saved.state.transactions[0].merchant='Kojo';
 const genuine=buildState(saved).transactions[0];assert.equal(genuine.merchant,'Kojo');assert.equal(genuine.note,'Confirmed pilot test-money ledger entry','A genuine authored row is never rewritten merely because its prose matches the old placeholder');
});

test('verified transfer and merchant intents carry presentation metadata without changing ledger destinations',async()=>{
 const saved=snapshot(10000),recipient={id:'other-user',userId:'other-user',name:'Kojo Mensah',handle:'kojo.2'};
 const transfer=await prepareMutation(saved,'payment',{amount:2300,rail:'lumo',recipient:{id:recipient.id,name:'untrusted label'},note:'Lunch share'},'transfer-metadata',{resolve:async()=>({ok:true,recipient})});
 assert.equal(transfer.intents[0].destination.id,recipient.id);assert.equal(transfer.intents[0].metadata.payerName,'Ama Mensah');assert.equal(transfer.intents[0].metadata.payeeName,'Kojo Mensah');assert.equal(transfer.intents[0].metadata.note,'Lunch share');assert.equal(transfer.state.wallet,7700);
 const merchant=await prepareMutation(saved,'payment',{amount:2500,rail:'merchant',shopId:'shop-1',merchant:'forged merchant',category:'Food',note:'Lunch'},'merchant-metadata',{quote:async()=>({ok:true,merchant:{name:'Akua’s Kitchen'},shop:{id:'shop-1',name:'Night Market'},merchantAccessApproved:true})});
 assert.equal(merchant.intents[0].destination.id,'shop-1');assert.equal(merchant.intents[0].metadata.merchantName,'Akua’s Kitchen');assert.equal(merchant.intents[0].metadata.shopName,'Night Market');assert.equal(merchant.intents[0].metadata.category,'Food');assert.equal(merchant.intents[0].metadata.merchantAccessApproved,true);assert.equal(merchant.state.wallet,7500);
});

test('snapshots without a first-run marker remain eligible legacy accounts without forced setup',()=>{
 const saved=snapshot(10000);assert.equal(buildState(saved).activation,undefined);assert.equal(buildState({...saved,state:null}).activation,undefined);
});

test('activation checkpoints persist account acknowledgement and proven funding without moving money',async()=>{
 const saved=snapshot();let result=await prepare(saved,{step:'account-created'});persist(saved,result);assert.deepEqual(publicState(buildState(saved)).activation,{step:'account-created',accountAcknowledged:false,fundingTransactionId:'',budgetSaved:false,fundingDeferred:false,status:'setting-up'});
 await assert.rejects(prepare(saved,{step:'fund'}),error=>error.code==='ACTIVATION_STEP_UNAVAILABLE');
 result=await prepare(saved,{step:'fund',accountAcknowledged:true});persist(saved,result);assert.equal(saved.state.activation.accountAcknowledged,true);assert.equal(saved.account.balance,0);assert.equal(saved.state.wallet,0);
 await assert.rejects(prepare(saved,{step:'purpose'}),error=>error.code==='ACTIVATION_STEP_UNAVAILABLE');
 const money=funded();money.state={...saved.state,transactions:money.state.transactions};result=await prepare(money,{step:'purpose',fundingTransactionId:'first-funding'});persist(money,result);assert.equal(saved.account.balance,0);assert.equal(result.state.wallet,50000);assert.equal(money.state.activation.fundingTransactionId,'first-funding');assert.equal(money.state.activation.budgetSaved,false);assert.equal(money.state.activation.status,'setting-up');
});

test('activation cannot advance using a fake receipt, another account’s income, refund or unsaved essentials',async()=>{
 const saved=funded();saved.state.activation={step:'fund',accountAcknowledged:true};
 await assert.rejects(prepare(saved,{step:'purpose',fundingTransactionId:'not-a-receipt'}),error=>error.code==='ACTIVATION_STEP_UNAVAILABLE');
 for(const mutate of [value=>{value.receipts[0].payeeAccountId='other-account'},value=>{value.receipts[0].type='refund'},value=>{value.account.balance=0},value=>{value.receipts[0].amount=1}]){
  const changed=clone(saved);mutate(changed);await assert.rejects(prepare(changed,{step:'purpose',fundingTransactionId:'first-funding'}),error=>error.code==='ACTIVATION_STEP_UNAVAILABLE');
 }
 await assert.rejects(prepare(saved,{step:'ready',fundingTransactionId:'first-funding'}),error=>error.code==='ACTIVATION_STEP_UNAVAILABLE');
 for(const payload of [{step:'purpose',budgetSaved:true},{step:'purpose',items:[{name:'Food',amount:1000}]},{step:'not-a-step'},{step:'fund',accountAcknowledged:'yes'},{step:'fund',fundingTransactionId:42}])await assert.rejects(prepare(saved,payload),error=>error.code==='INVALID_ACTIVATION_CHECKPOINT');
});

test('ready and complete require the canonical budget and terminal completion cannot reopen after spending',async()=>{
 const saved=funded();saved.state.activation={step:'purpose',accountAcknowledged:true,fundingTransactionId:'first-funding'};saved.state.budget={...saved.state.budget,created:true,items:[{id:'food',name:'Food',amount:10000,spent:0}]};
 let result=await prepare(saved,{step:'ready'});persist(saved,result);assert.equal(saved.state.activation.budgetSaved,true);assert.equal(saved.state.activation.status,'ready');
 result=await prepare(saved,{step:'complete'});persist(saved,result);assert.equal(publicState(buildState(saved)).activation.step,'complete');assert.equal(saved.account.balance,50000);
 saved.account.balance=0;const prior=clone(saved.state.activation);result=await prepare(saved,{step:'complete'});assert.equal(result.result.duplicate,true);assert.deepEqual(result.state.activation,prior);assert.equal(result.state.wallet,0);assert.deepEqual(result.intents,[]);
 await assert.rejects(prepare(saved,{step:'account-created'}),error=>error.code==='ACTIVATION_ALREADY_COMPLETE');
});

test('a new ready or complete checkpoint cannot overplan actual money or reuse a partly spent budget',async()=>{
 const saved=funded();saved.state.activation={step:'purpose',accountAcknowledged:true,fundingTransactionId:'first-funding'};saved.state.budget={...saved.state.budget,created:true,items:[{id:'food',name:'Food',amount:40000,spent:0}]};
 for(const step of ['ready','complete']){
  const exact=await prepare(saved,{step});assert.equal(exact.ok,true);assert.equal(exact.state.activation.budgetSaved,true);
  for(const mutate of [value=>{value.state.buffer=10001},value=>{value.account.balance=49999},value=>{value.state.budget.items[0].spent=1},value=>{value.state.budget.items[0].amount=0}]){
   const changed=clone(saved);mutate(changed);await assert.rejects(prepare(changed,{step}),error=>error.code==='ACTIVATION_STEP_UNAVAILABLE');
  }
 }
 const malformed=clone(saved);malformed.state.budget.items[0].amount=1.5;await assert.rejects(prepare(malformed,{step:'ready'}),error=>error.code==='STATE_RECOVERY_REQUIRED');
 const purpose=clone(saved);purpose.account.balance=49999;const result=await prepare(purpose,{step:'purpose'});assert.equal(result.ok,true);assert.equal(result.state.activation.budgetSaved,false);assert.deepEqual(result.intents,[]);
});

test('explicit waiting defers funding and later real income updates status without inventing a budget',async()=>{
 const saved=snapshot();await assert.rejects(prepare(saved,{step:'waiting'}),error=>error.code==='ACTIVATION_STEP_UNAVAILABLE');
 const result=await prepare(saved,{step:'waiting',accountAcknowledged:true});persist(saved,result);assert.equal(saved.state.activation.fundingDeferred,true);assert.equal(saved.state.activation.status,'waiting');assert.equal(saved.state.wallet,0);assert.equal(saved.state.budget.created,false);
 saved.account.balance=50000;saved.receipts=funded().receipts;const after=buildState(saved);assert.equal(after.activation.step,'waiting');assert.equal(after.activation.status,'needs-plan');assert.equal(after.activation.budgetSaved,false);assert.equal(after.wallet,50000);assert.equal(after.budget.items.length,0);
});

test('a closed account cannot restart or persist first-money setup',async()=>{
 const saved=snapshot();saved.state.account.status='closed';const result=await prepare(saved,{step:'account-created'});
 assert.equal(result.ok,false);assert.match(result.result.message,/closed/);assert.equal(result.state.activation,undefined);assert.equal(saved.state.activation,undefined);assert.equal(saved.account.balance,0);
});
