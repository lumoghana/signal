/* The three primary destinations use the actual shipped index. These checks
   exercise native history, retained tasks and drafts; browser layout is separate. */
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const primaryLabel=button=>(button.querySelector('.signal-action-label')||button).textContent.trim();
const view=h=>h.document.getElementById('view');
const nav=h=>h.document.getElementById('nav');
const settle=h=>{h.flushHistory();h.flush();};
const clean=h=>assert.deepEqual(h.errors,[]);
// The shipped controller also supports browsers where the older core Window
// listener restores the parent before the task controller receives popstate.
// Exercise that ordering in addition to the miniature DOM's capture-first one.
function coreFirstHistory(h){
 h.context.addEventListener('test-history-order',event=>{
  const target=event.currentTarget,dispatch=target.dispatchEvent;
  target.dispatchEvent=function(next){
   if(next.type!=='popstate')return dispatch.call(this,next);
   if(!next.target)next.target=this;
   this._fire(next,false);if(!next._immediate)this._fire(next,true);
   return !next.defaultPrevented;
  };
 });
 h.emit('test-history-order');
}
const labels=['Home','Ask Lumo','Menu'];
const handlers=["L.openTab('home')",'L.openBankingChat()','L.openMonoMenu()'];
const roots=['home','chat','more','plan','pay','moneyStoryHome','cardsHome'];
const required=['iouHome','allMoney','recoveryStart','pay','groupMoneyHome','cardsHome','activity','plan','goals','moneyStoryHome','profile','accountInfo','security','privacy','notificationPrefs','help','ambassadorGuide','feedback'];
const money=L=>JSON.stringify({balance:L.state.balance,accounts:L.state.accounts,txs:L.state.txs,essentials:L.state.essentials,goals:L.state.goals,requests:L.state.requests,virtualCards:L.state.virtualCards,groupMoney:L.state.groupMoney?.items||[],savingsHacks:L.state.savingsHacks});
function fixture(options={}){const h=createHarness({clock:true,deferHistory:true,...options});h.L.explore();h.L.render();settle(h);return h;}
function ask(h){const b=h.L.route==='home'?view(h).querySelector('.mono-conversation-open'):view(h).querySelectorAll('button').find(x=>x.getAttribute('onclick')==='L.openBankingChat()');assert(b,'Ask Lumo entry on '+h.L.route);b.click();settle(h);return b;}
function tab(h,label){const b=nav(h).querySelectorAll('button').find(x=>x.textContent.trim()===label);assert(b,'Primary '+label+' on '+h.L.route);b.click();settle(h);return b;}
function story(h){const b=view(h).querySelector('.signal-story-card button');assert(b,'Home Money Story destination');b.click();settle(h);return b;}
// The small DOM fixture models a summary's default click but not the browser's
// reflected details.open property or inline toggle attribute. Complete those
// native effects here; the runtime callback and all leaf handlers remain real.
function toggleMenuGroup(h,id){
 const details=view(h).querySelector('details[data-menu-group="'+id+'"]');assert(details,'Menu disclosure '+id);
 const summary=details.querySelector('summary');assert(summary);summary.click();details.open=details.hasAttribute('open');
 assert.equal(details.getAttribute('ontoggle'),'L.monoMenuDisclosure(this)');h.L.monoMenuDisclosure(details);settle(h);return details;
}
function item(h,route){const b=view(h).querySelector('[data-menu-route="'+route+'"]');assert(b,'Menu entry '+route);const details=b.closest('details');if(details&&!details.hasAttribute('open')){if(details.dataset.menuGroup)toggleMenuGroup(h,details.dataset.menuGroup);else details.querySelector('summary').click();}return b;}
function assertNav(h,route){
 assert.equal(nav(h).hidden,false,'Primary navigation visible on '+route);
 assert.deepEqual(nav(h).querySelectorAll('button').map(x=>x.textContent.trim()),labels);
 assert.deepEqual(nav(h).querySelectorAll('button').map(x=>x.getAttribute('onclick')),handlers);
 const active=nav(h).querySelectorAll('[aria-current="page"]');assert.equal(active.length,1);
 assert.equal(active[0].textContent.trim(),route==='home'?'Home':route==='chat'?'Ask Lumo':'Menu');
}

test('all existing main surfaces use exactly Home, Ask Lumo and Menu without moving money',()=>{
 const h=fixture(),before=money(h.L);
 for(const route of roots){h.L.openTab(route);settle(h);assert.equal(h.L.route,route);assertNav(h,route);assert.equal(h.L.taskSheet.active,false);assert.equal(money(h.L),before);if(route==='home'){assert.equal(view(h).querySelector('.hibiscus-root-chat'),null);assert(view(h).querySelector('.mono-conversation-open'));}else if(route!=='chat')assert(view(h).querySelector('.hibiscus-root-chat'),'Other main pages keep their Chat shortcut');}
 clean(h);
});

for(const coreFirst of [false,true])test('Signal Home Money Story destination opens the dashboard with matching history and native Back/Forward ('+(coreFirst?'core listener first':'capture first')+')',()=>{
 const h=fixture(),before=money(h.L);if(coreFirst)coreFirstHistory(h);
 const card=view(h).querySelector('.mono-conversation-card');assert(card,'Home presents the contextual conversation card');
 assert(view(h).querySelector('.signal-story-card'),'Story has a direct Home destination');
 const entry=view(h).querySelector('.signal-story-card button');assert(entry);assert.equal(entry.localName,'button');
 const assertPage=route=>{
  assert.equal(h.L.route,route);assert.equal(h.history.state.route,route);assert.equal(h.history.state.taskSheet,undefined);
  assert.equal(h.L.taskSheet.active,false);assert.equal(h.document.querySelector('.task-sheet-layer'),null);
  assert(view(h).querySelector('.screen-'+route));assertNav(h,route);
  if(route==='moneyStoryHome')assert(view(h).querySelector('[data-money-story-dashboard]'),'The actual analytics dashboard is mounted');
  else assert(view(h).querySelector('.mono-conversation-card'),'Back restores the Home conversation');
 };
 entry.click();settle(h);assertPage('moneyStoryHome');
 assert.deepEqual(h.entries.map(entry=>entry.route),['home','moneyStoryHome']);
 h.history.back();settle(h);assertPage('home');h.history.forward();settle(h);assertPage('moneyStoryHome');
 assert.equal(money(h.L),before);clean(h);
});

test('Signal Home Money Story destination shows the confirmed seven-day ledger, includes fees and updates without changing money',()=>{
 const h=fixture(),{L}=h,row=(id,amount,category,extra={})=>({id,name:'Campus shop',amount,fee:0,category,type:'out',status:'success',date:new h.context.Date(h.context.Date.now()-86400000).toISOString(),...extra});
 L.state.txs=[row('food',35,'Food',{fee:1}),row('data',45,'Data'),row('pending',900,'Transport',{status:'pending'}),row('failed',900,'Transport',{status:'failed'}),row('reversed',900,'Transport',{status:'reversed'}),row('topup',900,'Transfers',{type:'internal',internalTransfer:true,virtualCardTransfer:true}),row('box',900,'Savings',{internalTransfer:true}),row('incoming',900,'Allowance',{type:'in'}),row('old',900,'Transport',{date:new h.context.Date(h.context.Date.now()-8*86400000).toISOString()})];
 const before=money(L);L.render();settle(h);story(h);
 assert(view(h).querySelector('.ms-insights').textContent.includes('Data made up 56% of money out.'),'Only completed external money out and its fees count');
 assert.equal(money(L),before);
 L.state.txs.find(t=>t.id==='pending').status='success';const updated=money(L);L.render();settle(h);
 assert(view(h).querySelector('.ms-insights').textContent.includes('Transport made up 92% of money out.'),'A newly confirmed payment updates the Story insight');
 assert.equal(money(L),updated);clean(h);
});

test('Signal Home Money Story destination gives honest empty, tied, transfer and uncategorised insights',()=>{
 const h=fixture(),{L}=h,row=(id,amount,category)=>({id,name:'Recorded payment',amount,fee:0,category,type:'out',status:'success',date:new h.context.Date(h.context.Date.now()-60000).toISOString()});
 for(const [rows,expected]of [
  [[], 'No completed payments in this period.'],
  [[row('food',40,'Food'),row('transport',40,'Transport')], '2 categories share the largest amount.'],
  [[row('sent',60,'Transfers'),row('data',40,'Data')], L.money(60)+' was money sent to others.'],
  [[row('unknown',60,'Uncategorised'),row('data',40,'Data')], L.money(60)+' still needs a category.']
 ]){
  L.state.txs=rows;const before=money(L);L.openTab('home');L.render();settle(h);story(h);
  assert(view(h).textContent.includes('Last 7 days'));
  assert(view(h).textContent.includes(expected),expected);assert.equal(money(L),before);
 }
 clean(h);
});

test('Menu groups every existing money, planning and account destination once',()=>{
 const h=fixture();tab(h,'Menu');assert.equal(h.L.route,'monoMenu');assert.equal(h.L.taskSheet.parentRoute,'home');const menu=view(h).querySelector('.mono-menu');assert(menu);
 const groups=menu.querySelectorAll('[data-menu-group]');assert(groups.length>=3,'Distinct financial, planning and account groupings');
 for(const route of required){const entries=menu.querySelectorAll('[data-menu-route="'+route+'"]');assert.equal(entries.length,1,'One clear entry for '+route);assert(entries[0].closest('[data-menu-group]'),'Grouped '+route);}
 assert(menu.querySelectorAll('button').some(b=>b.getAttribute('onclick')==='L.monoMenuSignout()'),'Existing sign out remains available');
 clean(h);
});

test('Menu keeps the existing money destinations and the three new journeys visible outside disclosures',()=>{
 const h=fixture(),before=money(h.L);tab(h,'Menu');const menu=view(h).querySelector('.mono-menu');
 for(const route of ['iouHome','allMoney','recoveryStart','pay','groupMoneyHome','cardsHome','activity','plan','goals','moneyStoryHome']){
  const entry=menu.querySelector('[data-menu-route="'+route+'"]');assert(entry);assert.equal(entry.closest('details'),null,'Always visible '+route);
 }
 assert.equal(menu.querySelector('[data-menu-group="move"]').localName,'section');assert.equal(menu.querySelector('[data-menu-group="plan"]').localName,'section');
 const account=menu.querySelector('[data-menu-group="account"]'),support=menu.querySelector('[data-menu-group="support"]');
 for(const section of [account,support]){assert.equal(section.localName,'details');assert.equal(section.hasAttribute('open'),false);assert.equal(section.firstElementChild.localName,'summary');assert.equal(section.querySelector('summary').getAttribute('role'),null,'Native summary semantics stay intact');assert(section.querySelector('summary svg'),'Disclosure direction is visible');}
 for(const name of ['Profile','account details','security','privacy','notifications'])assert(account.querySelector('summary').textContent.includes(name),'Closed Account preview names '+name);
 for(const name of ['Help','feedback','ambassador guide'])assert(support.querySelector('summary').textContent.includes(name),'Closed Support preview names '+name);
 assert.equal(menu.querySelectorAll('[data-menu-route]').length,required.length);assert.equal(money(h.L),before);clean(h);
});

test('secondary Menu disclosures open independently and remember the customer choice without changing saved money',()=>{
 const h=fixture(),before=money(h.L);tab(h,'Menu');const saved=[...h.store.entries()];
 toggleMenuGroup(h,'account');toggleMenuGroup(h,'support');
 assert(view(h).querySelector('[data-menu-group="account"]').hasAttribute('open'));assert(view(h).querySelector('[data-menu-group="support"]').hasAttribute('open'),'Opening Support keeps Account open');
 assert.deepEqual([...h.store.entries()],saved,'Disclosure choices do not write customer or global storage');
 h.L.closeTask();settle(h);tab(h,'Menu');
 assert(view(h).querySelector('[data-menu-group="account"]').hasAttribute('open'));assert(view(h).querySelector('[data-menu-group="support"]').hasAttribute('open'));
 toggleMenuGroup(h,'account');h.L.closeTask();settle(h);tab(h,'Menu');
 assert.equal(view(h).querySelector('[data-menu-group="account"]').hasAttribute('open'),false,'Closing Account is remembered too');assert(view(h).querySelector('[data-menu-group="support"]').hasAttribute('open'));
 assert.equal(money(h.L),before);clean(h);
});

test('Menu disclosure preferences never cross a replaced account state or accept stale and locked toggles',()=>{
 const h=fixture();tab(h,'Menu');const old=toggleMenuGroup(h,'account');h.L.closeTask();settle(h);
 assert.equal(h.L.monoMenuDisclosure(old),false,'Detached controls cannot change memory');
 h.L.state=JSON.parse(JSON.stringify(h.L.state));h.L.render();settle(h);tab(h,'Menu');
 const next=view(h).querySelector('[data-menu-group="account"]');assert.equal(next.hasAttribute('open'),false,'A new account state starts collapsed');
 const before=money(h.L);h.L.state.locked=true;next.open=true;assert.equal(h.L.monoMenuDisclosure(next),false);h.L.state.locked=false;
 h.L.closeTask();settle(h);tab(h,'Menu');assert.equal(view(h).querySelector('[data-menu-group="account"]').hasAttribute('open'),false);assert.equal(money(h.L),before);clean(h);
});

test('Menu marks its current destination while retaining all original routes',()=>{
 const h=fixture(),before=money(h.L);
 for(const route of ['pay','plan','moneyStoryHome','cardsHome']){
  h.L.openTab(route);settle(h);tab(h,'Menu');const current=view(h).querySelectorAll('.mono-menu-item[aria-current="page"]');assert.equal(current.length,1);assert.equal(current[0].dataset.menuRoute,route);assert(current[0].classList.contains('is-current'));h.L.closeTask();settle(h);assert.equal(h.L.route,route);
 }
 assert.equal(money(h.L),before);clean(h);
});

for(const route of required)test('Menu '+route+' opens its existing destination without changing financial records',()=>{
 const h=fixture(),before=money(h.L);tab(h,'Menu');item(h,route).click();settle(h);
 assert.equal(h.L.route,route);assert.equal(money(h.L),before);
 if(['plan','pay','moneyStoryHome','cardsHome'].includes(route)){assert.equal(h.L.taskSheet.active,false);assertNav(h,route);}
 else if(h.L.taskSheet.active){assert.equal(h.L.taskSheet.parentRoute,'home');assert.equal(nav(h).hidden,true);h.L.closeTask();settle(h);assert.equal(h.L.route,'home');assertNav(h,'home');}
 else {h.L.back();settle(h);assert.equal(h.L.route,'home');assertNav(h,'home');}
 assert.equal(money(h.L),before);clean(h);
});

for(const coreFirst of [false,true])for(const route of ['plan','pay','cardsHome','moneyStoryHome'])test('Menu '+route+' keeps page and history aligned after deferred close, Back and Forward ('+(coreFirst?'core listener first':'capture first')+')',()=>{
 const h=fixture(),before=money(h.L);if(coreFirst)coreFirstHistory(h);
 const assertPage=expected=>{
  assert.equal(h.L.route,expected);assert.equal(h.history.state.route,expected,'Browser entry agrees with the rendered destination');
  assert.equal(h.history.state.taskSheet,undefined,'The root is not a dismissed Menu history entry');
  assert.equal(h.L.taskSheet.active,false);assert.equal(h.document.querySelector('.task-sheet-layer'),null);
  assert(view(h).querySelector('.screen-'+expected),'The destination screen is mounted');assertNav(h,expected);
  if(expected==='moneyStoryHome')assert(view(h).querySelector('[data-money-story-dashboard]'),'Money Story analytics are rendered');
 };
 tab(h,'Menu');item(h,route).click();assert(h.history.pending>0,'This case exercises asynchronous native history closing');settle(h);
 assertPage(route);assert.deepEqual(h.entries.map(entry=>entry.route),['home',route],'Menu is replaced by exactly one destination entry');
 assert(h.entries.every(entry=>!entry.taskSheet),'Dismissed Menu cannot reappear through browser Forward');
 h.history.back();settle(h);assertPage('home');assert(view(h).querySelector('.mono-home'));
 h.history.forward();settle(h);assertPage(route);assert.deepEqual(h.entries.map(entry=>entry.route),['home',route]);
 assert.equal(money(h.L),before);clean(h);
});

test('Home body and its three money actions stay unchanged after the new primary navigation round trip',()=>{
 const h=fixture(),before=money(h.L),home=view(h).querySelector('.mono-home').outerHTML;
 tab(h,'Menu');h.L.closeTask();settle(h);ask(h);tab(h,'Home');
 assert.equal(h.L.route,'home');assert.equal(view(h).querySelector('.mono-home').outerHTML,home);
 assert.deepEqual(view(h).querySelector('.everyday-home-actions').querySelectorAll('button').map(primaryLabel),['Add money','Pay','Collect']);
 assert.equal(money(h.L),before);clean(h);
});

test('Ask Lumo and Menu preserve an unsent question, saved answers and the reading position',()=>{
 const h=fixture();ask(h);h.set('chatText','Where did my money go?');h.submit(view(h).querySelector('.chat-entry'));settle(h);
 h.set('chatText','Keep my next question');h.document.getElementById('chat-thread').scrollTop=92;
 const before=money(h.L),answers=JSON.stringify(h.L.state.chats);tab(h,'Menu');assert.equal(h.L.route,'monoMenu');h.L.closeTask();settle(h);assertNav(h,'chat');
 assert.equal(h.document.getElementById('chatText').value,'Keep my next question');assert.equal(h.document.getElementById('chat-thread').scrollTop,92);
 assert.equal(JSON.stringify(h.L.state.chats),answers);assert.equal(money(h.L),before);assertNav(h,'chat');clean(h);
});

test('Chat task dismissal restores the exact composer and thread, then shows the three destinations',()=>{
 const h=fixture();ask(h);const parent=view(h),input=h.set('chatText','An unsent follow-up'),thread=h.document.getElementById('chat-thread');thread.scrollTop=63;
 const before=money(h.L);h.L.openChatBankingActions();settle(h);assert.equal(h.L.taskSheet.parentRoute,'chat');assert.equal(nav(h).hidden,true);
 h.L.closeTask();settle(h);assert.equal(h.L.route,'chat');assert.equal(view(h),parent);assert.equal(h.document.getElementById('chatText'),input);assert.equal(h.document.getElementById('chat-thread'),thread);assert.equal(input.value,'An unsent follow-up');assert.equal(thread.scrollTop,63);assertNav(h,'chat');assert.equal(money(h.L),before);clean(h);
});

test('native browser Back from Ask Lumo returns to Menu with no approval or loss of unsent text',()=>{
 const h=fixture();h.L.openTab('more');settle(h);ask(h);h.set('chatText','Not sent yet');const before=money(h.L);
 h.history.back();settle(h);assert.equal(h.L.route,'more');assertNav(h,'more');assert.equal(money(h.L),before);
 ask(h);assert.equal(h.document.getElementById('chatText').value,'Not sent yet');assert.equal(money(h.L),before);clean(h);
});

test('unfinished card funding from Menu still requires review and keeping its draft returns to Cards',()=>{
 const h=fixture(),before=money(h.L);tab(h,'Menu');item(h,'cardsHome').click();settle(h);
 view(h).querySelectorAll('button').find(b=>b.textContent.trim()==='Create a virtual card').click();settle(h);
 assert.equal(h.L.taskSheet.parentRoute,'cardsHome');assert.equal(nav(h).hidden,true);h.set('vc-name','Study tools');h.set('payment-amount','80');h.submit(view(h).querySelector('form'));settle(h);
 assert(['paymentReview','pause'].includes(h.L.route));assert.equal(money(h.L),before);h.L.closeTask();settle(h);assert.equal(h.L.route,'paymentCancel');
 view(h).querySelectorAll('button').find(b=>b.textContent.trim()==='Keep draft & leave').click();settle(h);assert.equal(h.L.route,'cardsHome');assertNav(h,'cardsHome');assert.equal(h.L.state.paymentDraft.amount,80);assert.equal(money(h.L),before);clean(h);
});

test('Budget guide keeps task navigation out of the guided conversation',()=>{
 const h=fixture(),before=money(h.L);tab(h,'Menu');item(h,'plan').click();settle(h);h.L.budgetGuide.start({mode:'create'});settle(h);
 assert.equal(h.L.route,'chat');assert(h.L.budgetGuide.active());assert.equal(nav(h).hidden,true);assert(h.document.getElementById('chatText'));assert.equal(money(h.L),before);clean(h);
});

test('contextual explanation keeps its original task return instead of exposing ordinary primary navigation',()=>{
 const h=fixture(),before=money(h.L);h.L.go('balances');settle(h);assert.equal(h.L.taskSheet.parentRoute,'home');
 const help=view(h).querySelectorAll('button').find(b=>b.textContent.trim()==='Help me understand this');assert(help);help.click();settle(h);
 assert.equal(h.L.route,'chat');assert(h.L.contextualChat.current());assert.equal(h.L.taskSheet.active,false);assert.equal(nav(h).hidden,true);assert(view(h).querySelector('[data-context-return]'));
 h.L.contextualChat.returnToTask();settle(h);assert.equal(h.L.route,'balances');assert.equal(h.L.taskSheet.parentRoute,'home');assert.equal(money(h.L),before);
 h.L.closeTask();settle(h);assert.equal(h.L.route,'home');assertNav(h,'home');assert.equal(money(h.L),before);clean(h);
});

test('locked and closed accounts do not expose primary navigation or Menu data',()=>{
 for(const mode of ['locked','closed'])for(const route of ['home','chat','more']){const h=fixture();h.L.state[mode]=true;h.L.render();settle(h);const before=money(h.L);h.L.openTab(route);settle(h);assert.notEqual(h.L.route,route);assert.equal(nav(h).hidden,true);assert.equal(view(h).querySelector('.mono-menu'),null);assert.equal(money(h.L),before);clean(h);}
});

test('normal Menu retains ambassador help and reveals business testing only in test mode',()=>{
 const normal=fixture();tab(normal,'Menu');assert(item(normal,'ambassadorGuide'));assert.equal(view(normal).querySelector('[data-menu-route="merchant"]'),null);assert.equal(view(normal).querySelector('[data-menu-route="testing"]'),null);
 const testing=fixture({testing:true});tab(testing,'Menu');assert(item(testing,'ambassadorGuide'));assert(item(testing,'merchant'));assert(item(testing,'testing'));clean(normal);clean(testing);
});

for(const dismissal of ['close','backdrop','Escape','browser Back'])test('Menu '+dismissal+' restores the exact Home, navigation, focus and reading position',()=>{
 const h=fixture(),parent=view(h),tree=parent.firstChild,markup=parent.innerHTML,nodes=[...nav(h).children],before=money(h.L);
 parent.scrollTop=137;h.context.scrollY=68;const trigger=nodes[2];trigger.focus();trigger.click();settle(h);
 assert.equal(h.L.route,'monoMenu');assert.equal(h.L.taskSheet.parentRoute,'home');assert(h.document.getElementById('task-parent-view')===parent);assert(parent.firstChild===tree);assert.equal(parent.inert,true);assert.equal(parent.getAttribute('aria-hidden'),'true');
 assert.equal(nav(h).hidden,false,'Retained navigation keeps the underlying layout stable');assert.equal(nav(h).inert,true);assert.equal(nav(h).getAttribute('aria-hidden'),'true');assert(nav(h).children.every((node,i)=>node===nodes[i]));assert.equal(trigger.getAttribute('aria-expanded'),'true');
 const sheet=h.document.querySelector('.task-sheet');assert(sheet);assert.equal(sheet.getAttribute('aria-modal'),'true');assert.equal(sheet.id,'mono-menu-dialog');assert(sheet.contains(h.document.activeElement),'Focus enters the drawer');
 if(dismissal==='close')h.document.querySelector('.task-sheet-close').click();
 else if(dismissal==='backdrop')h.document.querySelector('.task-sheet-backdrop').click();
 else if(dismissal==='Escape')h.key('Escape');else h.history.back();settle(h);
 assert.equal(h.L.route,'home');assert.equal(h.L.taskSheet.active,false);assert(view(h)===parent);assert(parent.firstChild===tree);assert.equal(parent.innerHTML,markup);assert.equal(parent.scrollTop,137);assert.equal(h.context.scrollY,68);
 assert.equal(parent.inert,false);assert.equal(parent.getAttribute('aria-hidden'),null);assert.equal(nav(h).inert,false);assert.equal(nav(h).getAttribute('aria-hidden'),null);assert(nav(h).children.every((node,i)=>node===nodes[i]));assert(h.document.activeElement===trigger);assert.equal(trigger.getAttribute('aria-expanded'),'false');assert.equal(trigger.getAttribute('aria-controls'),null);assert.equal(h.document.querySelectorAll('[role="dialog"]').length,0);assertNav(h,'home');assert.equal(money(h.L),before);clean(h);
});

test('Menu traps keyboard focus, keeps its parent inert and exposes only drawer chrome',()=>{
 const h=fixture(),parent=view(h);tab(h,'Menu');const sheet=h.document.querySelector('.task-sheet');
 const controls=sheet.querySelectorAll('button,input,select,textarea,a[href],[tabindex]').filter(el=>!el.disabled&&!el.hidden&&el.tabIndex>=0&&!el.closest('[hidden],[inert]'));assert(controls.length>required.length);
 controls.at(-1).focus();h.key('Tab');assert(h.document.activeElement===controls[0]);controls[0].focus();h.key('Tab',{shiftKey:true});assert(h.document.activeElement===controls.at(-1));parent.querySelector('button').focus();assert(sheet.contains(h.document.activeElement));
 for(const selector of ['.task-sheet-back','.task-sheet-help','.task-sheet-grab'])assert.equal(sheet.querySelector(selector).hidden,true,'Drawer hides '+selector);
 const qr=sheet.querySelector('#lumo-scan-qr');if(qr)assert(qr.hidden,'The drawer has no competing QR entry');
 const header=sheet.querySelector('.task-sheet-chrome');header.dispatchEvent(new h.Event('pointerdown',{pointerId:1,clientX:200,clientY:10}));header.dispatchEvent(new h.Event('pointermove',{pointerId:1,clientX:200,clientY:180}));header.dispatchEvent(new h.Event('pointerup',{pointerId:1,clientX:200,clientY:180}));settle(h);assert.equal(h.L.route,'monoMenu','A vertical header gesture does not dismiss a horizontal drawer');clean(h);
});

test('Menu selection replaces its drawer with one ordinary task above the exact Chat source',()=>{
 const h=fixture();ask(h);const parent=view(h),input=h.set('chatText','Keep this while I check savings'),thread=h.document.getElementById('chat-thread'),before=money(h.L);thread.scrollTop=82;
 tab(h,'Menu');item(h,'goals').click();settle(h);assert.equal(h.L.route,'goals');assert.equal(h.L.taskSheet.parentRoute,'chat');assert(h.document.getElementById('task-parent-view')===parent);assert(parent.contains(input));assert(parent.contains(thread));assert.equal(h.document.querySelectorAll(h.L.signalEdition?'.task-sheet[role="region"]':'[role="dialog"]').length,1);assert.equal(h.document.querySelector('.task-sheet-layer[data-task-route="monoMenu"]'),null);
 h.L.closeTask();settle(h);assert.equal(h.L.route,'chat');assert(view(h)===parent);assert.equal(h.document.getElementById('chatText').value,'Keep this while I check savings');assert.equal(h.document.getElementById('chat-thread').scrollTop,82);assertNav(h,'chat');assert.equal(money(h.L),before);clean(h);
});

test('repeated Menu opens and double selection do not stack drawers or duplicate destination history',()=>{
 const h=fixture(),trigger=nav(h).children[2],before=money(h.L);trigger.click();assert.equal(h.L.openMonoMenu(),false);trigger.click();settle(h);assert.equal(h.L.route,'monoMenu');assert.equal(h.document.querySelectorAll('[role="dialog"]').length,1);
 const choice=item(h,'goals');choice.click();choice.click();settle(h);assert.equal(h.L.route,'goals');assert.equal(h.L.taskSheet.parentRoute,'home');assert.equal(h.document.querySelectorAll(h.L.signalEdition?'.task-sheet[role="region"]':'[role="dialog"]').length,1);
 h.history.back();settle(h);assert.equal(h.L.route,'home');assert.equal(h.L.taskSheet.active,false);assert.equal(h.document.querySelectorAll('[role="dialog"]').length,0);assert.equal(money(h.L),before);clean(h);
});

test('Menu rejects unknown destinations, payment authorization routes and hidden preview tools',()=>{
 const h=fixture(),before=money(h.L);tab(h,'Menu');for(const route of ['authorize','paymentResult','missing-route','testing','merchant']){assert.equal(h.L.monoMenuSelect(route),false);assert.equal(h.L.route,'monoMenu');assert.equal(h.L.taskSheet.parentRoute,'home');}
 assert.equal(money(h.L),before);clean(h);
});

test('Menu supports Signal page navigation while respecting contextual Chat, Budget guide and account guards',()=>{
 const task=fixture(),before=money(task.L);task.L.go('sendOptions');settle(task);
 if(task.L.signalEdition){
  assert.equal(task.L.openMonoMenu(),true);settle(task);assert.equal(task.L.route,'monoMenu');assert.equal(task.L.taskSheet.active,true);assert(item(task,'plan'),'The page exit reaches a working native Menu');assert.equal(money(task.L),before);task.L.closeTask();settle(task);assert.equal(task.L.route,'home');
  task.L.startSend('lumo');settle(task);task.L.pickPerson('abena');settle(task);task.set('payment-amount','80');const id=task.L.state.paymentDraft.id;
  assert.equal(task.L.openMonoMenu(),true);settle(task);assert.equal(task.L.route,'paymentCancel','An unfinished payment keeps the explicit native exit decision');assert.equal(task.L.state.paymentDraft.id,id);assert.equal(money(task.L),before);
  view(task).querySelectorAll('button').find(b=>b.getAttribute('onclick')==='L.keepPaymentLater()').click();settle(task);assert.equal(task.L.route,'monoMenu');assert.equal(task.L.state.paymentDraft.id,id);assert.equal(Number(task.L.state.paymentDraft.amount),80);assert.equal(money(task.L),before);
 }else{assert.equal(task.L.openMonoMenu(),false);assert.equal(task.L.route,'sendOptions');}
 clean(task);
 const context=fixture();context.L.go('balances');settle(context);view(context).querySelectorAll('button').find(b=>b.textContent.trim()==='Help me understand this').click();settle(context);assert(context.L.contextualChat.current());assert.equal(context.L.openMonoMenu(),false);assert.equal(context.L.route,'chat');clean(context);
 const guide=fixture();guide.L.budgetGuide.start({mode:'create'});settle(guide);assert(guide.L.budgetGuide.active());assert.equal(guide.L.openMonoMenu(),false);assert.equal(guide.L.route,'chat');clean(guide);
 for(const mode of ['locked','closed']){const h=fixture();h.L.state[mode]=true;assert.equal(h.L.openMonoMenu(),false);assert.equal(h.L.taskSheet.active,false);clean(h);}
});

test('Menu sign out uses the existing confirmation and cancellation returns to its source',()=>{
 const h=fixture(),parent=view(h),before=money(h.L);tab(h,'Menu');view(h).querySelectorAll('button').find(b=>b.getAttribute('onclick')==='L.monoMenuSignout()').click();settle(h);
 assert.equal(h.L.route,'actionConfirm');assert.equal(h.L.state.locked,false);assert.equal(h.L.taskSheet.parentRoute,'home');assert.equal(h.document.querySelector('.task-sheet-layer[data-task-route="monoMenu"]'),null);assert(view(h).textContent.includes('Sign out of Lumo?'));
 h.L.cancelNativeDecision();settle(h);assert.equal(h.L.route,'home');assert.equal(h.L.state.locked,false);assert(view(h)===parent);assertNav(h,'home');assert.equal(money(h.L),before);clean(h);
});

test('opening and dismissing Menu preserves an existing unsubmitted payment draft',()=>{
 const h=fixture();h.L.startSend('lumo');settle(h);h.L.pickPerson('abena');settle(h);h.set('payment-amount','80');h.set('payment-note','Keep this choice');h.L.closeTask();settle(h);assert.equal(h.L.route,'paymentCancel');h.L.keepPaymentLater();settle(h);assert.equal(h.L.route,'home');
 const before=money(h.L),draft=JSON.stringify(h.L.state.paymentDraft);tab(h,'Menu');h.L.closeTask();settle(h);assert.equal(h.L.route,'home');assert.equal(JSON.stringify(h.L.state.paymentDraft),draft);assert.equal(h.L.state.paymentDraft.submittedTxId,undefined);assert.equal(money(h.L),before);assertNav(h,'home');clean(h);
});
