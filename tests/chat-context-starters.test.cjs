/* Contextual starters use existing tasks and answers without acting on load. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const dist=path.resolve(__dirname,'../dist');
const modules=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
if(!modules.includes('chat-context-starters.js'))modules.push('chat-context-starters.js');
const settle=h=>{h.flushHistory();h.flush();};
const view=h=>h.document.getElementById('view');
const financial=L=>JSON.stringify([L.state.balance,L.state.accounts,L.state.txs,L.state.essentials,L.state.goals,L.state.paymentDraft,L.state.requests]);
const copy=value=>JSON.parse(JSON.stringify(value));
const date=(h,days=0)=>new h.context.Date(h.context.Date.now()+days*86400000).toISOString().slice(0,10);
function fixture(){const h=createHarness({modules,clock:true});h.L.explore();h.L.state.chats=[];h.L.state.planDraft=null;h.L.state.planHorizon={mode:'date',date:date(h,10)};h.L.state.essentials=[{id:'food',name:'Food',amount:180,paid:0,coverageVersion:1,externalPaid:0,date:date(h,8)}];h.L.openBankingChat();settle(h);return h;}
const refresh=h=>{h.L.render();settle(h);};
const starter=h=>view(h).querySelector('[data-chat-context-starter]');
const clean=h=>assert.deepEqual(h.errors,[],'No rendering fallback');
let passed=0;function check(name,fn){fn();passed++;console.log('PASS '+name);}
check('opening Chat changes one starter, keeps the other two, and sends nothing',()=>{
 const h=fixture(),L=h.L,before=financial(L),chats=JSON.stringify(L.state.chats);
 assert.equal(starter(h).textContent.trim(),'What can I spend a day?');
 const buttons=view(h).querySelector('.hibiscus-chat-starters').querySelectorAll('button');
 assert.deepEqual(buttons.map(b=>b.textContent.trim()),['What can I spend a day?','Where did my money go?','How long will my money last?']);
 assert.equal(financial(L),before);assert.equal(JSON.stringify(L.state.chats),chats);clean(h);
});
check('the pure suggestion handles new and unfinished Budgets without changing records',()=>{
 const h=fixture(),L=h.L,s=copy(L.state);s.essentials=[];const before=JSON.stringify(s);
 assert.equal(L.chatContextStarters.suggestion(s).kind,'build-budget');assert.equal(JSON.stringify(s),before);
 s.planDraft={essentials:[]};assert.equal(L.chatContextStarters.suggestion(s).kind,'continue-budget');
 s.locked=true;assert.equal(L.chatContextStarters.suggestion(s),null);s.locked=false;s.closed=true;assert.equal(L.chatContextStarters.suggestion(s),null);s.closed=false;s.onboarded=false;assert.equal(L.chatContextStarters.suggestion(s),null);clean(h);
});
check('an uncovered Budget takes priority and opens the existing review options',()=>{
 const h=fixture(),L=h.L;L.state.balance=20;L.state.planHorizon={mode:'unspecified'};refresh(h);const before=financial(L);
 assert.equal(starter(h).textContent.trim(),'Review my Budget gap');starter(h).click();settle(h);
 assert.equal(L.route,'makeRoom');assert.equal(L.taskSheet.parentRoute,'chat');assert.equal(financial(L),before);clean(h);
});
check('missing, ended and changed allowance dates suggest review instead of a daily claim',()=>{
 const h=fixture(),L=h.L,s=copy(L.state);
 s.planHorizon={mode:'unspecified'};assert.equal(L.chatContextStarters.suggestion(s).kind,'choose-dates');
 s.planHorizon={mode:'date',date:date(h,-1)};assert.equal(L.chatContextStarters.suggestion(s).kind,'review-dates');
 s.planHorizon={mode:'allowance',date:date(h,10)};s.allowance.date=date(h,12);assert.equal(L.chatContextStarters.suggestion(s).kind,'review-dates');
 s.planHorizon={mode:'allowance',date:date(h)};s.allowance.date=date(h);assert.equal(L.chatContextStarters.suggestion(s).kind,'expected-money');clean(h);
});
check('a due saved cost uses the existing cost review and skips fully covered costs',()=>{
 const h=fixture(),L=h.L;L.state.essentials[0].date=date(h,1);refresh(h);const before=financial(L);
 assert.equal(starter(h).textContent.trim(),'Review Food');starter(h).click();settle(h);
 assert.equal(L.route,'essentialEdit');assert.equal(L.params.id,'food');assert.equal(financial(L),before);L.closeTask();settle(h);
 Object.assign(L.state.essentials[0],{paid:180,externalPaid:180});refresh(h);assert.equal(starter(h).textContent.trim(),'What can I spend a day?');clean(h);
});
check('a ready Budget asks the supported daily-guide question only after a tap',()=>{
 const h=fixture(),L=h.L,before=financial(L);assert.equal(L.state.chats.length,0);
 starter(h).click();settle(h);const answer=L.state.chats.at(-1);
 assert.equal(answer.q,'What is my daily spending guide?');assert.equal(answer.intent,'runway');assert.equal(answer.route,'spendingOutlook');assert(answer.calculation);assert.equal(financial(L),before);clean(h);
});
check('a retained starter rechecks current state and cannot execute outside Chat or while locked',()=>{
 const h=fixture(),L=h.L;const retained=starter(h);L.state.essentials=[];L.state.planSaved=false;
 retained.click();settle(h);assert(L.budgetGuide.active());assert.equal(L.route,'chat');assert.equal(L.state.chats.some(r=>r.q==='What is my daily spending guide?'),false);
 L.budgetGuide.pause();L.openTab('home');settle(h);const count=L.state.chats.length;assert.equal(L.chatContextStarters.activate(),false);assert.equal(L.state.chats.length,count);
 L.openBankingChat();settle(h);L.state.locked=true;assert.equal(L.chatContextStarters.activate(),false);assert.equal(L.state.chats.length,count);clean(h);
});
check('opening a date task keeps the unsent composer and conversation on return',()=>{
 const h=fixture(),L=h.L;L.state.planHorizon={mode:'unspecified'};refresh(h);h.set('chatText','An unsent question');const chats=JSON.stringify(L.state.chats),before=financial(L);
 starter(h).click();settle(h);assert.equal(L.route,'planPeriod');L.closeTask();settle(h);
 assert.equal(L.route,'chat');assert.equal(h.document.getElementById('chatText').value,'An unsent question');assert.equal(JSON.stringify(L.state.chats),chats);assert.equal(financial(L),before);clean(h);
});
check('rendering saved history does not rewrite old questions or user text',()=>{
 const h=fixture(),L=h.L;h.set('chatText','Can I spend GH₵80?');L.askChat();settle(h);const saved=JSON.stringify(L.state.chats);
 refresh(h);assert.equal(starter(h),null);assert.equal(JSON.stringify(L.state.chats),saved);assert(view(h).textContent.includes('Can I spend GH₵80?'));clean(h);
});
console.log(passed+' contextual Chat starter checks passed.');
