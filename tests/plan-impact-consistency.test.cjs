const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const now=Date.parse('2026-10-18T12:00:00Z');
const ctx={L:{state:{},views:{},money:value=>'GH₵'+Number(value||0).toLocaleString('en-GH',{minimumFractionDigits:2,maximumFractionDigits:2}),id:()=>String(Math.random()),save(){}},Date,Math,console};
ctx.window=ctx;ctx.addEventListener=()=>{};vm.createContext(ctx);
for(const file of ['pause-engine.js','plan-impact.js'])vm.runInContext(fs.readFileSync(path.join(root,'dist',file),'utf8'),ctx,{filename:file});
const L=ctx.L;
const essential=(id,name,amount,extra={})=>({id,name,amount,paid:0,...extra});
const goal=(id,name,allocated)=>({id,name,allocated,target:1000});
const state=(extra={})=>({balance:600,txs:[],essentials:[essential('food','Food',200),essential('transport','Transport',150)],goals:[goal('laptop','Laptop',100)],allowance:{amount:1200,date:'2026-11-01'},...extra});
const draft=(amount=280,extra={})=>({id:'draft',amount,fee:0,method:'campus',name:'Campus Shop',destination:'SHOP',...extra});
const summary=(d=draft(),s=state())=>L.planImpactSummary(d,s,now);
let passed=0;const check=(name,run)=>{run();passed++;console.log('PASS '+name);};
check('The student example puts the GH₵30.00 essential gap before the distinct GH₵100.00 laptop gap',()=>{
 const p=summary();assert.equal(p.after,320);assert.equal(p.essentialsAfter,350);assert.equal(p.allocated,100);assert.equal(p.essentialGap,30);assert.equal(p.goalGap,100);assert.equal(p.totalGap,130);assert.equal(p.goalExtraGap,100);
 assert.equal(p.headline,'Food and transport would be GH₵30.00 short.');assert.equal(p.essentialsLabel,'Food and transport short by GH₵30.00');assert.equal(p.essentialsExplanation,'GH₵320.00 would remain for GH₵350.00 of planned essentials.');assert.equal(p.goalExplanation,'Money set aside for Laptop: GH₵100.00 uncovered after essentials.');
 assert.equal(p.totalExplanation,'Total plan shortfall: GH₵130.00.');assert(!p.goalExplanation.includes('130'));assert.equal(p.engineDecision.planImpact.kind,'essentials');assert.equal(p.engineDecision.planImpact.gapAfter,30);
});
check('A goal-only consequence is shown when essentials stay covered',()=>{
 const p=summary(draft(200));assert.equal(p.after,400);assert.equal(p.essentialGap,0);assert.equal(p.afterEssentials,50);assert.equal(p.goalGap,50);assert.equal(p.totalGap,50);assert.equal(p.headline,'Money set aside for Laptop would be GH₵50.00 short.');
});
check('Exactly covering the saved plan gives reassurance with no manufactured gap',()=>{
 const p=summary(draft(150));assert.equal(p.after,450);assert.equal(p.essentialGap,0);assert.equal(p.goalGap,0);assert.equal(p.totalGap,0);assert.equal(p.headline,'Your plan stays covered. No spare room.');assert.equal(p.engineDecision.planImpact,null);
});
check('Comfortable, narrow and zero spare room stay factual without new interrupt rules',()=>{
 const before=JSON.stringify(state());
 for(const [amount,room,headline] of [[80,70,'Your plan stays covered. GH₵70.00 spare.'],[140,10,'Your plan stays covered. GH₵10.00 spare.'],[150,0,'Your plan stays covered. No spare room.']]){
  const s=state(),p=summary(draft(amount),s);
  assert.equal(p.room,room);assert.equal(p.headline,headline);assert.equal(p.consequenceTone,'covered');assert.equal(p.totalGap,0);
  assert.equal(p.engineDecision.triggered,false);assert.equal(p.engineDecision.behavioralTriggered,false);assert.equal(p.engineDecision.planImpact,null);
  assert.equal(JSON.stringify(s),before);
 }
});
check('Linked essentials and any excess payment use the engine’s remaining-cost rules',()=>{
 const p=summary(draft(280,{essentialId:'food'}));assert.equal(p.essentialCovered,200);assert.equal(p.essentialsBefore,350);assert.equal(p.essentialsAfter,150);assert.equal(p.after,320);assert.equal(p.totalGap,0);assert.equal(p.essentials.find(x=>x.id==='food').after,0);
 const larger=summary(draft(400,{essentialId:'food'}));assert.equal(larger.essentialGap,0);assert.equal(larger.goalGap,50);assert.equal(larger.engineDecision.planImpact.kind,'goals');
});
check('A fee on a planned purchase is counted as money leaving, not essential coverage',()=>{
 const p=summary(draft(200,{fee:5,essentialId:'food'}),state({balance:450}));assert.equal(p.after,245);assert.equal(p.essentialCovered,200);assert.equal(p.essentialsAfter,150);assert.equal(p.essentialGap,0);assert.equal(p.goalGap,5);assert.equal(p.totalGap,5);
});
check('Pending linked payments reserve their money and reduce the same obligation once',()=>{
 const s=state({txs:[{id:'pending',type:'out',status:'pending',amount:80,fee:10,essentialId:'food'}]});
 const p=summary(draft(),s);assert.equal(p.available,510);assert.equal(p.essentialsBefore,270);assert.equal(p.after,230);assert.equal(p.essentialGap,40);assert.equal(p.goalGap,100);assert.equal(p.totalGap,140);
 const linked=summary(draft(150,{essentialId:'food'}),s);assert.equal(linked.essentialCovered,120);assert.equal(linked.essentialsAfter,150);assert.equal(linked.totalGap,0);
});
check('Unlinked holds still reduce funds, and incoming pending or failed records never fund the plan',()=>{
 const s=state({txs:[{id:'held',type:'out',status:'pending',amount:50,fee:0},{id:'incoming',type:'in',status:'pending',amount:10000},{id:'failed',type:'out',status:'failed',amount:200,essentialId:'food'}]});
 const p=summary(draft(),s);assert.equal(p.available,550);assert.equal(p.essentialsBefore,350);assert.equal(p.after,270);assert.equal(p.essentialGap,80);assert.equal(p.goalGap,100);assert.equal(p.totalGap,180);
});
check('An existing gap is separate from what this payment adds',()=>{
 const p=summary(draft(20),state({balance:300}));assert.equal(p.essentialGapBefore,50);assert.equal(p.goalGapBefore,100);assert.equal(p.totalGapBefore,150);assert.equal(p.essentialGap,70);assert.equal(p.goalGap,100);assert.equal(p.totalGap,170);assert.equal(p.essentialExtraGap,20);assert.equal(p.goalExtraGap,0);assert.equal(p.extraGap,20);assert.equal(p.changeExplanation,'GH₵150.00 was already uncovered. This payment adds GH₵20.00 to that gap.');
});
check('A linked payment can retain an existing gap without claiming a new consequence',()=>{
 const p=summary(draft(20,{essentialId:'food'}),state({balance:300}));assert.equal(p.essentialGapBefore,50);assert.equal(p.essentialGap,50);assert.equal(p.totalGapBefore,150);assert.equal(p.totalGap,150);assert.equal(p.extraGap,0);assert.equal(p.engineDecision.planImpact,null);
});
check('A single remaining essential is named without losing the aggregate rules',()=>{
 const p=summary(draft(70),state({balance:200,essentials:[essential('transport','Transport',150)],goals:[]}));assert.equal(p.bucketLabel,'Transport');assert.equal(p.essentialGap,20);assert.equal(p.headline,'Transport would be GH₵20.00 short.');
});
check('Multiple remaining costs never blame one unnamed cost for the aggregate shortfall',()=>{
 const p=summary(draft(),state({essentials:[essential('food','Food & groceries',200),essential('transport','Transport to lectures',150)]}));assert.equal(p.bucketLabel,'Essentials');assert.equal(p.headline,'Essentials would be GH₵30.00 short.');assert(!p.headline.includes('Transport'));
});
check('Several goals share one allocation gap and keep their identities in the facts',()=>{
 const p=summary(draft(),state({goals:[goal('laptop','Laptop',60),goal('business','First stock',40)]}));assert.equal(p.goalGap,100);assert.equal(p.goalExplanation,'Money set aside for goals: GH₵100.00 uncovered after essentials.');assert.equal(p.goalName,'');assert.equal(p.goals.length,2);
});
check('Plan figures use the same fixed two-decimal formatter as every receipt',()=>{
 assert.equal(L.planMoney(600),'GH₵600.00');assert.equal(L.planMoney(30.5),'GH₵30.50');assert.equal(L.planMoney(0.01),'GH₵0.01');assert.equal(L.planMoney(1200),'GH₵1,200.00');assert.equal(L.money(600),'GH₵600.00');assert.equal(L.planMoney,L.money);
});
check('Amount input and full draft share a pure calculation without changing account or payment data',()=>{
 const s=state(),d=draft(),before=JSON.stringify([s,d]);const a=summary(d,s),b=summary(280,s);assert.equal(a.totalGap,b.totalGap);assert.equal(a.headline,b.headline);assert.equal(JSON.stringify([s,d]),before);
});
check('A payment above usable funds leads with funding, not an actionable plan warning',()=>{
 const p=summary(draft(650));assert.equal(p.canPay,false);assert.equal(p.after,-50);assert.equal(p.fundingShortfall,50);assert.equal(p.headline,'GH₵50.00 more needed to make this payment.');assert.equal(p.engineDecision.triggered,false);
});
check('Invalid amounts and fees request an amount without inventing a zero balance or spending',()=>{
 for(const d of [draft('not-a-number'),draft(-10),draft(0),draft(20,{fee:-1})]){
  const s=state(),before=JSON.stringify(s),p=summary(d,s);assert.equal(p.valid,false);assert.equal(p.canPay,false);assert.equal(p.available,600);assert.equal(p.after,600);assert.equal(p.headline,'Enter an amount to see its effect.');assert.equal(JSON.stringify(s),before);
 }
});
check('One pesewa and exact decimal boundaries follow the engine’s cents arithmetic',()=>{
 const s=state({balance:0.30,essentials:[essential('food','Food',0.20)],goals:[goal('goal','Laptop',0.10)]});
 const p=summary(draft(0.01),s);assert.equal(p.after,0.29);assert.equal(p.essentialGap,0);assert.equal(p.goalGap,0.01);assert.equal(p.totalGap,0.01);assert.equal(p.engineDecision.planImpact.gapAfter,0.01);
 const exact=summary(draft(0.10,{fee:0.20}),state({balance:0.30,essentials:[],goals:[]}));assert.equal(exact.after,0);assert.equal(exact.canPay,true);assert.equal(exact.totalGap,0);
});
check('Every selected engine plan result agrees with the shared detailed explanation',()=>{
 for(const balance of [100,300,600,1000])for(const amount of [10,80,200,280])for(const essentialId of ['', 'food']){
  const p=summary(draft(amount,{essentialId,fee:1}),state({balance}));const q=p.engineDecision;if(!q.planImpact)continue;
  assert.equal(p.essentialsBefore,q.planImpact.essentialsBefore);assert.equal(p.essentialsAfter,q.planImpact.essentialsAfter);assert.equal(p.allocated,q.planImpact.allocated);assert.equal(p.essentialGap,q.planImpact.essentialGapAfter);assert.equal(p.goalGap,q.planImpact.goalGapAfter);assert.equal(p.totalGap,Math.round((p.essentialGap+p.goalGap)*100)/100);
 }
});
console.log(passed+' shared plan impact checks passed.');
