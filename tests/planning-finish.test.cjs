/* Finished planning tasks use truthful recovery, precise errors and the same
   money/mandate rules. Mounted against the final shipped script order. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const modules=[...fs.readFileSync(path.resolve(__dirname,'../dist/index.html'),'utf8').matchAll(/<script\b[^>]*\bsrc="\/([^"?]+)(?:\?[^" ]*)?"/g)].map(m=>m[1]);
const view=h=>h.document.getElementById('view'),text=h=>view(h).textContent;
const settle=h=>{h.flushHistory();h.flush();};
const financial=L=>JSON.stringify({balance:L.state.balance,accounts:L.state.accounts,txs:L.state.txs,essentials:L.state.essentials,goals:L.state.goals,period:L.state.planHorizon});
const money=L=>JSON.stringify({balance:L.state.balance,txs:L.state.txs,boxes:L.state.goals.map(g=>[g.id,g.allocated])});
const setupEntries=d=>JSON.stringify(d&&{step:d.step,essentials:d.essentials,goals:d.goals,allowance:d.allowance,planHorizon:d.planHorizon,essentialFields:d.essentialFields});
const clean=h=>assert.deepEqual(h.errors,[]);
function fixture(options={}){
 const h=createHarness({clock:true,testing:true,modules,...options}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:600,txs:[],requests:[],chats:[],paymentDraft:null,planDraft:null,budgetCycleDraft:null,budgetHistoryDraft:null,budgetCycle:null,budgetPeriodRecord:null,budgetPeriodReviewDraft:null,groupMoney:undefined,savingHacks:undefined,savingsHackSetup:undefined,moneyBoxDraft:undefined,moneyBoxProtection:undefined,moneyBoxProtectionFlow:undefined,
 essentials:[{id:'food',name:'Food',amount:250,paid:0,externalPaid:0,coverageVersion:1},{id:'transport',name:'Transport',amount:100,paid:0,externalPaid:0,coverageVersion:1}],goals:[{id:'laptop',name:'Laptop',allocated:100,target:1000,boxVersion:2}],planSaved:true,planHorizon:{mode:'unspecified',date:''},allowance:{amount:0,date:'',source:'Family'}});
 L.route='home';L.params={};L.history=[];L.save();L.render();settle(h);return h;
}
function history(h){
 const {L}=h,s=L.budgetHistory.summary();L.state.accounts.createdAt=new Date(s.start-86400000).toISOString();
 for(let i=0;i<4;i++)for(const [category,amount]of [['Food',80],['Transport',40]])L.state.txs.push({id:category+i,type:'out',status:'success',category,amount,fee:0,name:category,date:new Date(s.start+i*7*86400000+3600000).toISOString()});
}
function click(h,label){const b=view(h).querySelectorAll('button').find(b=>b.textContent.trim()===label);assert(b,'Actual '+label+' on '+h.L.route);b.click();settle(h);}
let passed=0;const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};

check('a stale suggestion entry has a working fresh recovery and does not save costs on view',()=>{
 const h=fixture(),{L}=h;history(h);const before=financial(L);L.go('budgetHistory');settle(h);
 assert.match(text(h),/No suggestion to continue/);assert.equal(L.state.budgetHistoryDraft,null);assert.equal(financial(L),before);
 click(h,'Prepare a suggestion');assert.equal(L.route,'budgetHistory');assert(L.state.budgetHistoryDraft);assert.equal(financial(L),before);assert.match(text(h),/weekly starting point/);clean(h);
});

check('missing suggestions resume real setup/cycle drafts and pending payments offer a safe return',()=>{
 for(const kind of ['setup','cycle','pending']){
  const h=fixture(),{L}=h;
  if(kind==='setup')L.state.planDraft={step:'firstEssentials',essentials:[],goals:[],allowance:{amount:0,date:''},planHorizon:{mode:'unspecified',date:''},essentialFields:{name:'Food',amount:'30'}};
  if(kind==='cycle')L.openBudgetCycle();
  if(kind==='pending')L.state.txs.push({id:'pending',type:'out',status:'pending',essentialId:'food',amount:10,fee:0,name:'Food',date:new Date(h.context.Date.now()).toISOString()});
  const before=financial(L),setup=setupEntries(L.state.planDraft),cycle=JSON.stringify(L.state.budgetCycleDraft);L.go('budgetHistory');settle(h);
  if(kind==='pending'){assert.match(text(h),/pending/);click(h,'Back to Budget');assert.equal(L.route,'plan');}
  else {assert.match(text(h),/Continue your Budget draft/);click(h,'Continue Budget draft');assert.equal(L.route,kind==='setup'?'firstEssentials':'budgetCycle');}
  assert.equal(financial(L),before);assert.equal(setupEntries(L.state.planDraft),setup);assert.equal(JSON.stringify(L.state.budgetCycleDraft),cycle);assert.equal(L.state.budgetHistoryDraft,null);clean(h);
 }
});

check('explicit Budget recovery waits for deferred native close while Close retains its own parent',()=>{
 for(const parent of ['home','plan']){
  const h=fixture({deferHistory:true}),{L}=h;L.openTab(parent);settle(h);L.state.txs.push({id:'pending-return',type:'out',status:'pending',essentialId:'food',amount:10,fee:0,name:'Lunch',date:new Date(h.context.Date.now()).toISOString()});const before=financial(L);
  L.go('budgetHistory');settle(h);const back=view(h).querySelectorAll('button').find(b=>b.textContent.trim()==='Back to Budget');assert(back);back.click();
  assert(h.history.pending>0,'The native close has not settled');assert.equal(L.route,parent,'Explicit destination is queued behind native close');settle(h);assert.equal(L.route,'plan');assert.equal(h.history.state.route,'plan');assert.equal(L.taskSheet.active,false);assert.equal(financial(L),before);
  L.openTab(parent);settle(h);L.go('budgetHistory');settle(h);
  // Signal removes generic page Close buttons; this check covers the native whole-journey exit.
  if(L.signalEdition){L.closeTask();settle(h);}else click(h,'Close');assert.equal(L.route,parent);assert.equal(h.history.state.route,parent);assert.equal(financial(L),before);clean(h);
 }
});

check('a later selected history error focuses that row even when the first row is unchecked',()=>{
 const h=fixture(),{L}=h;history(h);L.budgetHistory.open();settle(h);const before=financial(L);
 h.set('history-include-0',false);h.set('history-amount-1','-5');assert.equal(L.budgetHistory.useDraft(),false);
 assert.equal(L.route,'budgetHistory');assert.equal(h.document.activeElement.id,'history-amount-1');assert.equal(h.document.getElementById('history-amount-1').getAttribute('aria-invalid'),'true');assert.notEqual(h.document.getElementById('history-amount-0').getAttribute('aria-invalid'),'true');assert.equal(h.document.getElementById('history-amount-1').value,'-5');assert.equal(financial(L),before);clean(h);
});

check('cycle amount/date errors identify the invalid control and preserve the saved Budget',()=>{
 const h=fixture(),{L}=h;L.openBudgetCycle();settle(h);const before=financial(L);
 h.set('cycle-include-0',false);h.set('cycle-amount-1','10.001');L.reviewBudgetCycle();
 assert.equal(L.route,'budgetCycle');assert.equal(h.document.activeElement.id,'cycle-amount-1');assert.equal(h.document.getElementById('cycle-amount-1').getAttribute('aria-invalid'),'true');assert.notEqual(h.document.getElementById('cycle-end').getAttribute('aria-invalid'),'true');assert.equal(h.document.getElementById('cycle-amount-1').value,'10.001');
 h.set('cycle-amount-1','100');h.set('cycle-end','2020-01-01');L.reviewBudgetCycle();assert.equal(h.document.activeElement.id,'cycle-end');
 h.set('cycle-end',L.state.budgetCycleDraft.start);h.set('cycle-start','');L.reviewBudgetCycle();assert.equal(h.document.activeElement.id,'cycle-start');assert.equal(financial(L),before);
 const actions=view(h).querySelector('form .actions');assert(actions);assert.equal(actions.querySelectorAll('button').length,3);clean(h);
});

check('empty collection payments describe mandate acceptance, funding and member authority accurately',()=>{
 const h=fixture(),{L}=h,G=L.groupMoney,deadline=new Date(h.context.Date.now()+86400000).toISOString().slice(0,10),created=G.createCollection({title:'Trip',target:'600',deadline,members:[{id:'abena',name:'Abena'},{id:'kojo',name:'Kojo'}],mandateApproval:'majority',acceptMandate:true,idempotencyKey:'finish-trip'});assert(created.ok,created.error);const item=created.item,before=money(L);
 L.gm.openPayments(item.id);settle(h);assert.match(text(h),/after every member accepts/);assert(!text(h).includes('Pay from collection'));
 for(const p of item.people.filter(p=>!p.isOwner))assert(G.acceptMandate({itemId:item.id,personId:p.id,version:item.mandate.version,sample:true}).ok);
 L.render();settle(h);assert.match(text(h),/Contributions are needed/);assert(!text(h).includes('Pay from collection'));
 assert(G.recordSamplePayment({itemId:item.id,personId:'abena',amount:'40',reference:'finish-funding'}).ok);L.render();settle(h);assert.match(text(h),/Request a payout for the group/);assert(text(h).includes('Pay from collection'));
 for(const scenario of ['contributor','approver']){
  const invitation=G.createSampleInvitation({scenario,idempotencyKey:'finish-'+scenario});assert(invitation.ok,invitation.error);const s=G.invitationSummary(invitation.invitation.id),joined=G.acceptInvitation({invitationId:s.id,version:s.mandate.version,fingerprint:s.fingerprint});assert(joined.ok,joined.error);joined.item.proposals=[];joined.item.disbursements=[];
  L.gm.openPayments(joined.item.id);settle(h);assert.match(text(h),/Payout requests will appear here for you to follow/);assert(!text(h).includes('Pay from collection'));assert.equal(G.access(joined.item).canPropose,false);
 }
 assert(G.cancel(item.id).ok);L.gm.openPayments(item.id);settle(h);assert.match(text(h),/collection is closed/);assert(!text(h).includes('Pay from collection'));assert.equal(money(L),before);clean(h);
});

check('empty filters explain the selected split or collection without changing creation routes',()=>{
 const h=fixture(),{L}=h;L.go('groupMoneyList',{filter:'split'});settle(h);assert.match(text(h),/No splits yet/);assert.match(text(h),/expense you already paid/);assert(!text(h).includes('join a collection invitation'));
 L.go('groupMoneyList',{filter:'collection'});settle(h);assert.match(text(h),/No collections yet/);assert.match(text(h),/target or event/);click(h,'Collect');assert.equal(L.route,'groupMoneyHome');clean(h);
});

check('existing box updates return to the selected box while creation keeps its funding invitation',()=>{
 const h=fixture(),{L}=h,before=money(L);L.go('goalEdit',{id:'laptop'});settle(h);h.set('goalName','Course laptop');L.saveGoal();settle(h);
 assert.equal(L.route,'goal');assert.equal(L.params.id,'laptop');assert.match(text(h),/Course laptop/);assert.equal(money(L),before);
 L.go('goalEdit');settle(h);h.set('goalName','Emergency');h.set('goalTarget','');h.set('goalDate','');L.saveGoal();settle(h);const created=L.state.goals.find(g=>g.name==='Emergency');assert(created);assert.equal(L.route,'goals');assert.equal(L.params.savedGoalId,created.id);assert.match(text(h),/starts at GH₵0\.00/);assert(text(h).includes('Fund this box'));assert.equal(L.state.txs.length,0);clean(h);
});

check('compact active and paused hack facts identify the method while full mechanics stay below',()=>{
 const h=fixture(),{L}=h,before=money(L),startDate=new Date(h.context.Date.now()+86400000).toISOString().slice(0,10);
 for(const [kind,value,cadence,label]of [['income',10,'weekly','Income · 10%'],['spend',5,'weekly','Spending · 5%'],['roundup',1,'weekly','Roundups · GH₵1.00'],['fixed',10,'weekly','Weekly · GH₵10.00'],['fixed',12,'monthly','Monthly · GH₵12.00']]){
  const configured=L.savingsHacks.configure({boxId:'laptop',kind,value,cadence,startDate,monthlyCap:100,minBalance:50,consent:true});assert(configured.ok,configured.message);L.go('goal',{id:'laptop'});settle(h);
  const controls=view(h).querySelector('.sh-priority-control'),details=view(h).querySelector('.savings-hack-details');assert(controls.textContent.includes(label));assert(!controls.textContent.includes('Limits:'));assert(details.textContent.includes('Limits:'));assert(!details.querySelector('.sh-info').hasAttribute('open'));
  L.savingsHackUI.pause('laptop');settle(h);assert(view(h).querySelector('.sh-priority-control').textContent.includes(label));assert(text(h).includes('Paused'));
 }
 assert.equal(money(L),before);clean(h);
});

check('comparison-only dates and partner changes use their own task wording without moving money',()=>{
 const h=fixture(),{L}=h,before=money(L);L.budgetPeriodReview.open();L.budgetPeriodReview.dates();settle(h);assert.match(text(h),/Review through/);assert(!view(h).querySelector('label[for="budget-review-end"]').textContent.includes('Budget through'));
 L.boxProtection.beginInvite('laptop',{phone:'0241112222'});const invitation=L.boxProtection.get('laptop').invitation;L.boxProtection.acceptInvitation(invitation.id,invitation.code);
 L.go('goalEdit',{id:'laptop'});settle(h);h.set('goalPartner','0242223333');L.saveGoal();settle(h);assert.equal(L.route,'boxProtectionChange');assert.match(text(h),/code for this change/);assert(!text(h).includes('code for this transfer'));assert.equal(L.boxProtection.get('laptop').phone,'0241112222');
 L.startMoneyBoxTransfer('laptop','out');settle(h);h.set('release','20');const submit=view(h).querySelector('button[type="submit"]');assert(submit);submit.click();settle(h);assert.equal(L.route,'paymentReview');assert.match(text(h),/code for this transfer/);assert.equal(money(L),before);clean(h);
});
console.log(passed+' planning finish checks passed.');
