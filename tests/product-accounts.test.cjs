/* Product integration through the exact dist/index.html script order and mounted
   forms. The DOM harness checks behavior; it does not claim phone geometry or a
   live bank connection. Fixture starts at zero and receives one confirmed demo
   credit before an authorised internal transfer, so savings are never invented. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const index=fs.readFileSync(path.resolve(__dirname,'../dist/index.html'),'utf8');
const shipped=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
let passed=0;
const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
const view=h=>h.document.getElementById('view');
const clean=h=>assert.deepEqual(h.errors,[]);
function submit(h){const form=view(h).querySelector('form');assert(form,'Mounted form on '+h.L.route);h.submit(form);h.flush();}
function fixture(){
 const h=createHarness({clock:true,testing:true}),{L}=h;L.explore();
 Object.assign(L.state,{balance:0,txs:[],essentials:[{id:'food',name:'Food and transport',amount:350,paid:0}],goals:[{id:'laptop',name:'Laptop',target:3500,allocated:0,boxVersion:2}],planSaved:true,planDraft:null,paymentDraft:null,fundingDraft:null,bankFunding:null,budgetPrompt:null,onboardingFunding:null,chats:[],allowance:{amount:0,date:''}});
 L.state.profile.campus='University of Ghana';L.state.profile.phone='0241230123';L.route='home';L.params={};L.history=[];L.save();L.render();h.flush();
 assert.equal(L.accountBalances().total,0);
 L.beginFirstFunding();L.startBankFunding();h.set('bank-test-amount',600);L.simulateBankReceipt();h.flush();
 assert.equal(L.state.balance,600);assert.equal(L.state.txs.length,1);assert.equal(L.state.txs[0].type,'in');assert.equal(L.state.txs[0].status,'success');
 L.deferFundedBudget();h.flushHistory();h.flush();
 L.startMoneyBoxTransfer('laptop','in');h.flush();h.set('allocation',100);submit(h);
 assert.equal(L.route,'paymentReview');assert.equal(L.state.balance,600);assert.equal(L.state.goals[0].allocated,0);
 L.continuePayment();assert.equal(L.route,'authorize');h.set('payment-pin','123456');h.set('payment-outcome','Completed');submit(h);
 assert.equal(L.route,'paymentResult');assert.equal(L.accountBalances().operational,500);assert.equal(L.accountBalances().savings,100);assert.equal(L.accountBalances().total,600);assert.equal(L.balances().room,150);
 L.go('home');h.flush();clean(h);return h;
}
function campusAmount(h,amount,linked=false){
 const {L}=h;L.go('campusPay');L.pickMerchant('AK01');h.flush();h.set('payment-amount',amount);h.set('payment-essential',linked?'food':'');h.flush();return L.state.paymentDraft;
}
function authorise(h){
 const {L}=h;if(L.route==='pause'){h.advance(3900);const hold=view(h).querySelector('[data-pause-hold]');assert(hold);hold.click();h.advance(90);h.flush();}else L.continuePayment();
 assert.equal(L.route,'authorize');h.set('payment-pin','123456');h.set('payment-outcome','Completed');submit(h);assert.equal(L.route,'paymentResult');
}

check('shipped index loads accounts after core and the product composition after Money Boxes',()=>{
 assert(shipped.includes('two-account-engine.js'));assert(shipped.includes('product-accounts.js'));
 assert(shipped.indexOf('core.js')<shipped.indexOf('two-account-engine.js'));assert(shipped.indexOf('two-account-engine.js')<shipped.indexOf('pause-engine.js'));assert(shipped.indexOf('money-boxes.js')<shipped.indexOf('product-accounts.js'));
});
check('confirmed incoming money and authorised saving preserve the combined total and budget room',()=>{
 const h=fixture(),{L}=h,a=L.accountBalances();assert.equal(a.operational,500);assert.equal(a.savings,100);assert.equal(a.total,600);assert.equal(L.balances().essentials,350);assert.equal(L.balances().allocated,0);assert.equal(L.balances().room,150);
 assert.notEqual(a.operationalNumber,a.savingsNumber);assert.equal(L.state.txs.filter(t=>t.type==='in').length,1);assert.equal(L.state.txs.filter(L.isInternalTransfer).length,1);assert.equal(L.state.essentials[0].paid,0);clean(h);
});
check('Home has two account cards and one labelled privacy control for all three monetary figures',()=>{
 const h=fixture(),{L}=h;assert.equal(view(h).querySelectorAll('.account-card').length,2);assert.equal(view(h).querySelectorAll('.account-operational').length,1);assert.equal(view(h).querySelectorAll('.account-savings').length,1);
 const fields=['available','room','savings'];for(const key of fields){const el=view(h).querySelector(`[data-private-value="${key}"]`);assert(el);assert(!el.querySelector('.money-mask'));}
 const eye=h.document.getElementById('balance-eye');assert.equal(eye.getAttribute('aria-label'),'Hide balances');for(const id of ['overview-balance','overview-room','overview-savings'])assert(eye.getAttribute('aria-controls').includes(id));
 eye.click();for(const key of fields){const el=view(h).querySelector(`[data-private-value="${key}"]`);assert(el.querySelector('.money-mask'));assert.equal(el.textContent,'•••••');}assert.equal(h.document.getElementById('balance-eye').getAttribute('aria-label'),'Show balances');
 h.document.getElementById('balance-eye').click();assert.match(h.document.getElementById('overview-balance').textContent,/500/);assert.match(h.document.getElementById('overview-room').textContent,/150/);assert.match(h.document.getElementById('overview-savings').textContent,/100/);clean(h);
});
for(const [amount,after,room,gap]of [[80,420,70,0],[140,360,10,0],[280,220,0,130]])check('extra '+amount+' has matching live preview, Chat, review/Pause and confirmed ledger',()=>{
 const h=fixture(),{L}=h,d=campusAmount(h,amount),before=L.accountBalances(),p=L.planImpactSummary(d),reply=L.chatAnswer('Can I spend GH₵'+amount+'?');
 assert.equal(p.available,500);assert.equal(p.after,after);assert.equal(p.room,room);assert.equal(p.essentialGap,gap);assert.equal(p.goalGap,0);assert.equal(p.totalGap,gap);
 assert.equal(reply.planImpact.after,p.after);assert.equal(reply.planImpact.room,p.room);assert.equal(reply.planImpact.totalGap,p.totalGap);assert.equal(reply.planImpact.headline,p.headline);
 assert(view(h).querySelector('[data-payment-balance]'));assert.equal(view(h).querySelectorAll('.entry-consequence').length,1,'Entry contains one compact live projection');assert.equal(view(h).querySelector('.entry-consequence-copy').textContent,L.entryConsequenceText(p));
 assert.equal(L.accountBalances().operational,before.operational);assert.equal(L.accountBalances().savings,before.savings);
 L.preparePayment();h.flush();assert.equal(L.route,amount===280?'pause':'paymentReview');if(amount===280){assert(view(h).textContent.includes('130.00'));assert(view(h).querySelector('.pause-comparison'));}assert.equal(L.state.balance,500);
 authorise(h);assert.equal(L.accountBalances().operational,after);assert.equal(L.accountBalances().savings,100);assert.equal(L.balances().room,room);assert.equal(L.balances().gap,gap);assert.equal(L.accountBalances().total,600-amount);clean(h);
});
check('an explicitly linked budget payment fulfils the cost once and keeps GH₵150 room',()=>{
 const h=fixture(),{L}=h,d=campusAmount(h,80,true);assert.equal(d.essentialId,'food');const p=L.planImpactSummary(d);assert.equal(p.essentialCovered,80);assert.equal(p.room,150);
 L.preparePayment();h.flush();assert.equal(L.route,'paymentReview');authorise(h);assert.equal(L.accountBalances().operational,420);assert.equal(L.accountBalances().savings,100);assert.equal(L.balances().essentials,270);assert.equal(L.balances().room,150);assert.equal(L.state.essentials[0].paid,80);
 const reply=L.chatAnswer('What is left after my budget?');assert.match(reply.headline,/GH₵150.00/);assert(reply.calculation.rows.some(([name,value])=>name==='Unpaid budget costs'&&value==='GH₵270.00'));clean(h);
});
check('internal movement appears in Activity with a transfer symbol and is excluded from spending',()=>{
 const h=fixture(),{L}=h,tx=L.state.txs.find(L.isInternalTransfer);L.go('activity');h.flush();const row=view(h).querySelectorAll('button').find(b=>b.getAttribute('onclick')===`L.go('txDetail',{id:'${tx.id}'})`);assert(row,'Internal transfer remains in all activity');assert(row.textContent.includes('↔ GH₵100.00'));assert(!row.textContent.includes('−GH₵100.00'));assert.equal(L.spendingSummary({days:30}).total,0);
 L.go('homeMoneyStory',{days:7});h.flush();assert(view(h).textContent.includes('No completed payments in this period.'));assert.match(L.chatAnswer('Where did my money go?').text,/No completed spending/);
 L.go('activity',{scope:'spending',filter:'out',days:30});h.flush();assert(!view(h).querySelectorAll('button').some(b=>b.getAttribute('onclick')===`L.go('txDetail',{id:'${tx.id}'})`));clean(h);
});
check('savings block account closure even when the operational account has no money',()=>{
 const h=fixture(),{L}=h;L.state.essentials=[];L.transferMoneyBox({id:'laptop',direction:'in',amount:500,draftId:'empty-operational'});assert.equal(L.accountBalances().operational,0);assert.equal(L.accountBalances().savings,600);
 const blockers=L.acct.blockers();assert(blockers.some(b=>b.label==='Money in your savings account'&&b.route==='goals'));L.go('closeAccount');h.flush();assert(view(h).textContent.includes('GH₵600.00 in Money Boxes'));assert(!view(h).querySelectorAll('button').some(b=>b.getAttribute('onclick')==='L.acct.submitClosure()'));assert(!L.state.closed);clean(h);
});
check('Budget keeps its calculation and editing separate from Money Boxes, while both destinations work',()=>{
 const h=fixture(),{L}=h;L.openTab('plan');h.flush();assert(view(h).querySelector('.account-budget-page'));assert.match(view(h).querySelector('.budget-summary').textContent,/150.00.*350.00/);assert(view(h).querySelector('.budget-savings-link'));
 const edit=view(h).querySelectorAll('button').find(b=>b.getAttribute('onclick')==="L.go('planEdit')");assert(edit);edit.click();h.flush();assert.equal(L.route,'planEdit');assert(!view(h).querySelector('#goalName'));assert(!view(h).textContent.includes('Goal allocation'));assert.equal(L.accountBalances().savings,100);
 L.closeTask();h.flushHistory();h.flush();L.openTab('plan');h.flush();const boxes=view(h).querySelector('.budget-savings-link').querySelector('button');boxes.click();h.flush();assert.equal(L.route,'goals');assert(view(h).textContent.includes('Laptop'));assert(view(h).textContent.includes('100.00'));clean(h);
});
console.log(passed+' shipped two-account product integration checks passed.');
