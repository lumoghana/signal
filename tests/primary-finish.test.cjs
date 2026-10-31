/* Primary finish regressions run the actual shipped controllers. The small DOM
   proves retained state and controls; browser review owns visual layout. */
'use strict';
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
const view=h=>h.document.getElementById('view');
const settle=h=>{h.flushHistory();h.flush();h.advance(20);h.flushHistory();h.flush();};
const clean=h=>assert.deepEqual(h.errors,[]);
const funds=L=>JSON.stringify([L.state.balance,L.state.accounts,L.state.essentials,L.state.goals,L.state.txs,L.state.paymentDraft]);
let passed=0,failed=0;
function check(name,run){try{run();passed++;console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack);}}
function fixture(options={}){
 const h=createHarness({clock:true,testing:true,...options}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:600,txs:[],chats:[],notifications:[],paymentDraft:null,planSaved:true,planDraft:null,
  essentials:[{id:'food',name:'Food',amount:200,paid:0,externalPaid:0,coverageVersion:1}],
  goals:[{id:'laptop',name:'Laptop',target:3000,allocated:100,boxVersion:2}],planHorizon:{mode:'date',date:'2099-01-01'}});
 delete L.state.dailyInsights;delete L.state.pageGuidance;L.dailyInsights.sync();L.dailyInsights.prefs().quiet=false;
 L.route='home';L.params={};L.history=[];L.render();settle(h);return h;
}
function button(h,label){const b=view(h).querySelectorAll('button').find(el=>el.textContent.trim()===label);assert(b,'Mounted '+label);return b;}
function ask(h,question){h.set('chatText',question);h.L.askChat();settle(h);return h.L.state.chats.at(-1);}
function toggle(h,id,checked){const input=h.document.getElementById(id);assert(input,id);input.checked=checked;input.dispatchEvent(new h.Event('change'));return input;}
function go(h,route,params={}){h.L.go(route,params);settle(h);assert.equal(h.L.route,route);}
function tx(h,id,extra={}){return {id,type:'out',status:'success',name:'Akua’s Kitchen',amount:50,fee:0,category:'Food',method:'Campus Pay',date:new h.context.Date().toISOString(),...extra};}

for(const deferHistory of [false,true])check('history opens the original saved answer without replacing the composer or retained thread; deferred='+deferHistory,()=>{
 const h=fixture({deferHistory}),{L}=h;L.openBankingChat();settle(h);
 const original=copy(ask(h,'Can I spend GH₵80 from my Food budget?'));assert(original.calculation);
 ask(h,'Where did my money go?');L.state.balance=300;L.render();settle(h);
 const reply=L.state.chats[0],status=L.chatSnapshotStatus(reply);assert.match(status,/Earlier projection|Earlier answer/);
 h.set('chatText','Keep my unsent question');const composer=h.document.getElementById('chatText'),thread=h.document.getElementById('chat-thread');thread.scrollTop=137;
 const before=funds(L),saved=JSON.stringify(L.state.chats);go(h,'hibiscusChatHistory');
 const list=view(h).querySelector('.hibiscus-chat-history-list');assert(list);assert(list.textContent.includes(status));assert(!list.textContent.includes(original.headline));
 const rows=list.querySelectorAll('button');assert.equal(rows.length,2);assert(rows[0].textContent.includes('Where did my money go?'));
 assert.equal(L.hibiscusChat.openSaved(-1),false);assert.equal(L.hibiscusChat.openSaved(999),false);
 rows[1].click();settle(h);assert.equal(L.route,'chat');assert.equal(L.taskSheet.active,false);
 assert.equal(h.document.getElementById('chatText'),composer);assert.equal(composer.value,'Keep my unsent question');assert.equal(h.document.getElementById('chat-thread'),thread);
 assert.equal(h.document.activeElement.getAttribute('data-chat-turn-index'),'0');assert(h.scrolls.some(s=>s.id==='chat-saved-turn-0'));
 assert.equal(JSON.stringify(L.state.chats),saved);assert.equal(funds(L),before);assert.deepEqual(copy(reply.headline),original.headline);clean(h);
});
check('rolling seven-day copy does not describe a calendar week',()=>{
 const h=fixture(),{L}=h,now=h.context.Date.now(),day=new h.context.Date(now),today=Date.UTC(day.getUTCFullYear(),day.getUTCMonth(),day.getUTCDate()),week=today-((day.getUTCDay()+6)%7)*86400000;
 L.state.txs=[tx(h,'previous-week',{category:'Transfers',date:new Date(((now-7*86400000)+week)/2).toISOString()})];
 assert.equal(L.dailySpendingSummary({period:'thisWeek',now}).total,0);assert.equal(L.spendingSummary({days:7,now}).total,50);
 L.openBankingChat();settle(h);assert.match(view(h).querySelector('.hibiscus-chat-insight').textContent,/GH₵50\.00 paid out in the last 7 days/);
 assert.equal(L.moneyStoryAnalytics.homeSummary({now}).headline,'GH₵50.00 sent to others in the last 7 days.');clean(h);
});
check('turning optional timing off saves despite cleared irrelevant fields and retains valid defaults',()=>{
 const h=fixture(),{L}=h,original=copy(L.dailyInsights.prefs());go(h,'dailyUpdatePrefs');const before=funds(L);
 assert.equal(h.document.getElementById('daily-weekly-options').hidden,true);assert.equal(h.document.getElementById('daily-review-time').disabled,true);
 toggle(h,'daily-quiet-enabled',false);for(const id of ['daily-review-day','daily-review-time','daily-quiet-start','daily-quiet-end'])h.set(id,'');
 L.saveDailyUpdatePrefs();settle(h);assert.equal(L.route,'notificationPrefs');const p=L.dailyInsights.prefs();
 assert.equal(p.weekly,false);assert.equal(p.quiet,false);assert.equal(p.reviewDay,original.reviewDay);assert.equal(p.reviewTime,original.reviewTime);assert.equal(p.quietStart,original.quietStart);assert.equal(p.quietEnd,original.quietEnd);assert.equal(funds(L),before);clean(h);
});
check('enabled timing validates only its own fields, and toggling groups preserves typed values',()=>{
 const h=fixture(),{L}=h;go(h,'dailyUpdatePrefs');const field=h.document.getElementById('daily-review-time');toggle(h,'daily-weekly-enabled',true);
 assert.equal(h.document.getElementById('daily-weekly-options').hidden,false);assert.equal(field.disabled,false);h.set('daily-review-time','');L.saveDailyUpdatePrefs();assert.equal(L.route,'dailyUpdatePrefs');assert.match(h.document.getElementById('error').textContent,/valid review time/);
 h.set('daily-review-time','19:15');toggle(h,'daily-quiet-enabled',true);h.set('daily-quiet-start','22:00');h.set('daily-quiet-end','22:00');L.saveDailyUpdatePrefs();assert.match(h.document.getElementById('error').textContent,/different start and end/);
 toggle(h,'daily-weekly-enabled',false);assert.equal(h.document.getElementById('daily-review-time'),field);assert.equal(field.value,'19:15');toggle(h,'daily-weekly-enabled',true);assert.equal(field.value,'19:15');
 toggle(h,'daily-quiet-enabled',false);L.saveDailyUpdatePrefs();settle(h);assert.equal(L.route,'notificationPrefs');assert.equal(L.dailyInsights.prefs().reviewTime,'19:15');assert.equal(L.dailyInsights.prefs().quiet,false);assert.equal(L.dailyInsights.events().filter(e=>e.kind==='weekly').length,0);clean(h);
});
check('an unfinished preference form restores the toggled group with its unsaved fields',()=>{
 const h=fixture({deferHistory:true}),{L}=h;go(h,'dailyUpdatePrefs');toggle(h,'daily-weekly-enabled',true);h.set('daily-review-time','20:45');L.closeTask();settle(h);go(h,'dailyUpdatePrefs');
 assert.equal(h.document.getElementById('daily-weekly-enabled').checked,true);assert.equal(h.document.getElementById('daily-weekly-options').hidden,false);assert.equal(h.document.getElementById('daily-review-time').disabled,false);assert.equal(h.document.getElementById('daily-review-time').value,'20:45');assert.equal(L.dailyInsights.prefs().weekly,false);clean(h);
});
check('private previews retain neutral event types while hiding amounts, counterparties and detailed status',()=>{
 const h=fixture(),{L}=h;L.dailyInsights.prefs().privateUpdates=true;
 const events=L.dailyInsights.events();events.splice(0,events.length,...['receipt','status','budget','period','weekly'].map((kind,i)=>({id:'private-'+i,key:'private-'+i,kind,read:false,createdAt:new h.context.Date().toISOString(),title:'Secret Friend · GH₵987.65 confirmed',body:'Secret Friend received GH₵987.65'})));
 go(h,'notifications');const list=view(h).querySelector('.daily-updates-list'),text=list.textContent;
 for(const label of ['Incoming payment update','Payment status update','Budget update','Budget period update','Weekly review'])assert(text.includes(label),label);
 assert.doesNotMatch(text,/987\.65|Secret Friend|confirmed|received/);assert.equal(list.querySelectorAll('button').length,5);button(h,'Mark all read').click();settle(h);
 assert(!view(h).querySelector('.daily-updates-toolbar'));assert.equal(view(h).querySelector('.daily-updates-list').querySelectorAll('button').length,5);assert(events.every(e=>e.read));clean(h);
});
check('the weekly preview says it shows this week and uses the existing calendar range',()=>{
 const h=fixture(),{L}=h,before=funds(L);go(h,'notificationPrefs');button(h,"Preview this week's spending").click();settle(h);
 assert.equal(L.route,'dailyMoneyStory');assert.equal(L.params.period,'thisWeek');assert.equal(L.dailySpendingSummary({period:'thisWeek'}).label,'This week');assert.equal(funds(L),before);clean(h);
});
check('Story and Cards learning follows exact aliases while keeping each return context',()=>{
 const h=fixture(),{L}=h;L.openTab('moneyStoryHome');settle(h);let guide=view(h).querySelector('.page-guidance');assert(guide.hasAttribute('open'));guide.querySelector('.page-guidance-dismiss').click();
 L.openBankingChat();settle(h);L.openChatBankingActions();settle(h);go(h,'homeMoneyStory');guide=view(h).querySelector('.page-guidance');assert.equal(guide.getAttribute('data-guidance-route'),'homeMoneyStory');assert(!guide.hasAttribute('open'));assert.equal(L.taskSheet.parentRoute,'chat');
 go(h,'story');assert(!view(h).querySelector('.page-guidance').hasAttribute('open'));L.closeTask();settle(h);L.openTab('cardsHome');settle(h);assert(view(h).querySelector('.page-guidance').hasAttribute('open'));
 L.openBankingChat();settle(h);L.openChatBankingActions();settle(h);go(h,'virtualCards');guide=view(h).querySelector('.page-guidance');assert.equal(guide.getAttribute('data-guidance-route'),'virtualCards');assert(!guide.hasAttribute('open'));assert.equal(L.taskSheet.parentRoute,'chat');clean(h);
});
check('legacy alias learning migrates within one owner and another owner still learns once',()=>{
 const h=fixture(),{L}=h;L.state.pageGuidance={version:1,owner:L.state.profile.account,seen:{story:true},dismissed:{virtualCards:true}};
 L.openTab('moneyStoryHome');settle(h);assert(!view(h).querySelector('.page-guidance').hasAttribute('open'));assert.equal(L.state.pageGuidance.seen.moneyStoryHome,true);
 L.openTab('cardsHome');settle(h);assert(!view(h).querySelector('.page-guidance').hasAttribute('open'));assert.equal(L.state.pageGuidance.dismissed.cardsHome,true);assert.equal(L.state.pageGuidance.dismissed.virtualCards,true);
 L.state.profile.account='ANOTHER-SAMPLE-OWNER';L.render();settle(h);assert(view(h).querySelector('.page-guidance').hasAttribute('open'));assert.equal(L.state.pageGuidance.dismissed.cardsHome,undefined);clean(h);
});
check('GIP instructions learn once while warning, account copy and sample receipt controls stay outside',()=>{
 const h=fixture(),{L}=h,before=funds(L);go(h,'bankAdd');let guide=view(h).querySelector('.page-guidance');assert(guide);assert(guide.hasAttribute('open'));assert.equal(guide.querySelector('summary').textContent,'How to send with GIP');assert.equal(guide.querySelectorAll('li').length,6);
 const warning=view(h).querySelector('.preview-boundary');assert(warning.textContent.includes('Do not send real money'));assert(!warning.closest('.page-guidance'));
 for(const label of ['Copy account number','Copy all details','Check incoming activity','Simulate received money'])assert(!button(h,label).closest('.page-guidance'),label);
 const amount=h.document.getElementById('bank-test-amount');h.set('bank-test-amount','45');guide.querySelector('.page-guidance-dismiss').click();assert.equal(h.document.getElementById('bank-test-amount'),amount);assert.equal(amount.value,'45');assert.equal(funds(L),before);
 L.closeTask();settle(h);go(h,'bankAdd');guide=view(h).querySelector('.page-guidance');assert(!guide.hasAttribute('open'));guide.querySelector('summary').click();assert(guide.hasAttribute('open'));assert.equal(funds(L),before);clean(h);
});
check('replacement identifies the new recipient, amount and source and recovers when the saved draft disappears',()=>{
 const h=fixture(),{L}=h;L.openBankingChat();settle(h);ask(h,'Pay Akua GH₵30 from Food');const index=L.state.chats.length-1;
 L.state.paymentDraft={id:'old-draft',method:'campus',merchantId:'AK01',name:'Akua’s Kitchen',amount:'80'};const before=funds(L);go(h,'chatBankingReplace',{index});let text=view(h).querySelector('.chat-draft-choice').textContent;
 assert.match(text,/Saved draft.*Akua.*GH₵80\.00/);assert.match(text,/New draft.*Akua.*GH₵30\.00.*From Food/);button(h,'Start this new draft');button(h,'Keep my previous draft');assert.equal(funds(L),before);
 L.state.paymentDraft=null;L.render();settle(h);text=view(h).querySelector('.chat-draft-choice').textContent;assert.match(text,/saved draft is no longer here/);assert.doesNotMatch(text,/Keep my previous draft|unfinished payment/);button(h,'Back to conversation');clean(h);
});
check('an unavailable replacement proposal retains the actual saved draft without a misleading start action',()=>{
 const h=fixture(),{L}=h;L.openBankingChat();settle(h);ask(h,'Pay Akua GH₵30 from Food');L.state.paymentDraft={id:'old-draft',method:'campus',name:'Saved payment',amount:'80'};L.state.essentials=[];const before=funds(L);go(h,'chatBankingReplace',{index:L.state.chats.length-1});
 assert.match(view(h).querySelector('.chat-draft-choice').textContent,/proposal is no longer available.*saved draft has been kept/);assert(!view(h).querySelectorAll('button').some(b=>b.textContent==='Start this new draft'));assert.equal(funds(L),before);clean(h);
});
check('missing notices and empty category jobs recover without invented notices or success',()=>{
 const h=fixture(),{L}=h,before=funds(L);go(h,'dailyAccountNotice',{index:99});assert.match(view(h).textContent,/Notice unavailable/);assert.doesNotMatch(view(h).textContent,/Saved account notice/);button(h,'View updates').click();settle(h);assert.equal(L.route,'notifications');
 go(h,'categoryMatch',{ids:['gone']});assert.match(view(h).textContent,/payments are no longer available/);assert.doesNotMatch(view(h).textContent,/Which payment\?/);
 go(h,'categorySort',{queue:[],at:0});assert.match(view(h).textContent,/Nothing to sort/);assert.doesNotMatch(view(h).textContent,/Your choices are saved|A little clearer/);assert.equal(funds(L),before);clean(h);
});
check('a stale category queue skips unavailable rows and celebrates only an actual category choice',()=>{
 const h=fixture(),{L}=h;L.state.txs=[tx(h,'live',{category:'Uncategorised'})];go(h,'categorySort',{queue:['gone','live'],at:0});assert.equal(L.params.at,1);assert.match(view(h).textContent,/Akua/);const balance=L.state.balance;
 L.sortCategory('Transport');settle(h);assert.equal(L.state.txs[0].category,'Transport');assert.match(view(h).textContent,/Your choices are saved/);assert.equal(L.state.balance,balance);
 go(h,'categorySort',{queue:['live'],at:0});L.sortCategory('');settle(h);assert.match(view(h).textContent,/No category changes were made/);assert.doesNotMatch(view(h).textContent,/Your choices are saved/);clean(h);
});
check('expected income alone cannot complete the Budget-cost milestone',()=>{
 const h=fixture(),{L}=h;L.state.allowance.amount=500;L.state.essentials=[];L.state.planSaved=false;go(h,'missions');
 const row=()=>view(h).querySelectorAll('button').find(b=>b.textContent.includes('Add an everyday budget cost'));assert(row());assert(!row().textContent.includes('Done'));
 L.state.essentials=[{id:'old',name:'Old cost',amount:50,archived:true},{id:'invalid',name:'Invalid cost',amount:'no amount'}];L.render();settle(h);assert(!row().textContent.includes('Done'));
 L.state.essentials=[{id:'food',name:'Food',amount:50,paid:0}];L.render();settle(h);assert(row().textContent.includes('Done'));clean(h);
});
for(const route of ['moneyStoryHome','cardsHome'])check(route+' supports a guarded background swipe and keeps its buttons interactive',()=>{
 const h=fixture(),{L}=h;L.openTab(route);settle(h);const before=funds(L);
 const swipe=target=>{for(const [type,x]of [['pointerdown',90],['pointermove',290],['pointerup',290]])target.dispatchEvent(new h.Event(type,{pointerId:7,pointerType:'touch',isPrimary:true,button:0,clientX:x,clientY:310}));settle(h);};
 const control=route==='moneyStoryHome'?view(h).querySelector('.ms-periods button'):button(h,'Create a virtual card');assert(control);swipe(control);assert.equal(L.route,route);
 swipe(view(h).querySelector('.screen'));assert.equal(L.route,'chat');L.closeBankingChat();settle(h);assert.equal(L.route,route);assert.equal(funds(L),before);clean(h);
});

console.log(`${passed} primary finish checks passed; ${failed} failed.`);if(failed)process.exitCode=1;
