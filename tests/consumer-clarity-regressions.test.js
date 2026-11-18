import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmptyState} from '../dist/js/model.js';
import {getLuxAnswer, executeLuxPlan} from '../dist/js/lux-brain.js';
import {getMoneyAnswer} from '../dist/js/money-answers.js';
import {handleLux} from '../api/lux.mjs';
import {rememberMainTab,mainTabDestination} from '../dist/js/main-tab-state.js';
import {createConsumerRewards} from '../dist/js/consumer-rewards.js';

const now=new Date('2026-11-18T12:00:00Z'),OWNER='11111111-1111-4111-8111-111111111111';
const SHOP='22222222-2222-4222-8222-222222222222',BUSINESS='33333333-3333-4333-8333-333333333333',MEMBER='loyalty-member-44444444-4444-4444-8444-444444444444';
function account(){
 const s=createEmptyState({name:'Ama'});s.onboardingDone=true;s.wallet=10000;s.buffer=0;
 s.budget={created:true,items:[],endDate:'2026-11-25'};s.income={amount:99999,nextDate:'2026-11-20'};
 s.ious=[
  {id:'in-today',name:'Incoming Esi',type:'owedToMe',amount:5000,paid:500,status:'open',due:'2026-11-18'},
  {id:'in-tomorrow',name:'Incoming Sena',type:'owedToMe',amount:8000,paid:0,status:'open',due:'2026-11-19'},
  {id:'in-overdue',name:'Incoming Kofi',type:'owedToMe',amount:3000,paid:1000,status:'open',due:'2026-11-17'},
  {id:'in-undated',name:'Incoming No Date',type:'owedToMe',amount:9000,paid:0,status:'open'},
  {id:'in-paid',name:'Already Paid',type:'owedToMe',amount:50000,paid:50000,status:'open',due:'2026-11-18'},
  {id:'in-closed',name:'Closed IOU',type:'owedToMe',amount:60000,paid:0,status:'settled',due:'2026-11-18'},
  {id:'out-today',name:'Outgoing Akos',type:'owedByMe',amount:2000,paid:500,status:'open',due:'2026-11-18'},
  {id:'out-tomorrow',name:'Outgoing Abena',type:'owedByMe',amount:6000,paid:0,status:'open',due:'2026-11-19'},
 ];return s;
}
const body=a=>a.paragraphs.join(' '),total=a=>a.stats?.[0]?.value;

test('ordinary incoming IOU questions retain direction through the actual local answer engine',()=>{
 const s=account(),before=JSON.stringify(s);
 for(const question of ['What do people owe me?','What am I owed?','How much is owed to me?','Who owes me?','Who dey owe me?','Show money owed to me','How much do my friends owe me?']){
  const a=getLuxAnswer(s,question,{now});assert.equal(a.context.topic,'expected',question);assert.equal(total(a),'GH₵235.00',question);
  assert.match(body(a),/Incoming/);assert.doesNotMatch(body(a),/Outgoing|999\.99|Already Paid|Closed IOU/);assert.match(body(a),/not.*available|not.*spendable|never.*available/i);
 }
 assert.equal(JSON.stringify(s),before);
});

test('due scope follows IOU direction instead of substituting daily spending or all future money',()=>{
 const cases=[
  ['Who owes me today?','expected','GH₵45.00','Incoming Esi'],
  ['What do I owe today?','debts','GH₵15.00','Outgoing Akos'],
  ['How much is owed by me today?','debts','GH₵15.00','Outgoing Akos'],
  ['Which of my debts are overdue?','debts','GH₵0.00', 'no open outgoing'],
  ['What am I owed tomorrow?','expected','GH₵80.00','Incoming Sena'],
  ['What do I owe tomorrow?','debts','GH₵60.00','Outgoing Abena'],
  ['Which IOUs owed to me are overdue?','expected','GH₵20.00','Incoming Kofi'],
  ['What do people owe me on 2026-11-19?','expected','GH₵80.00','Incoming Sena'],
  ['What do I owe on 2026-11-18?','debts','GH₵15.00','Outgoing Akos'],
 ];
 for(const [question,topic,amount,name]of cases){const a=getLuxAnswer(account(),question,{now});assert.equal(a.context.topic,topic,question);assert.equal(total(a),amount,question);assert.match(body(a),new RegExp(name));assert.doesNotMatch(body(a),/GH₵999\.99|Already Paid|Closed IOU/);}
 const direct=getMoneyAnswer(account(),'Who owes me today?',now);assert.equal(total(direct),'GH₵45.00');
});

test('ambiguous direction and unsupported or conflicting dates ask rather than invent a financial answer',()=>{
 for(const question of ['Who owes me and what do I owe?','Show my IOUs','What do I owe on Friday?','Who owes me today and tomorrow?','Who owes me on 2026-02-30?','What do I owe next month?','What do I owe by tomorrow?','Who owes me in 2 weeks?','What do I owe in two weeks?']){
  const a=getLuxAnswer(account(),question,{now});assert.equal(a.context.topic,'clarify',question);assert.equal(a.stats?.length||0,0);assert.doesNotMatch(body(a),/GH₵/);
 }
});

test('IOU date follow-ups preserve direction, while new topics do not inherit it',()=>{
 const s=account(),first=getLuxAnswer(s,'Who owes me today?',{now}),messages=[{role:'assistant',...first}];
 const next=getLuxAnswer(s,'And tomorrow?',{now,messages});assert.equal(next.context.topic,'expected');assert.equal(total(next),'GH₵80.00');assert.match(next.context.canonicalQuestion,/owe.*me.*tomorrow/i);
 const stale=[...messages,{role:'assistant',...getLuxAnswer(s,'Hey Lux!',{now})}];assert.equal(getLuxAnswer(s,'And tomorrow?',{now,messages:stale}).context.topic,'clarify');
});

test('IOU week boundaries use recorded due dates and exclude undated IOUs without pretending they are settled',()=>{
 const s=account();s.ious.push({id:'next-week',name:'Incoming Kojo',type:'owedToMe',amount:700,paid:0,status:'open',due:'2026-11-23'});
 for(const [at,question,amount]of [[now,'Who owes me this week?','GH₵145.00'],[now,'Who owes me next week?','GH₵7.00'],[new Date('2026-11-23T00:00:00Z'),'Who owes me this week?','GH₵7.00'],[new Date('2026-11-23T00:00:00Z'),'Which IOUs owed to me are overdue?','GH₵145.00']]){
  const a=getLuxAnswer(s,question,{now:at});assert.equal(total(a),amount,question+' '+at.toISOString());assert.match(body(a),/1 open IOU has no valid due date.*excluded/);assert.equal(a.context.topic,'expected');
 }
});

test('explicit recorded IOU meaning cannot be overridden by an unrelated interpreter plan',()=>{
 const a=executeLuxPlan(account(),'What do people owe me?',{task:'balance'},{now,mode:'ai'});
 assert.equal(a.context.topic,'expected');assert.equal(total(a),'GH₵235.00');assert.equal(a.engine,'ai');
 const affordability=getLuxAnswer(account(),'Can I afford GH₵150 lunch if Esi owes me today?',{now});assert.equal(affordability.context.topic,'afford');assert.match(body(affordability),/short|spending account holds|available/i);
});

test('the recorded hosted API fallback gives current IOU direction and due scope without sending a money action',async()=>{
 const s=account(),calls=[],before=JSON.stringify(s);
 const result=await handleLux({method:'POST',authorization:'Bearer a.b.c',body:{question:'What do people owe me today?',context:{questions:[]}}},{credential:'',limiter:new Map(),now,fetcher:async(url,init)=>{
  calls.push(JSON.parse(init.body));return {ok:true,status:200,json:async()=>({ok:true,state:s,account:{userId:OWNER},sandbox:true,currency:'GHS'})};
 }});
 assert.equal(result.status,200);assert.equal(result.body.mode,'recorded');assert.equal(result.body.answer.context.topic,'expected');assert.equal(total(result.body.answer),'GH₵45.00');assert.ok(calls.every(x=>x.action==='snapshot'));assert.equal(JSON.stringify(s),before);
});

test('brief Pay returns retain typed shop/programme/membership identities including nested parents',()=>{
 const s=account(),d={},route={section:'pay',page:'rewards',membershipId:MEMBER,businessId:BUSINESS,shopId:SHOP,backTo:{section:'pay',page:'rewards',shopId:SHOP,returnTo:{section:'pay',page:'rewards',businessId:BUSINESS}}};
 rememberMainTab(d,route,97,undefined,10000);
 assert.deepEqual(mainTabDestination('pay',s,d,{now:11000,currentRoute:{section:'home',page:'home'}}),{route,scroll:97});
 assert.deepEqual(mainTabDestination('pay',s,d,{now:15000,currentRoute:{section:'home',page:'home'}}),{route:{section:'pay',page:'home'},scroll:0});
 assert.deepEqual(mainTabDestination('pay',s,{}, {now:11000}),{route:{section:'pay',page:'home'},scroll:0});
 const out=account();out.account.signedOut=true;assert.equal(mainTabDestination('pay',out,d,{now:11000}).route.page,'account-access');
});

test('reward checkpoint identities cannot persist malformed IDs or private linking codes',()=>{
 const d={};rememberMainTab(d,{section:'pay',page:'rewards',shopId:'LC1-'+'a'.repeat(48),businessId:'not-a-uuid',membershipId:'LC1-'+'b'.repeat(48),claimCode:'LC1-private',backTo:{section:'pay',page:'rewards',membershipId:'<script>secret</script>'}},42,undefined,10000);
 assert.deepEqual(d.mainTabs.pay.route,{section:'pay',page:'rewards',backTo:{section:'pay',page:'rewards'}});assert.doesNotMatch(JSON.stringify(d.mainTabs),/LC1|script|secret/);
});

test('returning from Home reopens the actual rewards controller at the original shop programme',async()=>{
 const s=account(),d={},calls=[],route={section:'pay',page:'rewards',shopId:SHOP};
 const programme={merchantId:BUSINESS,merchantName:'Campus Kitchen',programme:{id:'programme',name:'Kitchen Regulars',status:'active'},rules:{version:1,earning:'visits',target:5,minimumSpend:2000,reward:{type:'discount',value:500,name:'Five cedis off',minimumSpend:2000,expiryDays:30}},terms:'Five visits earns five cedis off.',ruleVersion:1,consentVersion:'test-consent',shops:[{id:SHOP,name:'Night Market',accepting:true,published:true}],canJoin:true};
 const ui=createConsumerRewards({getUserId:()=>OWNER,getIdentity:()=>OWNER+':session-1',isAuthenticated:()=>true,storage:null,api:async(op,payload)=>{calls.push({op,payload});return {ok:true,loyalty:{version:'1.1.0',memberships:[],membership:null,programme:op==='programme'?programme:null}};}});
 ui.open(route);await ui.refresh();assert.match(ui.render(),/Join this programme/);rememberMainTab(d,route,44,undefined,10000);ui.leave();
 const restored=mainTabDestination('pay',s,d,{now:11000,currentRoute:{section:'home',page:'home'}});ui.open(restored.route);await ui.refresh();
 assert.deepEqual(calls,[{op:'programme',payload:{shopId:SHOP}},{op:'programme',payload:{shopId:SHOP}}]);assert.deepEqual(ui.getView().context,{shopId:SHOP});assert.match(ui.render(),/Kitchen Regulars/);assert.match(ui.render(),/Join this programme/);assert.equal(s.transactions.length,0);assert.equal(s.wallet,10000);
});
