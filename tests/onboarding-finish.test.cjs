/* Product finishing checks exercise mounted shipped forms and final adapters.
   They do not claim bank, identity-provider or live support connections. */
'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let passed=0;
const check=(name,run)=>{run();passed++;console.log('PASS '+name);};
const root=h=>h.document.getElementById('view');
const settle=h=>{h.flushHistory();h.flush();};
function fixture({sample=true}={}){const h=createHarness({clock:true,deferHistory:true});if(sample)h.L.explore();else h.L.render();settle(h);return h;}
function go(h,route,params={}){h.L.go(route,params);settle(h);}
function submit(h){const form=root(h).querySelector('form');assert(form,'A real form on '+h.L.route);const buttons=form.querySelectorAll('button[type="submit"]');assert.equal(buttons.length,1);assert.equal(buttons[0].getAttribute('onclick'),null,'Submit has no second click controller');h.submit(form);settle(h);}
function click(h,label){const button=root(h).querySelectorAll('button').find(el=>el.textContent.trim()===label);assert(button,'Visible '+label+' on '+h.L.route);button.click();settle(h);}
function type(h,id,value){const field=h.set(id,value),handler=field.getAttribute('oninput');if(handler){h.context.__finishField=field;vm.runInContext('(function(){'+handler+'}).call(__finishField)',h.context);delete h.context.__finishField;}return field;}
const clean=h=>assert.deepEqual(h.errors,[]);
const money=L=>JSON.stringify([L.state.accounts,L.state.txs,L.state.goals,L.state.essentials,L.state.virtualCards]);

check('Welcome prioritises existing account access while fresh and saved signup retain their own entry',()=>{
 const h=fixture(),{L}=h;L.state.locked=true;go(h,'welcome');let actions=root(h).querySelector('.actions');assert.equal(actions.querySelector('button').textContent,'Sign in');if(L.hibiscusFlowArt){assert(root(h).querySelector('.hibiscus-scene'));assert.equal(root(h).querySelector('.getting-started-scene'),null);}const before=money(L);click(h,'Sign in');assert.equal(L.route,'signin');h.set('signPhone',L.state.profile.phone);h.set('signPin','123456');submit(h);assert.equal(L.route,'home');assert.equal(L.state.locked,false);assert.equal(money(L),before);assert.equal(h.document.getElementById('balance-eye').getAttribute('aria-label'),'Show balances');go(h,'welcome');assert.equal(root(h).querySelector('.actions button').textContent,'Continue my Lumo');click(h,'Continue my Lumo');assert.equal(L.route,'home');L.state.closed=true;go(h,'welcome');assert.equal(root(h).querySelector('.actions button').textContent,'View saved records');const closedMoney=money(L);click(h,'View saved records');assert.equal(L.route,'accountInfo');assert.equal(L.state.closed,true);assert.equal(money(L),closedMoney);L.state.locked=true;go(h,'welcome');click(h,'View saved records');assert.equal(L.route,'signin');assert.equal(L.state.locked,true);
 const fresh=fixture({sample:false});go(fresh,'welcome');assert.equal(root(fresh).querySelector('.actions button').textContent,'Get started');if(fresh.L.hibiscusFlowArt){assert(root(fresh).querySelector('.hibiscus-scene'));assert.equal(root(fresh).querySelector('.getting-started-scene'),null);}click(fresh,'Get started');assert.equal(fresh.L.route,'samplePause');assert.equal(fresh.L.state.onboarded,false);go(fresh,'welcome');fresh.L.state.setup.phone='0241230123';go(fresh,'welcome');assert.equal(root(fresh).querySelector('.actions button').textContent,'Continue my setup');clean(h);clean(fresh);
});

check('Sign-in lock ticks in place, expires and never submits or resets fields',()=>{
 const h=fixture(),{L}=h;L.state.locked=true;go(h,'signin');const phone=h.set('signPhone',L.state.profile.phone),pin=h.set('signPin','000000');for(let i=0;i<5;i++)submit(h);const before=money(L),lock=L.authPolicy.status().blockedUntil;assert.equal(h.document.getElementById('signinButton').disabled,true);assert.equal(h.document.getElementById('signinLockSeconds').textContent,'60');h.advance(1100);assert.equal(h.document.getElementById('signinLockSeconds').textContent,'59');assert.equal(h.document.getElementById('signPhone'),phone);assert.equal(h.document.getElementById('signPin'),pin);assert.equal(pin.value,'000000');h.advance(60000);assert.equal(h.document.getElementById('signinButton').disabled,false);assert.equal(h.document.getElementById('signinLock').hidden,true);assert.equal(L.authPolicy.status().blockedUntil,lock);assert.equal(L.state.locked,true);assert.equal(money(L),before);assert(!h.document.getElementById('error').textContent.includes('Wait for the retry timer'));h.set('signPin','123456');submit(h);assert.equal(L.route,'home');clean(h);
});

check('Profile, phone and PIN forms focus their own invalid field without losing other values',()=>{
 const h=fixture(),{L}=h;go(h,'profileEdit');h.set('displayName','X');h.set('handle','kwame.new');h.set('email','hello@example.test');submit(h);assert.equal(h.document.activeElement.id,'displayName');assert.equal(L.value('handle'),'kwame.new');h.set('displayName','Kwame New');h.set('email','invalid');submit(h);assert.equal(h.document.activeElement.id,'email');h.set('email','hello@example.test');submit(h);assert.equal(L.route,'profile');assert.equal(L.state.profile.displayName,'Kwame New');
 go(h,'profilePhone');h.set('newPhone','bad');h.set('authPin','000000');submit(h);assert.equal(h.document.activeElement.id,'authPin');h.set('authPin','123456');submit(h);assert.equal(h.document.activeElement.id,'newPhone');h.set('newPhone','0201234567');h.set('phoneOtp','000000');submit(h);assert.equal(h.document.activeElement.id,'phoneOtp');assert.equal(L.value('newPhone'),'0201234567');
 go(h,'changePin');h.set('authPin','123456');h.set('newPin','654321');h.set('confirmNewPin','654322');submit(h);assert.equal(h.document.activeElement.id,'confirmNewPin');assert.equal(L.value('newPin'),'654321');assert.equal(L.value('confirmNewPin'),'');h.set('confirmNewPin','654321');submit(h);assert.equal(L.route,'security');assert.equal(L.state.profile.pin,'654321');clean(h);
});

check('Each account form submit calls its controller exactly once',()=>{
 const h=fixture(),{L}=h;
 for(const [route,method]of [['profileEdit','saveProfile'],['profilePhone','savePhone'],['changePin','changePin'],['dataExport','downloadData'],['statements','statement'],['supportCase','submitCase']]){
  go(h,route);let calls=0;const original=L.acct[method];L.acct[method]=()=>{calls++;};submit(h);assert.equal(calls,1,route);L.acct[method]=original;
 }
 clean(h);
});

check('One export submit authenticates the final full data download and clears the PIN',()=>{
 const h=fixture(),{L}=h,files=[];L.download=(...args)=>files.push(args);go(h,'dataExport');const before=money(L);assert(!root(h).textContent.includes('Prepare my copy'));h.set('authPin','000000');submit(h);assert.equal(files.length,0);assert.equal(h.document.activeElement.id,'authPin');h.set('authPin','123456');submit(h);assert.equal(files.length,1);const data=JSON.parse(files[0][1]);assert.equal(data.profile.pin,undefined);assert(data.accounts);assert(Array.isArray(data.virtualCards));assert(Array.isArray(data.moneyBoxes));assert.equal(L.value('authPin'),'');submit(h);assert.equal(files.length,1);assert.equal(money(L),before);clean(h);
});

check('Statement submit validates real dates and downloads once with fresh PIN every time',()=>{
 const h=fixture(),{L}=h,files=[];L.download=(...args)=>files.push(args);go(h,'statements');const before=money(L);h.set('statementFrom','2026-02-31');h.set('statementTo','2026-03-10');h.set('authPin','123456');submit(h);assert.equal(files.length,0);assert.equal(h.document.activeElement.id,'statementFrom');assert.equal(L.value('statementTo'),'2026-03-10');h.set('statementFrom','2026-03-10');h.set('statementTo','2026-03-01');submit(h);assert.equal(files.length,0);assert.equal(h.document.activeElement.id,'statementTo');h.set('statementFrom','2026-01-01');h.set('statementTo','2026-01-02');submit(h);assert.equal(files.length,1);assert(files[0][1].includes('Not a bank statement.'));assert(files[0][1].includes('No activity in this period.'));assert.equal(L.value('authPin'),'');submit(h);assert.equal(files.length,1);assert.equal(money(L),before);clean(h);
});

check('Support context is recognisable and closed reports stay read-only until explicit reopen',()=>{
 const h=fixture(),{L}=h;L.state.txs.unshift({id:'FINISH-TX',name:'Akua’s Kitchen',amount:25,status:'pending',date:'2026-10-26T10:00:00Z',type:'out'});go(h,'supportCase',{txId:'FINISH-TX'});assert(root(h).querySelector('.related-payment .soft').textContent.includes('Akua’s Kitchen'));assert(root(h).querySelector('.related-payment .soft').textContent.includes('25.00'));assert(root(h).textContent.includes('FINISH-TX'));assert(root(h).querySelector('.related-payment .soft').textContent.includes('Payment being checked'));h.set('caseDescription','Short');submit(h);assert.equal(h.document.activeElement.id,'caseDescription');h.set('caseDescription','Please check why this payment is still pending.');submit(h);assert.equal(L.route,'caseDetail');const c=L.state.cases[0];assert.equal(c.context.name,'Akua’s Kitchen');c.status='Resolved';go(h,'caseDetail',{id:c.id});assert.equal(h.document.getElementById('caseReply'),null);const count=c.messages.length;L.acct.replyCase(c.id);assert.equal(c.status,'Resolved');assert.equal(c.messages.length,count);click(h,'Reopen report');assert.equal(c.status,'Saved on device');h.set('caseReply','The amount is still pending.');submit(h);assert.equal(c.messages.length,count+1);assert.equal(c.context.reference,'FINISH-TX');clean(h);
});

check('Only a blank optional address is collapsed and drafts reopen with the same value',()=>{
 const h=fixture({sample:false}),{L}=h;Object.assign(L.state.setup,{phoneConfirmed:true,identityStatus:'approved',verifiedIdentity:{name:'Kwame Mensah',dateOfBirth:'2004-03-12',ghanaCard:'GHA-SAMPLE'}});L.state.profile.phone='0241230123';go(h,'identityResult');assert.equal(root(h).querySelector('.optional-address').hasAttribute('open'),false);const field=h.document.getElementById('customerAddress');assert(field);type(h,'customerAddress','Hall 4, Legon');go(h,'identityResult');assert.equal(root(h).querySelector('.optional-address').hasAttribute('open'),true);assert.equal(L.value('customerAddress'),'Hall 4, Legon');type(h,'customerAddress','');go(h,'identityResult');assert.equal(root(h).querySelector('.optional-address').hasAttribute('open'),false);assert.equal(L.value('customerAddress'),'');clean(h);
});

check('Unchanged application, identity and recovery checks acknowledge saved review without inventing progress',()=>{
 const h=fixture({sample:false}),{L}=h;L.state.setup.applicationStatus='pending';go(h,'applicationStatus');L.onboarding.applicationCheck();settle(h);assert(h.document.getElementById('toast').textContent.includes('No change yet'));assert.equal(L.state.onboarded,false);L.state.setup.identityStatus='pending';go(h,'identityResult');L.onboarding.identityResolve();settle(h);assert(h.document.getElementById('toast').textContent.includes('Still in review'));L.state.setup.recovery={kind:'pin',phoneChecked:true,status:'pending'};go(h,'recoveryStatus');L.onboarding.recoveryCheck();settle(h);assert(h.document.getElementById('toast').textContent.includes('No change yet'));assert.equal(L.state.setup.recovery.status,'pending');clean(h);
});

check('Merchant search distinguishes no match and restores actual history without data changes',()=>{
 const h=fixture(),{L}=h;L.state.merchant={approved:true,collections:[{id:'SALE-ABC',amount:25,status:'Confirmed'},{id:'SALE-XYZ',amount:40,status:'Processing'}],settlements:[]};go(h,'merchantSales');const before=money(L),merchant=JSON.stringify(L.state.merchant);h.set('saleSearch','  missing  ');L.acct.filterSales();assert.equal(h.document.getElementById('saleSearchEmpty').hidden,false);assert(root(h).querySelectorAll('[data-sale]').every(row=>row.hidden));click(h,'Clear search');assert.equal(L.value('saleSearch'),'');assert(root(h).querySelectorAll('[data-sale]').every(row=>!row.hidden));h.set('saleSearch','  pRoCeSsInG ');L.acct.filterSales();assert.equal(root(h).querySelectorAll('[data-sale]').filter(row=>!row.hidden).length,1);assert.equal(h.document.getElementById('saleSearchEmpty').hidden,true);assert.equal(JSON.stringify(L.state.merchant),merchant);assert.equal(money(L),before);L.state.merchant.collections=[];go(h,'merchantSales');h.set('saleSearch','missing');L.acct.filterSales();assert.equal(h.document.getElementById('saleSearchEmpty').hidden,true);assert(root(h).textContent.includes('No sales yet.'));clean(h);
});

check('Ambassador tasks expose bounded existing destinations only for an open account',()=>{
 const h=fixture(),{L}=h;go(h,'ambassadorGuide');assert.equal(root(h).querySelectorAll('.test-step details').length,9);click(h,'Open Plan');assert.equal(L.route,'plan');L.state.locked=true;go(h,'ambassadorGuide');assert(!root(h).querySelectorAll('button').some(button=>button.textContent==='Open Plan'));assert(root(h).textContent.includes('Do not enter real Ghana Card details, banking PINs or payment information.'));clean(h);
});
console.log(passed+' onboarding finishing groups passed.');
