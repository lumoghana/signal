/* Concrete alternatives must preserve plan mathematics, editability and consent.
   Mounted DOM checks do not establish phone layout or physical touch behavior. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let checks=0;
const check=(name,run)=>{run();checks++;console.log('PASS '+name);};
const view=h=>h.document.getElementById('view');
const finance=h=>JSON.stringify([h.L.state.balance,h.L.state.txs,h.L.state.essentials,h.L.state.goals]);
function fixture(){
 const h=createHarness({clock:true}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:500,txs:[],essentials:[{id:'food',name:'Food',amount:200,paid:0},{id:'transport',name:'Transport',amount:150,paid:0}],goals:[{id:'laptop',name:'Laptop',allocated:100,target:3500,boxVersion:2}],allowance:{amount:0,date:''},paymentDraft:null,chats:[]});
 assert.equal(L.state.accounts.version,2);assert.equal(L.accountBalances().savings,100);assert.equal(L.accountBalances().total,600);
 L.route='home';L.params={};L.history=[];L.render();h.flush();return h;
}
const candidate=(extra={})=>({id:'candidate',method:'campus',amount:280,fee:0,checked:true,name:'Akua’s Kitchen',destination:'AK01',...extra});
function open(h){h.L.openPayTab('campus');h.L.pickMerchant('AK01');h.set('payment-amount',280);h.set('payment-essential','');h.L.preparePayment();h.flush();assert.equal(h.L.route,'pause');return view(h).querySelector('[data-plan-adjustment]');}
const clean=h=>assert.deepEqual(h.errors,[]);
check('a pure alternative covers all saved commitments at the exact boundary',()=>{
 const h=fixture(),before=JSON.stringify(h.L.state),d=candidate(),option=h.L.planCoveredAmountOption(d);
 assert.equal(option.amount,150);assert.equal(option.fee,0);assert.equal(option.impact.after,350);assert.equal(option.impact.totalGap,0);assert.equal(option.impact.room,0);
 assert(h.L.planImpactSummary({...d,amount:150.01}).totalGap>0);
 assert.equal(JSON.stringify(h.L.state),before);clean(h);
});
for(const [method,fee,amount]of [['momo',.5,149.5],['bank',1,149]])check(method+' alternative includes its fee rather than overstating spending room',()=>{
 const h=fixture(),d=candidate({method,fee}),option=h.L.planCoveredAmountOption(d);
 assert.equal(option.amount,amount);assert.equal(option.fee,fee);assert.equal(option.impact.after,350);assert.equal(option.impact.totalGap,0);
 assert(h.L.planImpactSummary({...d,amount:amount+.01,fee}).totalGap>0);clean(h);
});
check('a linked essential is fulfilled once when calculating the smaller amount',()=>{
 const h=fixture(),option=h.L.planCoveredAmountOption(candidate({amount:500,essentialId:'food'}));
 assert.equal(option.amount,350);assert.equal(option.impact.essentialCovered,200);assert.equal(option.impact.essentialsAfter,150);assert.equal(option.impact.after,150);assert.equal(option.impact.totalGap,0);clean(h);
});
for(const linked of [false,true])check('pending '+(linked?'planned':'extra')+' spending changes the alternative through the shared authority',()=>{
 const h=fixture();h.L.state.txs=[{id:'held',type:'out',status:'pending',amount:40,fee:0,...(linked?{essentialId:'food'}:{})}];
 const option=h.L.planCoveredAmountOption(candidate());assert.equal(option.amount,linked?150:110);assert.equal(option.impact.available,460);assert.equal(option.impact.totalGap,0);clean(h);
});
check('a one-pesewa boundary remains exact',()=>{
 const h=fixture();h.L.state.balance=350.02;const option=h.L.planCoveredAmountOption(candidate({amount:.03}));assert(option);assert.equal(option.amount,.02);assert.equal(option.impact.totalGap,0);clean(h);
});
check('an already uncovered plan and missing essentials never get a misleading covered alternative',()=>{
 const h=fixture();h.L.state.balance=300;assert.equal(h.L.planCoveredAmountOption(candidate()),null);
 h.L.state.balance=500;h.L.state.essentials=[];assert.equal(h.L.planCoveredAmountOption(candidate({amount:450})),null);clean(h);
});
check('fixed requests, merchant sales, products and completed drafts cannot be repriced',()=>{
 const h=fixture();for(const extra of [{requestId:'request'},{fixedAmount:true},{merchantSaleId:'sale'},{bill:'airtime'},{submittedTxId:'done'},{checked:false},{amount:80},{amount:280.001},{amount:5000.01}])assert.equal(h.L.planCoveredAmountOption(candidate(extra)),null,JSON.stringify(extra));clean(h);
});
check('the suggestion reveals with the effect and changes only the draft before a new Review and PIN',()=>{
 const h=fixture(),before=finance(h),button=open(h);assert(button);assert.equal(button.getAttribute('aria-hidden'),'true');h.advance(899);assert.equal(button.getAttribute('aria-hidden'),'true');h.advance(1);assert.equal(button.getAttribute('aria-hidden'),'false');
 assert(button.textContent.includes('GH₵150.00'));assert(button.textContent.includes('Plan stays covered'));const id=h.L.state.paymentDraft.id;button.click();h.flush();assert.equal(h.L.route,'paymentReview');assert.equal(h.L.state.paymentDraft.id,id);assert.equal(h.L.state.paymentDraft.amount,150);assert.equal(h.L.state.paymentDraft.reviewFingerprint,undefined);assert.equal(h.L.state.paymentDraft.pauseAcceptedSignature,undefined);assert.equal(finance(h),before);
 h.L.editPayment();h.flush();assert.equal(h.document.getElementById('payment-amount').value,'150');h.L.preparePayment();h.L.continuePayment();h.flush();assert.equal(h.L.route,'authorize');assert.equal(finance(h),before);
 h.set('payment-pin','123456');h.L.authorizePayment();h.flush();assert.equal(h.L.state.balance,350);assert.equal(h.L.balances().room,0);assert.equal(h.L.accountBalances().savings,100);assert.equal(h.L.state.txs.length,1);h.L.authorizePayment();assert.equal(h.L.state.txs.length,1);clean(h);
});
check('a stale quote returns to the current decision without silently changing the amount',()=>{
 const h=fixture(),button=open(h);h.advance(900);h.L.state.balance=490;const before=finance(h);button.click();h.flush();assert.equal(h.L.route,'pause','Changed facts return to a fresh consequential decision');assert.equal(h.L.state.paymentDraft.amount,280);assert.equal(finance(h),before);assert.equal(h.L.state.txs.length,0);clean(h);
});
check('a detached old suggestion cannot change a different payment',()=>{
 const h=fixture(),button=open(h);h.advance(900);h.L.pauseAction('edit_amount');h.L.pickMerchant('CP02');h.flush();assert.equal(h.L.route,'everydayRepeatChoice');h.L.replaceEverydayDraft();h.flush();h.set('payment-amount',280);h.set('payment-essential','');h.L.preparePayment();h.flush();assert.equal(h.L.route,'pause');const current=h.L.state.paymentDraft.id;button.click();h.flush();assert.equal(h.L.route,'pause','Detached correction cannot bypass the current consequential decision');assert.equal(h.L.state.paymentDraft.id,current);assert.equal(h.L.state.paymentDraft.amount,280);assert.equal(h.L.state.balance,500);clean(h);
});
check('the early visual example keeps fixed sample facts separate from account and adjustment data',()=>{
 const h=fixture(),before=JSON.stringify(h.L.state);h.L.go('samplePause');h.flush();const section=view(h).querySelector('.pause-intro[data-pause-intro]');assert(section);assert.match(section.textContent,/sample|example/i);const sample=h.L.pauseIntro.commitmentImpact();assert.equal(sample.amount,280);assert.equal(sample.shortfall,30);assert.equal(sample.moneyBoxesChanged,false);assert.match(section.textContent,/GH[₵¢]\s*280(?:\.00)?(?![\d.])/);assert.match(section.textContent,/GH[₵¢]\s*30(?:\.00)?(?![\d.])/);assert.match(section.textContent,/food/i);assert.doesNotMatch(section.textContent,/two weeks|laptop/i);assert.equal(JSON.stringify(h.L.state),before);assert.equal(view(h).querySelector('[data-plan-adjustment]'),null);clean(h);
});
console.log(checks+' calculated adjustment and sample premise checks passed.');
