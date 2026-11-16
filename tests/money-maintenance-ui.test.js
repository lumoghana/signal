import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState,createEmptyState,applyAction} from '../dist/js/model.js';
import {renderMoneyMaintenance,renderOutsideQuickActions,renderMaintenanceEntry,openMaintenanceReview,openReusePlan,freshnessLabel} from '../dist/js/money-maintenance-ui.js';

const run=(s,type,payload)=>{const r=applyAction(s,type,payload);assert.equal(r.ok,true,r.message);return r;};
function context(state=createDemoState()){
 state.settings.hideBalance=false;
 return {state,draft:{},calls:[],toasts:[],routes:[],sheets:[],go(route){this.routes.push(route);},toast(message){this.toasts.push(message);},sheet(html,bind){this.sheets.push({html,bind});},act(type,payload){this.calls.push({type,payload});return applyAction(this.state,type,payload);}};
}

test('a fresh account money check asks about a new cost without inventing outside records or income',()=>{
 const ctx=context(createEmptyState()),before=JSON.stringify(ctx.state),html=renderMoneyMaintenance(ctx,{page:'money-check'});
 assert.match(html,/What has changed\?/);assert.match(html,/Add a new cost/);assert.match(html,/Give your money a plan/);
 assert.doesNotMatch(html,/Outside balances to check|Next allowance|GH₵0\.00 expected/);
 assert.equal(JSON.stringify(ctx.state),before);
});

test('only stale outside balances become check questions and hidden balances stay hidden',()=>{
 const ctx=context();const old=run(ctx.state,'createExternalBalance',{type:'cash',name:'Pocket',balance:12345}).externalBalance;
 const fresh=run(ctx.state,'createExternalBalance',{type:'momo',name:'Wallet',balance:54321}).externalBalance;
 old.updatedAt=old.confirmedAt='2020-01-01T00:00:00Z';fresh.updatedAt=fresh.confirmedAt=new Date().toISOString();ctx.state.settings.hideBalance=true;
 const before=JSON.stringify(ctx.state),html=renderMoneyMaintenance(ctx,{page:'money-check'});
 assert.match(html,/Pocket/);assert.match(html,/Still correct/);assert.doesNotMatch(html,/GH₵123\.45|GH₵543\.21/);
 assert.doesNotMatch(html,/>Wallet<\/span>/);assert.equal(JSON.stringify(ctx.state),before);
});

test('checking balance freshness is anchored to confirmation rather than a later recorded expense',()=>{
 const label=freshnessLabel({confirmedAt:'2020-01-01T00:00:00Z',updatedAt:new Date().toISOString(),stale:true});
 assert.match(label,/1 Jan/);assert.match(label,/Check balance/);assert.doesNotMatch(label,/Updated/);
});

test('simple-mode preferences keep the optional tools discoverable and do not subscribe to push',()=>{
 const ctx=context();run(ctx.state,'setMaintenancePreferences',{experience:'minimal',checkDay:0});const html=renderMoneyMaintenance(ctx,{page:'money-preferences'});
 assert.match(html,/value="minimal" checked/);assert.match(html,/More with Lumo/);assert.match(html,/All your money/);assert.match(html,/Money Boxes/);assert.match(html,/Money with friends/);assert.match(html,/Shown when you open Lumo/);
 assert.doesNotMatch(html,/OS push|Automatically connect|subscription/);
});

test('outside quick actions have explicit directions and safe escaped record identity',()=>{
 const ctx=context(),html=renderOutsideQuickActions(ctx,{id:'cash" onclick="bad',name:'Pocket <cash>'});
 assert.match(html,/data-maintenance="outside-in"/);assert.match(html,/data-maintenance="outside-out"/);assert.match(html,/data-maintenance="outside-confirm"/);
 assert.match(html,/Pocket &lt;cash&gt;/);assert.doesNotMatch(html,/id="cash" onclick=/);
});

test('opening a money update without a starting balance requests a record and makes no mutation',()=>{
 const ctx=context(createEmptyState()),before=JSON.stringify(ctx.state);openMaintenanceReview(ctx,{kind:'externalMovement',payload:{direction:'in',amount:20000}});
 assert.deepEqual(ctx.calls,[]);assert.deepEqual(ctx.routes,[{section:'life',page:'overview'}]);assert.match(ctx.toasts[0],/starting point/);assert.equal(JSON.stringify(ctx.state),before);
});

test('an outdated Lux draft cannot open an actionable review',()=>{
 const ctx=context();openMaintenanceReview(ctx,{kind:'saveCommitment',payload:{name:'Lab',amount:12000,due:'2030-01-01'},isCurrent:()=>false});
 assert.equal(ctx.sheets.length,0);assert.equal(ctx.calls.length,0);assert.match(ctx.toasts[0],/changed/);
});

test('reuse offers confirmed repeating essentials and leaves one-offs unchecked',()=>{
 const ctx=context(),food=ctx.state.budget.items[0],oneoff=ctx.state.budget.items[1];run(ctx.state,'setEssentialRecurring',{id:food.id,recurring:true});
 const before=JSON.stringify(ctx.state);openReusePlan(ctx);assert.equal(ctx.calls.length,0);assert.equal(JSON.stringify(ctx.state),before);
 const html=ctx.sheets[0].html;assert.match(html,new RegExp(`data-reuse-id="${food.id}"`));assert.match(html,new RegExp(`data-include-id="${oneoff.id}"`));
 for(const tag of html.match(/<input[^>]+data-include-id[^>]*>/g)||[])assert.doesNotMatch(tag,/checked/);
 assert.match(html,/Start this reviewed plan/);assert.match(html,/previous period/);
});

test('opening the maintenance entry is a non-mutating view of the student check history',()=>{
 const ctx=context(),before=JSON.stringify(ctx.state),html=renderMaintenanceEntry(ctx);
 assert.match(html,/A quick money check/);assert.match(html,/Only update what has changed/);assert.equal(JSON.stringify(ctx.state),before);
});

test('commitment review discloses adding to an existing essential and retaining an earlier date',async()=>{
 const {commitmentReview}=await import('../dist/js/money-maintenance-ui.js');
 const s=createEmptyState();s.budget.items=[{id:'food',name:'Food',amount:10000,spent:2000,due:'2030-01-01'}];
 assert.deepEqual(commitmentReview(s,{name:'Food',amount:5000,due:'2030-01-04'}),{id:'food',name:'Food',additional:5000,total:15000,spent:2000,remaining:13000,due:'2030-01-01',earlierDue:true});
 assert.equal(commitmentReview(s,{name:'Lab fee',amount:12000,due:'2030-01-04'}),null);
 s.budget.items[0].spent=15000;assert.equal(commitmentReview(s,{name:'Food',amount:5000}).remaining,5000);
});

test('fresh-plan preview keeps due debt separate and matches the saved plan without moving funds',async()=>{
 const {reusePlanPreview}=await import('../dist/js/money-maintenance-ui.js');const {prepareEssentialReuse}=await import('../dist/js/money-maintenance-model.js');
 const s=createEmptyState();s.wallet=100000;run(s,'createBudget',{items:[{id:'food',name:'Food',amount:20000,spent:0}],endDate:'2030-01-30'});run(s,'setEssentialRecurring',{id:'food',recurring:true});
 run(s,'createIOU',{name:'Kojo',type:'owedByMe',amount:5000,due:'2030-01-01',budgetItemId:'food'});
 const startDate=new Date().toISOString().slice(0,10),endDate='2030-01-30',draft=prepareEssentialReuse(s,{startDate,endDate}),before=s.wallet;
 const preview=reusePlanPreview(s,draft);assert.equal(preview.essentials,20000);assert.equal(preview.otherCommitments,5000);
 run(s,'reuseEssentialPlan',{...draft,includeOneOffIds:[]});const {getSummary}=await import('../dist/js/model.js');assert.equal(preview.left,getSummary(s).spendable);assert.equal(s.wallet,before);
});

test('reused source explanations distinguish sample amounts from earlier transaction evidence',async()=>{
 const {reuseSourceExplanation}=await import('../dist/js/money-maintenance-ui.js');
 assert.match(reuseSourceExplanation({sources:{food:'sample'}}),/sample student starting amounts, not a prediction/);
 assert.match(reuseSourceExplanation({sources:{food:'history'},transactions:4,start:'2026-10-01',end:'2026-10-28'}),/4 confirmed payments/);
 assert.match(reuseSourceExplanation({sources:{food:'history'},transactions:4}),/not a fresh forecast/);
});

test('category correction after plan reuse offers the receipt original-period categories',async()=>{
 const {transactionCategoryChoices}=await import('../dist/js/planning-parity-ui.js');
 const state=createEmptyState();state.budget={created:true,periodId:'current',items:[{id:'new-food',name:'Food'}]};state.budgetHistory=[{periodId:'old',items:[{id:'old-food',name:'Food'}]}];state.transactions=[{id:'old-receipt',budgetPeriodId:'old'},{id:'new-receipt',budgetPeriodId:'current'}];
 assert.equal(transactionCategoryChoices(state,'old-receipt')[0].id,'old-food');assert.equal(transactionCategoryChoices(state,'new-receipt')[0].id,'new-food');assert.deepEqual(transactionCategoryChoices(state,'gone'),[]);
});

function quickCheckBinding(ctx,id){
 const handlers=new Map(),button={dataset:{maintenance:'still-correct',id},disabled:false,isConnected:true,textContent:'Still correct',addEventListener(name,fn){handlers.set(name,fn);},removeEventListener(name){handlers.delete(name);}},error={textContent:''},root={querySelectorAll(){return [button];},querySelector(selector){return selector==='.maintenance-error'?error:null;}};
 return import('../dist/js/money-maintenance-ui.js').then(({bindMaintenanceEntries})=>{const dispose=bindMaintenanceEntries(ctx,root);return {button,error,dispose,click:()=>handlers.get('click')()};});
}

test('Still correct confirms the displayed balance directly once and requires no editor',async()=>{
 const ctx=context(),account=run(ctx.state,'createExternalBalance',{type:'momo',name:'Wallet',balance:18000}).externalBalance;
 account.confirmedAt=account.updatedAt='2020-01-01T00:00:00Z';let refreshes=0;ctx.refresh=()=>refreshes++;
 const binding=await quickCheckBinding(ctx,account.id),wallet=ctx.state.wallet;await binding.click();await binding.click();
 assert.equal(ctx.calls.length,1);assert.equal(ctx.calls[0].type,'confirmExternalBalance');assert.equal(ctx.calls[0].payload.expectedBalance,18000);assert.equal(ctx.sheets.length,0);assert.equal(account.balance,18000);assert.equal(ctx.state.wallet,wallet);assert.equal(refreshes,1);binding.dispose();
});

test('Still correct protects the amount rendered before a background balance update',async()=>{
 const ctx=context(),account=run(ctx.state,'createExternalBalance',{type:'cash',name:'Pocket',balance:18000}).externalBalance;let refreshes=0;ctx.refresh=()=>refreshes++;
 const binding=await quickCheckBinding(ctx,account.id);run(ctx.state,'externalMovement',{id:account.id,direction:'in',amount:1000,expectedRevision:account.revision||0});
 const before=account.confirmedAt;await binding.click();assert.equal(account.balance,19000);assert.equal(account.confirmedAt,before);assert.match(ctx.toasts.at(-1),/changed/);assert.equal(refreshes,1);binding.dispose();
});

test('a retained Still correct control cannot write after sample-account replacement',async()=>{
 const ctx=context(),account=run(ctx.state,'createExternalBalance',{type:'cash',name:'Pocket',balance:18000}).externalBalance;ctx.refresh=()=>{};
 const binding=await quickCheckBinding(ctx,account.id);ctx.state=structuredClone(ctx.state);await binding.click();assert.equal(ctx.calls.length,0);binding.dispose();
});

test('excluded prior costs disclose count and outstanding dates within the new period',async()=>{
 const {excludedReuseCosts}=await import('../dist/js/money-maintenance-ui.js');
 const source={items:[{id:'lab',name:'Lab',amount:12000,spent:0,due:'2026-11-20'},{id:'done',name:'Printing',amount:2000,spent:2000,due:'2026-11-18'},{id:'later',name:'Hostel',amount:100000,spent:0,due:'2026-12-30'}]},plan={oneOffItems:source.items.map(i=>({...i,sourceId:i.id,due:''})),startDate:'2026-11-16',endDate:'2026-11-23'};
 const result=excludedReuseCosts(source,plan);assert.equal(result.count,3);assert.deepEqual(result.due.map(i=>i.name),['Lab']);
 const selected=excludedReuseCosts(source,plan,{includeOneOffIds:['lab']});assert.equal(selected.count,2);assert.deepEqual(selected.due,[]);
 assert.equal(excludedReuseCosts(source,plan,{endDate:'2026-12-31'}).due.length,2);
});
