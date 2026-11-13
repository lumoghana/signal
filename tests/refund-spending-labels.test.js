import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmptyState} from '../dist/js/model.js';
import {getMoneyAnswer} from '../dist/js/money-answers.js';
import {getMonthlyInsights,renderInsights} from '../dist/js/insights.js';
import {renderLife} from '../dist/js/life.js';
const now=new Date('2030-04-10T12:00:00Z');
const at='2030-04-05T12:00:00Z';
const text=answer=>[answer.title,...answer.paragraphs].join(' ');
function fixture(){const s=createEmptyState();s.settings.hideBalance=false;s.transactions=[{id:'payment',ledgerJournalId:'journal-original',type:'payment',direction:'out',status:'success',amount:10000,fee:0,merchant:'Synthetic shop',category:'Food',rail:'lumo',at},{id:'refund',originalPaymentId:'journal-original',type:'refund',direction:'in',status:'success',amount:2000,merchant:'Synthetic shop',category:'Food',rail:'lumo',at},{id:'card',type:'card-purchase',direction:'out',status:'success',amount:5000,refunded:1000,merchant:'Synthetic data',category:'Data',rail:'card',at}];return s;}

test('Chat labels ordinary merchant refund arrivals separately while retaining existing card netting',()=>{
 const s=fixture(),a=getMoneyAnswer(s,'Show my spending in April 2030',now);assert.match(a.title,/GH₵140.00.*before merchant refunds/);assert.match(text(a),/GH₵20.00 in merchant refunds arrived/);assert.match(text(a),/Card refunds already reduce/);assert.equal(a.stats.find(x=>x.label==='Merchant refunds received').value,'GH₵20.00');
 const data=getMoneyAnswer(s,'Show my spending on Data in April 2030',now);assert.match(data.title,/GH₵40.00/);assert.doesNotMatch(text(data),/GH₵20.00|before merchant refunds/);
});

test('refund arrivals do not rewrite payment totals from a different period or count as income',()=>{
 const s=fixture();s.transactions[1].at='2030-03-05T12:00:00Z';const a=getMoneyAnswer(s,'Show my spending in April 2030',now);assert.doesNotMatch(a.title,/before merchant refunds/);const month=getMonthlyInsights(s,'2030-04',now);assert.equal(month.spent,14000);assert.equal(month.moneyIn,0);assert.equal(month.merchantRefunds,0);
});

test('Insights and Story label merchant refunds without exposing hidden amounts',t=>{
 t.mock.timers.enable({apis:['Date'],now});
 const s=fixture(),month=getMonthlyInsights(s,'2030-04',now);assert.equal(month.spent,14000);assert.equal(month.merchantRefunds,2000);assert.equal(month.moneyIn,0);
 const html=renderInsights({state:s},{month:'2030-04'});assert.match(html,/Payments before merchant refunds/);assert.match(html,/merchant refunds arrived this month/);
 s.settings.hideBalance=true;const story=renderLife({state:s,draft:{}},{section:'life',page:'story'});assert.match(story,/Payments made is before ••••/);assert.doesNotMatch(story,/GH₵20.00|GH₵140.00/);const hidden=renderInsights({state:s},{month:'2030-04'});assert.doesNotMatch(hidden,/GH₵20.00/);
});
