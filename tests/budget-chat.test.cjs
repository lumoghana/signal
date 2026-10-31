/* Budget and Chat use the two-account financial authority. This harness checks
   behavior and preserved state, not browser layout or a live payment network. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
const root=path.join(__dirname,'../dist');
const scripts=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
assert(scripts.includes('two-account-engine.js'),'The shipped entry must load the two-account financial authority');
let passed=0;
const check=(name,run)=>{run();passed++;console.log('PASS '+name);};
function fixture(patch={}){
 const h=createHarness({clock:true,modules:scripts}),{L}=h;L.explore();
 Object.assign(L.state,{balance:600,txs:[],essentials:[{id:'food',name:'Food and transport',amount:350,paid:0}],goals:[{id:'laptop',name:'Laptop',target:3500,allocated:100}],planSaved:true,planDraft:null,allowance:{amount:800,date:'',source:'Family'},chats:[],paymentDraft:null,...patch});
 delete L.state.accounts;L.ensureAccounts();
 L.route='home';L.params={};L.history=[];L.save();L.render();h.flush();
 return h;
}
function show(h,route){h.L.route=route;h.L.params={};h.L.render();h.flush();}
const financialFacts=L=>copy({balance:L.state.balance,goals:L.state.goals,essentials:L.state.essentials,txs:L.state.txs});

check('migrated savings do not create a budget or enter its setup',()=>{
 const h=fixture({essentials:[],planSaved:false}),{L}=h;
 assert.equal(L.accountBalances().available,500);assert.equal(L.accountBalances().savings,100);
 assert.equal(L.hasMeaningfulPlan(),false);assert.equal(L.planScopeSummary().costCount,0);assert.equal(L.planScopeSummary().goalCount,0);
 L.openPlanBenefit();assert.equal(L.route,'planBenefit');
 assert.match(L.views.planBenefit(),/What is a budget\?/);assert.match(L.views.planBenefit(),/Money Boxes are separate savings/);
 L.buildPlanFromBenefit();assert.equal(L.route,'firstEssentials');
 const setup=L.views.firstEssentials();assert.doesNotMatch(setup,/firstGoal|Add a goal|goal allocation/);
 assert.match(setup,/1 of 2/);assert.deepEqual(h.errors,[]);
});

check('a budget draft cannot be saved with savings alone and keeps entered fields',()=>{
 const h=fixture({essentials:[],planSaved:false}),{L}=h;
 show(h,'firstEssentials');h.set('firstEssName','');h.set('firstEssAmount','');L.reviewFirstPlanCosts();
 assert.equal(L.route,'firstEssentials');assert.equal(L.state.planSaved,false);
 assert.equal(L.state.goals[0].allocated,100);assert.equal(L.state.balance,500);
 show(h,'firstPlanReview');const saved=copy(L.state.planDraft);L.saveFirstPlan();
 assert.equal(L.route,'firstPlanReview');assert.equal(L.state.planSaved,false);assert.deepEqual(copy(L.state.planDraft),saved);
 assert.match(h.document.getElementById('error').textContent,/Add a cost before saving your budget/);
});

check('budget save preserves a Money Box funded after the budget draft was opened',()=>{
 const h=fixture({essentials:[],planSaved:false}),{L}=h;
 show(h,'firstEssentials');h.set('firstEssName','Food');h.set('firstEssAmount','200');
 L.reviewFirstPlanCosts();assert.equal(L.route,'firstPlanReview');
 // A real savings movement occurs after the draft captured the previous box.
 L.transferMoneyBox({id:'laptop',direction:'in',amount:20,draftId:'fund-during-budget'});
 assert.equal(L.state.planDraft.goals[0].allocated,100);assert.equal(L.state.goals[0].allocated,120);
 const before=financialFacts(L),p=L.firstPlanPosition();assert.equal(p.available,480);assert.equal(p.allocated,0);assert.equal(p.room,280);
 L.saveFirstPlan();assert.equal(L.route,'home');assert.equal(L.state.planSaved,true);
 assert.equal(L.state.essentials[0].name,'Food');assert.equal(L.state.essentials[0].amount,200);
 assert.deepEqual(copy(L.state.goals),before.goals);assert.deepEqual(copy(L.state.txs),before.txs);assert.equal(L.state.balance,before.balance);
 assert.equal(L.state.planDraft,null);assert.equal(L.balances().room,280);assert.deepEqual(h.errors,[]);
});

check('Budget editing and explanation keep Money Boxes in a separate journey',()=>{
 const {L}=fixture(),edit=L.views.planEdit(),explanation=L.views.planExplanation();
 assert.match(edit,/Edit your Budget/);assert.match(edit,/Choose an item to change/);assert.match(edit,/Expected money/);
 assert.doesNotMatch(edit,/Add a goal|go\('goals'|go\('goalEdit'|firstGoal/);
 assert.match(explanation,/Money Boxes are already in your savings account/);
 assert.doesNotMatch(explanation,/<dt>.*(?:goal|Money Box).*<\/dt>/);
 assert.match(explanation,/GH₵150.00/);
});

check('legacy student-written cost names survive standard category editing and previews',()=>{
 const h=fixture({essentials:[{id:'legacy',name:'Plan B essentials',amount:350,paid:0}],planSaved:true}),{L}=h;
 show(h,'firstEssentials');L.capturePlanDraft();
 assert.match(h.document.getElementById('first-cost-preview').textContent,/GH₵150.00 left after your budget/);
 L.reviewFirstPlanCosts();assert.match(L.views.firstPlanReview(),/>Plan B essentials<\/span>/);
 L.saveFirstPlan();assert.equal(L.state.essentials[0].name,'Plan B essentials');
 const reply=L.chatAnswer('Can I spend GH₵280?');assert.equal(reply.headline,L.planImpactSummary(280).headline);
 assert.match(reply.headline,/^Plan B essentials would/);assert.match(reply.text,/^Plan B essentials would/);
});

check('Chat and payment projections share the same operational arithmetic',()=>{
 const {L}=fixture(),before=financialFacts(L);
 assert.equal(L.accountBalances().operational,500);assert.equal(L.accountBalances().savings,100);assert.equal(L.balances().room,150);
 for(const [amount,after,room,gap]of [[80,420,70,0],[140,360,10,0],[280,220,0,130]]){
  const p=L.planImpactSummary({amount,fee:0}),reply=L.chatAnswer('Can I spend GH₵'+amount+'?');
  assert.equal(reply.intent,'affordability');assert.equal(reply.planImpact.after,after);assert.equal(reply.planImpact.room,room);
  assert.equal(reply.planImpact.essentialGap,gap);assert.equal(reply.planImpact.goalGap,0);assert.equal(reply.planImpact.totalGap,gap);
  assert.equal(reply.planImpact.after,p.after);assert.equal(reply.planImpact.headline,p.headline);
  assert(reply.calculation.rows.some(([label,value])=>label==='Available Everyday money'&&value==='GH₵500.00'));
  assert.doesNotMatch(JSON.stringify(reply.calculation.rows),/Goal money uncovered|Money set aside for goals|Money Box.*uncovered/);
  assert.doesNotMatch(reply.text,/essentials|saved plan|goals/);
 }
 assert.deepEqual(financialFacts(L),before,'Advice never moves money or consumes a budget cost');
});

check('a linked budget payment is fulfilled once and Chat sees the resulting room',()=>{
 const {L}=fixture(),p=L.planImpactSummary({amount:80,fee:0,essentialId:'food'});
 assert.equal(p.essentialCovered,80);assert.equal(p.room,150);
 L.addTx({type:'out',status:'success',amount:80,fee:0,essentialId:'food',draftId:'food-80',name:'Lunch and transport'});
 assert.equal(L.state.balance,420);assert.equal(L.balances().essentials,270);assert.equal(L.accountBalances().savings,100);
 const reply=L.chatAnswer('What is left after my budget?');assert.match(reply.headline,/GH₵150.00 is left/);
 assert(reply.calculation.rows.some(([label,value])=>label==='Unpaid budget costs'&&value==='GH₵270.00'));
});

check('Chat explains that savings require an explicit transfer back before spending',()=>{
 const {L}=fixture(),before=financialFacts(L),reply=L.chatAnswer('Can I spend my savings?');
 assert.equal(reply.intent,'savings');assert.match(reply.headline,/Move Money Box funds back before you spend them/);
 assert.equal(reply.route,'goals');assert.match(reply.support,/GH₵500.00/);assert(reply.calculation.rows.some(([label,value])=>label==='Money Box savings'&&value==='GH₵100.00'));
 const blocked=L.chatAnswer('Can I spend GH₵550?');assert.match(blocked.headline,/GH₵50.00 more/);assert.equal(blocked.route,'goals');assert.match(blocked.support,/Move money back to Everyday money/);
 assert.deepEqual(financialFacts(L),before);
});

check('internal savings movements never appear as spending in Chat or Money Story',()=>{
 const h=fixture(),{L}=h;
 L.transferMoneyBox({id:'laptop',direction:'in',amount:20,draftId:'internal-in'});L.transferMoneyBox({id:'laptop',direction:'out',amount:15,draftId:'internal-out'});
 L.addTx({type:'out',status:'success',amount:30,fee:.5,category:'Food',name:'Lunch',draftId:'external-lunch'});
 // Defensive filtering for historic internal records with an outgoing type.
 L.state.txs.push({id:'old-internal',type:'out',status:'success',amount:9,fee:0,internalTransfer:true,category:'Savings',date:new Date().toISOString()});
 const summary=L.spendingSummary({days:30});assert.equal(summary.total,30.5);assert.equal(summary.txs.length,1);assert.equal(summary.txs[0].name,'Lunch');
 const reply=L.chatAnswer('Where did my money go?');assert.match(reply.text,/GH₵30.50/);assert.doesNotMatch(reply.text,/Savings was/);
 assert.equal(L.accountBalances().savings,105);
});

check('Chat never converts expected income or an unknown allowance date into received money or a promise',()=>{
 const {L}=fixture(),before=financialFacts(L),reply=L.chatAnswer('How long will my money last?');
 assert.match(reply.headline,/When do you expect your next allowance/);assert.match(reply.support,/can’t promise this will last/);
 assert.match(reply.support,/Expected allowance is not received money/);assert.equal(reply.route,'chatDatePicker');assert.equal(reply.context.pendingPlanning.kind,'allowance-date');
 assert.equal(L.chatAnswer('Can I spend GH₵700?').planImpact.canPay,false);assert.deepEqual(financialFacts(L),before);
});

check('the public sample uses the budget engine and never changes real account or payment state',()=>{
 const {L}=fixture(),before=JSON.stringify(L.state),p=L.samplePauseImpact();
 assert.equal(p.available,600);assert.equal(p.essentialsBefore,350);assert.equal(p.roomBefore,250);assert.equal(p.after,320);assert.equal(p.essentialGap,30);assert.equal(p.goalGap,0);
 L.views.planBenefit();L.views.samplePause();assert.equal(JSON.stringify(L.state),before);
});

check('a savings answer remains a historical snapshot when a Money Box changes',()=>{
 const h=fixture(),{L}=h;L.openTab('chat');h.flush();h.set('chatText','How much is in my Money Boxes?');h.submit(h.document.getElementById('view').querySelector('.chat-entry'));h.flush();
 const saved=copy(L.state.chats[0]);assert.equal(saved.intent,'savings');
 L.transferMoneyBox({id:'laptop',direction:'in',amount:20,draftId:'saved-more'});L.render();h.flush();
 assert.match(h.document.querySelector('.chat-snapshot-status').textContent,/Earlier answer/);
 assert.equal(L.chatCheckAgain(0),true);assert.equal(L.state.chats.length,2);assert.deepEqual(copy(L.state.chats[0]),saved);
 assert.match(L.state.chats[1].headline,/GH₵120.00 is saved/);assert.equal(L.state.txs.filter(t=>t.draftId==='saved-more').length,1);assert.deepEqual(h.errors,[]);
});

console.log(passed+' budget and Chat separation checks passed.');
