/* Actual application + shared calculation engine. Device-local updates must
   never change funds, invent receipts or duplicate a ledger event. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const root=path.resolve(__dirname,'../dist');
const storageKey=fs.readFileSync(path.join(root,'core.js'),'utf8').match(/const key='([^']+)'/)[1];
const shipped=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
const modules=[...shipped,...['budget-everyday.js','chat-everyday.js','daily-insights.js'].filter(file=>!shipped.includes(file))];
const copy=x=>JSON.parse(JSON.stringify(x));
const view=h=>h.document.getElementById('view');
const clean=h=>assert.deepEqual(h.errors,[]);
let passed=0,failed=0;
const check=(name,run)=>{try{run();passed++;console.log('PASS '+name);}catch(error){failed++;process.exitCode=1;console.error('FAIL '+name+'\n'+error.stack);}};
function fixture(options={}){
 const h=createHarness({clock:true,modules,...options});h.L.explore();
 h.L.state.balance=600;h.L.state.txs=[];h.L.state.essentials=[{id:'food',name:'Food and transport',amount:350,paid:0}];h.L.state.goals=[{id:'laptop',name:'Laptop',target:1000,allocated:100}];h.L.state.notifications=[];
 h.L.state.planHorizon={mode:'unspecified',date:''};h.L.state.prefs.payment=true;h.L.state.accountPrefs={...h.L.state.accountPrefs,plan:true};delete h.L.state.dailyInsights;
 h.L.dailyInsights.sync();h.L.dailyInsights.prefs().quiet=false;h.L.route='home';h.L.params={};h.L.history=[];h.L.render();h.flush();return h;
}
function tx(h,id,overrides={}){return {id,date:new h.context.Date().toISOString(),type:'out',name:'Akua’s Kitchen',amount:20,fee:0,status:'success',category:'Food',method:'Campus Pay',...overrides};}
const financial=h=>copy({balance:h.L.state.balance,accounts:h.L.state.accounts,essentials:h.L.state.essentials,goals:h.L.state.goals,txs:h.L.state.txs});
function click(h,code){const control=view(h).querySelectorAll('button').find(b=>b.getAttribute('onclick')===code);assert(control,'Working control: '+code);control.click();h.flush();return control;}

check('today uses shared calendar arithmetic and excludes unconfirmed, incoming and internal money',()=>{
 const h=fixture(),now=Date.parse('2026-10-23T12:00:00Z');h.L.state.txs=[
  tx(h,'food',{date:'2026-10-23T08:00:00Z',amount:35,fee:1}),tx(h,'data',{date:'2026-10-23T09:00:00Z',amount:15,category:'Data'}),
  tx(h,'yesterday',{date:'2026-10-22T23:59:59Z',amount:100}),tx(h,'future',{date:'2026-10-23T14:00:00Z',amount:100}),
  tx(h,'incoming',{date:'2026-10-23T08:00:00Z',type:'in',amount:500}),tx(h,'pending',{date:'2026-10-23T08:00:00Z',status:'pending'}),tx(h,'failed',{date:'2026-10-23T08:00:00Z',status:'failed'}),
  tx(h,'internal',{date:'2026-10-23T08:00:00Z',type:'internal',internalTransfer:true}),tx(h,'invalid',{date:'not-a-date'}),tx(h,'badAmount',{date:'2026-10-23T08:00:00Z',amount:Infinity})
 ];
 const s=h.L.dailyInsights.summary('today',now),shared=h.L.dailySpendingSummary({period:'today',now});assert.equal(s.total,51);assert.equal(s.count,2);assert.deepEqual(copy(s),copy(shared));clean(h);
});
check('daily spending details remain accurate alongside the current Home cards',()=>{
 const h=fixture();h.L.state.txs=[tx(h,'lunch',{amount:35})];const before=financial(h);h.L.render();h.flush();
 assert.equal(view(h).querySelectorAll('[data-home-focus="story"]').length,0);assert.match(h.L.dailyInsights.insight().headline,/Food took GH₵35\.00 today/);const mono=!!view(h).querySelector('.mono-home');assert.equal(view(h).querySelectorAll('.account-card').length,h.L.signalEdition?4:mono?3:2);assert.equal(view(h).querySelectorAll('.mono-conversation-card').length,mono?1:0);
 h.L.go('dailyMoneyStory',{period:'today'});h.flush();assert.equal(h.L.route,'dailyMoneyStory');assert.equal(h.L.taskSheet.active,true);assert.match(view(h).textContent,/Food took the largest share/);assert.deepEqual(financial(h),before);clean(h);
});
check('the retained daily insight explains the leading category rather than repeating the completed-money-out counter',()=>{
 const h=fixture();h.L.state.txs=[tx(h,'lunch',{amount:35}),tx(h,'ride',{amount:15,category:'Transport'}),tx(h,'waiting',{amount:10,status:'pending'}),tx(h,'box',{amount:500,internalTransfer:true})];h.L.render();h.flush();
 assert.equal(h.L.dailyInsights.insight().headline,'Food took GH₵35.00 of GH₵50.00 today.');assert.match(h.L.dailyInsights.insight().label,/Today in Lumo/);assert.equal(view(h).querySelectorAll('[data-home-focus="story"]').length,0);clean(h);
});
check('a transfer-led or uncategorised day never invents a purchase purpose',()=>{
 const h=fixture();h.L.state.txs=[tx(h,'friend',{amount:100,category:'Transfers'}),tx(h,'lunch',{amount:35})];h.L.render();h.flush();assert.equal(h.L.dailyInsights.insight().headline,'GH₵100.00 sent in transfers today.');
 h.L.state.txs=[tx(h,'unknown',{amount:60,category:'Uncategorised'})];h.L.render();h.flush();assert.equal(h.L.dailyInsights.insight().headline,'GH₵60.00 paid out today still needs a category.');clean(h);
});
check('equal category totals are explained without claiming a unique largest category',()=>{
 const h=fixture();h.L.state.txs=[tx(h,'lunch',{amount:30}),tx(h,'ride',{amount:30,category:'Transport'})];h.L.render();h.flush();assert.equal(h.L.dailyInsights.insight().headline,'Food and Transport: GH₵30.00 each today.');
 h.L.state.txs.push(tx(h,'print',{amount:30,category:'Study'}));h.L.render();h.flush();assert.equal(h.L.dailyInsights.insight().headline,'3 categories tied at GH₵30.00 each today.');clean(h);
});
check('Budget shortfalls remain available in Updates',()=>{
 const h=fixture();h.L.state.balance=300;h.L.render();h.flush();assert.equal(h.L.dailyInsights.insight().headline,'GH₵50.00 of your saved Budget is uncovered.');h.L.go('notifications');h.flush();click(h,"L.go('makeRoom')");assert.equal(h.L.route,'makeRoom');clean(h);
});
check('seven-day spending remains available without the retired Home story shelf',()=>{
 const h=fixture();h.L.state.txs=[tx(h,'meal',{date:new Date(h.context.Date.now()-86400000).toISOString(),amount:35})];h.L.render();h.flush();assert.equal(view(h).querySelector('.home-money-story'),null);assert.equal(h.L.homeStorySummary().total,35);clean(h);
});
check('the optional first-Budget example lives in Plan details',()=>{
 const h=fixture();h.L.state.firstBudgetPayoff={status:'ready',amount:80};const before=financial(h);h.L.render();h.flush();assert.equal(view(h).querySelectorAll('[data-home-focus="story"]').length,0);assert.equal(view(h).querySelector('.home-budget-payoff'),null);
 h.L.state.balance=300;h.L.render();h.flush();assert.match(h.L.dailyInsights.insight().headline,/GH₵50.00.*uncovered/);assert.equal(h.L.state.firstBudgetPayoff.status,'ready');
 h.L.state.balance=before.balance;h.L.render();h.flush();h.L.openTab('plan');h.flush();click(h,'L.openFirstBudgetExample()');assert.equal(h.L.route,'firstBudgetExample');assert(h.L.taskSheet.active);assert.match(view(h).textContent,/Example only/);assert.deepEqual(financial(h),before);h.L.closeTask();h.flushHistory();h.flush();assert.equal(h.L.route,'plan');assert(!view(h).querySelector('.home-budget-payoff'));clean(h);
});
check('expired Budget Home and update actions initialise the existing period editor',()=>{
 const h=fixture(),yesterday=new Date(h.context.Date.now()-86400000).toISOString().slice(0,10);h.L.state.planHorizon={mode:'date',date:yesterday};h.L.render();h.flush();
 assert.match(h.L.dailyInsights.insight().headline,/Budget period has ended/);h.L.openBudgetCycle();h.flush();assert.equal(h.L.route,'budgetCycle');assert(h.L.state.budgetCycleDraft);assert(h.document.getElementById('cycle-end'));clean(h);
});
check('invalid dates do not invent expiry statements or crash Home',()=>{
 const h=fixture();h.L.state.planHorizon={mode:'date',date:'2026-99-99'};assert.doesNotThrow(()=>h.L.dailyInsights.insight());assert.notEqual(h.L.dailyInsights.insight().kind,'period');clean(h);
});
check('confirmed external receipts are persistent, one per transaction, and never move money',()=>{
 const h=fixture(),now=h.context.Date.now();h.L.state.txs=[tx(h,'credit',{type:'in',amount:300}),tx(h,'waiting',{type:'in',status:'pending'}),tx(h,'box',{type:'in',internalTransfer:true}),tx(h,'refund',{type:'in',originalId:'old'}),tx(h,'failedCredit',{type:'in',status:'failed'})];
 const before=financial(h);for(let i=0;i<5;i++){h.L.dailyInsights.sync(now);h.L.render();h.flush();}
 const events=h.L.dailyInsights.events();assert.equal(events.filter(e=>e.kind==='receipt').length,1);assert.equal(events[0].txId,'credit');assert.match(events[0].title,/GH₵300\.00 received/);assert.deepEqual(financial(h),before);assert([...h.store.keys()].every(key=>key===storageKey));clean(h);
});
check('pending resolution is a single important status and does not duplicate incoming receipt',()=>{
 const h=fixture();const outgoing=h.L.addTx({type:'out',name:'Campus Print',amount:40,status:'pending',draftId:'pending-out'});assert.equal(h.L.dailyInsights.events().length,0);h.L.resolveTx(outgoing.id,'failed');h.L.resolveTx(outgoing.id,'failed');
 const incoming=h.L.addTx({type:'in',name:'Mobile money',amount:80,status:'pending',draftId:'pending-in'});h.L.resolveTx(incoming.id,'success');for(let i=0;i<3;i++)h.L.dailyInsights.sync();
 assert.equal(h.L.dailyInsights.events().filter(e=>e.txId===outgoing.id).length,1);assert.equal(h.L.dailyInsights.events().filter(e=>e.txId===incoming.id).length,1);assert(h.L.dailyInsights.events().every(e=>e.critical));assert.match(h.L.dailyInsights.events().find(e=>e.txId===incoming.id).title,/Incoming money confirmed/);assert.equal(h.L.state.balance,680);clean(h);
});
check('money update preference suppresses optional receipt events but retains important resolution',()=>{
 const h=fixture();h.L.state.prefs.payment=false;h.L.addTx({type:'in',name:'Bank',amount:20,status:'success'});assert.equal(h.L.dailyInsights.events().length,0);
 const pending=h.L.addTx({type:'out',name:'Unresolved payment',amount:30,status:'pending'});h.L.resolveTx(pending.id,'failed');assert.equal(h.L.dailyInsights.events().length,1);assert(h.L.dailyInsights.events()[0].critical);clean(h);
});
check('inbox retention does not re-create older receipt events on later renders',()=>{
 const h=fixture();h.L.state.txs=Array.from({length:75},(_,i)=>tx(h,'credit-'+i,{type:'in',amount:i+1}));h.L.dailyInsights.sync();assert.equal(h.L.dailyInsights.events().length,60);const keys=h.L.dailyInsights.events().map(e=>e.key);h.L.markDailyUpdatesRead();for(let i=0;i<5;i++)h.L.dailyInsights.sync();assert.deepEqual(copy(h.L.dailyInsights.events().map(e=>e.key)),copy(keys));assert.equal(h.L.dailyInsights.unread(),0);clean(h);
});
check('quiet hours hold optional badges without hiding the inbox or important account status',()=>{
 const h=fixture(),p=h.L.dailyInsights.prefs();p.quiet=true;p.quietStart='22:00';p.quietEnd='07:00';h.L.state.txs=[tx(h,'credit',{type:'in'})];h.L.dailyInsights.sync();
 assert.equal(h.L.dailyInsights.isQuiet(Date.parse('2026-10-23T23:00:00Z')),true);assert.equal(h.L.dailyInsights.isQuiet(Date.parse('2026-10-23T07:00:00Z')),false);assert.equal(h.L.dailyInsights.unread(Date.parse('2026-10-23T23:00:00Z')),0);assert.equal(h.L.dailyInsights.events().length,1);
 const pending=h.L.addTx({type:'out',name:'Still checking',amount:10,status:'pending'});h.L.resolveTx(pending.id,'failed');assert.equal(h.L.dailyInsights.unread(Date.parse('2026-10-23T23:00:00Z')),1);clean(h);
});
check('weekly story is opt-in, uses the chosen local time and appears once per week',()=>{
 const h=fixture(),now=Date.parse('2026-10-23T18:15:00Z');h.L.state.txs=[tx(h,'weekFood',{date:'2026-10-21T10:00:00Z',amount:80}),tx(h,'weekData',{date:'2026-10-22T10:00:00Z',amount:20,category:'Data'})];h.L.dailyInsights.sync(now);assert(!h.L.dailyInsights.events().some(e=>e.kind==='weekly'));
 const p=h.L.dailyInsights.prefs();p.weekly=true;p.reviewDay=5;p.reviewTime='18:00';h.L.dailyInsights.sync(Date.parse('2026-10-23T17:59:00Z'));assert(!h.L.dailyInsights.events().some(e=>e.kind==='weekly'));h.L.dailyInsights.sync(now);h.L.dailyInsights.sync(now+1000);
 const weekly=h.L.dailyInsights.events().filter(e=>e.kind==='weekly');assert.equal(weekly.length,1);assert.match(weekly[0].body,/GH₵100\.00 paid out · 16 Oct 2026 to 22 Oct 2026/);assert.match(weekly[0].body,/Food took the largest share/);assert.equal(weekly[0].end,Date.parse('2026-10-22T23:59:59.999Z'));clean(h);
});
check('due-cost insight and its editor remain available without a Home shelf',()=>{
 const h=fixture(),{L}=h,tomorrow=new Date(h.context.Date.now()+86400000).toISOString().slice(0,10);
 L.state.essentials.push({id:'data',name:'Data',amount:40,paid:0,externalPaid:0,coverageVersion:1,date:tomorrow});const before=financial(h);L.render();h.flush();
 assert.equal(view(h).querySelectorAll('[data-home-focus="story"]').length,0);assert.match(h.L.dailyInsights.insight().headline,/GH₵40\.00 for Data is due tomorrow/);assert.match(L.dailyInsights.insight().support,/Already included in your Budget/);
 L.openDueBudgetCost('data');h.flush();assert.equal(L.route,'essentialEdit');assert.equal(L.params.id,'data');assert.equal(h.document.getElementById('essName').value,'Data & airtime');assert.deepEqual(financial(h),before);clean(h);
});
check('due insights use remaining unpaid costs after actual and pending coverage',()=>{
 const h=fixture(),{L}=h,now=Date.parse('2026-10-23T12:00:00Z');L.state.essentials=[
  {id:'paid',name:'Paid item',amount:50,paid:50,date:'2026-10-23',externalPaid:50,coverageVersion:1},
  {id:'data',name:'Data',amount:40,paid:0,date:'2026-10-24',externalPaid:0,coverageVersion:1}
 ];
 L.state.txs=[tx(h,'part',{status:'pending',essentialId:'data',amount:15})];let i=L.dailyInsights.insight(now);assert.equal(i.kind,'due');assert.match(i.headline,/GH₵25\.00 for Data/);
 L.state.txs[0].amount=40;i=L.dailyInsights.insight(now);assert.notEqual(i.kind,'due');assert(!/Paid item/.test(i.headline));clean(h);
});
check('due dates respect Ghana midnight, real calendar dates and urgent Budget priorities',()=>{
 const h=fixture(),{L}=h;L.state.essentials=[{id:'data',name:'Data',amount:40,paid:0,date:'2026-10-24'}];
 assert.match(L.dailyInsights.insight(Date.parse('2026-10-23T23:59:59.999Z')).headline,/due tomorrow/);assert.match(L.dailyInsights.insight(Date.parse('2026-10-24T00:00:00Z')).headline,/due today/);assert.match(L.dailyInsights.insight(Date.parse('2026-10-25T00:00:00Z')).headline,/was due 24 Oct 2026/);
 L.state.essentials[0].date='2026-02-30';assert.notEqual(L.dailyInsights.insight(Date.parse('2026-10-23T12:00:00Z')).kind,'due');
 L.state.essentials[0].date='2026-10-24';L.state.balance=20;assert.equal(L.dailyInsights.insight(Date.parse('2026-10-23T12:00:00Z')).kind,'gap');
 L.state.balance=600;L.state.planHorizon={mode:'date',date:'2026-10-22'};assert.equal(L.dailyInsights.insight(Date.parse('2026-10-23T12:00:00Z')).kind,'period');clean(h);
});
check('due costs outside the immediate horizon or removed after render never open a new item by accident',()=>{
 const h=fixture(),{L}=h,now=Date.parse('2026-10-23T12:00:00Z');L.state.essentials=[{id:'data',name:'Data',amount:40,paid:0,date:'2026-11-24'}];assert.notEqual(L.dailyInsights.insight(now).kind,'due');
 L.state.essentials=[];assert.equal(L.openDueBudgetCost('data'),false);assert.equal(L.route,'plan');assert.equal(L.params.id,undefined);clean(h);
});
check('a missed weekly review waits for the next visit and keeps its complete dated range',()=>{
 const h=fixture(),{L}=h,p=L.dailyInsights.prefs();p.weekly=true;p.reviewDay=0;p.reviewTime='18:00';
 L.dailyInsights.sync(Date.parse('2026-10-24T10:00:00Z'));
 L.state.txs=[tx(h,'sat',{date:'2026-10-24T23:59:59.999Z',amount:35}),tx(h,'sun',{date:'2026-10-25T10:00:00Z',amount:80}),tx(h,'mon',{date:'2026-10-26T08:00:00Z',amount:90})];
 const now=Date.parse('2026-10-26T09:00:00Z');L.dailyInsights.sync(now);L.dailyInsights.sync(now+1000);const events=L.dailyInsights.events().filter(e=>e.kind==='weekly');assert.equal(events.length,1);const e=events[0];
 assert.equal(e.start,Date.parse('2026-10-18T00:00:00Z'));assert.equal(e.end,Date.parse('2026-10-24T23:59:59.999Z'));assert.match(e.body,/GH₵35\.00 paid out · 18 Oct 2026 to 24 Oct 2026/);assert.equal(e.reviewAt,Date.parse('2026-10-25T18:00:00Z'));h.advance(now-h.context.Date.now());L.openDailyUpdate(e.id);h.flush();assert.equal(L.route,'dailyMoneyStory');assert.equal(L.params.start,e.start);assert.equal(L.params.end,e.end);assert.match(view(h).querySelector('.daily-story-conclusion').textContent,/35\.00/);assert.doesNotMatch(view(h).querySelector('.daily-story-conclusion').textContent,/115\.00|205\.00/);clean(h);
});
check('weekly opt-in and schedule changes do not backfill pre-choice reviews',()=>{
 const h=fixture(),{L}=h,p=L.dailyInsights.prefs();p.weekly=true;p.reviewDay=0;p.reviewTime='18:00';L.dailyInsights.sync(Date.parse('2026-10-26T09:00:00Z'));assert.equal(L.dailyInsights.events().filter(e=>e.kind==='weekly').length,0);
 L.dailyInsights.sync(Date.parse('2026-11-01T18:00:00Z'));assert.equal(L.dailyInsights.events().filter(e=>e.kind==='weekly').length,1);
 L.dailyInsights.prefs().weekly=false;L.dailyInsights.sync(Date.parse('2026-11-02T09:00:00Z'));L.dailyInsights.prefs().weekly=true;L.dailyInsights.sync(Date.parse('2026-11-09T09:00:00Z'));assert.equal(L.dailyInsights.events().filter(e=>e.kind==='weekly').length,1);
 Object.assign(L.dailyInsights.prefs(),{reviewDay:2,reviewTime:'08:00'});L.dailyInsights.sync(Date.parse('2026-11-11T09:00:00Z'));assert.equal(L.dailyInsights.events().filter(e=>e.kind==='weekly').length,1);
 L.dailyInsights.sync(Date.parse('2026-11-18T08:00:00Z'));assert.equal(L.dailyInsights.events().filter(e=>e.kind==='weekly').length,2);clean(h);
});
check('a long absence creates one latest review, with quiet-hour and insights preferences preserved',()=>{
 const h=fixture(),{L}=h,p=L.dailyInsights.prefs();p.weekly=true;p.reviewDay=0;p.reviewTime='18:00';p.quiet=true;p.quietStart='22:00';p.quietEnd='07:00';L.dailyInsights.sync(Date.parse('2026-10-24T10:00:00Z'));
 L.dailyInsights.sync(Date.parse('2026-11-23T23:00:00Z'));let events=L.dailyInsights.events().filter(e=>e.kind==='weekly');assert.equal(events.length,1);assert.equal(events[0].reviewAt,Date.parse('2026-11-22T18:00:00Z'));assert.equal(events[0].quiet,true);assert.equal(L.dailyInsights.unread(Date.parse('2026-11-23T23:00:00Z')),0);
 L.state.prefs.insights=false;L.dailyInsights.sync(Date.parse('2026-11-30T09:00:00Z'));assert.equal(L.dailyInsights.events().filter(e=>e.kind==='weekly').length,1);L.state.prefs.insights=true;L.dailyInsights.sync(Date.parse('2026-12-01T09:00:00Z'));assert.equal(L.dailyInsights.events().filter(e=>e.kind==='weekly').length,1);clean(h);
});
check('weekly details preserve the event range instead of silently including later payments',()=>{
 const h=fixture(),end=h.context.Date.now(),start=end-2*86400000;h.L.state.txs=[tx(h,'prior',{date:new Date(end-3600000).toISOString(),amount:50}),tx(h,'later',{date:new Date(end+1000).toISOString(),amount:200})];h.L.go('dailyMoneyStory',{period:'thisWeek',start,end});h.flush();assert.match(view(h).querySelector('.daily-story-conclusion').textContent,/50\.00/);assert.doesNotMatch(view(h).querySelector('.daily-story-conclusion').textContent,/250\.00/);clean(h);
});
check('asking about a historical story carries its displayed dates into Chat',()=>{
 const h=fixture(),now=h.context.Date.now(),endDay=new Date(now-7*86400000).toISOString().slice(0,10),startDay=new Date(now-13*86400000).toISOString().slice(0,10),start=Date.parse(startDay+'T00:00:00Z'),end=Date.parse(endDay+'T23:59:59.999Z');
 h.L.state.txs=[tx(h,'historical',{date:new Date(start+3600000).toISOString(),amount:35}),tx(h,'current',{date:new Date(now).toISOString(),amount:80})];
 h.L.go('dailyMoneyStory',{period:'thisWeek',start,end});h.flush();const ask=view(h).querySelectorAll('button').find(b=>b.textContent.trim()==='Ask about this');assert(ask);ask.click();h.flush();
 assert.equal(h.L.route,'chat');const reply=h.L.state.chats.at(-1);assert.equal(reply.q,`Show spending from ${startDay} to ${endDay}`);assert.equal(reply.intent,'calendarSpending');assert.match(reply.headline,/GH₵35\.00/);assert.doesNotMatch(reply.headline,/GH₵80\.00|GH₵115\.00/);clean(h);
});
check('Budget gap events use actual changes, do not alert at every render, and honour plan reminders',()=>{
 const h=fixture();h.L.state.balance=300;h.L.dailyInsights.sync();assert.equal(h.L.dailyInsights.events().filter(e=>e.kind==='budget').length,1);assert.match(h.L.dailyInsights.events()[0].body,/GH₵50\.00/);for(let i=0;i<3;i++)h.L.dailyInsights.sync();assert.equal(h.L.dailyInsights.events().length,1);
 h.L.state.accountPrefs.plan=false;h.L.state.balance=200;h.L.dailyInsights.sync();assert.equal(h.L.dailyInsights.events().length,1);clean(h);
});
check('notification details, read state and saved account notices remain available',()=>{
 const h=fixture();h.L.state.notifications=[{title:'Review your account',message:'Your saved account notice remains available.',type:'security',read:false}];h.L.state.txs=[tx(h,'credit',{type:'in'})];h.L.dailyInsights.sync();h.L.go('notifications');h.flush();assert.match(view(h).textContent,/Review your account/);assert.match(view(h).textContent,/Push, SMS and email are not connected/);
 click(h,'L.openSavedAccountNotice(0)');assert.equal(h.L.route,'dailyAccountNotice');assert.match(view(h).textContent,/saved account notice remains available/);assert.equal(h.L.state.notifications[0].read,true);h.L.back();h.flushHistory();h.flush();const event=h.L.dailyInsights.events()[0];h.L.openDailyUpdate(event.id);h.flush();assert.equal(h.L.route,'txDetail');assert.equal(h.L.params.id,'credit');assert(event.read);clean(h);
});
check('private update previews omit amounts while preserving the underlying receipt',()=>{
 const h=fixture();h.L.state.txs=[tx(h,'credit',{type:'in',amount:280})];h.L.dailyInsights.sync();h.L.dailyInsights.prefs().privateUpdates=true;h.L.go('notifications');h.flush();assert.match(view(h).textContent,/Incoming payment update/);assert.doesNotMatch(view(h).textContent,/280\.00/);h.L.openDailyUpdate(h.L.dailyInsights.events()[0].id);h.flush();assert.equal(h.L.route,'txDetail');assert.match(view(h).textContent,/280\.00/);clean(h);
});
check('preferences validate times, preserve entries on error and save only on explicit submission',()=>{
 const h=fixture();h.L.go('dailyUpdatePrefs');h.flush();const original=copy(h.L.dailyInsights.prefs());h.set('daily-review-day','2');h.set('daily-review-time','19:30');h.set('daily-quiet-start','22:00');h.set('daily-quiet-end','22:00');h.document.getElementById('daily-quiet-enabled').checked=true;h.submit(view(h).querySelector('form'));h.flush();assert.equal(h.L.route,'dailyUpdatePrefs');assert.deepEqual(copy(h.L.dailyInsights.prefs()),original);assert.equal(h.document.getElementById('daily-review-time').value,'19:30');assert.match(h.document.getElementById('error').textContent,/different start and end/);
 h.set('daily-quiet-end','07:00');h.document.getElementById('daily-weekly-enabled').checked=true;h.document.getElementById('daily-private-updates').checked=true;h.submit(view(h).querySelector('form'));h.flush();assert.equal(h.L.route,'notificationPrefs');assert.equal(h.L.dailyInsights.prefs().reviewDay,2);assert.equal(h.L.dailyInsights.prefs().reviewTime,'19:30');assert(h.L.dailyInsights.prefs().weekly);assert(h.L.dailyInsights.prefs().privateUpdates);assert.match(view(h).textContent,/Account notices and delivery/);clean(h);
});
check('explicit preference Cancel restores saved values while closing retains an unfinished edit',()=>{
 const h=fixture(),{L}=h,original=copy(L.dailyInsights.prefs());L.go('notificationPrefs');L.go('dailyUpdatePrefs');h.flush();
 h.set('daily-review-day','2');h.set('daily-review-time','19:30');h.document.getElementById('daily-weekly-enabled').checked=true;click(h,'L.cancelDailyUpdatePrefs()');assert.equal(L.route,'notificationPrefs');assert.deepEqual(copy(L.dailyInsights.prefs()),original);
 L.go('dailyUpdatePrefs');h.flush();assert.equal(h.document.getElementById('daily-review-day').value,String(original.reviewDay));assert.equal(h.document.getElementById('daily-review-time').value,original.reviewTime);assert.equal(h.document.getElementById('daily-weekly-enabled').checked,original.weekly);
 h.set('daily-review-time','20:45');L.closeTask();h.flushHistory();h.flush();L.go('dailyUpdatePrefs');h.flush();assert.equal(h.document.getElementById('daily-review-time').value,'20:45');assert.deepEqual(copy(L.dailyInsights.prefs()),original);clean(h);
});
check('saving notification preferences completes the form without restoring an earlier edit',()=>{
 const h=fixture(),{L}=h;L.go('dailyUpdatePrefs');h.flush();h.set('daily-review-time','19:30');h.submit(view(h).querySelector('form'));h.flush();assert.equal(L.route,'notificationPrefs');
 L.dailyInsights.prefs().reviewTime='18:15';L.save();L.go('dailyUpdatePrefs');h.flush();assert.equal(h.document.getElementById('daily-review-time').value,'18:15');clean(h);
});
check('no event data is created for a locked account and another edition key is untouched',()=>{
 const h=fixture(),sentinel='untouched',foreignKey=storageKey==='lumo-minna-edition-v1'?'lumo-everyday-edition-v1':'lumo-minna-edition-v1';h.store.set(foreignKey,sentinel);h.L.state.locked=true;h.L.state.txs=[tx(h,'credit',{type:'in'})];h.L.dailyInsights.sync();assert.equal(h.L.dailyInsights.events().length,0);assert.equal(h.store.get(foreignKey),sentinel);clean(h);
});
console.log(passed+' daily insight and in-app update checks passed; '+failed+' failed.');
