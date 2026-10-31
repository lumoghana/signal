/* Recorded-spending suggestions prepare drafts; existing Save owns commitments. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let count=0;const check=(name,fn)=>{fn();count++;console.log('PASS '+name);};
const clone=x=>JSON.parse(JSON.stringify(x));
const view=h=>h.document.getElementById('view');
const funds=L=>JSON.stringify([L.state.balance,L.state.goals,L.state.txs,L.state.paymentDraft]);
const saved=L=>JSON.stringify([L.state.essentials,L.state.planHorizon,L.state.planSaved]);
const clean=h=>assert.deepEqual(h.errors,[]);
function click(h,label){const b=view(h).querySelectorAll('button').find(x=>x.textContent.trim()===label);assert(b,'Visible '+label+' on '+h.L.route);b.click();h.flush();h.flushHistory();h.flush();}
function fixture(patch={}){
 const h=createHarness({clock:true}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:500,txs:[],chats:[],paymentDraft:null,planSaved:false,planDraft:null,budgetCycleDraft:null,budgetHistoryDraft:null,essentials:[],goals:[{id:'laptop',name:'Laptop',allocated:100,target:1000,boxVersion:2}],planHorizon:{mode:'unspecified',date:''},allowance:{amount:0,date:'',source:'Family'},...patch});
 const s=L.budgetHistory.summary();L.state.accounts.createdAt=new Date(s.start-86400000).toISOString();
 for(let i=0;i<4;i++)L.state.txs.push({id:'food-'+i,type:'out',status:'success',category:'Food',amount:180,fee:0,name:'Lunch',date:new Date(s.start+i*7*86400000+3600000).toISOString()});
 L.openTab('plan');h.flush();return h;
}
check('four complete Monday–Sunday weeks prepare Food GH₵180 with exact dated evidence',()=>{
 const h=fixture(),{L}=h,before=funds(L),p=saved(L),s=L.budgetHistory.summary();assert(s.eligible);assert.equal(new Date(s.start).getUTCDay(),1);assert.equal(new Date(s.end).getUTCDay(),0);assert.equal(s.end-s.start+1,28*86400000);assert.equal(s.rows[0].total,720);assert.equal(s.rows[0].weekly,180);assert.equal(s.included.length,4);
 click(h,'Suggest from my spending');assert.equal(L.route,'budgetHistory');assert.equal(L.taskSheet.active,true);assert.equal(h.document.querySelectorAll(L.signalEdition?'.task-sheet[role="region"]':'[role="dialog"]').length,1);assert.match(view(h).textContent,/Recorded in Lumo only/);assert.match(view(h).textContent,/Past spending is a starting point/);assert.match(view(h).textContent,/four complete Monday–Sunday weeks/);assert.equal(funds(L),before);assert.equal(saved(L),p);clean(h);
});
check('fees count once and zero-spending weeks remain in the denominator',()=>{
 const h=fixture(),{L}=h;L.state.txs=L.state.txs.slice(0,1);L.state.txs[0].amount=20;L.state.txs[0].fee=.04;const s=L.budgetHistory.summary();assert.equal(s.rows[0].weekly,5.01);assert.equal(s.rows[0].total,20.04);assert.equal(s.weeks,4);clean(h);
});
check('pending, failed, reversed, internal, unknown-purpose and refunded records do not inflate the quote',()=>{
 const h=fixture(),{L}=h,base=L.state.txs[0];
 for(const [id,patch]of [['pending',{status:'pending'}],['failed',{status:'failed'}],['reversed',{status:'reversed'}],['incoming',{type:'in'}],['box',{internalTransfer:true,boxId:'laptop'}],['unknown',{category:'Uncategorised'}],['ambiguous',{category:'Transfers'}],['refunded',{refunded:1}],['linked-refund',{}],['bad',{amount:1.234}]])L.state.txs.push({...base,id,amount:100,...patch});
 L.state.txs.push({id:'refund',type:'in',status:'success',category:'Refunds',amount:1,originalId:'linked-refund',date:base.date});
 const s=L.budgetHistory.summary();assert.equal(s.rows[0].total,720);assert.equal(s.rows[0].weekly,180);assert.equal(s.included.length,4);assert.equal(s.excluded.length,5);clean(h);
});
check('history must reach the window start and the current partial week is excluded',()=>{
 const h=fixture(),{L}=h,s=L.budgetHistory.summary();L.state.accounts.createdAt=new Date().toISOString();L.state.txs=L.state.txs.slice(3);assert.equal(L.budgetHistory.summary().reason,'short-history');L.state.txs.push({id:'old-credit',type:'in',status:'success',amount:50,date:new Date(s.start-1).toISOString()});assert(L.budgetHistory.summary().eligible);
 L.state.txs.push({id:'current-food',type:'out',status:'success',category:'Food',amount:999,date:new Date().toISOString()});assert.equal(L.budgetHistory.summary().rows[0].weekly,45);clean(h);
});
check('a new Budget suggestion stays editable and changes no saved commitments before Save',()=>{
 const h=fixture(),{L}=h,before=funds(L),p=saved(L);click(h,'Suggest from my spending');h.set('history-amount-0','160.25');click(h,'Review Budget');assert.equal(L.route,'firstPlanReview');assert.equal(L.state.planDraft.essentials[0].amount,160.25);assert.equal(L.state.planDraft.essentials[0].paid,0);assert.equal(saved(L),p);assert.equal(funds(L),before);assert.equal(L.budgetHistory.useDraft(),false);
 assert.equal(L.route,'firstPlanReview');assert.equal(L.state.essentials.length,0);click(h,'Save my budget');assert.equal(L.state.essentials[0].amount,160.25);assert.equal(L.state.balance,500);assert.equal(L.state.goals[0].allocated,100);clean(h);
});
check('an active Budget remains unchanged until the existing fresh-period confirmation',()=>{
 const h=fixture({essentials:[{id:'old-food',name:'Food',amount:350,paid:80,externalPaid:80,coverageVersion:1}],planSaved:true}),{L}=h,before=funds(L),p=saved(L);click(h,'Suggest from my spending');click(h,'Review Budget');assert.equal(L.route,'budgetCycleReview');assert.equal(saved(L),p);assert.equal(funds(L),before);assert.equal(L.state.budgetCycleDraft.costs[0].amount,'180.00');assert.equal(L.state.budgetCycleDraft.costs[0].previousId,'old-food');assert.equal(L.route,'budgetCycleReview');assert.equal(saved(L),p);click(h,'Start this budget');assert.equal(L.state.essentials[0].amount,180);assert.equal(L.state.essentials[0].paid,0);assert.notEqual(L.state.essentials[0].id,'old-food');assert.equal(funds(L),before);assert.equal(L.state.budgetCycles.at(-1).costs[0].paid,80);clean(h);
});
check('reviewing a suggestion keeps an explicit route back to its editable costs',()=>{
 const h=fixture(),{L}=h;click(h,'Suggest from my spending');h.set('history-amount-0','165.50');click(h,'Review Budget');assert.equal(L.route,'firstPlanReview');click(h,'Edit costs');assert.equal(L.route,'firstEssentials');assert.equal(L.state.planDraft.essentials[0].amount,165.50);assert.equal(L.state.essentials.length,0);click(h,'Review my budget');assert.equal(L.route,'firstPlanReview');clean(h);
 const cycle=fixture({essentials:[{id:'food',name:'Food',amount:350,paid:0,externalPaid:0,coverageVersion:1}],planSaved:true});click(cycle,'Suggest from my spending');click(cycle,'Review Budget');assert.equal(cycle.L.route,'budgetCycleReview');assert.equal(cycle.L.state.budgetCycleDraft.reviewed,true);click(cycle,'Edit dates or amounts');assert.equal(cycle.L.route,'budgetCycle');assert.equal(cycle.document.getElementById('cycle-amount-0').value,'180.00');cycle.set('cycle-amount-0','170');assert.equal(cycle.L.state.budgetCycleDraft.reviewed,false);click(cycle,'Review fresh budget');assert.equal(cycle.L.route,'budgetCycleReview');assert.equal(cycle.L.state.budgetCycleDraft.costs[0].amount,'170');assert.equal(cycle.L.state.essentials[0].amount,350);clean(cycle);
});
check('a linked pending payment blocks a replacement quote without changing either draft or ledger',()=>{
 const h=fixture({essentials:[{id:'food',name:'Food',amount:350,paid:0}],planSaved:true}),{L}=h;L.state.txs.push({id:'hold',status:'pending',type:'out',amount:80,essentialId:'food'});click(h,'Suggest from my spending');const before=funds(L),p=saved(L);assert(!view(h).querySelectorAll('button').some(b=>b.textContent.trim()==='Review Budget'));assert.equal(L.budgetHistory.useDraft(),false);assert.match(view(h).textContent,/payment linked to your Budget is pending/);assert.equal(funds(L),before);assert.equal(saved(L),p);assert.equal(L.state.budgetCycleDraft,null);clean(h);
});
check('an unfinished setup or cycle draft is retained and can be resumed instead of overwritten',()=>{
 for(const cycle of [false,true]){const h=fixture(),{L}=h;if(cycle)L.state.budgetCycleDraft={id:'keep',costs:[{name:'Transport',amount:'33.33',include:true}],start:'2099-01-01',end:'2099-01-07'};else L.state.planDraft={step:'firstEssentials',allowance:clone(L.state.allowance),goals:clone(L.state.goals),essentials:[],essentialFields:{name:'Data',amount:'21'},planHorizon:{mode:'unspecified',date:''}};
 L.render();h.flush();click(h,'Suggest from my spending');const original=JSON.stringify(cycle?L.state.budgetCycleDraft:L.state.planDraft);assert.equal(L.budgetHistory.useDraft(),false);assert.equal(JSON.stringify(cycle?L.state.budgetCycleDraft:L.state.planDraft),original);click(h,'Continue saved draft');assert.equal(L.route,cycle?'budgetCycle':'firstEssentials');if(!cycle)assert.equal(h.document.getElementById('firstEssAmount').value,'21');clean(h);}
});
check('the first-setup entry may fill an untouched draft but does not overwrite typed costs',()=>{
 const h=fixture(),{L}=h;L.go('firstEssentials');h.flush();click(h,'Suggest from my spending');click(h,'Review Budget');assert.equal(L.route,'firstPlanReview');assert.equal(L.state.planDraft.essentials[0].amount,180);assert.equal(L.state.planDraft.planHorizon.mode,'date');clean(h);
 const other=fixture();other.L.go('firstEssentials');other.flush();other.set('firstEssName','Transport');other.set('firstEssAmount','25');click(other,'Suggest from my spending');assert.equal(other.L.budgetHistory.useDraft(),false);click(other,'Continue saved draft');assert.equal(other.document.getElementById('firstEssName').value,'Transport');assert.equal(other.document.getElementById('firstEssAmount').value,'25');clean(other);
});
check('leaving and browser Back keep edited suggestion amounts and restore parent context',()=>{
 for(const back of [false,true]){const h=fixture(),{L}=h;click(h,'Suggest from my spending');h.set('history-amount-0','155');if(back){h.history.back();h.flush();}else if(L.signalEdition){const back=h.document.querySelector('.task-sheet-back');assert(back&&!back.hidden);back.click();h.flushHistory();h.flush();}else click(h,'Close');assert.equal(L.route,'plan');click(h,'Suggest from my spending');assert.equal(h.document.getElementById('history-amount-0').value,'155');assert.equal(L.state.budgetHistoryDraft.rows[0].amount,'155');assert.equal(L.state.essentials.length,0);clean(h);}
});
check('history or current Budget changes invalidate the draft until an explicit refresh',()=>{
 for(const budget of [false,true]){const h=fixture(),{L}=h;click(h,'Suggest from my spending');h.set('history-amount-0','150');if(budget)L.state.essentials=[{id:'new',name:'Food',amount:200,paid:0,externalPaid:0,coverageVersion:1}];else L.state.txs[0].category='Transport';const before=funds(L),p=saved(L);assert.equal(L.budgetHistory.useDraft(),false);assert.match(view(h).textContent,/changed/);assert.equal(h.document.getElementById('history-amount-0').value,'150');assert.equal(funds(L),before);assert.equal(saved(L),p);L.render();h.flush();click(h,'Start a fresh suggestion');assert.notEqual(h.document.getElementById('history-amount-0').value,'150');clean(h);}
});
check('invalid amounts and excluding every item preserve the form without creating a Budget',()=>{
 const h=fixture(),{L}=h;click(h,'Suggest from my spending');for(const amount of ['0','-1','1.234','1e2','1000001']){h.set('history-amount-0',amount);assert.equal(L.budgetHistory.useDraft(),false);assert.equal(h.document.getElementById('history-amount-0').value,amount);assert.equal(L.state.planDraft,null);}h.set('history-amount-0','180');const checkbox=h.document.getElementById('history-include-0');checkbox.checked=false;checkbox.dispatchEvent(new h.context.Event('change',{bubbles:true}));assert.equal(L.budgetHistory.useDraft(),false);assert.equal(L.state.essentials.length,0);clean(h);
});
check('locked, closed and public callers cannot prepare or use a suggestion',()=>{
 for(const patch of [{locked:true},{closed:true},{onboarded:false}]){const h=fixture(),{L}=h;Object.assign(L.state,patch);const before=funds(L),p=saved(L);assert.equal(L.budgetHistory.open(),false);assert.equal(L.budgetHistory.useDraft(),false);assert.equal(L.state.budgetHistoryDraft,null);assert.equal(L.views.budgetHistory(),'');assert.equal(L.budgetHistory.summary().included.length,0);assert.equal(funds(L),before);assert.equal(saved(L),p);clean(h);}
});
check('an initially ineligible quote can be checked again when enough recorded history arrives',()=>{
 const h=fixture(),{L}=h;L.state.accounts.createdAt=new Date().toISOString();L.state.txs=[];click(h,'Suggest from my spending');assert.match(view(h).textContent,/Let your history build/);const s=L.budgetHistory.summary();L.state.txs.push({id:'older',type:'in',status:'success',amount:100,date:new Date(s.start-1).toISOString()},{id:'new-food',type:'out',status:'success',category:'Food',amount:400,fee:0,date:new Date(s.start+3600000).toISOString()});L.render();h.flush();click(h,'Check history again');assert.equal(h.document.getElementById('history-amount-0').value,'100.00');click(h,'Review Budget');assert.equal(L.state.planDraft.essentials[0].amount,100);clean(h);
});
check('students can add a missing Budget item before reviewing a new period',()=>{
 const h=fixture({essentials:[{id:'food',name:'Food',amount:350,paid:0,externalPaid:0,coverageVersion:1}],planSaved:true}),{L}=h,before=funds(L),p=saved(L);click(h,'Suggest from my spending');click(h,'Add a Budget item');h.set('history-name-1','Transport');h.set('history-amount-1','80');click(h,'Review Budget');assert.equal(L.route,'budgetCycleReview');assert.equal(L.state.budgetCycleDraft.costs[1].name,'Transport');assert.equal(L.state.budgetCycleDraft.costs[1].amount,'80.00');assert.equal(saved(L),p);assert.equal(funds(L),before);clean(h);
});
check('current costs absent from history are named and added without inventing a weekly conversion',()=>{
 const h=fixture({essentials:[{id:'food',name:'Food & groceries',amount:350,paid:0,externalPaid:0,coverageVersion:1},{id:'rent',name:'Rent',amount:900,paid:0,externalPaid:0,coverageVersion:1}],planSaved:true}),{L}=h,before=funds(L),p=saved(L);click(h,'Suggest from my spending');const missing=view(h).querySelector('#history-missing-costs');assert.match(missing.textContent,/Not in this suggestion: Rent/);assert(!missing.textContent.includes('Food & groceries'));click(h,'Add Rent');assert.equal(h.document.getElementById('history-name-1').value,'Housing & bills');assert.equal(h.document.getElementById('history-amount-1').value,'');assert.match(view(h).textContent,/Saved total: GH₵900.00/);assert.equal(L.budgetHistory.useDraft(),false);h.set('history-amount-1','100');click(h,'Review Budget');assert.equal(L.state.budgetCycleDraft.costs[1].amount,'100.00');assert.equal(saved(L),p);assert.equal(funds(L),before);clean(h);
});
check('a consumed suggestion cannot be applied again through browser history',()=>{
 const h=fixture(),{L}=h;click(h,'Suggest from my spending');click(h,'Review Budget');const original=JSON.stringify(L.state.planDraft);L.go('budgetHistory');h.flush();assert.match(view(h).textContent,/Continue your Budget draft/);assert.equal(L.budgetHistory.useDraft(),false);assert.equal(JSON.stringify(L.state.planDraft),original);clean(h);
});
console.log(count+' recorded-spending Budget checks passed.');
