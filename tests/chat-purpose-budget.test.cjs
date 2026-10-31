/* Exercise the shipped conversation, source selection and shared projections. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let count=0;
function check(name,run){run();count++;console.log('PASS '+name);}
function fixture(overrides={}){
 const h=createHarness({clock:true}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:500,txs:[],chats:[],paymentDraft:null,planSaved:true,planDraft:null,
  essentials:[{id:'food',name:'Food',amount:350,paid:0,externalPaid:0,coverageVersion:1}],
  goals:[{id:'laptop',name:'Laptop',allocated:100,target:3000,boxVersion:2}],
  planHorizon:{mode:'date',date:'2099-01-01'},...overrides});
 L.openTab('chat');h.flush();return h;
}
const funds=L=>JSON.stringify([L.state.balance,L.state.essentials,L.state.goals,L.state.txs,L.state.paymentDraft]);
function ask(h,q){h.set('chatText',q);h.L.askChat();h.flush();return h.L.state.chats.at(-1);}
function button(h,label){const b=h.document.getElementById('view').querySelectorAll('button').find(b=>b.textContent.trim()===label);assert(b,'Visible '+label);return b;}
const clean=h=>assert.deepEqual(h.errors,[]);
check('ambiguous Food question asks once before displaying a numerical conclusion',()=>{
 const h=fixture(),before=funds(h.L),a=ask(h,'Can I spend GH₵80 on food?');
 assert(a.budgetPurpose);assert(!a.planImpact);assert(!a.calculation);
 assert.equal(a.budgetPurpose.choices.length,2);button(h,'From Food');button(h,'Extra spending');
 assert.equal(funds(h.L),before);clean(h);
});
check('one tap fulfils the existing Budget line in Chat without moving any money',()=>{
 const h=fixture(),{L}=h,before=funds(L);ask(h,'Can I spend GH₵80 on food?');h.set('chatText','Unsent follow-up');button(h,'From Food').click();h.flush();
 const a=L.state.chats.at(-1),p=L.planImpactSummary({amount:80,fee:0,essentialId:'food'});
 assert.equal(a.planImpact.room,150);assert.equal(a.planImpact.after,420);assert.equal(a.planImpact.essentialsAfter,270);
 assert.equal(a.headline,p.headline);assert.match(a.support,/From your Food/);assert.equal(h.document.getElementById('chatText').value,'Unsent follow-up');assert.equal(funds(L),before);clean(h);
});
check('one tap for extra spending matches the unlinked payment calculation',()=>{
 const h=fixture();ask(h,'Can I spend GH₵80 on food?');button(h,'Extra spending').click();h.flush();
 const a=h.L.state.chats.at(-1);assert.equal(a.planImpact.room,70);assert.equal(a.planImpact.essentialsAfter,350);assert.match(a.support,/Checked as extra spending/);clean(h);
});
check('an explicit Budget source is respected with no extra clarification',()=>{
 const h=fixture(),a=h.L.chatAnswer('Can I spend GH₵80 from my Food budget?');
 assert(!a.budgetPurpose);assert.equal(a.planImpact.room,150);assert.equal(a.lastAffordability.sourceId,'food');clean(h);
});
check('amount corrections retain the source and historical rechecks do not turn it into extra spending',()=>{
 const h=fixture(),{L}=h;ask(h,'Can I spend GH₵80 from my Food budget?');
 const a=ask(h,'Actually make it 140');assert.equal(a.planImpact.room,150);assert.equal(a.planImpact.essentialsAfter,210);
 L.state.balance=600;L.render();L.chatCheckAgain(1);h.flush();assert.equal(L.state.chats.at(-1).planImpact.room,250);assert.equal(L.state.chats.at(-1).lastAffordability.sourceId,'food');clean(h);
});
check('a new unrelated affordability question does not borrow the preceding Budget source',()=>{
 const h=fixture();ask(h,'Can I spend GH₵80 from my Food budget?');const a=ask(h,'Can I spend GH₵140?');
 assert.equal(a.planImpact.room,10);assert.equal(a.lastAffordability.sourceId,'');clean(h);
});
check('an amount correction can explicitly switch from a Budget source to extra spending',()=>{
 const h=fixture();ask(h,'Can I spend GH₵80 from my Food budget?');const a=ask(h,'Actually make it GH₵140 as extra spending');
 assert.equal(a.planImpact.room,10);assert.equal(a.lastAffordability.sourceId,'');clean(h);
 const next=ask(h,'Actually make it GH₵100');assert.equal(next.planImpact.room,50);assert.equal(next.lastAffordability.sourceId,'');clean(h);
});
check('negated or competing source wording asks rather than choosing the wrong assumption',()=>{
 const h=fixture();for(const q of ['Can I spend GH₵80 without using my Food budget?','Can I spend GH₵80 not from my Food budget?','Can I spend GH₵80 from my Food budget or spare money?','Can I spend GH₵80 from my Food budget rather than spare money?']){
  const a=h.L.chatAnswer(q);assert(a.budgetPurpose,q);assert(!a.planImpact,q);
 }clean(h);
});
check('Food is recognised within a compound label but its purpose is never silently inferred',()=>{
 const h=fixture({essentials:[{id:'food',name:'Food & groceries',amount:350,paid:0}]}),a=h.L.chatAnswer('Can I spend GH₵80 on food?');
 assert(a.budgetPurpose);assert.equal(a.budgetPurpose.choices[0].name,'Food & groceries');clean(h);
});
check('unknown and removed named Budget sources require a new choice',()=>{
 const h=fixture(),{L}=h,a=ask(h,'Can I spend GH₵80 using my Rent budget?');assert(a.budgetPurpose);assert(!a.planImpact);
 L.state.essentials=[];L.chatChooseBudget(0,0);h.flush();const fresh=L.state.chats.at(-1);assert(fresh.budgetPurpose);assert(!fresh.planImpact);assert.equal(fresh.budgetPurpose.choices.length,1);clean(h);
});
check('completed saved costs are recognised and a depleted source explains spare money',()=>{
 const h=fixture({essentials:[{id:'food',name:'Food',amount:350,paid:350,externalPaid:350,coverageVersion:1}]}),a=h.L.chatAnswer('Can I spend GH₵80 from my Food budget?');
 assert.equal(a.planImpact.hasPlan,true);assert.doesNotMatch(a.headline,/No budget/);assert.match(a.support,/Food is used up/);assert.match(a.support,/No unpaid saved costs remain/);assert.equal(a.planImpact.room,420);clean(h);
});
check('expired Budget advice states the saved period and provides a working date action',()=>{
 const h=fixture({planHorizon:{mode:'date',date:'2020-10-01'}}),a=ask(h,'Can I spend GH₵80?');
 assert.match(a.support,/through 1 Oct 2020/);assert.equal(a.route,'planPeriod');button(h,'Review Budget dates').click();h.flush();assert.equal(h.L.route,'planPeriod');clean(h);
});
check('a source covered by pending payments is not described as already used up',()=>{
 const h=fixture({txs:[{id:'pendingFood',type:'out',status:'pending',amount:350,fee:0,essentialId:'food',date:new Date().toISOString()}]}),a=h.L.chatAnswer('Can I spend GH₵80 from my Food budget?');
 assert.match(a.support,/Food has GH₵350.00 pending/);assert.doesNotMatch(a.support,/Food is used up/);assert.equal(a.planImpact.room,70);clean(h);
});
check('financial fixtures agree for extra 80, 140 and 280 with separate Money Box funds',()=>{
 const h=fixture(),{L}=h,before=funds(L);
 for(const [amount,room,available,gap]of [[80,70,420,0],[140,10,360,0],[280,0,220,130]]){
  const a=L.chatAnswer(`Can I spend GH₵${amount} as extra spending?`),p=L.planImpactSummary(amount);
  assert.equal(a.planImpact.room,room);assert.equal(a.planImpact.after,available);assert.equal(a.planImpact.totalGap,gap);assert.equal(a.headline,p.headline);
 }
 assert.equal(funds(L),before);clean(h);
});
console.log(count+' Chat purpose and Budget state checks passed.');
