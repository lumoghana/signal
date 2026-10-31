/* Money Story remains a recorded-spending detail accessible from Chat.
   Home keeps savings available while spending history has its own destination. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const primaryLabel=button=>(button.querySelector('.signal-action-label')||button).textContent.trim();
let passed=0;
const check=(name,run)=>{run();passed++;console.log('PASS '+name);};
const view=h=>h.document.getElementById('view');
const clean=h=>assert.deepEqual(h.errors,[]);
const tx=(id,amount,category,extra={})=>({id,name:id,type:'out',status:'success',amount,fee:0,category,date:new Date(Date.now()-86400000).toISOString(),...extra});
function fixture(){
 const h=createHarness(),{L}=h;L.explore();L.hidePrivateMoney();
 Object.assign(L.state,{balance:500,txs:[],paymentDraft:null,essentials:[{id:'food',name:'Food',amount:200,paid:0},{id:'transport',name:'Transport',amount:150,paid:0}],goals:[{id:'laptop',name:'Laptop',allocated:100}],allowance:{amount:0,date:''},chats:[]});
 L.route='home';L.params={};L.history=[];L.render();h.flush();return h;
}
function action(h,code){const button=view(h).querySelectorAll('button').find(el=>el.getAttribute('onclick')===code);assert(button,'Missing '+code);button.focus();button.click();h.flush();return button;}
function openFromChat(h){
 const {L}=h;if(L.route!=='chat'){const chats=view(h).querySelector('.mono-conversation-open')||view(h).querySelectorAll('button').find(b=>b.getAttribute('onclick')==='L.openBankingChat()');assert(chats);chats.click();h.flush();}
 action(h,'L.openChatBankingActions()');action(h,"L.go('homeMoneyStory')");assert.equal(L.route,'homeMoneyStory');assert.equal(L.taskSheet.parentRoute,'chat');
}
check('Home keeps funding, separate savings, three actions and the current edition conversation entry',()=>{
 const h=fixture(),home=view(h),mono=!!home.querySelector('.mono-home');assert.equal(home.querySelector('.home-money-story'),null);assert(home.querySelector('.account-savings'));assert.equal(home.querySelectorAll('.account-card').length,h.L.signalEdition?4:mono?3:2);assert.equal(home.querySelectorAll('.mono-conversation-card').length,mono?1:0);if(mono){assert.equal(home.querySelector('.mono-conversation-open').getAttribute('onclick'),'L.monoConversation.open()');assert.equal(home.querySelector('.mono-conversation-card').getAttribute('aria-label'),'Ask Lumo');assert(home.querySelector(h.L.signalEdition?'.signal-buddy-art .signal-lux':'.mono-conversation-art img[data-conversation-scene]'),'The leading question has its illustration');}assert(home.querySelector('.everyday-home-actions').querySelectorAll('button').some(b=>b.getAttribute('onclick')==="L.openFunding('home')"));assert.deepEqual(home.querySelector('.everyday-home-actions').querySelectorAll('button').map(primaryLabel),['Add money',mono?'Pay':'Transfer',mono?'Collect':'Request']);assert.equal(home.querySelectorAll('button').filter(b=>b.getAttribute('onclick')==="L.go('campusPay')").length,0);assert(h.document.getElementById('lumo-scan-qr'));assert(!home.querySelectorAll('button').some(b=>b.getAttribute('onclick')?.includes('homeMoneyStory')));clean(h);
});
check('Chat opens the same completed-money-out detail including fees and transfers, excluding nonspending states',()=>{
 const h=fixture(),{L}=h;L.state.txs=[tx('lunch',120,'Food',{fee:1.5}),tx('ride',60,'Transport'),tx('data',20,'Data'),tx('friend',30,'Transfers'),tx('printing',10,'Study'),tx('pending',70,'Food',{status:'pending'}),tx('failed',80,'Food',{status:'failed'}),tx('reversed',90,'Food',{status:'reversed'}),tx('income',1000,'Allowance',{type:'in'}),tx('future',500,'Food',{date:new Date(Date.now()+86400000).toISOString()}),tx('old',900,'Food',{date:new Date(Date.now()-40*86400000).toISOString()})];
 const summary=L.homeStorySummary();assert.equal(summary.total,241.5);assert.equal(summary.txs.length,5);assert.equal(summary.categories.reduce((sum,[,v])=>sum+v,0),241.5);assert(L.chatAnswer('Where did my money go?',{days:7}).text.includes('GH₵241.50'));
 openFromChat(h);assert.equal(h.document.querySelectorAll(h.L.signalEdition?'.task-sheet[role="region"]':'[role="dialog"]').length,1);assert.equal(view(h).querySelector('.home-story-detail-total').textContent,'GH₵241.50');for(const category of ['Food','Transport','Data','Transfers','Study'])assert(view(h).querySelector('.home-story-breakdown').textContent.includes(category));assert(view(h).textContent.includes('Transfers are money sent, not purchases.'));assert(!view(h).querySelector('.ms-transactions').textContent.includes('pending'));assert.equal(L.state.balance,500);clean(h);
});
check('incoming money and savings allocations do not become recorded spending',()=>{
 const h=fixture(),{L}=h;L.state.txs=[tx('received',600,'Allowance',{type:'in'})];L.state.goals[0].allocated=200;assert.equal(L.homeStorySummary().total,0);openFromChat(h);assert(view(h).textContent.includes('No completed payments in this period.'));assert.equal(L.state.balance,500);clean(h);
});
check('seven-day and thirty-day details distinguish an empty window from older history',()=>{
 const h=fixture(),{L}=h;L.state.txs=[tx('older meal',45,'Food',{date:new Date(Date.now()-20*86400000).toISOString()})];openFromChat(h);assert(view(h).textContent.includes('No completed payments in this period.'));const dialog=h.document.querySelector('.task-sheet');action(h,"L.go('homeMoneyStory',{days:30})");assert(h.document.querySelector('.task-sheet')===dialog);assert.equal(view(h).querySelector('.home-story-detail-total').textContent,'GH₵45.00');assert.equal(h.document.querySelectorAll(h.L.signalEdition?'.task-sheet[role="region"]':'[role="dialog"]').length,1);clean(h);
});
for(const dismissal of ['Back or Close','Escape or backdrop','browser Back'])check(dismissal+' restores the same Chat parent without changing money or restoring Home cards',()=>{
 const h=fixture(),{L}=h;L.openTab('chat');h.flush();const parent=view(h),tree=parent.firstChild;parent.scrollTop=61;openFromChat(h);assert(parent.inert);
 if(dismissal==='Back or Close')h.document.querySelector(L.signalEdition?'.task-sheet-back':'.task-sheet-close').click();else if(dismissal==='Escape or backdrop'){if(L.signalEdition)h.key('Escape');else h.document.querySelector('.task-sheet-backdrop').click();}else h.history.back();h.flush();
 if(L.signalEdition||dismissal==='browser Back'){assert.equal(L.route,'chatBankingActions');h.document.querySelector('.task-sheet-close').click();h.flush();}
 assert.equal(L.route,'chat');assert.equal(L.taskSheet.active,false);assert(view(h)===parent);assert(parent.firstChild===tree);assert.equal(parent.scrollTop,61);L.openTab('home');h.flush();assert.equal(view(h).querySelector('.home-money-story'),null);
 for(const id of ['overview-room','overview-balance','overview-savings']){const amount=h.document.getElementById(id);assert(amount.querySelector('.money-mask'));assert(!/\d/.test(amount.textContent));}
 if(L.monoDesign){for(const selector of ['#overview-balance','.mono-conversation-insight']){const field=view(h).querySelector(selector);assert(field);assert(field.querySelector('.money-mask'));assert(!/\d|GH₵/.test(field.textContent));}assert(!/GH₵150\.00|GH₵350\.00|GH₵100\.00/.test(view(h).querySelector('.mono-home').outerHTML),'Returning Home does not expose previously masked financial facts');}
 assert.equal(L.state.balance,500);assert.equal(L.state.txs.length,0);clean(h);
});
check('category corrections remain accurate after closing the detail and keep Home clear',()=>{
 const h=fixture(),{L}=h;L.state.txs=[tx('meal',35,'Other')];openFromChat(h);L.state.txs[0].category='Food';L.save();if(L.signalEdition){h.document.querySelector('.task-sheet-back').click();h.flush();assert.equal(L.route,'chatBankingActions');}h.document.querySelector('.task-sheet-close').click();h.flush();L.openTab('home');h.flush();assert.equal(view(h).querySelector('.home-money-story'),null);assert.equal(L.homeStorySummary().categories[0][0],'Food');assert.equal(L.homeStorySummary().total,35);assert.equal(L.state.balance,500);clean(h);
});
console.log(passed+' spending-detail and clean Home checks passed.');
