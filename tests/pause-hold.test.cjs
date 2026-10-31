/* Exact Pause timing through shipped code and mounted controls. This fake clock
   establishes interaction contracts, not real browser paint or physical touch. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let passed=0;
const check=(name,run)=>{run();passed++;console.log('PASS '+name);};
const view=h=>h.document.getElementById('view');
const financial=h=>JSON.stringify([h.L.state.balance,h.L.state.txs,h.L.state.essentials,h.L.state.goals]);
function fixture(options={}){
 const h=createHarness({clock:true,...options}),{L}=h;L.explore();
 Object.assign(L.state,{balance:600,txs:[],paymentDraft:null,essentials:[{id:'food',name:'Food',amount:200,paid:0},{id:'transport',name:'Transport',amount:150,paid:0}],goals:[{id:'laptop',name:'Laptop',target:3000,allocated:100}],allowance:{amount:0,date:''},chats:[]});
 L.route='home';L.params={};L.history=[];L.render();h.flush();return h;
}
function action(h,code){const b=view(h).querySelectorAll('button').find(el=>el.getAttribute('onclick')===code);assert(b,'Working '+code+' on '+h.L.route);b.click();h.flush();return b;}
function open(h,amount=280){h.L.openPayTab('campus');h.L.pickMerchant('AK01');h.set('payment-amount',amount);h.set('payment-essential','');h.L.preparePayment();h.L.continuePayment();h.flush();assert.equal(h.L.route,'pause');assert(hold(h));return h;}
function hold(h){return view(h).querySelector('[data-pause-hold]');}
function send(h,type,extra={}){const b=hold(h);assert(b);b.dispatchEvent(new h.Event(type,{pointerId:1,isPrimary:true,button:0,clientX:20,clientY:20,...extra}));h.flush();return b;}
const waiting=h=>assert.equal(hold(h).getAttribute('aria-disabled'),'true','PIN stays gated');
const ready=h=>assert.notEqual(hold(h).getAttribute('aria-disabled'),'true','PIN is ready after the minimum');
const hidden=el=>el.hidden||el.hasAttribute('hidden')||el.getAttribute('aria-hidden')==='true';
function effects(h){const nodes=view(h).querySelectorAll('[data-pause-effects]');assert(nodes.length,'Projected effects have staged wrappers');return nodes;}
const clean=h=>assert.deepEqual(h.errors,[]);

check('Pause gives three full reading seconds after the 900ms reveal',()=>{
 const h=open(fixture()),before=financial(h);waiting(h);h.L.resumeFromPause();h.advance(90);assert.equal(h.L.route,'pause');
 h.advance(3809);waiting(h);h.L.resumeFromPause();assert.equal(h.L.route,'pause');assert.equal(financial(h),before);h.advance(1);ready(h);assert.equal(h.L.state.txs.length,0);clean(h);
});
check('projected effects reveal at the ring arrival, not on entry',()=>{
 const h=open(fixture()),before=financial(h);assert(effects(h).every(hidden));h.advance(899);assert(effects(h).every(hidden));h.advance(1);assert(effects(h).every(el=>!hidden(el)));assert.equal(financial(h),before);assert(view(h).textContent.includes('GH₵30.00 short'));assert(view(h).textContent.includes('320.00'));waiting(h);clean(h);
});
check('the initial focus is visible, then the revealed consequence is announced and remains focusable',()=>{
 const h=open(fixture()),intro=view(h).querySelector('.pause-arrival-intro');assert(intro);assert(h.document.activeElement===intro);assert(!intro.closest('[inert]'));assert(!hidden(intro));const announcement=view(h).querySelector('[data-pause-announcement]');assert(announcement);assert.equal(announcement.textContent,'');h.advance(900);assert(announcement.textContent.includes('GH₵30.00 short'));const heading=view(h).querySelector('h1');assert(h.document.activeElement===heading,'Focus must not be left on the newly hidden introduction');assert(!heading.closest('[inert]'));clean(h);
});
check('revealing the consequence does not steal focus from a choice the student reached',()=>{
 const h=open(fixture()),edit=view(h).querySelectorAll('button').find(el=>el.getAttribute('onclick')==="L.pauseAction('edit_amount')");assert(edit);edit.focus();h.advance(900);assert(h.document.activeElement===edit);assert(view(h).querySelector('[data-pause-announcement]').textContent.includes('GH₵30.00 short'));clean(h);
});
check('pointer press of 89ms cancels; a new continuous 90ms press and release opens PIN',()=>{
 const h=open(fixture()),before=financial(h);h.advance(3900);ready(h);send(h,'pointerdown');h.advance(89);send(h,'pointerup');assert.equal(h.L.route,'pause');
 send(h,'pointerdown');h.advance(90);assert.equal(h.L.route,'pause','Reaching the threshold alone does not submit or navigate');send(h,'pointerup');assert.equal(h.L.route,'authorize');assert.equal(financial(h),before);assert.equal(h.L.state.txs.length,0);clean(h);
});
for(const cancel of ['pointercancel','pointerleave'])check(cancel+' cancels an otherwise sufficient hold',()=>{
 const h=open(fixture());h.advance(3900);send(h,'pointerdown');h.advance(90);send(h,cancel);send(h,'pointerup');h.advance(200);assert.equal(h.L.route,'pause');assert.equal(h.L.state.txs.length,0);clean(h);
});
for(const key of [' ','Enter'])check((key===' '?'Space':'Enter')+' supports the same continuous 90ms hold and release',()=>{
 const h=open(fixture()),before=financial(h);h.advance(3900);hold(h).focus();send(h,'keydown',{key,repeat:false});h.advance(89);send(h,'keyup',{key});assert.equal(h.L.route,'pause');
 send(h,'keydown',{key,repeat:false});h.advance(90);send(h,'keyup',{key});assert.equal(h.L.route,'authorize');assert.equal(financial(h),before);clean(h);
});
check('assistive click receives the same short confirmation after the three-second minimum',()=>{
 const h=open(fixture()),before=financial(h);h.advance(3900);hold(h).click();h.advance(89);assert.equal(h.L.route,'pause');h.advance(1);assert.equal(h.L.route,'authorize');assert.equal(financial(h),before);clean(h);
});
check('early presses cannot queue authorisation for later',()=>{
 const h=open(fixture());send(h,'pointerdown');h.advance(90);send(h,'pointerup');h.advance(3810);ready(h);assert.equal(h.L.route,'pause');assert.equal(h.L.state.txs.length,0);clean(h);
});
check('editing and cancelling remain available throughout the minimum',()=>{
 const h=open(fixture()),before=financial(h),id=h.L.state.paymentDraft.id;action(h,"L.pauseAction('edit_amount')");assert.equal(h.L.route,'send');assert.equal(h.document.getElementById('payment-amount').value,'280');assert.equal(h.L.state.paymentDraft.id,id);assert.equal(financial(h),before);
 h.L.preparePayment();h.L.continuePayment();h.flush();
 // Exercise the native exit guard without clicking Signal's hidden modal X.
 if(h.L.signalEdition)h.L.closeTask();else h.document.querySelector('.task-sheet-close').click();h.flush();assert.equal(h.L.route,'paymentCancel');action(h,'L.discardPayment()');assert.equal(h.L.state.paymentDraft,null);h.advance(5000);assert.notEqual(h.L.route,'authorize');assert.equal(financial(h),before);clean(h);
});
check('rerender preserves the arrival and minimum timings for the same decision',()=>{
 const h=open(fixture());h.advance(400);h.L.render();h.flush();assert(effects(h).every(hidden));h.advance(499);assert(effects(h).every(hidden));h.advance(1);assert(effects(h).every(el=>!hidden(el)));h.advance(2999);waiting(h);h.advance(1);ready(h);assert.equal(h.L.state.txs.length,0);clean(h);
});
check('changed amount gets a fresh three-second decision and fresh projected effect',()=>{
 const h=open(fixture());h.advance(3900);ready(h);action(h,"L.pauseAction('edit_amount')");h.set('payment-amount',300);h.L.preparePayment();h.L.continuePayment();h.flush();assert.equal(h.L.route,'pause');waiting(h);assert(effects(h).every(hidden));h.advance(3899);waiting(h);h.advance(1);ready(h);assert(view(h).textContent.includes('GH₵50.00 short'));assert.equal(h.L.state.balance,600);clean(h);
});
check('reduced motion shows every effect immediately but preserves the three-second decision',()=>{
 const h=open(fixture({reducedMotion:true})),before=financial(h);assert(effects(h).every(el=>!hidden(el)));waiting(h);h.L.resumeFromPause();h.advance(2999);assert.equal(h.L.route,'pause');waiting(h);h.advance(1);ready(h);hold(h).click();h.advance(90);assert.equal(h.L.route,'authorize');assert.equal(financial(h),before);clean(h);
});
check('leaving a held control cancels its pending completion and cannot reappear as PIN later',()=>{
 const h=open(fixture());h.advance(3900);hold(h).click();h.advance(45);action(h,"L.pauseAction('edit_amount')");h.advance(5000);assert.equal(h.L.route,'send');assert.equal(h.L.state.balance,600);assert.equal(h.L.state.txs.length,0);clean(h);
});
check('background time never unlocks the Pause or completes a hold',()=>{
 const h=open(fixture());h.advance(1000);h.document.hidden=true;h.document.dispatchEvent(new h.Event('visibilitychange'));h.advance(10000);h.document.hidden=false;h.document.dispatchEvent(new h.Event('visibilitychange'));waiting(h);h.advance(3900);ready(h);
 hold(h).click();h.advance(45);h.document.hidden=true;h.document.dispatchEvent(new h.Event('visibilitychange'));h.advance(1000);assert.equal(h.L.route,'pause');assert.equal(h.L.state.balance,600);assert.equal(h.L.state.txs.length,0);clean(h);
});
check('time spent in Help is excluded while the same decision keeps its visible progress',()=>{
 const h=open(fixture());h.advance(1000);h.L.go('help',{returnTo:'pause'});h.flush();h.advance(6000);h.L.go('pause');h.flush();waiting(h);h.advance(2899);waiting(h);h.advance(1);ready(h);assert.equal(h.L.state.balance,600);clean(h);
});
check('missing animation support reveals static effects immediately and still requires the minimum',()=>{
 const h=fixture();h.context.Element.prototype.animate=undefined;open(h);assert(effects(h).every(el=>!hidden(el)));waiting(h);h.advance(2999);waiting(h);h.advance(1);ready(h);assert.equal(h.L.state.balance,600);clean(h);
});
check('the browser click following a completed pointer hold cannot restart PIN or submit twice',()=>{
 const h=open(fixture());h.advance(3900);const oldButton=send(h,'pointerdown');h.advance(90);send(h,'pointerup');assert.equal(h.L.route,'authorize');h.set('payment-pin','123');oldButton.click();h.advance(100);assert.equal(h.L.route,'authorize');assert.equal(h.document.getElementById('payment-pin').value,'123');assert.equal(h.L.state.txs.length,0);clean(h);
});
check('Replay starts a fresh three-second Pause and reveals effects only at its new ring arrival',()=>{
 const h=open(fixture());h.advance(3900);ready(h);assert(effects(h).every(el=>!hidden(el)));const before=financial(h),shown=h.L.state.pauseEvents.filter(event=>event.action==='shown').length;h.L.replayPauseProjection();h.flush();waiting(h);assert(effects(h).every(hidden));h.advance(899);assert(effects(h).every(hidden));h.advance(1);assert(effects(h).every(el=>!hidden(el)));h.advance(2999);waiting(h);h.advance(1);ready(h);assert.equal(financial(h),before);assert.equal(h.L.state.pauseEvents.filter(event=>event.action==='shown').length,shown);assert.equal(h.L.route,'pause');clean(h);
});
check('only a later PIN confirmation can create the simulated payment',()=>{
 const h=open(fixture());h.advance(3900);send(h,'pointerdown');h.advance(90);send(h,'pointerup');assert.equal(h.L.route,'authorize');assert.equal(h.L.state.balance,600);h.set('payment-pin','123456');h.L.authorizePayment();h.flush();assert.equal(h.L.route,'paymentResult');assert.equal(h.L.state.balance,320);assert.equal(h.L.state.txs.length,1);h.L.authorizePayment();assert.equal(h.L.state.txs.length,1);clean(h);
});
console.log(passed+' exact Pause dwell, reveal and hold checks passed.');
