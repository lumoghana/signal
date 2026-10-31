/* Natural student wording shares the shipped category and financial authority.
   Conversation prepares choices and drafts; it cannot move account money. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let count=0;const check=(name,fn)=>{fn();count++;console.log('PASS '+name);};
const clone=x=>JSON.parse(JSON.stringify(x));
const view=h=>h.document.getElementById('view');
const day=n=>new Date(Date.parse(new Date().toISOString().slice(0,10)+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
function fixture(patch={}){
 const h=createHarness({clock:true}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:500,txs:[],chats:[],paymentDraft:null,planDraft:null,budgetGuideSession:null,budgetCycleDraft:null,budgetHistoryDraft:null,planSaved:true,
 essentials:[{id:'food',name:'Food',budgetCategory:'food',amount:250,paid:0,externalPaid:0,coverageVersion:1},{id:'transport',name:'Transport',budgetCategory:'transport',amount:100,paid:0,externalPaid:0,coverageVersion:1}],
 goals:[{id:'laptop',name:'Laptop',target:3000,allocated:100,boxVersion:2}],allowance:{amount:600,date:day(7),source:'Family'},planHorizon:{mode:'date',date:day(6)},...patch});
 L.openTab('chat');h.flush();return h;
}
const saved=L=>JSON.stringify([L.state.balance,L.state.essentials,L.state.goals,L.state.txs,L.state.paymentDraft,L.state.allowance,L.state.planHorizon]);
const clean=h=>assert.deepEqual(h.errors,[]);
function ask(h,q){h.set('chatText',q);h.L.askChat();h.flushHistory();h.flush();return h.L.state.chats.at(-1);}
function click(h,label){const buttons=view(h).querySelectorAll('button').filter(b=>b.textContent.trim()===label);assert(buttons.length,'Working '+label+' on '+h.L.route);buttons.at(-1).click();h.flushHistory();h.flush();}
function start(h){assert.equal(h.L.budgetGuide.start(),true);h.flushHistory();h.flush();assert.equal(h.L.route,'chat');assert(h.L.budgetGuide.active());}
check('food, lunch, groceries, waakye and Gɔbɛ offer the same single-tap Budget or extra-spending clarification',()=>{
 const h=fixture(),{L}=h,before=saved(L);
 for(const q of ['Can I spend GH₵80 on food?','Can I buy lunch for GH₵80?','Can I buy groceries for GH₵80?','Can I buy waakye for GH₵80?','Can I buy Gɔbɛ for GH₵80?']){
  const r=ask(h,q);assert(r.budgetPurpose,q);assert.deepEqual(clone(r.budgetPurpose.choices),[{id:'food',name:'Food'},{id:'',name:'Extra spending'}]);assert.equal(r.planImpact,undefined);
 }
 assert.equal(saved(L),before);clean(h);
});
check('one clarification tap uses the same engine result and never counts Food twice',()=>{
 const h=fixture(),{L}=h,before=saved(L);ask(h,'Can I buy lunch for GH₵80?');click(h,'From Food');const r=L.state.chats.at(-1);assert.equal(r.planImpact.essentialCovered,80);assert.equal(r.planImpact.after,420);assert.equal(r.planImpact.room,150);
 ask(h,'Can I buy lunch for GH₵80?');click(h,'Extra spending');assert.equal(L.state.chats.at(-1).planImpact.room,70);assert.equal(saved(L),before);clean(h);
});
check('explicit familiar source aliases can link a projection while unknown purposes never fulfil a Budget',()=>{
 const h=fixture(),{L}=h,before=saved(L);const r=ask(h,'Can I spend GH₵80 from lunch?');assert.equal(r.planImpact.essentialCovered,80);assert.equal(r.planImpact.room,150);
 const extra=ask(h,'Can I buy earrings for GH₵80?');assert.equal(extra.planImpact.essentialCovered,0);assert.equal(extra.planImpact.room,70);assert.equal(saved(L),before);clean(h);
});
check('legacy custom labels with fixed metadata use the same familiar category vocabulary',()=>{
 const h=fixture({essentials:[{id:'weekly',name:'Weekly needs',budgetCategory:'food',amount:350,paid:0}]}),r=ask(h,'Can I buy lunch for GH₵80?');assert.equal(r.budgetPurpose.choices[0].id,'weekly');assert.equal(r.budgetPurpose.choices[0].name,'Weekly needs');clean(h);
});
check('uncertainty during first Budget setup stays in guidance and offers a usable estimate path',()=>{
 const h=fixture({essentials:[],planSaved:false,planHorizon:{mode:'unspecified',date:''}}),{L}=h,before=saved(L);start(h);const r=ask(h,'I don’t know how much I spend');assert.equal(r.intent,'budgetGuide');assert.match(r.headline,/estimate one cost/i);assert(L.budgetGuide.active());
 click(h,'Food');assert.equal(L.state.budgetGuideSession.pending.kind,'daily-rate');ask(h,'30');click(h,'Seven days');assert.equal(L.state.planDraft.essentials[0].amount,210);assert.match(L.state.chats.at(-1).headline,/GH₵30.00 × 7 days = GH₵210.00/);assert.equal(saved(L),before);clean(h);
});
check('a natural unsure phrase preserves an amount already entered and offers one-tap estimate help',()=>{
 const h=fixture({essentials:[],planSaved:false}),{L}=h;L.go('firstEssentials');h.flush();h.set('firstEssName','Food');h.set('firstEssAmount','250');start(h);ask(h,'I’m not sure what to budget');assert.equal(L.state.planDraft.essentialFields.amount,'250');assert.equal(L.state.budgetGuideSession.pending.amount,250);click(h,'Help me estimate');assert.equal(L.state.budgetGuideSession.pending.kind,'daily-rate');assert.equal(L.state.essentials.length,0);clean(h);
});
check('a stated planning resource and Friday period do not become income or a Budget cost',()=>{
 const h=fixture({essentials:[],planSaved:false,planHorizon:{mode:'unspecified',date:''}}),{L}=h,before=saved(L);start(h);const r=ask(h,'I have GH₵600 to last me till next Friday');
 assert.equal(r.intent,'budgetGuide');assert.match(r.support,/stated planning amount, not new money/);assert.match(r.support,/Only GH₵500.00 is currently available/);assert.equal(L.state.planDraft.essentials.length,0);assert.equal(L.state.planDraft.planHorizon.date,L.chatPlanning.parseDate('next Friday'));assert.equal(L.state.budgetGuideSession.resourceContext.amount,600);assert.equal(saved(L),before);clean(h);
});
check('an unlabelled resource amount uses account cedi context and preserves the period when no date was given',()=>{
 const h=fixture({essentials:[],planSaved:false,planHorizon:{mode:'unspecified',date:''}}),{L}=h,before=saved(L);start(h);ask(h,'I have600 to last me');assert.equal(L.state.planDraft.essentials.length,0);assert.equal(L.state.budgetGuideSession.resourceContext.amount,600);assert.equal(L.state.planDraft.planHorizon.mode,'unspecified');assert.equal(saved(L),before);clean(h);
});
check('a relative change updates only the same unsaved draft and requires existing Review and Save',()=>{
 const h=fixture(),{L}=h,before=saved(L);start(h);const r=ask(h,'Can you lower food by50?');assert.equal(r.intent,'budgetGuide');assert.match(r.headline,/GH₵250.00 − GH₵50.00 = GH₵200.00/);assert.equal(L.state.planDraft.essentials[0].id,'food');assert.equal(L.state.planDraft.essentials[0].amount,200);assert.equal(saved(L),before);
 click(h,'Review Budget');assert.equal(L.route,'firstPlanReview');assert.equal(L.state.essentials[0].amount,250);click(h,'Save my budget');assert.equal(L.state.essentials[0].amount,200);assert.equal(L.state.balance,500);assert.equal(L.state.goals[0].allocated,100);assert.equal(L.state.txs.length,0);clean(h);
});
check('zero, excessive, ambiguous or foreign-currency relative changes preserve the draft and saved facts',()=>{
 for(const q of ['Lower Food by250','Increase Food by1000000','Lower Food by50 or60','Lower Food by USD50']){const h=fixture(),{L}=h,before=saved(L);start(h);const draft=JSON.stringify(L.state.planDraft.essentials);ask(h,q);assert.equal(JSON.stringify(L.state.planDraft.essentials),draft,q);assert.equal(saved(L),before,q);clean(h);}
});
check('an unknown relative item asks a one-tap choice instead of changing a different Budget',()=>{
 const h=fixture(),{L}=h,before=saved(L);start(h);ask(h,'Lower my Rent budget by50');assert.equal(L.state.budgetGuideSession.pending.kind,'relative');assert.equal(L.state.planDraft.essentials[0].amount,250);assert.equal(L.state.planDraft.essentials[1].amount,100);click(h,'Transport');assert.equal(L.state.planDraft.essentials[1].amount,50);assert.equal(L.state.planDraft.essentials[0].amount,250);assert.equal(saved(L),before);clean(h);
});
check('duplicate older Food items need an explicit choice for a relative change',()=>{
 const h=fixture({essentials:[{id:'groceries',name:'Food & groceries',amount:150,paid:0},{id:'lunch',name:'Lunch',amount:100,paid:0}]}),{L}=h,before=saved(L);start(h);ask(h,'Lower Food by50');assert.equal(L.state.budgetGuideSession.pending.kind,'relative');click(h,'Food & groceries');assert.equal(L.state.planDraft.essentials[0].amount,100);assert.equal(L.state.planDraft.essentials[1].amount,100);assert.equal(saved(L),before);clean(h);
});
check('unresolved relative choices cannot be bypassed by saving from a review route',()=>{
 const h=fixture(),{L}=h,before=saved(L);start(h);ask(h,'Lower Rent by50');L.go('firstPlanReview');h.flush();L.saveFirstPlan();h.flush();assert.equal(saved(L),before);assert.match(view(h).textContent,/Finish the category or total choice/);clean(h);
});
check('a saved relative change is a reviewable proposal with no account or Budget mutation until Save',()=>{
 const h=fixture(),{L}=h,before=saved(L),r=ask(h,'Can you lower my Food budget by50?');assert.equal(r.planningEdit.amount,200);assert.match(r.support,/GH₵250.00 − GH₵50.00 = GH₵200.00/);assert.equal(saved(L),before);click(h,'Review Budget edit');assert.equal(h.document.getElementById('essAmount').value,'200');assert.equal(L.state.essentials[0].amount,250);click(h,'Save budget item');assert.equal(L.state.essentials[0].amount,200);assert.equal(L.state.balance,500);assert.equal(L.state.goals[0].allocated,100);assert.equal(L.state.txs.length,0);clean(h);
});
check('saved relative changes reject pending payments and invalid nonpositive totals',()=>{
 const h=fixture({txs:[{id:'pending-food',type:'out',status:'pending',amount:20,essentialId:'food'}]}),before=saved(h.L),r=ask(h,'Lower Food by50');assert.equal(r.planningEdit,undefined);assert.match(r.headline,/pending/);assert.equal(saved(h.L),before);clean(h);
 const other=fixture(),savedBefore=saved(other.L),bad=ask(other,'Lower Food by250');assert.equal(bad.planningEdit,undefined);assert.match(bad.headline,/different total/);assert.equal(saved(other.L),savedBefore);clean(other);
});
check('relative item choices cannot apply an old delta after the saved total changes',()=>{
 const h=fixture({essentials:[{id:'groceries',name:'Food & groceries',amount:150,paid:0},{id:'lunch',name:'Lunch',amount:100,paid:0}]}),{L}=h;ask(h,'Lower Food by50');assert(L.state.chats.at(-1).planningChoice);L.state.essentials[0].amount=180;const before=saved(L);click(h,'Food & groceries');assert.equal(saved(L),before);assert.equal(L.state.essentials[0].amount,180);clean(h);
});
check('staged unknown categories survive natural uncertainty and resource questions',()=>{
 const h=fixture(),{L}=h;start(h);ask(h,'Church50');assert.equal(L.state.budgetGuideSession.pending.kind,'category');const queue=JSON.stringify(L.state.budgetGuideSession.pending.queue);ask(h,'I don’t know how much I spend');assert.equal(JSON.stringify(L.state.budgetGuideSession.pending.queue),queue);ask(h,'I have600 to last me till next Friday');assert.equal(JSON.stringify(L.state.budgetGuideSession.pending.queue),queue);assert.equal(L.state.essentials.length,2);clean(h);
});
check('negated relative changes leave both saved and unsaved Budget totals intact',()=>{
 for(const guided of [false,true]){const h=fixture(),{L}=h,before=saved(L);if(guided)start(h);ask(h,'Do not lower Food by50');assert.equal(saved(L),before);if(guided)assert.equal(L.state.planDraft.essentials[0].amount,250);assert.equal(L.state.chats.at(-1).planningEdit,undefined);clean(h);}
});
check('uncertainty about a named category starts its estimate and preserves that question on resume',()=>{
 const h=fixture({essentials:[],planSaved:false,planHorizon:{mode:'unspecified',date:''}}),{L}=h;start(h);ask(h,'I don’t know how much I spend on food');assert.equal(L.state.budgetGuideSession.pending.kind,'daily-rate');assert.equal(L.state.budgetGuideSession.pending.name,'Food');L.budgetGuide.pause();h.flush();L.budgetGuide.resume();h.flush();assert.match(L.state.chats.at(-1).headline,/pay for Food each day/);assert.equal(L.state.essentials.length,0);clean(h);
});
console.log(count+' natural student Budget conversation checks passed.');
