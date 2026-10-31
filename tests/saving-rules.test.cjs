/* Mounted, optional saving prompts use real Money Box review/auth and ledgers. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const shipped=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
const modules=[...shipped.filter(x=>x!=='saving-rules.js'),'saving-rules.js'];
let passed=0;const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
const view=h=>h.document.getElementById('view');
const text=h=>view(h).textContent;
function fixture(){
 const h=createHarness({clock:true,testing:true,modules}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:500,txs:[],paymentDraft:null,essentials:[{id:'food',name:'Food',amount:250,paid:0},{id:'transport',name:'Transport',amount:100,paid:0}],goals:[{id:'laptop',name:'Laptop',target:1000,allocated:100,boxVersion:2}],chats:[],allowance:{amount:9999,date:'2030-01-01'}});
 L.route='plan';L.params={};L.history=[];L.render();h.flush();return h;
}
function rule(h,opts={}){const result=h.L.savingRules.configure({enabled:true,kind:'fixed',value:20,boxId:'laptop',...opts});assert.equal(result.ok,true);return result.rule;}
function credit(h,amount=100,extra={}){return h.L.addTx({type:'in',name:'Allowance received',amount,fee:0,status:'success',category:'Transfers',method:'GIP incoming',...extra});}
function submit(h){const button=view(h).querySelector('button[type="submit"]');assert(button,'Mounted form has submit action');button.click();h.flush();}
function authorise(h,outcome='Completed'){
 assert.equal(h.L.route,'paymentReview');h.L.continuePayment();h.flush();assert.equal(h.L.route,'authorize');h.set('payment-pin','123456');h.set('payment-outcome',outcome);submit(h);assert.equal(h.L.route,'paymentResult');assert.deepEqual(h.errors,[]);
}
function reviewPrompt(h,t){assert.equal(h.L.savingRules.open(t.id),true);h.flush();assert.equal(h.L.route,'allocate');assert(text(h).includes('Nothing moves until you approve'));submit(h);assert.equal(h.L.route,'paymentReview');}
check('saving prompt is opt-in and uses the existing storage state',()=>{
 const h=fixture(),{L}=h,t=credit(h);assert.equal(L.savingRules.hasRule(),false);assert.equal(L.savingRules.suggestion(t.id).eligible,false);assert(L.savingRules.cta(t.id).includes('Ask me to save after money arrives'));
 L.savingRules.settings();assert(text(h).includes('Ask me to save after money arrives'));assert.equal(h.document.getElementById('saving-enabled').checked,false);assert(text(h).includes('No live or automatic payments'));assert.equal(L.state.balance,600);
 rule(h);assert.equal(L.state.savingPrompts.rule.enabled,true);assert.equal(h.store.size,1);assert([...h.store.values()].some(x=>x.includes('savingPrompts')));
});
check('saving settings opened from a different Box do not restore the previous Box selection',()=>{
 const h=fixture(),{L}=h;L.state.goals.push({id:'holiday',name:'Holiday',target:500,allocated:0,boxVersion:2});L.openTab('home');h.flush();L.savingRules.settings('laptop');h.flush();assert.equal(h.document.getElementById('saving-box').value,'laptop');
 L.closeTask();h.flushHistory();h.flush();L.savingRules.settings('holiday');h.flush();assert.equal(h.document.getElementById('saving-box').value,'holiday');assert.equal(L.params.id,'holiday');assert.deepEqual(h.errors,[]);
});
check('explicit Cancel discards the saving edit while Back and close retain an unfinished draft',()=>{
 const h=fixture(),{L}=h;rule(h);const saved=JSON.stringify(L.state.savingPrompts.rule),balance=L.state.balance;
 L.savingRules.settings('laptop');h.flush();h.set('saving-kind','percent');h.set('saving-value','10');
 const cancel=view(h).querySelectorAll('button').find(b=>b.textContent.trim()==='Cancel');assert(cancel);cancel.click();h.flushHistory();h.flush();
 assert.equal(JSON.stringify(L.state.savingPrompts.rule),saved);assert.equal(L.state.savingPrompts.edit,undefined);assert.equal(L.state.balance,balance);
 L.savingRules.settings('laptop');h.flush();assert.equal(h.document.getElementById('saving-kind').value,'fixed');assert.equal(h.document.getElementById('saving-value').value,'20');
 h.set('saving-value','35');L.closeTask();h.flushHistory();h.flush();L.savingRules.settings('laptop');h.flush();assert.equal(h.document.getElementById('saving-value').value,'35');assert.equal(JSON.stringify(L.state.savingPrompts.rule),saved);assert.deepEqual(h.errors,[]);
});
check('saving or removing a preference clears the completed form cache for the same Box',()=>{
 const h=fixture(),{L}=h;rule(h);L.savingRules.settings('laptop');h.flush();h.set('saving-kind','percent');h.set('saving-value','10');submit(h);h.flushHistory();h.flush();
 L.savingRules.settings('laptop');h.flush();assert.equal(h.document.getElementById('saving-kind').value,'percent');assert.equal(h.document.getElementById('saving-value').value,'10');
 L.savingRules.remove();h.flushHistory();h.flush();L.savingRules.settings('laptop');h.flush();assert.equal(h.document.getElementById('saving-enabled').checked,false);assert.equal(h.document.getElementById('saving-kind').value,'fixed');assert.equal(h.document.getElementById('saving-value').value,'20');assert.equal(L.state.balance,500);assert.equal(L.state.goals[0].allocated,100);assert.deepEqual(h.errors,[]);
});
check('repeat confirmed bank funding surfaces saving before Done without reopening Budget setup',()=>{
 const h=fixture(),{L}=h;
 L.state.planHorizon={mode:'date',date:'2030-01-01'};L.openTab('home');h.flushHistory();h.flush();
 const earlier=credit(h);L.openIncomePlan(earlier.id);L.keepIncomeBudget();h.flushHistory();h.flush();
 assert(L.budgetEveryday.reviewedActive());rule(h);
 L.openFunding('home');L.startBankFunding();h.set('bank-test-amount','100');L.simulateBankReceipt();h.flush();
 assert.equal(L.route,'bankAdd');const t=L.state.txs[0];
 assert.equal(t.status,'success');assert(L.savingRules.suggestion(t.id).eligible);
 assert(text(h).includes('Put GH₵20.00 in Laptop?'));assert(text(h).includes('Review transfer'));assert(text(h).includes('Not now'));
 assert.equal(view(h).querySelectorAll('[aria-label="Optional saving prompt"]').length,1);
 assert.equal(L.state.balance,700);assert.equal(L.state.goals[0].allocated,100);assert.equal(L.state.paymentDraft,null);
 L.fundingDone();h.flushHistory();h.flush();assert.equal(L.route,'home');assert.equal(L.state.essentials[0].amount,250);
 L.go('txDetail',{id:t.id});h.flush();assert(text(h).includes('Review transfer'));
 const skip=view(h).querySelectorAll('button').find(b=>b.textContent.trim()==='Not now');assert(skip);skip.click();h.flush();
 assert(!text(h).includes('Review transfer'));L.go('bankAdd');h.flush();assert(!text(h).includes('Review transfer'));assert.equal(L.state.balance,700);assert.equal(L.state.goals[0].allocated,100);assert.deepEqual(h.errors,[]);
});
check('repeat confirmed MoMo funding offers one separately authorised saving transfer',()=>{
 const h=fixture(),{L}=h;
 L.state.planHorizon={mode:'date',date:'2030-01-01'};L.openTab('home');h.flushHistory();h.flush();
 const earlier=credit(h);L.openIncomePlan(earlier.id);L.keepIncomeBudget();h.flushHistory();h.flush();rule(h);
 L.openFunding('home');L.startMomoFunding();h.set('funding-amount',100);h.document.getElementById('funding-owned').checked=true;L.reviewMomoFunding();L.requestMomoFunding();h.flush();
 assert.equal(L.route,'momoAdd');assert.equal(L.state.txs[0].status,'pending');assert(!text(h).includes('Optional saving prompt'));assert(!text(h).includes('Review transfer'));
 L.fundingOutcome('success');h.flush();const t=L.state.txs[0];assert.equal(L.route,'momoAdd');assert(text(h).includes('Review transfer'));
 const action=view(h).querySelectorAll('button').find(b=>b.textContent.trim()==='Review transfer');assert(action);action.click();h.flush();
 assert.equal(L.route,'allocate');assert.equal(L.state.balance,700);assert.equal(L.state.goals[0].allocated,100);assert.equal(L.state.txs.length,2);
 submit(h);authorise(h);assert.equal(L.state.balance,680);assert.equal(L.state.goals[0].allocated,120);assert.equal(L.state.txs.length,3);
 L.go('txDetail',{id:t.id});h.flush();assert(!text(h).includes('Review transfer'));assert.deepEqual(h.errors,[]);
});
check('pending, failed and already-handled receipts never show a saving action on results or receipts',()=>{
 const h=fixture(),{L}=h;rule(h);
 for(const status of ['pending','failed']){
  const t={id:L.id('in'),type:'in',name:'Incoming money',amount:100,fee:0,date:new Date().toISOString(),status,method:'GIP incoming'};L.state.txs.unshift(t);
  L.state.bankFunding={id:L.id('BF'),txId:t.id};L.go('bankAdd');h.flush();assert(!text(h).includes('Review transfer'));
  L.go('txDetail',{id:t.id});h.flush();assert(!text(h).includes('Review transfer'));
 }
 const t=credit(h);L.savingRules.skip(t.id);L.go('txDetail',{id:t.id});h.flush();assert(!text(h).includes('Review transfer'));assert.equal(L.state.goals[0].allocated,100);assert.deepEqual(h.errors,[]);
});
check('funding inside a payment keeps the payment action in focus, with saving available later on the receipt',()=>{
 const h=fixture(),{L}=h;rule(h);const t=credit(h);
 L.state.fundingReturn='paymentReview';L.state.bankFunding={id:L.id('BF'),txId:t.id};L.go('bankAdd');h.flush();
 assert(text(h).includes('Return to payment'));assert(!text(h).includes('Review transfer'));
 L.state.fundingReturn=null;L.go('txDetail',{id:t.id});h.flush();assert(text(h).includes('Review transfer'));assert.equal(L.state.paymentDraft,null);assert.deepEqual(h.errors,[]);
});
check('fixed and percentage preferences validate limits, decimals and real active boxes',()=>{
 const h=fixture(),api=h.L.savingRules;
 for(const value of [0,-2,5000.01,'1.234','no'])assert.equal(api.validate({kind:'fixed',value,boxId:'laptop'}).ok,false);
 for(const value of [0,100.01,'5.678'])assert.equal(api.validate({kind:'percent',value,boxId:'laptop'}).ok,false);
 for(const value of [.01,100])assert.equal(api.validate({kind:'percent',value,boxId:'laptop'}).ok,true);
 assert.equal(api.validate({kind:'fixed',value:20,boxId:'invented'}).ok,false);h.L.state.goals[0].archived=true;assert.equal(api.validate({kind:'fixed',value:20,boxId:'laptop'}).ok,false);
});
check('percentage uses confirmed receipt and cents, never expected allowance',()=>{
 const h=fixture();rule(h,{kind:'percent',value:12.5});const t=credit(h,81.12),p=h.L.savingRules.suggestion(t.id);assert.equal(p.amount,10.14);assert(p.eligible);assert.equal(h.L.state.balance,581.12);
 rule(h,{kind:'percent',value:100});const next=credit(h,10.01);assert.equal(h.L.savingRules.suggestion(next.id).amount,10.01);
});
check('only external confirmed incoming money can produce a prompt',()=>{
 const h=fixture();rule(h);const invalid=[{status:'pending'},{status:'failed'},{type:'out'},{internalTransfer:true},{type:'internal'},{migration:true},{originalId:'refund-original'},{category:'Refunds'},{sharedExpenseRepayment:true}];
 for(const extra of invalid){const t={id:h.L.id('invalid'),type:'in',status:'success',amount:30,...extra};h.L.state.txs.unshift(t);assert.equal(h.L.savingRules.suggestion(t.id).eligible,false);assert.equal(h.L.savingRules.cta(t.id),'');}
});
check('setting up a rule does not reinterpret old receipts; current receipt opt-in is explicit',()=>{
 const h=fixture(),t=credit(h);rule(h);assert.equal(h.L.savingRules.suggestion(t.id).reason,'before-rule');
 const result=h.L.savingRules.configure({enabled:true,kind:'fixed',value:20,boxId:'laptop'},t.id);assert(result.ok);assert(h.L.savingRules.suggestion(t.id).eligible);assert.equal(h.L.state.txs.length,1);
});
check('insufficient receipt or Budget room produces one explanation and no queued debit',()=>{
 const h=fixture();rule(h,{value:100});const small=credit(h,10);assert.equal(h.L.savingRules.suggestion(small.id).reason,'receipt-limit');
 h.L.state.balance=350;const t=credit(h,20);const p=h.L.savingRules.suggestion(t.id);assert.equal(p.reason,'receipt-limit');
 rule(h,{value:20});const next=credit(h,20);h.L.state.balance=355;assert.equal(h.L.savingRules.suggestion(next.id).reason,'budget');assert(h.L.savingRules.cta(next.id).includes('save up to'));assert.equal(h.L.savingRules.open(next.id),false);assert.equal(h.L.state.paymentDraft,null);assert.deepEqual(Object.keys(h.L.state.savingPrompts.handled),[]);
 h.L.state.balance=300;assert(h.L.savingRules.suggestion(next.id).message.includes('already short'));assert.equal(h.L.state.goals[0].allocated,100);
});
check('review and separate authentication precede a conserving operational-to-savings move',()=>{
 const h=fixture(),{L}=h;rule(h);const t=credit(h,100),before=L.accountBalances().total;reviewPrompt(h,t);assert.equal(L.state.balance,600);assert.equal(L.state.goals[0].allocated,100);assert.equal(L.state.txs.length,1);authorise(h);
 assert.equal(L.state.balance,580);assert.equal(L.state.goals[0].allocated,120);assert.equal(L.accountBalances().total,before);assert.equal(L.balances().room,230);assert.equal(L.state.savingPrompts.handled[t.id].status,'success');assert.equal(L.savingRules.suggestion(t.id).reason,'handled');assert.equal(L.savingRules.cta(t.id),'');
 L.authorizePayment();assert.equal(L.state.txs.length,2);assert.equal(L.accountBalances().total,before);
});
check('repeated prompt taps resume one draft and skip never moves money or reoffers it',()=>{
 const h=fixture(),{L}=h;rule(h);const t=credit(h);L.savingRules.open(t.id);const id=L.state.paymentDraft.id;L.savingRules.open(t.id);assert.equal(L.state.paymentDraft.id,id);assert.equal(L.state.txs.length,1);L.savingRules.skip(t.id);assert.equal(L.state.paymentDraft,null);assert.equal(L.savingRules.suggestion(t.id).reason,'handled');assert.equal(L.state.balance,600);
});
check('one receipt cannot create a concurrent saving draft while another is in review',()=>{
 const h=fixture(),{L}=h;rule(h);const a=credit(h),b=credit(h);L.savingRules.open(a.id);const id=L.state.paymentDraft.id;assert.equal(L.savingRules.open(b.id),false);assert.equal(L.state.paymentDraft.id,id);assert.equal(L.state.savingPrompts.handled[b.id],undefined);
});
check('editing a contribution cannot consume planned money and keeps entered value',()=>{
 const h=fixture(),{L}=h;rule(h);const t=credit(h,300);L.state.balance=400;L.savingRules.open(t.id);h.set('allocation',80);submit(h);assert.equal(L.route,'allocate');assert.equal(h.document.getElementById('allocation').value,'80');assert(text(h).includes('save up to'));assert.equal(L.state.balance,400);assert.equal(L.state.txs.length,1);
 h.set('allocation',40);submit(h);authorise(h);assert.equal(L.state.balance,360);assert.equal(L.state.goals[0].allocated,140);assert.equal(L.balances().room,10);
});
check('a changed Budget at authorisation returns for editing without a debit',()=>{
 const h=fixture(),{L}=h;rule(h,{value:80});const t=credit(h);reviewPrompt(h,t);L.continuePayment();h.flush();assert.equal(L.route,'authorize');L.state.essentials[0].amount=550;h.set('payment-pin','123456');L.authorizePayment();assert.equal(L.route,'allocate');assert(text(h).includes('already short'));assert.equal(L.state.txs.length,1);assert.equal(L.state.balance,600);assert.equal(L.state.paymentDraft.reviewFingerprint,null);
});
for(const outcome of ['Pending','Failed'])check(outcome+' saving does not increase savings; source receipt is not offered twice',()=>{
 const h=fixture(),{L}=h;rule(h);const t=credit(h);reviewPrompt(h,t);authorise(h,outcome);const transfer=L.state.txs[0];assert.equal(L.state.goals[0].allocated,100);assert.equal(L.state.balance,600);assert.equal(L.savingRules.suggestion(t.id).reason,'handled');assert.equal(L.savingRules.progress('laptop').milestones.length,0);
 if(outcome==='Pending'){L.resolveTx(transfer.id,'success');assert.equal(L.state.balance,580);assert.equal(L.state.goals[0].allocated,120);L.resolveTx(transfer.id,'success');assert.equal(L.state.balance,580);assert.equal(L.state.savingPrompts.handled[t.id].status,'success');}
 else {L.retryMoneyBoxTransfer(transfer.id);assert.equal(L.route,'allocate');assert.notEqual(L.state.paymentDraft.id,transfer.draftId);assert.equal(L.state.paymentDraft.submittedTxId,undefined);submit(h);authorise(h);assert.equal(L.state.goals[0].allocated,120);}
});
check('editing or removing a prompt invalidates any unsubmitted saving authorisation',()=>{
 const h=fixture(),{L}=h;rule(h);const t=credit(h);reviewPrompt(h,t);L.continuePayment();const old=L.state.paymentDraft;rule(h,{value:30});assert.equal(L.state.paymentDraft,null);assert.equal(L.state.savingPrompts.handled[t.id].status,'skipped');assert.equal(old.submittedTxId,undefined);assert.equal(L.state.balance,600);
 const next=credit(h);L.savingRules.open(next.id);L.savingRules.remove();assert.equal(L.state.paymentDraft,null);assert.equal(L.savingRules.hasRule(),false);assert.equal(L.state.goals[0].allocated,100);
});
check('actual confirmed deposits create each milestone once; withdrawals and reopening do not',()=>{
 const h=fixture(),{L}=h;L.state.goals[0].target=400;L.transferMoneyBox({id:'laptop',direction:'in',amount:100,draftId:'manual-one'});assert.deepEqual(Array.from(L.savingRules.progress('laptop').milestones,x=>x.percent),[50]);
 L.transferMoneyBox({id:'laptop',direction:'in',amount:100,draftId:'manual-one'});assert.equal(L.savingRules.progress('laptop').milestones.length,1);L.transferMoneyBox({id:'laptop',direction:'out',amount:50,draftId:'manual-out'});L.transferMoneyBox({id:'laptop',direction:'in',amount:50,draftId:'manual-two'});assert.equal(L.savingRules.progress('laptop').milestones.length,1);
 const pending=L.transferMoneyBox({id:'laptop',direction:'in',amount:100,draftId:'manual-pending',status:'pending'});assert.equal(L.savingRules.progress('laptop').milestones.length,1);L.resolveTx(pending.id,'success');assert.deepEqual(Array.from(L.savingRules.progress('laptop').milestones,x=>x.percent),[50,75]);
 L.go('savingMilestones',{id:'laptop'});const before=L.savingRules.progress('laptop').milestones.length;L.render();L.render();assert.equal(L.savingRules.progress('laptop').milestones.length,before);assert(text(h).includes('Saved now'));assert(text(h).includes('GH₵300.00'));
});
check('reversing a withdrawal restores savings without inventing a new contribution milestone',()=>{
 const h=fixture(),{L}=h;L.state.goals[0].target=400;
 const withdrawal=L.transferMoneyBox({id:'laptop',direction:'out',amount:80,draftId:'withdraw-before-reverse'});
 assert.equal(L.state.goals[0].allocated,20);const total=L.accountBalances().total;
 const reversal=L.reverseMoneyBoxTransfer(withdrawal.id);assert.equal(L.state.goals[0].allocated,100);assert.equal(L.accountBalances().total,total);assert.equal(reversal.originalId,withdrawal.id);assert.equal(L.savingRules.progress('laptop').milestones.length,0);
 L.go('savingMilestones',{id:'laptop'});assert(!text(h).includes('25% reached'));assert(text(h).includes('GH₵100.00'));
});
check('incoming saving requires no partner code, while existing protected withdrawal stays guarded',()=>{
 const h=fixture(),{L}=h,invitation=L.boxProtection.beginInvite('laptop',{phone:'0241112222'});L.boxProtection.acceptInvitation(invitation.id,invitation.code);rule(h);const before=JSON.stringify(L.boxProtection.get('laptop'));const t=credit(h);reviewPrompt(h,t);assert(!text(h).includes('partner code'));authorise(h);assert.equal(JSON.stringify(L.boxProtection.get('laptop')),before);
 L.finishPayment();L.startMoneyBoxTransfer('laptop','out');h.set('release',20);submit(h);assert(text(h).includes('Partner approval'));L.continuePayment();assert.equal(L.route,'paymentReview');assert.equal(L.state.txs.length,2);
});
console.log(passed+' saving prompt checks passed.');
