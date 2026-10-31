const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root=require('node:path').resolve(__dirname,'..');
const now=Date.parse('2026-10-16T12:00:00Z');
const context={L:{state:{},views:{},money:n=>'GHS '+Number(n).toFixed(2),id:()=>`id-${Math.random()}`,save:()=>{}},Date,Math,console};
context.window=context;context.addEventListener=()=>{};vm.createContext(context);vm.runInContext(fs.readFileSync(root+'/dist/pause-engine.js','utf8'),context);
const E=context.L.pauseEngine;
const draft=(amount=50,extra={})=>({id:'draft',method:'lumo',name:'Ama',destination:'@ama',amount,fee:0,...extra});
const state=(balance=1000,essentials=[],goals=[],txs=[])=>({balance,essentials,goals,txs,allowance:{amount:1200,date:'2026-10-23'}});
const ess=(amount=500,extra={})=>({id:'transport',name:'Transport',amount,paid:0,date:'2026-10-20',...extra});
const goal=(allocated=300,extra={})=>({id:'laptop',name:'Laptop',allocated,target:3000,...extra});
const pending=(amount=100,extra={})=>({id:'pending',type:'out',status:'pending',amount,fee:0,essentialId:'transport',date:'2026-10-16T10:00:00Z',...extra});
let passed=0;const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
check('A modest purchase triggers a named saved-essential consequence below behavioral threshold',()=>{
 const q=E.evaluate(draft(70),state(200,[ess(150)]),now);
 assert.equal(q.score,0);assert.equal(q.behavioralTriggered,false);assert.equal(q.triggered,true);
 assert.equal(q.selected.code,'plan_essentials');assert.equal(q.planImpact.gapBefore,0);assert.equal(q.planImpact.gapAfter,20);assert.equal(q.planImpact.extraGap,20);
 assert(q.selected.message.includes('the “Transport” plan'));assert(q.selected.message.includes('GHS 20.00'));assert.equal(q.planImpact.date,'2026-10-20');
});
check('Exactly covering essentials produces no plan interruption',()=>{
 const q=E.evaluate(draft(100),state(1000,[ess(900)]),now);assert.equal(q.planImpact,null);assert.equal(q.triggered,false);
});
check('One pesewa below essential coverage triggers the exact one-pesewa gap',()=>{
 const q=E.evaluate(draft(100.01),state(1000,[ess(900)]),now);assert.equal(q.planImpact.gapAfter,0.01);assert.equal(q.planImpact.extraGap,0.01);
});
check('Saved goals create a separate allocation consequence',()=>{
 const q=E.evaluate(draft(200),state(1000,[ess(500)],[goal(400)]),now);
 assert.equal(q.score,0);assert.equal(q.planImpact.kind,'goals');assert.equal(q.planImpact.gapAfter,100);assert.equal(q.selected.code,'plan_goals');assert(q.selected.message.includes('the “Laptop” allocation'));
 assert(!/week|month|delay|later/.test(q.selected.message));
});
check('Worsening essentials takes priority over a simultaneous goal gap',()=>{
 const q=E.evaluate(draft(350),state(1000,[ess(700)],[goal(500)]),now);
 assert.equal(q.planImpact.kind,'essentials');assert.equal(q.planImpact.gapAfter,50);assert.equal(q.planImpact.goalGapBefore,200);assert.equal(q.planImpact.goalGapAfter,500);
});
check('Multiple remaining essentials produce aggregate messaging without invented ordering',()=>{
 const q=E.evaluate(draft(200),state(1000,[ess(500),ess(400,{id:'food',name:'Food',date:'2026-10-18'})]),now);
 assert.equal(q.planImpact.kind,'essentials');assert.equal(q.planImpact.name,'');assert.equal(q.planImpact.entityId,'');assert.equal(q.planImpact.date,'');
 assert(q.selected.message.includes('saved essentials'));assert(!/Transport|Food/.test(q.selected.message));
});
check('A linked payment can leave one safely named remaining essential',()=>{
 const q=E.evaluate(draft(200,{essentialId:'food',fee:10}),state(1000,[ess(900),ess(100,{id:'food',name:'Food'})]),now);
 assert.equal(q.planImpact.name,'Transport');assert.equal(q.planImpact.essentialCovered,100);assert.equal(q.planImpact.gapAfter,110);
});
check('Multiple allocated goals are described collectively',()=>{
 const q=E.evaluate(draft(200),state(1000,[ess(500)],[goal(200),goal(200,{id:'stock',name:'Business stock'})]),now);
 assert.equal(q.planImpact.kind,'goals');assert.equal(q.planImpact.name,'');assert(q.selected.message.includes('goal allocations'));assert(!/Laptop|Business/.test(q.selected.message));
});
check('Existing shortfall reports only the additional damage and retains final gap',()=>{
 const q=E.evaluate(draft(100),state(1000,[ess(1100)]),now);
 assert.equal(q.planImpact.gapBefore,100);assert.equal(q.planImpact.gapAfter,200);assert.equal(q.planImpact.extraGap,100);
 assert(q.selected.message.includes('add GHS 100.00'));assert(q.selected.message.includes('GHS 200.00 uncovered'));
});
check('Already-underfunded goal allocations report their incremental gap',()=>{
 const q=E.evaluate(draft(100),state(1000,[ess(500)],[goal(600)]),now);
 assert.equal(q.planImpact.kind,'goals');assert.equal(q.planImpact.gapBefore,100);assert.equal(q.planImpact.gapAfter,200);assert.equal(q.planImpact.extraGap,100);
});
check('Paying a linked essential reduces the remaining obligation with the payment',()=>{
 const q=E.evaluate(draft(150,{essentialId:'transport'}),state(1000,[ess(1000)]),now);
 assert.equal(q.planImpact,null);assert.equal(q.score,0);assert.equal(q.triggered,false);
});
check('Paying an underfunded linked essential does not worsen the existing gap',()=>{
 const q=E.evaluate(draft(100,{essentialId:'transport'}),state(1000,[ess(1100)]),now);
 assert.equal(q.planImpact,null);assert.equal(q.triggered,false);
});
check('Fees on a linked payment can still worsen essential coverage',()=>{
 const q=E.evaluate(draft(100,{essentialId:'transport',fee:2}),state(1000,[ess(1000)]),now);
 assert.equal(q.planImpact.essentialCovered,100);assert.equal(q.planImpact.gapAfter,2);assert.equal(q.planImpact.extraGap,2);
});
check('Linked payment amount above the obligation only covers the actual outstanding amount',()=>{
 const q=E.evaluate(draft(200,{essentialId:'transport'}),state(1000,[ess(100)],[goal(850)]),now);
 assert.equal(q.planImpact.kind,'goals');assert.equal(q.planImpact.essentialCovered,100);assert.equal(q.planImpact.gapAfter,50);
});
check('Pending holds and pending essential coverage are each applied once',()=>{
 const q=E.evaluate(draft(300),state(1000,[ess(500)],[goal(200)],[pending(100,{fee:10})]),now);
 assert.equal(q.available,890);assert.equal(q.after,590);assert.equal(q.planImpact.essentialsBefore,400);assert.equal(q.planImpact.gapAfter,10);
});
check('Linked payment only covers an obligation left after pending payments',()=>{
 const q=E.evaluate(draft(200,{essentialId:'transport'}),state(1000,[ess(200)],[goal(750)],[pending(100)]),now);
 assert.equal(q.available,900);assert.equal(q.planImpact.essentialCovered,100);assert.equal(q.planImpact.essentialsAfter,0);assert.equal(q.planImpact.gapAfter,50);
});
check('Unlinked pending, incoming pending and failed payments do not reduce essential obligations',()=>{
 const q=E.evaluate(draft(100),state(1000,[ess(900)],[],[pending(500,{status:'failed'}),pending(500,{type:'in'}),pending(100,{essentialId:''})]),now);
 assert.equal(q.available,900);assert.equal(q.planImpact.essentialsBefore,900);assert.equal(q.planImpact.gapBefore,0);assert.equal(q.planImpact.gapAfter,100);
});
check('Covered essentials and unallocated goals never invent commitments',()=>{
 const q=E.evaluate(draft(100),state(1000,[ess(100,{paid:100})],[goal(0)]),now);
 assert.equal(q.planImpact,null);assert.equal(q.triggered,false);
});
check('Expected allowance never offsets a real saved-plan shortfall',()=>{
 const s=state(1000,[ess(950)]);s.allowance.amount=1000000;
 assert.equal(E.evaluate(draft(100),s,now).planImpact.gapAfter,50);
});
check('Insufficient funds lead to funding rather than a plan Pause',()=>{
 const q=E.evaluate(draft(1001),state(1000,[ess(950)]),now);assert.equal(q.triggered,false);assert.equal(q.planImpact,null);
});
check('Plan insight outranks a behavioral insight without changing the behavioral score',()=>{
 const q=E.evaluate(draft(951),state(1000,[ess(500)]),now);
 assert.equal(q.score,13);assert.equal(q.behavioralTriggered,true);assert.equal(q.selected.code,'plan_essentials');assert.equal(q.signals[0].code,'low_balance');assert.equal(q.signals.length,3);
});
check('Plan evaluation leaves all account, transaction and draft data untouched',()=>{
 const d=draft(200,{essentialId:'transport',fee:5}),s=state(1000,[ess(1000)],[goal(300)],[pending(100)]),before=JSON.stringify([d,s]);
 E.evaluate(d,s,now);E.signature(d,s,now);assert.equal(JSON.stringify([d,s]),before);
});
check('Money rounding does not turn an exact payment into insufficient funds',()=>{
 const q=E.evaluate(draft(.1,{fee:.2}),state(.3),now);assert.equal(q.after,0);assert.equal(q.triggered,true);
});
check('Signature changes when essential name, date, paid amount or linked essential changes',()=>{
 const d=draft(100),s=state(1000,[ess(950)]),original=E.signature(d,s,now);
 for(const [key,value] of [['name','Bus fare'],['date','2026-10-21'],['paid',10],['amount',960]]){
  const changed=JSON.parse(JSON.stringify(s));changed.essentials[0][key]=value;assert.notEqual(E.signature(d,changed,now),original);
 }
 assert.notEqual(E.signature({...d,essentialId:'transport'},s,now),original);
});
check('Goal renaming, reallocation and changes to a saved allowance invalidate the signature',()=>{
 const d=draft(100),s=state(1000,[],[goal(950)]),original=E.signature(d,s,now);
 for(const [key,value] of [['name','First laptop'],['allocated',960],['target',4000]]){
  const changed=JSON.parse(JSON.stringify(s));changed.goals[0][key]=value;assert.notEqual(E.signature(d,changed,now),original);
 }
 const changed=JSON.parse(JSON.stringify(s));changed.allowance.date='2026-10-30';assert.notEqual(E.signature(d,changed,now),original);
});
check('Exposure log deduplicates identical review but records changed plan and response',()=>{
 const d=draft(100),s=state(1000,[ess(950)]);context.L.state=s;
 E.present(d);E.present(d);assert.equal(s.pauseEvents.length,1);assert.equal(s.pauseEvents[0].signal,'plan_essentials');
 s.essentials[0].name='Bus fare';E.present(d);assert.equal(s.pauseEvents.length,2);
 E.respond('continue_payment',d);E.respond('continue_payment',d);assert.equal(s.pauseEvents.length,3);assert.equal(s.pauseEvents[2].action,'continue_payment');
});
console.log(passed+' plan-aware Pause checks passed.');
