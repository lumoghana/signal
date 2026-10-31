/* Mounted optional estimation changes only the original unsaved amount. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const shipped=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
const modules=shipped.includes('budget-estimate.js')?shipped:[...shipped,'budget-estimate.js'];
let count=0;function check(name,fn){fn();count++;console.log('PASS '+name);}
function fixture(patch={},options={}){
 const h=createHarness({clock:true,modules,...options}),{L}=h;L.explore();L.ensureAccounts();Object.assign(L.state,{balance:500,txs:[],paymentDraft:null,planDraft:null,planSaved:true,planHorizon:{mode:'date',date:'2099-01-01'},essentials:[{id:'food',name:'Food',amount:350,paid:0,externalPaid:0,coverageVersion:1,date:'2099-01-01'}],goals:[{id:'laptop',name:'Laptop',allocated:100,target:1000,boxVersion:2}],...patch});L.openTab('home');L.render();h.flush();return h;
}
const view=h=>h.document.getElementById('view');
const financial=L=>JSON.stringify([L.state.balance,L.state.txs,L.state.essentials,L.state.goals,L.state.paymentDraft]);
const clean=h=>assert.deepEqual(h.errors,[]);
function click(h,label){const b=view(h).querySelectorAll('button').find(b=>b.textContent.trim()===label);assert(b,'Visible '+label+' on '+h.L.route);b.click();h.flush();h.flushHistory();h.flush();}
function input(h,rate,units,kind='day'){h.set('estimate-unit',kind);h.set('estimate-rate',rate);h.set('estimate-count',units);}
check('first Budget offers optional help and returns GH₵175 to its unsaved total',()=>{
 const h=fixture({essentials:[],planSaved:false}),{L}=h;L.go('firstEssentials');h.flush();h.set('firstEssName','Food');h.set('firstEssAmount','20');h.set('firstPlanPeriodMode','date');L.changePlanPeriod();h.flush();h.set('firstPlanPeriodDate','2099-01-01');
 const before=financial(L);click(h,'Help me estimate');assert.equal(L.route,'budgetEstimate');assert.equal(L.taskSheet.active,true);assert.equal(L.taskSheet.parentRoute,'home');assert.equal(view(h).querySelectorAll('[role="dialog"]').length,0);assert.equal(h.document.querySelectorAll(L.signalEdition?'.task-sheet[role="region"]':'[role="dialog"]').length,1);
 input(h,'25','7');assert.match(view(h).querySelector('#estimate-result').textContent,/GH₵25\.00 × 7 days/);assert.match(view(h).querySelector('#estimate-result').textContent,/GH₵175\.00/);assert.equal(financial(L),before);
 click(h,'Use this amount');assert.equal(L.route,'firstEssentials');assert.equal(h.document.getElementById('firstEssName').value,'Food');assert.equal(h.document.getElementById('firstEssAmount').value,'175.00');assert.equal(L.state.planDraft.planHorizon.date,'2099-01-01');assert.equal(financial(L),before);assert.equal(L.state.planDraft.essentialFields.amount,'175.00');clean(h);
});
check('existing Budget edit keeps selected category and due date, estimates weeks, then saves only explicitly',()=>{
 const h=fixture(),{L}=h;L.go('essentialEdit',{id:'food'});h.flush();h.set('essName','Transport');h.set('essDate','2099-02-01');const before=financial(L);click(h,'Help me estimate');input(h,'30.25','3','week');click(h,'Use this amount');
 assert.equal(L.route,'essentialEdit');assert.equal(h.document.getElementById('essAmount').value,'90.75');assert.equal(h.document.getElementById('essName').value,'Transport');assert.equal(h.document.getElementById('essDate').value,'2099-02-01');assert.equal(financial(L),before);
 click(h,'Save budget item');assert.equal(L.state.essentials[0].amount,90.75);assert.equal(L.state.essentials[0].name,'Transport');assert.equal(L.state.balance,500);assert.equal(L.state.txs.length,0);clean(h);
});
check('Cancel and browser Back preserve original amount and name without applying a quote',()=>{
 for(const browserBack of [false,true]){const h=fixture(),{L}=h;L.go('essentialEdit',{id:'food'});h.flush();h.set('essName','Transport');h.set('essAmount','123.45');const before=financial(L);click(h,'Help me estimate');input(h,25,7);if(browserBack){h.history.back();h.flush();}else click(h,'Cancel');
 assert.equal(L.route,'essentialEdit');assert.equal(h.document.getElementById('essAmount').value,'123.45');assert.equal(h.document.getElementById('essName').value,'Transport');assert.equal(financial(L),before);clean(h);}
});
check('invalid rates, fractional days and excessive totals keep the calculator and its entered values',()=>{
 const h=fixture(),{L}=h;L.go('essentialEdit',{id:'food'});h.flush();click(h,'Help me estimate');const before=financial(L);
 for(const [rate,units]of [['0',7],['-1',7],['1.234',7],['25','1.5'],['25','0'],['1000000',2],['25','1e2']]){input(h,rate,units);assert.equal(L.useBudgetEstimate(),false);assert.equal(L.route,'budgetEstimate');assert.equal(h.document.getElementById('estimate-rate').value,String(rate));assert.equal(financial(L),before);}
 clean(h);
});
check('one-pesewa rates use exact cents and repeated Use cannot save or move money',()=>{
 const h=fixture(),{L}=h;L.go('essentialEdit',{id:'food'});h.flush();const before=financial(L);click(h,'Help me estimate');input(h,'0.01','3');click(h,'Use this amount');assert.equal(h.document.getElementById('essAmount').value,'0.03');assert.equal(L.useBudgetEstimate(),false);assert.equal(financial(L),before);clean(h);
});
check('changed or removed saved items reject a stale estimate',()=>{
 for(const remove of [false,true]){const h=fixture(),{L}=h;L.go('essentialEdit',{id:'food'});h.flush();click(h,'Help me estimate');input(h,25,7);if(remove)L.state.essentials=[];else L.state.essentials[0].amount=400;const before=financial(L);L.useBudgetEstimate();assert.equal(L.route,'budgetEstimate');assert.match(view(h).querySelector('#error').textContent,/changed/);assert.equal(financial(L),before);clean(h);}
});
check('a pending saved item cannot open or apply an estimate',()=>{
 const h=fixture(),{L}=h;L.go('essentialEdit',{id:'food'});h.flush();L.state.txs=[{id:'hold',type:'out',status:'pending',amount:20,fee:0,essentialId:'food'}];assert.equal(L.openBudgetEstimate(),false);assert.equal(L.route,'essentialEdit');assert.match(view(h).textContent,/pending payment/);clean(h);
 const other=fixture();other.L.go('essentialEdit',{id:'food'});other.flush();click(other,'Help me estimate');input(other,25,7);other.L.state.txs=[{id:'hold',type:'out',status:'pending',amount:20,fee:0,essentialId:'food'}];other.L.useBudgetEstimate();assert.equal(other.L.route,'budgetEstimate');assert.match(view(other).textContent,/changed/);clean(other);
});
check('a change during asynchronous Back cannot apply the old estimate to the returned field',()=>{
 const h=fixture({}, {deferHistory:true}),{L}=h;L.go('essentialEdit',{id:'food'});h.flush();click(h,'Help me estimate');input(h,25,7);L.useBudgetEstimate();assert.equal(L.route,'budgetEstimate');L.state.essentials[0].amount=400;h.flushHistory();h.flush();assert.equal(L.route,'essentialEdit');assert.notEqual(h.document.getElementById('essAmount').value,'175.00');assert.equal(L.state.essentials[0].amount,400);assert.equal(L.state.balance,500);clean(h);
});
check('a new item estimate never creates a saved cost and calculator values do not leak to another item',()=>{
 const h=fixture(),{L}=h;L.go('essentialEdit');h.flush();h.set('essName','Data');click(h,'Help me estimate');input(h,'8','4');click(h,'Use this amount');assert.equal(h.document.getElementById('essAmount').value,'32.00');assert.equal(L.state.essentials.length,1);
 L.go('essentialEdit',{id:'food'});h.flush();click(h,'Help me estimate');assert.equal(h.document.getElementById('estimate-rate').value,'');assert.equal(h.document.getElementById('estimate-count').value,'');assert.equal(L.state.essentials[0].amount,350);clean(h);
});
console.log(count+' optional Budget estimation checks passed.');
