/* Full-screen conversational banking through the actual shipped index.
   The small DOM verifies interaction/state, not physical keyboard or layout. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
let passed=0,failed=0;
const check=(name,run)=>{try{run();passed++;console.log('PASS '+name);}catch(error){failed++;process.exitCode=1;console.error('FAIL '+name+'\n'+error.stack);}};
const view=h=>h.document.getElementById('view');
const app=h=>h.document.getElementById('app');
const nav=h=>h.document.getElementById('nav');
const clean=h=>assert.deepEqual(h.errors,[]);
function fixture(options={}){
 const h=createHarness({clock:true,...options});h.L.explore();
 h.L.route='home';h.L.params={};h.L.history=[];h.L.render();h.flush();return h;
}
function click(h,code){
 const button=view(h).querySelectorAll('button').find(el=>el.getAttribute('onclick')===code);
 assert(button,'A working control for '+code+' on '+h.L.route);button.click();h.flush();return button;
}
function ask(h,question){h.set('chatText',question);h.submit(view(h).querySelector('.chat-entry'));h.flush();return h.L.state.chats.at(-1);}
const facts=h=>clone({accounts:h.L.state.accounts,balance:h.L.state.balance,txs:h.L.state.txs,essentials:h.L.state.essentials,goals:h.L.state.goals});
function pointer(h,target,type,x,y,extra={}){
 target.dispatchEvent(new h.Event(type,{pointerId:7,pointerType:'touch',isPrimary:true,button:0,clientX:390-x,clientY:y,...extra}));
}
function swipe(h,target,from,to,extra={}){
 pointer(h,target,'pointerdown',...from,extra);h.advance(80);
 pointer(h,target,'pointermove',...to,extra);pointer(h,target,'pointerup',...to,extra);h.flush();
}

check('Home has a discoverable Chat control and Chat opens as a full-screen destination',()=>{
 const h=fixture(),before=facts(h);assert.equal(!!nav(h).hidden,false);
 assert.equal(view(h).querySelector('.home-header-actions .chat-banking-home-entry'),null,'Home keeps the duplicate Chat shortcut out of the header');
 assert(view(h).querySelector('.account-operational #balance-eye'),'Privacy is inside the amount card');
 assert.equal(view(h).querySelector('.home-header-actions #balance-eye'),null);
 const chats=view(h).querySelector('.mono-conversation-open')||view(h).querySelectorAll('button').find(b=>b.getAttribute('onclick')==='L.openBankingChat()');assert(chats);chats.click();h.flush();assert.equal(h.L.route,'chat');assert.equal(app(h).getAttribute('data-chat-banking'),'true');assert.equal(nav(h).hidden,false);
 const header=view(h).querySelector('.chat-banking-header');assert(header,'Chat has its own application header');assert(header.querySelector('.chat-banking-back'));assert(header.querySelector('.chat-banking-actions'));
 assert.equal(header.querySelector('.hibiscus-chat-header-title').textContent,'Ask Lumo');assert(header.querySelector('[aria-label="Conversation history"]'));
 assert(h.document.getElementById('chatText'));assert(view(h).querySelector('#chat-thread'));assert.deepEqual(facts(h),before);clean(h);
});

check('full-screen Chat keeps a working Home return and restores the normal navigation',()=>{
 const h=fixture();h.L.openBankingChat();h.flush();const header=view(h).querySelector('.chat-banking-header');
 header.querySelector('.chat-banking-back').click();h.flush();assert.equal(h.L.route,'home');assert.notEqual(app(h).getAttribute('data-chat-banking'),'true');assert.equal(!!nav(h).hidden,false);assert.equal(nav(h).querySelectorAll('.nav-item').length,3);clean(h);
});

check('a deliberate right swipe from Home opens Chat and a left swipe returns Home',()=>{
 const h=fixture(),before=facts(h);swipe(h,view(h).querySelector('.mono-home'),[290,280],[85,286]);assert.equal(h.L.route,'chat');assert.equal(nav(h).hidden,false);
 swipe(h,view(h).querySelector('.chat-workspace'),[55,310],[265,316]);assert.equal(h.L.route,'home');assert.equal(!!nav(h).hidden,false);assert.deepEqual(facts(h),before);clean(h);
});

check('vertical scrolling, short drags, mouse drags and cancelled touches never change destination',()=>{
 const h=fixture();let target=view(h).querySelector('.mono-home');
 for(const [from,to,extra]of [[[280,200],[220,430],{}],[[270,200],[245,202],{}],...(!h.L.monoChatGesture?[[[80,220],[280,225],{}]]:[]),[[290,230],[70,230],{pointerType:'mouse'}]]){swipe(h,target,from,to,extra);assert.equal(h.L.route,'home');}
 pointer(h,target,'pointerdown',290,230);pointer(h,target,'pointercancel',60,230);pointer(h,target,'pointerup',60,230);h.flush();assert.equal(h.L.route,'home');
 pointer(h,target,'pointerdown',290,230);pointer(h,target,'pointerdown',220,230,{pointerId:8,isPrimary:false});pointer(h,target,'pointerup',60,230);h.flush();assert.equal(h.L.route,'home','A second contact cancels the gesture');clean(h);
});

check('swiping over inputs, buttons or an open task never hijacks a task',()=>{
 const h=fixture();h.L.openBankingChat();h.flush();h.set('chatText','Keep my words');
 swipe(h,h.document.getElementById('chatText'),[60,300],[285,300]);assert.equal(h.L.route,'chat');assert.equal(h.document.getElementById('chatText').value,'Keep my words');
 swipe(h,view(h).querySelector('.chat-banking-actions'),[60,300],[285,300]);assert.equal(h.L.route,'chat');
 h.L.openChatBankingActions();h.flush();assert.equal(h.L.taskSheet.active,true);swipe(h,view(h).querySelector('h1'),[60,300],[285,300]);assert.equal(h.L.route,'chatBankingActions');assert.equal(h.L.taskSheet.active,true);clean(h);
});

check('Chat actions use one contextual sheet and preserve the exact conversation and composer',()=>{
 const h=fixture();h.L.openBankingChat();h.flush();ask(h,'Can I spend GH₵80?');
 const parent=view(h),thread=h.document.getElementById('chat-thread'),input=h.document.getElementById('chatText');thread.scrollTop=123;h.set('chatText','An unsent follow-up');
 const history=clone(h.L.state.chats),before=facts(h),trigger=parent.querySelector('.chat-banking-actions');trigger.focus();trigger.click();h.flush();
 assert.equal(h.L.route,'chatBankingActions');assert.equal(h.L.taskSheet.parentRoute,'chat');assert.equal(h.L.taskSheet.treatment,'selection');assert.equal(app(h).getAttribute('data-chat-banking'),'true');assert.equal(nav(h).hidden,true);
 assert.equal(h.document.querySelectorAll('[role="dialog"]').length,1);assert.equal(h.document.getElementById('task-parent-view'),parent);assert(parent.inert);
 click(h,"L.go('campusPay')");assert.equal(h.L.route,'campusPay');assert.equal(h.document.querySelectorAll(h.L.signalEdition?'.task-sheet[role="region"]':'[role="dialog"]').length,1,'Campus Pay has the expected edition surface');
 if(h.L.signalEdition){h.document.querySelector('.task-sheet-back').click();h.flush();assert.equal(h.L.route,'chatBankingActions');assert.equal(h.document.querySelectorAll('[role="dialog"]').length,1);}h.document.querySelector('.task-sheet-close').click();h.flush();assert.equal(h.L.route,'chat');assert.equal(view(h),parent);assert.equal(h.document.getElementById('chat-thread'),thread);assert.equal(thread.scrollTop,123);assert.equal(h.document.getElementById('chatText'),input);assert.equal(input.value,'An unsent follow-up');assert.deepEqual(clone(h.L.state.chats),history);assert.deepEqual(facts(h),before);assert.equal(nav(h).hidden,false);clean(h);
});

check('a payment launched from Chat still needs review and authorisation, then returns to the conversation',()=>{
 const h=fixture({testing:true});h.L.openBankingChat();h.flush();ask(h,'Can I spend GH₵80?');h.set('chatText','Keep this follow-up');
 const available=h.L.accountBalances().available,savings=h.L.accountBalances().savings,history=clone(h.L.state.chats);h.L.openChatBankingActions();h.flush();click(h,"L.go('campusPay')");h.L.pickMerchant('AK01');h.flush();h.set('payment-amount',80);h.set('payment-essential','');h.L.preparePayment();h.flush();
 assert.equal(h.L.route,'paymentReview');assert.equal(h.L.accountBalances().available,available);h.L.continuePayment();h.flush();assert.equal(h.L.route,'authorize');assert.equal(h.L.accountBalances().available,available);
 h.set('payment-pin','123456');h.set('payment-outcome','Completed');h.submit(view(h).querySelector('form'));h.flush();assert.equal(h.L.route,'paymentResult');assert.equal(h.L.accountBalances().available,available-80);assert.equal(h.L.accountBalances().savings,savings);
 h.L.finishPayment();h.flushHistory();h.flush();assert.equal(h.L.route,'chat');assert.equal(nav(h).hidden,false);assert.equal(h.document.getElementById('chatText').value,'Keep this follow-up');assert.deepEqual(clone(h.L.state.chats),history);clean(h);
});

check('confirmed funding and deferring optional Budget setup return to the same full-screen Chat',()=>{
 const h=fixture({testing:true});h.L.openBankingChat();h.flush();h.set('chatText','Keep my next question');h.document.getElementById('chat-thread').scrollTop=67;
 const available=h.L.accountBalances().available,savings=h.L.accountBalances().savings;h.L.openChatBankingActions();h.flush();click(h,"L.openFunding('chat')");h.L.startBankFunding();h.flush();h.set('bank-test-amount',80);h.L.simulateBankReceipt();h.flush();h.L.fundingDone();h.flush();
 assert.equal(h.L.route,'budgetAfterFunding');assert.equal(h.L.accountBalances().available,available+80);h.L.deferFundedBudget();h.flushHistory();h.flush();
 assert.equal(h.L.route,'chat');assert.equal(nav(h).hidden,false);assert.equal(app(h).getAttribute('data-chat-banking'),'true');assert.equal(h.document.getElementById('chatText').value,'Keep my next question');assert.equal(h.document.getElementById('chat-thread').scrollTop,67);assert.equal(h.L.accountBalances().savings,savings);clean(h);
});

check('leaving and reopening Chat keeps unsent text, history and reading position',()=>{
 const h=fixture();h.L.openBankingChat();h.flush();ask(h,'Where did my money go?');h.set('chatText','Keep this draft when I check Home');h.document.getElementById('chat-thread').scrollTop=92;
 const history=clone(h.L.state.chats);h.L.closeBankingChat();h.flush();assert.equal(h.L.route,'home');h.L.openBankingChat();h.flush();
 assert.equal(h.L.route,'chat');assert.equal(h.document.getElementById('chatText').value,'Keep this draft when I check Home');assert.equal(h.document.getElementById('chat-thread').scrollTop,92);assert.deepEqual(clone(h.L.state.chats),history);clean(h);
});

check('an unfinished affordability clarification survives a visit to Home',()=>{
 const h=fixture();h.L.openBankingChat();h.flush();const reply=ask(h,'Can I spend on lunch?');assert(reply.pendingAffordability);
 const pending=h.L.params.pendingAffordability;h.set('chatText','80');h.L.closeBankingChat();h.flush();h.L.openBankingChat();h.flush();
 assert.equal(h.L.params.pendingAffordability,pending);assert.equal(h.document.getElementById('chatText').value,'80');h.submit(view(h).querySelector('.chat-entry'));h.flush();const choice=h.L.state.chats.at(-1);assert.equal(choice.budgetPurpose.amount,80);const extra=view(h).querySelectorAll('button').find(b=>b.textContent.trim()==='Extra spending');assert(extra);extra.click();h.flush();assert.equal(h.L.state.chats.at(-1).planImpact.amount,80);clean(h);
});

check('browser back returns Home without authorising or losing the unsent draft',()=>{
 const h=fixture(),before=facts(h);h.L.openBankingChat();h.flush();h.set('chatText','I have not sent this');h.history.back();h.flushHistory();h.flush();
 assert.equal(h.L.route,'home');assert.equal(!!nav(h).hidden,false);assert.deepEqual(facts(h),before);h.L.openBankingChat();h.flush();assert.equal(h.document.getElementById('chatText').value,'I have not sent this');clean(h);
});

check('reduced motion preserves Chat navigation, calculation and safe task dismissal',()=>{
 const h=fixture({reducedMotion:true}),before=facts(h);h.L.openBankingChat();h.flush();const answer=ask(h,'Can I spend GH₵80?');assert(answer.calculation);assert.equal(nav(h).hidden,false);
 h.L.openChatCalculation(h.L.state.chats.length-1);h.flush();assert.equal(h.L.route,'chatCalculation');assert.equal(app(h).getAttribute('data-chat-banking'),'true');h.L.back();h.flushHistory();h.flush();assert.equal(h.L.route,'chat');assert.equal(nav(h).hidden,false);assert.deepEqual(facts(h),before);h.L.closeBankingChat();h.flush();assert.equal(h.L.route,'home');clean(h);
});
console.log(passed+' full-screen Chat banking checks passed; '+failed+' failed.');
