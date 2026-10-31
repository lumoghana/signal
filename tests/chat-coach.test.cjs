/* Account-backed answers and Money Story must describe the same money and dates. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const NOW=Date.parse('2026-10-17T17:00:00Z'),DAY=86400000;
let typed='',navigation=null,announcements=[],renderCount=0;
const L={
 state:{balance:1920,txs:[],essentials:[{id:'food',name:'Food',amount:200,paid:0}],goals:[{id:'laptop',name:'Laptop',allocated:200}],allowance:{amount:1200,date:'2026-10-24'},chats:[]},
 params:{},views:{},e:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 money:value=>'GH₵'+(Math.round(Number(value)*100)/100).toLocaleString('en-GH',{minimumFractionDigits:2,maximumFractionDigits:2}),btn:(label,action,kind='primary')=>`<button class="${kind}" onclick="${action}">${label}</button>`,
 clarityRing:()=>'<span class="clarity-ring" aria-hidden="true"></span>',
 header:(title,sub)=>`<div class="page-heading"><h1>${title}</h1><p>${sub}</p></div>`,icon:()=>'<svg></svg>',illustration:()=>'<figure class="scene-art" data-art="chat-art" aria-hidden="true"></figure>',
 balances(){const held=this.state.txs.filter(t=>t.type==='out'&&t.status==='pending').reduce((sum,t)=>sum+Number(t.amount)+Number(t.fee||0),0),available=Math.max(0,this.state.balance-held),essentials=this.state.essentials.reduce((sum,x)=>sum+Math.max(0,x.amount-(x.paid||0)),0),allocated=this.state.goals.reduce((sum,x)=>sum+x.allocated,0);return {available,essentials,allocated,room:Math.max(0,available-essentials-allocated),gap:Math.max(0,essentials+allocated-available)};},
 value:()=>typed,clearFormDraft(){},save(){},render(){renderCount++;},announceChat(text){announcements.push({text,afterRender:renderCount});},go(route,params){navigation={route,params};}
};
const context={L,Date,console,window:{addEventListener(){}},document:{getElementById:()=>null}};
vm.createContext(context);
for(const file of ['pause-engine.js','plan-impact.js','chat-coach.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist',file),'utf8'),context);
const fullCopy=reply=>[reply.text,...(reply.calculation?.rows||[]).flat(),...(reply.calculation?.notes||[])].join(' ');
const tx=(id,days,amount,category='Food',extra={})=>({id,date:new Date(NOW-days*DAY).toISOString(),amount,category,fee:0,type:'out',status:'success',...extra});
L.state.txs=[tx('today',0,20,'Food',{fee:1.5}),tx('day6',6,30,'Transport'),tx('boundary7',7,10),tx('day8',8,50),tx('day29',29,60,'Study'),tx('day31',31,200),tx('future',-1,1000),tx('pending',1,1000,'Food',{status:'pending'}),tx('failed',1,1000,'Food',{status:'failed'}),tx('incoming',1,1000,'Food',{type:'in'}),tx('reversed',1,1000,'Food',{status:'reversed'}),tx('invalid',1,'oops'),tx('negativeFee',1,10,'Food',{fee:-1}),tx('invalidDate',1,10,'Food',{date:'invalid'})];
const seven=L.spendingSummary({days:7,now:NOW});
assert.equal(seven.total,61.5);assert.equal(seven.txs.length,3);
assert.deepEqual(JSON.parse(JSON.stringify(seven.categories)),[['Food',31.5],['Transport',30]]);
assert.equal(L.spendingSummary({days:30,now:NOW}).total,171.5);
assert.equal(L.spendingSummary({days:90,now:NOW}).total,371.5);
assert.equal(L.spendingSummary({days:7,category:'food',now:NOW}).total,31.5);
assert.equal(L.spendingSummary({days:14,now:NOW}).days,30);
console.log('PASS shared spending windows, fees, categories and invalid/future/status exclusions');

const moneyBefore=JSON.stringify({balance:L.state.balance,essentials:L.state.essentials,goals:L.state.goals,txs:L.state.txs});
L.params={days:7,category:'Food'};
let reply=L.chatAnswer('Where did my money go?',{now:NOW});
assert.equal(reply.intent,'spending');assert.match(reply.text,/GH₵31\.50/);assert.match(reply.text,/last 7 days/);
assert.deepEqual(JSON.parse(JSON.stringify(reply.params)),{days:7,category:'Food'});
reply=L.chatAnswer('How much did I spend on transport in the last 30 days?',{now:NOW});
assert.equal(reply.intent,'spending');assert.equal(reply.context.category,'Transport');assert.equal(reply.params.days,30);assert.match(reply.text,/GH₵30\.00/);
reply=L.chatAnswer('Show all spending in the last 90 days',{now:NOW});
assert.equal(reply.context.category,'');assert.match(reply.text,/GH₵371\.50/);
assert.equal(L.chatAnswer('What did I spend yesterday?',{now:NOW}).intent,'spending-period');
assert.equal(L.chatAnswer('What did I spend in the last 14 days?',{now:NOW}).intent,'spending-period');
assert.equal(L.chatAnswer('What did I spend this year?',{now:NOW}).intent,'spending-period');
assert.equal(L.chatAnswer('What did I spend on 16/10/2026?',{now:NOW}).intent,'spending-period');
console.log('PASS spending question category/period context and unsupported-period clarification');

reply=L.chatAnswer('Can I afford food tonight?',{now:NOW});
assert.equal(reply.intent,'affordability');assert.match(reply.text,/total in Ghana cedis/);assert(reply.pendingAffordability);assert.doesNotMatch(reply.text,/spent/);
reply=L.chatAnswer('70',{now:NOW,pendingAffordability:reply.pendingAffordability});
assert.equal(reply.intent,'affordability');assert.match(reply.text,/GH₵450.00/);assert.match(reply.text,/Your plan stays covered/);assert.match(fullCopy(reply),/extra spend/);assert(!reply.pendingAffordability);
reply=L.chatAnswer('Can I afford 70 cedis this weekend?',{now:NOW});
assert.match(fullCopy(reply),/not a forecast of weekend spending/);
reply=L.chatAnswer('Can I afford GHS600?',{now:NOW});
assert.match(reply.text,/Money set aside for Laptop would be GH₵80.00 short/);assert.equal(reply.route,'goal');assert.equal(reply.params.id,'laptop');
reply=L.chatAnswer('Can I afford GHS800?',{now:NOW});
assert.match(reply.text,/Food would be GH₵80.00 short/);assert.match(reply.text,/Money set aside for Laptop: GH₵200.00 uncovered after essentials/);
reply=L.chatAnswer('Can I afford GHS1,000?',{now:NOW});
assert.match(reply.text,/GH₵80.00 more/);assert.equal(reply.route,'addMoney');
assert.match(L.chatAnswer('Can I afford GHS70.123?',{now:NOW}).text,/positive amount in Ghana cedis/);
assert.match(L.chatAnswer('Can I afford GHS-70?',{now:NOW}).text,/positive amount in Ghana cedis/);
assert.match(L.chatAnswer('Can I afford GHS50 or GHS70?',{now:NOW}).text,/single total/);
reply=L.chatAnswer('Can I afford GHS70 on 2026-10-24?',{now:NOW});assert.match(fullCopy(reply),/not a forecast for 24 Oct 2026/);
const essentials=L.state.essentials;L.state.essentials=[];
reply=L.chatAnswer('Can I afford GHS70?',{now:NOW});assert.match(reply.text,/can’t assess affordability/);assert.doesNotMatch(reply.text,/Your plan stays covered/);assert.equal(reply.route,'essentials');
L.state.essentials=essentials;
console.log('PASS affordability before category matching, amount follow-up, plan gaps and cautious future checks');

// F04: everyday prospective wording must not be confused with completed spending.
for(const question of [
 'I want to spend GHS70 on food tonight',
 "I'm going to pay GHS70 for dinner",
 'I am going to pay GHS70',
 "I'm thinking of buying a meal for GHS70",
 'I am considering buying a meal for GHS70',
 'I plan to buy a meal for GHS70',
 'I need to pay GHS70 for dinner'
]){
 reply=L.chatAnswer(question,{now:NOW});
 assert.equal(reply.intent,'affordability',question);assert.equal(reply.planImpact.amount,70);assert.match(reply.text,/GH₵450.00/);assert.doesNotMatch(reply.text,/You spent/);
}
reply=L.chatAnswer('I spent GHS70 on food in the last 7 days',{now:NOW});
assert.equal(reply.intent,'spending');assert.match(reply.text,/GH₵31\.50/);
reply=L.chatAnswer('Can I afford food tomorrow?',{now:NOW});
reply=L.chatAnswer('Actually make it 80',{now:NOW,pendingAffordability:reply.pendingAffordability});
assert.equal(reply.intent,'affordability');assert.equal(reply.planImpact.amount,80);assert.match(reply.text,/GH₵440.00/);assert.match(fullCopy(reply),/doesn’t assume any money will arrive tomorrow/);
reply=L.chatAnswer('Actually make it 90',{now:NOW,lastAffordability:reply.lastAffordability});
assert.equal(reply.planImpact.amount,90);assert.match(reply.text,/GH₵430.00/);assert.match(fullCopy(reply),/doesn’t assume any money will arrive tomorrow/);
const lastAffordability=reply.lastAffordability;
assert.match(L.chatAnswer('Actually make it eighty',{now:NOW,lastAffordability}).text,/total in Ghana cedis/);
assert.match(L.chatAnswer('Actually make it -80',{now:NOW,lastAffordability}).text,/positive amount in Ghana cedis/);
assert.match(L.chatAnswer('Actually make it 80 or 90',{now:NOW,lastAffordability}).text,/single total/);
assert.match(L.chatAnswer('Can I afford GHS70 or 80?',{now:NOW}).text,/single total/);
assert.match(L.chatAnswer('Can I afford 70 or GHS80?',{now:NOW}).text,/single total/);
assert.match(L.chatAnswer('Can I afford around GHS70?',{now:NOW}).text,/single total/);
assert.match(L.chatAnswer('Can I afford GHS70 and GHS5 in fees?',{now:NOW}).text,/single total/);
assert.equal(L.chatAnswer('Actually make it 80',{now:NOW}).intent,'unsupported','A correction without current context must not infer a payment from history');
console.log('PASS prospective spending intent, bounded amount corrections and uncertain/multiple amount clarification');

// The same saved-plan facts must produce one story in Chat and Pause: daily
// essentials first, goal impact immediately next, total only in the calculation.
const originalState=L.state;
L.state={balance:600,txs:[],essentials:[{id:'food',name:'Food',amount:200,paid:0},{id:'transport',name:'Transport',amount:150,paid:0}],goals:[{id:'laptop',name:'Laptop',allocated:100}],allowance:{amount:1200,date:'2026-10-24'},chats:[]};
const beforeImpact=JSON.stringify(L.state),shared=L.planImpactSummary(280,L.state,NOW);
reply=L.chatAnswer('I want to spend GHS280 tonight',{now:NOW});
assert.equal(reply.headline,shared.headline);assert.equal(reply.support,shared.goalExplanation);
assert.equal(reply.planImpact.essentialGap,30);assert.equal(reply.planImpact.goalGap,100);assert.equal(reply.planImpact.totalGap,130);
assert.match(reply.headline,/Food and transport would be GH₵30.00 short/);
assert.match(reply.support,/Money set aside for Laptop: GH₵100.00 uncovered after essentials/);
assert.doesNotMatch(reply.text,/GH₵130.00/,'The combined gap must not displace the essentials-first answer');
assert.equal(reply.calculation.rows.find(([label])=>label==='Total plan shortfall')[1],'GH₵130.00');
assert.equal(reply.calculation.rows.find(([label])=>label==='Projected balance after payment')[1],'GH₵320.00');
assert.match(fullCopy(reply),/Money set aside for goals stays in your account/);
for(const [amount,room,headline] of [[80,70,'Your plan stays covered. GH₵70.00 spare.'],[140,10,'Your plan stays covered. GH₵10.00 spare.'],[150,0,'Your plan stays covered. No spare room.']]){
 const safe=L.chatAnswer('Can I afford GH₵'+amount+'?',{now:NOW});
 assert.equal(safe.headline,headline);assert.equal(safe.planImpact.room,room);assert.equal(safe.planImpact.engineDecision.triggered,false);
 assert.equal(safe.calculation.rows.find(([label])=>label==='Left after your plan')[1],L.money(room));
 assert.equal(JSON.stringify(L.state),beforeImpact);
}
assert.equal(JSON.stringify(L.state),beforeImpact,'Asking about a payment must not mutate financial records');
L.state.chats=[{q:'I want to spend GHS280 tonight',...reply}];
let impactHtml=L.views.chat();
assert(impactHtml.indexOf('class="lead"')<impactHtml.indexOf('class="impact-secondary"'));
assert.match(impactHtml,/Money set aside for Laptop: GH₵100.00/);
assert.doesNotMatch(impactHtml,/GH₵130.00/,'Arithmetic is only in the separate detail sheet');
assert.match(impactHtml,/class="text-btn chat-calculation-link"[^>]*onclick="L.openChatCalculation\(0\)"/);
L.openChatCalculation(0);assert.equal(navigation.route,'chatCalculation');L.params={index:0};
const calculationHtml=L.views.chatCalculation();assert.match(calculationHtml,/GH₵130.00/);assert.match(calculationHtml,/GH₵320.00/);L.params={};
assert.match(impactHtml,/Review essentials/);assert.match(impactHtml,/Try a different amount/);
L.chatOpenAnswer(0);assert.equal(navigation.route,'essentials');
L.chatOpenAnswer(0,true);assert.equal(L.params.pendingAffordability,'I want to spend GHS280 tonight');
assert.equal(L.state.chats.length,1,'Trying another amount must not add a fabricated conversation turn');
L.state.balance=320;L.params={};
for(const question of ['What is left after my plan?','Help me make some room','Will my money last until allowance?']){
 const existingGap=L.chatAnswer(question,{now:NOW});
 assert.match(existingGap.headline,/Food and transport short by GH₵30.00/);
 assert.match(existingGap.support,/^Money set aside for Laptop: GH₵100.00 uncovered after essentials/);
 assert.doesNotMatch(existingGap.text,/GH₵130.00/);assert(existingGap.calculation);
}
L.state=originalState;L.params={days:7,category:'Food'};renderCount=0;
console.log('PASS shared essentials-first consequence, visible goal impact, calculation sheet and meaningful actions');

reply=L.chatAnswer('Will my money last until allowance?',{now:NOW});
assert.equal(reply.intent,'runway');assert.match(reply.text,/in 7 days/);assert.match(reply.text,/can’t promise this will last/);assert.doesNotMatch(reply.text,/per day|will last 7/);
assert(reply.headline&&reply.support&&reply.calculation,'Runway starts with a short answer and keeps calculations separate');assert.match(reply.text,/Expected allowance is not received money/);
L.state.allowance.date='2026-10-10';assert.match(L.chatAnswer('Will I run out before allowance?',{now:NOW}).text,/has passed/);
L.state.allowance.date='';assert.equal(L.chatAnswer('Will I run out before allowance?',{now:NOW}).route,'allowance');
L.state.allowance.date='2026-02-30';assert.equal(L.chatAnswer('Will I run out before allowance?',{now:NOW}).route,'allowance');
L.state.allowance.date='2026-10-24';
assert.equal(L.chatAnswer('Help me make some room',{now:NOW}).route,'makeRoom');
assert.equal(L.chatAnswer('What is left after my plan?',{now:NOW}).route,'plan');
assert.equal(L.chatAnswer('Open payments',{now:NOW}).route,'pay');
assert.equal(L.chatAnswer('Recommend an investment',{now:NOW}).intent,'unsupported');
assert.equal(JSON.stringify({balance:L.state.balance,essentials:L.state.essentials,goals:L.state.goals,txs:L.state.txs}),moneyBefore);
console.log('PASS saved-plan/runway limitations and no money or planning mutations');

// The question entry paths must keep the current view; reply actions must use the reply's view.
L.params={days:7,category:'Food',question:'Can I afford food tonight?'};
let html=L.views.chat();assert.match(html,/Total payment amount in Ghana cedis/);assert.equal(L.state.chats.length,1);
L.views.chat();assert.equal(L.state.chats.length,1,'Rendering the same question twice must not duplicate it');
typed='GHS70';L.askChat();assert.equal(L.params.days,7);assert.equal(L.params.category,'Food');assert(!L.params.pendingAffordability);
assert.equal(announcements.length,1);assert.equal(announcements[0].text,L.state.chats.at(-1).text);assert.equal(announcements[0].afterRender,1);
typed='Actually make it 80';L.askChat();assert.equal(L.state.chats.at(-1).planImpact.amount,80);assert.equal(L.params.lastAffordability.amount,80);
typed='Actually make it eighty';L.askChat();assert.match(L.state.chats.at(-1).text,/total in Ghana cedis/);assert(L.params.pendingAffordability);
typed='Actually make it 80 or 90';L.askChat();assert.match(L.state.chats.at(-1).text,/single total/);
typed='80';L.askChat();assert.equal(L.state.chats.at(-1).planImpact.amount,80);assert(!L.params.pendingAffordability);
L.askSuggestion(0);assert.equal(L.params.days,7);assert.equal(L.params.category,'Food');
assert(!L.params.lastAffordability,'An unrelated question must end the payment correction context');
assert.equal(announcements.length,6);assert.equal(announcements.at(-1).text,L.state.chats.at(-1).text);assert.equal(announcements.at(-1).afterRender,6);
typed='Actually make it 90';L.askChat();assert.equal(L.state.chats.at(-1).intent,'unsupported','Historical reply amounts must not become follow-up context');
L.askSuggestion(0);
const index=L.state.chats.length-1;L.setChatPeriod(90);L.chatOpenAnswer(index);
assert.equal(navigation.route,'story');assert.equal(navigation.params.days,7);assert.equal(navigation.params.category,'Food');
html=L.views.chat();assert.match(html,/Spending view: Food · Last 90 days/);assert.match(html,/All spending/);assert.match(html,/role="log" aria-live="off"/);assert.match(html,/for="chatText"/);assert.match(html,/<details class="chat-prompts"><summary>Try a question/);assert.doesNotMatch(html,/<details class="chat-prompts"[^>]*open/);assert.match(html,/chat-has-conversation/);assert.equal((html.match(/data-art=/g)||[]).length,1);
assert.match(html,/Can I afford food tonight\?/,'The oldest turn must remain readable after more than six exchanges');
const announcedBefore=announcements.length;L.views.chat();assert.equal(announcements.length,announcedBefore,'Rendering historical messages must not announce the entire conversation');
const count=L.state.chats.length;L.clearChatCategory();assert.equal(L.params.category,'');assert.equal(L.params.days,90);assert.equal(L.state.chats.length,count);
assert.equal(JSON.stringify({balance:L.state.balance,essentials:L.state.essentials,goals:L.state.goals,txs:L.state.txs}),moneyBefore);
console.log('PASS typed and suggested question persistence, historical answer action context, accessible visible controls');

// Exercise the real persistent announcer and keyboard hooks with the Chat handlers.
// The live region sits outside the rerendered view; rapid answers announce only the newest one.
const liveRegion={textContent:''},documentEvents={},viewportEvents={},scrolls=[],timers=[];
const composer={id:'chatText',getBoundingClientRect:()=>({top:750,bottom:800}),focus(options){assert.equal(options.preventScroll,true);context.document.activeElement=this;documentEvents.focusin?.({target:this});},scrollIntoView(options){scrolls.push(options);}};
context.URLSearchParams=URLSearchParams;context.location={search:''};
context.window={innerHeight:844,visualViewport:{height:420,offsetTop:0,addEventListener(name,callback){viewportEvents[name]=callback;}}};
context.document={documentElement:{clientHeight:844},activeElement:null,getElementById:id=>id==='chat-announcement'?liveRegion:id==='chatText'?composer:null,addEventListener(name,callback){documentEvents[name]=callback;}};
context.setTimeout=(callback,delay)=>{timers.push({callback,delay});return timers.length;};
const flushTimers=()=>{while(timers.length){timers.sort((a,b)=>a.delay-b.delay);timers.shift().callback();}};
vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/ambassador.js'),'utf8'),context);
L.route='chat';L.params={days:7,category:'Food'};
typed='I want to spend GHS70 on food tonight';L.askChat();
assert.equal(L.state.chats.at(-1).intent,'affordability');assert.equal(liveRegion.textContent,'','New answer is scheduled after the live region is cleared');
typed='Actually make it 80';L.askChat();
assert.equal(L.state.chats.at(-1).lastAffordability.amount,80);flushTimers();
assert.equal(liveRegion.textContent,L.state.chats.at(-1).text);assert.match(liveRegion.textContent,/GH₵440.00/);assert.doesNotMatch(liveRegion.textContent,/GH₵450.00|You spent/);
assert(scrolls.length>=1,'Typing keeps the composer reachable');
const scrollCount=scrolls.length;viewportEvents.resize();assert.equal(scrolls.length,scrollCount+1,'Keyboard viewport changes keep the focused composer reachable');
L.route='home';viewportEvents.resize();assert.equal(scrolls.length,scrollCount+1,'Other routes do not scroll the Chat composer');
L.route='chat';L.askSuggestion(0);flushTimers();assert.equal(liveRegion.textContent,L.state.chats.at(-1).text);assert.equal(L.state.chats.at(-1).intent,'spending');
const indexHtml=fs.readFileSync(path.join(__dirname,'../dist/index.html'),'utf8');
assert(indexHtml.indexOf('id="chat-announcement"')>indexHtml.indexOf('</main>'),'The announcement node must survive view replacement');
assert.match(indexHtml,/<div id="chat-announcement"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
assert.equal(JSON.stringify({balance:L.state.balance,essentials:L.state.essentials,goals:L.state.goals,txs:L.state.txs}),moneyBefore);
console.log('PASS persistent newest-reply announcements, typed corrections and keyboard composer integration');

const conversation=L.state.chats;L.state.chats=[];L.params={};
html=L.views.chat();assert.doesNotMatch(html,/chat-has-conversation/);assert.equal((html.match(/data-art=/g)||[]).length,1);assert.match(html,/<details class="chat-prompts" open><summary>/);assert.match(html,/Ask your money\./);
L.state.chats=conversation;
console.log('All Chat coach checks passed.');
