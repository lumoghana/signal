/* V13 fixture: GH₵600 total = GH₵500 operational + GH₵100 savings; budget room GH₵150. */
/* Real shipped-index DOM regressions for optional correction scope and Chat undo.
   Categories are metadata: none of these actions may alter payment/plan facts. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
let passed=0;
const check=(name,run)=>{run();passed++;console.log('PASS '+name);};
const view=h=>h.document.getElementById('view');
function fixture(options={}){
 const h=createHarness(options),{L}=h;L.explore();
 Object.assign(L.state,{balance:500,txs:[],essentials:[{id:'food',name:'Food and transport',amount:350,paid:0}],goals:[{id:'laptop',name:'Laptop',allocated:100,target:3500}],chats:[],categoryRules:[],paymentDraft:null});
 assert.equal(L.accountBalances().operational,500);assert.equal(L.accountBalances().savings,100);assert.equal(L.accountBalances().total,600);assert.equal(L.balances().room,150);L.route='home';L.params={};L.history=[];L.save();L.render();h.flush();return h;
}
function button(h,label){const matches=view(h).querySelectorAll('button').filter(b=>b.textContent.trim()===label);assert.equal(matches.length,1,'One '+label+' on '+h.L.route);return matches[0];}
function click(h,label){button(h,label).click();h.flush();}
function start(h,amount=40){const {L}=h;L.startSend('lumo');L.pickPerson('abena');h.flush();h.set('payment-amount',amount);return L.state.paymentDraft;}
function pay(h,amount=40){const {L}=h;start(h,amount);L.preparePayment();L.continuePayment();h.flush();assert.equal(L.route,'authorize');h.set('payment-pin','123456');L.authorizePayment();h.flush();return L.state.txs[0];}
function rule(L,d,category='Food'){L.state.categoryRules=[{key:L.categoryRecipientKey(d),category,name:d.name,updatedAt:new Date().toISOString()}];L.save();}
const funds=L=>clone({balance:L.state.balance,essentials:L.state.essentials,goals:L.state.goals,txs:L.state.txs.map(t=>({id:t.id,type:t.type,status:t.status,amount:t.amount,fee:t.fee,essentialId:t.essentialId}))});
function ask(h,q){h.set('chatText',q);h.L.askChat();h.flush();return h.L.state.chats.at(-1);}
function beginChat(h,tx){const {L}=h;L.finishPayment();L.openTab('chat');h.flush();return ask(h,`That GH₵${tx.amount} to Abena was lunch`);}
const clean=h=>assert.deepEqual(h.errors,[]);

check('conflicting note downgrades a standing rule and resolving one payment does not rewrite it',()=>{
 const h=fixture(),{L}=h,d=start(h);rule(L,d);d.note='birthday gift';const before=funds(L),saved=clone(L.state.categoryRules);
 const p=L.predictCategory(d);assert.equal(p.category,'Gifts');assert.equal(p.source,'rule-conflict');assert.equal(p.confidence,'suggested');assert.equal(p.usualCategory,'Food');
 L.resolveCategoryConflict('Gifts');h.flush();assert.equal(L.predictCategory(d).category,'Gifts');assert.equal(L.predictCategory(d).confidence,'confirmed');assert.deepEqual(clone(L.state.categoryRules),saved);assert.deepEqual(funds(L),before);assert.equal(d.essentialId,'');clean(h);
});

check('keeping the usual category is an explicit one-off choice, and a later payment still detects its own exception',()=>{
 const h=fixture(),{L}=h,d=start(h);rule(L,d);d.note='birthday gift';L.resolveCategoryConflict('Food');assert.equal(L.predictCategory(d).source,'customer');assert.equal(L.predictCategory(d).category,'Food');
 const next={...d,id:'new-draft',categoryChoice:undefined,categoryChoiceKey:undefined};assert.equal(L.predictCategory(next).source,'rule-conflict');assert.equal(L.state.categoryRules[0].category,'Food');assert.equal(L.state.balance,500);clean(h);
});

check('customer recipient rules take priority over merchant defaults while per-payment choices remain strongest',()=>{
 const h=fixture(),{L}=h,d={id:'merchant-draft',method:'campus',merchantId:'AK01',destination:'AK01',name:'Akua’s Kitchen',amount:40,note:''};rule(L,d,'Gifts');
 assert.equal(L.predictCategory(d).source,'rule');assert.equal(L.predictCategory(d).category,'Gifts');
 d.categoryChoice='Study';d.categoryChoiceKey=L.categoryRecipientKey(d);assert.equal(L.predictCategory(d).source,'customer');assert.equal(L.predictCategory(d).category,'Study');clean(h);
});

check('ambiguous notes do not manufacture an exception or silently erase the customer default',()=>{
 const h=fixture(),{L}=h,d=start(h);rule(L,d);d.note='lunch and taxi';const p=L.predictCategory(d);assert.notEqual(p.source,'rule-conflict');assert.equal(p.category,'Food');assert.equal(L.state.categoryRules[0].category,'Food');clean(h);
});

check('a rule conflict stays unresolved when payment completes without an answer',()=>{
 const h=fixture(),{L}=h,d=start(h);rule(L,d);d.note='birthday gift';L.save();h.set('payment-note','birthday gift');L.preparePayment();L.continuePayment();h.flush();h.set('payment-pin','123456');L.authorizePayment();h.flush();
 const t=L.state.txs[0];assert.equal(t.category,'Uncategorised');assert.equal(t.categoryMeta.source,'rule-conflict');assert.equal(t.categoryMeta.suggestion,'Gifts');assert.equal(t.categoryMeta.usualCategory,'Food');assert.equal(L.state.categoryRules[0].category,'Food');assert.equal(L.state.balance,460);assert.equal(L.balances().room,110);clean(h);
});

check('category scope defaults to just this payment and leaves past payments and the standing rule untouched',()=>{
 const h=fixture(),{L}=h,t=pay(h);rule(L,t);L.state.txs.push({id:'older',name:t.name,type:'out',status:'success',amount:20,fee:0,date:new Date().toISOString(),category:'Food',categoryRecipientKey:L.categoryRecipientKey(t)});
 const old=clone(L.state.txs[1]),before=funds(L);L.openCategory(t.id);h.flush();
 click(h,'Gifts');h.flushHistory();h.flush();assert.equal(L.route,'paymentResult');assert.equal(t.category,'Gifts');assert.equal(L.state.categoryRules[0].category,'Food');assert.deepEqual(clone(L.state.txs[1]),old);assert.deepEqual(funds(L),before);clean(h);
});

check('future scope explicitly updates the recipient rule without changing historical payments or financial facts',()=>{
 const h=fixture(),{L}=h,t=pay(h);rule(L,t);L.state.txs.push({id:'older',name:t.name,type:'out',status:'success',amount:20,fee:0,date:new Date().toISOString(),category:'Food',categoryRecipientKey:L.categoryRecipientKey(t)});const old=clone(L.state.txs[1]),before=funds(L);
 L.openCategory(t.id);h.flush();click(h,'Gifts');h.flushHistory();h.flush();assert.equal(L.route,'paymentResult');assert.equal(L.state.categoryRules[0].category,'Food');L.openCategory(t.id);h.flush();click(h,'Future payments too');h.flushHistory();h.flush();assert.equal(L.state.categoryRules[0].category,'Gifts');assert.equal(t.category,'Gifts');assert.deepEqual(clone(L.state.txs[1]),old);assert.deepEqual(funds(L),before);assert.equal(L.predictCategory({method:'lumo',recipient:'abena',destination:'@abena.a',name:t.name}).category,'Gifts');clean(h);
});

check('unique Chat correction uses one confirming tap and Undo restores its exact prior metadata without losing the composer',()=>{
 const h=fixture(),{L}=h,t=pay(h),previous={category:t.category,categoryMeta:clone(t.categoryMeta)};const reply=beginChat(h,t),before=funds(L);assert.equal(reply.action,'Use Food');assert.equal(t.category,previous.category);
 h.set('chatText','Can I spend GH₵80?');h.document.getElementById('chat-thread').scrollTop=45;click(h,'Use Food');assert.equal(L.route,'chat');assert.equal(L.taskSheet.active,false);assert.equal(t.category,'Food');assert.equal(reply.action,'Change category');assert.equal(reply.secondaryAction,'Undo');assert.equal(h.document.getElementById('chatText').value,'Can I spend GH₵80?');assert.equal(L.state.chats.length,1);assert.equal(h.document.getElementById('chat-thread').scrollTop,45);assert.deepEqual(funds(L),before);
 click(h,'Undo');assert.equal(L.route,'chat');assert.equal(t.category,previous.category);assert.deepEqual(clone(t.categoryMeta),previous.categoryMeta);assert.equal(h.document.getElementById('chatText').value,'Can I spend GH₵80?');assert.deepEqual(funds(L),before);clean(h);
});

check('Chat Undo restores a legacy record with no metadata rather than fabricating confirmed state',()=>{
 const h=fixture(),{L}=h,t=pay(h);t.category='Other';delete t.categoryMeta;beginChat(h,t);click(h,'Use Food');assert.equal(t.categoryMeta.source,'customer');click(h,'Undo');assert.equal(t.category,'Other');assert.equal(Object.hasOwn(t,'categoryMeta'),false);clean(h);
});

check('an older Chat Undo cannot overwrite a subsequent category correction',()=>{
 const h=fixture(),{L}=h,t=pay(h);beginChat(h,t);click(h,'Use Food');L.assignCategory(t.id,'Transport');const after=clone(t.categoryMeta);L.chatOpenAnswer(0,true);h.flush();assert.equal(t.category,'Transport');assert.deepEqual(clone(t.categoryMeta),after);assert.equal(L.state.balance,460);clean(h);
});

check('stale or repeated Chat actions cannot edit a failed payment or change the standing rule',()=>{
 const h=fixture(),{L}=h,t=pay(h);rule(L,t,'Transport');beginChat(h,t);const saved=clone(L.state.categoryRules);click(h,'Use Food');L.chatOpenAnswer(0);h.flush();assert.equal(t.category,'Food');assert.deepEqual(clone(L.state.categoryRules),saved);t.status='reversed';const meta=clone(t.categoryMeta);L.chatOpenAnswer(0,true);h.flush();assert.deepEqual(clone(t.categoryMeta),meta);assert.deepEqual(clone(L.state.categoryRules),saved);clean(h);
});

check('ambiguous Chat corrections retain a selection sheet and never apply to several payments at once',()=>{
 const h=fixture(),{L}=h,t=pay(h);L.state.txs.push({...clone(t),id:'matching-other'});const reply=beginChat(h,t),before=clone(L.state.txs);assert.equal(reply.action,'Choose payment');click(h,'Choose payment');assert.equal(L.route,'categoryMatch');assert.equal(L.taskSheet.active,true);assert.deepEqual(clone(L.state.txs),before);clean(h);
});

check('saved v9 Check category replies retain their non-mutating sheet action',()=>{
 const h=fixture(),{L}=h,t=pay(h);L.finishPayment();L.state.chats=[{q:'That GH₵40 to Abena was lunch',text:'Put GH₵40.00 to Abena Asante under Food?',action:'Check category',route:'categoryEdit',params:{id:t.id,proposed:'Food'},intent:'category-correction',categoryTxIds:[t.id],categoryProposed:'Food',context:{days:30,category:''}}];L.openTab('chat');h.flush();const before=clone(t),financial=funds(L);click(h,'Check category');assert.equal(L.route,'categoryEdit');assert.equal(L.taskSheet.active,true);assert.deepEqual(clone(t),before);assert.deepEqual(funds(L),financial);clean(h);
});

check('a new Chat proposal cannot overwrite a category changed before confirmation',()=>{
 const h=fixture(),{L}=h,t=pay(h);beginChat(h,t);L.assignCategory(t.id,'Transport');const before=clone(t.categoryMeta),financial=funds(L);click(h,'Use Food');assert.equal(L.route,'chat');assert.equal(t.category,'Transport');assert.deepEqual(clone(t.categoryMeta),before);assert.equal(L.state.chats[0].action,'Change category');assert.equal(L.state.chats[0].secondaryAction,undefined);assert.deepEqual(funds(L),financial);clean(h);
});

console.log(passed+' category refinement checks passed.');
