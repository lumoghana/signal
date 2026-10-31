/* Targeted usability checks through the shipped index, live DOM and real rules.
   The lightweight DOM proves interaction and facts, not rendered phone fit. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
let passed=0;
const check=(name,run)=>{run();passed++;console.log('PASS '+name);};
const view=h=>h.document.getElementById('view');
function fixture(patch={}){
 const h=createHarness(),{L}=h;L.explore();
 Object.assign(L.state,{balance:600,txs:[],essentials:[],goals:[],allowance:{amount:0,date:'',source:'Family'},planHorizon:{mode:'unspecified',date:''},planDraft:null,planSaved:false,paymentDraft:null,chats:[],...patch});
 L.route='home';L.params={};L.history=[];L.save();L.render();h.flush();return h;
}
function click(h,action){const button=view(h).querySelectorAll('button').find(el=>el.getAttribute('onclick')===action||(el.type==='submit'&&el.closest('form')?.getAttribute('onsubmit')?.includes(action)));assert(button,'Working action '+action);button.click();h.flush();}
function fact(h,label){const term=view(h).querySelectorAll('dt').find(el=>el.textContent===label);assert(term,'Visible '+label);return term.parentElement.querySelector('dd').textContent;}
const clean=h=>assert.deepEqual(h.errors,[],'No actual-index rendering or interaction errors');

check('saving expected income alone keeps Home, My plan and explanation entry incomplete',()=>{
 const h=fixture(),{L}=h;L.go('allowance');h.flush();h.set('allowanceAmount',800);h.set('allowanceDate','');h.set('allowanceSource','Family');click(h,'L.saveAllowance()');
 assert.equal(L.state.allowance.amount,800);assert.equal(L.state.balance,600);assert.equal(L.state.txs.length,0);assert.equal(L.hasMeaningfulPlan(),false);assert.equal(L.state.planSaved,false);
 L.openTab('home');h.flush();assert(view(h).querySelector('.home-plan-invite'));assert(!view(h).querySelector('#overview-room'));assert(!h.document.getElementById('balance-eye').getAttribute('aria-controls').includes('overview-room'));
 L.openPlanBenefit();h.flush();assert.equal(L.route,'planBenefit');assert(view(h).textContent.includes('What is a plan?'));L.leavePlanBenefit();h.flush();L.openTab('plan');h.flush();assert(!view(h).querySelector('.plan-room'));assert(view(h).textContent.includes('Build my first plan'));assert(view(h).textContent.includes('Expected money'));clean(h);
});

check('a saved target with no allocation keeps the useful plan invitation',()=>{
 const h=fixture(),{L}=h;L.go('goalEdit');h.flush();h.set('goalName','Laptop');h.set('goalTarget',3500);click(h,'L.saveGoal()');assert.equal(L.state.goals[0].allocated,0);assert.equal(L.hasMeaningfulPlan(),false);
 L.openTab('home');h.flush();assert(view(h).querySelector('.home-plan-invite'));assert(!view(h).querySelector('#overview-room'));L.openPlanBenefit();h.flush();assert.equal(L.route,'planBenefit');assert.equal(L.state.balance,600);clean(h);
});

check('costs, a positive goal allocation and deliberately saved legacy plans still count',()=>{
 for(const patch of [{essentials:[{id:'food',name:'Food',amount:200,paid:0}]},{goals:[{id:'laptop',name:'Laptop',target:3500,allocated:100}]},{planSaved:true}]){
  const h=fixture(patch),{L}=h;assert.equal(L.hasMeaningfulPlan(),true);assert(view(h).querySelector('#overview-room'));assert(!view(h).querySelector('.home-plan-invite'));L.openPlanBenefit();h.flush();assert.equal(L.route,'plan');assert(view(h).querySelector('.plan-room'));clean(h);
 }
});

check('a partly paid essential explicitly edits total planned and explains the remaining amount',()=>{
 const h=fixture({balance:520,essentials:[{id:'food',name:'Food',amount:200,paid:0}],txs:[{id:'paid-food',type:'out',status:'success',amount:80,fee:0,essentialId:'food',name:'Lunch',date:new Date().toISOString()}]}),{L}=h;
 L.go('essentialEdit',{id:'food'});h.flush();assert.equal(h.document.getElementById('essAmount').value,'200');const input=h.document.getElementById('essAmount');assert.equal(view(h).querySelector('label[for="essAmount"]').querySelector('span').textContent,'Total planned (GH₵)');assert.equal(input.getAttribute('aria-describedby'),'essential-total-help');assert(h.document.getElementById('essential-total-help').textContent.includes('whole period'));assert(!view(h).textContent.includes('What still needs paying?'));
 assert.equal(fact(h,'Already covered'),'GH₵80.00');assert.equal(fact(h,'Still to cover'),'GH₵120.00');assert(!view(h).querySelectorAll('dt').some(el=>el.textContent==='Payment in progress'));
 const moneyBefore=copy({balance:L.state.balance,txs:L.state.txs});h.set('essAmount',180);click(h,'L.saveEssential()');assert.equal(L.state.essentials[0].amount,180);assert.equal(L.state.essentials[0].paid,80);assert.equal(L.balances().essentials,100);assert.deepEqual(copy({balance:L.state.balance,txs:L.state.txs}),moneyBefore);
 L.go('essentialEdit',{id:'food'});h.flush();assert.equal(h.document.getElementById('essAmount').value,'180');assert.equal(fact(h,'Already covered'),'GH₵80.00');assert.equal(fact(h,'Still to cover'),'GH₵100.00');clean(h);
});

check('pending coverage remains distinct from confirmed coverage and does not permit editing',()=>{
 const h=fixture({balance:520,essentials:[{id:'food',name:'Food',amount:200,paid:0}],txs:[{id:'paid-food',type:'out',status:'success',amount:80,fee:0,essentialId:'food',name:'Lunch',date:new Date().toISOString()},{id:'pending-food',type:'out',status:'pending',amount:50,fee:2,essentialId:'food',name:'Next meal',date:new Date().toISOString()}]}),{L}=h;
 L.go('essentialEdit',{id:'food'});h.flush();assert.equal(fact(h,'Already covered'),'GH₵80.00');assert.equal(fact(h,'Payment in progress'),'GH₵50.00');assert.equal(fact(h,'Still to cover'),'GH₵70.00');assert.equal(L.balances().available,468);assert.equal(L.balances().essentials,70);
 const before=copy({balance:L.state.balance,txs:L.state.txs,essentials:L.state.essentials});h.set('essAmount',180);click(h,'L.saveEssential()');assert.equal(L.route,'essentialEdit');assert(view(h).querySelector('#error').textContent.includes('payment in progress'));assert.deepEqual(copy({balance:L.state.balance,txs:L.state.txs,essentials:L.state.essentials}),before);
 L.resolveTx('pending-food','failed');L.render();h.flush();assert.equal(fact(h,'Already covered'),'GH₵80.00');assert.equal(fact(h,'Still to cover'),'GH₵120.00');assert(!view(h).querySelectorAll('dt').some(el=>el.textContent==='Payment in progress'));assert.equal(L.state.balance,520);clean(h);
});

check('new costs state whole-period total and keep the optional date optional',()=>{
 const h=fixture(),{L}=h;L.openPlanBenefit();h.flush();click(h,'L.buildPlanFromBenefit()');const input=h.document.getElementById('firstEssAmount');assert.equal(input.getAttribute('aria-describedby'),'first-cost-period-help');assert.equal(h.document.getElementById('first-cost-period-help').textContent,'One total, not per day. Add an end date whenever you know it.');assert.equal(h.document.getElementById('firstPlanPeriodMode').value,'unspecified');h.set('firstEssName','Food');h.set('firstEssAmount',150);click(h,'L.reviewFirstPlanCosts()');assert.equal(L.route,'firstPlanReview');click(h,'L.saveFirstPlan()');assert.equal(L.state.planHorizon.mode,'unspecified');assert.equal(L.balances().room,450);assert.equal(L.state.balance,600);clean(h);
});
console.log(`${passed} everyday planning usability checks passed.`);
