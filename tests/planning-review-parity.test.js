import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAction,createEmptyState,getSummary} from '../dist/js/model.js';
import {renderPlanning} from '../dist/js/planning.js';
import {bindPlanningParity} from '../dist/js/planning-parity-ui.js';
import {cash,dateLabel} from '../dist/js/ui.js';

const date=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
const act=(s,type,payload)=>{const result=applyAction(s,type,payload);assert.equal(result.ok,true,result.message);return result;};
const text=html=>html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const reviewLeft=html=>text(html).match(/Left after plan (GH₵[\d,.]+)/)?.[1];

for(const [name,oldDays,newDays,linked] of [
  ['extended period includes a newly due IOU',7,30,false],
  ['shorter period excludes an IOU beyond the new horizon',30,7,false],
  ['linked due debt is not reserved a second time',7,30,true],
])test(`budget review matches the saved period: ${name}`,()=>{
  const state=createEmptyState();state.settings.hideBalance=false;state.wallet=20000;state.buffer=1000;
  act(state,'createBudget',{items:[{id:'food',name:'Food',amount:2000,due:date(3)}],endDate:date(oldDays)});
  act(state,'createIOU',{name:'Esi',type:'owedByMe',amount:8000,due:date(20),...(linked?{budgetItemId:'food'}:{})});
  const draft={plan:{items:structuredClone(state.budget.items),item:{},newPeriod:{startDate:date(0),endDate:date(newDays)}}};
  const originalState=structuredClone(state),originalDraft=structuredClone(draft);
  const html=renderPlanning({state,draft},{section:'plan',page:'create',step:'review'});
  assert.deepEqual(state,originalState,'Review cannot archive or otherwise mutate the current money state.');
  assert.deepEqual(draft,originalDraft,'Review does not modify the editable draft.');
  assert.ok(text(html).includes(`Plan covers you until ${dateLabel(date(newDays))}`));
  const saved=structuredClone(state);
  act(saved,'startBudgetPeriod',{...draft.plan.newPeriod,items:draft.plan.items});
  assert.equal(reviewLeft(html),cash(getSummary(saved).spendable));
  assert.equal(state.budget.items[0].due,date(3),'The review horizon never rewrites an individual due date.');
});

test('review of a resumed new-period draft uses fresh spending and the buffer that will be saved',()=>{
  const state=createEmptyState();state.settings.hideBalance=false;state.wallet=50000;state.buffer=1000;
  act(state,'createBudget',{items:[{id:'food',name:'Food',amount:10000}],endDate:date(7)});
  act(state,'payment',{amount:8000,merchant:'Lunch',category:'Food'});
  const draft={plan:{items:structuredClone(state.budget.items),item:{},buffer:9000,newPeriod:{startDate:date(0),endDate:date(30)}}};
  const html=renderPlanning({state,draft},{section:'plan',page:'create',step:'review'}),saved=structuredClone(state);
  act(saved,'startBudgetPeriod',{...draft.plan.newPeriod,items:draft.plan.items});
  assert.equal(reviewLeft(html),cash(getSummary(saved).spendable));
  assert.ok(text(html).includes(`Budget set aside ${cash(10000)}`));
  assert.ok(text(html).includes(`${cash(1000)} kept as breathing room`));
  assert.equal(state.budget.items[0].spent,8000);
  assert.equal(draft.plan.items[0].spent,8000);
});

test('starting a suggested period keeps its explanation visible before save without sharing the source object',()=>{
  const state=createEmptyState();state.settings.hideBalance=false;state.wallet=100000;
  const provenance={transactions:0,projectedWeeks:2,sources:{'food and groceries':'sample'}};
  act(state,'createBudget',{items:[{id:'food',name:'Food',amount:1000}],endDate:date(7),provenance});
  class Node extends EventTarget{constructor(dataset={}){super();this.dataset=dataset;}}
  const button=new Node({parity:'new-period'}),form={},error={},fields={start:{value:date(0)},end:{value:date(30)}};
  const draft={},routes=[];
  const ctx={state,draft,$:()=>null,$$:selector=>selector.includes('[data-parity]')?[button]:[],
    sheet(_html,bind){bind({querySelector(selector){return selector==='form'?form:selector==='.error'?error:selector==='[name=start]'?fields.start:fields.end;}});},
    closeSheet(){},go(route){routes.push(route);}};
  const cleanup=bindPlanningParity(ctx,{section:'plan',page:'periods'});
  button.dispatchEvent(new Event('click'));form.onsubmit({preventDefault(){}});cleanup();
  assert.equal(routes.at(-1).step,'review');assert.deepEqual(draft.plan.suggestion,provenance);
  assert.notEqual(draft.plan.suggestion,state.budget.provenance);
  assert.match(renderPlanning({state,draft},{section:'plan',page:'create',step:'review'}),/Sample student starting amounts, not a prediction from your spending/);
  draft.plan.suggestion.sources.extra='history';assert.equal(state.budget.provenance.sources.extra,undefined);
});


test('resuming an expired goal setup offers a new date instead of a zero or impossible pace',()=>{
  const state=createEmptyState(),draft={box:{name:'Books',emoji:'📚',target:18000,balance:0,deadline:date(-2)}};
  const html=renderPlanning({state,draft},{section:'boxes',page:'create',step:'review'});
  assert.match(html,/Your goal date has passed/);assert.match(html,/Choose a new date or adjust your goal/);
  assert.doesNotMatch(html,/aim for about/);assert.match(html,/data-action="p:box-edit-date"/);
});
