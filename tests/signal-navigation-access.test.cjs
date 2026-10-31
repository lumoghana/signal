/* Global navigation through the actual shipped Signal bundle. Native money
   controllers remain the source of every draft and authorisation decision. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const settle=h=>{for(let i=0;i<4;i++){h.flushHistory();h.flush();}};
const view=h=>h.document.getElementById('view');
const footer=h=>h.document.querySelector('.signal-page-nav');
const money=L=>JSON.stringify([L.state.balance,L.state.accounts,L.state.txs,L.state.essentials,L.state.goals,L.state.requests,L.state.virtualCards,L.state.groupMoney,L.state.savingsHacks]);
const clean=h=>assert.deepEqual(h.errors,[]);
const retained=(nav,nodes)=>{assert.equal(nav.children.length,nodes.length);nodes.forEach((node,index)=>assert(nav.children[index]===node,'Retained primary navigation node '+index));};
function fixture(){
 const h=createHarness({clock:true,deferHistory:true}),L=h.L;L.explore();L.ensureAccounts();
 const date=new h.context.Date(h.context.Date.now()+10*86400000).toISOString().slice(0,10);
 Object.assign(L.state,{balance:1000,txs:[],paymentDraft:null,fundingDraft:null,bankFunding:null,fundingReturn:null,chats:[],requests:[],essentials:[{id:'food',name:'Food',amount:200,paid:0,externalPaid:0,coverageVersion:1}],goals:[{id:'buffer',name:'Emergency buffer',allocated:120,target:600,boxVersion:2}],allowance:{amount:4000,date},planHorizon:{mode:'allowance',date},planSaved:true,groupMoney:undefined});
 L.state.profile.pin='123456';L.openTab('home');L.showPrivateMoney();L.render();settle(h);
 assert.equal(typeof L.signalNavigation?.navigate,'function','Actual shipped global navigation adapter is loaded');return h;
}
function action(h,code){const button=view(h).querySelectorAll('button').find(b=>b.getAttribute('onclick')===code);assert(button,code+' on '+h.L.route);button.click();settle(h);return button;}
function label(h,text){const button=view(h).querySelectorAll('button').find(b=>b.textContent.trim()===text);assert(button,text+' on '+h.L.route);button.click();settle(h);return button;}
function navigate(h,target){const button=footer(h)?.querySelector('[data-signal-destination="'+target+'"]');assert(button,'Accessible '+target+' on '+h.L.route);assert.equal(button.hidden,false);assert(!button.closest('[inert],[hidden]'),'Navigation control is neither hidden nor inert');button.click();settle(h);return button;}
function payment(h){const L=h.L;L.openTab('pay');settle(h);L.startSend('lumo');settle(h);L.pickPerson('abena');settle(h);h.set('payment-amount','80');h.set('payment-note','Lunch draft');L.preparePayment();settle(h);assert.equal(L.route,'paymentReview');return L.state.paymentDraft.id;}
function collection(h){
 const L=h.L,G=L.groupMoney,members=[{id:'self',name:'You',isOwner:true},{id:'abena',name:'Abena'},{id:'kojo',name:'Kojo'}];
 const made=G.createCollection({title:'Class dinner',target:'1200',deadline:new h.context.Date(h.context.Date.now()+14*86400000).toISOString().slice(0,10),members,mandateApproval:'named',mandateApproverIds:['self','abena','kojo'],mandateRequiredApprovals:2,acceptMandate:true,idempotencyKey:'global-navigation-pot'});assert(made.ok,made.error);
 for(const personId of ['abena','kojo'])assert(G.acceptMandate({itemId:made.item.id,personId,version:made.item.mandate.version,sample:true}).ok);
 assert(G.recordSamplePayment({itemId:made.item.id,personId:'abena',amount:'600',reference:'navigation-fixture-funds'}).ok);L.gm.open(made.item.id);settle(h);return made.item;
}

test('All Your Money and its nested recorded-balance form have a direct Home exit',()=>{
 const h=fixture(),L=h.L,before=money(L),nav=h.document.getElementById('nav'),nodes=[...nav.children];
 nodes[2].click();settle(h);const all=view(h).querySelector('[data-menu-route="allMoney"]');assert(all);all.click();settle(h);assert.equal(L.route,'allMoney');
 L.lifeUI.startSource();settle(h);assert.equal(L.route,'moneySource');h.set('money-name','Checked MTN wallet');h.set('money-amount','90');
 const global=footer(h);assert(global);assert(global.closest('.task-sheet'),'Footer is inside the page focus boundary');assert.equal(global.querySelectorAll('[data-signal-destination]').length,3);
 navigate(h,'home');assert.equal(L.route,'home');assert.equal(L.taskSheet.active,false);assert.equal(money(L),before);assert(h.document.getElementById('nav')===nav,'Primary navigation container is retained');retained(nav,nodes);assert.equal(nav.inert,false);assert.equal(nav.hidden,false);clean(h);
});

test('global Ask Lumo from a deep page reaches Chat and its visible return leads Home',()=>{
 const h=fixture(),L=h.L,before=money(L);L.go('allMoney');settle(h);L.lifeUI.startSource();settle(h);navigate(h,'chat');
 assert.equal(L.route,'chat');assert.equal(L.taskSheet.active,false);assert.equal(h.document.getElementById('nav').hidden,false);
 const back=view(h).querySelectorAll('button').find(b=>/closeBankingChat/.test(b.getAttribute('onclick')||''));assert(back,'Chat retains a visible return control');back.click();settle(h);assert.equal(L.route,'home');assert.equal(money(L),before);clean(h);
});

test('Menu reached from a full page is a working native drawer with working destinations',()=>{
 const h=fixture(),L=h.L,before=money(L);L.go('allMoney');settle(h);navigate(h,'menu');
 assert.equal(L.route,'monoMenu');assert.equal(L.taskSheet.active,true);assert.equal(h.document.querySelector('.task-sheet').id,'mono-menu-dialog');assert(!footer(h),'A drawer does not contain a second global footer');
 const plan=view(h).querySelector('[data-menu-route="plan"]');assert(plan);plan.click();settle(h);assert.equal(L.route,'plan');assert.equal(L.taskSheet.active,false);
 const nav=h.document.getElementById('nav');assert.equal(nav.hidden,false);nav.children[0].click();settle(h);assert.equal(L.route,'home');assert.equal(money(L),before);clean(h);
});

test('signed-in native Activity and Story pages expose retained primary navigation and usable Menu',()=>{
 for(const route of ['activity','story']){
  const h=fixture(),L=h.L,nav=h.document.getElementById('nav'),nodes=[...nav.children],before=money(L);L.go(route);settle(h);assert.equal(L.route,route);assert.equal(L.taskSheet.active,false);
  assert.equal(nav.hidden,false);assert.equal(nav.inert,false);retained(nav,nodes);nodes[2].focus();assert(h.document.activeElement===nodes[2],'Focus returns to the native Menu control');nodes[2].click();settle(h);
  assert.equal(L.route,'monoMenu');assert.equal(L.taskSheet.active,true);h.key('Escape');settle(h);assert.equal(L.route,route);assert(h.document.activeElement===nodes[2],'Focus returns to the native Menu control');retained(nav,nodes);
  nodes[0].click();settle(h);assert.equal(L.route,'home');assert.equal(money(L),before);clean(h);
 }
});

test('a cold restored record has Home, Ask Lumo and a working Menu before Home was ever mounted',()=>{
 const h=createHarness({clock:true,deferHistory:true}),L=h.L;Object.assign(L.state,{onboarded:true,locked:false,closed:false,balance:500,paymentDraft:null});L.ensureAccounts();L.route='requestDetail';L.params={id:'unavailable-record'};L.history=[];L.render();settle(h);
 const nav=h.document.getElementById('nav');assert.equal(nav.hidden,false);assert.equal(nav.children.length,3);assert.deepEqual([...nav.children].map(b=>b.textContent.trim()),['Home','Ask Lumo','Menu']);assert(nav.classList.contains('mono-primary-nav'),'Cold navigation has the same styled shell');
 // A restored task exits to Home before Menu; native Activity and Story keep
 // their retained-page behavior tested above without becoming task routes.
 nav.children[2].click();settle(h);assert.equal(L.route,'monoMenu');assert.equal(L.taskSheet.active,true);h.key('Escape');settle(h);assert.equal(L.route,'home');h.document.getElementById('nav').children[0].click();settle(h);assert.equal(L.route,'home');clean(h);
});

test('short choice sheets keep their modal navigation while full pages have focusable global controls',()=>{
 const h=fixture(),L=h.L,nav=h.document.getElementById('nav'),nodes=[...nav.children];L.openFunding('home');settle(h);
 assert.equal(h.document.querySelector('.task-sheet-layer').getAttribute('data-signal-surface'),'sheet');assert(!footer(h),'No page footer is exposed here');assert.equal(nav.inert,true);
 L.startMomoFunding();settle(h);const home=footer(h)?.querySelector('[data-signal-destination="home"]');assert(home);home.focus();assert(h.document.activeElement===home,'Native task focus containment accepts page footer controls');
 navigate(h,'home');assert.equal(L.route,'home');retained(nav,nodes);assert.equal(nav.inert,false);assert.equal(nav.hidden,false);clean(h);
});

test('access, identity and recovery funnels do not expose signed-in account navigation',()=>{
 const h=fixture(),L=h.L,N=L.signalNavigation;
 for(const route of 'welcome samplePause setupChoice phone otp identity livecheck identityResult campus campusStatus campusInterest campusInterestSaved pilotUnavailable pin confirmPin accountReview applicationStatus applicationCorrection accountReady setupProgress signin recovery recoveryReplacement recoveryOwnership recoveryStatus privacyNotice ambassadorWelcome ambassadorSample ambassadorReset sampleConfirm resetConfirm'.split(' '))assert.equal(N.hasGlobalNavigation(route),false,route+' keeps its native access/exit journey');
 for(const change of [{onboarded:false},{onboarded:true,locked:true},{onboarded:true,locked:false,closed:true}]){
  Object.assign(L.state,change);L.render();settle(h);assert.equal(N.hasGlobalNavigation(),false);assert(!footer(h),'No page footer is exposed here');assert.equal(h.document.getElementById('nav').hidden,true);
 }
 clean(h);
});

for(const choice of ['keep','discard'])test('Home from payment review waits for explicit '+choice+' and then reaches Home from the Pay parent',()=>{
 const h=fixture(),L=h.L,id=payment(h),before=money(L);navigate(h,'home');assert.equal(L.route,'paymentCancel');assert.equal(L.state.paymentDraft.id,id);assert.equal(money(L),before);
 action(h,choice==='keep'?'L.keepPaymentLater()':'L.discardPayment()');assert.equal(L.route,'home');assert.equal(L.taskSheet.active,false);assert.equal(money(L),before);
 if(choice==='keep'){assert.equal(L.state.paymentDraft.id,id);assert.equal(Number(L.state.paymentDraft.amount),80);}else assert.equal(L.state.paymentDraft,null);clean(h);
});

for(const exit of ['return','back'])test(exit+' out of a pending global payment exit clears the old Home destination',()=>{
 const h=fixture(),L=h.L,id=payment(h),before=money(L);navigate(h,'home');assert.equal(L.route,'paymentCancel');
 if(exit==='return')action(h,'L.editPayment()');else{L.back();settle(h);}assert.notEqual(L.route,'paymentCancel');assert.equal(L.state.paymentDraft.id,id);
 L.closeTask();settle(h);assert.equal(L.route,'paymentCancel');action(h,'L.keepPaymentLater()');assert.equal(L.route,'pay','A later native leave uses its original parent');assert.equal(L.state.paymentDraft.id,id);assert.equal(money(L),before);clean(h);
});

test('Ask Lumo after an explicit kept payment has a reliable visible Home return',()=>{
 const h=fixture(),L=h.L,id=payment(h),before=money(L);navigate(h,'chat');assert.equal(L.route,'paymentCancel');action(h,'L.keepPaymentLater()');assert.equal(L.route,'chat');assert.equal(L.state.paymentDraft.id,id);assert.equal(money(L),before);
 const back=view(h).querySelectorAll('button').find(b=>/closeBankingChat/.test(b.getAttribute('onclick')||''));assert(back);back.click();settle(h);assert.equal(L.route,'home');assert.equal(L.state.paymentDraft.id,id);assert.equal(money(L),before);clean(h);
});

test('an unrelated saved payment draft does not block Home from a records page',()=>{
 const h=fixture(),L=h.L,id=payment(h);L.keepPaymentLater();settle(h);L.go('allMoney');settle(h);const before=money(L);navigate(h,'home');
 assert.equal(L.route,'home');assert.equal(L.taskSheet.active,false);assert.equal(L.state.paymentDraft.id,id);assert.equal(Number(L.state.paymentDraft.amount),80);assert.equal(money(L),before);clean(h);
});

for(const target of ['home','menu'])for(const discard of [false,true])test('restored payment review guards native '+target+' navigation until explicit '+(discard?'discard':'keep'),()=>{
 const h=fixture(),L=h.L,id=payment(h);L.keepPaymentLater();settle(h);
 L.route='paymentReview';L.params={};L.history=[];L.render();settle(h);assert.equal(L.route,'paymentReview');assert.equal(L.taskSheet.active,false);
 const before=money(L),nav=h.document.getElementById('nav');assert.equal(nav.hidden,false);assert.equal(nav.children.length,3);nav.children[target==='home'?0:2].click();settle(h);
 // Restored financial pages keep their native standalone cancellation page;
 // promoting one to a task parent would change financial-engine ownership.
 assert.equal(L.route,'paymentCancel');assert.equal(L.taskSheet.active,false);assert.equal(nav.hidden,false);assert.deepEqual([...nav.children].map(b=>b.textContent.trim()),['Home','Ask Lumo','Menu']);
 for(const choice of ['Keep draft & leave','Return to payment','Discard draft'])assert(view(h).querySelectorAll('button').some(b=>b.textContent.trim()===choice),'Native cancellation offers '+choice);
 assert.equal(L.state.paymentDraft.id,id);assert.equal(money(L),before);
 action(h,discard?'L.discardPayment()':'L.keepPaymentLater()');assert.equal(L.route,target==='menu'?'monoMenu':'home');assert.equal(money(L),before);
 if(target==='menu')assert.equal(L.taskSheet.active,true);else assert.equal(L.taskSheet.active,false);
 if(discard)assert.equal(L.state.paymentDraft,null);else assert.equal(L.state.paymentDraft.id,id);clean(h);
});

test('Home from funding nested inside a payment returns through the same payment exit guard',()=>{
 const h=fixture(),L=h.L,id=payment(h),before=money(L);L.openFunding('paymentReview');settle(h);L.startMomoFunding();settle(h);assert.equal(L.route,'momoAdd');
 navigate(h,'home');assert.equal(L.route,'paymentCancel');assert.equal(L.state.paymentDraft.id,id);assert.equal(money(L),before);action(h,'L.keepPaymentLater()');
 assert.equal(L.route,'home');assert.equal(L.state.paymentDraft.id,id);assert.equal(money(L),before);clean(h);
});

test('global Home from authorisation clears the entered PIN and still requires an explicit draft choice',()=>{
 const h=fixture(),L=h.L,id=payment(h),before=money(L);L.continuePayment();settle(h);assert.equal(L.route,'authorize');const pin=h.set('payment-pin','123456');
 navigate(h,'home');assert.equal(L.route,'paymentCancel');assert.equal(pin.value,'');assert(!h.document.getElementById('payment-pin'),'Authorisation input is absent after exit');assert.equal(L.state.paymentDraft.id,id);assert.equal(money(L),before);
 action(h,'L.keepPaymentLater()');assert.equal(L.route,'home');assert.equal(L.state.paymentDraft.id,id);assert.equal(money(L),before);clean(h);
});

for(const reason of ['released writer','stale saved progress','quota rejection'])test(reason+' blocks global navigation without losing the unsubmitted payment',()=>{
 const h=fixture(),L=h.L,id=payment(h),before=money(L),key='lumo-signal-edition-v1';let durable;
 if(reason==='released writer')L.persistence.release();
 else if(reason==='stale saved progress'){
  const newer=JSON.parse(h.store.get(key));newer._persistenceMeta.revision++;durable=JSON.stringify(newer);h.store.set(key,durable);h.emit('storage',{key,newValue:durable});
 }else{
  const storage=h.context.localStorage;h.context.localStorage={...storage,setItem(){throw Error('Quota exceeded');}};
  L.state.prefs.insights=!L.state.prefs.insights;assert.equal(L.save(),false);assert.equal(L.persistence.status().saveFailed,true);
 }
 assert.equal(L.persistence.status().blocked,true);L.persistenceRecovery.sync();assert(h.document.getElementById('persistence-recovery'),'Native recovery explains the saved-progress problem');
 assert.equal(L.signalNavigation.navigate('home'),false);assert.equal(L.signalNavigation.navigate('menu'),false);settle(h);
 assert.equal(L.route,'paymentReview');assert.equal(L.state.paymentDraft.id,id);assert.equal(Number(L.state.paymentDraft.amount),80);assert.equal(money(L),before);if(durable)assert.equal(h.store.get(key),durable);clean(h);
});

test('loading a saved account snapshot clears a pending destination before a later native leave',()=>{
 const h=fixture(),L=h.L,id=payment(h);navigate(h,'home');assert.equal(L.route,'paymentCancel');const old=L.state;
 assert.equal(L.persistence.reloadLatest(),true);assert(L.state!==old,'Native saved-progress loading replaces the account snapshot');L.render();settle(h);const before=money(L);assert.equal(L.route,'paymentCancel');
 action(h,'L.keepPaymentLater()');assert.equal(L.route,'pay','The earlier Home intent does not survive account replacement');assert.equal(L.state.paymentDraft.id,id);assert.equal(money(L),before);clean(h);
});

for(const kind of ['contribution','payout'])for(const discard of [false,true])test('global Home honours the native '+kind+' '+(discard?'discard':'keep')+' choice without moving money',()=>{
 const h=fixture(),L=h.L,item=collection(h);
 if(kind==='contribution'){L.openCollectionContribution(item.id,'25');settle(h);}else{L.gm.startProposal(item.id);settle(h);L.collectionPayoutRails.choose('lumo');settle(h);L.pickPerson('abena');settle(h);h.set('payment-amount','80');h.set('payment-note','Dinner deposit');}
 const id=L.state.paymentDraft.id,before=money(L);navigate(h,'home');assert.equal(L.route,'paymentCancel');assert.equal(L.state.paymentDraft.id,id);
 const api=kind==='contribution'?L.collectionContributionUI:L.collectionPayoutRails;if(kind==='payout')assert(Object.isFrozen(api),'The payout API retains its frozen controller contract');api.leave(discard?{discard:true}:{});settle(h);
 assert.equal(L.route,'home');assert.equal(L.taskSheet.active,false);assert.equal(money(L),before);assert.equal(item.proposals.length,0);
 if(discard)assert.equal(L.state.paymentDraft,null);else assert.equal(L.state.paymentDraft.id,id);clean(h);
});

test('rapid global Home then Menu requests use the native closing queue without losing navigation',()=>{
 const h=fixture(),L=h.L,before=money(L);L.go('allMoney');settle(h);L.lifeUI.startSource();settle(h);
 L.signalNavigation.navigate('home');L.signalNavigation.navigate('menu');settle(h);assert.equal(L.route,'monoMenu');assert.equal(L.taskSheet.active,true);
 h.key('Escape');settle(h);assert.equal(L.route,'home');assert.equal(h.document.getElementById('nav').hidden,false);assert.equal(money(L),before);clean(h);
});

test('restored standalone Done, Close and conversation-return controls have real destinations',()=>{
 for(const [route,text,target]of [['spendingOutlook','Done','home'],['virtualCards','Done','home'],['budgetHistory','Close','home'],['chatCalendarPayments','Back to conversation','chat'],['hibiscusChatHistory','Back to conversation','chat'],['chatBankingActions','Back to conversation','chat']]){
  const h=fixture(),L=h.L,before=money(L);L.route=route;L.params={};L.history=[];L.render();settle(h);assert.equal(L.taskSheet.active,false);assert.equal(L.route,route);
  label(h,text);assert.equal(L.route,target,route+' exits without an active task');assert.equal(money(L),before);clean(h);
 }
});
