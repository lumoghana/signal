import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmptyState,getSummary,getGuidanceHorizon,evaluatePayment,applyAction} from '../dist/js/model.js';
import {getMoneyAnswer} from '../dist/js/money-answers.js';
import {renderLife} from '../dist/js/life.js';
import * as server from '../backend/supabase/functions/lumo-approved/domain/model.js';

const now=new Date('2030-04-10T12:00:00Z');
const date=n=>new Date(now.getTime()+n*86400000).toISOString().slice(0,10);
const prose=answer=>[answer.title,...answer.paragraphs].join(' ');
function account(){const s=createEmptyState({name:'Synthetic Reviewer'});s.wallet=30000;s.buffer=0;s.income={amount:0,nextDate:''};s.settings.hideBalance=false;s.budget={...s.budget,created:true,endDate:date(7),items:[{id:'food',name:'Food',amount:10000,spent:0}]};return s;}
const debt=(amount,due,extra={})=>({id:'debt',name:'Synthetic creditor',type:'owedByMe',status:'open',amount,paid:0,due,...extra});

test('Chat and Pause describe the same existing gap for a payment inside an underfunded category',()=>{
 const s=account();s.wallet=10000;s.budget.items[0].amount=20000;const before=structuredClone(s);
 const impact=evaluatePayment(s,{amount:5000,category:'Food',fee:0},now),answer=getMoneyAnswer(s,'Can I spend GH₵50 on food?',now);
 assert.equal(impact.needed,true);assert.equal(impact.baselineShortfall,10000);assert.equal(impact.additionalShortfall,0);
 assert.equal(answer.title,'This needs a pause.');assert.match(prose(answer),/already have a GH₵100.00 gap/);assert.match(prose(answer),/leaves that gap unchanged/);assert.doesNotMatch(prose(answer),/would remain after the rest/);assert.deepEqual(s,before);
});

test('Chat quantifies an additional gap using the shared payment evaluation',()=>{
 const s=account();s.wallet=10000;s.budget.items[0].amount=20000;
 const impact=evaluatePayment(s,{amount:5000,category:'Other',fee:0},now),answer=getMoneyAnswer(s,'Can I spend GH₵50 on a game?',now);
 assert.equal(impact.additionalShortfall,5000);assert.match(prose(answer),/adds GH₵50.00 to that gap/);assert.equal(answer.title,'This needs a pause.');
});

test('a genuinely covered category keeps its allocation and does not invent a gap',()=>{
 const s=account(),answer=getMoneyAnswer(s,'Can I spend GH₵50 on food?',now),impact=evaluatePayment(s,{amount:5000,budgetItemId:'food'},now);
 assert.equal(impact.afterPlanned,5000);assert.equal(impact.afterAvailable,25000);assert.equal(impact.afterSpendable,20000);assert.equal(answer.title,'That fits your plan.');assert.match(prose(answer),/GH₵200.00 would remain/);
});

test('extended recovery reserves debt falling due before its check-in without spending expected money',()=>{
 const s=account();s.income={amount:900000,nextDate:date(7)};s.ious=[debt(10000,date(10))];s.recovery={active:true,checkInDate:date(14)};
 const summary=getSummary(s,now),answer=getMoneyAnswer(s,'How much can I spend daily?',now);
 assert.equal(summary.planned,20000);assert.equal(summary.spendable,10000);assert.equal(summary.commitmentDate,date(14));assert.equal(summary.daysLeft,14);assert.equal(summary.dailyAllowance,714);assert.equal(summary.expected,900000);assert.match(prose(answer),/GH₵7.14 a day/);
 assert.deepEqual(server.getSummary(structuredClone(s),now),summary,'the authoritative server uses the same calculation');
});

test('overdue debts remain reserved when plan timing has expired',()=>{
 const s=account();s.budget.endDate=date(-7);s.ious=[debt(10000,date(0))];
 const summary=getSummary(s,now);assert.equal(summary.planned,20000);assert.equal(summary.commitmentDate,date(0));assert.equal(summary.daysLeft,0);assert.equal(summary.dailyAllowance,0);assert.equal(summary.hasDailyGuide,false);
});

test('a shorter recovery does not release obligations from the still-active longer plan',()=>{
 const s=account();s.budget.endDate=date(14);s.recovery={active:true,checkInDate:date(3)};s.ious=[debt(10000,date(10))];
 const summary=getSummary(s,now);assert.equal(summary.daysLeft,3);assert.equal(summary.commitmentDate,date(14));assert.equal(summary.planned,20000);assert.equal(summary.dailyAllowance,3333);
});

test('linked IOU coverage remains counted once across an extended recovery horizon',()=>{
 const s=account();s.ious=[debt(10000,date(10),{budgetItemId:'food'})];s.recovery={active:true,checkInDate:date(14)};
 assert.equal(getSummary(s,now).planned,10000);s.ious.push(debt(5000,date(12),{id:'other-debt',budgetItemId:'food'}));assert.equal(getSummary(s,now).planned,15000);
});

test('a category purchase cannot release the IOU commitment that category was covering',()=>{
 const s=account();s.wallet=20000;s.ious=[debt(10000,date(5),{budgetItemId:'food'})];
 const impact=evaluatePayment(s,{amount:5000,category:'Food',fee:0},now);assert.equal(impact.budgetAllocation,5000);assert.equal(impact.afterPlanned,10000);assert.equal(impact.afterSpendable,5000);
 const paid=applyAction(s,'payment',{amount:5000,category:'Food',merchant:'Synthetic food seller',fee:0});assert.equal(paid.ok,true);assert.equal(getSummary(s,now).planned,impact.afterPlanned);assert.equal(getSummary(s,now).spendable,impact.afterSpendable);
 assert.equal(s.ious[0].paid,0,'buying food is not repayment of the linked IOU');
});

test('an actual linked IOU repayment releases the obligation and category once',()=>{
 const s=account();s.wallet=20000;s.ious=[debt(10000,date(5),{budgetItemId:'food'})];
 const impact=evaluatePayment(s,{amount:5000,iouId:'debt',category:'IOU',fee:0},now);assert.equal(impact.afterPlanned,5000);assert.equal(impact.afterSpendable,10000);
});

test('a new account has no invented income date or daily spending promise',()=>{
 const s=createEmptyState();s.wallet=100000;s.buffer=0;s.settings.hideBalance=false;
 assert.equal(s.income.nextDate,'');assert.equal(s.budget.endDate,'');
 const summary=getSummary(s,now);assert.equal(summary.guidanceDate,'');assert.equal(summary.daysLeft,0);assert.equal(summary.dailyAllowance,0);assert.equal(summary.hasDailyGuide,false);
 assert.equal(getMoneyAnswer(s,'How much can I spend today?',now).title,'Let’s refresh the timing.');
 const story=renderLife({state:s,draft:{}},{section:'life',page:'story'});assert.match(story,/Add a planning end date before using a daily guide/);assert.doesNotMatch(story,/a day until your next expected income/);
 assert.equal(evaluatePayment(s,{amount:5000,fee:0,category:'Other'},now).needed,false,'there is no imaginary day threshold');
});

test('an old zero-income placeholder date cannot become a guide',()=>{
 const s=createEmptyState();s.income={amount:0,nextDate:date(14)};
 assert.equal(getGuidanceHorizon(s,now).recorded,false);assert.equal(getSummary(s,now).dailyAllowance,0);
 s.budget={...s.budget,created:true,endDate:'2030-02-30'};assert.equal(getGuidanceHorizon(s,now).recorded,false);
});

test('positive recorded income establishes timing without increasing held money',()=>{
 const s=createEmptyState();s.wallet=7000;s.buffer=0;s.income={amount:100000,nextDate:date(7)};
 const summary=getSummary(s,now);assert.equal(summary.available,7000);assert.equal(summary.spendable,7000);assert.equal(summary.expected,100000);assert.equal(summary.dailyAllowance,1000);assert.equal(summary.guidanceSource,'income');
});
