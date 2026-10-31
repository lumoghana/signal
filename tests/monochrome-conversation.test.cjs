/* Home starts real Chat from recorded facts. No prompt forecasts or moves money. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const view=h=>h.document.getElementById('view');
const settle=h=>{h.flushHistory();h.flush();};
const financial=L=>JSON.stringify({balance:L.state.balance,accounts:L.state.accounts,txs:L.state.txs,essentials:L.state.essentials,goals:L.state.goals,virtualCards:L.state.virtualCards,savingsHacks:L.state.savingsHacks,paymentDraft:L.state.paymentDraft,requests:L.state.requests,groupMoney:L.state.groupMoney});
const row=(h,id,days,extra={})=>({id,name:'Campus meal',type:'out',status:'success',amount:20,fee:0,category:'Food',date:new h.context.Date(h.context.Date.now()-days*86400000).toISOString(),...extra});
function fixture(){
 const h=createHarness({clock:true,deferHistory:true}),L=h.L;L.explore();
 Object.assign(L.state,{balance:1000,txs:[],goals:[],chats:[],essentials:[{id:'food',name:'Food',amount:200,paid:0,externalPaid:0,coverageVersion:1}],planSaved:true,paymentDraft:null});
 L.state.planHorizon={mode:'date',date:new h.context.Date(h.context.Date.now()+10*86400000).toISOString().slice(0,10)};
 L.route='home';L.params={};L.render();settle(h);return h;
}
function current(h){return h.L.monoConversation.current();}
function goal(h,extra={}){h.L.state.goals=[{id:'laptop',name:'Laptop',allocated:100,target:400,boxVersion:2,...extra}];}
const clean=h=>assert.deepEqual(h.errors,[]);

test('Home prompt chooses from saved costs, confirmed spending and active targets without financial writes',()=>{
 const h=fixture(),{L}=h,before=financial(L),saved=[...h.store.entries()];
 assert.equal(current(h).kind,'affordability');assert.equal(current(h).question,'What can I spend a day?');
 for(let i=0;i<4;i++){L.monoConversation.current();L.monoConversation.card();}
 assert.equal(financial(L),before);assert.deepEqual([...h.store.entries()],saved);
 goal(h);assert.equal(current(h).kind,'goal');assert.equal(current(h).goalId,'laptop');
 L.state.txs=[row(h,'a',1),row(h,'b',2),row(h,'c',3)];assert.equal(current(h).kind,'runway','Several distinct confirmed payment dates support a pace question');
 L.state.balance=50;assert.equal(current(h).kind,'affordability','Current Budget gap takes priority over a goal or history');
 L.state.balance=1000;L.state.essentials=[];assert.equal(current(h).kind,'affordability');assert.match(current(h).question,/caught short/);
 clean(h);
});

test('Home never invents a spending pace from pending, incoming, internal or single-day activity',()=>{
 const h=fixture(),{L}=h;
 L.state.txs=[row(h,'a',1),row(h,'b',1),row(h,'c',1),row(h,'pending',2,{status:'pending'}),row(h,'internal',3,{type:'internal',internalTransfer:true}),row(h,'income',4,{type:'in'}),row(h,'failed',5,{status:'failed'}),row(h,'old',8)];
 assert.equal(current(h).kind,'spending');assert.equal(current(h).chatQuestion,'Where did my money go in the last 7 days?');
 goal(h,{archived:true});assert.equal(current(h).kind,'spending');goal(h,{deleted:true});assert.equal(current(h).kind,'spending');goal(h,{allocated:400});assert.equal(current(h).kind,'spending');
 L.state.txs=[];L.state.goals=[];assert.equal(current(h).question,'What can I spend a day?');
 clean(h);
});

test('each prompt has its matching illustration, a factual observation and no privacy-toggle rotation',()=>{
 const h=fixture(),{L}=h;
 const variants=[()=>{L.state.txs=[];L.state.goals=[];},()=>goal(h),()=>{L.state.goals=[];L.state.txs=[row(h,'a',1)];},()=>{L.state.txs=[row(h,'a',1),row(h,'b',2),row(h,'c',3)];}];
 const seen=new Set();
 for(const setup of variants){
  setup();const prompt=current(h),markup=L.monoConversation.card(),before=financial(L);seen.add(prompt.kind);
  assert(markup.includes('data-conversation-kind="'+prompt.kind+'"'));assert(markup.includes('data-conversation-scene="'+prompt.art+'"'));assert(markup.includes('aria-hidden="true"'));assert(prompt.insight);assert(markup.includes('data-mono-conversation-insight'));
  assert.notEqual(L.chatAnswer(prompt.chatQuestion).intent,'unsupported','The selected question has a real supported answer');
  L.render();settle(h);L.hidePrivateMoney();assert.equal(current(h).question,prompt.question);L.showPrivateMoney();L.render();settle(h);assert.equal(current(h).question,prompt.question);assert.equal(financial(L),before);
 }
 assert.equal(seen.size,4);clean(h);
});

test('Home reveals current named-goal progress without predicting a finish date or changing its source',()=>{
 const h=fixture(),{L}=h;goal(h,{name:'Laptop <svg/onload=alert(1)>'});L.showPrivateMoney();L.render();settle(h);
 const before=financial(L),prompt=current(h),insight=view(h).querySelector('[data-mono-conversation-insight]');
 assert.equal(prompt.kind,'goal');assert.equal(prompt.question,'What’s left to save?');assert.equal(prompt.chatQuestion,'How close am I to my savings goal?');
 assert.match(insight.textContent,/Laptop <svg\/onload=alert\(1\)> · 25% saved\..*GH₵300\.00 to go/);
 assert.equal(insight.querySelector('svg'),null);assert(!/on track|in \d+ (days|weeks)|by \d/.test(insight.textContent));
 const selected=L.monoConversation.selectedGoal();assert.equal(selected.id,'laptop');selected.target=9999;assert.equal(financial(L),before,'A consumer receives a copy, not the saved goal');
 L.state.goals[0].allocated=150;const changed=financial(L);L.monoConversation.syncPrivacy();
 assert.match(insight.textContent,/37%.*GH₵250\.00 to go/);assert.equal(financial(L),changed);clean(h);
});

test('Home observations use confirmed paid-out totals, current coverage and honest empty or ended states',()=>{
 const h=fixture(),{L}=h;L.showPrivateMoney();L.state.balance=10000;
 L.state.txs=[row(h,'a',1),row(h,'b',2),row(h,'c',3),row(h,'pending',2,{status:'pending',amount:888}),row(h,'failed',3,{status:'failed',amount:999}),row(h,'income',1,{type:'in',amount:777}),row(h,'internal',1,{type:'internal',internalTransfer:true,amount:666})];
 let before=financial(L),prompt=current(h);assert.equal(prompt.kind,'runway');assert.equal(prompt.insight,'GH₵60.00 paid out in the last 7 days.');assert.equal(financial(L),before);
 L.state.txs=[row(h,'one',1)];prompt=current(h);assert.equal(prompt.kind,'spending');assert.equal(prompt.insight,'GH₵20.00 paid out in the last 7 days.');
 L.state.txs=[];L.state.balance=50;prompt=current(h);assert.equal(prompt.kind,'affordability');assert.match(prompt.insight,/GH₵150\.00.*uncovered/);
 L.state.balance=1000;L.state.essentials=[];prompt=current(h);assert.equal(prompt.insight,'Start with the costs your money needs to cover.');
 L.state.essentials=[{id:'food',name:'Food',amount:200,paid:0,externalPaid:0,coverageVersion:1}];prompt=current(h);assert.equal(prompt.insight,'GH₵800.00 left after planned costs.');
 L.state.planHorizon={mode:'date',date:new h.context.Date(h.context.Date.now()-86400000).toISOString().slice(0,10)};prompt=current(h);assert.equal(prompt.insight,'Your Budget dates need a review.');clean(h);
});

test('hidden Home observations contain no financial text or numeric attributes, and reveal fresh facts',()=>{
 const h=fixture(),{L}=h;goal(h);L.showPrivateMoney();L.render();settle(h);
 const before=financial(L);L.hidePrivateMoney();L.monoConversation.syncPrivacy();
 let insight=view(h).querySelector('[data-mono-conversation-insight]');assert(insight.querySelector('.money-mask'));assert(!/\d|GH₵|GHS|Laptop/.test(insight.outerHTML));
 assert.equal(L.monoConversation.visible(),false);assert.equal(view(h).querySelector('[data-private-value="goal"]'),null);
 L.render();settle(h);insight=view(h).querySelector('[data-mono-conversation-insight]');assert(!/\d|GH₵|GHS|Laptop/.test(insight.outerHTML));
 L.showPrivateMoney();L.monoConversation.syncPrivacy();assert.equal(L.monoConversation.visible(),true);assert.match(insight.textContent,/25%.*GH₵300\.00/);assert.equal(financial(L),before);
 L.state.goals[0].allocated=200;L.hidePrivateMoney();L.monoConversation.syncPrivacy();L.render();settle(h);assert(!/\d|GH₵|GHS/.test(view(h).querySelector('[data-mono-conversation-insight]').outerHTML));
 L.showPrivateMoney();L.monoConversation.syncPrivacy();assert.match(view(h).querySelector('[data-mono-conversation-insight]').textContent,/50%.*GH₵200\.00/);clean(h);
});

test('removed goals and a newly locked account cannot leave stale Home progress exposed',()=>{
 const h=fixture(),{L}=h;goal(h);L.showPrivateMoney();L.render();settle(h);
 const insight=view(h).querySelector('[data-mono-conversation-insight]');assert.match(insight.textContent,/Laptop · 25% saved/);
 L.state.goals=[];L.monoConversation.syncPrivacy();assert.equal(L.monoConversation.selectedGoal(),null);
 assert(!/Laptop|25%|GH₵300\.00/.test(insight.textContent));assert.match(insight.textContent,/left after planned costs/);
 L.state.locked=true;L.monoConversation.syncPrivacy();assert.equal(L.monoConversation.visible(),false);
 assert(insight.querySelector('.money-mask'));assert(!/\d|GH₵|GHS|Laptop/.test(insight.outerHTML));
 L.state.locked=false;L.hidePrivateMoney();L.monoConversation.syncPrivacy();assert(!/\d|GH₵|GHS/.test(insight.outerHTML));clean(h);
});

test('Home conversation click asks the real selected question exactly once and preserves financial records',()=>{
 const h=fixture(),{L}=h;goal(h);L.render();settle(h);
 const before=financial(L),prompt=current(h),button=view(h).querySelector('.mono-conversation-open');assert(button);
 button.click();settle(h);assert.equal(L.route,'chat');assert.equal(L.state.chats.length,1);assert.equal(L.state.chats[0].q,prompt.chatQuestion);assert.equal(L.state.chats[0].intent,'savings');assert.match(L.state.chats[0].headline,/25%/);assert.match(L.state.chats[0].support,/GH₵100\.00.*GH₵400\.00.*GH₵300\.00/);assert.equal(L.state.chats[0].route,'goal');assert.equal(L.state.chats[0].params.id,'laptop');
 assert.equal(L.monoConversation.open(),false,'Repeated stale Home activation cannot append another question');assert.equal(L.state.chats.length,1);assert.equal(financial(L),before);
 L.closeBankingChat();settle(h);assert.equal(L.route,'home');assert.equal(financial(L),before);clean(h);
});

test('opening a Home conversation preserves an unsent Chat draft and retains real spending scope',()=>{
 const h=fixture(),{L}=h;L.state.txs=[row(h,'a',1)];L.openBankingChat();settle(h);h.set('chatText','Keep this unfinished question');L.captureFormDraft();L.closeBankingChat();settle(h);
 const before=financial(L);L.render();settle(h);view(h).querySelector('.mono-conversation-open').click();settle(h);
 assert.equal(L.state.chats.length,1);assert.equal(L.state.chats[0].q,'Where did my money go in the last 7 days?');assert.notEqual(L.state.chats[0].intent,'unsupported');assert.equal(h.document.getElementById('chatText').value,'Keep this unfinished question');assert.equal(financial(L),before);clean(h);
});

test('goal answers remain read-only snapshots and identify changed targets without claiming a pace or date',()=>{
 const h=fixture(),{L}=h;goal(h,{name:'Laptop <svg/onload=alert(1)>'});const before=financial(L),reply=L.chatAnswer('How close am I to my savings goal?');
 assert.equal(financial(L),before);assert.match(reply.support,/doesn’t predict/);assert(!/in \d+ (days|weeks)|on track/.test(reply.text));assert.equal(L.chatSnapshotStatus(reply),'');
 L.state.goals[0].target=500;assert.match(L.chatSnapshotStatus(reply),/target has changed/);assert.equal(reply.calculation.rows[1][1],'GH₵400.00','Saved answer keeps its original target');
 L.render();settle(h);view(h).querySelector('.mono-conversation-open').click();settle(h);assert.equal(view(h).querySelector('#chat-thread svg'),null,'A saved goal name stays escaped text in Chat');clean(h);
});

test('locked, closed, signed-out and active-task states cannot use a stale Home prompt',()=>{
 for(const mode of ['locked','closed','signedOut']){
  const h=fixture(),{L}=h;if(mode==='signedOut')L.state.onboarded=false;else L.state[mode]=true;
  const before=financial(L),chats=L.state.chats.length;assert.equal(current(h),null);assert.equal(L.monoConversation.card(),'');assert.equal(L.monoConversation.open(),false);assert.equal(financial(L),before);assert.equal(L.state.chats.length,chats);clean(h);
 }
 const h=fixture(),{L}=h;L.go('activity');settle(h);const before=financial(L);assert.equal(L.monoConversation.open(),false);assert.equal(financial(L),before);clean(h);
});

// The salience rule is a Monochrome Home presentation choice; shared goal
// answers are exercised separately against every edition's shipped entry.
test('nearby saved goal dates stay salient without inventing a forecast or replacing Budget warnings',()=>{
 const h=fixture(),L=h.L,now=h.context.Date.now();goal(h,{date:new h.context.Date(now+7*86400000).toISOString().slice(0,10)});L.state.txs=[row(h,'d1',1),row(h,'d2',2),row(h,'d3',3)];
 const before=financial(L);assert.equal(current(h).kind,'goal');assert(!/will reach|on track|in \d+ weeks/.test(current(h).detail));
 L.state.goals[0].date=new h.context.Date(now+30*86400000).toISOString().slice(0,10);assert.equal(current(h).kind,'runway');L.state.goals[0].date=new h.context.Date(now+7*86400000).toISOString().slice(0,10);assert.equal(financial(L),before);L.state.balance=20;assert.equal(current(h).kind,'affordability');clean(h);
});
