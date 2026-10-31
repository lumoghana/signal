/* Plan is the stable navigation route for two distinct account jobs. These
   checks use mounted controls, not hand-written URLs or duplicated arithmetic. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const index=fs.readFileSync(path.resolve(__dirname,'../dist/index.html'),'utf8');
const modules=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
if(!modules.includes('plan-hub.js'))modules.splice(modules.indexOf('ambassador.js'),0,'plan-hub.js');
let passed=0;
const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
const view=h=>h.document.getElementById('view');
const clean=h=>assert.deepEqual(h.errors,[]);
function fixture({budget=true,boxes=true}={}){
 const h=createHarness({clock:true,testing:true,modules}),{L}=h;L.explore();
 Object.assign(L.state,{balance:500,txs:[],essentials:budget?[{id:'food',name:'Food and transport',amount:350,paid:0}]:[],goals:boxes?[{id:'laptop',name:'Laptop',allocated:100,target:3500,boxVersion:2}]:[],planSaved:budget,planDraft:null,paymentDraft:null,planHorizon:{mode:'unspecified',date:''},allowance:{amount:0,date:''}});
 L.save();L.route='home';L.params={};L.history=[];L.render();h.flush();L.openTab('plan');h.flush();return h;
}
const action=(h,text)=>{const control=view(h).querySelectorAll('button').find(button=>button.textContent.trim()===text);assert(control,text);control.click();h.flush();return control;};
check('Plan contains separate Budget and Money Box sections with their account roles',()=>{
 const h=fixture(),{L}=h,el=view(h);assert.equal(L.route,'plan');assert(el.querySelector('.plan-hub'));
 const budget=el.querySelector('.plan-budget-section'),boxes=el.querySelector('.plan-boxes-section');assert(budget);assert(boxes);
 assert(budget.textContent.includes('Everyday money'));assert(boxes.textContent.includes('Savings account'));assert(budget.textContent.includes('150'));assert(budget.textContent.includes('350.00'));assert(boxes.textContent.includes('100'));assert(boxes.textContent.includes('1 Money Box'));
 assert(!budget.textContent.includes('goal allocation'));assert.equal(L.accountBalances().total,600);clean(h);
});
check('Budget edit opens its existing sheet and leaves Money Box funds untouched',()=>{
 const h=fixture(),{L}=h;action(h,'Update budget');assert.equal(L.route,'planEdit');assert(L.taskSheet.active);assert(!view(h).querySelector('#goalName'));assert.equal(L.accountBalances().savings,100);assert.equal(L.state.balance,500);clean(h);
});
check('Adding a budget item opens the existing editor with no transfer',()=>{
 const h=fixture(),{L}=h;action(h,'Update budget');action(h,'Add a budget item');assert.equal(L.route,'essentialEdit');assert(view(h).querySelector('#essName'));assert.equal(L.state.txs.length,0);assert.equal(L.accountBalances().total,600);clean(h);
});
check('View Money Boxes opens saved boxes, while add opens a zero-funded creation form',()=>{
 const h=fixture(),{L}=h;action(h,'View Money Boxes');assert.equal(L.route,'goals');assert(view(h).textContent.includes('Laptop'));
 L.closeTask();h.flushHistory();h.flush();L.openTab('plan');h.flush();action(h,'Add a box');assert.equal(L.route,'goalEdit');assert(view(h).querySelector('#goalName'));assert.equal(L.state.goals.length,1);assert.equal(L.accountBalances().savings,100);clean(h);
});
check('Budget period and calculation remain working optional detail actions',()=>{
 const h=fixture(),{L}=h;const details=view(h).querySelector('.plan-hub-details');assert(details);assert(!details.hasAttribute('open'));
 const date=details.querySelectorAll('button').find(button=>button.getAttribute('onclick')==="L.go('planPeriod')");assert(date);date.click();h.flush();assert.equal(L.route,'planPeriod');assert(view(h).querySelector('#planPeriodMode'));assert.equal(L.balances().room,150);
 L.closeTask();h.flushHistory();h.flush();L.openTab('plan');h.flush();const calculation=view(h).querySelectorAll('button').find(button=>button.getAttribute('onclick')==="L.go('planExplanation')");assert(calculation);calculation.click();h.flush();assert.equal(L.route,'planExplanation');assert(view(h).textContent.includes('Money Boxes are already in your savings account'));clean(h);
});
check('A new account can create a Money Box before saving any Budget',()=>{
 const h=fixture({budget:false,boxes:false}),{L}=h;assert(view(h).textContent.includes('Create a budget'));assert(view(h).textContent.includes('Create a Money Box'));
 action(h,'Create a Money Box');assert.equal(L.route,'goalEdit');assert.equal(L.state.essentials.length,0);assert.equal(L.state.txs.length,0);clean(h);
});
check('An unfinished Budget resumes its saved setup step without changing saved savings',()=>{
 const h=fixture({budget:false}),{L}=h;L.state.planDraft={step:'firstEssentials',allowance:{amount:0,date:''},essentials:[],goals:[],planHorizon:{mode:'unspecified',date:''}};L.render();h.flush();action(h,'Continue budget');assert.equal(L.route,'firstEssentials');assert.equal(L.state.goals[0].allocated,100);assert.equal(L.state.balance,500);clean(h);
});
check('Uncovered Budget and pending savings show distinct, factual status',()=>{
 const h=fixture(),{L}=h;L.state.balance=200;L.transferMoneyBox({id:'laptop',direction:'out',amount:20,draftId:'pending-back',status:'pending'});L.openTab('home');L.openTab('plan');h.flush();
 const budget=view(h).querySelector('.plan-budget-section'),boxes=view(h).querySelector('.plan-boxes-section');assert(budget.textContent.includes('150.00 of your Budget is uncovered'));assert(boxes.textContent.includes('transfer in progress'));assert.equal(L.state.balance,200);assert.equal(L.accountBalances().savings,100);clean(h);
});
console.log(passed+' Plan hub journey checks passed.');
