/* Clarification should recover a conversation, never guess a payment amount
   or change the existing financial and guided-planning authorities. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const root=path.resolve(__dirname,'../dist');
const scripts=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
if(!scripts.includes('hibiscus-chat-clarity.js'))scripts.push('hibiscus-chat-clarity.js');
const settle=h=>{h.flushHistory();h.flush();};
const view=h=>h.document.getElementById('view');
const clone=x=>JSON.parse(JSON.stringify(x));
const ledger=L=>JSON.stringify([L.state.balance,L.state.accounts,L.state.txs,L.state.essentials,L.state.goals,L.state.virtualCards,L.state.paymentDraft]);
const fixture=()=>{const h=createHarness({clock:true,modules:scripts});h.L.explore();h.L.openBankingChat();settle(h);return h;};
const ask=(h,q)=>{h.set('chatText',q);h.L.askChat();settle(h);return h.L.state.chats.at(-1);};
const button=(h,label)=>{const b=view(h).querySelectorAll('button').find(x=>x.textContent.trim()===label);assert(b,'Mounted '+label);return b;};
const clean=h=>assert.deepEqual(h.errors,[]);
let passed=0;function check(name,fn){fn();passed++;console.log('PASS '+name);}
check('unclear questions receive a brief clarification with three real choices, without invented facts',()=>{
 for(const q of ['help','I am confused','Will 80 be okay?','Is GH₵80 too much?','Can I eat for 80?']){
  const h=fixture(),{L}=h,before=ledger(L),r=ask(h,q);
  assert.equal(r.intent,'unsupported');assert.equal(r.headline,'What would you like to check?');assert.equal(r.support,'Choose one, or ask another way.');assert.equal(r.route,undefined);assert.equal(r.action,undefined);assert.equal(r.calculation,undefined);assert.equal(r.planImpact,undefined);assert.equal(r.clarityChoices.length,3);assert(!/\d/.test(r.text));
  assert(view(h).querySelector('.chat-clarify-choices'));for(const label of ['Check a spend','Where did it go?','Adjust my Budget'])button(h,label);assert.equal(ledger(L),before);clean(h);
 }
});
check('Check a spend asks for the amount, then the existing engine checks the student reply',()=>{
 const h=fixture(),{L}=h,before=ledger(L);ask(h,'I am confused');button(h,'Check a spend').click();settle(h);
 const r=L.state.chats.at(-1);assert.equal(r.intent,'affordability');assert(r.pendingAffordability);assert.equal(r.planImpact,undefined);assert.match(r.text,/total.*Ghana cedis|amount.*GH₵/i);assert.equal(ledger(L),before);
 const checked=ask(h,'80');assert.equal(checked.intent,'affordability');assert.equal(checked.planImpact.amount,80);assert.equal(checked.planImpact.after,L.balances().available-80);assert.equal(ledger(L),before);clean(h);
});
check('the money story choice uses the existing saved period and spending summary',()=>{
 const h=fixture(),{L}=h;L.params={days:7,category:''};const before=ledger(L);ask(h,'help');button(h,'Where did it go?').click();settle(h);
 const r=L.state.chats.at(-1);assert.equal(r.intent,'spending');assert.equal(r.context.days,7);assert.match(r.text,new RegExp(L.spendingSummary({days:7}).total.toFixed(2).replace('.','\\.')));assert.equal(ledger(L),before);clean(h);
});
check('Budget choice starts the existing draft guide without replacing saved costs or moving money',()=>{
 for(const empty of [false,true]){
  const h=fixture(),{L}=h;if(empty){L.state.essentials=[];L.state.planSaved=false;L.save();L.render();settle(h);}const before=ledger(L);ask(h,'help');button(h,empty?'Build my Budget':'Adjust my Budget').click();settle(h);
  assert.equal(L.route,'chat');assert(L.budgetGuide.active());assert(L.state.planDraft);assert.equal(ledger(L),before);clean(h);
 }
});
check('supported affordability, ambiguous amounts, missing dates, payment proposals and Budget guidance retain their authorities',()=>{
 const h=fixture(),{L}=h,before=ledger(L);
 let r=L.chatAnswer('Can I spend GH₵80?');assert.equal(r.intent,'affordability');assert.equal(r.planImpact.amount,80);assert.equal(r.clarityChoices,undefined);
 r=L.chatAnswer('Can I spend 80 or 140?');assert.equal(r.intent,'affordability');assert(r.pendingAffordability);assert.equal(r.planImpact,undefined);assert.equal(r.clarityChoices,undefined);
 L.state.allowance.date='';r=L.chatAnswer('How long will my money last?');assert.equal(r.intent,'runway');assert.equal(r.clarityChoices,undefined);assert(!/good till|will last until Friday/.test(r.text));
 r=L.chatAnswer('Pay Akua GH₵25 from Food');assert.equal(r.intent,'bankingDraft');assert.equal(r.bankingProposal.amount,25);assert.equal(r.clarityChoices,undefined);assert.equal(ledger(L),before);
 L.budgetGuide.start({mode:'create'});settle(h);r=L.chatAnswer('help');assert.notEqual(r.intent,'unsupported');assert.equal(r.clarityChoices,undefined);clean(h);
});
check('clarifying controls cannot run outside Chat, during a sheet, against an invalid turn or while locked',()=>{
 const h=fixture(),{L}=h;ask(h,'help');const i=L.state.chats.length-1,before=ledger(L),count=L.state.chats.length;
 assert.equal(L.hibiscusChatClarity.choose(-1,'spend'),false);assert.equal(L.hibiscusChatClarity.choose(i,'send'),false);assert.equal(L.state.chats.length,count);
 L.go('chatCalculation',{index:i});settle(h);assert.equal(L.hibiscusChatClarity.choose(i,'spend'),false);L.closeTask();settle(h);
 L.openTab('home');settle(h);assert.equal(L.hibiscusChatClarity.choose(i,'spend'),false);
 L.openBankingChat();settle(h);L.state.locked=true;assert.equal(L.hibiscusChatClarity.choose(i,'spend'),false);assert.equal(ledger(L),before);clean(h);
});
console.log(passed+' Chat clarification groups passed.');
