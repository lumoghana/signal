/* Budget presentation follows the shared ledger: confirmed spend, external
   coverage and pending reservations remain different facts. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const modules=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
if(!modules.includes('budget-readability.js'))modules.push('budget-readability.js');
let passed=0;
const check=(name,run)=>{run();passed++;console.log('PASS '+name);};
const view=h=>h.document.getElementById('view');
const settle=h=>{h.flushHistory();h.flush();};
function fixture(){
 const h=createHarness({modules,clock:true}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:500,txs:[],chats:[],paymentDraft:null,planDraft:null,budgetCycleDraft:null,budgetGuideSession:null,
  essentials:[{id:'food',name:'Food',budgetCategory:'food',amount:200,paid:0,externalPaid:0,coverageVersion:1},{id:'transport',name:'Transport',budgetCategory:'transport',amount:150,paid:0,externalPaid:0,coverageVersion:1}],
  goals:[],planSaved:true,planHorizon:{mode:'date',date:'2099-10-30'},allowance:{amount:9000,date:'2099-10-31',source:'Family'}});
 L.save();L.openTab('plan');settle(h);assert.deepEqual(h.errors,[]);return h;
}
function redraw(h,route='plan'){h.L.go(route);h.L.render();settle(h);}
const group=(h,id='food')=>h.L.budgetReadability.summary().groups.find(g=>g.id===id);
const clean=h=>assert.deepEqual(h.errors,[]);
const ledger=L=>JSON.stringify([L.state.balance,L.state.essentials,L.state.goals,L.state.txs,L.state.allowance]);
check('Plan starts with a collapsed accessible Budget-items disclosure and visible edit actions',()=>{
 const h=fixture(),before=ledger(h.L),disclosure=view(h).querySelector('[data-budget-items-disclosure]');
 assert(disclosure);assert(!disclosure.hasAttribute('open'));
 const summary=disclosure.querySelector('summary');assert.match(summary.textContent,/View Budget items/);assert.equal(summary.getAttribute('aria-controls'),'budget-items-panel');
 assert(disclosure.querySelector('#budget-items-panel [data-budget-line="food"]'));
 assert(view(h).querySelectorAll('button').some(b=>b.textContent.trim()==='Update budget'&&!b.closest('details')));
 assert.equal(ledger(h.L),before);clean(h);
});
check('expanded Budget items stay open after item detail and edit return, without persisting to another account',()=>{
 const h=fixture(),L=h.L;L.budgetReadability.rememberItems(true);L.render();settle(h);
 assert(view(h).querySelector('[data-budget-items-disclosure]').hasAttribute('open'));
 view(h).querySelector('[data-budget-line="food"]').click();settle(h);assert.equal(L.route,'budgetCategory');
 L.back();settle(h);assert.equal(L.route,'plan');assert(view(h).querySelector('[data-budget-items-disclosure]').hasAttribute('open'));
 L.budgetReadability.rememberItems(false);L.render();settle(h);assert(!view(h).querySelector('[data-budget-items-disclosure]').hasAttribute('open'));
 L.budgetReadability.rememberItems(true);L.explore();L.openTab('plan');settle(h);assert(!view(h).querySelector('[data-budget-items-disclosure]').hasAttribute('open'));clean(h);
});
check('Budget editing continues to show its items directly without a second disclosure',()=>{
 const h=fixture();redraw(h,'planEdit');assert(!view(h).querySelector('[data-budget-items-disclosure]'));assert(view(h).querySelector('[data-budget-line="food"]'));clean(h);
});
check('total Budget stays primary while every category shows budgeted, paid from Budget and remaining',()=>{
 const h=fixture(),{L}=h,before=ledger(L),row=view(h).querySelector('[data-budget-line="food"]');
 assert.match(view(h).querySelector('[data-budget-total]').textContent,/350/);
 assert.equal(row.querySelector('[data-budgeted]').textContent,'GH₵200.00');
 assert.equal(row.querySelector('[data-budget-spent]').textContent,'GH₵0.00 paid from Budget');
 assert.equal(row.querySelector('[data-budget-remaining]').textContent,'GH₵200.00 left');
 assert.equal(L.balances().room,150);assert.equal(ledger(L),before,'reading does not change ledger or include expected allowance');clean(h);
});
check('confirmed linked spending reduces remaining without changing the original Budget total',()=>{
 const h=fixture(),{L}=h;L.addTx({type:'out',status:'success',name:'Lunch',amount:60,essentialId:'food'});redraw(h);
 assert.equal(group(h).spent,60);assert.equal(group(h).remaining,140);assert.equal(group(h).total,200);
 assert.equal(L.state.balance,440);assert.equal(L.balances().room,150);
 const row=view(h).querySelector('[data-budget-line="food"]');assert.match(row.textContent,/GH₵60.00 paid from Budget/);assert.match(row.textContent,/GH₵140.00 left/);clean(h);
});
check('pending amounts are visible reservations and never added to confirmed spending',()=>{
 const h=fixture(),{L}=h;L.addTx({type:'out',status:'success',name:'Lunch',amount:60,essentialId:'food'});
 const pending=L.addTx({type:'out',status:'pending',name:'Dinner',amount:30,essentialId:'food'});redraw(h);
 assert.equal(group(h).spent,60);assert.equal(group(h).pending,30);assert.equal(group(h).remaining,110);
 const row=view(h).querySelector('[data-budget-line="food"]');assert.equal(row.querySelector('[data-budget-spent]').textContent,'GH₵60.00 paid from Budget');assert.equal(row.querySelector('[data-budget-pending]').textContent,'GH₵30.00 pending');
 L.resolveTx(pending.id,'failed');redraw(h);assert.equal(group(h).remaining,140);assert.equal(group(h).pending,0);assert.equal(group(h).spent,60);clean(h);
});
check('externally covered costs are labelled separately from confirmed spending',()=>{
 const h=fixture(),{L}=h;L.state.essentials[0].externalPaid=20;L.save();L.addTx({type:'out',status:'success',name:'Lunch',amount:60,essentialId:'food'});redraw(h);
 const g=group(h);assert.equal(g.spent,60);assert.equal(g.coveredElsewhere,20);assert.equal(g.remaining,120);
 assert.equal(view(h).querySelector('[data-budget-line="food"] [data-budget-external]').textContent,'GH₵20.00 covered elsewhere');clean(h);
});
check('a reversed purchase no longer appears as spent or fulfilled',()=>{
 const h=fixture(),{L}=h;const paid=L.addTx({type:'out',status:'success',name:'Lunch',amount:60,essentialId:'food'});
 const returned=L.addTx({type:'in',status:'success',name:'Refund',amount:60,originalId:paid.id});paid.status='reversed';paid.refundId=returned.id;paid.refunded=60;L.save();redraw(h);
 assert.equal(group(h).spent,0);assert.equal(group(h).remaining,200);assert.equal(L.state.balance,500);clean(h);
});
check('one shared Budget period remains visible and opens the working date editor',()=>{
 const h=fixture(),{L}=h,before=ledger(L),period=view(h).querySelector('[data-budget-period]');assert(period);assert.equal(period.closest('details'),null);assert.match(period.textContent,/Budget period/);assert.match(period.textContent,/Through 30 Oct 2099/);
 period.click();settle(h);assert.equal(L.route,'planPeriod');assert(h.document.getElementById('planPeriodMode'));assert.equal(ledger(L),before);
 L.back();settle(h);L.state.planHorizon={mode:'unspecified',date:''};L.save();redraw(h);const invite=view(h).querySelector('[data-budget-period]');assert.match(invite.textContent,/Add dates/);assert.equal(invite.getAttribute('aria-label'),'Add Budget dates');clean(h);
});
check('Edit Budget and category detail keep progress, dates and working edit/delete destinations',()=>{
 const h=fixture(),{L}=h;L.addTx({type:'out',status:'success',name:'Lunch',amount:60,essentialId:'food'});redraw(h,'planEdit');
 assert.equal(view(h).querySelector('[data-budget-period]').closest('details'),null);assert.match(view(h).querySelector('[data-budget-line="food"]').textContent,/GH₵140.00 left/);
 view(h).querySelector('[data-budget-line="food"]').click();settle(h);assert.equal(L.route,'budgetCategory');assert.equal(L.params.id,'food');assert.match(view(h).querySelector('[data-budget-line="food"]').textContent,/GH₵60.00 paid from Budget/);
 const edit=view(h).querySelectorAll('button').find(b=>b.textContent.trim()==='Edit');edit.click();settle(h);assert.equal(L.route,'essentialEdit');assert.equal(L.params.id,'food');assert(h.document.getElementById('essAmount'));clean(h);
});
check('legacy items group without changing their IDs, names or underlying dates',()=>{
 const h=fixture(),{L}=h;L.state.essentials.push({id:'old-lunch',name:'Lunch on campus',budgetCategory:'food',amount:25,paid:0,externalPaid:0,coverageVersion:1,date:'2099-10-28'});L.save();const before=ledger(L);redraw(h);
 const g=group(h);assert.equal(g.total,225);assert.equal(g.remaining,225);assert.equal(g.items.length,2);assert.equal(view(h).querySelectorAll('[data-budget-line]').length,2);assert.equal(ledger(L),before);clean(h);
});
console.log(passed+' Budget readability checks passed.');
