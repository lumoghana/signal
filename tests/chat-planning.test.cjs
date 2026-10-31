/* Shipped Chat planning: item facts, explicit edits, and missing-date follow-up. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let count=0;const check=(name,run)=>{run();count++;console.log('PASS '+name);};
const view=h=>h.document.getElementById('view');
const funds=L=>JSON.stringify([L.state.balance,L.state.goals,L.state.txs,L.state.paymentDraft]);
const plan=L=>JSON.stringify([L.state.essentials,L.state.allowance]);
const clean=h=>assert.deepEqual(h.errors,[]);
function fixture(patch={},options={}){
 const h=createHarness({clock:true,...options}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:500,txs:[],chats:[],paymentDraft:null,planSaved:true,planDraft:null,firstBudgetPayoff:null,
  essentials:[{id:'food',name:'Food',amount:350,paid:0,externalPaid:0,coverageVersion:1,date:''}],
  goals:[{id:'laptop',name:'Laptop',allocated:100,target:3000,boxVersion:2}],
  allowance:{amount:0,date:'',source:'Family'},planHorizon:{mode:'date',date:'2099-01-01'},...patch});
 L.openTab('chat');h.flush();return h;
}
function ask(h,q){h.set('chatText',q);h.L.askChat();h.flush();return h.L.state.chats.at(-1);}
function click(h,label){const el=view(h).querySelectorAll('button').find(b=>b.textContent.trim()===label);assert(el,'Visible '+label+' on '+h.L.route);el.click();h.flush();}
check('a named Budget answer separates Food remaining from whole-Budget spare money',()=>{
 const h=fixture(),{L}=h,before=funds(L),saved=plan(L);
 for(const q of ['What is left in my Food budget?','How much can I spend from my Food budget?']){
  const a=ask(h,q);assert.equal(a.headline,'GH₵350.00 remains in Food.');assert.match(a.support,/GH₵150.00 is left outside/);assert.equal(a.route,'chatBudgetItem');
 }
 assert.equal(funds(L),before);assert.equal(plan(L),saved);click(h,'See Food');assert.equal(L.route,'essentialEdit');assert.equal(L.params.id,'food');clean(h);
});
check('ordinary food-money wording names the same item without requiring the word Budget',()=>{
 const h=fixture(),{L}=h,before=funds(L),saved=plan(L);
 for(const q of ['What’s left for food?','What do I have left for food?','How much food money do I have?','What is my Food balance?']){
  const a=ask(h,q);assert.equal(a.headline,'GH₵350.00 remains in Food.');assert.match(a.support,/GH₵150.00 is left outside/);assert.equal(a.route,'chatBudgetItem');
 }
 const a=ask(h,'Set food to GH₵300');assert.equal(a.intent,'planningEdit');assert.equal(a.planningEdit.amount,300);assert.equal(plan(L),saved);assert.equal(funds(L),before);
 const b=ask(h,'Do not set food to GH₵300');assert.equal(b.intent,'planningCancelled');assert.equal(plan(L),saved);
 assert(ask(h,'Can I spend GH₵80 on food?').budgetPurpose);assert.equal(ask(h,'How much did I spend on Food today?').intent,'calendarSpending');clean(h);
});
check('coverage projections can use a cloned state through the same ledger authority',()=>{
 const h=fixture(),{L}=h,before=JSON.stringify(L.state),copy=JSON.parse(before);
 copy.txs=[{id:'original',type:'out',status:'success',amount:80,essentialId:'food',refunded:20},{id:'refund',type:'in',status:'success',amount:20,originalId:'original'}];
 assert.equal(L.confirmedEssentialPaid('food',copy),60);L.reconcileEssentialCoverage(copy);assert.equal(copy.essentials[0].paid,60);assert.equal(copy.essentials[0].externalPaid,0);assert.equal(JSON.stringify(L.state),before);clean(h);
});
check('named facts include confirmed coverage and pending reserves exactly once',()=>{
 const h=fixture({essentials:[{id:'food',name:'Food',amount:350,paid:80,externalPaid:80,coverageVersion:1}],txs:[{id:'pendingFood',type:'out',status:'pending',amount:20,fee:0,essentialId:'food',date:new Date().toISOString()}]}),a=ask(h,'What is left in my Food budget?');
 assert.equal(a.headline,'GH₵250.00 remains in Food.');assert.match(a.support,/GH₵20.00 is reserved/);assert.equal(a.calculation.rows.find(x=>x[0]==='Covered so far')[1],'GH₵80.00');assert.equal(a.calculation.rows.find(x=>x[0]==='Pending payments')[1],'GH₵20.00');clean(h);
});
check('a first named answer reconciles a stale loaded coverage cache before quoting any figure',()=>{
 const h=fixture(),{L}=h;L.state.txs.unshift({id:'loadedSuccess',type:'out',status:'success',amount:80,fee:0,essentialId:'food',date:new Date().toISOString()});
 L.state.essentials[0].paid=0;const before=funds(L),a=L.chatAnswer('What is left in my Food budget?');
 assert.equal(a.headline,'GH₵270.00 remains in Food.');assert.equal(a.calculation.rows.find(x=>x[0]==='Covered so far')[1],'GH₵80.00');assert.equal(a.calculation.rows.find(x=>x[0]==='Still to cover')[1],'GH₵270.00');assert.equal(L.state.essentials[0].paid,80);assert.equal(funds(L),before);clean(h);
});
check('an edit proposal reconciles loaded coverage before taking its stale-change snapshot',()=>{
 const h=fixture(),{L}=h;L.state.txs.unshift({id:'loadedSuccess',type:'out',status:'success',amount:80,fee:0,essentialId:'food',date:new Date().toISOString()});
 L.state.essentials[0].paid=0;const before=funds(L),q='Change my Food budget to GH₵300',a=L.chatAnswer(q);L.state.chats.push({q,...a});L.params=a.context;L.render();h.flush();
 click(h,'Review Budget edit');assert.equal(L.route,'essentialEdit');assert.equal(L.state.essentials[0].paid,80);assert.equal(L.state.essentials[0].amount,350);click(h,'Save budget item');
 assert.equal(L.route,'chat');assert.equal(L.state.essentials[0].amount,300);assert.equal(L.state.essentials[0].paid,80);assert.equal(L.state.chats.at(-1).headline,'GH₵220.00 remains in Food.');assert.equal(funds(L),before);clean(h);
});
check('an underfunded item is described as a cost still to cover rather than spendable account money',()=>{
 const h=fixture({balance:100}),a=ask(h,'How much can I spend from my Food budget?');assert.equal(a.headline,'Food has GH₵350.00 still to cover.');assert.match(a.support,/GH₵100.00 is available/);assert.match(a.support,/GH₵250.00 of your saved Budget is uncovered/);clean(h);
});
check('whole-Budget questions and purchase affordability retain their existing authority',()=>{
 const h=fixture(),{L}=h;assert.match(ask(h,'What is left after my budget?').headline,/GH₵150.00 is left/);
 assert(ask(h,'Can I spend GH₵80 on food?').budgetPurpose);assert.equal(ask(h,'Can I spend GH₵80 from my Food budget?').planImpact.room,150);
 assert.equal(L.chatAnswer('How much did I spend on Food today?').intent,'calendarSpending');clean(h);
});
check('pending money beyond the saved cost does not reduce confirmed coverage in the explanation',()=>{
 const h=fixture({essentials:[{id:'food',name:'Food',amount:350,paid:100,externalPaid:100,coverageVersion:1}],txs:[{id:'largePending',type:'out',status:'pending',amount:300,fee:0,essentialId:'food',date:new Date().toISOString()}]}),a=ask(h,'What is left in my Food budget?');
 assert.equal(a.calculation.rows.find(x=>x[0]==='Covered so far')[1],'GH₵100.00');assert.equal(a.calculation.rows.find(x=>x[0]==='Pending payments')[1],'GH₵300.00');assert.equal(a.calculation.rows.find(x=>x[0]==='Of pending, covering this Budget item')[1],'GH₵250.00');clean(h);
});
check('missing Budget items provide a working start action and negated edits stay unchanged',()=>{
 const h=fixture({essentials:[],planSaved:false});const a=ask(h,'What is left in my Food budget?');assert.equal(a.headline,'No Budget items are saved yet.');assert(!a.planningChoice);click(h,'Create a Budget');assert.equal(h.L.route,'plan');clean(h);
 const other=fixture(),before=plan(other.L);const b=ask(other,'Don’t change my Food budget to GH₵300');assert.equal(b.intent,'planningCancelled');assert(!b.planningEdit);assert.equal(plan(other.L),before);clean(other);
});
check('ambiguous and unknown item names ask rather than quote an arbitrary balance',()=>{
 const h=fixture({essentials:[{id:'groceries',name:'Food & groceries',amount:200,paid:0},{id:'takeaway',name:'Food & takeaway',amount:150,paid:0}]}),a=ask(h,'What is left in my Food budget?');
 assert(a.planningChoice);assert(!a.calculation);click(h,'Food & groceries');assert.equal(h.L.state.chats.at(-1).headline,'GH₵200.00 remains in Food & groceries.');
 assert(ask(h,'What is left in my Rent budget?').planningChoice);clean(h);
});
check('a Chat Budget proposal opens an editable existing form and saves only on explicit Save',()=>{
 const h=fixture(),{L}=h,before=funds(L),saved=plan(L);ask(h,'Change my Food budget to GH₵300');h.set('chatText','Keep this unsent');click(h,'Review Budget edit');
 assert.equal(L.route,'essentialEdit');assert.equal(h.document.getElementById('task-sheet-title').textContent,'Edit Budget item');assert.equal(h.document.getElementById('essAmount').value,'300');assert.equal(plan(L),saved);assert.equal(funds(L),before);
 assert.match(view(h).textContent,/Current saved total: GH₵350.00/);assert.match(view(h).querySelector('#chat-budget-projection').textContent,/GH₵200.00 left after Budget/);
 h.set('essAmount',320);assert.match(view(h).querySelector('#chat-budget-projection').textContent,/GH₵180.00 left after Budget/);click(h,'Save budget item');
 assert.equal(L.route,'chat');assert.equal(L.state.essentials[0].amount,320);assert.equal(L.balances().room,180);assert.equal(h.document.getElementById('chatText').value,'Keep this unsent');assert.equal(funds(L),before);clean(h);
});
check('closing an edit retains saved costs and its unfinished fields without changing a payment',()=>{
 const h=fixture({paymentDraft:{id:'keep',method:'lumo',name:'Ama',amount:12.34}}),{L}=h,before=funds(L),saved=plan(L);
 ask(h,'Change my Food budget to GH₵300');click(h,'Review Budget edit');h.set('essAmount',310);L.closeTask();h.flushHistory();h.flush();
 assert.equal(L.route,'chat');assert.equal(plan(L),saved);assert.equal(funds(L),before);click(h,'Review Budget edit');assert.equal(h.document.getElementById('essAmount').value,'310');clean(h);
});
check('the optional estimator returns into a Chat proposal without saving it or losing its context',()=>{
 const h=fixture(),{L}=h,saved=plan(L);ask(h,'Change my Food budget to GH₵300');click(h,'Review Budget edit');click(h,'Help me estimate');h.set('estimate-rate',25);h.set('estimate-count',7);click(h,'Use this amount');
 assert.equal(L.route,'essentialEdit');assert.equal(h.document.getElementById('essAmount').value,'175.00');assert.match(view(h).querySelector('#chat-budget-projection').textContent,/GH₵325.00 left after Budget/);assert.equal(plan(L),saved);click(h,'Save budget item');assert.equal(L.route,'chat');assert.equal(L.state.essentials[0].amount,175);clean(h);
});
check('stale, expired, removed, pending or locked edits cannot change a saved item',()=>{
 for(const mode of ['changed','expired','removed','pending','locked']){
  const h=fixture(),{L}=h;ask(h,'Change my Food budget to GH₵300');
  if(mode==='changed')L.state.essentials[0].amount=400;
  if(mode==='expired')h.advance(16*60*1000);
  if(mode==='removed')L.state.essentials=[];
  if(mode==='pending')L.state.txs=[{id:'p',essentialId:'food',amount:10,fee:0,type:'out',status:'pending',date:new Date().toISOString()}];
  if(mode==='locked')L.state.locked=true;
  const saved=plan(L),before=funds(L);L.chatOpenAnswer(0);h.flush();assert.equal(plan(L),saved);assert.equal(funds(L),before);
  if(L.route==='essentialEdit'){L.saveEssential();h.flush();assert.equal(plan(L),saved);}
  clean(h);
 }
});
check('a change after opening a proposal blocks Save instead of overwriting newer facts',()=>{
 const h=fixture(),{L}=h;ask(h,'Change my Food budget to GH₵300');click(h,'Review Budget edit');L.state.essentials[0].amount=400;click(h,'Save budget item');assert.equal(L.state.essentials[0].amount,400);assert.equal(L.route,'essentialEdit');assert.match(view(h).querySelector('#error').textContent,/changed/);clean(h);
});
check('invalid and multiple edit amounts never produce a usable proposal',()=>{
 const h=fixture();for(const q of ['Change my Food budget to GH₵-1','Change my Food budget to GH₵300.333','Change my Food budget to GH₵300 or 400','Change my Food budget to USD300'])assert(!h.L.chatAnswer(q).planningEdit,q);clean(h);
});
check('a natural missing-date reply presents the exact date for explicit confirmation',()=>{
 const h=fixture(),{L}=h,before=funds(L),saved=plan(L);const prompt=ask(h,'How long will my money last?');assert.equal(prompt.route,'chatDatePicker');
 const a=ask(h,'Next Friday');assert(a.planningDate);assert.match(a.headline,/Friday/);assert.equal(plan(L),saved);assert.equal(funds(L),before);
 click(h,'Save expected date');assert.equal(L.state.allowance.date,a.planningDate.date);assert.equal(L.state.allowance.amount,0);assert.equal(L.state.allowance.source,'Family');assert.equal(funds(L),before);assert.match(L.state.chats.at(-1).text,/Guide only/);assert.match(L.state.chats.at(-1).calculation.notes.join(' '),/can’t promise/);const turns=L.state.chats.length;L.saveChatExpectedDate(1);assert.equal(L.state.chats.length,turns);clean(h);
});
check('the date picker preserves the conversation and uses an explicit date-only Save',()=>{
 const h=fixture(),{L}=h,before=funds(L);ask(h,'How long will my money last?');h.set('chatText','Unsent date question');click(h,'Choose expected date');assert.equal(L.route,'chatExpectedDate');h.set('chat-expected-date','2099-01-01');click(h,'Save expected date');h.flushHistory();
 assert.equal(L.route,'chat');assert.equal(L.state.allowance.date,'2099-01-01');assert.equal(h.document.getElementById('chatText').value,'Unsent date question');assert.equal(funds(L),before);clean(h);
});
check('date cancellation and stale confirmation preserve saved dates and all money',()=>{
 const h=fixture(),{L}=h,before=funds(L);ask(h,'How long will my money last?');click(h,'Choose expected date');h.set('chat-expected-date','2099-01-01');click(h,'Cancel');h.flushHistory();assert.equal(L.state.allowance.date,'');
 ask(h,'How long will my money last?');ask(h,'Tomorrow');L.state.allowance.date='2099-01-02';click(h,'Save expected date');assert.equal(L.state.allowance.date,'2099-01-02');assert.equal(funds(L),before);clean(h);
});
check('an unrelated question clears the immediate date clarification and dates are calendar-valid',()=>{
 const h=fixture(),{L}=h;ask(h,'How long will my money last?');ask(h,'What is left after my budget?');assert.equal(ask(h,'Next Friday').intent,'unsupported');
 assert.equal(L.chatPlanning.parseDate('2026-02-30'),null);assert.equal(L.chatPlanning.parseDate('2020-01-01'),null);assert.equal(L.chatPlanning.parseDate('in a while'),null);clean(h);
});
check('historical item answers are marked after a change and Check again refreshes the named item',()=>{
 const h=fixture(),{L}=h;ask(h,'What is left in my Food budget?');L.state.essentials[0].amount=300;L.render();assert.match(view(h).textContent,/Earlier answer/);click(h,'Check again');assert.equal(L.state.chats.at(-1).headline,'GH₵300.00 remains in Food.');clean(h);
});
console.log(count+' Chat planning checks passed.');
