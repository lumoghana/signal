/* Presentation refinements must explain the existing facts without changing
   financial authority, account identity, or customer-entered text. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const root=path.resolve(__dirname,'../dist');
const modules=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
if(!modules.includes('experience-clarity.js'))modules.push('experience-clarity.js');
const settle=h=>{h.flushHistory();h.flush();};
const fixture=()=>{const h=createHarness({clock:true,modules});h.L.explore();settle(h);return h;};
const facts=L=>JSON.stringify([L.state.balance,L.state.accounts,L.state.txs,L.state.essentials,L.state.goals,L.state.allowance,L.state.planHorizon,L.state.planSaved,L.state.planDraft]);
const iso=(h,days=0)=>new h.context.Date(h.context.Date.now()+days*86400000).toISOString().slice(0,10);
const view=h=>h.document.getElementById('view');
const clean=h=>assert.deepEqual(h.errors,[],'No rendering fallback');
let count=0;const check=(name,f)=>{f();count++;console.log('PASS '+name);};

check('an undated Budget explains exactly how many saved costs support the figure',()=>{
 const h=fixture(),{L}=h;L.state.planHorizon={mode:'unspecified',date:''};const before=facts(L),s=L.experienceClarity.basis();
 assert.equal(s.status,'saved-costs');assert.equal(s.text,'After your 3 saved costs');assert.equal(facts(L),before);
 const html=L.views.home();assert(html.includes('data-budget-basis'));
 if(L.monoDesign){assert(html.includes('3 planned costs'));L.render();settle(h);const dates=view(h).querySelector('.mono-budget-date-action');assert(dates);assert.equal(dates.textContent.trim(),'Add dates');assert.equal(dates.getAttribute('onclick'),"L.go('planPeriod')");}
 else assert(html.includes('After your 3 saved costs'));
 assert(!html.includes('<p>Operational account</p>'));assert.equal(facts(L),before);clean(h);
});
check('deleted and archived costs never inflate the Home basis',()=>{
 const h=fixture(),{L}=h;L.state.essentials=[{id:'live',name:'Food',amount:60},{id:'old',name:'Data',amount:40,archived:true},{id:'gone',name:'Travel',amount:30,deleted:true},{id:'zero',name:'Other',amount:0}];L.state.planHorizon={mode:'unspecified',date:''};
 assert.equal(L.experienceClarity.basis().text,'After your 1 saved cost');L.state.essentials=[];assert.equal(L.experienceClarity.basis().text,'Money available now');clean(h);
});
check('dated periods display the inclusive last date without counting expected allowance',()=>{
 const h=fixture(),{L}=h;L.state.planHorizon={mode:'date',date:iso(h,7)};const before=facts(L),dated=L.experienceClarity.basis();
 assert.equal(dated.status,'dated');assert.equal(dated.last,iso(h,7));assert.match(dated.text,/^Through /);assert.equal(facts(L),before);
 L.state.allowance.date=iso(h,7);L.state.planHorizon={mode:'allowance',date:iso(h,7)};const allowance=L.experienceClarity.basis();assert.equal(allowance.last,iso(h,6));assert.notEqual(allowance.text,dated.text);clean(h);
});
check('ended, changed and due-today dates do not imply a fresh spending horizon',()=>{
 const h=fixture(),{L}=h;L.state.planHorizon={mode:'date',date:iso(h,-1)};assert.equal(L.experienceClarity.basis().status,'ended');
 L.state.planHorizon={mode:'allowance',date:iso(h,4)};L.state.allowance.date=iso(h,5);assert.equal(L.experienceClarity.basis().status,'changed-allowance');
 L.state.allowance.date=iso(h);L.state.planHorizon={mode:'allowance',date:iso(h)};assert.equal(L.experienceClarity.basis().status,'allowance-due');
 L.state.planHorizon={mode:'date',date:'2026-02-30'};assert.equal(L.experienceClarity.basis().status,'saved-costs');clean(h);
});
check('Home context remains stable when amounts are hidden and financial records do not move',()=>{
 const h=fixture(),{L}=h;L.state.planHorizon={mode:'date',date:iso(h,5)};L.openTab('home');L.render();settle(h);const before=facts(L),context=view(h).querySelector('[data-budget-basis]').textContent;
 const eye=view(h).querySelector('#balance-eye');assert(eye);eye.click();settle(h);assert.equal(view(h).querySelector('[data-budget-basis]').textContent,context);assert.equal(facts(L),before);clean(h);
});
check('Budget root has one main management action and retains the working assistance inside it',()=>{
 const h=fixture(),{L}=h;L.openTab('plan');settle(h);const before=facts(L),actions=view(h).querySelector('[data-budget-primary]');assert(actions);assert.equal(actions.querySelectorAll('button').length,1);assert.equal(actions.textContent,'Update budget');assert.equal(actions.querySelector('button').getAttribute('onclick'),"L.go('planEdit')");
 actions.querySelector('button').click();settle(h);assert.equal(L.route,'planEdit');const help=view(h).querySelector('.experience-budget-assistance');assert(help);assert.equal(view(h).querySelectorAll('.experience-budget-assistance').length,1);assert.equal(help.textContent,'Adjust with Lumo');assert.equal(facts(L),before);
 help.click();settle(h);assert.equal(L.route,'chat');assert(L.budgetGuide.active());assert.equal(L.state.balance,JSON.parse(before)[0]);clean(h);
});
check('first and returning Budget drafts keep their existing creation controllers',()=>{
 const h=fixture(),{L}=h;L.state.essentials=[];L.state.planSaved=false;L.state.planDraft=null;L.openTab('plan');L.render();settle(h);
 let action=view(h).querySelector('[data-budget-primary] button');assert.equal(action.textContent,'Create a budget');assert.equal(action.getAttribute('onclick'),'L.buildPlanFromBenefit()');
 L.state.planDraft={step:'firstEssentials',essentials:[],goals:[],allowance:{amount:0,date:''},essentialFields:{name:'Food',amount:'80'}};L.render();settle(h);action=view(h).querySelector('[data-budget-primary] button');assert.equal(action.textContent,'Continue budget');action.click();settle(h);assert.equal(L.route,'firstEssentials');assert.equal(L.state.planDraft.essentialFields.name,'Food');clean(h);
});
check('Menu retains its controls and retained nodes while Plan keeps its grouped name and route',()=>{
 const h=fixture(),{L}=h,nav=h.document.getElementById('nav'),buttons=nav.querySelectorAll('button'),menu=buttons.find(b=>b.getAttribute('onclick')==="L.openMonoMenu()");assert(menu);assert.equal(menu.textContent,'Menu');L.experienceClarity.syncNames();assert(nav.querySelectorAll('button').every((b,i)=>b===buttons[i]));
 L.go('balances');settle(h);L.closeTask();settle(h);assert.equal(L.route,'home');assert(nav.querySelectorAll('button').every((b,i)=>b===buttons[i]));assert.equal(menu.textContent,'Menu');menu.click();settle(h);const budget=view(h).querySelector('[data-menu-route="plan"]');assert(budget);assert.equal(budget.querySelector('strong').textContent,'Plan');assert.equal(budget.getAttribute('onclick'),"L.monoMenuSelect('plan')");budget.click();settle(h);assert.equal(L.route,'plan');clean(h);
});
check('payment category selection explains allocation while preserving exact option values',()=>{
 const h=fixture(),{L}=h;L.startSend('lumo');settle(h);const d=L.state.paymentDraft,before=facts(L),fields=L.paymentPlanLinkFields(d);
 assert(fields.includes('Count this under'));assert(!fields.includes('<span>Pay from</span>'));assert(fields.includes('Paid from Everyday money.'));assert(fields.includes('value="ess-food"'));assert.equal(facts(L),before);
 assert(L.setPaymentSource('ess-food',d));assert.equal(d.essentialId,'ess-food');assert.equal(d.budgetSource.type,'budget-line');assert.equal(L.state.balance,JSON.parse(before)[0]);clean(h);
});
check('runtime category hints stay plain after purpose controls refresh them',()=>{
 const h=fixture(),{L}=h;L.startSend('lumo');settle(h);const hint=h.document.getElementById('payment-plan-hint');assert(hint);hint.textContent='All use your operational account.';L.experienceClarity.syncNames();assert.equal(hint.textContent,'Paid from Everyday money.');clean(h);
});
check('account and Money Box labels become plain while customer notes and names are preserved',()=>{
 const h=fixture(),{L}=h,before=facts(L),name='Your budget uses your operational account.';L.state.paymentDraft={name,note:name};
 const html='<h1>'+name+'</h1><div class="focus-note">'+name+'</div><span>Operational balance available</span><p>This moves sample money from your operational account into savings.</p>';
 const shown=L.experienceClarity.plainMarkup(html,'allocate');assert(shown.includes('<h1>'+name+'</h1>'));assert(shown.includes('<div class="focus-note">'+name+'</div>'));assert(shown.includes('Available Everyday money'));assert(shown.includes('This moves sample Everyday money into savings.'));
 assert(!L.bankDetailsText().includes('Operational account number:'));assert.equal(L.state.balance,JSON.parse(before)[0]);clean(h);
});
check('new context stays behind existing sign-in and closure guards',()=>{
 const h=fixture(),{L}=h;for(const patch of [{locked:true},{closed:true},{onboarded:false}]){Object.assign(L.state,{locked:false,closed:false,onboarded:true},patch);assert.equal(L.experienceClarity.basis().status,'unavailable');assert(!L.views.home().includes('data-budget-basis'));}clean(h);
});
console.log(count+' experience clarity checks passed.');
