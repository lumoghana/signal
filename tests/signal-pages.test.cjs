/* Signal's page hierarchy, mounted through the actual shipped bundle.
   The DOM harness verifies behavior and semantics; browser QA owns geometry. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const settle=h=>{for(let i=0;i<3;i++){h.flushHistory();h.flush();}};
const view=h=>h.document.getElementById('view');
const layer=h=>h.document.querySelector('.task-sheet-layer');
const surface=h=>h.document.querySelector('.task-sheet');
const money=L=>JSON.stringify([L.state.balance,L.state.accounts,L.state.txs,L.state.essentials,L.state.goals,L.state.requests,L.state.virtualCards,L.state.groupMoney?.items||[],L.state.savingsHacks]);
function fixture(){
 const h=createHarness({clock:true,deferHistory:true}),L=h.L;L.explore();L.ensureAccounts();
 const date=new h.context.Date(h.context.Date.now()+10*86400000).toISOString().slice(0,10);
 Object.assign(L.state,{balance:1000,txs:[],paymentDraft:null,chats:[],requests:[],essentials:[{id:'food',name:'Food',amount:200,paid:0,externalPaid:0,coverageVersion:1}],goals:[{id:'buffer',name:'Emergency buffer',allocated:120,target:600,boxVersion:2}],allowance:{amount:4000,date},planHorizon:{mode:'allowance',date},planSaved:true});
 L.openTab('home');L.showPrivateMoney();L.render();settle(h);assert(L.signalNavigation,'The actual shipped page adapter is loaded');return h;
}
const clean=h=>assert.deepEqual(h.errors,[]);
function assertPage(h){
 assert.equal(layer(h).getAttribute('data-signal-surface'),'page');
 assert.equal(surface(h).getAttribute('role'),'region');
 assert.equal(surface(h).getAttribute('aria-modal'),null);
 assert.equal(surface(h).getAttribute('aria-labelledby'),'task-sheet-title');
 assert.equal(h.document.querySelectorAll('.task-sheet[role="dialog"]').length,0);
 for(const selector of ['.task-sheet-backdrop','.task-sheet-grab','.task-sheet-close'])assert.equal(layer(h).querySelector(selector).hidden,true,selector+' is absent from page chrome');
 assert.equal(surface(h).querySelector('.task-sheet-back').hidden,false);
 for(const button of surface(h).querySelectorAll('.task-sheet-body button'))if(button.textContent.trim()==='Close'&&button.getAttribute('onclick')?.includes('L.closeTask()'))assert.equal(button.hidden,true,'Legacy whole-journey Close does not appear on a page');
}
function assertSheet(h){
 assert.equal(layer(h).getAttribute('data-signal-surface'),'sheet');
 assert.equal(surface(h).getAttribute('role'),'dialog');assert.equal(surface(h).getAttribute('aria-modal'),'true');
 assert.equal(layer(h).querySelector('.task-sheet-backdrop').hidden,false);
}

test('Signal defaults destinations to pages and reserves the sheet policy for explicit short choices',()=>{
 const h=fixture(),N=h.L.signalNavigation;
 for(const route of ['goals','goal','profile','groupMoneyHome','iouHome','allMoney','notifications','send','paymentReview','pause','authorize','paymentResult','collectionPayoutRail'])assert.equal(N.surfaceFor(route),'page',route+' is a complete page');
 for(const route of ['addMoney','chatBankingActions','paymentCancel','categoryEdit','actionConfirm'])assert.equal(N.surfaceFor(route),'sheet',route+' is eligible for a contextual choice');
 assert.equal(N.surfaceFor('monoMenu'),'drawer');assert.equal(N.surfaceFor('futureDestination'),'page');
 assert.equal(new Set(Array.from(N.sheetCandidates)).size,14);assert(Object.isFrozen(N.sheetCandidates));clean(h);
});

test('Money Boxes, Profile, Collect, IOUs and records are nonmodal pages with native return and unchanged money',()=>{
 for(const route of ['goals','profile','groupMoneyHome','iouHome','allMoney','notifications']){
  const h=fixture(),L=h.L,parent=view(h),nav=h.document.getElementById('nav'),nodes=[...nav.children],before=money(L);
  parent.scrollTop=73;L.go(route);settle(h);assert.equal(L.route,route);assertPage(h);
  assert(L.taskSheet.active,'The existing guarded navigation controller remains authoritative');assert.equal(L.taskSheet.parentRoute,'home');
  assert.equal(money(L),before);L.back();settle(h);
  assert.equal(L.route,'home');assert.equal(L.taskSheet.active,false);assert(view(h)===parent);assert.equal(parent.scrollTop,73);
  assert.equal(layer(h),null);assert.equal(nav.inert,false);assert.deepEqual([...nav.children],nodes);assert.equal(money(L),before);clean(h);
 }
});

test('native Back and Escape move through page steps without dismissing the whole journey',()=>{
 const h=fixture(),L=h.L,before=money(L);L.go('goals');settle(h);L.go('goal',{id:'buffer'});settle(h);assertPage(h);
 h.key('Escape');settle(h);assert.equal(L.route,'goals');assertPage(h);assert.equal(L.taskSheet.parentRoute,'home');
 h.history.back();settle(h);assert.equal(L.route,'home');assert.equal(layer(h),null);
 for(const node of [h.document.getElementById('app'),h.document.body])assert.equal(node.getAttribute('data-signal-surface'),null,'Native history completion clears page chrome after its captured renderer');
 assert.equal(money(L),before);clean(h);
});

test('a short funding choice becomes a page for the form and returns to the original choice sheet',()=>{
 const h=fixture(),L=h.L,before=money(L);L.openFunding('home');settle(h);assert.equal(L.route,'addMoney');assertSheet(h);
 const choice=view(h).querySelectorAll('button').find(b=>b.getAttribute('onclick')==='L.startMomoFunding()');assert(choice);choice.click();settle(h);
 assert.equal(L.route,'momoAdd');assertPage(h);assert(h.document.getElementById('funding-amount'));assert.equal(money(L),before);
 L.back();settle(h);assert.equal(L.route,'addMoney');assertSheet(h);assert.equal(L.taskSheet.parentRoute,'home');
 L.closeTask();settle(h);assert.equal(L.route,'home');assert.equal(L.taskSheet.active,false);assert.equal(layer(h),null);assert.equal(L.signalNavigation.surface,'page');assert.equal(money(L),before);clean(h);
});

test('a page-local cancellation keeps its page context and the existing explicit draft decision',()=>{
 const h=fixture(),L=h.L,before=money(L);L.pickMerchant('AK01');settle(h);assert.equal(L.route,'send');assertPage(h);
 h.set('payment-amount',80);const draft=L.state.paymentDraft.id;L.closeTask();settle(h);
 assert.equal(L.route,'paymentCancel');assertPage(h,'A flow choice must not expose the original Home behind a misleading sheet');
 assert.equal(L.state.paymentDraft.id,draft);assert.equal(Number(L.state.paymentDraft.amount),80);assert.equal(money(L),before);
 const keep=view(h).querySelectorAll('button').find(b=>b.getAttribute('onclick')==='L.keepPaymentLater()');assert(keep);keep.click();settle(h);
 assert.equal(L.route,'home');assert.equal(L.taskSheet.active,false);assert.equal(L.state.paymentDraft.id,draft);assert.equal(Number(L.state.paymentDraft.amount),80);assert.equal(money(L),before);clean(h);
});

test('pages permit default Tab behavior and cannot be dismissed by a vertical header drag',()=>{
 const h=fixture(),L=h.L,before=money(L);L.go('profile');settle(h);assertPage(h);
 const page=surface(h),controls=page.querySelectorAll('button,input,select,textarea,a[href],summary,[tabindex]').filter(e=>!e.disabled&&!e.hidden&&e.tabIndex>=0&&!e.closest('[hidden],[inert]'));
 const last=controls.at(-1);assert(last);last.focus();const tab=new h.Event('keydown',{key:'Tab'});last.dispatchEvent(tab);
 assert.equal(tab.defaultPrevented,false,'Page navigation does not use the modal Tab trap');assert(h.document.activeElement===last,'The harness leaves browser-default Tab movement to browser QA');
 const header=page.querySelector('.task-sheet-chrome');
 for(const [type,y]of [['pointerdown',10],['pointermove',140],['pointerup',140]])header.dispatchEvent(new h.Event(type,{pointerId:9,clientX:180,clientY:y}));settle(h);
 assert.equal(L.route,'profile');assertPage(h);assert.equal(layer(h).classList.contains('is-dragging'),false);assert.equal(money(L),before);clean(h);
});

test('short root sheets retain native drag dismissal while Menu keeps its existing modal drawer',()=>{
 const h=fixture(),L=h.L,before=money(L),parent=view(h),nav=h.document.getElementById('nav'),nodes=[...nav.children];
 L.openFunding('home');settle(h);assertSheet(h);const header=surface(h).querySelector('.task-sheet-chrome');
 for(const [type,y]of [['pointerdown',10],['pointermove',140],['pointerup',140]])header.dispatchEvent(new h.Event(type,{pointerId:10,clientX:180,clientY:y}));settle(h);
 assert.equal(L.route,'home');assert.equal(layer(h),null);assert.equal(L.taskSheet.active,false);
 parent.scrollTop=91;const trigger=nodes[2];trigger.focus();trigger.click();settle(h);
 assert.equal(L.route,'monoMenu');assert.equal(layer(h).getAttribute('data-signal-surface'),'drawer');assert.equal(surface(h).getAttribute('role'),'dialog');assert.equal(surface(h).getAttribute('aria-modal'),'true');
 assert.equal(surface(h).id,'mono-menu-dialog');h.key('Escape');settle(h);
 assert.equal(L.route,'home');assert(view(h)===parent);assert.equal(parent.scrollTop,91);assert.deepEqual([...nav.children],nodes);assert(h.document.activeElement===trigger);assert.equal(money(L),before);clean(h);
});

test('page frames use the visible app bounds on desktop and resize for a keyboard viewport',()=>{
 const h=fixture(),app=h.document.getElementById('app');app.getBoundingClientRect=()=>({left:640,right:1080,top:24,bottom:912,width:440,height:888});h.context.innerHeight=936;h.viewport.height=936;
 h.L.go('profile');settle(h);h.L.signalNavigation.sync();const pageLayer=layer(h);
 assert.equal(pageLayer.style['--signal-page-left'],'640px');assert.equal(pageLayer.style['--signal-page-top'],'24px');assert.equal(pageLayer.style['--signal-page-width'],'440px');assert.equal(pageLayer.style['--signal-page-height'],'888px');
 h.viewport.offsetTop=120;h.viewport.height=400;h.viewport.dispatchEvent(new h.Event('resize'));h.flush();h.L.signalNavigation.sync();
 assert.equal(pageLayer.style['--signal-page-top'],'120px');assert.equal(pageLayer.style['--signal-page-height'],'400px');assertPage(h);clean(h);
});
