'use strict';
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const primaryLabel=button=>(button.querySelector('.signal-action-label')||button).textContent.trim();
const view=h=>h.document.getElementById('view');
const clean=h=>assert.deepEqual(h.errors,[]);
const settle=h=>{h.flushHistory();h.flush();};
const financial=L=>JSON.stringify([L.state.balance,L.state.accounts,L.state.txs,L.state.essentials,L.state.goals]);
const homeMoney=(L,value)=>L.signalEdition?'₵'+Number(value).toLocaleString('en-GH',{minimumFractionDigits:Number.isInteger(Number(value))?0:2,maximumFractionDigits:2}):L.money(value);
function fixture(){const h=createHarness({clock:true,deferHistory:true}),{L}=h;L.explore();L.ensureAccounts();L.route='home';L.params={};L.history=[];L.render();settle(h);return h;}
const checks=[];const check=(name,fn)=>checks.push([name,fn]);
check('Home orders Everyday money, three quick actions, then Money Boxes',()=>{
 const h=fixture(),home=view(h).querySelector('.everyday-account-home');assert(home);
 const operational=home.querySelector('.account-operational'),savings=home.querySelector('.account-savings'),actions=home.querySelector('.everyday-home-actions');assert(operational);assert(savings);assert(actions);
 const html=home.innerHTML;assert(html.indexOf('account-operational')<html.indexOf('account-savings'));assert(html.indexOf('account-operational')<html.indexOf('everyday-home-actions'));assert(html.indexOf('everyday-home-actions')<html.indexOf('account-savings'));
 const buttons=actions.querySelectorAll('button');assert.deepEqual(buttons.map(primaryLabel),['Add money',actions.closest('.mono-home')?'Pay':'Transfer',actions.closest('.mono-home')?'Collect':'Request']);assert.equal(home.querySelectorAll('[data-home-campus-pay]').length,0);assert(!home.textContent.includes('Campus Pay'));
 assert(operational.textContent.includes('Everyday money'));const basis=operational.querySelector('[data-budget-basis]');assert(basis);assert(basis.textContent.trim());assert(!operational.textContent.includes('Operational account'));assert(savings.textContent.includes('Money Boxes'));const count=h.L.state.goals.filter(x=>!x.archived&&!x.deleted).length;assert(savings.textContent.includes(count+' '+(count===1?'box':'boxes')),'Money Boxes retains its actual active count');if(home.classList.contains('mono-home')){assert(home.querySelector('.mono-conversation-card'));assert(h.L.signalEdition?html.indexOf('mono-conversation-card')<html.indexOf('account-savings'):html.indexOf('account-savings')<html.indexOf('mono-conversation-card'),'Conversation retains the approved edition order');}else assert(savings.textContent.includes('Saved for what’s next'));clean(h);
});
check('Add money is unique and opens its existing sheet from the quick action group',()=>{
 const h=fixture(),home=view(h),before=financial(h.L),buttons=home.querySelectorAll('button').filter(b=>primaryLabel(b)==='Add money');assert.equal(buttons.length,1);assert(buttons[0].closest('.everyday-home-actions'));buttons[0].click();settle(h);assert.equal(h.L.route,'addMoney');assert.equal(h.L.taskSheet.parentRoute,'home');assert.equal(financial(h.L),before);clean(h);
});
check('saved Budget retains the computed Left after budget primary amount and balance context',()=>{
 const h=fixture(),{L}=h,before=financial(L),b=L.balances();assert(view(h).querySelector('#overview-room'));assert.equal(view(h).querySelector('#overview-room').textContent,homeMoney(L,b.room));assert.equal(view(h).querySelector('#overview-balance').textContent,homeMoney(L,b.available));assert(view(h).textContent.toLowerCase().includes(L.signalEdition?'room to spend':L.monoDesign?'left after planned costs':'left after budget'));assert.equal(financial(L),before);clean(h);
});
check('Home budget details opens Plan with Budget items visible while the amount keeps its calculation',()=>{
 const h=fixture(),{L}=h,before=financial(L);L.budgetReadability.rememberItems(false);
 const calculation=view(h).querySelector('[data-spending-outlook-entry]');assert(calculation);calculation.click();settle(h);assert.equal(L.route,'spendingOutlook');assert.equal(L.taskSheet.parentRoute,'home');L.closeTask();settle(h);assert.equal(L.route,'home');
 const details=view(h).querySelector('.everyday-budget-link');assert(details);assert.equal(details.textContent.trim(),'View budget');details.click();settle(h);assert.equal(L.route,'plan');assert.equal(L.taskSheet.active,false);
 const disclosure=view(h).querySelector('[data-budget-items-disclosure]');assert(disclosure);assert(disclosure.hasAttribute('open'),'Show saved Budget categories immediately');assert(disclosure.querySelectorAll('[data-budget-line]').length>0);assert.equal(disclosure.querySelectorAll('[data-budget-line]').length,L.budgetReadability.summary().groups.length);assert(view(h).querySelector('[data-budget-total]'));
 const nav=h.document.getElementById('nav'),menu=nav.querySelectorAll('button').find(b=>b.getAttribute('onclick')==="L.openMonoMenu()");assert.equal(menu.textContent.trim(),'Menu');assert.equal(menu.getAttribute('aria-current'),'page');
 const home=nav.querySelectorAll('button').find(b=>b.getAttribute('onclick')==="L.openTab('home')");assert(home);home.click();settle(h);assert.equal(L.route,'home');assert(view(h).querySelector('.everyday-budget-link'));assert.equal(financial(L),before);clean(h);
});
check('the existing eye hides and reveals every Home amount without changing financial records',()=>{
 const h=fixture(),{L}=h,before=financial(L),eye=h.document.getElementById('balance-eye');assert(eye.closest('.account-operational'));eye.click();settle(h);for(const id of ['overview-room','overview-balance','overview-savings']){assert(h.document.getElementById(id).querySelector('.money-mask'));assert(!/\d/.test(h.document.getElementById(id).textContent));}eye.click();settle(h);for(const id of ['overview-room','overview-balance','overview-savings'])assert.equal(h.document.getElementById(id).querySelector('.money-mask'),null);assert.equal(financial(L),before);clean(h);
});
check('wide amount layout follows the real saved value in both privacy states without changing money',()=>{
 const ordinary=fixture();assert.equal(view(ordinary).querySelector('.has-wide-amount'),null);assert.equal(view(ordinary).querySelector('.has-wide-savings'),null);clean(ordinary);
 for(const [amount,wideSavings]of [[200,false],[9999.99,false],[10000,true],[999999.99,true]]){
  const h=fixture(),{L}=h;L.state.balance=999999.99;L.state.goals[0].allocated=amount;L.state.goals[0].target=1000000;const before=financial(L);
  for(const hidden of [false,true,false]){
   if(hidden)L.hidePrivateMoney();else L.showPrivateMoney();L.render();settle(h);
   const savings=view(h).querySelector('#overview-savings');assert.equal(savings.classList.contains('has-wide-savings'),wideSavings);assert(view(h).querySelector('.account-operational.has-wide-amount'));
   if(hidden){assert(savings.querySelector('.money-mask'));assert(!/\d/.test(savings.textContent));}else{assert.equal(savings.querySelector('.money-mask'),null);assert.equal(savings.textContent,homeMoney(L,amount));}
   assert.equal(L.accountBalances().savings,amount);assert.equal(financial(L),before);
  }
  clean(h);
 }
 const h=fixture(),{L}=h;L.state.balance=10000;L.state.essentials=[{id:'wide-context-cost',name:'This term’s costs',amount:9600,paid:0,externalPaid:0,coverageVersion:1}];const before=financial(L);
 for(const hidden of [false,true,false]){
  if(hidden)L.hidePrivateMoney();else L.showPrivateMoney();L.render();settle(h);
  assert.equal(L.balances().room,400);assert.equal(L.balances().available,10000);assert.equal(view(h).querySelector('.account-operational.has-wide-amount'),null);
  const context=view(h).querySelector(L.signalEdition?'.signal-balance-breakdown':'.everyday-available-context');assert(context);if(!L.signalEdition)assert(context.classList.contains('has-wide-context'));const amount=context.querySelector('#overview-balance');
  if(hidden){assert(amount.querySelector('.money-mask'));assert(!/\d/.test(amount.textContent));}else assert.equal(amount.textContent,homeMoney(L,10000));
  assert.equal(financial(L),before);
 }
 clean(h);
});
check('an unfinished first Budget has a working Continue your budget link',()=>{
 const h=fixture(),{L}=h;L.state.essentials=[];L.state.planSaved=false;delete L.state.planPeriod;L.state.allowance={amount:0,date:''};L.state.planDraft={step:'firstEssentials',essentials:[]};L.route='home';L.params={};L.history=[];L.render();settle(h);assert(view(h).querySelector('#overview-balance'));assert(!view(h).querySelector('#overview-room'));
 const link=view(h).querySelectorAll('button').find(b=>b.textContent.includes('Continue your budget'));assert(link);assert.equal(link.getAttribute('onclick'),"L.go('firstEssentials')");const before=financial(L);link.click();settle(h);assert.equal(L.route,'firstEssentials');assert.equal(financial(L),before);clean(h);
});
check('Money Boxes shows the real active count and opens the existing savings journey',()=>{
 const h=fixture(),{L}=h;const expected=L.state.goals.filter(x=>!x.archived&&!x.deleted).length;const savings=view(h).querySelector('.account-savings');assert(savings.textContent.includes(expected+' '+(expected===1?'box':'boxes')));assert(savings.querySelector('#overview-savings'));const button=savings.querySelector('button'),before=financial(L);button.click();settle(h);assert.equal(L.route,'goals');assert.equal(financial(L),before);clean(h);
});
check('Chat, Requests, Transfers and the floating QR remain functional destinations',()=>{
 for(const [kind,route]of [['Request','groupMoneyHome'],['Transfer','pay']]){const h=fixture(),before=financial(h.L),home=view(h),label=home.querySelector('.everyday-home-actions').closest('.mono-home')?(kind==='Request'?'Collect':'Pay'):kind;home.querySelector('.everyday-home-actions').querySelectorAll('button').find(b=>primaryLabel(b)===label).click();settle(h);assert.equal(h.L.route,route);assert.equal(financial(h.L),before);if(kind==='Request'){const onePerson=view(h).querySelectorAll('button').find(b=>b.getAttribute('onclick')==='L.gm.onePerson()');assert(onePerson);onePerson.click();settle(h);assert.equal(h.L.route,'requestCreate');assert.equal(financial(h.L),before);}clean(h);}
 const h=fixture();const chat=view(h).querySelector('.mono-conversation-open')||view(h).querySelectorAll('button').find(b=>b.getAttribute('onclick')==='L.openBankingChat()');assert(chat);assert(h.document.getElementById('lumo-scan-qr'));chat.click();settle(h);assert.equal(h.L.route,'chat');clean(h);
});
for(const [name,run]of checks){run();console.log('PASS '+name);}console.log(checks.length+' Everyday hierarchy checks passed.');
