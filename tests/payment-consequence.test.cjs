/* The prospective consequence explains the existing engine without moving money. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const dist=path.resolve(__dirname,'../dist');
const modules=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
if(!modules.includes('payment-consequence.js'))modules.push('payment-consequence.js');
const settle=h=>{h.flushHistory();h.flush();};
const view=h=>h.document.getElementById('view');
const facts=L=>JSON.stringify([L.state.balance,L.state.txs,L.state.essentials,L.state.goals,L.state.accounts]);
const nextDate=days=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
function fixture(){
 const h=createHarness({clock:true,testing:true,modules}),L=h.L;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:720,txs:[],paymentDraft:null,chats:[],planSaved:true,planDraft:null,
  planHorizon:{mode:'date',date:nextDate(14)},allowance:{amount:9999,date:nextDate(15)},
  essentials:[{id:'food',name:'Food',amount:180,paid:0,externalPaid:0,coverageVersion:1},{id:'transport',name:'Transport',amount:100,paid:0,externalPaid:0,coverageVersion:1},{id:'data',name:'Data',amount:40,paid:0,externalPaid:0,coverageVersion:1}],
  goals:[{id:'laptop',name:'Laptop',allocated:200,target:3500,boxVersion:2}]});
 L.save();L.openTab('home');L.render();settle(h);return h;
}
const draft=(h,amount=80,essentialId='')=>{
 h.L.go('campusPay');h.L.pickMerchant('AK01');h.set('payment-amount',String(amount));h.set('payment-essential',essentialId);h.L.preparePayment();settle(h);return h.L.state.paymentDraft;
};
const consequence=h=>view(h).querySelector('[data-payment-consequence]');
const clean=h=>assert.deepEqual(h.errors,[]);
let passed=0;const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};

check('the summary uses the same engine and remains a read-only explanation',()=>{
 const h=fixture(),L=h.L,d={method:'lumo',name:'Abena',destination:'@abena.a',amount:80,fee:0,essentialId:''},before=facts(L),p=L.planImpactSummary(d),s=L.paymentConsequence.summary(d);
 assert.equal(s.room,p.room);assert.equal(s.availableAfter,p.after);assert.equal(s.room,320);assert.equal(s.text,'GH₵320.00 left after budget.');assert.equal(s.label,'After this payment');assert.equal(facts(L),before);clean(h);
});
check('Review and authorisation retain one consequence beside the unchanged current balance',()=>{
 const h=fixture(),L=h.L;draft(h);assert.equal(L.route,'paymentReview');let row=consequence(h);assert(row);assert.equal(view(h).querySelectorAll('[data-payment-consequence]').length,1);assert.match(row.textContent,/GH₵320\.00 left after budget/);assert.equal(view(h).querySelector('[data-payment-available-value]').textContent,'GH₵720.00');
 const before=facts(L);L.continuePayment();settle(h);assert.equal(L.route,'authorize');row=consequence(h);assert(row);assert.match(row.textContent,/GH₵320\.00 left after budget/);L.render();settle(h);assert.equal(view(h).querySelectorAll('[data-payment-consequence]').length,1);assert.equal(facts(L),before);clean(h);
});
check('a linked Budget payment fulfils its cost once while fees still use spare room',()=>{
 const h=fixture(),L=h.L,d={method:'momo',amount:80,fee:.5,essentialId:'food'},before=facts(L),s=L.paymentConsequence.summary(d);
 assert.equal(s.room,399.5);assert.equal(s.availableAfter,639.5);assert.equal(s.impact.essentialCovered,80);assert.equal(s.impact.essentialsAfter,240);assert.equal(s.text,'GH₵399.50 left after budget.');assert.equal(facts(L),before);clean(h);
});
check('pending money, fees and missing or ended dates remain honest',()=>{
 const h=fixture(),L=h.L;L.state.txs=[{id:'pending',type:'out',status:'pending',amount:20,fee:1,essentialId:''}];const d={method:'bank',amount:80,fee:1};
 assert.equal(L.paymentConsequence.summary(d).room,298);
 L.state.planHorizon={mode:'unspecified',date:''};let s=L.paymentConsequence.summary(d);assert.equal(s.text,'GH₵298.00 after saved costs.');assert.equal(s.datesNeedReview,false);
 L.state.planHorizon={mode:'date',date:nextDate(-1)};s=L.paymentConsequence.summary(d);assert.equal(s.periodStatus,'ended');assert.equal(s.datesNeedReview,true);assert.match(s.text,/after saved costs/);assert(!s.text.includes('left after budget'));clean(h);
});
check('an uncovered Budget and insufficient funds never look like spare spending money',()=>{
 const h=fixture(),L=h.L,d={method:'lumo',amount:80,fee:0};L.state.balance=350;let s=L.paymentConsequence.summary(d);assert.equal(s.tone,'shortfall');assert.equal(s.shortfall,50);assert.equal(s.text,'GH₵50.00 of your budget would be uncovered.');
 L.state.balance=50;s=L.paymentConsequence.summary(d);assert.equal(s.tone,'funding');assert.equal(s.label,'Before you can pay');assert.equal(s.text,'GH₵30.00 more needed.');clean(h);
});
check('no Budget means available money, without pretending that future income is available',()=>{
 const h=fixture(),L=h.L;L.state.essentials=[];const s=L.paymentConsequence.summary({method:'lumo',amount:80,fee:0});assert.equal(s.hasBudget,false);assert.equal(s.text,'GH₵640.00 available · no budget set.');assert.equal(s.availableAfter,640);assert(!s.text.includes('budget stays covered'));clean(h);
});
check('Money Box transfers and card top-ups retain their separate funding meaning',()=>{
 const h=fixture(),L=h.L,before=facts(L);
 let s=L.paymentConsequence.summary({method:'box',boxId:'laptop',boxDirection:'out',amount:80,fee:0});assert.equal(s.label,'After this transfer');assert.equal(s.text,'GH₵800.00 available in Everyday money.');
 s=L.paymentConsequence.summary({method:'box',boxId:'laptop',boxDirection:'in',amount:80,fee:0});assert.equal(s.text,'GH₵320.00 left after budget in Everyday money.');
 s=L.paymentConsequence.summary({method:'virtualCardCreate',amount:80,fee:0});assert.equal(s.label,'After this top-up');assert.equal(s.text,'GH₵320.00 left after budget in Everyday money.');
 assert.equal(L.paymentConsequence.summary({method:'card',fundingAccount:'virtual-card',amount:80,fee:0}),null);assert.equal(facts(L),before);clean(h);
});
check('invalid, closed, submitted and unavailable-source records cannot receive a projection',()=>{
 const h=fixture(),L=h.L;
 for(const d of [null,{amount:''},{amount:-1},{amount:NaN},{amount:Infinity},{amount:.001},{amount:5001},{amount:80,fee:-1},{amount:80,submittedTxId:'done'},{amount:80,essentialId:'missing'},{method:'box',boxId:'missing',amount:80}])assert.equal(L.paymentConsequence.summary(d),null);
 for(const state of [{...L.state,onboarded:false},{...L.state,locked:true},{...L.state,closed:true}])assert.equal(L.paymentConsequence.summary({amount:80},state),null);clean(h);
});
check('changing money at authorisation refreshes the explanation and still forces review',()=>{
 const h=fixture(),L=h.L;draft(h);L.continuePayment();settle(h);assert.equal(L.route,'authorize');L.state.balance-=50;L.render();settle(h);assert.match(consequence(h).textContent,/GH₵270\.00 left after budget/);
 const before=facts(L);h.set('payment-pin','123456');L.authorizePayment();settle(h);assert.notEqual(L.route,'paymentResult');assert.equal(L.state.txs.length,0);assert.equal(L.state.balance,670);assert.equal(facts(L),before);clean(h);
});
check('the same consequence remains visible during an optional biometric demo',()=>{
 const h=fixture(),L=h.L;draft(h);L.continuePayment();settle(h);L.biometricPayment.open();settle(h);assert.equal(L.route,'authorize');assert(view(h).querySelector('.biometric-prompt'));assert.equal(view(h).querySelectorAll('[data-payment-consequence]').length,1);assert.match(consequence(h).textContent,/GH₵320\.00/);assert.equal(L.state.balance,720);assert.equal(L.state.txs.length,0);clean(h);
});
console.log(passed+' payment consequence checks passed.');
