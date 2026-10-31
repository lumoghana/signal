/* Real engine fixtures plus isolated comparison rendering. No layout claims. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const now=Date.parse('2026-10-18T12:00:00Z');
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const animations=[],media={matches:false};let baseMotionCalls=0;
const animated=name=>({animate(frames,options){animations.push({name,frames,options});}});
const after=animated('after'),arrow=animated('arrow');
const root={querySelector:s=>s==='.pause-comparison-after'?after:s==='.pause-comparison-arrow'?arrow:null};
const document={hidden:false,getElementById:id=>id==='view'?root:null};
const ctx={L:{state:{},views:{},e:text=>String(text??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),money:n=>'GH₵'+Number(n).toLocaleString('en-GH',{minimumFractionDigits:2,maximumFractionDigits:2}),id:()=>Math.random().toString(),save(){},motion(){baseMotionCalls++;},motionRules:{reveal:180,ease:'cubic-bezier(.2,.75,.3,1)'}},document,Date:Clock,Math,console,matchMedia:()=>media,addEventListener(){}};
ctx.window=ctx;vm.createContext(ctx);
const load=file=>vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist',file),'utf8'),ctx,{filename:file});
load('pause-engine.js');load('plan-impact.js');
const L=ctx.L;
const actions='<div class="actions"><button onclick="L.pauseAction(\'edit_amount\')">Edit amount</button><button onclick="L.resumeFromPause()">Continue to PIN</button><button onclick="L.openPaymentPlanLink()">This covers a planned cost</button><button onclick="L.pauseAction(\'delay_payment\')">Decide later</button><button onclick="L.pauseAction(\'cancel_payment\')">Cancel payment</button></div>';
let called=0;
L.views.pause=()=>{
 called++;const d=L.state.paymentDraft;if(!d||d.submittedTxId)return '<section>Original result</section>';
 const q=L.pauseEngine.evaluate(d);if(!q.triggered)return '<section>Original review</section>';
 L.pauseEngine.present(d);
 return `<section class="focus-pause focus-pause-compact"><div data-art="pause"></div><h1>${L.e(q.planImpact?L.planImpactSummary(d).headline:q.selected.message)}</h1><p class="pause-payment-context">Considering ${L.money(d.amount+d.fee)}</p><div class="pause-decision-consequence" data-projection><p>Old explanation</p></div><p class="focus-choice">Your money. Your call.</p>${actions}</section>`;
};
load('clarity-pause.js');
const essential=(id,name,amount,extra={})=>({id,name,amount,paid:0,...extra});
const state=(extra={})=>({balance:600,txs:[],essentials:[essential('food','Food',200),essential('transport','Transport',150)],goals:[{id:'laptop',name:'Laptop',allocated:100}],allowance:{amount:1200,date:'2026-11-01'},...extra});
const draft=(amount=280,extra={})=>({id:'draft',amount,fee:0,method:'campus',name:'Campus Shop',destination:'SHOP',...extra});
const impact=(d=draft(),s=state())=>L.planImpactSummary(d,s,now);
const financial=s=>JSON.stringify([s.balance,s.txs,s.essentials,s.goals,s.allowance]);
let checks=0;const test=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
test('Essentials shortfall compares only relevant money covering essentials',()=>{
 const p=impact(),c=L.pauseComparison(p),html=L.pauseComparisonMarkup(p);
 assert.equal(c.kind,'essentials');assert.equal(c.before,350);assert.equal(c.after,320);assert.equal(c.requiredBefore,350);assert.equal(c.requiredAfter,350);
 assert.equal(p.essentialGap,30);assert.equal(p.goalGap,100);assert.equal(p.totalGap,130);
 assert(html.includes('After payment · projected'));assert(html.includes('Money set aside for Laptop: GH₵100.00 uncovered after essentials.'));
 assert(html.indexOf('Budget coverage')<html.indexOf('Money set aside for Laptop:'));
 const visible=html.split('<details')[0];assert(!visible.includes('GH₵600.00'));assert(!visible.includes('GH₵130.00'));assert(!visible.includes('GH₵280.00'));
 assert.match(html,/<details class="pause-calculation"><summary>See calculation<\/summary>/);assert(!/<details[^>]*\bopen\b/.test(html));assert(html.includes('Total budget shortfall'));assert(html.includes('Money set aside for goals stays in your account'));
});
test('Goal impact compares allocation coverage after essentials, not a second account deduction',()=>{
 const p=impact(draft(200)),c=L.pauseComparison(p),html=L.pauseComparisonMarkup(p);
 assert.equal(c.kind,'goals');assert.equal(c.before,100);assert.equal(c.after,50);assert.equal(c.label,'Laptop money covered');assert.equal(p.after,400);assert.equal(p.essentialGap,0);assert.equal(p.goalGap,50);
 assert(html.includes('Your budget stays covered.'));assert(!html.split('<details')[0].includes('GH₵400.00'));
});
test('Covered spending uses spare room, including the narrow-cushion fixture',()=>{
 for(const [amount,available,room] of [[80,520,70],[140,460,10]]){
  const p=impact(draft(amount)),c=L.pauseComparison(p);assert.equal(c.kind,'room');assert.equal(c.before,150);assert.equal(c.after,room);assert.equal(p.after,available);assert.equal(p.engineDecision.triggered,false);
 }
});
test('A linked essential fulfils the plan once and exposes its changed requirement',()=>{
 const p=impact(draft(80,{essentialId:'food'})),c=L.pauseComparison(p);assert.equal(p.after,520);assert.equal(p.essentialsAfter,270);assert.equal(p.essentialCovered,80);assert.equal(p.room,150);assert.equal(c.before,150);assert.equal(c.after,150);assert.equal(p.engineDecision.triggered,false);
 const q=impact(draft(500,{essentialId:'food'})),comparison=L.pauseComparison(q),html=L.pauseComparisonMarkup(q);
 assert.equal(q.after,100);assert.equal(q.essentialsAfter,150);assert.equal(comparison.before,350);assert.equal(comparison.after,100);assert.equal(comparison.requiredAfter,150);assert(html.includes('covers GH₵200.00 of an existing budget item'));assert(html.includes('of GH₵150.00 planned'));
});
test('Pending holds, fees and pre-existing shortfalls come directly from the engine',()=>{
 const s=state({txs:[{id:'pending',type:'out',status:'pending',amount:80,fee:10,essentialId:'food'}]});
 const p=impact(draft(280,{fee:5}),s),c=L.pauseComparison(p);assert.equal(p.available,510);assert.equal(p.after,225);assert.equal(p.essentialsBefore,270);assert.equal(c.before,270);assert.equal(c.after,225);assert.equal(p.essentialGap,45);assert.equal(p.goalGap,100);assert.equal(p.totalGap,145);
 const gap=impact(draft(20),state({balance:300})),previous=L.pauseComparison(gap),html=L.pauseComparisonMarkup(gap);assert.equal(previous.before,300);assert.equal(previous.after,280);assert.equal(gap.totalGapBefore,150);assert(html.includes('GH₵150.00 was already uncovered. This payment adds GH₵20.00'));
 const linked=impact(draft(20,{essentialId:'food'}),state({balance:300}));assert.equal(linked.extraGap,0);assert.equal(linked.engineDecision.planImpact,null);
});
test('Wrapper retains one illustration, the direct headline and every existing action',()=>{
 L.state={...state(),paymentDraft:draft()};const before=financial(L.state),html=L.views.pause();
 assert.equal(called,1);assert.equal(financial(L.state),before);assert.equal((html.match(/data-art=/g)||[]).length,1);assert.equal((html.match(/data-pause-comparison/g)||[]).length,1);
 assert(html.includes('<h1>Food and transport would be GH₵30.00 short.</h1>'));assert(html.includes(actions));assert(!html.includes('Old explanation'));
 assert.equal(L.state.pauseEvents.filter(x=>x.action==='shown').length,1);L.views.pause();assert.equal(L.state.pauseEvents.filter(x=>x.action==='shown').length,1);
});
test('A covered behavioral Pause gains the room comparison without changing its trigger',()=>{
 const txs=Array.from({length:3},(_,i)=>({id:'recent'+i,type:'out',status:'success',amount:1,fee:0,date:new Clock(now-60000*(i+1)).toISOString(),method:'campus',destination:'SHOP',name:'Campus Shop'}));
 L.state={...state({txs}),paymentDraft:draft(80)};const decision=L.pauseEngine.evaluate(L.state.paymentDraft),before=financial(L.state),html=L.views.pause();
 assert(decision.triggered);assert.equal(decision.planImpact,null);assert.equal(financial(L.state),before);assert(html.includes('data-comparison-kind="room"'));assert(html.includes('GH₵150.00'));assert(html.includes('GH₵70.00'));
 assert.equal(L.pauseEngine.evaluate(L.state.paymentDraft).score,decision.score);
});
test('Non-Pause, missing-draft and submitted-result paths stay untouched',()=>{
 for(const d of [null,draft(80),draft(280,{submittedTxId:'sent'})]){
  L.state={...state(),paymentDraft:d};const html=L.views.pause();assert(!html.includes('data-pause-comparison'));assert(html.includes(d&&!d.submittedTxId?'Original review':'Original result'));
 }
});
test('No plan and several goals receive honest labels rather than invented detail',()=>{
 const noPlan=L.pauseComparison(impact(draft(80),state({essentials:[],goals:[]})));assert.equal(noPlan.kind,'account');assert.equal(noPlan.before,600);assert.equal(noPlan.after,520);assert(noPlan.note.includes('No saved costs'));
 const many=L.pauseComparison(impact(draft(200),state({goals:[{id:'a',name:'Laptop',allocated:60},{id:'b',name:'Shoes',allocated:40}]})));assert.equal(many.label,'Goal money covered');assert.equal(many.after,50);
});
test('Small amounts and escaped names retain exact real financial text',()=>{
 const s=state({balance:0.3,essentials:[essential('food','Food',0.2)],goals:[{id:'goal',name:'<Laptop>',allocated:0.1}]}),p=impact(draft(0.01),s),c=L.pauseComparison(p),html=L.pauseComparisonMarkup(p);
 assert.equal(c.before,0.1);assert.equal(c.after,0.09);assert(html.includes('&lt;Laptop&gt; money covered'));assert(html.includes('GH₵0.09'));assert(!html.includes('<Laptop>'));
});
test('Brief shared motion never counts money, hides information or blocks actions',()=>{
 L.route='pause';const before=JSON.stringify(L.state);L.motion();assert.equal(baseMotionCalls,1);assert.equal(animations.length,2);assert.equal(JSON.stringify(L.state),before);
 for(const a of animations){assert.equal(a.options.duration,180);assert(!a.options.delay);assert(a.frames.every(f=>f.opacity===undefined&&f.textContent===undefined));}
 media.matches=true;L.motion();assert.equal(animations.length,2);media.matches=false;document.hidden=true;L.motion();assert.equal(animations.length,2);document.hidden=false;L.route='home';L.motion();assert.equal(animations.length,2);
});
console.log(checks+' Clarity Edition Pause checks passed.');
