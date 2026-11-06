import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAction,createEmptyState} from '../dist/js/model.js';
import {openHackEditor} from '../dist/js/planning-parity-ui.js';
import {renderPlanning,bindPlanning} from '../dist/js/planning.js';

const day=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
const act=(s,type,payload={})=>{const r=applyAction(s,type,payload);assert.equal(r.ok,true,r.message);return r;};
function fixture(hack={type:'scheduled',value:1000,frequency:'daily',nextRun:day(1),monthlyCap:500,floor:9500}){
  const s=createEmptyState({phone:'0240000000'});s.wallet=10000;s.buffer=0;s.onboardingDone=true;
  const b=act(s,'createBox',{name:'Next semester',target:50000,hack}).box;
  return {s,b};
}
function editor(state,box,{setup=false}={}){
  const h=box.hack||{type:'none',value:100};
  const initial={type:h.type,value:['percent','income'].includes(h.type)?String(h.value):String(h.value/100),cap:String((h.monthlyCap||0)/100),floor:String((h.floor||0)/100),frequency:h.frequency||'daily',nextRun:h.nextRun||day(1)};
  const form={elements:Object.fromEntries(Object.entries(initial).map(([name,value])=>[name,{value}]))},error={textContent:''},panels={'[data-hack-value]':{},'[data-hack-schedule]':{}};
  const ctx={state,draft:{},calls:[],closed:0,refreshed:0,saved:0,toasts:[],
    sheet(html,bind){this.html=html;bind({querySelector:selector=>selector==='form'?form:selector==='.error'?error:panels[selector]});},
    act(type,payload){this.calls.push({type,payload});return applyAction(state,type,payload);},
    closeSheet(){this.closed++;},refresh(){this.refreshed++;},saveDraft(){this.saved++;},toast(message){this.toasts.push(message);}};
  openHackEditor(ctx,box,{setup});
  return {ctx,form,error,submit(values){for(const [key,value] of Object.entries(values))form.elements[key].value=value;form.elements.type.onchange?.();form.onsubmit({preventDefault(){}});}};
}

test('invalid whole-rule model edits preserve the active rule, limits, schedule and financial history',()=>{
  const {s,b}=fixture();
  const before=structuredClone(s);
  for(const hack of [
    {type:'percent',value:101,monthlyCap:0,floor:0},
    {type:'scheduled',value:1000,frequency:'daily',nextRun:day(0),monthlyCap:0,floor:-1},
    {type:'scheduled',value:1000,frequency:'daily',nextRun:'2026-02-30',monthlyCap:0,floor:0},
  ]){
    const r=applyAction(s,'updateBox',{id:b.id,hack});
    assert.equal(r.ok,false,r.message);
    assert.deepEqual(s,before,'An invalid edit cannot partially apply its floor, cap, date or type.');
  }
  act(s,'runScheduledSavings');
  assert.equal(s.wallet,10000);assert.equal(b.balance,0,'The rejected date change cannot make a future rule run today.');
});

test('the actual saved-rule editor rejects 101 percent before an action and keeps the original protected saving amount',()=>{
  const {s,b}=fixture({type:'scheduled',value:1000,frequency:'daily',nextRun:day(0),monthlyCap:500,floor:9500});
  const e=editor(s,b),before=structuredClone(s);
  e.submit({type:'percent',value:'101',cap:'0',floor:'0',nextRun:day(0)});
  assert.match(e.error.textContent,/percentage.*100/);assert.equal(e.form.elements.value.max,'100');
  assert.equal(e.ctx.calls.length,0);assert.equal(e.ctx.closed,0);assert.equal(e.ctx.saved,0);
  assert.deepEqual(s,before);
  act(s,'runScheduledSavings');
  assert.equal(s.wallet,9500);assert.equal(b.balance,500,'The original GH5 cap and GH95 protected balance remain enforced.');
});

for(const [name,changes] of [
  ['too many decimal places in the protected balance',{floor:'0.001'}],
  ['a negative monthly cap',{cap:'-1'}],
  ['an invalid scheduled date',{nextRun:'2026-02-30'}],
])test(`invalid rule setup stays open and leaves its draft untouched: ${name}`,()=>{
  const {s}=fixture(),draft={name:'Books',hack:{type:'scheduled',value:1000,frequency:'weekly',nextRun:day(1),floor:5000,monthlyCap:2000}},before=structuredClone(draft),e=editor(s,draft,{setup:true});
  e.submit(changes);assert.notEqual(e.error.textContent,'');assert.deepEqual(draft,before);
  assert.equal(e.ctx.closed,0);assert.equal(e.ctx.saved,0);assert.equal(e.ctx.calls.length,0);
});

test('editing a paused rule updates its limits without resuming or charging it',()=>{
  const {s,b}=fixture({type:'scheduled',value:1000,frequency:'daily',nextRun:day(0),monthlyCap:500,floor:9500,paused:true,lastRun:day(-1)}),e=editor(s,b);
  e.submit({value:'3',cap:'4',floor:'90'});
  assert.equal(e.error.textContent,'');assert.equal(e.ctx.calls.length,1);assert.equal(e.ctx.closed,1);
  assert.equal(b.hack.paused,true);assert.equal(b.hack.lastRun,day(-1));
  assert.equal(b.hack.value,300);assert.equal(b.hack.monthlyCap,400);assert.equal(b.hack.floor,9000);
  act(s,'runScheduledSavings');assert.equal(s.wallet,10000);assert.equal(b.balance,0);
  assert.equal(s.savingsHistory[0].reason,'Rule paused');
});

test('valid rule setup saves a complete canonical draft without moving money',()=>{
  const {s}=fixture(),draft={name:'Books',hack:{type:'none',value:0}},e=editor(s,draft,{setup:true}),moneyBefore=s.wallet;
  e.submit({type:'scheduled',value:'2.50',frequency:'weekly',nextRun:day(1),cap:'10',floor:'80'});
  assert.deepEqual(draft.hack,{type:'scheduled',value:250,frequency:'weekly',nextRun:day(1),monthlyCap:1000,floor:8000});
  assert.equal(e.ctx.saved,1);assert.equal(e.ctx.closed,1);assert.equal(e.ctx.calls.length,0);assert.equal(s.wallet,moneyBefore);
});

test('a protected Box shows and authenticates its separate personal Unlock while partner protection stays on',()=>{
  const {s,b}=fixture();
  act(s,'contributeBox',{id:b.id,amount:5000});act(s,'updateBox',{id:b.id,locked:true});
  act(s,'requestBoxProtection',{boxId:b.id,partner:{name:'Esi',phone:'0241234567'},pin:'1234'});
  act(s,'respondBoxPartnerInvite',{boxId:b.id,invitationId:b.protection.invitationId,decision:'accepted'});
  const route={section:'boxes',page:'detail',id:b.id},html=renderPlanning({state:s,draft:{}},route);
  assert.match(html,/Your goal lock is on/);assert.match(html,/data-action="p:box-lock"/);assert.match(html,/Partner approval stays on/);
  class Button extends EventTarget {constructor(action){super();this.dataset={action};this.isConnected=true;}}
  const unlock=new Button('p:box-lock'),withdraw=new Button('p:box-withdraw');
  const ctx={state:s,draft:{},route,$:()=>null,$$:selector=>selector==='[data-action^="p:"]'?[unlock,withdraw]:[],authPending:null,sheets:0,toasts:[],
    auth(options){this.authPending=options;},act(type,payload){return applyAction(s,type,payload);},refresh(){},toast(message){this.toasts.push(message);},sheet(){this.sheets++;},saveDraft(){}};
  const cleanup=bindPlanning(ctx,route),protection=structuredClone(b.protection);
  withdraw.dispatchEvent(new Event('click'));assert.equal(ctx.sheets,0);assert.match(ctx.toasts.at(-1),/Unlock your goal lock/);
  unlock.dispatchEvent(new Event('click'));assert.equal(b.locked,true,'Opening Unlock alone changes nothing.');
  assert.ok(ctx.authPending);ctx.authPending.onSuccess();assert.equal(b.locked,false);assert.deepEqual(b.protection,protection);
  assert.equal(applyAction(s,'withdrawBox',{id:b.id,amount:1000,pin:'1234'}).ok,false,'A personal unlock still cannot withdraw without fresh partner approval.');
  cleanup();
});
