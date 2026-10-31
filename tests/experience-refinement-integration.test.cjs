/* Connected experience checks through the actual shipped module order. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const copy=x=>JSON.parse(JSON.stringify(x));
const view=h=>h.document.getElementById('view');
let count=0;
const check=(name,fn)=>{fn();count++;console.log('PASS '+name);};
function fixture(patch={},options={}){
 const h=createHarness({clock:true,...options}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:500,txs:[],chats:[],paymentDraft:null,planDraft:null,budgetGuideSession:null,budgetCycleDraft:null,budgetHistoryDraft:null,firstBudgetPayoff:null,planSaved:true,
 essentials:[{id:'food',name:'Food',budgetCategory:'food',amount:250,paid:0,externalPaid:0,coverageVersion:1,date:''},{id:'transport',name:'Transport',budgetCategory:'transport',amount:100,paid:0,externalPaid:0,coverageVersion:1,date:''}],
 goals:[{id:'laptop',name:'Laptop',allocated:100,target:3000,boxVersion:2}],allowance:{amount:0,date:'',source:'Family'},planHorizon:{mode:'date',date:'2099-01-07'},budgetPeriodRecord:null,...patch});
 L.openTab('plan');h.flushHistory();h.flush();return h;
}
const money=L=>copy({balance:L.state.balance,goals:L.state.goals,txs:L.state.txs,allowance:L.state.allowance});
const saved=L=>JSON.stringify([L.state.essentials,L.state.planHorizon,L.state.planSaved]);
const clean=h=>assert.deepEqual(h.errors,[]);
function settle(h){h.flushHistory();h.flush();}
function control(h,predicate){const b=view(h).querySelectorAll('button').find(predicate);assert(b,'Working control on '+h.L.route);b.click();settle(h);return b;}
function click(h,label){const b=view(h).querySelectorAll('button').filter(b=>b.textContent.trim()===label).at(-1);assert(b,'Working '+label+' on '+h.L.route);b.click();settle(h);return b;}
function action(h,code){return control(h,b=>b.getAttribute('onclick')===code);}
function ask(h,q){h.set('chatText',q);h.L.askChat();settle(h);return h.L.state.chats.at(-1);}
function toPin(h){
 const {L}=h;if(L.route==='pause'){h.advance(3900);const hold=view(h).querySelector('[data-pause-hold]');assert(hold);hold.click();h.advance(90);settle(h);}else{L.continuePayment();settle(h);}assert.equal(L.route,'authorize');
}
function confirm(h,outcome='Completed'){
 h.set('payment-pin','123456');if(h.L.testMode)h.set('payment-outcome',outcome);h.L.authorizePayment();settle(h);assert.equal(h.L.route,'paymentResult');return h.L.state.txs[0];
}
check('returning Chat review can edit an existing draft item through the form and save one total',()=>{
 const h=fixture(),{L}=h,before=money(L);click(h,'Update budget');assert.equal(h.L.route,'planEdit');click(h,'Adjust with Lumo');ask(h,'Change Food to 300');click(h,'Review Budget');click(h,'Edit costs');
 const edit=view(h).querySelectorAll('button').find(b=>/firstPlanEditEssential\(['"]food['"]\)/.test(b.getAttribute('onclick')||''));assert(edit,'Existing Food has an Edit control');edit.click();settle(h);h.set('firstEssAmount','280');action(h,'L.firstPlanAddEssential()');
 assert.equal(L.state.essentials[0].amount,250);assert.equal(L.state.planDraft.essentials.find(x=>x.id==='food').amount,280);assert.deepEqual(money(L),before);
 action(h,'L.reviewFirstPlanCosts()');action(h,'L.saveFirstPlan()');assert.equal(L.state.essentials.filter(x=>x.id==='food').length,1);assert.equal(L.state.essentials[0].amount,280);assert.equal(L.balances().room,120);assert.deepEqual(money(L),before);clean(h);
});
check('a new pending source payment blocks changed draft costs from being committed',()=>{
 const h=fixture(),{L}=h;click(h,'Update budget');assert.equal(h.L.route,'planEdit');click(h,'Adjust with Lumo');ask(h,'Change Food to 300');click(h,'Review Budget');
 L.state.txs.push({id:'late-hold',type:'out',status:'pending',amount:80,fee:0,essentialId:'food',name:'Lunch'});const before=saved(L),fin=money(L);L.saveFirstPlan();settle(h);assert.equal(saved(L),before);assert.deepEqual(money(L),fin);assert.match(view(h).textContent,/pending/i);clean(h);
});
check('saved-category changes cannot be overwritten by the older guided draft',()=>{
 const h=fixture(),{L}=h;click(h,'Update budget');assert.equal(h.L.route,'planEdit');click(h,'Adjust with Lumo');ask(h,'Change Food to 300');click(h,'Review Budget');L.state.essentials[0].budgetCategory='other';const before=saved(L);L.saveFirstPlan();settle(h);assert.equal(saved(L),before);assert.match(view(h).textContent,/changed|review/i);clean(h);
});
check('food and lunch affordability share the same explicit source clarification',()=>{
 const h=fixture(),{L}=h,fin=money(L);const a=L.chatAnswer('Can I spend GH₵80 on food?'),b=L.chatAnswer('Can I buy lunch for GH₵80?');
 assert(a.budgetPurpose);assert(b.budgetPurpose);assert.deepEqual(copy(a.budgetPurpose.choices),copy(b.budgetPurpose.choices));assert.equal(a.budgetPurpose.amount,80);assert.equal(b.budgetPurpose.amount,80);
 const explicit=L.chatAnswer('Can I afford GH₵80 from Food?');assert.equal(explicit.planImpact.room,150);assert.deepEqual(money(L),fin);clean(h);
});
check('uncertainty during new Budget setup stays in guidance rather than switching to history',()=>{
 const h=fixture({essentials:[],planSaved:false}),{L}=h,fin=money(L);click(h,'Build with Lumo');assert.equal(h.L.route,'planEdit');click(h,'Build with Lumo');const reply=ask(h,'I don’t know how much I spend');
 assert.equal(L.budgetGuide.active(),true);assert.equal(reply.intent,'budgetGuide');assert.doesNotMatch(reply.text,/No completed spending/);assert.match(reply.text,/estimate|cost|pay|start/i);assert.deepEqual(money(L),fin);assert.equal(L.state.essentials.length,0);clean(h);
});
check('a stated resource amount and end date do not become income or a Budget cost',()=>{
 const h=fixture({essentials:[],planSaved:false,planHorizon:{mode:'unspecified',date:''}}),{L}=h,fin=money(L);click(h,'Build with Lumo');assert.equal(h.L.route,'planEdit');click(h,'Build with Lumo');const reply=ask(h,'I have GH₵600 to last me till next Friday');
 assert.equal(L.budgetGuide.active(),true);assert.equal(reply.intent,'budgetGuide');assert.equal(L.state.essentials.length,0);assert.equal(L.state.planDraft.essentials.length,0);assert.deepEqual(money(L),fin);assert.doesNotMatch(reply.text,/What is the GH₵600.00 for/);clean(h);
});
check('confirmed payment results keep their Budget effect after later spending',()=>{
 const h=fixture(),{L}=h;L.openTab('pay');L.pickMerchant('AK01');h.set('payment-amount','80');h.set('payment-essential','');L.preparePayment();settle(h);toPin(h);const first=confirm(h);
 assert(first.budgetResult);assert.match(view(h).querySelector('[data-payment-budget-result]').textContent,/GH₵70.00 left after Budget/);const snapshot=JSON.stringify(first.budgetResult);
 L.finishPayment();settle(h);L.pickMerchant('CP02');h.set('payment-amount','10');h.set('payment-essential','');L.preparePayment();settle(h);toPin(h);confirm(h);
 assert.equal(L.balances().room,60);assert.equal(JSON.stringify(first.budgetResult),snapshot);assert.equal(L.paymentBudgetResult.summary(first).room,70);L.go('txDetail',{id:first.id});settle(h);const proof=view(h).querySelector('[data-payment-budget-result]');assert(proof);assert.match(proof.textContent,/At payment confirmation/);assert.match(proof.textContent,/GH₵70.00/);clean(h);
});
check('pending and failed payments do not receive a confirmed Budget effect or duplicate debit',()=>{
 for(const outcome of ['Pending','Failed']){const h=fixture({}, {testing:true}),{L}=h;L.openTab('pay');L.pickMerchant('AK01');h.set('payment-amount','80');h.set('payment-essential','');L.preparePayment();settle(h);toPin(h);const tx=confirm(h,outcome);
  assert.equal(L.paymentBudgetResult.summary(tx),null);assert.equal(tx.budgetResult,undefined);assert.equal(view(h).querySelector('[data-payment-budget-result]'),null);assert.equal(L.state.balance,500);
  if(outcome==='Pending'){L.resolveTx(tx.id,'success');const proof=JSON.stringify(tx.budgetResult);assert.equal(L.paymentBudgetResult.summary(tx).room,70);L.resolveTx(tx.id,'success');assert.equal(JSON.stringify(tx.budgetResult),proof);assert.equal(L.state.balance,420);assert.equal(L.state.txs.length,1);}
  clean(h);
 }
});
check('linked confirmation explains fulfilled Budget costs without counting savings or the cost twice',()=>{
 const h=fixture(),{L}=h;L.openTab('pay');L.pickMerchant('AK01');h.set('payment-amount','80');h.set('payment-essential','food');L.preparePayment();settle(h);toPin(h);const tx=confirm(h),s=L.paymentBudgetResult.summary(tx);
 assert.equal(s.room,150);assert.equal(s.selectedCost.remaining,170);assert.equal(L.balances().essentials,270);assert.equal(L.accountBalances().savings,100);assert.match(view(h).querySelector('[data-payment-budget-result]').textContent,/Food: GH₵170.00 still to cover/);clean(h);
});
check('a dated review compares only actual recorded spending and labels unknown and pending separately',()=>{
 const h=fixture({budgetCycle:{id:'old-period',start:'2026-10-17'},planHorizon:{mode:'date',date:'2026-10-23'},txs:[
  {id:'food-done',type:'out',status:'success',name:'Lunch',category:'Food',amount:80,fee:1,essentialId:'food',date:'2026-10-20T10:00:00Z'},
  {id:'food-pending',type:'out',status:'pending',name:'Lunch held',category:'Food',amount:20,fee:0,essentialId:'food',date:'2026-10-21T10:00:00Z'},
  {id:'unknown',type:'out',status:'success',name:'Unknown',category:'Uncategorised',amount:30,fee:0,date:'2026-10-21T10:00:00Z'},
  {id:'internal',type:'out',status:'success',name:'Laptop',category:'Food',amount:90,fee:0,boxId:'laptop',internalTransfer:true,date:'2026-10-21T10:00:00Z'},
  {id:'refund-old',type:'out',status:'reversed',name:'Refunded',category:'Food',amount:25,fee:0,date:'2026-10-21T10:00:00Z'},
  {id:'failed',type:'out',status:'failed',name:'Failed',category:'Food',amount:15,fee:0,date:'2026-10-21T10:00:00Z'}]}),{L}=h,fin=money(L),before=saved(L),s=L.budgetPeriodReview.summary({now:Date.parse('2026-10-24T12:00:00Z')});
 assert.equal(s.ready,true);assert.equal(s.planned,350);assert.equal(s.categorised,81);assert.equal(s.recorded,111);assert.equal(s.unknown,30);assert.equal(s.pending,20);assert.equal(s.rows.find(x=>x.categoryId==='food').recorded,81);assert.deepEqual(money(L),fin);assert.equal(saved(L),before);clean(h);
});
check('reviewing earlier spending does not rewrite its recorded category after a Budget recategorisation',()=>{
 const h=fixture({budgetCycle:{id:'old-period',start:'2026-10-17'},planHorizon:{mode:'date',date:'2026-10-23'},essentials:[{id:'food',name:'Food',budgetCategory:'housing-bills',amount:250,paid:0}],txs:[
 {id:'old-food',type:'out',status:'success',name:'Lunch',category:'Food',categoryMeta:{source:'budget-source',confidence:'confirmed',budgetCategory:'food'},budgetSource:{type:'budget-line',id:'food',name:'Food'},amount:80,fee:0,essentialId:'food',date:'2026-10-20T10:00:00Z'}]}),{L}=h,before=money(L),s=L.budgetPeriodReview.summary({now:Date.parse('2026-10-24T12:00:00Z')});
 assert.equal(s.rows.find(x=>x.categoryId==='food').recorded,80);assert.equal(s.rows.find(x=>x.categoryId==='housing-bills').planned,250);assert.equal(s.rows.find(x=>x.categoryId==='housing-bills').recorded,0);assert.deepEqual(money(L),before);clean(h);
});
check('a missing historical start date is requested without inventing a Budget period',()=>{
 const h=fixture({budgetCycle:null,budgetPeriodRecord:null}),{L}=h,fin=money(L),before=saved(L);assert.equal(L.budgetPeriodReview.summary().reason,'dates');L.budgetPeriodReview.open();settle(h);assert.equal(L.route,'budgetReviewDates');assert.equal(h.document.getElementById('budget-review-start').value,'');assert.equal(saved(L),before);assert.deepEqual(money(L),fin);clean(h);
});
check('contextual Pause help survives native-order history and returns to the original Pay surface',()=>{
 const h=fixture({}, {deferHistory:true}),{L}=h;L.openTab('pay');settle(h);L.pickMerchant('AK01');h.set('payment-amount','280');h.set('payment-essential','');L.preparePayment();settle(h);assert.equal(L.route,'pause');h.advance(900);h.advance(400);
 const before=money(L),draft=L.state.paymentDraft,fields=JSON.stringify(draft),help=view(h).querySelectorAll('button').find(b=>b.textContent.trim()==='Help me understand this');assert(help);help.click();h.flush();assert(h.history.pending>0);
 /* Native core may render the parent before its task history closes. */
 L.route='pay';L.params={};L.render();settle(h);assert.equal(L.route,'chat');assert.equal(L.taskSheet.active,false);assert.equal(L.state.chats.filter(r=>r.intent==='contextualHelp').length,1);assert.equal(h.document.querySelectorAll('[role="dialog"]').length,0);assert.equal(JSON.stringify(draft),fields);
 ask(h,'Why is that?');assert.equal(L.state.chats.at(-1).intent,'contextualHelp');h.advance(10000);const back=view(h).querySelector('[data-context-return]');assert(back);back.click();settle(h);assert.equal(L.route,'pause');assert.equal(L.taskSheet.parentRoute,'pay');assert.equal(L.state.paymentDraft,draft);assert.deepEqual(money(L),before);assert.equal(JSON.stringify(draft),fields);
 const hold=view(h).querySelector('[data-pause-hold]');assert.equal(hold.getAttribute('aria-disabled'),'true');h.advance(2599);assert.equal(hold.getAttribute('aria-disabled'),'true');h.advance(1);assert.equal(hold.getAttribute('aria-disabled'),'false');assert.equal(L.state.txs.length,0);clean(h);
});
check('contextual help never restores an obsolete payment or authorises a changed projection',()=>{
 const h=fixture(),{L}=h;L.openTab('pay');L.pickMerchant('AK01');h.set('payment-amount','280');h.set('payment-essential','');L.preparePayment();settle(h);click(h,'Help me understand this');const d=L.state.paymentDraft;
 d.pauseAcceptedSignature='old-consent';d.reviewFingerprint='old-review';L.state.essentials[0].amount=500;const before=money(L);L.contextualChat.returnToTask();settle(h);assert(['pause','paymentReview'].includes(L.route));assert.equal(d.pauseAcceptedSignature,undefined);assert.notEqual(d.reviewFingerprint,'old-review');assert.deepEqual(money(L),before);assert.equal(L.state.txs.length,0);assert.equal(L.taskSheet.parentRoute,'pay');clean(h);
 const replaced=fixture(),R=replaced.L;R.openTab('pay');R.pickMerchant('AK01');replaced.set('payment-amount','280');replaced.set('payment-essential','');R.preparePayment();settle(replaced);click(replaced,'Help me understand this');R.state.paymentDraft={id:'replacement',method:'lumo',amount:'20',name:'Ama'};const replacement=copy(R.state.paymentDraft);assert.equal(R.contextualChat.returnToTask(),false);assert.deepEqual(copy(R.state.paymentDraft),replacement);assert.equal(R.state.txs.length,0);clean(replaced);
});
check('an ended Budget review prepares the next period only after explicit dates and separate confirmation',()=>{
 const h=fixture({budgetCycle:{id:'old-period',start:'2026-10-17'},planHorizon:{mode:'date',date:'2026-10-23'}}),{L}=h,before=saved(L),fin=money(L);
 click(h,'Review this period');assert.equal(L.route,'budgetPeriodReview');click(h,'Keep these amounts');assert.equal(L.route,'budgetReviewNext');assert.equal(L.state.budgetCycleDraft,null);assert.equal(L.budgetPeriodReview.prepareNext(),false);
 const date=n=>new Date(h.context.Date.now()+n*86400000).toISOString().slice(0,10);h.set('budget-next-start',date(0));h.set('budget-next-end',date(6));L.budgetPeriodReview.prepareNext();settle(h);assert.equal(L.route,'budgetCycleReview');assert.equal(saved(L),before);assert.deepEqual(money(L),fin);assert.equal(L.state.budgetCycleDraft.costs.reduce((n,r)=>n+Number(r.amount),0),350);
 action(h,'L.confirmBudgetCycle()');assert.equal(L.state.budgetCycle.start,date(0));assert.equal(L.state.planHorizon.date,date(6));assert.equal(L.state.essentials.length,2);assert.deepEqual(money(L),fin);assert.equal(L.state.budgetCycleDraft,null);assert.equal(L.state.budgetPeriodReviewDraft,null);clean(h);
});
check('a changed ledger invalidates the next-period review instead of silently using an older quote',()=>{
 const h=fixture({budgetCycle:{id:'old-period',start:'2026-10-17'},planHorizon:{mode:'date',date:'2026-10-23'}}),{L}=h,before=saved(L);L.budgetPeriodReview.open();settle(h);click(h,'Adjust next Budget');L.state.txs.push({id:'late-success',type:'out',status:'success',name:'Recorded late',category:'Food',amount:10,fee:0,date:'2026-10-20T10:00:00Z'});const fin=money(L),date=n=>new Date(h.context.Date.now()+n*86400000).toISOString().slice(0,10);h.set('budget-next-start',date(0));h.set('budget-next-end',date(6));assert.equal(L.budgetPeriodReview.prepareNext(),false);assert.equal(L.state.budgetCycleDraft,null);assert.equal(saved(L),before);assert.deepEqual(money(L),fin);assert.match(view(h).textContent,/changed|refresh/i);clean(h);
});
console.log(count+' connected experience refinement checks passed.');
