/* Loads the actual index script list and actual Campus Pay controller. Assertions
   concern behavior/DOM identity, not browser rendering or physical keyboard QA.
   Deep retained-Home payment cases invoke the controller API explicitly; Home
   has no payment CTA. A separate test exercises the actual Pay-tab entry. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let count=0;
const filter=process.env.TASK_SHEET_FILTER||'';
const check=(name,run)=>{if(filter&&!name.includes(filter))return;run();count++;console.log('PASS '+name);};
function fixture(options={}){
 const h=createHarness({clock:true,...options}),{L}=h;const flush=h.flush;h.flush=()=>{flush();h.advance(16);};
 // In v2, GH₵100 is already in Savings; only GH₵500 funds the GH₵350 budget.
 L.explore();L.hidePrivateMoney();Object.assign(L.state,{balance:500,txs:[],paymentDraft:null,essentials:[{id:'food',name:'Food',amount:250,paid:0},{id:'transport',name:'Transport',amount:100,paid:0}],goals:[{id:'laptop',name:'Laptop',target:3000,allocated:100}],allowance:{amount:0,date:''},chats:[]});
 L.route='home';L.params={};L.history=[];L.render();h.flush();
 assert.equal(L.accountBalances().savings,100);assert.equal(L.accountBalances().total,600);assert.equal(L.balances().available,500);assert.equal(L.balances().room,150);
 h.parent=h.document.getElementById('view');h.home=h.parent.querySelector('.focus-home');h.nav=h.document.getElementById('nav');h.navMarkup=h.nav.innerHTML;h.navNodes=[...h.nav.children];
 return h;
}
function clickAction(h,action){const button=h.document.getElementById('view').querySelectorAll('button').find(el=>el.getAttribute('onclick')===action);assert(button,'Missing working action '+action+' on '+h.L.route);if(action==='L.resumeFromPause()')h.advance(3900);button.click();if(action==='L.resumeFromPause()')h.advance(90);h.flush();return button;}
function submit(h){const button=h.document.getElementById('view').querySelector('button[type="submit"]');assert(button,'Missing submit on '+h.L.route);button.click();h.flush();}
function open(h){const trigger=h.nav.querySelectorAll('button').find(el=>el.getAttribute('onclick')==="L.openTab('home')");assert(trigger,'Home navigation provides an explicit API focus origin');trigger.focus();h.L.openPayTab('campus');h.flush();assert.equal(h.L.route,'campusPay');assert(h.L.taskSheet.active);assert.equal(h.L.taskSheet.parentRoute,'home');assert.equal(h.document.querySelectorAll('[role="dialog"]').length,1);return trigger;}
function amount(h,value,link=''){if(!h.L.taskSheet.active)open(h);clickAction(h,"L.pickMerchant('AK01')");assert.equal(h.L.route,'send');h.set('payment-amount',value);h.set('payment-essential',link);h.flush();return h.document.getElementById('payment-projection').textContent;}
function continueToPIN(h){submit(h);assert.equal(h.L.route,h.L.paymentNeedsPause(h.L.state.paymentDraft)?'pause':'paymentReview');if(h.L.route==='paymentReview')clickAction(h,'L.continuePayment()');else clickAction(h,'L.resumeFromPause()');assert.equal(h.L.route,'authorize');}
function noErrors(h){assert.deepEqual(h.errors,[],'No rendering/logic errors');}
function assertParent(h){assert.equal(h.document.getElementById('task-parent-view'),h.parent,'Same parent outlet stays mounted');assert.equal(h.parent.querySelector('.focus-home'),h.home,'Same Home content stays mounted during the task');assert(h.parent.inert);assert.equal(h.parent.getAttribute('aria-hidden'),'true');assert.equal(h.document.querySelectorAll('[role="dialog"]').length,1);assert.equal(h.document.getElementById('view').closest('[role="dialog"]'),h.document.querySelector('.task-sheet'));assert.equal(h.nav.innerHTML,h.navMarkup,'Parent navigation markup stays unchanged');assert.equal(h.nav.children.length,h.navNodes.length);h.navNodes.forEach((node,index)=>assert.equal(h.nav.children[index],node,'Parent navigation node '+index+' stays mounted'));assert.equal(h.document.getElementById('app').getAttribute('data-route'),'home','Base route remains Home for page styling');}
function base(h,route){h.L.openTab(route);h.flush();const parent=h.document.getElementById('view'),nav=h.document.getElementById('nav');parent.scrollTop=83;return {route,parent,tree:parent.firstChild,nav,navMarkup:nav.innerHTML,navNodes:[...nav.children]};}
function retained(h,snapshot){assert(h.L.taskSheet.active,'A common action opens one task sheet');assert.equal(h.L.taskSheet.parentRoute,snapshot.route);assert(h.document.getElementById('task-parent-view')===snapshot.parent,'Parent outlet identity');assert(snapshot.parent.firstChild===snapshot.tree,'Base content stays mounted during task steps');assert(snapshot.parent.inert);assert.equal(snapshot.nav.innerHTML,snapshot.navMarkup);snapshot.navNodes.forEach((node,index)=>assert(snapshot.nav.children[index]===node,'Navigation node identity'));assert.equal(h.document.getElementById('app').getAttribute('data-route'),snapshot.route);assert.equal(h.document.querySelectorAll('[role="dialog"]').length,1);}
function close(h,snapshot){h.document.querySelector('.task-sheet-close').click();h.flush();assert.equal(h.L.taskSheet.active,false);assert.equal(h.L.route,snapshot.route);assert(h.document.getElementById('view')===snapshot.parent,'Restored parent outlet identity');assert.equal(snapshot.parent.scrollTop,83);assert.equal(snapshot.parent.inert,false);assert.equal(h.document.querySelectorAll('[role="dialog"]').length,0);snapshot.tree=snapshot.parent.firstChild;snapshot.navMarkup=snapshot.nav.innerHTML;snapshot.navNodes=[...snapshot.nav.children];}
function drag(h,target,distance=100,cancel=false){const header=h.document.querySelector('.task-sheet-chrome');target.dispatchEvent(new h.Event('pointerdown',{pointerId:1,clientY:100,button:0,isPrimary:true}));header.dispatchEvent(new h.Event('pointermove',{pointerId:1,clientY:100+distance}));header.dispatchEvent(new h.Event(cancel?'pointercancel':'pointerup',{pointerId:1,clientY:100+distance}));h.flush();}

check('explicit payment controller API retains Home DOM, focus and scroll on merchant-only close',()=>{
 const h=fixture();h.parent.scrollTop=137;h.context.scrollY=68;const trigger=open(h);assertParent(h);
 assert.equal(h.parent.scrollTop,137);assert.equal(h.context.scrollY,68);assert.equal(h.document.body.style.overflow,'hidden');
 h.document.querySelector('.task-sheet-close').click();h.flush();
 assert.equal(h.L.route,'home');assert.equal(h.L.taskSheet.active,false);assert.equal(h.document.getElementById('view'),h.parent);assert.equal(h.parent.querySelector('.focus-home'),h.home);assert.equal(h.parent.scrollTop,137);assert.equal(h.context.scrollY,68);assert.equal(h.document.activeElement,trigger);assert.equal(h.parent.inert,false);assert.equal(h.parent.getAttribute('aria-hidden'),null);assert.equal(h.document.querySelectorAll('[role="dialog"]').length,0);noErrors(h);
});

for(const [purchase,available,room,gap,essentialGap,goalGap]of [[80,420,70,0,0,0],[140,360,10,0,0,0],[280,220,0,130,130,0]])check('Campus Pay GH₵'+purchase+' preview, Review, conditional Pause, PIN and result agree',()=>{
 const h=fixture(),{L}=h;const preview=amount(h,purchase);assertParent(h);assert.equal(L.state.balance,500);assert.equal(L.state.txs.length,0);
 const impact=L.planImpactSummary(L.state.paymentDraft);assert.equal(impact.after,available);assert.equal(impact.room,room);assert.equal(impact.essentialGap,essentialGap);assert.equal(impact.goalGap,goalGap);
 assert(preview.includes(L.money(essentialGap||goalGap||room)),preview);
 const chat=L.chatAnswer('Can I spend GH₵'+purchase+'?');assert(chat.text.includes(L.money(essentialGap||goalGap||room)),chat.text);
 submit(h);assert.equal(L.route,purchase===280?'pause':'paymentReview','Pause replaces ordinary review when the existing engine triggers');assertParent(h);const review=h.document.getElementById('view');assert(review.textContent.includes('Akua’s Kitchen'));assert(review.textContent.includes('Fee'));assert(review.textContent.includes('Total'));assert.equal(review.querySelectorAll('.entry-consequence').length,0,'Entry preview is not repeated');assert.equal(review.querySelectorAll('.pause-comparison').length,purchase===280?1:0,'Only the consequential decision has a comparison');
 if(L.route==='paymentReview')clickAction(h,'L.continuePayment()');assert.equal(L.route,purchase===280?'pause':'authorize','Existing engine trigger rule');
 if(purchase===280){const pause=h.document.getElementById('view');assert(pause.textContent.includes('Food and transport would be GH₵130.00 short.'));assert.equal(pause.querySelectorAll('[data-pause-comparison]').length,1);assert.equal(pause.querySelector('[data-pause-comparison]').getAttribute('data-comparison-kind'),'essentials');assert(pause.querySelector('.pause-comparison-before').textContent.includes('350.00'));assert(pause.querySelector('.pause-comparison-after').textContent.includes('220.00'));assert.equal(pause.querySelector('.pause-calculation').hasAttribute('open'),false);assert(!pause.textContent.includes('uncovered after essentials'),'Money Boxes are separate savings, not uncovered operational commitments');assert.equal(L.state.balance,500);clickAction(h,'L.resumeFromPause()');}
 assert.equal(L.route,'authorize');assertParent(h);assert.equal(L.state.balance,500);h.set('payment-pin','123456');submit(h);assert.equal(L.route,'paymentResult');assertParent(h);assert.equal(L.state.balance,available);assert.equal(L.balances().room,room);assert.equal(L.balances().gap,gap);assert.equal(L.state.txs.length,1);assert.equal(h.document.getElementById('view').querySelector('[data-payment-state]').getAttribute('data-payment-state'),'confirmed');
 const txid=L.state.txs[0].id;L.authorizePayment();assert.equal(L.state.txs.length,1,'Repeated authorisation is idempotent');assert.equal(L.state.balance,available);assert.equal(L.state.txs[0].id,txid);h.document.querySelector('.task-sheet-close').click();h.flush();assert.equal(L.route,'home');assert.equal(L.taskSheet.active,false);assert.equal(h.document.getElementById('view'),h.parent);assert.equal(L.state.txs.length,1);assert.equal(L.state.balance,available);noErrors(h);
});

check('linked GH₵80 Campus Pay fulfils essentials once and keeps the same plan room',()=>{
 const h=fixture(),{L}=h;const preview=amount(h,80,'food');assert(preview.includes('GH₵150.00'));assert.equal(L.paymentProjection().essentialCovered,80);continueToPIN(h);assertParent(h);h.set('payment-pin','123456');submit(h);assert.equal(L.state.balance,420);assert.equal(L.state.essentials[0].paid,80);assert.equal(L.balances().essentials,270);assert.equal(L.balances().room,150);assert.equal(L.state.txs[0].essentialId,'food');noErrors(h);
});

check('Pay parent field IDs cannot shadow the active merchant lookup and restore on close',()=>{
 const h=fixture(),{L}=h;L.openTab('pay');L.setPayTab('campus');const parent=h.document.getElementById('view'),field=parent.querySelector('#merchant-code'),error=parent.querySelector('#error');field.value='CP02';const payTree=parent.firstChild;
 L.go('campusPay');h.flush();assert(L.taskSheet.active);assert.equal(L.taskSheet.parentRoute,'pay');assert.equal(parent.firstChild,payTree);assert.notEqual(field.id,'merchant-code');assert.notEqual(error.id,'error');const taskField=h.document.getElementById('merchant-code');assert(taskField);assert.notEqual(taskField,field);h.document.querySelector('.task-sheet-close').click();h.flush();assert.equal(L.route,'pay');assert.equal(field.id,'merchant-code');assert.equal(error.id,'error');assert.equal(field.value,'CP02');assert.equal(parent.firstChild,payTree);
 L.go('campusPay');h.set('merchant-code','AK01');submit(h);assert.equal(L.route,'send');assert.equal(L.state.paymentDraft.merchantId,'AK01','Active task, not stale parent CP02, supplies merchant');assert.equal(h.document.getElementById('payment-amount').closest('.task-sheet-body'),h.document.getElementById('view'));h.document.querySelector('.task-sheet-close').click();h.flush();clickAction(h,'L.discardPayment()');assert.equal(L.route,'pay');assert.equal(L.payTab(),'campus');noErrors(h);
});

check('active task input clears its validation error while keeping the live preview working',()=>{
 const h=fixture();amount(h,80);h.set('payment-amount',0);submit(h);assert.equal(h.L.route,'send');const input=h.document.getElementById('payment-amount');assert.equal(input.getAttribute('aria-invalid'),'true');assert.equal(h.document.activeElement,input);h.set('payment-amount',80);assert.equal(input.getAttribute('aria-invalid'),null);assert.equal(input.getAttribute('aria-describedby'),null);assert(h.document.getElementById('payment-projection').textContent.includes('GH₵70.00'));assert.equal(h.L.state.balance,500);noErrors(h);
});

check('backgrounding masks retained Home balances and restores an accurate eye control',()=>{
 const h=fixture(),{L}=h;L.toggleBalancePrivacy();assert.equal(h.document.getElementById('balance-eye').getAttribute('aria-pressed'),'true');assert(h.parent.querySelector('[data-private-value="available"]').textContent.includes('500.00'));open(h);h.emit('pagehide');assert(!h.parent.querySelector('[data-private-value="available"]').textContent.includes('500.00'));h.document.querySelector('.task-sheet-close').click();h.flush();const eye=h.document.getElementById('balance-eye');assert.equal(eye.getAttribute('aria-pressed'),'false');assert.equal(eye.getAttribute('aria-label'),'Show balances');assert(!h.parent.querySelector('[data-private-value="available"]').textContent.includes('500.00'));noErrors(h);
});

check('Pause editing preserves merchant and amount, then recalculates in the same sheet',()=>{
 const h=fixture(),{L}=h;amount(h,280);h.set('payment-note','Lunch with a friend');submit(h);assert.equal(L.route,'pause');const sheet=h.document.querySelector('.task-sheet');clickAction(h,"L.pauseAction('edit_amount')");assert.equal(L.route,'send');assert.equal(h.document.getElementById('payment-amount').value,'280');assert.equal(h.document.getElementById('payment-note').value,'Lunch with a friend');assert.equal(L.state.paymentDraft.name,'Akua’s Kitchen');h.set('payment-amount',80);assert(h.document.getElementById('payment-projection').textContent.includes('GH₵70.00'));continueToPIN(h);assert.equal(h.document.querySelector('.task-sheet'),sheet);assert.equal(L.state.balance,500);assertParent(h);noErrors(h);
});

check('Pause can explicitly link a planned cost and requires a fresh review',()=>{
 const h=fixture(),{L}=h;amount(h,280);submit(h);assert.equal(L.route,'pause');clickAction(h,'L.openPaymentPlanLink()');assert.equal(L.route,'paymentPlanLink');assertParent(h);h.set('payment-essential','food');submit(h);assert.equal(L.route,'pause','Budget is covered, but GH₵280 still meets the unchanged large-payment and large-share rules');assert.equal(L.state.paymentDraft.essentialId,'food');assert.equal(L.state.paymentDraft.pauseAcceptedSignature,undefined);assert.equal(L.planImpactSummary(L.state.paymentDraft).totalGap,0);assert.equal(L.pauseEngine.evaluate(L.state.paymentDraft).behavioralTriggered,true);clickAction(h,'L.resumeFromPause()');assert.equal(L.route,'authorize');assert.equal(L.state.balance,500);noErrors(h);
});

for(const mode of ['keep','discard','defer','cancel'])check('unsubmitted '+mode+' leaves the sheet without moving money or losing the parent',()=>{
 const h=fixture(),{L}=h;h.parent.scrollTop=94;amount(h,280);const draftid=L.state.paymentDraft.id;
 if(mode==='keep'||mode==='discard'){h.document.querySelector('.task-sheet-close').click();h.flush();assert.equal(L.route,'paymentCancel');assert(L.taskSheet.active);assertParent(h);clickAction(h,mode==='keep'?'L.keepPaymentLater()':'L.discardPayment()');}
 else{submit(h);assert.equal(L.route,'pause');clickAction(h,"L.pauseAction('"+(mode==='defer'?'delay_payment':'cancel_payment')+"')");}
 assert.equal(L.route,'home');assert.equal(L.taskSheet.active,false);assert.equal(h.document.getElementById('view'),h.parent);assert.equal(h.parent.scrollTop,94);assert.equal(L.state.balance,500);assert.equal(L.state.txs.length,0);assert.equal(L.state.paymentDraft?.id,mode==='keep'||mode==='defer'?draftid:undefined);assert.equal(h.document.querySelectorAll('[role="dialog"]').length,0);noErrors(h);
});

check('invalid PIN and changed budget stay unconfirmed and force current review',()=>{
 const h=fixture(),{L}=h;amount(h,80);continueToPIN(h);h.set('payment-pin','999999');submit(h);assert.equal(L.route,'authorize');assert(h.document.getElementById('error').textContent.includes('doesn’t match'));assert.equal(h.document.activeElement.id,'payment-pin');assert.equal(L.state.balance,500);assert.equal(L.state.txs.length,0);
 L.state.essentials[0].amount=350;h.set('payment-pin','123456');submit(h);assert.equal(L.route,'pause','Changed plan requires the fresh consequential decision');assert(L.taskSheet.active);assert.equal(L.state.txs.length,0);assertParent(h);noErrors(h);
});

for(const outcome of ['Pending','Failed'])check(outcome+' payment uses the existing transaction state and closes without a second debit',()=>{
 const h=fixture({testing:true}),{L}=h;amount(h,80);continueToPIN(h);h.set('payment-pin','123456');h.set('payment-outcome',outcome);submit(h);assert.equal(L.route,'paymentResult');const tx=L.state.txs[0];assert.equal(tx.status,outcome.toLowerCase());assert.equal(L.state.balance,500);assert.equal(L.balances().available,outcome==='Pending'?420:500);assert.equal(L.state.txs.length,1);assert.equal(h.document.getElementById('view').querySelector('[data-payment-state]').getAttribute('data-payment-state'),outcome.toLowerCase());
 L.authorizePayment();assert.equal(L.state.txs.length,1);h.document.querySelector('.task-sheet-close').click();h.flush();assert.equal(L.taskSheet.active,false);assert.equal(L.state.txs.length,1);assert.equal(L.state.balance,500);L.refreshPayment(tx.id);assert.equal(L.state.txs.length,1);assert.equal(L.state.balance,500);if(outcome==='Pending'){L.settlePayment(tx.id,'success');assert.equal(L.state.balance,420);L.settlePayment(tx.id,'success');assert.equal(L.state.balance,420);}noErrors(h);
});

check('browser Back and Forward move between real sheet steps without remounting Home',()=>{
 const h=fixture(),{L}=h;amount(h,280);submit(h);assert.equal(L.route,'pause');h.history.back();h.flush();assert.equal(L.route,'send','Back returns directly to entered details');assert.equal(h.document.getElementById('payment-amount').value,'280');assertParent(h);h.history.forward();h.flush();assert.equal(L.route,'pause');assertParent(h);h.document.querySelector('.task-sheet-close').click();h.flush();clickAction(h,'L.discardPayment()');assert.equal(L.route,'home');h.history.back();h.flush();assert.equal(L.taskSheet.active,false);assert.equal(h.document.querySelectorAll('[role="dialog"]').length,0);noErrors(h);
});

check('browser Back at the first step asks about the unfinished draft instead of discarding it',()=>{
 const h=fixture(),{L}=h;amount(h,80);h.history.back();h.flush();assert.equal(L.route,'campusPay');assertParent(h);h.history.back();h.flush();assert.equal(L.route,'paymentCancel');assert(L.taskSheet.active);assert.equal(L.state.paymentDraft.amount,'80');assert.equal(L.state.balance,500);clickAction(h,'L.keepPaymentLater()');assert.equal(L.route,'home');assert.equal(L.taskSheet.active,false);assert.equal(L.state.paymentDraft.amount,'80');noErrors(h);
});

check('Back from a submitted result closes safely and cannot expose authorisation again',()=>{
 const h=fixture(),{L}=h;amount(h,80);continueToPIN(h);h.set('payment-pin','123456');submit(h);const id=L.state.txs[0].id;h.history.back();h.flush();assert.equal(L.taskSheet.active,false);assert.equal(L.route,'home');assert.equal(L.state.balance,420);assert.equal(L.state.txs.length,1);assert.equal(L.state.txs[0].id,id);assert.equal(h.document.getElementById('payment-pin'),null);h.history.forward();h.flush();assert.equal(L.taskSheet.active,false);assert.notEqual(L.route,'authorize');assert.equal(L.state.txs.length,1);noErrors(h);
});

for(const prior of ['Completed','Pending'])for(const backKind of ['sheet','browser'])check('a new task after '+prior.toLowerCase()+' result treats its fresh draft correctly on '+backKind+' Back',()=>{
 const h=fixture({testing:true}),{L}=h;amount(h,80);continueToPIN(h);h.set('payment-pin','123456');h.set('payment-outcome',prior);submit(h);assert.equal(L.route,'paymentResult');const old=L.state.txs[0],oldDraft=L.state.paymentDraft.id;
 h.document.querySelector('.task-sheet-close').click();h.flush();assert.equal(L.route,'home');assert.equal(L.taskSheet.active,false);assert.equal(L.state.paymentDraft.submittedTxId,old.id,'Closing a result retains the existing submitted draft');const beforeBalance=L.state.balance,beforeAvailable=L.balances().available;
 amount(h,20);const fresh=L.state.paymentDraft.id;assert.notEqual(fresh,oldDraft);assert.equal(L.state.paymentDraft.submittedTxId,undefined);assert.equal(L.route,'send');assert.equal(L.taskSheet.active,true);
 if(backKind==='sheet')h.document.querySelector('.task-sheet-back').click();else h.history.back();h.flush();assert.equal(L.route,'campusPay','Back returns to merchant selection for this new task');assert.equal(L.taskSheet.active,true,'Previous submitted payment must not mark a new task submitted');assert.equal(L.state.paymentDraft.id,fresh);assert.equal(L.state.paymentDraft.amount,'20');assert.equal(L.state.paymentDraft.submittedTxId,undefined);assert.equal(L.state.txs.length,1);assert.equal(L.state.txs[0].id,old.id);
 h.document.querySelector('.task-sheet-close').click();h.flush();assert.equal(L.route,'paymentCancel','Closing asks about the fresh unsubmitted draft');assert.equal(L.taskSheet.active,true);clickAction(h,backKind==='sheet'?'L.keepPaymentLater()':'L.discardPayment()');assert.equal(L.route,'home');assert.equal(L.taskSheet.active,false);assert.equal(L.state.paymentDraft?.id,backKind==='sheet'?fresh:undefined);assert.equal(L.state.balance,beforeBalance);assert.equal(L.balances().available,beforeAvailable);assert.equal(L.state.txs.length,1);noErrors(h);
});

check('asynchronous native history cleanup cannot close a newly requested sheet or lose a tab request',()=>{
 const h=fixture({deferHistory:true}),{L}=h;open(h);h.document.querySelector('.task-sheet-close').click();assert.equal(L.taskSheet.active,false);assert.equal(h.history.pending,1);L.go('campusPay');assert.equal(L.taskSheet.active,false,'New task waits for native history cleanup');h.flushHistory();h.flush();assert.equal(L.route,'campusPay');assert.equal(L.taskSheet.active,true);assert.equal(h.document.querySelectorAll('[role="dialog"]').length,1);assertParent(h);
 h.document.querySelector('.task-sheet-close').click();assert.equal(h.history.pending,1);L.openTab('chat');assert.equal(L.route,'home');h.flushHistory();h.flush();assert.equal(L.route,'chat');assert.equal(L.taskSheet.active,false);assert.equal(h.history.state.route,'chat');assert.equal(h.document.querySelectorAll('[role="dialog"]').length,0);assert.equal(L.state.balance,500);noErrors(h);
});

check('Escape preserves an unfinished draft, and focus is trapped away from inert Home',()=>{
 const h=fixture();open(h);assertParent(h);let sheet=h.document.querySelector('.task-sheet');let controls=sheet.querySelectorAll('button,input,select,textarea,a[href],[tabindex]').filter(el=>!el.disabled&&!el.hidden&&el.tabIndex>=0&&!el.closest('[hidden],[inert]'));assert(controls.length>2);controls.at(-1).focus();h.key('Tab');assert.equal(h.document.activeElement,controls[0]);controls[0].focus();h.key('Tab',{shiftKey:true});assert.equal(h.document.activeElement,controls.at(-1));h.parent.querySelector('button').focus();assert(sheet.contains(h.document.activeElement),'Inert parent cannot take focus');
 clickAction(h,"L.pickMerchant('AK01')");h.set('payment-amount',80);h.key('Escape');h.flush();assert.equal(h.L.route,'paymentCancel');assert(h.L.taskSheet.active);assert.equal(h.L.state.paymentDraft.amount,'80');assert.equal(h.L.state.balance,500);noErrors(h);
});

check('visual viewport resize keeps the actual input reachable and updates sheet geometry',()=>{
 const h=fixture();amount(h,80);const input=h.document.getElementById('payment-amount');input.focus();h.viewport.height=420;h.viewport.offsetTop=28;h.viewport.dispatchEvent(new h.Event('resize'));h.flush();const layer=h.document.querySelector('.task-sheet-layer');assert.equal(layer.style['--task-viewport-height'],'420px');assert.equal(layer.style['--task-viewport-top'],'28px');assert(layer.classList.contains('task-keyboard-open'));assert.equal(h.document.getElementById('payment-amount'),input);assert.equal(input.value,'80');assert(h.scrolls.some(event=>event.id==='payment-amount'));assert.equal(h.L.state.balance,500);noErrors(h);
});

check('dragging the header can close a chooser; short or cancelled drags snap back',()=>{
 const h=fixture();open(h);let header=h.document.querySelector('.task-sheet-chrome');drag(h,header,30);assert.equal(h.L.route,'campusPay');assert(h.L.taskSheet.active);assert.equal(h.document.querySelector('.task-sheet').style['--task-drag-y'],'0px');drag(h,header,100,true);assert.equal(h.L.route,'campusPay');assert(h.L.taskSheet.active);assert.equal(h.document.querySelector('.task-sheet').style['--task-drag-y'],'0px');drag(h,h.document.querySelector('.task-sheet-grab'),100);assert.equal(h.L.route,'home');assert.equal(h.L.taskSheet.active,false);assert.equal(h.L.state.balance,500);noErrors(h);
});

check('draft drag dismissal asks keep/discard, while controls and body cannot start a drag',()=>{
 const h=fixture({reducedMotion:true});amount(h,80);drag(h,h.document.querySelector('.task-sheet-close'),100);assert.equal(h.L.route,'send');assert(h.L.taskSheet.active);drag(h,h.document.getElementById('payment-amount'),100);assert.equal(h.L.route,'send');assert(h.L.taskSheet.active);drag(h,h.document.querySelector('.task-sheet-chrome'),100);assert.equal(h.L.route,'paymentCancel');assert(h.L.taskSheet.active);assert.equal(h.L.state.balance,500);assert.equal(h.L.state.txs.length,0);assert.equal(h.L.state.paymentDraft.amount,'80');assert.equal(h.animations.length,0);noErrors(h);
});

check('reduced motion keeps the identical Pause figures and every working action',()=>{
 const h=fixture({reducedMotion:true});amount(h,280);submit(h);assert.equal(h.L.route,'pause');const pause=h.document.getElementById('view');assert.equal(h.L.route,'pause');assert(pause.textContent.includes('Food and transport would be GH₵130.00 short.'));assert(pause.querySelector('.pause-comparison-after').textContent.includes('220.00'));assert.equal(h.animations.length,0,'Reduced motion creates no JS decorative animations');assert(pause.querySelectorAll('button').some(button=>button.getAttribute('onclick')==='L.resumeFromPause()'));clickAction(h,"L.pauseAction('edit_amount')");assert.equal(h.L.route,'send');assert.equal(h.document.getElementById('payment-amount').value,'280');noErrors(h);
});

check('sheet styles retain scrolling, usable keyboard layout, nonwrapping currency and reduced motion',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../dist/task-sheet.css'),'utf8');assert(css.includes('prefers-reduced-motion'));assert(css.includes('task-keyboard-open'));assert(/overflow-y:\s*auto/.test(css));assert(/min-height:\s*0/.test(css));assert(/\.task-sheet/.test(css));
 const edition=fs.readFileSync(path.join(__dirname,'../dist/clarity-edition.css'),'utf8');assert(/white-space:\s*nowrap/.test(edition));
});

// Common-action coverage matrix: five stable destinations and the existing
// payment, funding, planning, records, profile/security and support flows.
check('explicit Send controller API opens a destination chooser while retaining Home',()=>{
 const h=fixture(),snapshot=base(h,'home');h.L.openPayTab('send');h.flush();assert.equal(h.L.route,'sendOptions');retained(h,snapshot);assert.equal(h.L.state.paymentDraft,null);clickAction(h,"L.startSend('lumo')");assert.equal(h.L.route,'send');retained(h,snapshot);clickAction(h,"L.pickPerson('abena')");h.set('payment-amount',20);retained(h,snapshot);h.document.querySelector('.task-sheet-close').click();h.flush();assert.equal(h.L.route,'paymentCancel');clickAction(h,'L.discardPayment()');assert.equal(h.L.route,'home');assert.equal(h.L.taskSheet.active,false);noErrors(h);
});

check('Home navigation → Pay → Campus Pay → merchant is the customer payment entry',()=>{
 const h=fixture(),{L}=h;assert(!h.parent.querySelectorAll('button').some(button=>/L\.openPayTab\(/.test(button.getAttribute('onclick')||'')),'Home has no spending shortcuts');
 const pay=h.nav.querySelectorAll('button').find(button=>button.getAttribute('onclick')==="L.openTab('pay')");assert(pay);pay.click();h.flush();assert.equal(L.route,'pay');assert.equal(L.taskSheet.active,false);
 clickAction(h,"L.setPayTab('campus')");assert.equal(L.payTab(),'campus');const snapshot=base(h,'pay');
 clickAction(h,"L.pickMerchant('AK01')");assert.equal(L.route,'send');retained(h,snapshot);h.set('payment-amount',80);submit(h);clickAction(h,'L.continuePayment()');assert.equal(L.route,'authorize');h.set('payment-pin','123456');submit(h);assert.equal(L.route,'paymentResult');assert.equal(L.state.balance,420);assert.equal(L.balances().room,70);assert.equal(L.state.txs.length,1);retained(h,snapshot);close(h,snapshot);noErrors(h);
});

check('saved unsubmitted payment remains resumable from Pay after Home spending shortcuts are removed',()=>{
 const h=fixture(),{L}=h;amount(h,280);h.set('payment-note','Keep this choice');const id=L.state.paymentDraft.id;h.document.querySelector('.task-sheet-close').click();h.flush();clickAction(h,'L.keepPaymentLater()');assert.equal(L.route,'home');
 const pay=h.document.getElementById('nav').querySelectorAll('button').find(button=>button.getAttribute('onclick')==="L.openTab('pay')");pay.click();h.flush();const parent=h.document.getElementById('view');assert(parent.querySelector('.compact-draft'));clickAction(h,'L.editPayment()');assert.equal(L.route,'send');assert.equal(L.taskSheet.parentRoute,'pay');assert.equal(L.state.paymentDraft.id,id);assert.equal(h.document.getElementById('payment-amount').value,'280');assert.equal(h.document.getElementById('payment-note').value,'Keep this choice');assert.equal(L.state.balance,500);assert.equal(L.state.txs.length,0);noErrors(h);
});

check('pending payment stays reachable from Pay without a new payment or debit',()=>{
 const h=fixture({testing:true}),{L}=h;amount(h,80);continueToPIN(h);h.set('payment-pin','123456');h.set('payment-outcome','Pending');submit(h);const tx=L.state.txs[0];h.document.querySelector('.task-sheet-close').click();h.flush();assert.equal(L.route,'home');
 const pay=h.document.getElementById('nav').querySelectorAll('button').find(button=>button.getAttribute('onclick')==="L.openTab('pay')");pay.click();h.flush();const trigger=h.document.getElementById('view').querySelectorAll('button').find(button=>button.getAttribute('onclick')==="L.go('pending')");assert(trigger);trigger.focus();trigger.click();h.flush();assert.equal(L.route,'pending');assert.equal(L.taskSheet.parentRoute,'pay');assert(h.document.getElementById('view').textContent.includes(tx.name));assert.equal(L.state.balance,500);assert.equal(L.balances().available,420);assert.equal(L.state.txs.length,1);assert.equal(L.state.txs[0].id,tx.id);h.document.querySelector('.task-sheet-close').click();h.flush();assert.equal(L.route,'pay');assert.equal(L.taskSheet.active,false);assert(h.document.activeElement===trigger,'Pending sheet restores focus to the same Pay link');assert.equal(L.state.txs.length,1);noErrors(h);
});

for(const root of ['home','pay','plan','chat','more'])check(root+' → Help → support details → close keeps the same destination',()=>{
 const h=fixture(),snapshot=base(h,root),{L}=h;L.go('help',{returnTo:root,returnParams:{}});h.flush();assert.equal(L.route,'help');retained(h,snapshot);L.go('supportCase',{kind:'Account question',returnTo:'help',returnParams:{returnTo:root}});h.flush();assert.equal(L.route,'supportCase');retained(h,snapshot);close(h,snapshot);assert.equal(L.state.balance,500);noErrors(h);
});

check('unrelated profile and funding tasks never inherit an earlier unfinished payment cancellation prompt',()=>{
 const h=fixture(),{L}=h;amount(h,80);h.document.querySelector('.task-sheet-close').click();h.flush();clickAction(h,'L.keepPaymentLater()');const draft=L.state.paymentDraft.id;const snapshot=base(h,'more');L.go('profile');retained(h,snapshot);close(h,snapshot);assert.equal(L.state.paymentDraft.id,draft);L.openFunding('more');retained(h,snapshot);close(h,snapshot);assert.equal(L.state.paymentDraft.id,draft);assert.equal(L.state.paymentDraft.submittedTxId,undefined);assert.equal(L.state.txs.length,0);assert.equal(L.state.balance,500);noErrors(h);
});

for(const [method,fee]of [['lumo',0],['momo',.5],['bank',1]])check('Pay → '+method+' recipient → amount → PIN → receipt retains Pay and correct fee',()=>{
 const h=fixture(),snapshot=base(h,'pay'),{L}=h;clickAction(h,"L.startSend('"+method+"')");retained(h,snapshot);assert.equal(L.route,'send');
 h.set('payment-amount',20);h.set('payment-essential','');
 if(method==='lumo')clickAction(h,"L.pickPerson('abena')");else{h.set('recipient-number','bad');submit(h);assert.equal(L.state.paymentDraft.checked,method==='momo'?false:undefined);assert(h.document.getElementById('error').textContent);assert.equal(h.document.getElementById('payment-amount').value,'20','Validation retains the entered amount');h.set('recipient-number',method==='bank'?'102345678901':'0241234567');if(method==='bank')h.set('recipient-provider','GCB Bank');else assert.equal(h.document.getElementById('recipient-provider'),null,'Network comes from lookup');}
 submit(h);assert.equal(L.route,'paymentReview','One valid details submission includes lookup and amount');assert.equal(L.state.paymentDraft.checked,true);assert.equal(L.state.paymentDraft.fee,fee);retained(h,snapshot);assert.equal(L.state.balance,500);clickAction(h,'L.continuePayment()');assert.equal(L.route,'authorize');h.set('payment-pin','123456');submit(h);assert.equal(L.route,'paymentResult');const tx=L.state.txs[0];assert.equal(tx.fee,fee);assert.equal(L.state.balance,480-fee);retained(h,snapshot);clickAction(h,"L.go('txDetail',{id:'"+tx.id+"'})");assert.equal(L.route,'txDetail');retained(h,snapshot);assert(h.document.getElementById('view').textContent.includes('Reference'));close(h,snapshot);assert.equal(L.state.txs.length,1);noErrors(h);
});

for(const kind of ['airtime','data','electricity','water','tv','internet'])check('Pay → '+kind+' bill uses the shared sheet and unchanged authorisation/result logic',()=>{
 const h=fixture(),snapshot=base(h,'pay'),{L}=h;L.startBill(kind);h.flush();assert.equal(L.route,'bill');retained(h,snapshot);const mobile=['airtime','data'].includes(kind),fixed=['data','tv','internet'].includes(kind);h.set('bill-account',mobile?'0241230123':'12345678901');if(fixed)h.set('bill-package',0);else h.set('payment-amount',20);h.set('payment-essential','');submit(h);assert.equal(L.state.paymentDraft.checked,true);assert.equal(L.route,L.paymentNeedsPause(L.state.paymentDraft)?'pause':'paymentReview','Account and amount enter one decision stage');if(L.route==='paymentReview')clickAction(h,'L.continuePayment()');else clickAction(h,'L.resumeFromPause()');assert.equal(L.route,'authorize');assert.equal(L.state.balance,500);h.set('payment-pin','123456');submit(h);assert.equal(L.route,'paymentResult');assert.equal(L.state.txs[0].status,'success');assert.equal(L.state.txs[0].delivery,'delivered');assert.equal(L.state.balance,500-L.state.txs[0].amount);retained(h,snapshot);close(h,snapshot);noErrors(h);
});

check('Home → Request → review → saved request → cancel request never invents received money',()=>{
 const h=fixture(),snapshot=base(h,'home'),{L}=h;clickAction(h,'L.newRequest()');retained(h,snapshot);assert.equal(L.route,'groupMoneyHome');clickAction(h,'L.gm.onePerson()');retained(h,snapshot);h.set('request-amount',25);h.set('request-note','Lunch share');h.set('request-to','Abena Asante');submit(h);assert.equal(L.state.requestDraft.stage,'review');assert.equal(L.state.requests.length,0);clickAction(h,'L.createRequest()');assert.equal(L.route,'requestDetail');const r=L.state.requests[0];assert.equal(r.amount,25);assert.equal(r.status,'waiting');assert.equal(L.state.balance,500);retained(h,snapshot);clickAction(h,"L.go('requestConfirm',{id:'"+r.id+"',action:'cancelled'})");assert.equal(r.status,'waiting');clickAction(h,"L.closeRequest('"+r.id+"','cancelled')");assert.equal(r.status,'cancelled');assert.equal(L.state.txs.length,0);retained(h,snapshot);close(h,snapshot);noErrors(h);
});

check('Home → MoMo funding → review → confirmed sample credit adds exactly once',()=>{
 const h=fixture(),snapshot=base(h,'home'),{L}=h;L.openFunding('home');h.flush();retained(h,snapshot);clickAction(h,'L.startMomoFunding()');assert.equal(h.document.getElementById('funding-network'),null);assert.equal(h.document.getElementById('funding-number').type,'hidden');assert.equal(L.state.fundingDraft.network,'MTN MoMo');h.set('funding-amount',100);h.document.getElementById('funding-owned').checked=true;submit(h);assert.equal(L.state.fundingDraft.stage,'review');assert.equal(L.state.balance,500);retained(h,snapshot);clickAction(h,'L.requestMomoFunding()');assert.equal(L.state.balance,600);assert.equal(L.state.txs.length,1);retained(h,snapshot);L.requestMomoFunding();assert.equal(L.state.balance,600);assert.equal(L.state.txs.length,1);close(h,snapshot);noErrors(h);
});

check('pending incoming MoMo funding can close and stays unavailable until its real simulated result',()=>{
 const h=fixture({testing:true}),snapshot=base(h,'plan'),{L}=h;L.openFunding('plan');L.startMomoFunding();assert.equal(h.document.getElementById('funding-number').value,L.state.profile.phone);h.set('funding-amount',100);h.document.getElementById('funding-owned').checked=true;submit(h);clickAction(h,'L.requestMomoFunding()');assert.equal(L.state.balance,500);assert.equal(L.state.txs[0].status,'pending');const tx=L.state.txs[0];retained(h,snapshot);close(h,snapshot);assert.equal(L.balances().available,500);L.resolveTx(tx.id,'success');assert.equal(L.state.balance,600);L.resolveTx(tx.id,'success');assert.equal(L.state.balance,600);noErrors(h);
});

check('bank receiving details never credit money; confirmed sample bank credit is idempotent',()=>{
 const h=fixture(),snapshot=base(h,'home'),{L}=h;L.openFunding('home');L.startBankFunding();retained(h,snapshot);assert(h.document.getElementById('view').textContent.includes(L.state.profile.account));assert(h.document.getElementById('bank-test-amount'),'Public preview has an explicitly labelled sample funding form');assert(h.document.getElementById('view').textContent.includes('Simulate received money'));L.bankSent();assert.equal(L.state.txs.length,0);assert.equal(L.state.balance,500);close(h,snapshot);
 const t=fixture({testing:true}),s=base(t,'pay');t.L.openFunding('pay');t.L.startBankFunding();t.set('bank-test-amount',90);submit(t);assert.equal(t.L.state.balance,590);assert.equal(t.L.state.txs.length,1);retained(t,s);t.L.testBankCredit();assert.equal(t.L.state.balance,590);assert.equal(t.L.state.txs.length,1);retained(t,s);close(t,s);noErrors(h);noErrors(t);
});

check('payment → add money → funding result → review keeps one host and requires fresh payment review',()=>{
 const h=fixture(),snapshot=base(h,'pay'),{L}=h;L.startSend('lumo');L.pickPerson('abena');h.set('payment-amount',550);submit(h);assert.equal(L.route,'paymentReview');assert.equal(L.state.balance,500);clickAction(h,"L.openFunding('paymentReview')");retained(h,snapshot);clickAction(h,'L.startMomoFunding()');assert.equal(h.document.getElementById('funding-number').value,L.state.profile.phone);h.set('funding-amount',100);h.document.getElementById('funding-owned').checked=true;submit(h);clickAction(h,'L.requestMomoFunding()');assert.equal(L.state.balance,600);retained(h,snapshot);clickAction(h,'L.fundingDone()');assert.equal(L.route,'pause','Funding return re-evaluates the same decision stage');retained(h,snapshot);assert.equal(L.state.paymentDraft.amount,550);assert.equal(L.state.txs.filter(tx=>tx.type==='out').length,0);assert.equal(L.route,'pause');clickAction(h,'L.resumeFromPause()');h.set('payment-pin','123456');submit(h);assert.equal(L.state.balance,50);assert.equal(L.state.txs.length,2);retained(h,snapshot);close(h,snapshot);noErrors(h);
});

check('Plan period and expected allowance save planning facts without changing account money',()=>{
 const h=fixture(),snapshot=base(h,'plan'),{L}=h;L.go('planPeriod');h.flush();retained(h,snapshot);h.set('planPeriodMode','date');L.changePlanPeriod();h.flush();const date=new Date(Date.now()+7*86400000).toISOString().slice(0,10);h.set('planPeriodDate',date);clickAction(h,'L.savePlanPeriod()');assert.equal(L.state.planHorizon.date,date);assert.equal(L.route,'plan');assert.equal(L.taskSheet.active,false);assert.equal(L.state.balance,500);
 L.go('allowance');h.set('allowanceAmount',1000);h.set('allowanceDate',date);h.set('allowanceSource','Family');submit(h);assert.equal(L.state.allowance.amount,1000);assert.equal(L.state.balance,500);assert.equal(L.balances().available,500);assert.equal(L.route,'plan');assert.equal(L.taskSheet.active,false);noErrors(h);
});

check('Plan → essentials edit/save keeps the parent and adjusts the plan without a payment',()=>{
 const h=fixture(),snapshot=base(h,'plan'),{L}=h,prior=JSON.stringify(L.state.essentials);L.go('essentials');retained(h,snapshot);L.go('essentialEdit');
 const category=h.document.getElementById('essName');assert.equal(category.localName,'select','New Budget items use the current seven-category chooser');assert(category.querySelectorAll('option').some(option=>option.value==='Study & fees'),'Choose a category actually offered to customers');
 h.set('essName','Study & fees');h.set('essAmount',25);submit(h);assert.equal(L.route,'essentials');const saved=L.state.essentials.find(item=>item.budgetCategory==='study-fees');assert(saved);assert.equal(saved.name,'Study & fees');assert.equal(saved.amount,25);assert.equal(JSON.stringify(L.state.essentials.filter(item=>item.id!==saved.id)),prior,'Adding the category leaves existing costs unchanged');assert.equal(L.balances().room,125);assert.equal(L.state.balance,500);assert.equal(L.state.txs.length,0);retained(h,snapshot);close(h,snapshot);noErrors(h);
});

check('Money Box creation → funding → PIN → transfer back keeps one host and commits each once',()=>{
 const h=fixture(),snapshot=base(h,'plan'),{L}=h;L.go('goals');L.go('goalEdit');h.set('goalName','Semester book');h.set('goalTarget',500);clickAction(h,'L.saveGoal()');const goal=L.state.goals.find(item=>item.name==='Semester book');assert(goal);assert.equal(goal.allocated,0);retained(h,snapshot);
 L.startMoneyBoxTransfer(goal.id,'in');h.set('allocation',50);submit(h);assert.equal(L.route,'paymentReview');assert.equal(goal.allocated,0);assert.equal(L.state.balance,500);clickAction(h,'L.continuePayment()');assert.equal(L.route,'authorize');h.set('payment-pin','123456');submit(h);assert.equal(L.route,'paymentResult');assert.equal(goal.allocated,50);assert.equal(L.state.balance,450);assert.equal(L.balances().room,100);assert.equal(L.accountBalances().savings,150);retained(h,snapshot);L.authorizePayment();assert.equal(goal.allocated,50);assert.equal(L.state.txs.length,1);
 L.startMoneyBoxTransfer(goal.id,'out');h.set('release',20);submit(h);assert.equal(L.route,'paymentReview');assert.equal(goal.allocated,50);clickAction(h,'L.continuePayment()');assert.equal(L.route,'authorize');h.set('payment-pin','123456');submit(h);assert.equal(goal.allocated,30);assert.equal(L.balances().room,120);assert.equal(L.state.balance,470);assert.equal(L.accountBalances().savings,130);assert.equal(L.accountBalances().total,600);L.authorizePayment();assert.equal(goal.allocated,30);assert.equal(L.state.txs.length,2);assert(L.state.txs.every(t=>L.isInternalTransfer(t)));retained(h,snapshot);close(h,snapshot);noErrors(h);
});

check('More → profile edit → save and notification controls keep More mounted',()=>{
 const h=fixture(),snapshot=base(h,'more'),{L}=h;L.go('profile');retained(h,snapshot);clickAction(h,"L.go('profileEdit')");h.set('displayName','Ama Mensah');h.set('handle','ama.m');h.set('email','ama@example.com');clickAction(h,'L.acct.saveProfile()');assert.equal(L.route,'profile');assert.equal(L.state.profile.displayName,'Ama Mensah');retained(h,snapshot);L.go('notificationPrefs');const before=L.state.prefs.payment;clickAction(h,"L.acct.togglePref('payment')");assert.notEqual(L.state.prefs.payment,before);retained(h,snapshot);close(h,snapshot);assert(h.document.getElementById('view').textContent.includes('Ama Mensah'));assert.equal(L.state.balance,500);noErrors(h);
});

check('closing and reopening settings keeps safe drafts while clearing PIN and verification fields',()=>{
 const h=fixture(),snapshot=base(h,'more'),{L}=h;L.go('profileEdit');h.set('displayName','Unfinished name');close(h,snapshot);assert.notEqual(L.state.profile.displayName,'Unfinished name');L.go('profileEdit');assert.equal(h.document.getElementById('displayName').value,'Unfinished name');retained(h,snapshot);L.go('changePin');h.set('authPin','123456');h.set('newPin','654321');h.set('confirmNewPin','654321');close(h,snapshot);assert.equal(L.state.profile.pin,'123456');L.go('changePin');for(const id of ['authPin','newPin','confirmNewPin'])assert.equal(h.document.getElementById(id).value,'');retained(h,snapshot);close(h,snapshot);noErrors(h);
});

check('Chat action → Money Box transfer back → PIN returns to the same conversation',()=>{
 const h=fixture(),{L}=h;L.state.chats=[{q:'Can I spend GH₵80?',...L.chatAnswer('Can I spend GH₵80?')}];const snapshot=base(h,'chat'),thread=h.document.getElementById('view').querySelector('.chat-thread'),chatText=h.document.getElementById('view').textContent;h.set('chatText','Unsent follow-up question');L.go('makeRoom',{returnTo:'chat'});retained(h,snapshot);L.startMoneyBoxTransfer('laptop','out');retained(h,snapshot);h.set('release',25);submit(h);assert.equal(L.route,'paymentReview');retained(h,snapshot);clickAction(h,'L.continuePayment()');assert.equal(L.route,'authorize');h.set('payment-pin','123456');submit(h);assert.equal(L.state.goals[0].allocated,75);assert.equal(L.state.balance,525);assert.equal(L.accountBalances().total,600);retained(h,snapshot);close(h,snapshot);assert.equal(L.route,'chat');assert.equal(L.state.chats.length,1);assert(h.document.getElementById('view').textContent.includes('Can I spend GH₵80?'));assert.equal(h.document.getElementById('chatText').value,'Unsent follow-up question');assert(thread&&chatText.includes('Can I spend GH₵80?'));noErrors(h);
});

check('branded essential removal supports cancel and accept without a browser confirmation',()=>{
 const h=fixture(),snapshot=base(h,'plan'),{L}=h;h.context.confirm=()=>{throw Error('Unexpected browser confirmation');};L.go('essentialEdit',{id:'food'});clickAction(h,'L.removeEssential()');assert.equal(L.route,'budgetDelete');assert(L.state.essentials.some(item=>item.id==='food'));retained(h,snapshot);clickAction(h,'L.budgetOverview.cancelDelete()');assert.equal(L.route,'essentialEdit');assert(L.state.essentials.some(item=>item.id==='food'));clickAction(h,'L.removeEssential()');retained(h,snapshot);clickAction(h,'L.budgetOverview.confirmDelete()');assert.equal(L.route,'plan');assert.equal(L.taskSheet.active,false);assert.equal(h.document.getElementById('view'),snapshot.parent,'Deletion returns to the retained Plan outlet');assert(!L.state.essentials.some(item=>item.id==='food'));assert.equal(L.state.balance,500);assert.equal(L.state.txs.length,0);noErrors(h);
});

check('pending linked-payment guards run before a destructive choice and again on acceptance',()=>{
 const h=fixture(),snapshot=base(h,'plan'),{L}=h;const held=L.addTx({type:'out',name:'Lunch',amount:20,fee:0,status:'pending',essentialId:'food'});L.go('essentialEdit',{id:'food'});clickAction(h,'L.removeEssential()');assert.equal(L.route,'essentialEdit');assert.match(h.document.getElementById('error').textContent,/pending/);assert(L.state.essentials.some(item=>item.id==='food'));L.resolveTx(held.id,'failed');clickAction(h,'L.removeEssential()');assert.equal(L.route,'budgetDelete');const newHeld=L.addTx({type:'out',name:'Lunch two',amount:20,fee:0,status:'pending',essentialId:'food'});clickAction(h,'L.budgetOverview.confirmDelete()');assert.equal(L.route,'budgetDelete','A new pending payment keeps the deletion unconfirmed');assert(L.state.essentials.some(item=>item.id==='food'));assert.match(h.document.getElementById('error').textContent,/linked payment.*pending/);assert.equal(newHeld.status,'pending');assert.equal(L.state.balance,500);retained(h,snapshot);close(h,snapshot);assert.equal(L.budgetOverview.confirmDelete(),false,'A dismissed choice cannot execute outside its confirmation');assert(L.state.essentials.some(item=>item.id==='food'));noErrors(h);
});

check('funded Money Box cannot be archived; confirmed transfer back permits a reversible archive',()=>{
 const h=fixture(),snapshot=base(h,'plan'),{L}=h;L.go('goal',{id:'laptop'});clickAction(h,`L.archiveGoal("laptop")`);assert.equal(L.route,'goal');assert.equal(L.state.goals.length,1);assert(!L.state.goals[0].archived);assert.equal(L.balances().room,150);assert.equal(L.state.balance,500);assert.equal(L.accountBalances().savings,100);retained(h,snapshot);
 L.startMoneyBoxTransfer('laptop','out');h.set('release',100);submit(h);clickAction(h,'L.continuePayment()');h.set('payment-pin','123456');submit(h);assert.equal(L.state.balance,600);assert.equal(L.accountBalances().savings,0);assert.equal(L.balances().room,250);L.go('goal',{id:'laptop'});clickAction(h,`L.archiveGoal("laptop")`);assert.equal(L.route,'goals');assert.equal(L.state.goals.length,1,'Archived boxes retain their identity and history');assert.equal(L.state.goals[0].archived,true);assert.equal(L.state.txs.length,1);assert.equal(L.accountBalances().total,600);L.restoreMoneyBox('laptop');assert.equal(L.route,'goal');assert.equal(L.state.goals[0].archived,false);retained(h,snapshot);close(h,snapshot);noErrors(h);
});

check('branded profile discard cancel restores the draft; accepting discards it on the next edit',()=>{
 const h=fixture(),snapshot=base(h,'more'),{L}=h;L.go('profileEdit');const original=h.document.getElementById('displayName').value;h.set('displayName','Not saved');clickAction(h,'L.confirmProfileDiscard()');assert.equal(L.route,'actionConfirm');clickAction(h,'L.cancelNativeDecision()');assert.equal(L.route,'profileEdit');assert.equal(h.document.getElementById('displayName').value,'Not saved');clickAction(h,'L.confirmProfileDiscard()');clickAction(h,'L.acceptNativeDecision()');assert.equal(L.route,'profile');assert.notEqual(L.state.profile.displayName,'Not saved');clickAction(h,"L.go('profileEdit')");assert.equal(h.document.getElementById('displayName').value,original);retained(h,snapshot);close(h,snapshot);noErrors(h);
});

check('phone change validates first and requires an explicit branded confirmation before changing the profile',()=>{
 const h=fixture(),snapshot=base(h,'more'),{L}=h;L.go('profilePhone');h.set('authPin','000000');h.set('newPhone','0245551234');h.set('phoneOtp','123456');clickAction(h,'L.acct.savePhone()');assert.equal(L.route,'profilePhone');assert.equal(L.state.profile.phone,'0241230123');h.set('authPin','123456');h.set('newPhone','bad');clickAction(h,'L.acct.savePhone()');assert.equal(L.route,'profilePhone');h.set('newPhone','0245551234');h.set('phoneOtp','000000');clickAction(h,'L.acct.savePhone()');assert.equal(L.route,'profilePhone');h.set('phoneOtp','123456');clickAction(h,'L.acct.savePhone()');assert.equal(L.route,'actionConfirm');assert.equal(L.state.profile.phone,'0241230123');retained(h,snapshot);const confirmationPin=h.document.getElementById('native-decision-pin');if(confirmationPin)h.set('native-decision-pin','123456');clickAction(h,'L.acceptNativeDecision()');assert.equal(L.route,'profile');assert.equal(L.state.profile.phone,'0245551234');assert.equal(L.state.balance,500);retained(h,snapshot);close(h,snapshot);L.go('profilePhone');assert.equal(h.document.getElementById('authPin').value,'');assert.equal(h.document.getElementById('phoneOtp').value,'');noErrors(h);
});

check('dismissing a branded sign-out choice cannot leave an executable stale decision',()=>{
 const h=fixture(),snapshot=base(h,'more'),{L}=h;clickAction(h,'L.acct.signout()');assert.equal(L.route,'actionConfirm');close(h,snapshot);assert.equal(L.state.locked,false);L.go('actionConfirm');assert(!h.document.getElementById('view').querySelectorAll('button').some(button=>button.getAttribute('onclick')==='L.acceptNativeDecision()'),'Dismissed choice cannot be accepted later');L.acceptNativeDecision();assert.equal(L.state.locked,false);assert.equal(L.state.balance,500);assert.equal(L.state.txs.length,0);noErrors(h);
});

check('dismissing a phone confirmation clears detached PIN and OTP controls and cannot change the phone',()=>{
 const h=fixture(),snapshot=base(h,'more'),{L}=h;L.go('profilePhone');const pin=h.set('authPin','123456'),otp=h.set('phoneOtp','123456');h.set('newPhone','0245551234');clickAction(h,'L.acct.savePhone()');assert.equal(L.route,'actionConfirm');assert.equal(L.state.profile.phone,'0241230123');close(h,snapshot);assert.equal(pin.value,'');assert.equal(otp.value,'');assert.equal(L.state.profile.phone,'0241230123');L.go('profilePhone');assert.equal(h.document.getElementById('authPin').value,'');assert.equal(h.document.getElementById('phoneOtp').value,'');assert.equal(L.state.profile.phone,'0241230123');noErrors(h);
});

check('branded sign-out cancels safely, then locks only after acceptance and removes the task',()=>{
 const h=fixture(),snapshot=base(h,'more'),{L}=h;clickAction(h,'L.acct.signout()');assert.equal(L.route,'actionConfirm');assert.equal(L.state.locked,false);retained(h,snapshot);clickAction(h,'L.cancelNativeDecision()');assert.equal(L.route,'more');assert.equal(L.state.locked,false);clickAction(h,'L.acct.signout()');clickAction(h,'L.acceptNativeDecision()');assert.equal(L.state.locked,true);assert.equal(L.route,'welcome');assert.equal(L.taskSheet.active,false);assert.equal(h.document.querySelectorAll('[role="dialog"]').length,0);assert.equal(L.state.balance,500);assert.equal(L.state.txs.length,0);noErrors(h);
});

check('reset and sample replacement clear session field drafts from the previous demo account',()=>{
 for(const resetFirst of [true,false]){
  const h=fixture(),snapshot=base(h,'more'),{L}=h;L.go('profileEdit');h.set('displayName','Old account unsaved draft');close(h,snapshot);
  const previous=L.state;if(resetFirst){L.reset();h.flush();assert.notEqual(L.state,previous);}
  L.explore();h.flush();assert.notEqual(L.state,previous);base(h,'more');L.go('profileEdit');h.flush();
  assert.equal(h.document.getElementById('displayName').value,L.state.profile.displayName||L.state.profile.name);
  assert.notEqual(h.document.getElementById('displayName').value,'Old account unsaved draft');noErrors(h);
 }
});

check('reset and sample replacement clear a pending phone decision and its detached PIN and OTP',()=>{
 for(const resetFirst of [true,false]){
  const h=fixture(),{L}=h;base(h,'more');L.go('profilePhone');
  const pin=h.set('authPin','123456'),otp=h.set('phoneOtp','123456');h.set('newPhone','0245551234');clickAction(h,'L.acct.savePhone()');assert.equal(L.route,'actionConfirm');
  const previous=L.state;if(resetFirst){L.reset();h.flush();}
  L.explore();h.flush();assert.notEqual(L.state,previous);assert.equal(pin.value,'');assert.equal(otp.value,'');assert.equal(L.taskSheet.active,false);
  const phone=L.state.profile.phone;L.acceptNativeDecision();h.flush();assert.equal(L.state.profile.phone,phone);assert.notEqual(phone,'0245551234');
  L.go('actionConfirm');h.flush();assert(!h.document.getElementById('view').querySelectorAll('button').some(button=>button.getAttribute('onclick')==='L.acceptNativeDecision()'));assert.equal(L.state.profile.phone,phone);noErrors(h);
 }
});

console.log(count+' actual task-sheet behavior checks passed. VM DOM checks do not replace browser/phone layout QA.');
