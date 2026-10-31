/* Actual-index Budget lifecycle and personal payoff. These checks do not
   claim phone geometry or native payment security. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const scripts=[...fs.readFileSync(path.join(__dirname,'../dist/index.html'),'utf8').matchAll(/<script\b[^>]*\bsrc="\/([^"?]+)(?:\?[^" ]*)?"/g)].map(m=>m[1]);
const copy=x=>JSON.parse(JSON.stringify(x));
const view=h=>h.document.getElementById('view');
let count=0;
function check(name,fn){fn();count++;console.log('PASS '+name);}
function fixture(patch={}){
 const h=createHarness({clock:true,modules:scripts}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:500,txs:[],essentials:[{id:'food',name:'Food',amount:350,paid:0,externalPaid:0,coverageVersion:1}],goals:[{id:'laptop',name:'Laptop',target:3000,allocated:100,boxVersion:2}],planSaved:true,planDraft:null,planHorizon:{mode:'unspecified',date:''},paymentDraft:null,firstBudgetPayoff:null,...patch});
 L.route='home';L.params={};L.history=[];L.save();L.render();h.flush();return h;
}
const moneyFacts=L=>copy({balance:L.state.balance,essentials:L.state.essentials,goals:L.state.goals,txs:L.state.txs,paymentDraft:L.state.paymentDraft});
const clean=h=>assert.deepEqual(h.errors,[]);
function click(h,code){const b=view(h).querySelectorAll('button').find(b=>b.getAttribute('onclick')===code);assert(b,'Visible '+code+' on '+h.L.route);b.click();h.flush();}
function saveFirst(h){const {L}=h;L.go('firstEssentials');h.flush();h.set('firstEssName','Food');h.set('firstEssAmount','350');L.reviewFirstPlanCosts();L.saveFirstPlan();h.flush();}
check('active scope describes saved costs, not a claim of a complete Budget',()=>{
 const h=fixture(),{L}=h,before=moneyFacts(L),summary=L.budgetStateSummary(L.state,Date.parse('2026-10-23T12:00:00Z'));
 assert.equal(summary.status,'active');assert.equal(summary.costCount,1);assert.equal(summary.remaining,350);assert.match(summary.qualifier,/Based on your 1 saved cost/);assert.match(summary.qualifier,/Other costs aren’t included/);assert.deepEqual(moneyFacts(L),before);clean(h);
});
check('fully covered saved costs remain recognised and pending coverage is qualified',()=>{
 const h=fixture(),{L}=h;L.markEssentialCoveredOutside('food');let s=L.budgetStateSummary();
 assert.equal(s.status,'completed');assert.equal(s.hasBudget,true);assert.equal(s.costCount,1);assert.equal(s.remaining,0);assert.equal(s.headline,'Your saved costs are covered.');
 L.state.essentials[0].externalPaid=0;L.state.essentials[0].paid=0;L.state.txs=[{id:'pending-food',type:'out',status:'pending',amount:350,fee:0,essentialId:'food'}];s=L.budgetStateSummary();
 assert.equal(s.remaining,0);assert.equal(s.pending,350);assert.equal(s.headline,'Your saved costs are paid or pending.');assert.match(s.qualifier,/their result may change/);clean(h);
});
check('an expired Budget stays in the calculation but has a dated qualification',()=>{
 const h=fixture({planHorizon:{mode:'date',date:'2026-10-01'}}),{L}=h,before=moneyFacts(L);
 for(const now of [Date.parse('2026-10-23T12:00:00Z'),new Date('2026-10-23T12:00:00Z')]){
  const s=L.budgetStateSummary(L.state,now);assert.equal(s.status,'ended');assert.equal(s.endDate,'2026-10-01');assert.match(s.qualifier,/Budget through 1 Oct/);assert.equal(s.remaining,350);
 }
 assert.deepEqual(moneyFacts(L),before);L.state.planHorizon={mode:'date',date:'2026-99-99'};assert.equal(L.budgetStateSummary().ended,false);clean(h);
});
check('a depleted selected source explains spare-money use and preserves optional remember',()=>{
 const h=fixture(),{L}=h;L.markEssentialCoveredOutside('food');L.pickMerchant('AK01');h.flush();h.set('payment-amount',80);h.set('payment-essential','food');L.render();h.flush();
 assert.match(view(h).querySelector('#payment-plan-hint').textContent,/Food is used up\. This payment uses money left after Budget/);assert.match(view(h).querySelector('#payment-plan-hint').textContent,/Remember this source/);assert.equal(L.planImpactSummary(L.state.paymentDraft).essentialCovered,0);assert.equal(L.state.balance,500);clean(h);
});
check('expired dates remain visible during entry and Pause without replacing the shortfall',()=>{
 const h=fixture({planHorizon:{mode:'date',date:'2020-10-01'}}),{L}=h;L.pickMerchant('AK01');h.flush();h.set('payment-amount',280);h.set('payment-essential','');L.render();h.flush();
 assert.match(view(h).querySelector('#payment-plan-hint').textContent,/through 1 Oct 2020/);
 L.savePaymentFields();L.route='pause';L.params={};L.render();h.flush();assert.match(view(h).querySelector('[data-budget-period]').textContent,/through 1 Oct 2020/);assert.match(view(h).textContent,/Food would be GH₵130\.00 short/);assert.equal(L.state.balance,500);assert.equal(L.state.txs.length,0);clean(h);
});
check('a pending-covered source is described as pending rather than spent',()=>{
 const h=fixture({txs:[{id:'pending-food',type:'out',status:'pending',amount:350,fee:0,essentialId:'food'}]}),{L}=h;L.pickMerchant('AK01');h.flush();h.set('payment-amount',80);h.set('payment-essential','food');L.render();h.flush();
 const hint=view(h).querySelector('#payment-plan-hint').textContent;assert.match(hint,/Food has GH₵350\.00 pending/);assert.doesNotMatch(hint,/used up/);assert.equal(L.state.balance,500);assert.equal(L.state.txs[0].status,'pending');clean(h);
});
check('first Budget returns to a clean Home and keeps its optional example in Plan tools',()=>{
 const draft={id:'keep-me',method:'lumo',name:'Ama',amount:'12.34'},h=fixture({essentials:[],planSaved:false,paymentDraft:draft}),{L}=h;
 saveFirst(h);assert.equal(L.route,'home');assert.equal(L.taskSheet.active,false);assert.equal(L.state.firstBudgetPayoff.status,'ready');assert.equal(view(h).querySelectorAll('[data-home-focus="story"]').length,0);assert(!view(h).querySelector('.home-budget-payoff'));L.openTab('plan');h.flush();
 const before=moneyFacts(L);click(h,'L.openFirstBudgetExample()');assert.equal(L.route,'firstBudgetExample');assert.equal(L.taskSheet.active,true);assert.equal(L.taskSheet.parentRoute,'plan');assert.equal(L.state.firstBudgetPayoff.status,'seen');assert.match(view(h).textContent,/Example · your saved Budget/);assert.match(view(h).textContent,/GH₵70\.00 spare/);assert.match(view(h).textContent,/outside your saved costs/);assert.match(view(h).textContent,/No payment is being made/);
 assert.equal(view(h).querySelectorAll('summary').filter(el=>el.textContent.trim()==='See calculation').length,1);assert.match(view(h).textContent,/After example · projected/);
 assert.deepEqual(moneyFacts(L),before);click(h,'L.taskSheet?.active?L.closeTask():L.back()');h.flushHistory();assert.equal(L.route,'plan');assert.equal(L.taskSheet.active,false);assert.equal(L.firstBudgetPayoffCard(),'');assert.deepEqual(moneyFacts(L),before);clean(h);
});
check('Not now dismisses payoff without changing money and existing Budgets never gain a new setup step',()=>{
 const h=fixture({essentials:[],planSaved:false}),{L}=h;saveFirst(h);L.openTab('plan');h.flush();const before=moneyFacts(L);click(h,'L.dismissFirstBudgetExample()');assert.equal(L.state.firstBudgetPayoff.status,'dismissed');assert.equal(L.firstBudgetPayoffCard(),'');assert.deepEqual(moneyFacts(L),before);
 L.go('firstEssentials');h.flush();h.set('firstEssName','Transport');h.set('firstEssAmount',20);L.reviewFirstPlanCosts();L.saveFirstPlan();assert.equal(L.state.firstBudgetPayoff.status,'dismissed');assert.equal(L.route,'plan');clean(h);
 const existing=fixture();existing.L.go('firstEssentials');existing.flush();existing.set('firstEssName','Data');existing.set('firstEssAmount',20);existing.L.reviewFirstPlanCosts();existing.L.saveFirstPlan();assert.equal(existing.L.state.firstBudgetPayoff,null);assert.equal(existing.L.route,'home');clean(existing);
});
console.log(count+' Budget state and payoff checks passed.');
