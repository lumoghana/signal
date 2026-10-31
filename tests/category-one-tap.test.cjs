/* V13 fixture: GH₵600 total = GH₵500 operational + GH₵100 savings; budget room GH₵150. */
/* One tap answers a category question; it never supplies financial consent. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const copy=x=>JSON.parse(JSON.stringify(x));
let passed=0;
const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
const view=h=>h.document.getElementById('view');
function fixture(){const h=createHarness(),{L}=h;L.explore();Object.assign(L.state,{balance:500,txs:[],essentials:[{id:'food',name:'Food and transport',amount:350,paid:0}],goals:[{id:'laptop',name:'Laptop',allocated:100,target:3500}],chats:[],categoryRules:[],paymentDraft:null});assert.equal(L.accountBalances().operational,500);assert.equal(L.accountBalances().savings,100);assert.equal(L.accountBalances().total,600);assert.equal(L.balances().room,150);L.route='home';L.params={};L.history=[];L.save();L.render();h.flush();L.startSend('lumo');L.pickPerson('abena');h.flush();h.set('payment-amount',40);return h;}
const financial=L=>copy({balance:L.state.balance,txs:L.state.txs.map(t=>({id:t.id,type:t.type,amount:t.amount,fee:t.fee,status:t.status,essentialId:t.essentialId})),essentials:L.state.essentials,goals:L.state.goals});
function click(h,label,root=view(h)){const buttons=root.querySelectorAll('button').filter(x=>x.textContent.trim()===label);assert.equal(buttons.length,1,'One '+label);buttons[0].click();h.flush();}
const clean=h=>assert.deepEqual(h.errors,[]);

check('a note suggestion takes one tap without replacing inputs, selecting a plan or changing funds',()=>{
 const h=fixture(),{L}=h,d=L.state.paymentDraft,input=h.document.getElementById('payment-note'),amount=h.document.getElementById('payment-amount');input.focus();h.set('payment-note','waakye lunch');
 assert.equal(h.document.activeElement,input);assert.equal(h.document.getElementById('payment-amount'),amount);assert.equal(L.predictCategory(d).confidence,'suggested');
 const before=financial(L);click(h,'Use Food');assert.equal(L.route,'send');assert.equal(L.predictCategory(d).confidence,'confirmed');assert.equal(d.categoryChoice,'Food');assert.equal(d.essentialId,'');assert.equal(d.amount,'40');assert.equal(d.note,'waakye lunch');assert.equal(h.document.getElementById('payment-note'),input);assert.equal(L.state.categoryRules.length,0);assert.deepEqual(financial(L),before);assert(!view(h).textContent.includes('For Food?'));clean(h);
});

check('recipient lookup does not ask a purpose question before it knows who is being paid',()=>{
 const h=fixture(),{L}=h;
 for(const method of ['lumo','momo','bank']){L.startSend(method);h.flush();assert(!h.document.getElementById('entry-category'));assert(h.document.getElementById('payment-amount'));}
 L.startBill('data');h.flush();assert.match(h.document.getElementById('entry-category').textContent,/For: Data/);clean(h);
});

check('unknown help offers at most three grounded choices including Other without silently predicting',()=>{
 const h=fixture(),{L}=h,d=L.state.paymentDraft;assert.equal(L.predictCategory(d).confidence,'unknown');assert.deepEqual(copy(L.categoryHelpOptions(d)),['Food','Transport','Other']);
 const row=h.document.getElementById('entry-category');assert.equal(row.querySelectorAll('.category-chip').length,3);const before=financial(L);click(h,'Other',row);assert.equal(L.predictCategory(d).category,'Other');assert.equal(L.predictCategory(d).confidence,'confirmed');assert.equal(L.state.categoryRules.length,0);assert.deepEqual(financial(L),before);clean(h);
});

check('without history or saved context unknown help does not invent a likely purpose',()=>{
 const h=fixture(),{L}=h;L.state.essentials=[];L.render();h.flush();assert.deepEqual(copy(L.categoryHelpOptions(L.state.paymentDraft)),['Other']);assert.equal(h.document.getElementById('entry-category').querySelectorAll('.category-chip').length,1);assert.equal(L.predictCategory(L.state.paymentDraft).confidence,'unknown');clean(h);
});

check('Not now removes the optional question and an uncategorised payment can proceed',()=>{
 const h=fixture(),{L}=h,d=L.state.paymentDraft,before=financial(L);click(h,'Not now',h.document.getElementById('entry-category'));assert(!h.document.getElementById('entry-category').textContent.includes('What’s this for?'));assert.equal(L.predictCategory(d).confidence,'unknown');assert.deepEqual(financial(L),before);
 L.preparePayment();h.flush();assert.equal(L.route,'paymentReview');assert.equal(d.categoryChoice,undefined);assert.equal(L.state.txs.length,0);clean(h);
});

check('known merchants and remembered recipients remain editable without being questioned',()=>{
 const h=fixture(),{L}=h;L.pickMerchant('AK01');h.flush();let row=h.document.getElementById('entry-category');assert.match(row.textContent,/For: Food/);assert.equal(row.querySelectorAll('.category-chip').length,0);assert.equal(L.predictCategory(L.state.paymentDraft).source,'merchant');
 L.startSend('lumo');L.pickPerson('abena');L.state.categoryRules=[{key:L.categoryRecipientKey(L.state.paymentDraft),category:'Repayment'}];L.render();h.flush();row=h.document.getElementById('entry-category');assert.match(row.textContent,/For: Repayment · remembered/);assert.equal(row.querySelectorAll('.category-chip').length,0);click(h,'Change',row);assert.equal(L.route,'categoryEdit');assert.equal(L.state.balance,500);clean(h);
});

check('skipping the entry question is respected on the result with category editing still available',()=>{
 const h=fixture(),{L}=h,d=L.state.paymentDraft;click(h,'Not now',h.document.getElementById('entry-category'));
 const t=L.addTx({draftId:d.id,type:'out',status:'success',name:d.name,amount:40,fee:0,date:new Date().toISOString()});d.submittedTxId=t.id;L.go('paymentResult',{id:t.id});h.flush();assert.equal(t.category,'Uncategorised');assert.equal(t.categoryPromptDismissed,true);assert(!view(h).querySelector('.category-nudge'));assert.match(view(h).querySelector('.receipt-category').textContent,/Add category/);assert(L.needsCategory(t));clean(h);
});

check('ambiguous confirmed recipient history ranks quick choices without becoming an automatic rule',()=>{
 const h=fixture(),{L}=h,d=L.state.paymentDraft,key=L.categoryRecipientKey(d);
 L.state.txs=[['a','Repayment'],['b','Food'],['c','Repayment']].map(([id,category],i)=>({id,category,type:'out',status:'success',amount:5,date:new Date(Date.now()-i*1000).toISOString(),categoryRecipientKey:key,categoryMeta:{source:'customer',confidence:'confirmed'}}));
 assert.deepEqual(copy(L.categoryHelpOptions(d)),['Repayment','Food','Other']);assert.equal(L.predictCategory(d).confidence,'unknown');assert.equal(L.state.categoryRules.length,0);L.render();h.flush();const before=financial(L);click(h,'Repayment',h.document.getElementById('entry-category'));assert.equal(L.predictCategory(d).category,'Repayment');assert.deepEqual(financial(L),before);clean(h);
});

check('one-tap answers never rewrite saved defaults or fulfil linked essentials',()=>{
 const h=fixture(),{L}=h,d=L.state.paymentDraft;h.set('payment-essential','food');const saved={key:L.categoryRecipientKey(d),category:'Food'};L.state.categoryRules=[saved];h.set('payment-note','birthday gift');L.render();h.flush();const before=financial(L);
 // The explicit budget source now outranks an inferred note. Correcting its
 // reporting category remains optional and never changes that source.
 assert.equal(L.predictCategory(d).source,'budget-source');click(h,'Change',h.document.getElementById('entry-category'));click(h,'Gifts');h.flushHistory();h.flush();assert.equal(d.categoryChoice,'Gifts');assert.equal(d.essentialId,'food');assert.equal(L.state.categoryRules[0].category,'Food');assert.deepEqual(financial(L),before);clean(h);
});

check('stale draft controls and locked accounts cannot accept a category answer',()=>{
 const h=fixture(),{L}=h,d=L.state.paymentDraft,old=[d.id,L.categoryRecipientKey(d)];L.pickPerson('kojo');assert.equal(L.chooseDraftCategory('Food',old),false);assert.equal(d.categoryChoice,undefined);L.state.locked=true;assert.equal(L.chooseDraftCategory('Other',[d.id,L.categoryRecipientKey(d)]),false);assert.equal(d.categoryChoice,undefined);assert.equal(L.state.balance,500);clean(h);
});

check('result help is optional and only appears for completed payments; one tap preserves ledger facts',()=>{
 const h=fixture(),{L}=h,d=L.state.paymentDraft;const t=L.addTx({id:'one-tap-receipt',draftId:d.id,type:'out',status:'success',name:d.name,amount:40,fee:0,date:new Date().toISOString()});d.submittedTxId=t.id;L.go('paymentResult',{id:t.id});h.flush();const before=financial(L);assert.equal(t.category,'Uncategorised');click(h,'Other',view(h).querySelector('.category-nudge'));assert.equal(t.category,'Other');assert.equal(t.categoryMeta.source,'customer');assert.equal(L.needsCategory(t),false);assert.deepEqual(financial(L),before);assert(!view(h).querySelector('.category-nudge'));
 for(const status of ['pending','failed']){t.status=status;L.render();h.flush();assert(!view(h).querySelector('.category-nudge'));assert.equal(L.quickCategory(t.id,'Food'),undefined);assert.equal(t.category,'Other');}clean(h);
});

check('each of the twelve full-menu categories saves and returns in one tap with the draft intact',()=>{
 const h=fixture(),{L}=h,d=L.state.paymentDraft;h.set('payment-note','Our project');h.set('payment-essential','food');const before=financial(L);
 for(const category of ['Food','Transport','Study','Data','Phone','Shopping','Bills','Rent','Gifts','Repayment','Transfers','Other']){
  L.openCategory('',true);h.flush();assert.equal(L.route,'categoryEdit');click(h,category);h.flushHistory();h.flush();
  assert.equal(L.route,'send');assert.equal(d.categoryChoice,category);assert.equal(L.predictCategory(d).confidence,'confirmed');assert.equal(h.document.getElementById('payment-amount').value,'40');assert.equal(h.document.getElementById('payment-note').value,'Our project');assert.equal(h.document.getElementById('payment-essential').value,'food');assert.equal(d.essentialId,'food');assert.equal(L.state.categoryRules.length,0);assert.deepEqual(financial(L),before);
 }
 clean(h);
});

check('a category answer from Chat returns to the same conversation and unsent composer in one tap',()=>{
 const h=fixture(),{L}=h,d=L.state.paymentDraft,t=L.addTx({draftId:d.id,type:'out',status:'success',name:d.name,amount:40,fee:0,date:new Date().toISOString()});d.submittedTxId=t.id;L.finishPayment();L.openTab('chat');h.flush();h.set('chatText','Can I spend GH₵80?');L.askChat();h.flush();
 const turns=copy(L.state.chats),before=financial(L);h.set('chatText','How about GH₵50?');h.document.getElementById('chat-thread').scrollTop=37;
 L.openCategory(t.id);h.flush();assert.equal(L.route,'categoryEdit');click(h,'Gifts');h.flushHistory();h.flush();
 assert.equal(L.route,'chat');assert.equal(L.taskSheet.active,false);assert.equal(t.category,'Gifts');assert.equal(h.document.getElementById('chatText').value,'How about GH₵50?');assert.equal(h.document.getElementById('chat-thread').scrollTop,37);assert.deepEqual(copy(L.state.chats),turns);assert.equal(L.state.categoryRules.length,0);assert.deepEqual(financial(L),before);clean(h);
});

console.log(passed+' one-tap category checks passed.');
