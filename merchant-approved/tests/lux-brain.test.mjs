import test from 'node:test';
import assert from 'node:assert/strict';
import {createBusiness,metricsFor,ledger} from '../dist/domain.js';
import {getMerchantLuxAnswer,merchantLuxStale,merchantLuxContext,validateMerchantLuxPlan} from '../dist/lux-brain.js';
const now=new Date('2026-11-13T12:00:00Z');
function fixture(){
 const state=createBusiness({name:'Synthetic Campus Foods',ownerName:'Synthetic Owner',phone:'0240000000',businessType:'Sole trader',destination:'Test only',verification:{identity:true,face:true},shop:{name:'Night Market',area:'Night Market',category:'Food',lat:5.65,lng:-.18}},{now:now.toISOString()});
 state.shops[0].id='night';state.shops[0].cutoff='00:00';state.shops.push({...state.shops[0],id:'pentagon',name:'Pentagon',area:'Pentagon'});
 const owner={id:'owner',role:'owner',shopIds:['night','pentagon'],businessId:state.business.id},manager={id:'manager',role:'manager',shopIds:['night'],businessId:state.business.id};
 return{state,owner,manager};
}
const pay=(id,amount,date,rest={})=>({id,shopId:'night',reference:'LUM-'+id,amount,status:'paid',createdAt:date+'T10:00:00Z',confirmedAt:date+'T10:00:00Z',...rest});
const refund=(id,amount,date,rest={})=>({id,transactionId:'one',shopId:'night',amount,status:'paid',createdAt:date+'T11:00:00Z',paidAt:date+'T11:00:00Z',...rest});
const ask=(f,q,options={})=>getMerchantLuxAnswer(f.state,q,{actor:f.owner,now,...options});
const prose=a=>[a.title,...(a.paragraphs||[]),...(a.basis||[])].join(' ');
const value=(a,label)=>a.stats?.find(s=>s.label===label)?.value;

test('collections use confirmed receipts and refund-arrival dates, preserving the domain total',()=>{
 const f=fixture();f.state.transactions=[pay('one',5000,'2026-11-13'),pay('pending',9000,'2026-11-13',{status:'processing'}),pay('failed',8000,'2026-11-13',{status:'failed'}),pay('old',2000,'2026-11-01')];f.state.refunds=[refund('returned',1000,'2026-11-13')];const before=structuredClone(f.state),a=ask(f,'How much did we collect today?',{shopId:'night'}),m=metricsFor(f.state,'night',{now:now.toISOString()});
 assert.equal(value(a,'Confirmed collections'),'GH₵50.00');assert.equal(value(a,'Completed refunds'),'GH₵10.00');assert.equal(value(a,'Net collections'),`GH₵${(m.todayNet/100).toFixed(2)}`);assert.match(prose(a),/GH₵50.00.*GH₵10.00.*GH₵40.00/);assert.deepEqual(f.state,before);
});
test('each shop uses its current trading-day cutoff, including before the cutoff',()=>{
 const f=fixture();f.state.shops[0].cutoff='04:00';const early=new Date('2026-11-13T02:00:00Z');f.state.transactions=[pay('late',1000,'2026-11-13',{createdAt:'2026-11-13T01:00:00Z',confirmedAt:'2026-11-13T01:00:00Z'}),pay('yesterday',2000,'2026-11-12'),pay('other',3000,'2026-11-12',{shopId:'pentagon'})];const a=ask(f,'How much did we collect today?',{now:early,shopId:'night'});assert.equal(value(a,'Confirmed collections'),'GH₵30.00');assert.match(prose(a),/2026-11-12–2026-11-12/);assert.match(prose(a),/04:00/);
});
test('late refunds from an earlier sale are not subtracted from the wrong period',()=>{
 const f=fixture();f.state.transactions=[pay('one',5000,'2026-11-01')];f.state.refunds=[refund('late',2000,'2026-11-13')];const a=ask(f,'How much did we collect today?');assert.equal(value(a,'Net collections'),'GH₵-20.00');assert.equal(value(a,'Confirmed collections'),'GH₵0.00');assert.match(prose(a),/GH₵20.00/);
});
test('manager questions cannot expose an unassigned shop or the whole merchant account',()=>{
 const f=fixture();f.state.openingBalance=99999900;f.state.transactions=[pay('mine',1000,'2026-11-13'),pay('other',77777700,'2026-11-13',{shopId:'pentagon'})];
 for(const q of ['Show all shops','How much did Pentagon collect today?']){const a=ask(f,q,{actor:f.manager});assert.doesNotMatch(JSON.stringify(a),/777,777|999,999|Pentagon.*GH₵/);assert.equal(a.stats.length,0);}
 const a=ask(f,'Where is our money?',{actor:f.manager,shopId:'night'});assert.equal(value(a,'Current collection period · net'),'GH₵10.00');assert.doesNotMatch(JSON.stringify(a),/999,999|777,777|Merchant account/);assert.match(prose(a),/owner controls/);
});
test('manager shop assignments are checked independently of the supplied snapshot shape',()=>{
 const f=fixture();const a=ask(f,'How much did we collect today?',{actor:f.manager,shopId:'pentagon'});assert.equal(a.kind,'clarify');assert.equal(a.stats.length,0);
 assert.equal(ask(f,'Today?',{actor:{...f.owner,businessId:'other-business'}}).kind,'clarify');assert.equal(ask(f,'Today?',{actor:{...f.owner,role:'cashier'}}).kind,'clarify');
});
test('owner funds reuse authoritative ledger reservations including payout fees',()=>{
 const f=fixture();f.state.openingBalance=10000;f.state.transactions=[pay('one',10000,'2026-11-13')];f.state.refunds=[refund('held',1000,'2026-11-13',{status:'requested'})];f.state.settlements=[{id:'held-payout',amount:3000,fee:100,status:'processing',createdAt:now.toISOString()}];const a=ask(f,'What can I settle?'),m=ledger(f.state);assert.equal(value(a,'After reservations'),`GH₵${(m.available/100).toFixed(2)}`);assert.equal(value(a,'Reserved'),'GH₵41.00');assert.match(prose(a),/Transfers out are not connected/);assert.match(prose(a),/GH₵200.00.*GH₵41.00.*GH₵159.00/);assert.equal(a.actions[0].page,'settlements');
});
test('a selected shop counter is not presented as an owner settlement balance',()=>{
 const f=fixture();f.state.openingBalance=100000;f.state.transactions=[pay('one',1000,'2026-11-13')];const a=ask(f,'Where is our money?',{shopId:'night'});assert.equal(value(a,'Current collection period · net'),'GH₵10.00');assert.equal(value(a,'Merchant account'),undefined);
});
test('follow-up periods and named shops retain context and support correction',()=>{
 const f=fixture();f.state.transactions=[pay('one',1000,'2026-11-13'),pay('old',2000,'2026-11-12'),pay('other',3000,'2026-11-12',{shopId:'pentagon'})];let a=ask(f,'How much did Night Market collect today?');const messages=[{role:'user',text:'How much did Night Market collect today?'},{role:'assistant',answer:a}];a=ask(f,'And yesterday?',{context:merchantLuxContext(messages)});assert.equal(a.plan.period,'yesterday');assert.equal(a.scope,'Night Market');assert.equal(value(a,'Net collections'),'GH₵20.00');const b=ask(f,'And Pentagon?',{context:{previous:a.plan,questions:['And yesterday?']}});assert.equal(b.scope,'Pentagon');assert.equal(value(b,'Net collections'),'GH₵30.00');
});
test('shop comparisons report ties and never turn zero records into a winning shop',()=>{
 const f=fixture();assert.match(ask(f,'Which shop collected the most?').title,/No confirmed/);f.state.transactions=[pay('one',1000,'2026-11-13'),pay('two',1000,'2026-11-13',{shopId:'pentagon'})];const a=ask(f,'Which shop collected the most?');assert.match(a.title,/no single leader/);assert.match(prose(a),/not profit/);
});
test('an explicit second shop is included in comparison evidence as well as the totals',()=>{
 const f=fixture();f.state.transactions=[pay('one',1000,'2026-11-13'),pay('two',2000,'2026-11-13',{shopId:'pentagon'})];const a=ask(f,'Compare Night Market and Pentagon shops',{shopId:'night',plan:{task:'shops',shop:'Night Market',compareShop:'Pentagon'}});assert.equal(a.stats.length,2);assert.match(prose(a),/Pentagon: trading dates/);assert.equal(a.scope,'Night Market and Pentagon');
});
test('weekly changes compare matched weekdays and explain receipt and refund differences',()=>{
 const f=fixture();f.state.transactions=[pay('one',5000,'2026-11-10'),pay('earlier',3000,'2026-11-03'),pay('old-weekend',999900,'2026-11-08')];f.state.refunds=[refund('r',1000,'2026-11-12')];const a=ask(f,'What changed in our collections?');assert.equal(value(a,'Current period · net'),'GH₵40.00');assert.equal(value(a,'Earlier period · net'),'GH₵30.00');assert.match(prose(a),/same elapsed weekdays/);assert.match(prose(a),/2026-11-02–2026-11-06/);
});
test('a pending receipt and an unpaid request are not counted as confirmed money',()=>{
 const f=fixture();f.state.transactions=[pay('one',2500,'2026-11-12',{status:'processing'})];f.state.requests=[{id:'request',shopId:'night',status:'open',amount:999900,expiresAt:'2026-11-14T12:00:00Z'}];const a=ask(f,'What is still processing?');assert.equal(value(a,'Processing amount'),'GH₵25.00');assert.match(prose(a),/request is also waiting to be paid/);assert.match(prose(a),/across its recorded dates/);assert.doesNotMatch(prose(a),/GH₵9,999/);
});
test('receipt checks use exact authorised references and never accept a customer claim as proof',()=>{
 const f=fixture();f.state.transactions=[pay('one',2500,'2026-11-01',{status:'processing'})];const a=ask(f,'Check receipt LUM-one');assert.match(a.title,/still processing/);assert.doesNotMatch(prose(a),/This payment is confirmed/);assert.match(prose(a),/without assuming a date/);
 assert.equal(ask(f,'The customer says they paid me').kind,'clarify');assert.equal(ask(f,'Check receipt LUM-unknown').kind,'clarify');f.state.transactions[0].status='paid';assert.match(ask(f,'Check receipt LUM-one').title,/confirmed/);
});
test('close-of-day guidance cannot close a shop or remove master funds',()=>{
 const f=fixture();f.state.transactions=[pay('one',3000,'2026-11-13')];const before=structuredClone(f.state),a=ask(f,'What happens when I close the day?',{shopId:'night'});assert.equal(a.actions[0].page,'close');assert.equal(a.actions[0].shopId,'night');assert.match(prose(a),/money stays/);assert.deepEqual(f.state,before);assert.match(ask(f,'What happens when I close the day?').title,/resets its collection counter/);
});
test('profit and outside sales remain unknown without recorded costs and outside activity',()=>{
 const f=fixture();f.state.transactions=[pay('one',10000,'2026-11-13')];const a=ask(f,'What is my profit today?');assert.match(prose(a),/costs are not connected|costs and profit are not inferred/);assert.equal(a.stats.length,0);assert.doesNotMatch(prose(a),/GH₵100/);
});
test('staleness includes money, access changes and a trading-day rollover',()=>{
 const f=fixture();const a=ask(f,'How much did we collect today?');assert.equal(merchantLuxStale(f.state,a,{actor:f.owner,now}),false);assert.equal(merchantLuxStale(f.state,a,{actor:f.owner,now:new Date('2026-11-14T01:00:00Z')}),true);f.state.transactions.push(pay('one',1000,'2026-11-13'));assert.equal(merchantLuxStale(f.state,a,{actor:f.owner,now}),true);assert.equal(merchantLuxStale(f.state,a,{actor:f.manager,now}),true);
});
test('explain follow-ups recompute current figures and do not quote a stale balance',()=>{
 const f=fixture();const a=ask(f,'Where is our money?');f.state.openingBalance=25000;const b=ask(f,'Why?',{context:{previous:a.plan,questions:['Where is our money?']}});assert.match(prose(b),/GH₵250.00 opening balance/);assert.equal(b.plan.task,'funds');assert.equal(merchantLuxStale(f.state,b,{actor:f.owner,now}),false);
});
test('model plans cannot introduce a shop, receipt, date or executable action not in the question',()=>{
 for(const p of [{task:'executeRefund'},{task:'receipt',reference:'invented'},{task:'collections',shop:'Secret Shop'},{task:'collections',start:'2026-12-01',end:'2026-12-10'}])assert.equal(validateMerchantLuxPlan(p,'How much today?'),null);
 assert.deepEqual(validateMerchantLuxPlan({task:'collections',confidence:.5},'maybe that'),{task:'clarify'});assert.deepEqual(validateMerchantLuxPlan({task:'collections',period:'today',role:'owner',sql:'drop table'},'today'),{task:'collections',period:'today'});
});
test('credentials, currency conversion and malformed money do not produce a financial estimate',()=>{
 const f=fixture();assert.equal(ask(f,'My PIN is 1234').kind,'clarify');assert.equal(ask(f,'What are our sales in dollars?').kind,'clarify');f.state.transactions=[pay('bad',1.5,'2026-11-13')];const a=ask(f,'Today collections?');assert.equal(a.kind,'clarify');assert.doesNotMatch(JSON.stringify(a),/NaN|Infinity|GH₵0.02/);
});
