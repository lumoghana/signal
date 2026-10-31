/* Actual shipped Signal presentation: existing facts, privacy and authority.
   Native journey suites own deeper financial/authentication coverage. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const primaryLabel=button=>(button.querySelector('.signal-action-label')||button).textContent.trim();
const settle=h=>{h.flushHistory();h.flush();};
const view=h=>h.document.getElementById('view');
const nav=h=>h.document.getElementById('nav');
const money=L=>JSON.stringify([L.state.balance,L.state.accounts,L.state.txs,L.state.essentials,L.state.goals,L.state.requests,L.state.virtualCards,L.state.groupMoney?.items||[],L.state.savingsHacks]);
const date=(h,days=0)=>new h.context.Date(h.context.Date.now()+days*86400000).toISOString().slice(0,10);
function fixture(){
 const h=createHarness({clock:true,deferHistory:true}),L=h.L;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:1000,txs:[],paymentDraft:null,chats:[],requests:[],essentials:[{id:'food',name:'Food',amount:200,paid:0,externalPaid:0,coverageVersion:1}],goals:[{id:'buffer',name:'Emergency buffer',allocated:120,target:600,boxVersion:2}],allowance:{amount:4000,date:date(h,10)},planHorizon:{mode:'allowance',date:date(h,10)},planSaved:true});
 L.openTab('home');L.showPrivateMoney();L.render();settle(h);return h;
}
const clean=h=>assert.deepEqual(h.errors,[]);
const originalAvatar=/^\/brand\/lumo-avatar-icon-(?:192|512)\.png$/;
function checkOriginalAvatars(root,label){
 const images=root.querySelectorAll('img'),avatars=images.filter(img=>/lumo-avatar|\/assets\/signal\/lux-/.test(img.getAttribute('src')||'')||img.closest('.mono-brand-avatar,.mono-pause-face,.signal-planning-art,.signal-ambassador-character')||img.classList.contains('signal-lux')||img.classList.contains('signal-finance-lux'));
 assert(avatars.length,label+' exposes its Lumo identity');
 for(const img of avatars){assert.match(img.getAttribute('src'),originalAvatar,label+' uses the exact original 2D asset');assert(!/lux-/.test(img.getAttribute('srcset')||''),label+' has no stale 3D responsive source');}
 assert(!images.some(img=>/\/assets\/signal\/lux-/.test(img.getAttribute('src')||'')),label+' contains no rendered old Lux');
 return avatars;
}

test('Signal Home uses original brand composition with real available, planned and saved money',()=>{
 const h=fixture(),L=h.L,before=money(L),root=view(h).querySelector('.signal-home');
 assert(root);const classes=root.children.map(n=>n.className);
 const order=['signal-money-card','signal-home-actions','signal-buddy','signal-home-destinations'].map(name=>classes.findIndex(value=>value.split(/\s+/).includes(name)));
 assert(order.every(n=>n>=0));assert(order.every((n,i)=>!i||n>order[i-1]));
 assert.equal(root.querySelectorAll('.signal-lux').length,2,'The original 2D avatar appears in the balance and contextual insight');
 assert.equal(root.querySelectorAll('img').filter(n=>n.getAttribute('src')==='/brand/lumo-avatar-icon-512.png').length,2);
 assert(root.querySelector('.signal-wordmark'));assert.equal(root.querySelector('.signal-money-label').textContent,'Room to spend');
 assert.equal(L.accountBalances().available,1000);assert.equal(h.document.getElementById('overview-balance').textContent,'₵1,000');
 assert.equal(L.balances().essentials+L.balances().allocated,200);assert.equal(h.document.getElementById('signal-planned-costs').textContent,'₵200');
 assert.equal(h.document.getElementById('overview-room').textContent,'₵800');
 assert.equal(L.money(1000),'GH₵1,000.00','The shared precise formatter stays unchanged');
 assert.equal(h.document.getElementById('overview-savings').textContent,'₵120');
 const prompt=L.monoConversation.current(),insight=root.querySelector('[data-mono-conversation-insight]');
 assert.equal(insight.textContent,prompt.insight+prompt.detail,'The reference composition keeps the native factual insight');
 const boxes=root.querySelector('.mono-boxes-card'),saved=boxes.querySelector('.signal-saved-label');
 assert.equal(saved.textContent.trim(),'saved');assert.equal(saved.parentNode,boxes.querySelector('.signal-savings-line'));
 assert.equal(h.document.getElementById('overview-savings').querySelector('.signal-saved-label'),null,'The refreshable private amount does not own its static label');
 assert.equal(boxes.querySelector('.signal-destination-helper').textContent,'Save for what matters');
 assert.match(boxes.textContent,/1 box · Total saved/,'The actual box count remains accessible');
 assert.equal(root.querySelector('.signal-story-card .signal-destination-helper').textContent,'See where your money goes');
 assert.equal(money(L),before);clean(h);
});

test('Signal planned costs and all existing Home facts hide without raw financial data and refresh without navigation',()=>{
 const h=fixture(),L=h.L;L.state.balance=1000.01;L.state.essentials[0].amount=234.56;L.state.goals[0].allocated=120.57;L.render();settle(h);const before=money(L);
 const planned=h.document.getElementById('signal-planned-costs');assert.equal(planned.textContent,'₵234.56');
 assert.equal(h.document.getElementById('overview-balance').textContent,'₵1,000.01');assert.equal(h.document.getElementById('overview-room').textContent,'₵765.45');
 assert.equal(h.document.getElementById('overview-savings').textContent,'₵120.57','Nonzero pesewas remain in the compact Home formatter');
 L.hidePrivateMoney();for(const id of ['overview-room','overview-balance','overview-savings','signal-planned-costs']){const n=h.document.getElementById(id);assert(n.querySelector('.money-mask'));assert(!/[0-9]/.test(n.textContent));assert(!/234\.56|120\.57|765\.45|1,000\.01/.test(n.outerHTML));}
 assert(view(h).querySelector('[data-mono-conversation-insight] .money-mask'),'The factual Lux insight hides with the balances');
 assert(h.document.getElementById('balance-eye').getAttribute('aria-controls').split(/\s+/).includes('signal-planned-costs'));
 L.showPrivateMoney();assert.equal(planned.textContent,'₵234.56');assert.equal(h.document.getElementById('overview-balance').textContent,'₵1,000.01');assert.equal(h.document.getElementById('overview-room').textContent,'₵765.45');assert.equal(h.document.getElementById('overview-savings').textContent,'₵120.57');assert.equal(money(L),before);
 L.state.essentials[0].amount=250.02;const changed=money(L);L.refreshPrivateMoney();assert.equal(planned.textContent,'₵250.02');assert.equal(h.document.getElementById('overview-room').textContent,'₵749.99');assert.equal(h.document.getElementById('overview-balance').textContent,'₵1,000.01');assert.equal(money(L),changed);clean(h);
});

test('Signal savings labels and compact amounts survive repeated privacy refresh and native Menu return',()=>{
 const h=fixture(),L=h.L;L.state.goals[0].allocated=125.03;L.render();settle(h);const before=money(L);
 const check=()=>{
  assert.equal(h.document.getElementById('overview-savings').textContent,'₵125.03');
  assert.equal(view(h).querySelectorAll('.signal-saved-label').length,1);
  assert.equal(view(h).querySelector('.signal-saved-label').textContent.trim(),'saved');
  const prompt=L.monoConversation.current();assert.equal(view(h).querySelector('[data-mono-conversation-insight]').textContent,prompt.insight+prompt.detail);
 };
 for(let i=0;i<3;i++){L.refreshPrivateMoney();L.hidePrivateMoney();assert(h.document.getElementById('overview-savings').querySelector('.money-mask'));L.showPrivateMoney();check();}
 nav(h).querySelectorAll('.nav-item')[2].click();settle(h);assert.equal(L.route,'monoMenu');h.key('Escape');settle(h);assert.equal(L.route,'home');check();
 const boxes=view(h).querySelector('.everyday-boxes-open');boxes.click();settle(h);assert.equal(L.route,'goals');assert.equal(h.history.state.route,'goals');assert.equal(money(L),before);clean(h);
});

test('Signal information disclosure retains native budget and date controls without moving money',()=>{
 const h=fixture(),L=h.L,before=money(L);
 let info=view(h).querySelector('.signal-plan-details');assert(info);assert(!info.hasAttribute('open'));
 assert.equal(info.querySelector('summary').getAttribute('aria-label'),'Budget information and dates');
 info.querySelector('summary').click();settle(h);assert(info.hasAttribute('open'));assert.equal(money(L),before);
 const budget=info.querySelector('.mono-budget-link');assert.equal(budget.getAttribute('onclick'),"L.budgetReadability?.rememberItems(true);L.openTab('plan')");budget.click();settle(h);assert.equal(L.route,'plan');assert.equal(money(L),before);
 L.openTab('home');L.state.planHorizon=null;L.state.allowance.date='';L.render();settle(h);const undated=money(L);
 info=view(h).querySelector('.signal-plan-details');info.querySelector('summary').click();settle(h);assert(info.hasAttribute('open'));
 const dates=info.querySelector('.mono-budget-date-action');assert(dates);assert.equal(dates.textContent,'Add dates');assert.equal(dates.getAttribute('onclick'),"L.go('planPeriod')");dates.click();settle(h);assert.equal(L.route,'planPeriod');assert.equal(L.taskSheet.parentRoute,'home');assert.equal(money(L),undated);clean(h);
});

test('expected allowance and an incoming IOU due tomorrow do not alter Signal balances or planned costs',()=>{
 const h=fixture(),L=h.L,G=L.moneyLife,before=JSON.stringify(L.balances()),planned=h.document.getElementById('signal-planned-costs').textContent;
 const total=G.holdings().total;G.createDebt({direction:'owed',person:'Abena',amount:9000,dueDate:date(h,1)},L.id('signal-iou'));
 L.state.allowance.amount=50000;L.render();settle(h);
 assert.equal(JSON.stringify(L.balances()),before);assert.equal(G.holdings().total,total);assert.equal(G.holdings().expectedIOUs,9000);
 assert.equal(h.document.getElementById('signal-planned-costs').textContent,planned);assert(!view(h).querySelector('.signal-money-card').textContent.includes('9,000'));clean(h);
});

test('Signal Home actions retain full Payments, native funding and group collections controllers',()=>{
 for(const [label,route]of [['Add money','addMoney'],['Pay','pay'],['Collect','groupMoneyHome']]){
  const h=fixture(),L=h.L,before=money(L),button=view(h).querySelector('.signal-home-actions').querySelectorAll('button').find(n=>primaryLabel(n)===label);assert(button);button.click();settle(h);
  assert.equal(L.route,route);if(route==='pay'){assert(!L.taskSheet.active);assert(view(h).querySelector('.pay-tabs'));}else assert.equal(L.taskSheet.parentRoute,'home');
  assert.equal(money(L),before);clean(h);
 }
});

test('Signal Ask Lumo keeps the exact retained navigation controls through native task close',()=>{
 const h=fixture(),L=h.L,before=money(L),controls=nav(h).querySelectorAll('.nav-item');
 assert.deepEqual(controls.map(n=>n.textContent.trim()),['Home','Ask Lumo','Menu']);
 view(h).querySelector('.signal-home-actions button').click();settle(h);assert(L.taskSheet.active);assert(nav(h).inert);
 L.closeTask();settle(h);assert.equal(L.route,'home');assert.deepEqual(nav(h).querySelectorAll('.nav-item'),controls);assert(!nav(h).inert);
 controls[1].click();settle(h);assert.equal(L.route,'chat');assert.equal(nav(h).querySelector('[aria-current="page"]').textContent,'Ask Lumo');
 assert.deepEqual(nav(h).querySelectorAll('.nav-item'),controls);assert.equal(money(L),before);clean(h);
});

test('Signal root account controls open Profile and restore their native screen, focus and money',()=>{
 for(const route of ['plan','pay','moneyStoryHome']){
  const h=fixture(),L=h.L;L.openTab(route);settle(h);
  assert.equal(L.route,route);const parent=view(h),controls=nav(h).querySelectorAll('.nav-item'),trigger=parent.querySelector('.signal-root-profile');
  assert(trigger,route+' has the same Profile control as Home');assert.equal(trigger.textContent,'K');
  assert.equal(trigger.getAttribute('onclick'),"L.go('profile')");
  parent.scrollTop=91;trigger.focus();const before=money(L);trigger.click();settle(h);
  assert.equal(L.route,'profile');assert.equal(L.taskSheet.parentRoute,route);assert(nav(h).inert);assert.equal(money(L),before);
  L.closeTask();settle(h);assert.equal(L.route,route);assert.equal(view(h),parent);assert.equal(parent.scrollTop,91);assert(h.document.activeElement===parent.querySelector('.signal-root-profile'),'Focus returns to the current Profile control');
  assert.deepEqual(nav(h).querySelectorAll('.nav-item'),controls);assert(!nav(h).inert);assert.equal(h.history.state.route,route);assert.equal(money(L),before);clean(h);
 }
});

test('Signal direct Money Story tile preserves native dashboard history and confirmed facts',()=>{
 const h=fixture(),L=h.L,before=money(L);view(h).querySelector('.signal-story-card button').click();settle(h);
 assert.equal(L.route,'moneyStoryHome');assert.equal(h.history.state.route,'moneyStoryHome');assert(view(h).querySelector('[data-money-story-dashboard]'));assert(!L.taskSheet.active);
 h.history.back();settle(h);assert.equal(L.route,'home');assert(view(h).querySelector('.signal-home'));h.history.forward();settle(h);assert.equal(L.route,'moneyStoryHome');assert.equal(money(L),before);clean(h);
});

test('Signal restyles the registered money journeys without removing their native tasks or sample boundaries',()=>{
 const h=fixture(),L=h.L,before=money(L);
 for(const route of ['iouHome','allMoney','recoveryStart','groupMoneyHome','cardsHome','plan','goals','activity','privacy','dataExport'])assert.equal(typeof L.views[route],'function',route+' remains registered');
 for(const route of ['iouHome','allMoney','recoveryStart']){L.go(route);settle(h);assert.equal(L.route,route);assert.equal(L.taskSheet.parentRoute,'home');assert.match(view(h).textContent,/Sample money/);L.closeTask();settle(h);assert.equal(L.route,'home');}
 assert.equal(money(L),before);clean(h);
});

test('Signal family adapters install once and repeated native renders do not duplicate character compositions',()=>{
 const h=fixture(),L=h.L;
 assert(L.signalAccount&&L.signalPlanning&&L.signalPayments);
 const decorate=L.decorateView,render=L.render;
 for(let repeat=0;repeat<2;repeat++)for(const file of ['signal-account.js','signal-planning.js','signal-payments.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist',file),'utf8'),h.context,{filename:file});
 assert.equal(L.decorateView,decorate);assert.equal(L.render,render);
 for(const route of ['pay','addMoney','groupMoneyHome','cardsHome']){
  L.openTab('home');settle(h);if(['pay','cardsHome'].includes(route))L.openTab(route);else L.go(route);settle(h);
  const before=money(L),count=view(h).querySelectorAll('.signal-finance-lux').length;
  assert(count>0,route+' has its Signal composition');
  L.render();settle(h);L.render();settle(h);assert.equal(view(h).querySelectorAll('.signal-finance-lux').length,count);assert.equal(money(L),before);
  if(L.taskSheet.active){L.closeTask();settle(h);}
 }
 clean(h);
});

test('Signal family composition preserves submitted facts, native controls and read-only rendering',()=>{
 const h=fixture(),L=h.L;
 for(const route of ['pay','addMoney','groupMoneyHome','cardsHome','plan','iouHome','allMoney','profile','privacy']){
  L.openTab('home');settle(h);if(['pay','cardsHome','plan'].includes(route))L.openTab(route);else L.go(route);settle(h);
  const before=money(L),controls=()=>view(h).querySelectorAll('button,input,select,textarea,form').map(n=>[n.localName,n.id,n.type,n.getAttribute('onclick'),n.getAttribute('onsubmit'),n.getAttribute('onchange'),n.getAttribute('oninput'),n.required,n.getAttribute('required')]);
  const original=controls();L.render();settle(h);assert.deepEqual(controls(),original,route+' retains its native handlers, field IDs and consent');assert.equal(money(L),before);
  if(L.taskSheet.active){L.closeTask();settle(h);}
 }
 clean(h);
});

test('bold funding keeps explicit wallet ownership and review without moving money',()=>{
 const h=fixture(),L=h.L;L.openFunding('home');settle(h);const mobile=view(h).querySelectorAll('button').find(n=>n.getAttribute('onclick')==='L.startMomoFunding()');assert(mobile);mobile.click();settle(h);
 assert.equal(L.route,'momoAdd');const before=money(L),form=view(h).querySelector('form'),owned=h.document.getElementById('funding-owned'),amount=h.document.getElementById('funding-amount');
 assert(owned&&owned.hasAttribute('required'));assert(amount&&amount.hasAttribute('required'));assert.equal(form.getAttribute('onsubmit'),'event.preventDefault();L.reviewMomoFunding()');
 assert.equal(view(h).querySelector('.signal-finance-hero'),null,'A working form uses its native amount rather than an advertising banner');assert.equal(money(L),before);clean(h);
});

test('bold collection and card compositions retain literal independent balances and functional status icons',()=>{
 const h=fixture(),L=h.L,before=money(L);L.go('groupMoneyHome');settle(h);
 for(const handler of ['L.gm.onePerson()','L.gm.startSplit()','L.gm.startCollection()'])assert(view(h).querySelectorAll('button').some(n=>n.getAttribute('onclick')===handler));
 assert.match(view(h).textContent,/No real money moves/);L.closeTask();settle(h);L.openTab('cardsHome');settle(h);
 assert(view(h).querySelector('.vc-empty-icon svg'),'The actual card symbol remains separate from Lux');assert.equal(view(h).querySelector('.signal-finance-lux').getAttribute('aria-hidden'),'true');
 assert.match(view(h).textContent,/No live card or payment/);assert.equal(money(L),before);clean(h);
});

test('bold payment composition cannot bypass the native Pause, reading gate or separate PIN',()=>{
 const h=fixture(),L=h.L;L.pickMerchant('AK01');h.set('payment-amount',950);h.set('payment-essential','');const before=money(L);L.preparePayment();settle(h);if(L.route==='paymentReview'){L.continuePayment();settle(h);}assert.equal(L.route,'pause');
 const hold=view(h).querySelector('[data-pause-hold]');assert(hold);assert(view(h).querySelector('[data-pause-ring]'));assert(view(h).querySelector('[data-money-slip]'));assert(view(h).querySelector('[data-projection-key]'));assert.equal(view(h).querySelector('.signal-finance-hero'),null);assert.equal(h.document.getElementById('payment-pin'),null);
 hold.click();h.advance(90);settle(h);assert.equal(L.route,'pause');assert.equal(money(L),before);
 h.advance(3810);hold.click();h.advance(90);settle(h);assert.equal(L.route,'authorize');assert(h.document.getElementById('payment-pin'));assert.equal(view(h).querySelector('.signal-finance-hero'),null);assert.equal(money(L),before);clean(h);
});

test('the first empty Signal feed starts at its greeting, then respects retained reading positions and new answers',()=>{
 const h=fixture(),L=h.L,before=money(L);L.openBankingChat();settle(h);
 let thread=h.document.getElementById('chat-thread');assert(thread.querySelector('.hibiscus-chat-feed'));assert.equal(L.state.chats.length,0);assert.equal(thread.scrollTop,0,'The first empty opening reveals the illustrated greeting');
 thread.scrollTop=103;h.set('chatText','Keep my unfinished question');L.captureFormDraft();L.openTab('home');settle(h);L.openBankingChat();settle(h);
 thread=h.document.getElementById('chat-thread');assert.equal(thread.scrollTop,103,'A later empty visit restores the chosen reading position');assert.equal(h.document.getElementById('chatText').value,'Keep my unfinished question');
 const retained=thread;L.go('balances');settle(h);assert.equal(L.taskSheet.parentRoute,'chat');L.closeTask();settle(h);assert.equal(h.document.getElementById('chat-thread'),retained);assert.equal(retained.scrollTop,103,'A native task return cannot restart the introduction');
 L.hibiscusChat.ask('Where did my money go?');settle(h);thread=h.document.getElementById('chat-thread');assert.equal(L.state.chats.length,1);assert(thread.scrollTop>0,'The native new-answer position remains authoritative');
 thread.scrollTop=67;const answers=JSON.stringify(L.state.chats);L.openTab('home');settle(h);L.openBankingChat();settle(h);assert.equal(h.document.getElementById('chat-thread').scrollTop,67);assert.equal(JSON.stringify(L.state.chats),answers);assert.equal(money(L),before);clean(h);
});


test('the original 2D avatar is consistent across money, conversation and account destinations',()=>{
 for(const route of ['home','plan','goals','moneyStoryHome','iouHome','allMoney','addMoney','pay','groupMoneyHome','cardsHome','myQr','help','feedback']){
  const h=fixture(),L=h.L,before=money(L);
  if(['home','plan','moneyStoryHome','pay','cardsHome'].includes(route))L.openTab(route);else L.go(route);settle(h);
  assert.equal(L.route,route,route+' renders its actual destination');checkOriginalAvatars(view(h),route);
  L.render();settle(h);checkOriginalAvatars(view(h),route+' on repeated render');assert.equal(money(L),before);clean(h);
 }
 const h=fixture(),L=h.L,before=money(L);nav(h).querySelectorAll('.nav-item')[2].click();settle(h);assert.equal(L.route,'monoMenu');checkOriginalAvatars(view(h),'Menu');h.key('Escape');settle(h);
 L.openBankingChat();settle(h);checkOriginalAvatars(view(h),'empty Chat');L.hibiscusChat.ask('Where did my money go?');settle(h);
 const answer=view(h).querySelector('.chat-bubble .mono-brand-attribution');assert(answer,'A native answer keeps its Lumo attribution');checkOriginalAvatars(answer,'Chat answer');assert.equal(money(L),before);clean(h);
});

test('Welcome, setup and sample Pause keep the original 2D identity without replacing native controls',()=>{
 const h=createHarness({clock:true,deferHistory:true}),L=h.L;L.render();settle(h);assert.equal(L.route,'welcome');const before=money(L);checkOriginalAvatars(view(h),'Welcome');
 const start=view(h).querySelectorAll('button').find(button=>button.textContent.trim()==='Get started');assert(start);start.click();settle(h);assert.equal(L.route,'samplePause');
 checkOriginalAvatars(view(h),'sample Pause');assert(view(h).querySelector('[data-pause-ring]'));assert(view(h).querySelector('[data-money-slip]'));assert(view(h).querySelector('.mono-pause-hand'),'The native flat raised hand remains separate from the avatar');assert.equal(h.document.getElementById('payment-pin'),null);
 const signup=view(h).querySelectorAll('button').find(button=>button.textContent.trim()==='Start sign-up');assert(signup);signup.click();settle(h);assert.equal(L.route,'phone');assert(h.document.getElementById('phoneNumber'));checkOriginalAvatars(view(h),'setup');assert.equal(money(L),before);
 L.go('ambassadorWelcome');settle(h);assert.equal(L.route,'ambassadorWelcome');checkOriginalAvatars(view(h),'ambassador Welcome');assert.equal(money(L),before);clean(h);
});

test('installable and loading identities use the original avatar family and keep Signal naming',()=>{
 const root=path.join(__dirname,'../dist'),index=fs.readFileSync(path.join(root,'index.html'),'utf8'),manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
 const iconTags=[...index.matchAll(/<link\b[^>]*>/g)].map(match=>match[0]);
 assert(iconTags.some(tag=>/rel="icon"/.test(tag)&&/href="\/brand\/lumo-avatar-icon\.svg"/.test(tag)),'The browser tab icon is the original avatar');
 assert(iconTags.some(tag=>/rel="apple-touch-icon"/.test(tag)&&/href="\/brand\/lumo-avatar-icon-180\.png"/.test(tag)),'The Apple home-screen icon uses its original size');
 assert.equal(manifest.name,'Lumo · Signal');assert.deepEqual(manifest.icons.map(icon=>[icon.src,icon.sizes,icon.type]),[['/brand/lumo-avatar-icon-192.png','192x192','image/png'],['/brand/lumo-avatar-icon-512.png','512x512','image/png']]);
 assert(!/\/assets\/signal\/lux-/.test(index),'The static loading and desktop identity cannot flash the 3D avatar before boot');
 assert.match(index,/class="launch-screen[\s\S]*?src="\/brand\/lumo-avatar-icon-192\.png"/);
});
