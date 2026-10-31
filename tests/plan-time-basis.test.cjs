/* The first cost makes its time basis explicit, without inventing a forecast.
   Exercise the shipped controls and preserve financial state until confirmation. */
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let passed=0;
const check=(name,run)=>{run();passed++;console.log('PASS '+name);};
const view=h=>h.document.getElementById('view');
function fixture(){
 const h=createHarness(),{L}=h;L.explore();
 Object.assign(L.state,{balance:600,txs:[],essentials:[],goals:[],allowance:{amount:0,date:''},planDraft:null,planSaved:false,planHorizon:{mode:'unspecified',date:''}});
 L.go('firstEssentials');h.flush();return h;
}
function input(h,id,value,event='oninput'){
 const field=h.set(id,value),handler=field.getAttribute(event);assert(handler,'Shipped '+event+' handler on '+id);vm.runInContext(handler,h.context);h.flush();
}
function click(h,label){const button=view(h).querySelectorAll('button').find(x=>x.textContent.trim()===label);assert(button,'Visible '+label);button.click();h.flush();}
function clean(h){assert.deepEqual(h.errors,[]);}
check('a visible period choice starts Not sure yet and never adopts expected money silently',()=>{
 const h=fixture(),{L}=h,select=h.document.getElementById('firstPlanPeriodMode');
 assert(select);assert.equal(select.closest('details'),null,'The period is not hidden behind an optional disclosure');
 assert.equal(select.value,'unspecified');assert(select.textContent.includes('Not sure yet'));
 assert(h.document.getElementById('firstEssAmount').getAttribute('aria-describedby').includes('first-cost-period-help'));
 assert(h.document.getElementById('first-cost-period-help').textContent.includes('One total, not per day'));
 assert.equal(L.state.planDraft.planHorizon.date,'');assert.equal(L.state.essentials.length,0);clean(h);
});
check('a chosen date and current cost name explain the amount before Review and survive editing',()=>{
 const h=fixture(),{L}=h,now=new Date(),future=new Date(now.getFullYear(),now.getMonth(),now.getDate()+7),date=[future.getFullYear(),String(future.getMonth()+1).padStart(2,'0'),String(future.getDate()).padStart(2,'0')].join('-');
 input(h,'firstEssName','Food');input(h,'firstEssAmount',200);input(h,'firstPlanPeriodMode','date','onchange');input(h,'firstPlanPeriodDate',date);
 const help=h.document.getElementById('first-cost-period-help').textContent;
 assert(help.startsWith('Food: one total through '));assert(help.endsWith(', not per day.'));
 input(h,'firstEssName','Transport');assert(h.document.getElementById('first-cost-period-help').textContent.startsWith('Transport:'));
 click(h,'Review my plan');assert.equal(L.route,'firstPlanReview');assert(view(h).querySelector('.first-plan-period-review').textContent.startsWith('Cost totals planned through '));
 assert.equal(L.state.balance,600);assert.equal(L.state.essentials.length,0);assert.equal(L.state.planHorizon.date,'');
 click(h,'Edit costs');assert.equal(h.document.getElementById('firstPlanPeriodDate').value,date);assert.equal(L.state.planDraft.essentials[0].amount,200);clean(h);
});
check('unknown period remains explicit at Review and saves a cost total without a daily forecast',()=>{
 const h=fixture(),{L}=h;input(h,'firstEssName','Food');input(h,'firstEssAmount',50);click(h,'Review my plan');
 assert(view(h).querySelector('.first-plan-period-review').textContent.includes('No end date yet. These are cost totals, not daily amounts.'));
 click(h,'Save my plan');assert.equal(L.state.planHorizon.mode,'unspecified');assert.equal(L.state.planHorizon.date,'');assert.equal(L.state.essentials[0].amount,50);assert.equal(L.balances().room,550);assert.equal(L.state.balance,600);clean(h);
});
check('plain goal actions keep the same plan-only arithmetic and separate confirmations',()=>{
 const h=fixture(),{L}=h;L.state.planDraft=null;L.state.essentials=[{id:'food',name:'Food',amount:350,paid:0}];L.state.goals=[{id:'laptop',name:'Laptop',target:3500,allocated:100}];L.state.planSaved=true;L.go('goal',{id:'laptop'});h.flush();
 click(h,'Set aside money');assert(view(h).textContent.includes('GH₵150.00 left after your plan'));h.set('allocation',50);click(h,'Review amount set aside');assert.equal(L.state.goals[0].allocated,100);click(h,'Save amount set aside');assert.equal(L.state.goals[0].allocated,150);assert.equal(L.balances().room,100);
 click(h,'Set aside less');h.set('release',30);click(h,'Review change');assert.equal(L.state.goals[0].allocated,150);click(h,'Save change');assert.equal(L.state.goals[0].allocated,120);assert.equal(L.balances().room,130);assert.equal(L.state.balance,600);assert.equal(L.state.txs.length,0);clean(h);
});
console.log(passed+' plan time-basis and plain-goal checks passed.');
