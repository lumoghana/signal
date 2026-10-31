/* Actual-index acceptance for the edition-only monochrome presentation.
   These checks protect money, navigation, privacy, escaping and account access.
   They make no browser geometry or live-payment claim. */
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const primaryLabel=button=>(button.querySelector('.signal-action-label')||button).textContent.trim();
const view=h=>h.document.getElementById('view');
const settle=h=>{h.flushHistory();h.flush();};
const financial=L=>JSON.stringify({balance:L.state.balance,accounts:L.state.accounts,txs:L.state.txs,essentials:L.state.essentials,goals:L.state.goals,virtualCards:L.state.virtualCards,requests:L.state.requests,groupMoney:L.state.groupMoney?.items||[],savingsHacks:L.state.savingsHacks});
const homeMoney=(L,value)=>L.signalEdition?'₵'+Number(value).toLocaleString('en-GH',{minimumFractionDigits:Number.isInteger(Number(value))?0:2,maximumFractionDigits:2}):L.money(value);
function fixture({sample=true}={}){const h=createHarness({clock:true,deferHistory:true});if(sample)h.L.explore();h.L.render();settle(h);return h;}
function go(h,route,params={}){h.L.go(route,params);settle(h);}
function byLabel(h,label){const button=view(h).querySelectorAll('button').find(b=>primaryLabel(b)===label);assert(button,'Visible '+label+' on '+h.L.route);return button;}
const clean=h=>assert.deepEqual(h.errors,[]);
const boxMeta=card=>card.querySelector('small.sr-only')?.textContent||'';
const boxCount=card=>boxMeta(card).match(/^\d+ box(?:es)?/)?.[0]||null;

test('Home renders real after-budget, available and savings values without changing financial state',()=>{
 const h=fixture(),{L}=h;L.showPrivateMoney();L.render();settle(h);
 const before=financial(L),b=L.balances(),a=L.accountBalances();
 assert(view(h).querySelector('.signal-home'));assert.equal(view(h).querySelectorAll('.account-card').length,4);assert.equal(view(h).querySelectorAll('.mono-conversation-card').length,1);assert.equal(view(h).querySelectorAll('.account-savings').length,1);assert.equal(view(h).querySelectorAll('.account-operational').length,1);assert(view(h).querySelector('.signal-story-card'));
 assert.equal(h.document.getElementById('overview-room').textContent,homeMoney(L,b.room));
 assert.equal(h.document.getElementById('overview-balance').textContent,homeMoney(L,a.available));
 assert.equal(h.document.getElementById('overview-savings').textContent,homeMoney(L,a.savings));
 assert(view(h).querySelector('[data-budget-basis]'),'Current date basis remains explicit');
 L.render();settle(h);assert.equal(financial(L),before);clean(h);
});

test('Home calculation and View budget retain separate exact destinations and saved money',()=>{
 const h=fixture(),{L}=h,before=financial(L);
 view(h).querySelector('[data-spending-outlook-entry]').click();settle(h);assert.equal(L.route,'spendingOutlook');assert.equal(L.taskSheet.parentRoute,'home');
 L.closeTask();settle(h);assert.equal(L.route,'home');
 byLabel(h,'View budget').click();settle(h);assert.equal(L.route,'plan');assert.equal(L.taskSheet.active,false);
 assert(view(h).querySelector('[data-budget-items-disclosure]').hasAttribute('open'));
 assert(view(h).querySelectorAll('[data-budget-line]').length>0);assert.equal(financial(L),before);clean(h);
});

for(const [label,handler,route]of [['Add money',"L.openFunding('home')",'addMoney'],['Pay',"L.openTab('pay')",'pay'],['Collect','L.newRequest()','groupMoneyHome']])test(label+' opens its requested destination and returning moves no money',()=>{
 const h=fixture(),{L}=h,before=financial(L),actions=view(h).querySelector('.everyday-home-actions'),button=actions.querySelectorAll('button').find(b=>primaryLabel(b)===label);
 assert(button);assert.equal(button.getAttribute('onclick'),handler);assert.equal(actions.querySelectorAll('button').length,3);
 button.click();settle(h);assert.equal(L.route,route);if(route==='pay'){assert.equal(L.taskSheet.active,false);assert(view(h).querySelector('.pay-tabs'));}else assert.equal(L.taskSheet.parentRoute,'home');assert.equal(financial(L),before);
 if(route==='pay')L.openTab('home');else L.closeTask();settle(h);assert.equal(L.route,'home');assert.equal(financial(L),before);clean(h);
});

test('without a saved Budget Home uses actual available money and existing budget setup',()=>{
 const h=fixture(),{L}=h;L.state.essentials=[];L.state.planSaved=false;delete L.state.planPeriod;delete L.state.planHorizon;L.state.allowance={amount:0,date:''};L.state.planDraft=null;L.showPrivateMoney();L.render();settle(h);
 assert.equal(L.hasMeaningfulPlan(),false);assert.equal(h.document.getElementById('overview-room'),null);
 const amount=h.document.getElementById('overview-balance');assert(amount);assert.equal(amount.textContent,homeMoney(L,L.accountBalances().available));
 const before=financial(L);const entry=byLabel(h,'Create your budget');assert.equal(entry.getAttribute('onclick'),"L.go('planSetup')");entry.click();settle(h);assert.equal(L.route,'planBenefit');assert.equal(financial(L),before);clean(h);
});

test('saved Budget drafts resume their existing step without replacing saved money',()=>{
 const h=fixture(),{L}=h;L.state.essentials=[];L.state.planSaved=false;delete L.state.planPeriod;delete L.state.planHorizon;L.state.allowance={amount:0,date:''};L.state.planDraft={step:'firstEssentials',essentials:[{id:'draft',name:'Food',amount:75}]};L.render();settle(h);
 const before=financial(L),draft=JSON.stringify(L.state.planDraft.essentials);byLabel(h,'Continue your budget').click();settle(h);assert.equal(L.route,'firstEssentials');assert.equal(JSON.stringify(L.state.planDraft.essentials),draft);assert.equal(financial(L),before);clean(h);
});

test('privacy covers every visible Home amount and rerenders keep masked markup free of digits',()=>{
 const h=fixture(),{L}=h,before=financial(L);L.hidePrivateMoney();L.render();settle(h);
 for(const id of ['overview-room','overview-balance','overview-savings','signal-planned-costs']){const amount=h.document.getElementById(id);assert(amount.querySelector('.money-mask'));assert(!/\d/.test(amount.textContent));}
 assert(h.document.getElementById('balance-eye').getAttribute('aria-controls').split(/\s+/).includes('signal-planned-costs'));
 h.document.getElementById('balance-eye').click();settle(h);for(const id of ['overview-room','overview-balance','overview-savings','signal-planned-costs'])assert.equal(h.document.getElementById(id).querySelector('.money-mask'),null);
 assert.equal(financial(L),before);clean(h);
});

test('long names and markup-like names stay escaped text without creating controls or changing saved data',()=>{
 const h=fixture(),{L}=h;
 for(const name of ['A'.repeat(300),'<svg/onload=alert(1)>','Kwame"onclick="alert(1)']){
  L.state.profile.displayName=name;const before=financial(L);L.render();settle(h);
  const intro=view(h).querySelector('.mono-home-intro');assert.equal(intro.querySelector('p').textContent,'Hey, '+name);assert.equal(intro.querySelector('svg'),null);assert.equal(intro.querySelector('button'),null);assert.equal(financial(L),before);
 }
 clean(h);
});

test('locked and closed accounts cannot expose the redesigned Home through normal navigation',()=>{
 for(const mode of ['locked','closed']){const h=fixture(),{L}=h;L.state[mode]=true;const before=financial(L);L.go('home');settle(h);assert.notEqual(L.route,'home');assert.equal(view(h).querySelector('.mono-home'),null);assert.equal(view(h).querySelector('[data-private-value]'),null);assert.equal(financial(L),before);clean(h);}
});

test('Welcome preserves fresh signup, saved setup, sign-in, unlocked access and closed records',()=>{
 const fresh=fixture({sample:false});go(fresh,'welcome');assert(view(fresh).querySelector('.mono-welcome'));assert(view(fresh).textContent.includes('Sample money only'));byLabel(fresh,'Get started').click();settle(fresh);assert.equal(fresh.L.route,'samplePause');assert.equal(fresh.L.state.onboarded,false);
 go(fresh,'welcome');fresh.L.state.setup.phone='0241230123';go(fresh,'welcome');const saved=JSON.stringify(fresh.L.state.setup);const resume=byLabel(fresh,'Continue my setup');assert.equal(resume.getAttribute('onclick'),'L.onboarding.resume()');resume.click();settle(fresh);assert.notEqual(fresh.L.route,'welcome');assert.equal(fresh.L.state.setup.phone,'0241230123');assert.equal(fresh.L.state.onboarded,false);assert(saved.includes('0241230123'));clean(fresh);
 for(const [mode,label,destination]of [['open','Continue my Lumo','home'],['locked','Sign in','signin'],['closed','View saved records','accountInfo']]){
  const h=fixture(),{L}=h;if(mode!=='open')L.state[mode]=true;go(h,'welcome');const before=financial(L);byLabel(h,label).click();settle(h);assert.equal(L.route,destination);assert.equal(financial(L),before);if(mode==='locked')assert.equal(L.state.locked,true);if(mode==='closed')assert.equal(L.state.closed,true);clean(h);
 }
});

function pauseFixture(){
 const h=fixture(),{L}=h;L.ensureAccounts();Object.assign(L.state,{balance:500,txs:[],essentials:[{id:'food',name:'Food',amount:200,paid:0},{id:'transport',name:'Transport',amount:150,paid:0}],goals:[{id:'laptop',name:'Laptop',allocated:100,target:3000,boxVersion:2}],allowance:{amount:0,date:''},paymentDraft:null});
 L.pickMerchant('AK01');h.set('payment-amount',280);h.set('payment-essential','');L.preparePayment();settle(h);assert.equal(L.route,'pause');return h;
}

test('Pause disclosure stages real alternatives at arrival and leaves the main decisions outside it',()=>{
 const h=pauseFixture(),{L}=h,before=financial(L),options=view(h).querySelector('.mono-pause-options'),summary=L.pauseRecovery.summary();
 assert(options);assert(!options.hasAttribute('open'));assert.match(options.querySelector('summary').textContent,/Other ways forward/);
 assert.equal(options.getAttribute('aria-hidden'),'true');assert(options.inert);
 assert.equal(options.querySelector('[data-pause-hold]'),null);assert.equal(options.querySelector('[onclick="L.pauseAction(\'cancel_payment\')"]'),null);
 assert(options.querySelector('[data-plan-adjustment]').textContent.includes(L.money(summary.lower.amount)));
 assert(options.querySelector('[data-pause-recovery-fund]').textContent.includes(L.money(summary.funding.amount)));
 assert.equal(summary.lower.amount,150);assert.equal(summary.funding.amount,130);
 const cancel=byLabel(h,'Cancel payment');assert(!cancel.closest('.mono-pause-options'));
 h.advance(899);assert.equal(options.getAttribute('aria-hidden'),'true');h.advance(1);assert.equal(options.getAttribute('aria-hidden'),'false');assert(!options.inert);
 options.querySelector('summary').click();assert(options.hasAttribute('open'));assert(options.querySelector('.pause-link-cost'));assert(options.querySelectorAll('button').some(b=>b.getAttribute('onclick')==="L.pauseAction('delay_payment')"));assert.equal(financial(L),before);clean(h);
});

test('a disclosed smaller amount uses the current quote and changes only the original unsubmitted draft',()=>{
 const h=pauseFixture(),{L}=h,before=financial(L),draft=L.state.paymentDraft,id=draft.id,expected=L.pauseRecovery.summary().lower.amount;
 h.advance(900);view(h).querySelector('.mono-pause-options summary').click();view(h).querySelector('.mono-pause-options [data-plan-adjustment]').click();settle(h);
 assert.equal(L.route,'paymentReview');assert.equal(L.state.paymentDraft.id,id);assert.equal(draft.amount,expected);assert.equal(draft.pauseAcceptedSignature,undefined);assert.equal(L.state.txs.length,0);assert.equal(financial(L),before);clean(h);
});

test('opening optional Pause choices never bypasses the reading minimum, hold or separate PIN approval',()=>{
 const h=pauseFixture(),{L}=h,before=financial(L),hold=view(h).querySelector('[data-pause-hold]');
 h.advance(900);view(h).querySelector('.mono-pause-options summary').click();hold.click();h.advance(90);assert.equal(L.route,'pause');assert.equal(hold.getAttribute('aria-disabled'),'true');
 h.advance(2910);assert.equal(hold.getAttribute('data-pause-ready'),'true');hold.click();h.advance(89);assert.equal(L.route,'pause');h.advance(1);assert.equal(L.route,'authorize');assert(h.document.getElementById('payment-pin'));assert.equal(L.state.txs.length,0);assert.equal(financial(L),before);clean(h);
});

test('Cancel remains immediately available outside the Pause disclosure and cannot later open authorisation',()=>{
 const h=pauseFixture(),{L}=h,before=financial(L),parent=L.taskSheet.parentRoute,cancel=byLabel(h,'Cancel payment');assert(!cancel.closest('.mono-pause-options'));
 cancel.click();settle(h);assert.equal(L.state.paymentDraft,null);assert.equal(L.route,parent);h.advance(10000);assert.notEqual(L.route,'authorize');assert.equal(L.state.txs.length,0);assert.equal(financial(L),before);clean(h);
});

const dateAt=(h,days)=>new h.context.Date(h.context.Date.now()+days*86400000).toISOString().slice(0,10);
const dateLabel=(h,value)=>new h.context.Date(value+'T12:00:00Z').toLocaleDateString('en-GH',{timeZone:'Africa/Accra',day:'numeric',month:'short',...(value.slice(0,4)!==dateAt(h,0).slice(0,4)?{year:'numeric'}:{})});
const renderHome=h=>{h.L.route='home';h.L.params={};h.L.render();settle(h);};

test('Signal Home keeps planned-cost meaning and available money with a privacy-aware planned-cost breakdown',()=>{
 const h=fixture(),{L}=h;L.showPrivateMoney();renderHome(h);
 const before=financial(L),a=L.accountBalances();
 assert.equal(view(h).querySelector('[data-mono-budget-deduction]'),null);
 assert(!view(h).querySelector('.mono-money-card').textContent.includes('Costs left'));
 assert.equal(view(h).querySelectorAll('.signal-balance-cell').length,2);
 assert.equal(h.document.getElementById('overview-balance').textContent,homeMoney(L,a.available));
 assert.match(view(h).querySelector('.signal-money-label').textContent,/Room to spend/);
 assert.equal(h.document.getElementById('signal-planned-costs').textContent,homeMoney(L,L.balances().essentials+L.balances().allocated));
 assert.match(view(h).querySelector('[data-budget-basis]').textContent,/planned costs/);
 L.monoDesign.syncHomeFacts();assert.equal(financial(L),before);clean(h);
});

test('missing and invalid Budget dates offer the native date task without making up a period',()=>{
 for(const horizon of [undefined,{mode:'unspecified',date:''},{mode:'date',date:'2026-02-30'}]){
  const h=fixture(),{L}=h;L.state.planHorizon=horizon;renderHome(h);
  const before=financial(L),saved=JSON.stringify(L.state.planHorizon),basis=view(h).querySelector('[data-budget-basis]'),entry=view(h).querySelector('.mono-budget-date-action');
  assert.equal(basis.getAttribute('data-basis-status'),'saved-costs');assert.match(basis.textContent,/planned costs/);assert(!/Through/.test(basis.textContent));
  assert(entry);assert.equal(entry.textContent.trim(),'Add dates');assert.equal(entry.getAttribute('onclick'),"L.go('planPeriod')");
  L.render();settle(h);assert.equal(JSON.stringify(L.state.planHorizon),saved,'Rendering does not repair the saved horizon');
  view(h).querySelector('.mono-budget-date-action').click();settle(h);assert.equal(L.route,'planPeriod');assert.equal(L.taskSheet.parentRoute,'home');assert.equal(financial(L),before);
  L.closeTask();settle(h);assert.equal(L.route,'home');clean(h);
 }
});

test('dated Home context includes the saved last day and allowance context stops before expected income',()=>{
 for(const mode of ['date','allowance']){
  const h=fixture(),{L}=h,end=dateAt(h,10),last=dateAt(h,mode==='allowance'?9:10);
  L.state.planHorizon={mode,date:end};L.state.allowance={amount:5432.10,date:end};L.showPrivateMoney();renderHome(h);
  const before=financial(L),basis=view(h).querySelector('[data-budget-basis]');
  assert.equal(basis.getAttribute('data-basis-status'),'dated');assert(basis.textContent.includes('Through '+dateLabel(h,last)));
  if(mode==='allowance')assert(!basis.textContent.includes('Through '+dateLabel(h,end)),'Expected income does not add another spendable day');
  assert(!h.document.getElementById('overview-balance').textContent.includes('5432.10'),'Expected income is not available money');
  assert(!view(h).querySelector('.mono-budget-date-action'));L.render();settle(h);assert.equal(financial(L),before);clean(h);
 }
});

test('ended, changed and due allowance periods keep their honest Home lifecycle context',()=>{
 const variants=[
  {horizon:h=>({mode:'date',date:dateAt(h,-1)}),allowance:h=>({amount:200,date:dateAt(h,10)}),status:'ended',copy:/Budget period ended/,review:true},
  {horizon:h=>({mode:'allowance',date:dateAt(h,10)}),allowance:h=>({amount:200,date:dateAt(h,11)}),status:'changed-allowance',copy:/Review your Budget dates/,review:true},
  {horizon:h=>({mode:'allowance',date:dateAt(h,0)}),allowance:h=>({amount:200,date:dateAt(h,0)}),status:'allowance-due',copy:/Allowance expected today/,review:true}
 ];
 for(const variant of variants){
  const h=fixture(),{L}=h;L.state.planHorizon=variant.horizon(h);L.state.allowance=variant.allowance(h);renderHome(h);
  const before=financial(L),basis=view(h).querySelector('[data-budget-basis]');assert.equal(basis.getAttribute('data-basis-status'),variant.status);assert.match(basis.textContent,variant.copy);
  if(variant.review){const entry=view(h).querySelector('.mono-budget-date-action');assert(entry);assert.equal(entry.textContent.trim(),'Review dates');entry.click();settle(h);assert.equal(L.route,'planPeriod');assert.equal(L.taskSheet.parentRoute,'home');assert.equal(financial(L),before);}
  else assert(!view(h).querySelector('.mono-budget-date-action'));
  clean(h);
 }
});

test('Home Money Boxes shows one labelled aggregate and count while goal detail belongs to Ask Lumo',()=>{
 const h=fixture(),{L}=h,name='Laptop <svg/onload=alert(1)>',early=dateAt(h,4),later=dateAt(h,10);
 L.state.goals=[
  {id:'archived',name:'Archived fund',allocated:20,target:100,date:dateAt(h,1),archived:true,boxVersion:2},
  {id:'deleted',name:'Deleted fund',allocated:20,target:100,date:dateAt(h,1),deleted:true,boxVersion:2},
  {id:'done',name:'Completed fund',allocated:100,target:100,date:dateAt(h,1),boxVersion:2},
  {id:'later',name:'Later fund',allocated:300,target:500,date:later,boxVersion:2},
  {id:'selected',name,allocated:100,target:400,date:early,boxVersion:2}
 ];
 L.showPrivateMoney();renderHome(h);const before=financial(L),boxes=view(h).querySelector('.mono-boxes-card'),insight=view(h).querySelector('[data-mono-conversation-insight]');
 assert(boxMeta(boxes).includes('Total saved'));assert(!boxes.textContent.includes('Saved separately'));
 assert.equal(boxes.querySelectorAll('[data-private-value="savings"]').length,1);assert.equal(boxes.querySelector('[data-mono-home-goal]'),null);assert.equal(boxes.querySelector('.mono-goal-track'),null);
 assert.equal(boxCount(boxes),'3 boxes');assert.equal(boxes.querySelector('.everyday-boxes-open').getAttribute('onclick'),"L.go('goals')");assert.equal(h.document.getElementById('overview-savings').textContent,homeMoney(L,L.accountBalances().savings));
 assert(!boxes.textContent.includes(name));assert(insight.textContent.includes(name));assert(insight.textContent.includes('25%'));assert(!insight.querySelector('svg'),'A goal name stays escaped in its single Home insight');
 L.monoDesign.syncHomeFacts();assert.equal(financial(L),before);boxes.querySelector('.everyday-boxes-open').click();settle(h);assert.equal(L.route,'goals');assert.equal(financial(L),before);clean(h);
});

test('Money Boxes does not invent an active saving target when all existing goals are complete or unavailable',()=>{
 const h=fixture(),{L}=h;L.state.goals=[{id:'done',name:'Completed fund',allocated:100,target:100,boxVersion:2},{id:'archived',name:'Archived fund',allocated:10,target:100,archived:true,boxVersion:2},{id:'invalid',name:'Untargeted fund',allocated:0,target:0,boxVersion:2}];
 L.showPrivateMoney();renderHome(h);const before=financial(L),boxes=view(h).querySelector('.mono-boxes-card');
 assert.equal(boxCount(boxes),'2 boxes');assert(!/Completed fund|Archived fund|Untargeted fund|%/.test(boxes.textContent));assert(boxMeta(boxes).includes('Total saved'));
 assert.equal(h.document.getElementById('overview-savings').textContent,homeMoney(L,L.accountBalances().savings));assert.equal(financial(L),before);
 for(const goals of [[],[{id:'archived-only',name:'Old box',allocated:0,archived:true,boxVersion:2},{id:'deleted-only',name:'Deleted box',allocated:0,deleted:true,boxVersion:2}]]){
  L.state.goals=goals;renderHome(h);const before=financial(L),tile=view(h).querySelector('.mono-boxes-card'),create=tile.querySelector('button');
  assert.equal(boxCount(tile),null);assert.equal(boxMeta(tile),'');assert.equal(h.document.getElementById('overview-savings'),null);assert.equal(tile.querySelector('[data-private-value]'),null);
  assert.equal(tile.querySelector('.mono-box-title').textContent,'Create a Money Box');assert.match(tile.textContent,/Put money aside for a goal/);assert(!/Total saved|GH₵|0 boxes/.test(tile.textContent));
  assert(!h.document.getElementById('balance-eye').getAttribute('aria-controls').split(/\s+/).includes('overview-savings'));
  L.hidePrivateMoney();L.refreshPrivateMoney();assert.match(tile.textContent,/Create a Money Box/);assert.equal(financial(L),before);
  create.click();settle(h);assert.equal(L.route,'goalEdit');assert(h.document.getElementById('goalName'));assert.equal(financial(L),before);
  L.closeTask();settle(h);assert.equal(L.route,'home');assert.equal(financial(L),before);
 }
 L.state.goals=[{id:'new-empty',name:'First box',allocated:0,boxVersion:2}];renderHome(h);assert.equal(boxCount(view(h).querySelector('.mono-boxes-card')),'1 box');assert(boxMeta(view(h).querySelector('.mono-boxes-card')).includes('Total saved'));assert.equal(view(h).querySelector('.everyday-boxes-open').getAttribute('onclick'),"L.go('goals')");assert(h.document.getElementById('overview-savings'));clean(h);
});

test('privacy masks Home money and goal progress while the accessible box count remains accurate',()=>{
 const h=fixture(),{L}=h;
 L.state.essentials=[{id:'food-private',name:'Food',amount:234.56,paid:0,externalPaid:0,coverageVersion:1}];
 L.state.goals=[{id:'goal-private',name:'Emergency buffer',allocated:123.45,target:987.65,boxVersion:2}];L.state.txs=[];
 L.showPrivateMoney();renderHome(h);const before=financial(L);
 assert.equal(view(h).querySelector('[data-mono-budget-deduction]'),null);assert.equal(boxCount(view(h).querySelector('.mono-boxes-card')),'1 box');
 assert.match(view(h).querySelector('[data-mono-conversation-insight]').textContent,/12%/);
 const hidden=()=>{
  assert.equal(boxCount(view(h).querySelector('.mono-boxes-card')),'1 box');
  for(const selector of ['#overview-balance','#overview-savings','#signal-planned-costs','[data-mono-conversation-insight]']){const field=view(h).querySelector(selector);assert(field);assert(!/\d/.test(field.textContent));}
  const track=view(h).querySelector('.mono-goal-track');if(track)assert(!/width\s*:\s*\d/.test(track.getAttribute('style')||''),'Hidden progress has no numeric width');
  assert(!/123\.45|987\.65|234\.56|12%/.test(view(h).querySelector('.mono-home').outerHTML),'Masked Home markup contains no added financial values');
 };
 L.hidePrivateMoney();hidden();L.render();settle(h);hidden();
 h.document.getElementById('balance-eye').click();settle(h);
 assert.equal(view(h).querySelector('[data-mono-budget-deduction]'),null);assert.equal(boxCount(view(h).querySelector('.mono-boxes-card')),'1 box');assert.match(view(h).querySelector('[data-mono-conversation-insight]').textContent,/12%/);
 assert.equal(financial(L),before);clean(h);
});
