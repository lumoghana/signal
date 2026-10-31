/* Account and help boundaries exercise the actual shipped index and native
   history. They prove prototype behavior, not live provider authentication. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const settle=h=>{h.flushHistory();h.flush();};
const view=h=>h.document.getElementById('view');
function fixture({sample=true,testing=true}={}){const h=createHarness({clock:true,deferHistory:true,testing});if(sample)h.L.explore();else h.L.render();settle(h);return h;}
function go(h,route,params={}){h.L.go(route,params);settle(h);}
const clean=h=>assert.deepEqual(h.errors,[]);
const caseRecord=()=>({id:'CASE-PRIVATE',type:'General question',description:'PRIVATE-REPORT-SENTINEL: Please explain this sample payment.',status:'Saved on device',created:'29 Oct 2026',context:{name:'PRIVATE-PAYMENT-NAME',reference:'PRIVATE-TX',amount:246,status:'pending'},messages:[]});

test('public Help and an anonymous support note never read or mutate signed-out account reports',()=>{
 const h=fixture(),{L}=h;L.state.cases=[caseRecord()];L.state.locked=true;go(h,'help');
 assert(!view(h).textContent.includes('CASE-PRIVATE'));assert(!view(h).textContent.includes('PRIVATE-REPORT'));assert(view(h).textContent.includes('Sign in'));
 go(h,'supportCase',{txId:'PRIVATE-TX',reference:'PRIVATE-TX',name:'PRIVATE-PAYMENT-NAME',amount:246});
 assert(view(h).textContent.includes('Prepare a support note'));assert(!view(h).textContent.includes('PRIVATE-TX'));assert(!view(h).textContent.includes('246.00'));
 const files=[];L.download=(...args)=>files.push(args);h.set('publicReportDescription','I need help returning to my sample setup.');L.acct.downloadPublicReport();
 assert.equal(files.length,1);assert(files[0][1].includes('Not sent'));assert(!files[0][1].includes('PRIVATE-'));
 const before=JSON.stringify(L.state.cases);L.acct.submitCase();settle(h);assert.equal(JSON.stringify(L.state.cases),before);
 L.acct.replyCase('CASE-PRIVATE');settle(h);L.acct.resolveCase('CASE-PRIVATE');settle(h);L.acct.reopenCase('CASE-PRIVATE');settle(h);L.acct.copyCase('CASE-PRIVATE');settle(h);
 assert.equal(JSON.stringify(L.state.cases),before);assert.equal(files.length,1);
 go(h,'caseDetail',{id:'CASE-PRIVATE'});assert.equal(L.route,'signin');assert(!view(h).textContent.includes('PRIVATE-REPORT'));clean(h);
});

test('closed locked records require sign-in, then show only useful read-only account actions',()=>{
 const h=fixture({sample:false}),{L}=h;L.state.onboarded=true;Object.assign(L.state.profile,{phone:'0241230123',pin:'654321'});L.ensureAccounts();
 L.state.closure={id:'CLOSE-REVIEW',status:'Closed',date:'29 Oct 2026'};L.state.closed=true;L.state.locked=true;
 go(h,'home');assert.equal(L.route,'signin');assert(h.document.getElementById('signPin'));assert(!view(h).textContent.includes(L.state.accounts.operational.number));
 h.set('signPhone','0241230123');h.set('signPin','654321');L.onboarding.signin();settle(h);
 assert.equal(L.route,'accountInfo');assert.match(view(h).textContent,/Account closed/);assert.match(view(h).textContent,/read-only records/);
 const actions=view(h).querySelectorAll('button').map(b=>b.getAttribute('onclick')||'');assert(!actions.some(s=>s.includes('openFunding')||s.includes("go('goals')")));
 assert(actions.some(s=>s.includes("go('statements')")));assert(actions.some(s=>s.includes("go('dataExport')")));assert(actions.some(s=>s.includes("go('help')")));
 L.acct.signout();settle(h);assert.equal(L.route,'actionConfirm');L.acceptNativeDecision();settle(h);assert.equal(L.state.locked,true);go(h,'accountInfo');assert.equal(L.route,'signin');clean(h);
});

test('saved-report history restores only after authentication and stale report actions stay rejected',()=>{
 const h=fixture(),{L}=h;L.state.cases=[caseRecord()];go(h,'caseDetail',{id:'CASE-PRIVATE'});assert(view(h).textContent.includes('PRIVATE-REPORT'));
 L.state.locked=true;L.render();settle(h);assert.equal(L.route,'signin');assert(!view(h).textContent.includes('PRIVATE-REPORT'));
 h.set('signPhone',L.state.profile.phone);h.set('signPin','123456');L.onboarding.signin();settle(h);assert.equal(L.route,'caseDetail');assert(view(h).textContent.includes('PRIVATE-REPORT'));
 L.state.locked=true;h.history.back();settle(h);assert(!view(h).textContent.includes('PRIVATE-REPORT'));h.history.forward();settle(h);assert(!view(h).textContent.includes('PRIVATE-REPORT'));clean(h);
});

test('shared PIN failures span exports and sign-in, with one sixty-second cooldown',()=>{
 const h=fixture(),{L}=h;L.download=()=>assert.fail('Wrong PIN cannot export');
 for(let i=0;i<4;i++){go(h,'dataExport');h.set('authPin','000000');L.acct.downloadData();settle(h);assert.equal(L.authPolicy.status().remaining,4-i);}
 go(h,'statements');h.set('statementFrom','2026-01-01');h.set('statementTo','2026-01-02');h.set('authPin','000000');L.acct.statement();settle(h);
 assert.equal(L.state.locked,true);assert.equal(L.route,'signin');assert.equal(L.authPolicy.status().seconds,60);assert.equal(h.document.getElementById('signinButton').disabled,true);
 h.set('signPhone',L.state.profile.phone);h.set('signPin','123456');L.onboarding.signin();settle(h);assert.equal(L.state.locked,true);
 h.advance(60000);assert.equal(L.authPolicy.status().seconds,0);assert.equal(h.document.getElementById('signinButton').disabled,false);
 h.set('signPin','123456');L.onboarding.signin();settle(h);assert.equal(L.state.locked,false);assert.equal(L.authPolicy.status().remaining,5);clean(h);
});

test('fresh linked-identity recovery completes an explicit sample without creating or importing an account',()=>{
 const h=fixture({sample:false}),{L}=h;L.state.setup.identityStatus='linked';L.state.setup.phoneConfirmed=true;L.state.profile.phone='0241230123';go(h,'recovery');
 assert.match(view(h).textContent,/existing account is elsewhere/);L.onboarding.recoveryStart('external');settle(h);assert.equal(L.route,'recoveryOwnership');
 h.set('recoveryOutcome','pending');L.onboarding.recoveryOwnership();settle(h);assert.equal(L.route,'recoveryStatus');h.set('recoveryResolve','approved');L.onboarding.recoveryCheck();settle(h);
 assert.equal(L.route,'recoveryStatus');assert.match(view(h).textContent,/Sample ownership check complete/);assert.match(view(h).textContent,/not loaded or changed/);
 assert.equal(L.state.onboarded,false);assert.equal(L.state.profile.pin,'');assert.equal(L.state.accounts,undefined);assert.equal(L.state.txs.length,0);
 const files=[];L.download=(...args)=>files.push(args);L.onboarding.downloadRecoverySummary();assert.equal(files.length,1);assert(files[0][1].includes('No remote account was loaded'));assert(!files[0][1].includes('0241230123'));clean(h);
});

test('email is optional at signup and profile, while a supplied invalid email stays blocked',()=>{
 const h=fixture({sample:false}),{L}=h;Object.assign(L.state.setup,{phoneConfirmed:true,identityStatus:'approved',verifiedIdentity:{name:'Kwame Mensah',ghanaCard:'GHA-SAMPLE',dateOfBirth:'2004-03-12'}});L.state.profile.phone='0241230123';go(h,'identityResult');
 h.set('campusName','University of Ghana');h.set('campusEmail','bad-email');L.onboarding.confirmVerifiedDetails();settle(h);assert.equal(L.route,'identityResult');assert.equal(h.document.activeElement.id,'campusEmail');
 h.set('campusEmail','');L.onboarding.confirmVerifiedDetails();settle(h);assert.equal(L.route,'pin');assert.equal(L.state.profile.email,'');clean(h);
});

test('only unresolved financial disputes, not general questions or privacy notes, block closure',()=>{
 const h=fixture({sample:false}),{L}=h;L.state.onboarded=true;L.state.profile.pin='123456';L.ensureAccounts();L.state.cases=[{...caseRecord(),type:'General question'},{...caseRecord(),id:'PRIVACY',type:'Privacy request'}];
 assert(!L.acct.blockers().some(b=>b.route==='caseDetail'));L.state.cases.push({...caseRecord(),id:'FRAUD',type:'I did not make this payment'});assert(L.acct.blockers().some(b=>b.id==='FRAUD'));clean(h);
});

test('authenticated export includes Chat and owned group history but omits foreign records, secrets and file bytes',()=>{
 const h=fixture(),{L}=h,files=[];const owner=L.state.profile.account;
 L.state.chats=[{q:'Can I afford lunch?',headline:'See your saved costs.',context:{days:7,pin:'NEVER-CONTEXT-PIN'},calculation:{rows:[['Available','GH₵50.00']],notes:['Saved sample facts.']},secret:'NEVER-CHAT-SECRET'}];
 L.state.groupMoney={version:1,items:[{id:'OWN-GROUP',ownerKey:owner,type:'collection',title:'Class trip',people:[{id:'self',name:'You'}],mandate:{version:2,requiredApprovals:2},payments:[{id:'CONTRIB',amountCents:1000,personId:'self',status:'confirmed'}],proposals:[{id:'PAYOUT',recipient:'Sample supplier',amountCents:500,attachment:{name:'proof.pdf',type:'application/pdf',size:14,dataUrl:'NEVER-FILE-BYTES'},fingerprint:'NEVER-FINGERPRINT',pin:'NEVER-PAYOUT-PIN'}]},{id:'FOREIGN-GROUP',ownerKey:'other-account',title:'NEVER-FOREIGN-TITLE'}],invitations:[]};
 L.state.moneyBoxProtection={version:1,boxes:{box:{status:'active',phone:'0201234567',invitation:{code:'NEVER-PARTNER-CODE'}}},challenges:[],cases:[]};
 L.state.paymentDraft={pin:'NEVER-DRAFT-PIN'};L.download=(name,content)=>files.push({name,data:JSON.parse(content)});go(h,'dataExport');h.set('authPin','123456');L.acct.downloadData();
 assert.equal(files.length,1);const data=files[0].data,text=JSON.stringify(data);assert.equal(data.chats[0].q,'Can I afford lunch?');assert.equal(data.groupMoney.items[0].id,'OWN-GROUP');assert.equal(data.groupMoney.items.length,1);assert.equal(data.groupMoney.items[0].proposals[0].attachment.name,'proof.pdf');assert(!text.includes('NEVER-'));assert.equal(data.profile.pin,undefined);assert.equal(L.value('authPin'),'');clean(h);
});

test('a saved support handoff includes the chosen report and reference, never fake delivery or a refund',()=>{
 const h=fixture(),{L}=h,files=[];L.state.cases=[caseRecord()];L.download=(...args)=>files.push(args);go(h,'caseDetail',{id:'CASE-PRIVATE'});L.acct.downloadCase('CASE-PRIVATE');assert.equal(files.length,1);assert(files[0][1].includes('PRIVATE-TX'));assert(files[0][1].includes('Not sent to support'));assert(files[0][1].includes('No payment, refund or protection'));assert.equal(L.state.cases[0].status,'Saved on device');clean(h);
});

test('a failed durable save rolls back PIN, preference and saved-report mutations',()=>{
 for(const scenario of ['pin','marketing','report']){
  const h=fixture(),{L}=h;L.state.cases=[caseRecord()];L.save();
  if(scenario==='pin'){go(h,'changePin');h.set('authPin','123456');h.set('newPin','654321');h.set('confirmNewPin','654321');}
  if(scenario==='marketing')go(h,'privacy');
  if(scenario==='report'){go(h,'caseDetail',{id:'CASE-PRIVATE'});h.set('caseReply','An update that must not be falsely saved.');}
  const before=JSON.stringify({pin:L.state.profile.pin,prefs:L.state.prefs,accountPrefs:L.state.accountPrefs,cases:L.state.cases}),stored=[...h.store.entries()];
  h.context.localStorage.setItem=()=>{throw Error('QuotaExceededError');};
  if(scenario==='pin')L.acct.changePin();if(scenario==='marketing')L.acct.toggle('marketing');if(scenario==='report')L.acct.replyCase('CASE-PRIVATE');settle(h);
  assert.equal(JSON.stringify({pin:L.state.profile.pin,prefs:L.state.prefs,accountPrefs:L.state.accountPrefs,cases:L.state.cases}),before,scenario+' is rolled back');assert.deepEqual([...h.store.entries()],stored);assert.equal(L.persistence.status().saveFailed,true);
  assert(view(h).textContent.includes('could not be saved')||view(h).textContent.includes('saved-progress warning'));
  for(const field of h.document.querySelectorAll('input[type="password"]'))assert.equal(field.value,'');clean(h);
 }
});

test('a data download never starts when its fresh PIN approval cannot be saved',()=>{
 const h=fixture(),{L}=h,files=[];L.download=(...args)=>files.push(args);go(h,'dataExport');h.set('authPin','123456');h.context.localStorage.setItem=()=>{throw Error('QuotaExceededError');};L.acct.downloadData();settle(h);assert.equal(files.length,0);assert.equal(L.value('authPin'),'');assert.equal(L.persistence.status().saveFailed,true);clean(h);
});
