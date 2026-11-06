import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmptyState,createDemoState,evaluatePayment,applyAction,getSummary,validStoredState,migrateState} from '../dist/js/model.js';
import {createActivationDraft,fundActivation,addActivationBudgetItem,saveActivationBudget,completeActivation,deferActivationFunding} from '../dist/js/activation-model.js';
import {budgetSuggestions} from '../dist/js/savings-parity-model.js';
import {goalPace,renderPlanning} from '../dist/js/planning.js';
const date=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
const run=(s,t,p)=>{const r=applyAction(s,t,p);assert.equal(r.ok,true,r.message);return r;};
const state=()=>{const s=createEmptyState();s.wallet=10000;s.buffer=0;return s;};
const iou=(s,amount=5000)=>run(s,'createIOU',{name:'Kojo',type:'owedToMe',amount,due:date(1)}).iou;

test('incoming due tomorrow remains expected and manual receipts never credit personal or outside money',()=>{
  const s=state(),before=getSummary(s),x=iou(s);
  assert.equal(getSummary(s).available,before.available);assert.equal(getSummary(s).spendable,before.spendable);
  const snapshot=structuredClone(s);assert.equal(applyAction(s,'settleIOU',{id:x.id}).ok,false);assert.deepEqual(s,snapshot);
  run(s,'settleIOU',{id:x.id,amount:2000,destination:'momo',idempotencyKey:'outside-receipt'});
  assert.equal(s.wallet,before.available);assert.equal(getSummary(s).outsideTotal,0);assert.equal(x.paid,2000);
  run(s,'settleIOU',{id:x.id,amount:2000,destination:'momo',idempotencyKey:'outside-receipt'});
  assert.equal(x.paid,2000);assert.equal(s.transactions.filter(t=>t.type==='iou-manual-receipt').length,1);
});

test('matching confirmed income can allocate partial receipts across IOUs without crediting twice',()=>{
  const s=state(),x=iou(s),y=iou(s,5000),receipt=run(s,'fund',{amount:6000,source:'Kojo'}),wallet=s.wallet;
  run(s,'settleIOU',{id:x.id,amount:4000,receiptTransactionId:receipt.id,idempotencyKey:'match-one'});
  run(s,'settleIOU',{id:x.id,amount:4000,receiptTransactionId:receipt.id,idempotencyKey:'match-one'});
  assert.equal(x.paid,4000);assert.equal(s.wallet,wallet);assert.equal(s.transactions.filter(t=>t.type==='income').length,1);
  assert.equal(applyAction(s,'settleIOU',{id:y.id,amount:3000,receiptTransactionId:receipt.id}).ok,false);
  run(s,'settleIOU',{id:y.id,amount:2000,receiptTransactionId:receipt.id});
  assert.equal(s.wallet,wallet);assert.equal(applyAction(s,'settleIOU',{id:x.id,amount:1000,receiptTransactionId:receipt.id}).ok,false);
  const legacy={...receipt.transaction,id:'legacy-receipt',iouId:'old-settled'};s.transactions.push(legacy);delete legacy.iouAllocations;
  assert.equal(applyAction(s,'settleIOU',{id:x.id,amount:1000,receiptTransactionId:legacy.id}).ok,false);
  assert.equal(validStoredState(JSON.parse(JSON.stringify(s))),true);
});

test('failed and reversed old-period payments adjust their archived plan without consuming new spending',()=>{
  for(const outcome of ['failed','reversed']){
    const s=state();run(s,'createBudget',{items:[{id:'food',name:'Food',amount:9000,due:date(4)}]});
    const period=s.budget.periodId,old=run(s,'payment',{amount:2000,merchant:'Lunch',category:'Food',status:outcome==='failed'?'pending':'success'}).transaction;
    run(s,'startBudgetPeriod',{startDate:date(0),endDate:date(20)});
    run(s,'payment',{amount:1000,merchant:'New lunch',category:'Food'});
    run(s,outcome==='failed'?'resolvePayment':'reversePayment',{id:old.id,status:'failed'});
    assert.equal(s.budget.items[0].spent,1000);assert.equal(s.budgetHistory.find(b=>b.periodId===period).items[0].spent,0);
    assert.equal(s.budgetHistory.find(b=>b.periodId===period).totalSpent,0);
  }
});

test('plan horizon, expected allowance and each bill date remain independent across periods',()=>{
  const s=state();s.income={amount:5000,nextDate:date(7)};
  run(s,'createBudget',{items:[{id:'fees',name:'Fees',amount:1000,due:date(2)}]});
  run(s,'startBudgetPeriod',{startDate:date(0),endDate:date(30)});
  assert.equal(s.income.nextDate,date(7));assert.equal(s.budget.items[0].due,date(2));
  assert.equal(getSummary(s).planEndDate,date(30));assert.equal(getSummary(s).daysLeft,30);
  run(s,'recoveryPlan',{checkInDate:date(3)});assert.equal(getSummary(s).guidanceDate,date(3));assert.equal(s.income.nextDate,date(7));
});

test('equivalent categories are rejected for new plans while legacy snapshots retain money and IDs',()=>{
  const s=state();const result=applyAction(s,'createBudget',{items:[{id:'a',name:'Food & groceries',amount:1000},{id:'b',name:'Food and groceries',amount:1000}]});
  assert.equal(result.ok,false);assert.equal(s.budget.items.length,0);
  s.budget={...s.budget,created:true,items:[{id:'a',name:'Food & groceries',amount:1000,spent:100},{id:'b',name:'Food and groceries',amount:1000,spent:200}]};
  migrateState(s);assert.equal(validStoredState(s),true);assert.equal(getSummary(s).planned,1700);assert.equal(s.budget.items.length,2);
});

test('sample provenance survives save, refresh and period reuse and stays visible',()=>{
  const s=state(),provenance={transactions:0,projectedWeeks:2,sources:{'food & groceries':'sample'}};
  run(s,'createBudget',{items:[{id:'food',name:'Food',amount:1000}],provenance});
  const restored=migrateState(JSON.parse(JSON.stringify(s)));
  assert.match(renderPlanning({state:restored,draft:{}},{section:'plan',page:'home'}),/Sample student starting amounts/);
  run(restored,'startBudgetPeriod',{startDate:date(0),endDate:date(14)});assert.deepEqual(restored.budget.provenance,provenance);
});

test('overdue goals invite recovery instead of claiming an impossible daily saving pace',()=>{
  const p=goalPace({target:18000,balance:3000,deadline:date(-1)});
  assert.equal(p.overdue,true);assert.equal(p.remaining,15000);assert.equal(p.amount,0);
  const s=state();s.boxes.push({id:'print',name:'Printing goal',target:18000,balance:3000,deadline:date(-1)});
  const html=renderPlanning({state:s,draft:{}},{section:'boxes',page:'detail',id:'print'});
  assert.match(html,/Your goal date has passed/);assert.match(html,/Choose a new date or adjust your goal/);assert.doesNotMatch(html,/GH¢150\.00 a day/);
});

test('activation permits an optional keep-back and a verified unfunded waiting account',()=>{
  const s=createEmptyState();s.onboardingDone=true;const d=createActivationDraft({state:s});
  const waiting=deferActivationFunding(d);assert.equal(waiting.ok,true);assert.equal(waiting.state.wallet,0);assert.equal(waiting.state.activation.status,'waiting');assert.equal(waiting.state.transactions.length,0);
  const d2=createActivationDraft({state:s});assert.equal(fundActivation(d2,{amount:10000,source:'Mobile money'}).ok,true);assert.equal(addActivationBudgetItem(d2,{name:'Food',amount:6000}).ok,true);
  assert.equal(saveActivationBudget(d2,{buffer:5000}).ok,false);assert.equal(saveActivationBudget(d2,{buffer:1000}).ok,true);assert.equal(getSummary(d2.state).spendable,3000);assert.equal(completeActivation(d2).ok,true);
});

test('personal totals retain pending payment, card and contribution holds once',()=>{
  const s=state();run(s,'payment',{amount:1000,fee:50,merchant:'Pending',status:'pending'});let q=getSummary(s);assert.equal(q.pendingPaymentHolds,1050);assert.equal(q.total,10000);
  s.wallet-=500;s.transactions.push({id:'group-pending',type:'contribution',status:'pending',walletDebited:true,amount:500});
  s.virtualCards.push({id:'card',balance:2000});s.transactions.push({id:'card-pending',type:'card-purchase',status:'pending',held:true,amount:300});
  q=getSummary(s);assert.equal(q.pendingContributionHolds,500);assert.equal(q.pendingCardHolds,300);assert.equal(q.total,12300);
});


test('a deferred account progresses only on confirmed funds and a real plan, including reload',()=>{
  const s=createEmptyState();s.onboardingDone=true;let account=deferActivationFunding(createActivationDraft({state:s})).state;
  const attempt=run(account,'startFundingAttempt',{amount:10000,rail:'momo',number:'0241234567'});
  assert.equal(account.activation.status,'waiting');run(account,'resolveFundingAttempt',{id:attempt.id,status:'failed'});assert.equal(account.activation.status,'waiting');
  run(account,'fund',{amount:10000,source:'Allowance'});assert.equal(account.activation.status,'needs-plan');
  account=migrateState(JSON.parse(JSON.stringify(account)));assert.equal(account.activation.status,'needs-plan');
  run(account,'createBudget',{items:[{name:'Food',amount:5000}]});assert.equal(account.activation.status,'ready');
  account=migrateState(JSON.parse(JSON.stringify(account)));assert.equal(account.activation.status,'ready');assert.equal(account.wallet,10000);
});


test('v40 and demo legacy payments bind before rollover and cannot clear fresh spending',()=>{
  const s=createDemoState(),period=s.budget.periodId;assert.equal(s.transactions.find(t=>t.id==='tx-demo-1').budgetPeriodId,period);
  run(s,'startBudgetPeriod',{startDate:date(0),endDate:date(30)});run(s,'payment',{amount:1000,merchant:'Fresh lunch',category:'Food'});
  run(s,'reversePayment',{id:'tx-demo-1'});assert.equal(s.budget.items.find(i=>i.id==='food').spent,1000);
  assert.equal(s.budgetHistory.find(b=>b.periodId===period).items.find(i=>i.id==='food').spent,7500);
});

test('migration of an already rolled-over legacy save resolves historical receipts without touching current plan',()=>{
  const s=state();run(s,'createBudget',{items:[{id:'food',name:'Food',amount:9000}]});const tx=run(s,'payment',{amount:2000,merchant:'Old lunch',category:'Food'}).transaction,period=s.budget.periodId;
  run(s,'startBudgetPeriod',{startDate:date(0),endDate:date(20)});run(s,'payment',{amount:1000,merchant:'New lunch',category:'Food'});
  delete tx.budgetPeriodId;const restored=migrateState(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.transactions.find(t=>t.id===tx.id).budgetPeriodId,period);run(restored,'reversePayment',{id:tx.id});assert.equal(restored.budget.items[0].spent,1000);assert.equal(restored.budgetHistory[0].items[0].spent,0);
});


test('IOU outflow preview releases the actual reserved obligation, including uncovered linked debt',()=>{
  for(const linked of [false,true]){
    const s=state();s.wallet=20000;if(linked)run(s,'createBudget',{items:[{id:'fees',name:'Fees',amount:6000}]});
    const x=run(s,'createIOU',{name:'Esi',type:'owedByMe',amount:8000,due:date(1),...(linked?{budgetItemId:'fees'}:{})}).iou;
    const preview=evaluatePayment(s,{amount:8000,category:'IOU',budgetItemId:x.budgetItemId,iouId:x.id});
    run(s,'settleIOU',{id:x.id,amount:8000});assert.equal(preview.afterPlanned,getSummary(s).planned);assert.equal(preview.afterSpendable,getSummary(s).spendable);assert.equal(preview.afterAvailable,getSummary(s).available);
  }
});


test('budget matching and uniqueness use the same canonical aliases',()=>{
  const s=state();run(s,'createBudget',{items:[{name:'Food & groceries',amount:3000}]});
  assert.equal(applyAction(s,'updateBudget',{items:[...s.budget.items,{name:'Meals',amount:1000}]}).ok,false);
  assert.equal(evaluatePayment(s,{amount:1000,category:'Meals'}).budgetAllocation,1000);
});


test('suggestion history includes confirmed card spending net of refunds and excludes holds, fees and internal transfers',()=>{
  const s=state(),at='2026-10-20T12:00:00Z';
  s.transactions=[{id:'card-spend',type:'card-purchase',direction:'out',status:'success',amount:6000,refunded:2000,category:'Data',at},{id:'normal-spend',type:'payment',direction:'out',status:'success',amount:2000,fee:100,category:'Data',at},{id:'hold',type:'card-purchase',status:'pending',amount:9000,category:'Data',at},{id:'transfer',type:'card-transfer',status:'success',amount:9000,category:'Data',at}];
  const result=budgetSuggestions(s,new Date('2026-11-05T12:00:00Z'));
  assert.equal(result.transactions,2);assert.equal(result.categories[0].total,6000);assert.equal(result.categories[0].weekly,1500);
});
