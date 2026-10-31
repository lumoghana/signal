/* Successful sign-in uses the shipped forms, navigation and privacy control.
   Saved payment drafts remain drafts; authentication never executes a payment. */
'use strict';
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let passed=0;
const check=(name,run)=>{run();passed++;console.log('PASS '+name);};
const view=h=>h.document.getElementById('view');
const settle=h=>{h.flushHistory();h.flush();};
const clean=h=>assert.deepEqual(h.errors,[]);
function fixture(){const h=createHarness({clock:true,deferHistory:true});h.L.explore();settle(h);return h;}
function click(h,label){const button=view(h).querySelectorAll('button').find(el=>el.textContent.trim()===label);assert(button,'Missing '+label+' on '+h.L.route);button.click();settle(h);}
function submit(h){const form=view(h).querySelector('form');assert(form,'Mounted form on '+h.L.route);h.submit(form);settle(h);}
function signin(h,pin='123456'){h.set('signPhone',h.L.state.profile.phone);h.set('signPin',pin);submit(h);}
function signout(h){h.L.openTab('more');settle(h);click(h,'Sign out');assert.equal(h.L.route,'actionConfirm');click(h,'Sign out');assert.equal(h.L.route,'welcome');assert.equal(h.L.state.locked,true);}
const money=L=>JSON.stringify([L.state.balance,L.state.accounts,L.state.txs,L.state.essentials,L.state.goals,L.state.virtualCards,L.state.paymentDraft,L.state.fundingDraft]);
function hiddenHome(h){
 const {L}=h;assert.equal(L.route,'home');assert.equal(L.state.locked,false);assert.equal(JSON.stringify(L.params),'{}');assert.equal(L.history.length,0);
 assert.equal(L.taskSheet.active,false);assert.equal(h.document.querySelectorAll('[role="dialog"]').length,0);assert.equal(h.document.getElementById('app').getAttribute('data-route'),'home');
 const eye=h.document.getElementById('balance-eye');assert(eye);assert.equal(eye.getAttribute('aria-label'),'Show balances');assert.equal(eye.getAttribute('aria-pressed'),'false');
 for(const id of ['overview-room','overview-balance','overview-savings']){const amount=h.document.getElementById(id);assert(amount,id);assert(amount.querySelector('.money-mask'),'Hidden '+id);assert(!/\d/.test(amount.textContent),'No visible amount in '+id);}
 const nav=h.document.getElementById('nav');assert.equal(nav.hidden,false);const selected=nav.querySelectorAll('[aria-current="page"]');assert.equal(selected.length,1);assert.equal(selected[0].textContent.trim(),'Home');assert.equal(L.hibiscusLastTab,'home');
 assert.equal(L.state.setup.signinReturn,null);assert.equal(L.state.setup.signinReturnParams,null);clean(h);
}
check('sign-in from Getting started opens Home with all money hidden',()=>{
 const h=fixture(),{L}=h,before=money(L);signout(h);click(h,'Sign in');assert.equal(L.route,'signin');signin(h);hiddenHome(h);assert.equal(money(L),before);
});
check('an incorrect PIN cannot unlock or reveal money before a valid sign-in',()=>{
 const h=fixture(),{L}=h;L.state.locked=true;L.go('signin');settle(h);const before=money(L);signin(h,'000000');assert.equal(L.route,'signin');assert.equal(L.state.locked,true);assert(view(h).querySelector('#error').textContent.includes('PIN did not match'));assert.equal(view(h).querySelector('[data-private-value]'),null);assert.equal(L.authPolicy.status().failures,1);assert.equal(money(L),before);signin(h);hiddenHome(h);assert.equal(L.authPolicy.status().failures,0);assert.equal(money(L),before);
});
check('saved return destinations and route parameters never replace the Home sign-in destination',()=>{
 for(const destination of ['plan','moneyStoryHome','cardsHome','pay','more','paymentReview','authorize','pause']){
  const h=fixture(),{L}=h;L.openTab('cardsHome');settle(h);L.state.locked=true;L.go('signin',{returnTo:destination,returnParams:{id:'old-task',days:90,category:'Food'}});settle(h);const before=money(L);signin(h);hiddenHome(h);assert.equal(money(L),before,'Money preserved for '+destination);
 }
});
check('a guarded Cards destination returns to Home after sign-in',()=>{
 const h=fixture(),{L}=h;L.state.locked=true;L.openTab('cardsHome');settle(h);assert.equal(L.route,'signin');assert.equal(L.state.setup.signinReturn,'cardsHome');const before=money(L);signin(h);hiddenHome(h);assert.equal(money(L),before);
});
check('the eye can reveal money and every subsequent sign-in closes it again',()=>{
 const h=fixture(),{L}=h;L.state.locked=true;L.go('signin');settle(h);signin(h);hiddenHome(h);const before=money(L);h.document.getElementById('balance-eye').click();settle(h);assert.equal(h.document.getElementById('balance-eye').getAttribute('aria-label'),'Hide balances');assert.equal(h.document.getElementById('balance-eye').getAttribute('aria-pressed'),'true');for(const id of ['overview-room','overview-balance','overview-savings'])assert.equal(h.document.getElementById(id).querySelector('.money-mask'),null);assert.equal(money(L),before);signout(h);click(h,'Sign in');signin(h);hiddenHome(h);assert.equal(money(L),before);
});
check('sign-in after a payment PIN lock returns Home without executing or losing the draft',()=>{
 const h=fixture(),{L}=h;L.go('campusPay');settle(h);L.pickMerchant('AK01');settle(h);h.set('payment-amount','80');h.set('payment-essential','');L.preparePayment();settle(h);assert.equal(L.route,'paymentReview');L.continuePayment();settle(h);assert.equal(L.route,'authorize');for(let attempt=0;attempt<5;attempt++){h.set('payment-pin','000000');L.authorizePayment();settle(h);}assert.equal(L.route,'signin');assert.equal(L.state.locked,true);assert.equal(L.taskSheet.active,false);assert.equal(L.state.setup.signinReturn,'paymentReview');const before=money(L),draft=JSON.stringify(L.state.paymentDraft);signin(h);assert.equal(L.route,'signin');assert.equal(L.state.locked,true);assert.equal(money(L),before);h.advance(60000);signin(h);hiddenHome(h);assert.equal(money(L),before);assert.equal(JSON.stringify(L.state.paymentDraft),draft);assert.equal(L.state.paymentDraft.submittedTxId,undefined);
});
check('an approved PIN recovery still signs in to a hidden Home instead of the saved task',()=>{
 const h=fixture(),{L}=h;L.state.locked=true;L.state.setup.recovery={kind:'pin',status:'approved',phoneChecked:true,returnTo:'paymentReview',returnParams:{id:'old-payment'}};L.go('pin',{mode:'recovery'});settle(h);h.set('newPin','654321');submit(h);assert.equal(L.route,'confirmPin');h.set('confirmPin','654321');submit(h);assert.equal(L.route,'signin');assert.equal(L.state.locked,true);assert.equal(L.state.setup.recovery,null);const before=money(L);signin(h,'654321');hiddenHome(h);assert.equal(money(L),before);
});
console.log(passed+' sign-in Home privacy groups passed.');
