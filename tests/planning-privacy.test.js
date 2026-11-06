import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState, getSummary} from '../dist/js/model.js';
import {renderPlanning} from '../dist/js/planning.js';
import {cash} from '../dist/js/ui.js';

const render=(state,section,page='home',extra={})=>renderPlanning({state,draft:{}},{section,page,...extra});
const visibleText=html=>html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();

test('balance privacy follows the Home preference on Plan, Boxes and goal detail without changing money',()=>{
  const state=createDemoState(),before=structuredClone(state);
  state.settings.hideBalance=true;
  for(const [section,page,extra] of [['plan','home',{}],['boxes','home',{}],['boxes','detail',{id:state.boxes[0].id}]]){
    const text=visibleText(render(state,section,page,extra));
    assert.match(text,/••••\.••/);
    assert.doesNotMatch(text,/GH₵[\d,.]+/,'A read-only planning screen must not reveal personal amounts while balances are hidden.');
  }
  state.settings.hideBalance=before.settings.hideBalance;
  assert.deepEqual(state,before,'Rendering privacy does not alter budget, savings or financial records.');
});

test('revealing balances restores the same calculated plan totals and individual goals',()=>{
  const state=createDemoState();state.settings.hideBalance=false;
  const sum=getSummary(state),plan=visibleText(render(state,'plan'));
  assert.ok(plan.includes(`Available ${cash(sum.available)}`));
  assert.ok(plan.includes(`Left after plan ${cash(sum.spendable)}`));
  const total=state.boxes.filter(b=>!b.archived).reduce((n,b)=>n+b.balance,0),boxes=visibleText(render(state,'boxes'));
  assert.ok(boxes.includes(`In active boxes ${cash(total)}`));
  assert.ok(boxes.includes(cash(state.boxes[0].balance)));
  assert.ok(boxes.includes(state.boxes[0].emoji),'Personal goal symbols remain part of the goal.');
});

test('privacy also covers budget history, savings activity and archived goals',()=>{
  const state=createDemoState();state.settings.hideBalance=true;
  state.boxes.push({...state.boxes[0],id:'archived-goal',archived:true,balance:12345});
  state.budgetHistory=[{periodId:'past',startDate:'2026-10-01',endDate:'2026-10-31',totalPlanned:50000,totalSpent:12345,items:[]}];
  state.savingsHistory=[{boxId:state.boxes[0].id,status:'saved',amount:12345,at:new Date().toISOString(),reason:'Rule saved'}];
  for(const [section,page] of [['plan','periods'],['boxes','archive'],['boxes','hacks']]){
    const text=visibleText(render(state,section,page));
    assert.match(text,/••••\.••/);
    assert.doesNotMatch(text,/GH₵[\d,.]+/);
  }
});

test('privacy masks existing account balance hints while an editable amount stays usable',()=>{
  const state=createDemoState();state.settings.hideBalance=true;
  const html=renderPlanning({state,draft:{plan:{items:[],item:{name:'Printing',amountText:'45.50',amount:4550}}}},{section:'plan',page:'create',step:'amount'});
  assert.match(html,/value="45\.50"/);
  assert.match(visibleText(html),/Available in your account: ••••\.••/);
  assert.match(visibleText(html),/GH₵50/,'Fixed amount shortcuts are choices, not private balances.');
});
