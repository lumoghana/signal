import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuickEssentials,prepareQuickEssentials} from '../dist/js/budget-quick.js';
import {createEmptyState,applyAction,getSummary,migrateState} from '../dist/js/model.js';
import {renderPlanning,bindPlanning} from '../dist/js/planning.js';
import {parentRoute,safeRoute} from '../dist/js/navigation.js';
const date=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
const state=()=>{const s=createEmptyState();s.wallet=10000;s.buffer=0;s.onboardingDone=true;return s;};
const chosen=()=>({...createQuickEssentials(),amounts:['30','10','','0'],dates:[date(3),'','',''],endDate:date(20),bufferText:'5'});
const run=(s,t,p)=>{const r=applyAction(s,t,p);assert.equal(r.ok,true,r.message);return r;};

test('quick starter is visible on empty plan and keeps amount fields blank',()=>{
  const s=state(),ctx={state:s,draft:{}};
  assert.match(renderPlanning(ctx,{section:'plan',page:'home'}),/Quick essentials/);
  assert.match(renderPlanning(ctx,{section:'plan',page:'home'}),/Build one essential at a time/);
  const html=renderPlanning(ctx,{section:'plan',page:'create',step:'quick'});
  for(let i=0;i<4;i++)assert.match(html,new RegExp(`name="quick-amount-${i}"[^>]*value=""`));
  assert.match(html,/Individual due dates · optional/);assert.match(html,/expected allowance date stays separate/);
});

test('quick starter includes only positive choices and retains independent optional bill dates',()=>{
  const s=state(),before=structuredClone(s),result=prepareQuickEssentials(s,chosen());
  assert.equal(result.ok,true);assert.deepEqual(result.items.map(i=>i.amount),[3000,1000]);assert.equal(result.items[0].due,date(3));assert.equal(result.items[1].due,'');assert.equal(result.endDate,date(20));assert.equal(result.buffer,500);assert.deepEqual(s,before);
});

test('invalid amounts, dates, blank plans and duplicate draft categories fail without mutation',()=>{
  const s=state(),before=structuredClone(s);
  for(const quick of [createQuickEssentials(),{...chosen(),amounts:['-1','','','']},{...chosen(),amounts:['1.001','','','']},{...chosen(),endDate:'2026-02-30'},{...chosen(),dates:[date(-1),'','','']},{...chosen(),bufferText:'-1'}])assert.equal(prepareQuickEssentials(s,quick).ok,false);
  const duplicates=[{id:'one',name:'Food',amount:1000,spent:0},{id:'two',name:'Food and groceries',amount:1000,spent:0}];
  assert.equal(prepareQuickEssentials(s,chosen(),duplicates).ok,false);assert.deepEqual(s,before);
});

test('quick draft refresh preserves inputs, IDs and custom additions without duplicate categories',()=>{
  const s=state(),quick=chosen(),first=prepareQuickEssentials(s,quick);let draft=JSON.parse(JSON.stringify({items:first.items,quick,buffer:first.buffer,endDate:first.endDate,item:{},lastRoute:{section:'plan',page:'create',step:'review'}}));
  draft.items.push({id:'custom',name:'Printing',amount:500,spent:0,due:''});draft.items[0].amount=3500;
  renderPlanning({state:s,draft:{plan:draft}},{section:'plan',page:'create',step:'quick'});
  assert.equal(draft.quick.amounts[0],'35.00');const next=prepareQuickEssentials(s,draft.quick,draft.items);assert.equal(next.ok,true);assert.equal(next.items.find(i=>i.name==='Food & groceries').id,first.items[0].id);assert.equal(next.items.find(i=>i.name==='Printing').amount,500);assert.equal(next.items.length,3);
  assert.deepEqual(parentRoute({section:'plan',page:'create',step:'review',backTo:{section:'plan',page:'create',step:'quick'}},s,{plan:draft}),{section:'plan',page:'create',step:'quick'});
  assert.equal(safeRoute({section:'plan',page:'create',step:'quick'},s,{plan:draft}).step,'quick');
});

test('review then save reserves money once, persists horizon and cushion, and never changes allowance or bill dates',()=>{
  let s=state();const incomeDate=s.income.nextDate,result=prepareQuickEssentials(s,chosen());
  const review=renderPlanning({state:s,draft:{plan:{items:result.items,item:{},quick:chosen(),buffer:result.buffer,endDate:result.endDate}}},{section:'plan',page:'create',step:'review'});
  assert.match(review,/Edit quick essentials/);assert.equal(s.budget.created,false);assert.equal(s.wallet,10000);
  run(s,'createBudget',{items:result.items,buffer:result.buffer,endDate:result.endDate,idempotencyKey:'quick-save'});run(s,'createBudget',{items:result.items,buffer:result.buffer,endDate:result.endDate,idempotencyKey:'quick-save'});
  s=migrateState(JSON.parse(JSON.stringify(s)));assert.equal(s.wallet,10000);assert.equal(s.transactions.length,0);assert.equal(s.budget.items.length,2);assert.equal(s.income.nextDate,incomeDate);assert.equal(s.budget.endDate,date(20));assert.equal(s.budget.items[0].due,date(3));assert.equal(s.budget.items[1].due,'');assert.equal(s.buffer,500);assert.equal(getSummary(s).spendable,5500);
});

test('over-budget choices reach an honest gap review without inventing funds; saved spending is protected',()=>{
  const s=state(),quick={...chosen(),amounts:['200','','','']},result=prepareQuickEssentials(s,quick);assert.equal(result.ok,true);assert.equal(result.shortfall,10500);
  const html=renderPlanning({state:s,draft:{plan:{items:result.items,item:{},quick,buffer:result.buffer,endDate:result.endDate}}},{section:'plan',page:'create',step:'review'});assert.match(html,/need GH[¢₵]105\.00 more/);assert.equal(s.wallet,10000);
  run(s,'createBudget',{items:[{id:'existing',name:'Food',amount:5000,spent:1000}]});const before=structuredClone(s);assert.equal(prepareQuickEssentials(s,chosen()).ok,false);assert.deepEqual(s,before);
});

test('quick inputs are captured into the existing saved draft before leaving',()=>{
  const s=state(),draft={plan:{items:[],item:{},quick:createQuickEssentials()}},fields=new Map([['[name="quick-amount-0"]',{value:'42'}],['[name="quick-date-0"]',{value:date(4)}],['[name="quick-end"]',{value:date(18)}],['[name="quick-buffer"]',{value:'3'}]]);let capture,saved=0;
  bindPlanning({state:s,draft,$:selector=>fields.get(selector)||null,$$:()=>[],setCapture:fn=>{capture=fn;},saveDraft:()=>saved++},{section:'plan',page:'create',step:'quick'});capture();
  assert.equal(draft.plan.quick.amounts[0],'42');assert.equal(draft.plan.quick.dates[0],date(4));assert.equal(draft.plan.quick.endDate,date(18));assert.equal(draft.plan.quick.bufferText,'3');assert.equal(draft.plan.lastRoute.step,'quick');assert.ok(saved>0);
});
