import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, evaluatePayment, getSummary } from '../dist/js/model.js';
import { getLuxAnswer, executeLuxPlan, validateLuxPlan, luxQuestionContext } from '../dist/js/lux-brain.js';
import { isFinancialAnswerStale } from '../dist/js/chat-action-model.js';

const now=new Date('2026-11-13T12:00:00Z');
const account=()=>{const s=createEmptyState({name:'Ama'});s.wallet=20000;s.buffer=1000;s.budget={created:true,items:[{id:'food',name:'Food',amount:5000,spent:0,due:'2026-11-20'},{id:'transport',name:'Transport',amount:2000,spent:0,due:'2026-11-20'}]};return s;};
const ask=(s,q,messages=[])=>getLuxAnswer(s,q,{now,messages});
const history=(q,a)=>[{role:'user',text:q},{role:'assistant',...a}];
const prose=a=>[a.title,...a.paragraphs,...(a.basis||[])].join(' ');
const payment=(id,amount,at,rest={})=>({id,type:'payment',status:'success',direction:'out',rail:'lumo',category:'Food',amount,fee:0,at:at+'T10:00:00Z',...rest});

test('alternative prices start from the same balance and explain planned-food treatment',()=>{
  const s=account(),before=structuredClone(s),a=ask(s,'GH₵30 lunch or GH₵50 lunch?');
  assert.equal(a.luxPlan.task,'compare');assert.match(prose(a),/preserves more of that allocation/);
  const impact=evaluatePayment(s,{amount:3000,category:'Food',categoryExplicit:true},now);
  assert.equal(a.stats[0].value,`GH₵${(impact.afterSpendable/100).toFixed(2)}`);
  assert.match(prose(a),/GH₵20.00 more in Everyday/);assert.deepEqual(s,before);
});
test('a comparison above available funds never promises the larger option is safe',()=>{
  const s=account(),a=ask(s,'Compare GHS 30 lunch or GHS 900 lunch');assert.match(prose(a),/Exceeds available/);assert.equal(a.actions[0].route.section,'plan');
});
test('both comparison prices and the amount for a recurring scenario are required',()=>{
  assert.equal(ask(account(),'Should I get a ride or lunch?').context.topic,'clarify');
  const a=executeLuxPlan(account(),'lunch for 5 days',{task:'recurring',days:5,subject:'lunch'},{now});assert.equal(a.context.topic,'clarify');
});
test('recurring expense is calculated once in integer pesewas with canonical Pause impact',()=>{
  const s=account(),a=ask(s,'20 cedis a day on lunch for 5 days'),x=evaluatePayment(s,{amount:10000,category:'Food',categoryExplicit:true},now);
  assert.equal(a.stats[0].value,'GH₵100.00');assert.equal(a.stats[1].value,`GH₵${(x.afterSpendable/100).toFixed(2)}`);assert.match(prose(a),/does not schedule/);
});
test('numeric corrections keep the subject and refresh the actual money',()=>{
  const s=account(),q='Can I afford lunch?',a=ask(s,q),b=ask(s,'30',history(q,a));
  assert.equal(b.context.amount,3000);assert.equal(b.context.subject,'lunch');s.wallet=4000;
  const c=ask(s,'What about 80?',history('30',b));assert.equal(c.context.amount,8000);assert.match(prose(c),/not enough|needs a pause|exceed/i);
});
test('why follow-up recomputes the original comparison instead of quoting an old answer',()=>{
  const s=account(),q='30 cedis lunch or 70 cedis lunch?',a=ask(s,q);s.wallet=40000;
  const b=ask(s,'Show the calculation',history(q,a));assert.match(prose(b),/GH₵400.00 available/);assert.equal(b.luxPlan.task,'compare');assert.equal(isFinancialAnswerStale(s,b,now),false);
});
test('only user questions and intent slots are sent as provider context',()=>{
  const a=ask(account(),'Can I afford GH₵50 lunch?'),c=luxQuestionContext(history('Can I afford GH₵50 lunch?',a));
  assert.deepEqual(c.questions,['Can I afford GH₵50 lunch?']);assert.equal(c.previous.amount,5000);assert.doesNotMatch(JSON.stringify(c),/wallet|moneySnapshot|planned|stats|available/);
});
test('untrusted model cannot invent a cost, rate, currency conversion or executable command',()=>{
  for(const p of [{task:'afford',amount:999999},{task:'recurring',amount:3000,days:8},{task:'executePayment',amount:3000},{task:'afford',amount:30.5},{task:'afford',amount:-3000}]) assert.equal(validateLuxPlan(p,'30 cedis lunch for 5 days'),null);
  assert.equal(validateLuxPlan({task:'afford',amount:3000},'30 dollars'),null);
  const p=validateLuxPlan({task:'afford',amount:3000,route:'steal',pin:'1234'},'GHS 30 lunch');assert.deepEqual(p,{task:'afford',amount:3000});
  assert.deepEqual(validateLuxPlan({task:'afford',confidence:.4},'maybe lunch'),{task:'clarify'});
});
test('currency ambiguity reaches existing safe clarification without treating dollars as cedis',()=>{
  const a=ask(account(),'Can I spend 30 dollars?');assert.equal(a.context.topic,'clarify');assert.match(prose(a),/Ghana cedis|cedi amount/);
});
test('mixed currency comparisons, stated word amounts and compact cedi notation stay exact',()=>{
  assert.equal(ask(account(),'30 dollars lunch or 50 dollars lunch?').context.topic,'clarify');
  assert.deepEqual(validateLuxPlan({task:'afford',amount:3500},'Can I afford thirty five cedis for lunch?'),{task:'afford',amount:3500});
  assert.deepEqual(validateLuxPlan({task:'recurring',amount:2000,days:5},'twenty cedis per day for five days'),{task:'recurring',amount:2000,days:5});
  const a=ask(account(),'GHS30 or 50cedis for lunch?');assert.equal(a.luxPlan.amount,3000);assert.equal(a.luxPlan.alternative,5000);
  assert.deepEqual(validateLuxPlan({task:'afford',amount:205000},'Can I afford GHS2050?'),{task:'afford',amount:205000});
});
test('patterns match weekdays, include fees and exclude pending or internal money',()=>{
  const s=account();s.transactions=[payment('current',3000,'2026-11-10',{fee:100}),payment('previous',1000,'2026-11-03'),payment('weekend',9999,'2026-11-08'),payment('pending',9999,'2026-11-11',{status:'pending'}),payment('internal',9999,'2026-11-11',{rail:'internal'}),payment('reversed',9999,'2026-11-11',{status:'reversed'})];
  const a=ask(s,'What changed in my food spending?');assert.equal(a.stats[0].value,'GH₵31.00');assert.equal(a.stats[1].value,'GH₵10.00');assert.match(prose(a),/2026-11-02–2026-11-06/);assert.match(prose(a),/Matched 5/);
});
test('month comparison uses requested months and reports different lengths honestly',()=>{
  const s=account();s.transactions=[payment('a',3000,'2026-10-31'),payment('b',1000,'2026-09-15')];
  const a=executeLuxPlan(s,'compare spending last month',{task:'patterns',period:'last month'},{now});assert.equal(a.stats[0].value,'GH₵30.00');assert.equal(a.stats[1].value,'GH₵10.00');assert.match(prose(a),/different lengths/);
});
test('no baseline never becomes a claim about usual habits or an infinite increase',()=>{
  const s=account();s.transactions=[payment('a',1000,'2026-11-10')];const a=ask(s,'Am I spending more than usual?');assert.match(prose(a),/no earlier spending baseline/);assert.doesNotMatch(prose(a),/Infinity|NaN|100%/);
});
test('runway separates linked essentials from flexible pace and invents no allowance',()=>{
  const s=account();s.income={amount:9000000,nextDate:'2026-11-20'};s.transactions=[payment('a',700,'2026-11-10'),payment('b',700,'2026-11-11'),payment('c',700,'2026-11-12'),payment('food',99900,'2026-11-12',{budgetItemId:'food'})];const a=ask(s,'How long will my money last?');
  assert.match(prose(a),/GH₵21.00/);assert.match(prose(a),/GH₵3.00 a day/);assert.equal(a.stats[0].value,`GH₵${(getSummary(s,now).spendable/100).toFixed(2)}`);assert.doesNotMatch(a.paragraphs.join(' '),/90,000/);
});
test('sparse history and a missing plan never produce an invented run-out date',()=>{
  const s=createEmptyState();s.wallet=100000;const a=ask(s,'Will my money last?');assert.match(prose(a),/too few|no current/);assert.doesNotMatch(prose(a),/cover about \d+ full days/);
});
test('goal pace uses an actual chosen box, excludes expected contributions and rounds up',()=>{
  const s=account();s.boxes=[{id:'laptop',name:'Laptop',target:20001,balance:10000,deadline:'2026-11-20'},{id:'fees',name:'Fees',target:50000,balance:1000,deadline:'2026-12-20'}];
  const a=ask(s,'Am I on track for Laptop?');assert.equal(a.stats[1].value,'GH₵100.01');assert.equal(a.stats[2].value,'GH₵14.29');assert.match(prose(a),/not evidence.*on track/);
  assert.equal(ask(s,'Am I on track with my goal?').context.topic,'clarify');
});
test('Money Boxes, expected money and group funds do not make an unaffordable purchase fit',()=>{
  const s=account();s.wallet=1000;s.boxes=[{id:'a',name:'Fees',target:1000000,balance:999999}];s.income={amount:999999,nextDate:'2026-11-15'};s.groups=[{balance:999999}];s.ious=[{id:'i',type:'owedToMe',amount:999999,paid:0,status:'open'}];const a=ask(s,'30 cedis lunch or 50 cedis lunch?');assert.equal(a.stats[0].value,'Not enough available');assert.equal(a.stats[1].value,'Not enough available');
});
test('new answers keep evidence and stale actions need the existing review boundary',()=>{
  const s=account(),a=ask(s,'30 cedis lunch or 50 cedis lunch?');assert.equal(isFinancialAnswerStale(s,a,now),false);s.wallet--;assert.equal(isFinancialAnswerStale(s,a,now),true);assert.ok(a.actions.every(x=>!x.type&&!x.pin&&!x.payload));
});
