import test from 'node:test';
import assert from 'node:assert/strict';
import {createBusiness} from '../dist/domain.js';
import {calculateBusinessPlan} from '../dist/business-plan-model.js';
import {getMerchantLuxAnswer,planMerchantLux,validateMerchantLuxPlan,merchantLuxStale} from '../dist/lux-brain.js';

const now=new Date('2026-11-14T12:00:00Z');
const prose=answer=>[answer.title,...(answer.paragraphs||[]),...(answer.basis||[])].join(' ');
const stat=(answer,label)=>answer.stats?.find(value=>value.label===label)?.value;
function fixture(){
 const state=createBusiness({name:'Synthetic Campus Kitchen',ownerName:'Test owner',phone:'0240000000',businessType:'sole-trader',destination:'Test only',verification:{identity:true,face:true},shop:{name:'Night Market',area:'Legon',category:'Food',lat:5.65,lng:-.18}},{now:now.toISOString()});
 state.business.id='test-business';state.shops[0].id='night';state.shops.push({...state.shops[0],id:'pentagon',name:'Pentagon'});
 state.openingBalance=120000;state.refunds=[{id:'held',transactionId:'one',shopId:'night',status:'requested',amount:10000}];
 state.settlements=[{id:'paid-payout',amount:10000,status:'paid',createdAt:'2026-11-13T12:00:00Z'}];
 state.businessPlan={version:1,revision:1,stockReserve:{amount:30000},managerShopIds:[],expenses:[
  {id:'stock-order',title:'Stock order',amount:20000,shopId:'night',category:'stock',status:'planned',dueDate:'2026-11-16'},
  {id:'rent',title:'Next rent',amount:10000,shopId:'night',category:'expense',status:'planned',dueDate:'2026-11-15'},
  {id:'outside',title:'Transport paid elsewhere',amount:5000,shopId:'night',category:'expense',status:'recorded',funding:'external'},
  {id:'ledger',title:'Already reflected',amount:10000,shopId:'night',category:'expense',status:'recorded',funding:'ledger',ledgerReference:'paid-payout'}
 ]};
 const owner={id:'owner',role:'owner',businessId:state.business.id,shopIds:['night','pentagon']},manager={id:'manager',role:'manager',businessId:state.business.id,shopIds:['night']};
 return {state,owner,manager,ask(question,options={}){return getMerchantLuxAnswer(state,question,{actor:owner,now,...options});}};
}
const receipt=(id,value,extra={})=>({id,reference:'LM-'+id,shopId:'night',amount:value,status:'paid',createdAt:now.toISOString(),confirmedAt:now.toISOString(),...extra});

test('ordinary questions select the recorded planning and link tools without executable financial actions',()=>{
 for(const [question,task]of [
  ['How much should I keep for stock?','stock'],['What expenses are coming up?','expenses'],['How much remains after my business plan?','plan'],
  ['Has this payment link been paid?','links'],['How much did we receive through shared links?','links'],['Which payments are awaiting confirmation?','pending'],
  ['Why is available money different from collections?','funds']
 ])assert.equal(planMerchantLux(question).task,task,question);
 assert.equal(validateMerchantLuxPlan({task:'executePayment'},'Pay this supplier'),null);
});

test('the after-plan answer uses the shared calculation after ledger holds and never changes money',()=>{
 const f=fixture(),before=structuredClone(f.state),summary=calculateBusinessPlan(f.state,{now});
 const answer=f.ask('How much remains after my business plan?');
 assert.equal(summary.available,100000);assert.equal(summary.afterPlan,60000);
 assert.equal(stat(answer,'After ledger holds'),'GH₵1,000.00');assert.equal(stat(answer,'Stock · counted once'),'GH₵300.00');assert.equal(stat(answer,'Other planned expenses'),'GH₵100.00');assert.equal(stat(answer,'After plan · estimate'),'GH₵600.00');
 assert.match(prose(answer),/planning estimate|Planning estimate/);assert.match(prose(answer),/already.*not deducted again/);assert.deepEqual(f.state,before);
 assert.equal(answer.actions[0].page,'business-plan');
});

test('stock answers use recorded commitments once and do not invent an optimal stock recommendation',()=>{
 const f=fixture(),answer=f.ask('How much should I keep for stock?');
 assert.equal(stat(answer,'Stock commitment · counted once'),'GH₵300.00');assert.match(prose(answer),/larger amount/);assert.match(prose(answer),/does not invent/);
 f.state.businessPlan.expenses[0].amount=50000;const higher=f.ask('How much should I keep for stock?');assert.equal(stat(higher,'Stock commitment · counted once'),'GH₵500.00');
});

test('expense answers distinguish due commitments, already-counted ledger debits and outside payments',()=>{
 const f=fixture();f.state.businessPlan.expenses[1].dueDate='2026-11-13';
 const answer=f.ask('What expenses are coming up?');assert.equal(stat(answer,'Upcoming expenses'),'2');assert.equal(stat(answer,'Recorded outside Lumo'),'GH₵50.00');
 assert.match(prose(answer),/Next rent: GH₵100.00, overdue since 2026-11-13/);assert.match(prose(answer),/already completed ledger debit/);assert.match(prose(answer),/does not.*prove a supplier was paid/);
});

test('a manager needs explicit planning permission and cannot expose other shops or merchant funds',()=>{
 const f=fixture();assert.equal(f.ask('How much remains after my business plan?',{actor:f.manager}).kind,'clarify');
 f.state.businessPlan.managerShopIds=['night'];f.state.businessPlan.expenses.push({id:'secret',title:'Private other shop',shopId:'pentagon',amount:9999900,status:'planned'});
 const answer=f.ask('How much remains after my business plan?',{actor:f.manager});assert.equal(stat(answer,'After plan · estimate'),undefined);assert.equal(stat(answer,'Selected shop commitments'),'GH₵300.00');
 assert.doesNotMatch(JSON.stringify(answer),/99,999|Private other shop|1,000.00/);assert.match(prose(answer),/keeps the merchant account.*private/);
 assert.equal(f.ask('What expenses are coming up?',{actor:{...f.manager,role:'cashier'}}).kind,'clarify');
});

test('a selected shop plan is not subtracted from full merchant funds while ignoring other shops',()=>{
 const f=fixture(),answer=f.ask('How much remains after my business plan?',{shopId:'night'});
 assert.equal(stat(answer,'After plan · estimate'),undefined);assert.equal(stat(answer,'Selected shop commitments'),'GH₵300.00');assert.match(prose(answer),/Choose All shops/);
});

test('malformed planning money produces no confident estimate',()=>{
 const f=fixture();f.state.businessPlan.expenses[0].amount=1.5;const answer=f.ask('How much remains after my business plan?');assert.equal(answer.kind,'clarify');assert.equal(answer.stats.length,0);assert.doesNotMatch(JSON.stringify(answer),/NaN|Infinity|GH₵0.02/);
});

test('shared-link collections count canonical attribution only and keep guest pending and refunds separate',()=>{
 const f=fixture();f.state.transactions=[receipt('wallet',2500,{linkId:'fixed',source:'shared-link',rail:'lumo'}),receipt('guest',3000,{linkId:'reusable',source:'guest-momo',rail:'momo',providerMode:'sandbox'}),receipt('generic',999900,{rail:'lumo'}),receipt('old-link',1000,{linkId:'fixed',source:'guest-momo',rail:'momo',createdAt:'2026-11-01T12:00:00Z',confirmedAt:'2026-11-01T12:00:00Z'})];
 f.state.refunds=[{id:'late-refund',transactionId:'old-link',shopId:'night',status:'paid',amount:500,paidAt:now.toISOString(),createdAt:now.toISOString()}];
 f.state.guestCollections=[{id:'waiting',shopId:'night',linkId:'reusable',status:'pending',amount:8000,createdAt:now.toISOString()}];
 const answer=f.ask('How much did we receive through shared links?');
 assert.equal(stat(answer,'MoMo payment links · confirmed'),'GH₵30.00');assert.equal(stat(answer,'Wallet link-source coverage'),'Not recorded');assert.equal(stat(answer,'Guest MoMo · sandbox'),'GH₵30.00');assert.equal(stat(answer,'Linked refunds · completed'),'GH₵5.00');
 assert.match(prose(answer),/GH₵80.00.*excluded/);assert.match(prose(answer),/Wallet-link source coverage is not recorded/);assert.match(prose(answer),/not.*live provider settlement|separate from live provider settlement/);
});

test('an exact fixed link reports authoritative status and cannot mistake an unpaid request for receipt',()=>{
 const f=fixture();f.state.paymentLinks=[{id:'LINK-123',publicToken:'a'.repeat(64),requestId:'request',shopId:'night',kind:'request',description:'Order 42',amount:2500,status:'paid',expiresAt:'2026-11-15T12:00:00Z',confirmedCount:1,confirmedAmount:2500,pendingCount:0,pendingAmount:0,lumoConfirmedAmount:0,guestConfirmedAmount:2500}];
 const answer=f.ask('Has payment link LINK-123 been paid?');assert.match(answer.title,/1 confirmed payment/);assert.equal(stat(answer,'Linked request · confirmed'),'GH₵25.00');assert.match(prose(answer),/one-off request cannot be paid again/);assert.equal(answer.actions[0].paymentLinkId,'LINK-123');
 f.state.paymentLinks[0]={...f.state.paymentLinks[0],status:'open',confirmedCount:0,confirmedAmount:0,guestConfirmedAmount:0,pendingCount:1,pendingAmount:2500};
 const pending=f.ask('Has payment link LINK-123 been paid?');assert.match(pending.title,/awaiting confirmation/);assert.equal(stat(pending,'Linked request · confirmed'),'GH₵0.00');
 assert.equal(f.ask('Has this payment link been paid?').kind,'clarify');assert.equal(f.ask('Has payment link WRONG-123 been paid?').kind,'clarify');
});

test('the guest confirmation queue is not included in funds and does not confirm from elapsed time',()=>{
 const f=fixture();f.state.guestCollections=[{id:'one',shopId:'night',linkId:'link',status:'pending',amount:2500,createdAt:'2026-11-01T12:00:00Z'},{id:'two',shopId:'night',linkId:'link',status:'confirmed',amount:9900,createdAt:now.toISOString()}];
 const answer=f.ask('Which payments are awaiting confirmation?');assert.equal(stat(answer,'Processing amount'),'GH₵25.00');assert.equal(stat(answer,'Processing payments'),'1');assert.match(prose(answer),/elapsed time is not money received/);assert.equal(f.ask('Where is our money?').stats.find(value=>value.label==='After reservations').value,'GH₵1,000.00');
});

test('a wallet-paid linked request uses canonical payment proof while remaining outside link-source analytics',()=>{
 const f=fixture();f.state.paymentLinks=[{id:'wallet-link',shopId:'night',kind:'request',requestId:'request-wallet',description:'Counter order',amount:2500,status:'paid',confirmedCount:0,confirmedAmount:0,guestConfirmedAmount:0,lumoConfirmedAmount:0,pendingCount:0,pendingAmount:0,
  requestPayment:{id:'journal-wallet',reference:'LM-WALLET-CANONICAL',shopId:'night',requestId:'request-wallet',amount:2500,currency:'GHS',status:'posted',createdAt:now.toISOString(),rail:'lumo'}}];
 const answer=f.ask('Has payment link wallet-link been paid?');assert.match(answer.title,/1 confirmed payment/);assert.equal(stat(answer,'Linked request · confirmed'),'GH₵25.00');assert.match(prose(answer),/LM-WALLET-CANONICAL/);assert.match(prose(answer),/paid from a Lumo wallet/);assert.match(prose(answer),/does not prove.*shared link/);
 assert.equal(stat(f.ask('How much did we receive through shared links?'),'MoMo payment links · confirmed'),'GH₵0.00');
 f.state.paymentLinks[0].requestPayment.shopId='pentagon';const foreign=f.ask('Has payment link wallet-link been paid?');assert.equal(stat(foreign,'Linked request · confirmed'),'GH₵0.00');assert.doesNotMatch(prose(foreign),/LM-WALLET-CANONICAL/);
});

test('planning, link status and permissions changes invalidate earlier Lux answers',()=>{
 const f=fixture(),answer=f.ask('How much remains after my business plan?');assert.equal(merchantLuxStale(f.state,answer,{actor:f.owner,now}),false);f.state.businessPlan.expenses[0].amount=40000;assert.equal(merchantLuxStale(f.state,answer,{actor:f.owner,now}),true);
 const linkAnswer=f.ask('How much did we receive through shared links?');f.state.paymentLinks=[{id:'link',shopId:'night',status:'open',confirmedAmount:0}];assert.equal(merchantLuxStale(f.state,linkAnswer,{actor:f.owner,now}),true);
});

test('model-introduced link identifiers are rejected and a genuine contextual reference can be reused',()=>{
 assert.equal(validateMerchantLuxPlan({task:'links',reference:'invented'},'Has this link been paid?'),null);
 const previous={task:'links',reference:'LINK-123'};
 assert.equal(planMerchantLux('Has that link been paid?',{previous}).reference,'LINK-123');
 assert.equal(validateMerchantLuxPlan(previous,'And now?',{previous,questions:['Has payment link LINK-123 been paid?']}).reference,'LINK-123');
});
