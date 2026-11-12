import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAction,createEmptyState} from '../dist/js/model.js';
import {bindPlanning,renderPlanning} from '../dist/js/planning.js';
import {openHackEditor} from '../dist/js/planning-parity-ui.js';

const day=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
const essential={id:'food',name:'Food & groceries',amount:3000,spent:0,due:day(2)};
function review(action){
  const state=createEmptyState();state.onboardingDone=true;state.wallet=10000;state.buffer=0;
  const draft={plan:{items:[{...essential}],item:{...essential},endDate:day(14)}};
  class Button extends EventTarget{constructor(){super();this.dataset={action};this.isConnected=true;this.disabled=false;}}
  const button=new Button(),calls=[],routes=[],celebrations=[];
  const ctx={state,draft,$:()=>null,$$:selector=>selector==='[data-action^="p:"]'?[button]:[],setCapture(){},saveDraft(){},toast(){},refresh(){},
    go(route){routes.push(route);},act(type,payload){calls.push({type,payload});return applyAction(state,type,payload);},celebrate(details){celebrations.push(details);}};
  const route={section:'plan',page:'create',step:'review'};
  return {state,draft,button,calls,routes,celebrations,cleanup:bindPlanning(ctx,route)};
}

test('adding another essential returns to item entry without committing the budget or moving money',()=>{
  const h=review('p:plan-another'),before=structuredClone(h.state);
  h.button.dispatchEvent(new Event('click'));
  assert.equal(h.calls.length,0);assert.deepEqual(h.state,before);
  assert.equal(h.draft.plan.items.length,1);assert.deepEqual(h.draft.plan.items[0],essential);
  assert.deepEqual(h.draft.plan.item,{});assert.equal(h.routes.at(-1).step,'name');h.cleanup();
});

test('Complete budget saves the reviewed list once rather than appending another item',()=>{
  const h=review('p:plan-save');
  h.button.dispatchEvent(new Event('click'));
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].type,'createBudget');
  assert.equal(h.state.budget.created,true);assert.equal(h.state.budget.items.length,1);
  assert.equal(h.state.budget.items[0].id,'food');assert.equal(h.state.wallet,10000);
  assert.equal(h.state.transactions.length,0);assert.equal(h.draft.plan,null);
  assert.equal(h.celebrations.length,1);h.cleanup();
});

test('review presents both distinct actions together, while the item step is explicitly an add action',()=>{
  const state=createEmptyState(),draft={plan:{items:[{...essential}],item:{...essential}}};
  const html=renderPlanning({state,draft},{section:'plan',page:'create',step:'review'});
  const footer=html.slice(html.indexOf('class="bottom-action planning-budget-actions"'));
  assert.match(html,/1 essential in this budget/);
  assert.match(footer,/data-action="p:plan-another"[^>]*>[\s\S]*Add another essential/);
  assert.match(footer,/data-action="p:plan-save"[^>]*>Complete budget/);
  assert.ok(footer.indexOf('p:plan-another')<footer.indexOf('p:plan-save'));
  assert.match(renderPlanning({state,draft:{plan:{items:[],item:{name:'Transport',amount:1000}}}},{section:'plan',page:'create',step:'date'}),/data-action="p:plan-date"[^>]*>Add this essential/);
  assert.match(renderPlanning({state,draft},{section:'plan',page:'create',step:'date'}),/data-action="p:plan-date"[^>]*>Save essential changes/);
});

test('Savings Hack choice stays a labelled native select with the saved choice and explicit tap cue',()=>{
  const state=createEmptyState(),box={name:'Books',hack:{type:'scheduled',value:250,frequency:'monthly',nextRun:day(1),monthlyCap:0,floor:0}};
  let html='';openHackEditor({state,sheet(markup){html=markup;}},box);
  assert.match(html,/for="saving-rule-type"/);
  assert.match(html,/<select id="saving-rule-type" name="type" aria-describedby="saving-rule-help">/);
  assert.match(html,/<option value="scheduled" selected>Save on a schedule<\/option>/);
  assert.match(html,/Tap to choose a saving rule\./);
  assert.match(html,/planning-rule-chevron/);
  assert.match(html,/<select id="saving-rule-frequency" name="frequency">/);
  assert.match(html,/<option value="monthly" selected>Monthly<\/option>/);
});
