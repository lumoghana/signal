/* Real application controls and persisted demo facts; no browser paint claims. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let passed=0;const check=(name,run)=>{run();passed++;console.log('PASS '+name);};
const fixture=()=>{const h=createHarness();h.L.explore();Object.assign(h.L.state,{balance:600,txs:[],paymentDraft:null,essentials:[{id:'food',name:'Food',amount:200,paid:0},{id:'transport',name:'Transport',amount:150,paid:0}],goals:[{id:'laptop',name:'Laptop',allocated:100}],allowance:{amount:0,date:''},chats:[]});h.L.route='home';h.L.params={};h.L.render();h.flush();h.activations.length=0;return h;};
const view=h=>h.document.getElementById('view');
const action=(h,code)=>{const b=view(h).querySelectorAll('button').find(el=>el.getAttribute('onclick')===code);assert(b,code);b.focus();b.click();h.flush();return b;};
const close=h=>{h.document.querySelector('.task-sheet-close').click();h.flush();};
const clean=h=>assert.deepEqual(h.errors,[]);
check('Home has three groups, direct funding/request actions and visible financial facts/navigation',()=>{
 const h=fixture(),groups=view(h).querySelectorAll('[data-home-focus]');assert.deepEqual(groups.map(el=>el.getAttribute('data-home-focus')),['money','actions','story']);
 const buttons=view(h).querySelectorAll('button');assert(!view(h).querySelector('.home-tools-shelf'));for(const code of ["L.openFunding('home')",'L.newRequest()'])assert(buttons.some(button=>button.getAttribute('onclick')===code),'Direct Home action '+code);assert(!buttons.some(button=>/L\.openPayTab\(/.test(button.getAttribute('onclick')||'')),'Home does not promote spending');assert(view(h).querySelector('.home-plan-math').textContent.includes('GH₵350.00'));assert.equal(h.document.getElementById('nav').querySelectorAll('button').length,5);assert.equal(h.L.balances().room,150);clean(h);
});
for(const dismiss of ['close','backdrop','back'])check('unsent funding survives '+dismiss+' and reopening without creating money',()=>{
 const h=fixture(),{L}=h;L.state.profile.phone='0201234567';L.openFunding('home');L.startMomoFunding();h.flush();const id=L.state.fundingDraft.id;
 assert.equal(h.document.getElementById('funding-network'),null);assert.equal(h.document.getElementById('funding-number').type,'hidden');assert.equal(L.state.fundingDraft.network,'Telecel Cash');h.set('funding-amount','125.50');h.document.getElementById('funding-owned').checked=true;
 if(dismiss==='close')close(h);else if(dismiss==='backdrop'){h.document.querySelector('.task-sheet-backdrop').click();h.flush();}else{L.back();h.flush();close(h);}
 L.openFunding('home');L.startMomoFunding();h.flush();assert.equal(L.state.fundingDraft.id,id);assert.equal(h.document.getElementById('funding-amount').value,'125.50');assert.equal(L.state.fundingDraft.network,'Telecel Cash');assert.equal(h.document.getElementById('funding-number').value,'0201234567');assert.equal(h.document.getElementById('funding-owned').checked,true);assert.equal(L.state.balance,600);assert.equal(L.state.txs.length,0);clean(h);
});
check('money request preserves an unsubmitted draft but starts fresh after request creation',()=>{
 const h=fixture(),{L}=h;L.newRequest();L.gm.onePerson();h.set('request-amount',45);h.set('request-note','Lunch share');const id=L.state.requestDraft.id;close(h);L.newRequest();L.gm.onePerson();h.flush();assert.equal(L.state.requestDraft.id,id);assert.equal(h.document.getElementById('request-amount').value,'45');assert.equal(h.document.getElementById('request-note').value,'Lunch share');view(h).querySelector('button[type=submit]').click();h.flush();action(h,'L.createRequest()');assert.equal(L.state.requests.length,1);close(h);L.newRequest();L.gm.onePerson();h.flush();assert.notEqual(L.state.requestDraft.id,id);assert.equal(L.state.requestDraft.amount,'');assert.equal(L.state.balance,600);assert.equal(L.state.txs.length,0);clean(h);
});
check('after confirmed funding Home restores the directly focused Add money control',()=>{
 const h=fixture(),{L}=h;action(h,"L.openFunding('home')");assert.equal(h.activations.length,1);action(h,'L.startMomoFunding()');h.set('funding-amount',100);h.document.getElementById('funding-owned').checked=true;view(h).querySelector('button[type=submit]').click();h.flush();action(h,'L.requestMomoFunding()');assert.equal(L.state.balance,700);action(h,'L.fundingDone()');assert.equal(L.route,'home');assert(!view(h).querySelector('.home-tools-shelf'));assert.equal(h.document.activeElement.getAttribute('onclick'),"L.openFunding('home')");assert.equal(L.state.txs.length,1);clean(h);
});
check('closing a new request returns focus to the direct Home Request money control',()=>{
 const h=fixture(),{L}=h,parent=view(h);const trigger=action(h,'L.newRequest()');action(h,'L.gm.onePerson()');h.set('request-amount',45);h.set('request-note','Lunch share');const id=L.state.requestDraft.id;close(h);assert.equal(L.route,'home');assert(view(h)===parent);assert.equal(h.document.activeElement,trigger);assert.equal(L.state.requestDraft.id,id);action(h,'L.newRequest()');action(h,'L.gm.onePerson()');assert.equal(h.document.getElementById('request-amount').value,'45');assert.equal(h.document.getElementById('request-note').value,'Lunch share');assert.equal(L.state.balance,600);assert.equal(L.state.requests.length,0);clean(h);
});

check('failed funding keeps details for an explicit new attempt, while pending reuses its reference',()=>{
 const h=fixture(),{L}=h;L.state.fundingDraft={id:'old',txId:'failed',amount:125,number:'0241230123',network:'MTN MoMo',owned:true,stage:'result'};L.state.txs=[{id:'failed',type:'in',status:'failed',amount:125}];L.startMomoFunding();h.flush();assert.notEqual(L.state.fundingDraft.id,'old');assert.equal(L.state.fundingDraft.amount,125);assert.equal(L.state.fundingDraft.stage,'form');assert(!L.state.fundingDraft.txId);const retry=L.state.fundingDraft;retry.txId='pending';L.state.txs.push({id:'pending',type:'in',status:'pending',amount:125});close(h);L.startMomoFunding();h.flush();assert.equal(L.state.fundingDraft.txId,'pending');assert.equal(L.state.balance,600);assert.equal(L.balances().available,600);clean(h);
});
check('Review labels amount once and retains recipient, method, fee, total and separate authentication',()=>{
 const h=fixture(),{L}=h;L.go('campusPay');L.pickMerchant('AK01');h.set('payment-amount',80);L.preparePayment();h.flush();const title=view(h).querySelector('.focus-payment-title'),rows=view(h).querySelectorAll('.focus-receipt>div');assert(title.textContent.includes('Amount'));assert(title.textContent.includes('Akua’s Kitchen'));assert(title.textContent.includes('Campus Pay'));assert.deepEqual(rows.map(el=>el.querySelector('span').textContent),['Fee','Total to pay']);assert(!view(h).querySelector('.entry-consequence'));assert.equal(L.state.balance,600);action(h,'L.continuePayment()');assert.equal(L.route,'authorize');assert.equal(L.state.txs.length,0);clean(h);
});
check('keyboard action and status styles preserve genuine controls and neutral unconfirmed feedback',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../dist/native-refinement.css'),'utf8');assert(css.includes('form>button[type=submit].primary{position:sticky'));assert(css.includes('scroll-margin-bottom:92px'));assert(css.includes('.payment-result-compact[data-payment-state=confirmed] .result-mark'));assert(!css.includes('user-scalable=no'));
});
console.log(passed+' completion-pass checks passed; no rendered phone fit or screenshot claims.');
