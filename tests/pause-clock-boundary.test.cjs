/* A browser timer may run fractionally before its boundary while performance
   advances within the callback. A missed boundary must schedule another check.
   These tests exercise the shipped controller, without changing its thresholds. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const view=h=>h.document.getElementById('view');
const hold=h=>view(h).querySelector('[data-pause-hold]');
const financial=h=>JSON.stringify([h.L.state.balance,h.L.state.txs,h.L.state.essentials,h.L.state.goals]);
function fixture(){
 const h=createHarness({clock:true}),L=h.L;L.explore();
 Object.assign(L.state,{balance:600,txs:[],paymentDraft:null,essentials:[{id:'food',name:'Food',amount:400,paid:0}],goals:[],allowance:{amount:0,date:''}});
 L.route='home';L.params={};L.history=[];L.render();h.flush();
 L.openPayTab('campus');L.pickMerchant('AK01');h.set('payment-amount',280);h.set('payment-essential','');L.preparePayment();h.flush();
 if(L.route==='paymentReview'){L.continuePayment();h.flush();}
 assert.equal(L.route,'pause');assert(hold(h));return h;
}
function crossWithinCallback(h,boundary){
 const original=h.context.performance.now;let reads=0;
 // The first decision sees the just-early timer. A second independent clock
 // read in the same callback would fall on the other side of that boundary.
 h.context.performance.now=()=>++reads===1?boundary-.1:boundary+.1;
 try{h.advance(1);}finally{h.context.performance.now=original;}
 assert(reads>0,'The actual scheduled Pause callback read the fractional clock');
}

test('a fractionally early reveal callback checks again instead of leaving the consequence hidden forever',()=>{
 const h=fixture(),before=financial(h);h.advance(899);crossWithinCallback(h,900);
 assert.equal(view(h).querySelector('.focus-pause-insight').getAttribute('aria-hidden'),'true','The sampled899.9ms is still before reveal');
 assert.equal(hold(h).getAttribute('aria-disabled'),'true');assert.equal(financial(h),before);
 h.advance(1);
 const consequence=view(h).querySelector('.focus-pause-insight');assert.equal(consequence.getAttribute('aria-hidden'),'false','A follow-up check reveals the consequence after900ms');assert.equal(consequence.inert,false);
 assert.equal(hold(h).getAttribute('aria-disabled'),'true','The full reading window still follows reveal');
 h.advance(2998);assert.equal(hold(h).getAttribute('aria-disabled'),'true');h.advance(1);assert.equal(hold(h).getAttribute('aria-disabled'),'false');
 assert.equal(h.L.route,'pause');assert.equal(financial(h),before);assert.deepEqual(h.errors,[]);
});

test('a fractionally early reading callback checks again instead of leaving Continue disabled forever',()=>{
 const h=fixture(),before=financial(h);h.advance(3899);assert.equal(view(h).querySelector('.focus-pause-insight').getAttribute('aria-hidden'),'false');
 crossWithinCallback(h,3900);assert.equal(hold(h).getAttribute('aria-disabled'),'true','The sampled3899.9ms still needs the rest of the reading window');
 h.advance(1);assert.equal(hold(h).getAttribute('aria-disabled'),'false','A follow-up check enables Continue after the full reading window');
 assert.equal(h.L.route,'pause');assert.equal(financial(h),before);hold(h).click();h.advance(89);assert.equal(h.L.route,'pause');h.advance(1);h.flush();
 assert.equal(h.L.route,'authorize');assert(h.document.getElementById('payment-pin'));assert.equal(financial(h),before);assert.deepEqual(h.errors,[]);
});
