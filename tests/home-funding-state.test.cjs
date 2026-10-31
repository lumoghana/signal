/* A funded-once Home action follows confirmed ledger history, not a live balance. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const primaryLabel=button=>(button.querySelector('.signal-action-label')||button).textContent.trim();
const dist=path.join(__dirname,'../dist');let checks=0;
const check=(name,fn)=>{if(process.env.HOME_FUNDING_FILTER&&!name.includes(process.env.HOME_FUNDING_FILTER))return;fn();checks++;console.log('PASS '+name);};
function ledger(saved){
 let stored=saved?JSON.stringify(saved):null;
 const context={console,Date,Math,URLSearchParams,setTimeout:()=>0,clearTimeout(){},location:{search:''},document:{getElementById:()=>null,addEventListener(){}},localStorage:{getItem:()=>stored,setItem:(_,value)=>stored=value},addEventListener(){}};
 context.window=context;vm.createContext(context);
 for(const file of ['core.js','two-account-engine.js','home-funding-state.js','pause-engine.js','plan-impact.js'])vm.runInContext(fs.readFileSync(path.join(dist,file),'utf8'),context,{filename:file});
 const L=context.L;L.render=()=>{};L.toast=()=>{};
 return {L,stored:()=>JSON.parse(stored)};
}
function fresh(){const h=ledger(),s=h.L.state;s.onboarded=true;s.profile.pin='123456';s.profile.phone='0241230123';h.L.save();return h;}
function full(testing=false){
 const modules=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
 if(!modules.includes('home-funding-state.js'))modules.splice(modules.indexOf('two-account-engine.js')+1,0,'home-funding-state.js');
 const h=createHarness({clock:true,testing,modules}),s=h.L.state,flush=h.flush;h.flush=()=>{flush();h.advance(16);};
 s.onboarded=true;s.profile.pin='123456';s.profile.phone='0241230123';h.L.save();h.L.route='home';h.L.params={};h.L.history=[];h.L.render();h.flush();return h;
}
check('creating empty accounts does not count as first funding',()=>{
 const h=ledger(),{L}=h;assert.equal(L.hasFundedOperationalAccount(),false);assert.equal(L.state.accounts,undefined);
 L.state.onboarded=true;L.save();assert.equal(L.hasFundedOperationalAccount(),false);assert.equal(L.state.balance,0);assert.equal(L.state.accounts.operational.hasBeenFunded,undefined);assert.equal(h.stored().accounts.operational.hasBeenFunded,undefined);
});
check('only confirmed external incoming money changes the milestone, without changing amounts',()=>{
 const {L,stored}=fresh();const incoming=L.addTx({draftId:'credit',type:'in',name:'Incoming bank transfer',amount:600,fee:0,status:'success'});
 assert.equal(L.hasFundedOperationalAccount(),true);assert.equal(stored().accounts.operational.hasBeenFunded,true);assert.equal(L.state.balance,600);assert.equal(L.state.txs.length,1);
 L.addTx({draftId:'credit',type:'in',name:'Incoming bank transfer',amount:600,fee:0,status:'success'});assert.equal(L.state.balance,600);assert.equal(L.state.txs[0],incoming);
});
check('pending and failed incoming credits do not count as the first funding milestone',()=>{
 const {L}=fresh();const pending=L.addTx({type:'in',amount:600,fee:0,status:'pending'});assert.equal(L.hasFundedOperationalAccount(),false);assert.equal(L.state.balance,0);
 L.resolveTx(pending.id,'failed');assert.equal(L.hasFundedOperationalAccount(),false);assert.equal(L.state.balance,0);
 L.addTx({type:'in',amount:100,fee:0,status:'failed'});assert.equal(L.hasFundedOperationalAccount(),false);assert.equal(L.state.accounts.operational.hasBeenFunded,undefined);
});
check('a pending credit activates the milestone only when its existing reference succeeds',()=>{
 const {L,stored}=fresh();const pending=L.addTx({type:'in',amount:600,fee:0,status:'pending'});assert.equal(L.hasFundedOperationalAccount(),false);
 L.resolveTx(pending.id,'success');assert.equal(L.hasFundedOperationalAccount(),true);assert.equal(L.state.balance,600);assert.equal(stored().accounts.operational.hasBeenFunded,true);L.resolveTx(pending.id,'success');assert.equal(L.state.balance,600);
});
check('the milestone remains true after spending to zero and reloading',()=>{
 const {L,stored}=fresh();L.addTx({type:'in',amount:80,fee:0,status:'success'});L.addTx({type:'out',amount:80,fee:0,status:'success'});
 assert.equal(L.state.balance,0);assert.equal(L.hasFundedOperationalAccount(),true);const next=ledger(stored());assert.equal(next.L.hasFundedOperationalAccount(),true);assert.equal(next.L.state.balance,0);
});
check('internal savings movement cannot stand in for an incoming funding confirmation',()=>{
 const {L}=fresh();L.state.goals=[{id:'box',name:'Laptop',allocated:100,boxVersion:2}];L.save();
 const t=L.transferMoneyBox({id:'box',direction:'out',amount:80,draftId:'internal-out'});assert.equal(t.type,'internal');assert.equal(L.state.balance,80);assert.equal(L.hasFundedOperationalAccount(),false);assert.equal(L.state.accounts.operational.hasBeenFunded,undefined);
});
check('legacy funded accounts and sample money are recognised while migration preserves total money',()=>{
 const h=ledger(),{L}=h;L.state.onboarded=true;L.state.balance=600;L.state.goals=[{id:'box',name:'Laptop',allocated:100}];L.state.essentials=[{id:'budget',name:'Food',amount:350,paid:0}];L.save();
 assert.equal(L.hasFundedOperationalAccount(),true);assert.equal(L.accountBalances().operational,500);assert.equal(L.accountBalances().savings,100);assert.equal(L.accountBalances().total,600);assert.equal(L.balances().room,150);
 L.state.balance=0;L.save();const next=ledger(h.stored());assert.equal(next.L.hasFundedOperationalAccount(),true);assert.equal(next.L.state.balance,0);
 const sample=ledger();sample.L.explore();assert.equal(sample.L.hasFundedOperationalAccount(),true);assert.equal(sample.L.accountBalances().total,920);
});
check('bank instruction, debit claim and optional setup state do not imply receipt',()=>{
 const h=full(),{L}=h;L.beginFirstFunding();L.startBankFunding();L.bankSent();assert.equal(L.hasFundedOperationalAccount(),false);assert.equal(L.state.balance,0);
 L.state.onboardingFunding.done=true;L.save();assert.equal(L.hasFundedOperationalAccount(),false);h.set('bank-test-amount',600);L.simulateBankReceipt();assert.equal(L.hasFundedOperationalAccount(),true);assert.equal(L.state.balance,600);assert.deepEqual(h.errors,[]);
});
check('wallet approval stays unfunded until confirmation, including payment-return funding',()=>{
 const h=full(true),{L}=h;L.state.paymentDraft={id:'keep-payment',method:'lumo',name:'Ama',destination:'@ama',amount:80,fee:0};L.openFunding('paymentReview');L.startMomoFunding();h.set('funding-amount',100);h.document.getElementById('funding-owned').checked=true;L.reviewMomoFunding();L.requestMomoFunding();L.fundingApproved();
 assert.equal(L.hasFundedOperationalAccount(),false);assert.equal(L.state.balance,0);L.fundingOutcome('success');assert.equal(L.hasFundedOperationalAccount(),true);assert.equal(L.state.balance,100);assert.equal(L.state.paymentDraft.id,'keep-payment');L.fundingDone();h.flushHistory();assert(['paymentReview','pause'].includes(L.route));assert.deepEqual(h.errors,[]);
});
const outlet=h=>h.document.getElementById('view');
const named=(root,label)=>root.querySelectorAll('button').filter(b=>primaryLabel(b).replace(/\s+/g,' ').trim()===label);
function clickNamed(h,label){const matches=named(outlet(h),label);assert.equal(matches.length,1,'One available '+label+' action on '+h.L.route);matches[0].focus();matches[0].click();h.flush();return matches[0];}
function settledHome(h){h.L.openTab('home');h.flushHistory();h.flush();assert.equal(h.L.route,'home');}
function campusFromHome(h){const trigger=h.document.getElementById('lumo-scan-qr');assert(trigger&&!trigger.hidden,'Floating scanner available from Home');trigger.focus();trigger.click();h.flush();assert.equal(h.L.route,'campusPay');assert.equal(h.L.params.qrScan,true);h.L.qr.codeEntry();h.flush();return trigger;}
function fundFromHome(h,amount=600){
 clickNamed(h,'Add money');assert.equal(h.L.route,'addMoney');
 const bank=outlet(h).querySelectorAll('button').find(b=>b.textContent.startsWith('Bank transfer'));assert(bank);bank.click();h.flush();assert.equal(h.L.route,'bankAdd');
 h.set('bank-test-amount',amount);const form=outlet(h).querySelector('form');assert(form,'Public bank simulation is a real form');h.submit(form);h.flush();
 assert.equal(h.L.state.balance,amount);
 if(h.L.route==='bankAdd')clickNamed(h,'Set up budget');
 assert.equal(h.L.route,'budgetAfterFunding');clickNamed(h,'Do later');h.flushHistory();h.flush();assert.equal(h.L.route,'home');
}
const savedInformation=L=>JSON.stringify({profile:L.state.profile,essentials:L.state.essentials,goals:L.state.goals,prefs:L.state.prefs,accountPrefs:L.state.accountPrefs,chats:L.state.chats,feedback:L.state.feedback});
check('unfunded Home offers Add money, Pay and its collection entry with a floating scanner',()=>{
 const h=full(),home=outlet(h),actions=home.querySelector('.everyday-home-actions');assert(actions);assert.deepEqual(actions.querySelectorAll('button').map(primaryLabel),['Add money',actions.closest('.mono-home')?'Pay':'Transfer',actions.closest('.mono-home')?'Collect':'Request']);assert.equal(named(home,'Add money').length,1);assert.equal(named(home,'Campus Pay').length,0);assert.equal(named(home.querySelector('.everyday-home-actions'),'Add money').length,1);assert(h.document.getElementById('lumo-scan-qr'));assert.equal(h.L.state.balance,0);assert.deepEqual(h.errors,[]);
});
check('confirmed first funding keeps all three Home actions and floating scanner without changing saved information',()=>{
 const h=full(),{L}=h;L.state.profile.displayName='Ama';L.state.prefs.insights=false;L.state.chats=[{q:'What is a budget?',text:'Your saved everyday costs.'}];L.state.feedback=[{id:'keep-feedback',text:'Keep this note'}];L.save();L.render();h.flush();const saved=savedInformation(L);
 fundFromHome(h);const home=outlet(h),actions=home.querySelector('.everyday-home-actions'),operational=home.querySelector('.account-operational');
 assert.equal(named(actions,'Campus Pay').length,0);assert.equal(named(actions,actions.closest('.mono-home')?'Collect':'Request').length,1);assert.equal(named(actions,actions.closest('.mono-home')?'Pay':'Transfer').length,1);assert.equal(named(actions,'Add money').length,1);assert.equal(named(operational,'Add money').length,0);assert.equal(named(home,'Add money').length,1);assert(h.document.getElementById('lumo-scan-qr'));assert.equal(savedInformation(L),saved);assert.equal(L.state.txs.length,1);assert.equal(L.state.txs[0].type,'in');assert.equal(L.state.txs[0].status,'success');assert.deepEqual(h.errors,[]);
});
check('the floating Home scanner reaches merchant entry and returns to the retained Home',()=>{
 const h=full(),{L}=h;fundFromHome(h);const parent=outlet(h),tree=parent.firstChild,nav=h.document.getElementById('nav'),navNodes=[...nav.children];parent.scrollTop=77;const before=JSON.stringify({balance:L.state.balance,txs:L.state.txs,information:savedInformation(L)});
 const trigger=campusFromHome(h);assert.equal(L.route,'campusPay');assert.equal(L.taskSheet.active,true);assert.equal(L.taskSheet.parentRoute,'home');assert(h.document.getElementById('task-parent-view')===parent,'Same retained parent outlet');assert(parent.firstChild===tree,'Same Home tree remains mounted');assert(parent.inert);assert.equal(h.document.querySelectorAll(h.L.signalEdition?'.task-sheet[role="region"]':'[role="dialog"]').length,1);assert(outlet(h).querySelectorAll('button').some(b=>b.textContent.includes('Akua’s Kitchen')));assert(outlet(h).querySelector('#merchant-code'));
 h.document.querySelector(h.L.signalEdition?'.task-sheet-back':'.task-sheet-close').click();h.flush();h.flushHistory();assert.equal(L.route,'home');assert.equal(L.taskSheet.active,false);assert(outlet(h)===parent,'Parent outlet is restored');assert(parent.firstChild===tree,'Same Home tree remains mounted');assert.equal(parent.scrollTop,77);assert.equal(parent.inert,false);assert(h.document.activeElement===trigger||parent.contains(h.document.activeElement),'Focus returns to the floating trigger or retained Home');navNodes.forEach((n,i)=>assert(nav.children[i]===n,'Navigation node is retained'));assert.equal(JSON.stringify({balance:L.state.balance,txs:L.state.txs,information:savedInformation(L)}),before);assert.deepEqual(h.errors,[]);
});
check('Add money also remains available through You and account details',()=>{
 const h=full(),{L}=h;fundFromHome(h);const before=JSON.stringify({balance:L.state.balance,txs:L.state.txs,information:savedInformation(L)});
 L.openTab('more');h.flush();const parent=outlet(h);
 const accounts=parent.querySelectorAll('button').find(b=>b.getAttribute('onclick')==="L.go('accountInfo')");assert(accounts);accounts.click();h.flush();
 assert.equal(L.route,'accountInfo');const funding=outlet(h).querySelectorAll('button').find(b=>b.getAttribute('onclick')==="L.openFunding('accountInfo')");assert(funding);funding.click();h.flush();
 assert.equal(L.route,'addMoney');assert.equal(L.taskSheet.parentRoute,'more');
 assert(outlet(h).querySelectorAll('button').some(b=>b.textContent.startsWith('Mobile money')));assert(outlet(h).querySelectorAll('button').some(b=>b.textContent.startsWith('Bank transfer')));
 h.document.querySelector(h.L.signalEdition?'.task-sheet-back':'.task-sheet-close').click();h.flushHistory();h.flush();assert.equal(L.route,'accountInfo');h.document.querySelector(h.L.signalEdition?'.task-sheet-back':'.task-sheet-close').click();h.flushHistory();h.flush();assert.equal(L.route,'more');assert(outlet(h)===parent);
 assert.equal(JSON.stringify({balance:L.state.balance,txs:L.state.txs,information:savedInformation(L)}),before);assert.deepEqual(h.errors,[]);
});
check('funding, Pay and floating QR stay available after confirmed money has been spent',()=>{
 const h=full(),{L}=h;fundFromHome(h,80);L.addTx({type:'out',name:'Completed purchase',amount:80,fee:0,status:'success'});L.render();h.flush();assert.equal(L.state.balance,0);const home=outlet(h);assert.equal(named(home,'Campus Pay').length,0);assert.equal(named(home.querySelector('.everyday-home-actions'),'Add money').length,1);assert.equal(named(home.querySelector('.everyday-home-actions'),home.querySelector('.mono-home')?'Collect':'Request').length,1);assert.equal(named(home.querySelector('.everyday-home-actions'),home.querySelector('.mono-home')?'Pay':'Transfer').length,1);assert(h.document.getElementById('lumo-scan-qr'));assert.deepEqual(h.errors,[]);
});
check('pending and failed first funding keep funding accessible without hiding payment destinations',()=>{
 for(const status of ['pending','failed']){
  const h=full(),{L}=h;L.addTx({type:'in',name:'Unconfirmed wallet funding',amount:600,fee:0,status});L.render();h.flush();const home=outlet(h);assert.equal(named(home,'Campus Pay').length,0);assert.equal(named(home,home.querySelector('.mono-home')?'Pay':'Transfer').length,1);assert.equal(named(home,'Add money').length,1);assert.equal(named(home.querySelector('.everyday-home-actions'),'Add money').length,1);assert(h.document.getElementById('lumo-scan-qr'));assert.equal(L.state.balance,0);assert.deepEqual(h.errors,[]);
 }
});
console.log(checks+' confirmed-first-funding Home state checks passed.');
