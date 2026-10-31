/* Current financial advice through the shipped index and real sheet controller.
   This DOM checks behavior and account facts, not rendered device layout. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
let passed=0;
const check=(name,run)=>{run();passed++;console.log('PASS '+name);};
const view=h=>h.document.getElementById('view');
function fixture(patch={}){
 const h=createHarness(),{L}=h;L.explore();
 Object.assign(L.state,{balance:600,txs:[],essentials:[{id:'food',name:'Food',amount:250,paid:0},{id:'transport',name:'Transport',amount:100,paid:0}],goals:[{id:'laptop',name:'Laptop',target:3500,allocated:100}],planSaved:true,planDraft:null,allowance:{amount:800,date:'',source:'Family'},chats:[],paymentDraft:null,...patch});
 L.balances();L.route='home';L.params={};L.history=[];L.save();L.render();h.flush();return h;
}
function action(h,code){const button=view(h).querySelectorAll('button').find(el=>el.getAttribute('onclick')===code);assert(button,'Working '+code+' on '+h.L.route);button.click();h.flush();return button;}
function ask(h,question){h.set('chatText',question);h.submit(view(h).querySelector('.chat-entry'));h.flush();return h.L.state.chats.at(-1);}
const facts=L=>copy({balance:L.state.balance,txs:L.state.txs,essentials:L.state.essentials,goals:L.state.goals,allowance:L.state.allowance});
const clean=h=>assert.deepEqual(h.errors,[]);
const close=h=>{h.document.querySelector('.task-sheet-close').click();h.flush();};

check('a plan edit labels the saved projection, keeps its calculation and rechecks the same purchase',()=>{
 const h=fixture(),{L}=h;L.openTab('chat');h.flush();
 const old=ask(h,'Can I spend GH₵280?'),saved=copy(old);assert.equal(old.planImpact.essentialGap,30);assert.equal(old.planImpact.goalGap,100);assert(old.financialContext);assert(old.checkedAt);assert.equal(view(h).querySelector('.chat-snapshot-status'),null);
 h.set('chatText','What if I buy lunch later?');h.document.getElementById('chat-thread').scrollTop=140;
 action(h,'L.chatOpenAnswer(0)');assert.equal(L.route,'essentials');action(h,"L.go('essentialEdit',{id:'food'})");h.set('essAmount',100);view(h).querySelector('button[type="submit"]').click();h.flush();assert.equal(L.route,'essentials');close(h);assert.equal(L.route,'chat');assert.equal(h.document.getElementById('chatText').value,'What if I buy lunch later?');assert.equal(h.document.getElementById('chat-thread').scrollTop,140);assert.match(view(h).querySelector('.chat-snapshot-status').textContent,/Earlier projection.*changed/);assert(view(h).querySelector('.chat-reply-previous[data-financial-snapshot="earlier"]'));assert.equal(view(h).querySelector('.chat-reply-previous').hasAttribute('data-insight'),false);assert.equal(view(h).querySelector('.chat-reply-previous').hasAttribute('data-decision-state'),false);assert(view(h).querySelector('.chat-recheck'));assert.deepEqual(copy(L.state.chats[0]),saved);
 action(h,'L.openChatCalculation(0)');assert.equal(L.route,'chatCalculation');assert.match(view(h).textContent,/Earlier projection/);assert.match(view(h).textContent,/GH₵130.00/);assert.match(view(h).textContent,/GH₵350.00/);close(h);assert.equal(h.document.getElementById('chatText').value,'What if I buy lunch later?');assert.equal(h.document.getElementById('chat-thread').scrollTop,140);
 const financialBefore=facts(L);action(h,'L.chatCheckAgain(0)');assert.equal(L.route,'chat');assert.equal(L.state.chats.length,2);assert.deepEqual(copy(L.state.chats[0]),saved);assert.equal(L.state.chats[1].planImpact.amount,280);assert.equal(L.state.chats[1].planImpact.room,20);assert.match(L.state.chats[1].headline,/GH₵20.00 spare/);assert.equal(h.document.getElementById('chatText').value,'What if I buy lunch later?');assert.deepEqual(facts(L),financialBefore);assert.equal(view(h).querySelectorAll('.chat-snapshot-status').length,1);clean(h);
});

check('legacy financial answers are marked saved and can be rechecked without rewriting history',()=>{
 const h=fixture(),{L}=h;const reply=L.chatAnswer('Can I spend GH₵80?');delete reply.financialContext;delete reply.checkedAt;L.state.chats=[{q:'Can I spend GH₵80?',...reply}];L.openTab('chat');h.flush();const saved=copy(L.state.chats[0]);assert.match(view(h).querySelector('.chat-snapshot-status').textContent,/Saved projection.*current figures/);action(h,'L.chatCheckAgain(0)');assert.equal(L.state.chats[1].planImpact.room,70);assert.deepEqual(copy(L.state.chats[0]),saved);clean(h);
});

check('a bare amount uses the account cedi context and current spending-room questions need no purchase amount',()=>{
 const h=fixture(),{L}=h,before=facts(L);L.openTab('chat');h.flush();
 for(const question of ['Can I spend 80?','Can I pay 80 for lunch?','I want to spend 80 on food','Can I spend 80 in 7 days?']){const reply=ask(h,question);assert.equal(reply.intent,'affordability',question);assert.equal(reply.planImpact.amount,80,question);assert.equal(reply.planImpact.room,70);assert.match(reply.calculation.rows.find(([label])=>label==='Payment total, including any fee')[1],/GH₵80.00/);}
 for(const question of ['How much can I spend?','What can I spend?','How much could I use?']){const reply=ask(h,question);assert.equal(reply.intent,'plan',question);assert.match(reply.headline,/GH₵150.00 is left/);assert(!reply.pendingAffordability);assert.doesNotMatch(reply.text,/What is the total/);}
 assert.deepEqual(facts(L),before);clean(h);
});

check('ambiguous amounts, negatives, fees, foreign currency and unpriced dates remain guarded',()=>{
 const h=fixture(),{L}=h,before=facts(L);L.openTab('chat');h.flush();
 for(const question of ['Can I spend 80 or 90?','Can I spend 80 plus 5 in fees?','Can I spend GH₵80 and GH₵5 in fees?','Can I spend around 80?','Can I spend GH₵70 or 80?']){const reply=ask(h,question);assert.equal(reply.intent,'affordability');assert(!reply.planImpact,question);assert.match(reply.text,/single total/,question);}
 for(const question of ['Can I spend -80?','Can I spend 80.123?','Can I spend GH₵-80?']){const reply=ask(h,question);assert(!reply.planImpact,question);assert.match(reply.text,/positive amount/,question);}
 for(const question of ['Can I spend 80 dollars?','Can I spend USD80?']){const reply=ask(h,question);assert(!reply.planImpact,question);assert.match(reply.text,/total in GH₵/,question);}
 for(const question of ['Can I spend in 7 days?','Can I spend on 2026-10-24?']){const reply=ask(h,question);assert(!reply.planImpact,question);assert.match(reply.text,/total in Ghana cedis/,question);}
 assert.deepEqual(facts(L),before);clean(h);
});

check('linked pending coverage appears separately from the actual remaining cost',()=>{
 const h=fixture(),{L}=h;const pending=L.addTx({type:'out',status:'pending',amount:200,fee:0,name:'Lunch',essentialId:'food',category:'Food'});L.startSend('lumo');h.flush();action(h,"L.pickPerson('abena')");
 let food=view(h).querySelector('option[value="food"]');assert(food);assert.match(food.textContent,/Food · GH₵50.00 left · GH₵200.00 in progress/);assert.equal(L.state.balance,600);assert.equal(L.balances().available,400);assert.equal(L.pauseEngine.planPosition({amount:0,fee:0}).essentials.find(x=>x.id==='food').before,50);assert.equal(L.state.essentials[0].paid,0);
 L.resolveTx(pending.id,'success');L.render();h.flush();food=view(h).querySelector('option[value="food"]');assert.match(food.textContent,/Food · GH₵50.00 left/);assert.doesNotMatch(food.textContent,/in progress/);assert.equal(L.state.essentials[0].paid,200);assert.equal(L.state.balance,400);clean(h);
});

check('failed or fully pending plan links keep truthful coverage without a fictitious payment',()=>{
 const h=fixture(),{L}=h;const pending=L.addTx({type:'out',status:'pending',amount:250,fee:0,name:'Lunch',essentialId:'food',category:'Food'});L.startSend('lumo');h.flush();action(h,"L.pickPerson('abena')");let food=view(h).querySelector('option[value="food"]');assert.match(food.textContent,/GH₵0.00 left · GH₵250.00 in progress/);assert.equal(L.state.essentials[0].paid,0);L.resolveTx(pending.id,'failed');L.render();h.flush();food=view(h).querySelector('option[value="food"]');assert.match(food.textContent,/GH₵250.00 left/);assert.doesNotMatch(food.textContent,/in progress/);assert.equal(L.state.balance,600);assert.equal(L.balances().available,600);assert.equal(L.state.essentials[0].paid,0);clean(h);
});

check('pending financial changes mark a prior answer and rechecking never authorises a payment',()=>{
 const h=fixture(),{L}=h;L.openTab('chat');h.flush();ask(h,'How much can I spend?');const saved=copy(L.state.chats[0]);L.addTx({type:'out',status:'pending',amount:80,fee:0,name:'Unlinked purchase',category:'Shopping'});L.render();h.flush();assert.match(view(h).querySelector('.chat-snapshot-status').textContent,/Earlier answer/);action(h,'L.chatCheckAgain(0)');assert.match(L.state.chats[1].headline,/GH₵70.00 is left/);assert.equal(L.state.balance,600);assert.equal(L.state.txs.length,1);assert.equal(L.state.txs[0].status,'pending');assert.deepEqual(copy(L.state.chats[0]),saved);clean(h);
});
console.log(passed+' everyday Chat and pending-plan checks passed.');
