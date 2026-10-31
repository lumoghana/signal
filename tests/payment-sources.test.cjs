/* Pay from is an explicit planning purpose inside one operational account.
   Source choices fulfil a budget once; optional category edits are metadata. */
const assert=require('node:assert/strict');
const storageKey=require('node:fs').readFileSync(require('node:path').join(__dirname,'../dist/core.js'),'utf8').match(/const key='([^']+)'/)[1];
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let passed=0;
const check=(name,run)=>{run();passed++;console.log('PASS '+name);};
const clone=value=>JSON.parse(JSON.stringify(value));
const view=h=>h.document.getElementById('view');
function fixture(options={}){
 const h=createHarness({clock:true,...options}),{L}=h;L.explore();
 Object.assign(L.state,{balance:500,txs:[],paymentDraft:null,chats:[],categoryRules:[],essentials:[{id:'food',name:'Food',amount:150,paid:0},{id:'transport',name:'Transport',amount:100,paid:0},{id:'data',name:'Data',amount:60,paid:0},{id:'study',name:'Study',amount:40,paid:0}],goals:[{id:'laptop',name:'Laptop',allocated:100,target:3500,boxVersion:2}]});
 L.route='home';L.params={};L.history=[];L.save();L.render();h.flush();assert.equal(L.balances().room,150);return h;
}
function start(h,amount=80){h.L.pickMerchant('AK01');h.set('payment-amount',amount);return h.L.state.paymentDraft;}
function click(h,text,root=view(h)){const nodes=root.querySelectorAll('button').filter(b=>b.textContent.trim()===text);assert.equal(nodes.length,1,'One '+text+' on '+h.L.route);nodes[0].click();h.flush();}
function authorize(h,outcome='Completed'){
 const {L}=h;L.preparePayment();h.flush();
 if(L.route==='pause'){h.advance(3900);view(h).querySelector('[data-pause-hold]').click();h.advance(90);h.flush();}else L.continuePayment();
 assert.equal(L.route,'authorize');h.set('payment-pin','123456');if(L.testMode)h.set('payment-outcome',outcome);L.authorizePayment();h.flush();assert.equal(L.route,'paymentResult');assert.deepEqual(h.errors,[]);return L.state.txs[0];
}
const financial=L=>clone({balance:L.state.balance,essentials:L.state.essentials,goals:L.state.goals,txs:L.state.txs.map(t=>({id:t.id,type:t.type,status:t.status,amount:t.amount,fee:t.fee,essentialId:t.essentialId}))});

check('four budget lines expose five native source choices without another shelf',()=>{
 const h=fixture();start(h);const select=h.document.getElementById('payment-essential');assert(select);assert.equal(select.localName,'select');assert.equal(select.closest('details'),null);assert.equal(select.querySelectorAll('option').length,5);assert.equal(select.value,'');assert.match(select.querySelector('option').textContent,/Left after budget/);assert(view(h).textContent.includes('Count this under'));assert(!view(h).querySelector('.payment-plan-choice'));assert(view(h).textContent.includes('Use & remember: Food'));assert.equal(h.L.state.paymentDraft.essentialId,'');assert(view(h).querySelectorAll('button').some(b=>b.getAttribute('onclick')==="L.acceptBudgetPurpose('food')"));assert.equal(h.L.state.txs.length,0);
});
check('a fully covered budget line remains selectable while archived lines do not appear',()=>{
 const h=fixture(),{L}=h;L.markEssentialCoveredOutside('food');L.state.essentials.push({id:'old',name:'Old budget',amount:0,paid:0,archived:true});L.save();start(h);const select=h.document.getElementById('payment-essential'),options=select.querySelectorAll('option');assert.equal(options.length,5);assert.match(options.find(x=>x.value==='food').textContent,/GH₵0.00 left/);assert(!options.some(x=>x.value==='old'));h.set('payment-essential','food');const p=L.paymentProjection();assert.equal(p.essentialCovered,0);assert.equal(p.room,220);assert.equal(L.predictCategory(L.state.paymentDraft).category,'Food');
});
check('explicit source supplies purpose before merchant, note or recipient memory',()=>{
 const h=fixture(),{L}=h,d=start(h);L.state.categoryRules=[{key:L.categoryRecipientKey(d),category:'Gifts'}];h.set('payment-note','birthday gift');h.set('payment-essential','transport');const p=L.predictCategory(d);assert.equal(p.source,'budget-source');assert.equal(p.category,'Transport');assert.equal(p.confidence,'confirmed');assert.equal(d.budgetSource.id,'transport');assert.match(h.document.getElementById('entry-category').textContent,/Category: Transport/);assert.equal(L.paymentProjection().room,150);assert.equal(L.state.txs.length,0);
});
check('source selection is the category answer and a linked GH₵80 is not counted twice',()=>{
 const h=fixture(),{L}=h;start(h);h.set('payment-essential','food');const t=authorize(h);assert.equal(t.category,'Food');assert.equal(t.categoryMeta.source,'budget-source');assert.equal(t.categoryMeta.budgetLineId,'food');assert.deepEqual(clone(t.budgetSource),{type:'budget-line',id:'food',name:'Food'});assert.equal(t.essentialId,'food');assert.equal(L.state.balance,420);assert.equal(L.balances().essentials,270);assert.equal(L.balances().room,150);assert.equal(L.accountBalances().savings,100);assert(!view(h).querySelector('.category-nudge'));assert.match(view(h).textContent,/budget choice/);L.authorizePayment();assert.equal(L.state.txs.length,1);assert.equal(L.balances().essentials,270);
});
check('mixed legacy purposes stay exact while clear student costs get their shared category',()=>{
 for(const [name,category] of [['Food and transport','Food and transport'],['Next term fees','Study & fees']]){
  const h=fixture(),{L}=h;L.state.essentials[0].name=name;start(h,40);h.set('payment-essential','food');const p=L.predictCategory(L.state.paymentDraft);assert.equal(p.category,category);assert.equal(p.canonicalCategory,'');assert.equal(p.purpose,name);const t=authorize(h);assert.equal(t.category,category);assert.equal(t.budgetSource.name,name);assert.equal(L.categoryCandidates().length,0);
 }
});
check('an unambiguous budget name maps to a canonical category but preserves its source label',()=>{
 const h=fixture(),{L}=h;L.state.essentials[0].name='Weekly groceries';start(h);h.set('payment-essential','food');const p=L.predictCategory(L.state.paymentDraft);assert.equal(p.category,'Food');assert.equal(p.canonicalCategory,'Food');assert.equal(p.purpose,'Weekly groceries');assert.equal(L.state.paymentDraft.budgetSource.name,'Weekly groceries');
});
check('manual category correction leaves the chosen source and financial facts intact',()=>{
 const h=fixture(),{L}=h,d=start(h);h.set('payment-essential','food');const before=financial(L);click(h,'Change',h.document.getElementById('entry-category'));click(h,'Gifts');h.flushHistory();h.flush();assert.equal(L.route,'send');assert.equal(d.essentialId,'food');assert.equal(L.predictCategory(d).category,'Gifts');assert.deepEqual(financial(L),before);const t=authorize(h);assert.equal(t.category,'Gifts');assert.equal(t.categoryMeta.source,'customer');assert.equal(t.budgetSource.id,'food');assert.equal(L.balances().room,150);
});
check('reselecting the same source preserves a correction; choosing another source resets its stale label',()=>{
 const h=fixture(),{L}=h,d=start(h);h.set('payment-essential','food');L.chooseDraftCategory('Gifts');h.set('payment-essential','food');assert.equal(d.categoryChoice,'Gifts');h.set('payment-essential','transport');assert.equal(d.categoryChoice,undefined);assert.equal(L.predictCategory(d).category,'Transport');assert.equal(d.budgetSource.id,'transport');assert.equal(L.state.categoryRules.length,0);
});
check('Left after budget retains existing automatic classification and extra-spending arithmetic',()=>{
 const h=fixture(),{L}=h,d=start(h);h.set('payment-essential','transport');h.set('payment-essential','');assert.equal(L.predictCategory(d).source,'merchant');assert.equal(L.predictCategory(d).category,'Food');assert.equal(L.paymentProjection().room,70);const t=authorize(h);assert.equal(t.essentialId,undefined);assert.equal(t.categoryMeta.source,'merchant');assert.deepEqual(clone(t.budgetSource),{type:'after-budget',name:'Left after budget'});assert.equal(L.state.balance,420);assert.equal(L.balances().essentials,350);assert.equal(L.balances().room,70);
});
check('source, note and amount persist through category and edit returns in the saved demo state',()=>{
 const h=fixture(),{L}=h,d=start(h);h.set('payment-essential','food');h.set('payment-note','Lunch with Ama');L.openCategory('',true);click(h,'Food');h.flushHistory();h.flush();L.preparePayment();L.editPayment();h.flush();assert.equal(h.document.getElementById('payment-essential').value,'food');assert.equal(h.document.getElementById('payment-note').value,'Lunch with Ama');assert.equal(h.document.getElementById('payment-amount').value,'80');const saved=JSON.parse(h.store.get(storageKey));assert.equal(saved.paymentDraft.essentialId,'food');assert.equal(saved.paymentDraft.budgetSource.id,'food');assert.equal(saved.paymentDraft.id,d.id);assert.equal(L.state.txs.length,0);
});
check('excess beyond the selected budget line still uses after-budget room',()=>{
 const h=fixture(),{L}=h;start(h,180);h.set('payment-essential','food');const p=L.paymentProjection();assert.equal(p.essentialCovered,150);assert.equal(p.after,320);assert.equal(p.essentialsAfter,200);assert.equal(p.room,120);authorize(h);assert.equal(L.state.balance,320);assert.equal(L.balances().essentials,200);assert.equal(L.balances().room,120);
});
for(const outcome of ['Pending','Failed'])check(outcome+' source-linked payment preserves holds, reconciliation and purpose without duplicate debit',()=>{
 const h=fixture({testing:true}),{L}=h;start(h);h.set('payment-essential','food');const t=authorize(h,outcome);assert.equal(t.categoryMeta.source,'budget-source');assert.equal(t.budgetSource.id,'food');assert.equal(L.state.balance,500);assert.equal(L.balances().available,outcome==='Pending'?420:500);assert.equal(L.balances().essentials,outcome==='Pending'?270:350);assert.equal(L.balances().room,150);L.authorizePayment();assert.equal(L.state.txs.length,1);if(outcome==='Pending'){L.resolveTx(t.id,'success');assert.equal(L.state.balance,420);assert.equal(L.balances().essentials,270);assert.equal(L.balances().room,150);L.resolveTx(t.id,'success');assert.equal(L.state.balance,420);}
});
check('a removed source blocks authorisation and requires a new explicit choice',()=>{
 const h=fixture(),{L}=h;start(h);h.set('payment-essential','food');L.preparePayment();L.continuePayment();assert.equal(L.route,'authorize');L.state.essentials=L.state.essentials.filter(x=>x.id!=='food');h.set('payment-pin','123456');L.authorizePayment();h.flush();assert.equal(L.route,'send');assert(view(h).textContent.includes('no longer available'));assert.equal(L.state.balance,500);assert.equal(L.state.txs.length,0);h.set('payment-essential','');L.preparePayment();assert.equal(L.route,'paymentReview');assert.equal(L.state.paymentDraft.essentialId,'');
});
check('changing source after review invalidates the old quote rather than approving a different purpose',()=>{
 const h=fixture(),{L}=h;start(h);h.set('payment-essential','food');L.preparePayment();L.continuePayment();assert.equal(L.route,'authorize');L.state.paymentDraft.essentialId='transport';h.set('payment-pin','123456');L.authorizePayment();assert.equal(L.route,'paymentReview');assert.equal(L.state.txs.length,0);assert.equal(L.state.balance,500);
});
console.log(passed+' Pay from source checks passed.');
