import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmptyState,applyAction,getSummary} from '../dist/js/model.js';
import {budgetSuggestions} from '../dist/js/savings-parity-model.js';
import {renderPlanning} from '../dist/js/planning.js';
const date=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
function state(){const s=createEmptyState();s.wallet=100000;s.buffer=0;s.income.nextDate=date(30);s.onboardingDone=true;return s;}
const run=(s,t,p={})=>{const r=applyAction(s,t,p);assert.equal(r.ok,true,r.message);return r;};
function box(s,changes={}){return run(s,'createBox',{name:'Next semester',target:50000,deadline:'',...changes}).box;}

test('saving stops exactly at target and a skipped rule explains why',()=>{
  const s=state(),b=box(s,{target:10000,hack:{type:'fixed',value:1000}});b.balance=9999;
  run(s,'payment',{merchant:'Lunch',amount:1000});assert.equal(b.balance,10000);
  run(s,'payment',{merchant:'Lunch',amount:1000});assert.equal(b.balance,10000);
  assert.equal(s.savingsHistory.find(e=>e.status==='skipped').reason,'Goal already reached');
});
test('incoming saving uses confirmed received money and caps savings across triggers',()=>{
  const s=state(),b=box(s,{hack:{type:'income',value:10,monthlyCap:1500}});
  const before=s.wallet;run(s,'fund',{amount:10000,source:'Allowance',idempotencyKey:'income-first'});
  assert.equal(b.balance,1000);assert.equal(s.wallet,before+9000);
  run(s,'fund',{amount:10000,source:'Allowance',idempotencyKey:'income-first'});assert.equal(b.balance,1000);
  run(s,'fund',{amount:10000,source:'Allowance',idempotencyKey:'income-second'});assert.equal(b.balance,1500);
  run(s,'fund',{amount:10000,source:'Allowance',idempotencyKey:'income-third'});assert.equal(b.balance,1500);
  assert.match(s.savingsHistory.find(e=>e.status==='skipped').reason,/Monthly saving limit/);
});
test('scheduled saving runs once for its due date and advances without catch-up charges',()=>{
  const s=state(),b=box(s,{hack:{type:'scheduled',value:500,frequency:'weekly',nextRun:date(-20)}}),before=s.wallet;
  run(s,'runScheduledSavings');assert.equal(b.balance,500);assert.equal(s.wallet,before-500);assert.ok(b.hack.nextRun>date(0));
  run(s,'runScheduledSavings');assert.equal(b.balance,500);assert.equal(s.savingsHistory.filter(e=>e.status==='saved').length,1);
});
test('pause retains a rule and resume restores it; cancel retains saving history',()=>{
  const s=state(),b=box(s,{hack:{type:'percent',value:5,monthlyCap:5000,floor:1000}});
  run(s,'setHackPaused',{id:b.id,paused:true});run(s,'payment',{merchant:'Lunch',amount:1000});assert.equal(b.balance,0);assert.equal(b.hack.value,5);
  run(s,'setHackPaused',{id:b.id,paused:false});run(s,'payment',{merchant:'Lunch',amount:1000});assert.equal(b.balance,50);
  run(s,'cancelSavingsHack',{id:b.id});assert.equal(b.hack.type,'none');assert.equal(b.balance,50);assert.ok(s.savingsHistory.some(e=>e.status==='saved'));assert.ok(s.savingsHistory.some(e=>e.status==='cancelled'));
});
test('recovery protects saving and does not replace the expected allowance date',()=>{
  const s=state(),b=box(s,{hack:{type:'fixed',value:1000}}),expected=s.income.nextDate;
  run(s,'recoveryPlan',{checkInDate:date(7),reduceCategories:[]});assert.equal(s.income.nextDate,expected);assert.equal(s.recovery.checkInDate,date(7));
  run(s,'payment',{merchant:'Lunch',amount:1000});assert.equal(b.balance,0);assert.match(s.savingsHistory[0].reason,/Recovery/);
  run(s,'completeRecovery');run(s,'payment',{merchant:'Lunch',amount:1000});assert.equal(b.balance,1000);
});
test('open-ended pots archive and restore without losing money or transfer history',()=>{
  const s=state(),b=box(s,{target:0}),total=getSummary(s).total;
  run(s,'contributeBox',{id:b.id,amount:10000});const transferId=s.transactions[0].id;
  run(s,'archiveBox',{id:b.id});assert.equal(getSummary(s).total,total);assert.equal(b.archived,true);
  assert.equal(applyAction(s,'withdrawBox',{id:b.id,amount:100}).ok,false);
  run(s,'restoreBox',{id:b.id});assert.equal(b.archived,false);assert.equal(b.balance,10000);assert.equal(s.transactions[0].id,transferId);
});
test('box transfer holds, same-reference retry, final status and reversal conserve money',()=>{
  const s=state(),b=box(s),total=getSummary(s).total;
  const t=run(s,'contributeBox',{id:b.id,amount:10000,status:'pending',idempotencyKey:'pending-box'}).transaction;
  assert.equal(b.balance,0);assert.equal(s.wallet,90000);assert.equal(getSummary(s).total,total);
  assert.equal(applyAction(s,'archiveBox',{id:b.id}).ok,false);
  run(s,'resolveBoxTransfer',{transactionId:t.id,status:'failed'});assert.equal(s.wallet,100000);
  run(s,'retryBoxTransfer',{transactionId:t.id});assert.equal(s.wallet,90000);assert.equal(s.transactions.filter(x=>x.id===t.id).length,1);
  run(s,'resolveBoxTransfer',{transactionId:t.id,status:'success'});assert.equal(b.balance,10000);assert.equal(getSummary(s).total,total);
  assert.equal(applyAction(s,'resolveBoxTransfer',{transactionId:t.id,status:'success'}).ok,false);
  run(s,'reverseBoxTransfer',{transactionId:t.id});assert.equal(s.wallet,100000);assert.equal(b.balance,0);assert.equal(getSummary(s).total,total);
  assert.equal(applyAction(s,'reverseBoxTransfer',{transactionId:t.id}).ok,false);
});
test('withdrawal pending, failure and retry never credit spendable money before success',()=>{
  const s=state(),b=box(s);run(s,'contributeBox',{id:b.id,amount:10000});
  const t=run(s,'withdrawBox',{id:b.id,amount:5000,status:'pending'}).transaction;
  assert.equal(s.wallet,90000);assert.equal(b.balance,5000);assert.equal(getSummary(s).total,100000);
  run(s,'resolveBoxTransfer',{id:t.id,status:'failed'});assert.equal(b.balance,10000);assert.equal(s.wallet,90000);
  run(s,'retryBoxTransfer',{id:t.id});run(s,'resolveBoxTransfer',{id:t.id,status:'success'});assert.equal(s.wallet,95000);assert.equal(b.balance,5000);
});
test('budget period review keeps past actuals and a reused period starts fresh',()=>{
  const s=state();run(s,'createBudget',{items:[{id:'food',name:'Food',amount:10000,spent:0,due:date(10)}]});
  run(s,'payment',{merchant:'Lunch',amount:2000,category:'Food'});const period=s.budget.periodId;
  run(s,'startBudgetPeriod',{startDate:date(0),endDate:date(30)});assert.equal(s.budgetHistory.length,1);assert.equal(s.budgetHistory[0].periodId,period);assert.equal(s.budgetHistory[0].totalSpent,2000);assert.equal(s.budget.items[0].spent,0);
  run(s,'reuseBudgetPeriod',{periodId:period,startDate:date(0),endDate:date(20)});assert.equal(s.budgetHistory.length,2);assert.equal(s.budget.items[0].spent,0);assert.equal(s.transactions.filter(t=>t.type==='payment').length,1);
});
test('linked IOUs reserve overlapping costs once and repayments update their linked plan',()=>{
  const s=state();run(s,'createBudget',{items:[{id:'fees',name:'Fees',amount:10000,spent:0,due:date(5)}],endDate:date(30)});
  const one=run(s,'createIOU',{name:'Esi',amount:8000,type:'owedByMe',due:date(5),budgetItemId:'fees'}).iou;
  run(s,'createIOU',{name:'Kojo',amount:8000,type:'owedByMe',due:date(5),budgetItemId:'fees'});assert.equal(getSummary(s).planned,16000);
  run(s,'settleIOU',{id:one.id,amount:3000});assert.equal(s.budget.items[0].spent,3000);assert.equal(getSummary(s).planned,13000);
});
test('complete-week budget suggestions exclude this week and unsettled/reversed money',()=>{
  const s=state(),now=new Date('2026-11-02T12:00:00Z');
  s.transactions=[{type:'payment',status:'success',direction:'out',at:'2026-10-19T12:00:00Z',amount:28000,category:'Food'},{type:'payment',status:'success',direction:'out',at:'2026-11-02T12:00:00Z',amount:100000,category:'Food'},{type:'payment',status:'pending',direction:'out',at:'2026-10-19T12:00:00Z',amount:50000,category:'Food'},{type:'payment',status:'reversed',direction:'out',at:'2026-10-19T12:00:00Z',amount:50000,category:'Food'}];
  const suggestion=budgetSuggestions(s,now);assert.equal(suggestion.start,'2026-10-05');assert.equal(suggestion.end,'2026-11-01');assert.equal(suggestion.transactions,1);assert.equal(suggestion.categories[0].weekly,7000);
});
test('box history binds unique records rather than matching a box name in a payment',()=>{
  const s=state(),b=box(s);run(s,'payment',{merchant:'Next semester',amount:1000,note:'Mentioning Next semester'});
  const html=renderPlanning({state:s,draft:{}},{section:'boxes',page:'detail',id:b.id});assert.doesNotMatch(html,/Mentioning Next semester/);
});
test('saving dashboards and budget periods are connected from root pages',()=>{
  const s=state();box(s,{hack:{type:'fixed',value:100}});
  const boxes=renderPlanning({state:s,draft:{}},{section:'boxes',page:'home'});assert.match(boxes,/data-parity="hacks"/);assert.match(boxes,/data-parity="archives"/);
  const plan=renderPlanning({state:s,draft:{}},{section:'plan',page:'home'});assert.match(plan,/parity-periods/);assert.match(plan,/parity-guided/);assert.match(plan,/parity-categories/);
  const dashboard=renderPlanning({state:s,draft:{}},{section:'boxes',page:'hacks'});assert.match(dashboard,/checked on app open, return and connected account sync/);
});
