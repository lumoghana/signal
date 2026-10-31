/* Fixed student Budget taxonomy through the shipped script order. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
function fixture(){const h=createHarness({clock:true}),{L}=h;L.explore();L.ensureAccounts();Object.assign(L.state,{balance:600,essentials:[],txs:[],goals:[],chats:[],planDraft:null,planSaved:false,budgetCycleDraft:null,budgetGuideSession:null,allowance:{amount:0,date:'',source:'Family'},planHorizon:{mode:'unspecified',date:''}});L.openTab('plan');h.flush();return h;}
const clean=h=>assert.deepEqual(h.errors,[]);
check('the shared taxonomy has exactly seven stable categories and resolves aliases without guessing ambiguous costs',()=>{
 const h=fixture(),C=h.L.budgetCategories;assert.equal(C.list.length,7);assert.deepEqual(Array.from(C.list,c=>c.name),['Food','Transport','Data & airtime','Study & fees','Housing & bills','Personal & social','Other']);
 for(const [name,id]of [['Groceries','food'],['Gɔbɛ','food'],['Phone','data-airtime'],['Rent','housing-bills'],['Books','study-fees'],['Birthday gift','personal-social']])assert.equal(C.resolve(name).id,id);
 assert.equal(C.resolve('Mystery cost'),null);assert.equal(C.resolve('Food and transport'),null);clean(h);
});
check('grouping old rows uses category metadata first, preserves underlying data and totals, and never changes a saved record',()=>{
 const h=fixture(),C=h.L.budgetCategories,rows=[{id:'a',name:'Lunch',amount:100,paid:20},{id:'b',name:'Food for lectures',amount:60,paid:10},{id:'c',name:'Custom project',amount:50,budgetCategory:'study-fees'},{id:'d',name:'Mystery',amount:30},{id:'old',name:'Rent',amount:500,archived:true}];
 const before=JSON.stringify(rows),g=C.group(rows);assert.equal(g.length,3);assert.equal(g[0].total,160);assert.equal(g[0].items[0],rows[0]);assert.equal(g[1].id,'study-fees');assert.equal(g[2].id,'other');assert.equal(C.total(rows),240);assert.equal(JSON.stringify(rows),before);clean(h);
});
check('a new duplicate category needs an explicit edit while retained legacy duplicates remain valid',()=>{
 const h=fixture(),C=h.L.budgetCategories,rows=[{id:'lunch',name:'Lunch',amount:100},{id:'groceries',name:'Groceries',amount:50}];
 const p=C.prepare('Food',{items:rows});assert.equal(p.ok,false);assert.equal(p.existing.id,'lunch');assert.equal(C.validate(rows,rows).ok,true);
 assert.equal(C.validate([...rows,{id:'new',name:'Food',amount:25}],rows).ok,false);assert.equal(C.prepare('Food',{items:rows,editingId:'lunch'}).name,'Lunch');assert.equal(C.prepare('Rent',{items:[]}).name,'Housing & bills');clean(h);
});
check('new manual and saved-item forms offer fixed category selects rather than free-text names',()=>{
 const h=fixture(),{L}=h;L.go('firstEssentials');h.flush();const draft=h.document.getElementById('firstEssName');assert.equal(draft.localName,'select');assert.equal(draft.querySelectorAll('option').length,8);
 h.set('firstEssName','Data & airtime');h.set('firstEssAmount','45');L.firstPlanAddEssential();h.flush();assert.equal(L.state.planDraft.essentials.length,1);assert.equal(L.state.planDraft.essentials[0].name,'Data & airtime');assert.equal(L.state.planDraft.essentials[0].budgetCategory,'data-airtime');
 L.go('essentialEdit');h.flush();assert.equal(h.document.getElementById('essName').localName,'select');clean(h);
});
check('manual duplicate attempts preserve the original total and entered amount instead of replacing it',()=>{
 const h=fixture(),{L}=h;L.go('firstEssentials');h.flush();h.set('firstEssName','Food');h.set('firstEssAmount','100');L.firstPlanAddEssential();h.flush();h.set('firstEssName','Food');h.set('firstEssAmount','40');L.firstPlanAddEssential();h.flush();assert.equal(L.state.planDraft.essentials.length,1);assert.equal(L.state.planDraft.essentials[0].amount,100);assert.equal(h.document.getElementById('firstEssAmount').value,'40');assert.match(h.document.getElementById('error').textContent,/already in your Budget/);clean(h);
});
check('editing a legacy custom label keeps its name, identifier and coverage and records the chosen category',()=>{
 const h=fixture(),{L}=h;L.state.essentials=[{id:'legacy',name:'Transport to lectures',amount:120,paid:30,externalPaid:30,coverageVersion:1}];L.go('essentialEdit',{id:'legacy'});h.flush();h.set('essAmount','150');L.saveEssential();h.flush();const x=L.state.essentials[0];assert.equal(x.id,'legacy');assert.equal(x.name,'Transport to lectures');assert.equal(x.amount,150);assert.equal(x.budgetCategory,'transport');assert.equal(x.paid,30);assert.equal(L.state.balance,600);clean(h);
});
check('category-only edits persist and changing to an occupied category does not create a duplicate',()=>{
 const h=fixture(),{L}=h;L.state.essentials=[{id:'f',name:'Food',amount:100,paid:0,coverageVersion:1}];L.go('essentialEdit',{id:'f'});h.flush();h.set('essName','Transport');L.saveEssential();h.flush();assert.equal(L.state.essentials[0].name,'Transport');assert.equal(L.state.essentials[0].budgetCategory,'transport');assert.equal(L.state.essentials[0].id,'f');
 L.state.essentials.push({id:'data',name:'Data & airtime',budgetCategory:'data-airtime',amount:20,paid:0});L.go('essentialEdit',{id:'f'});h.flush();h.set('essName','Data & airtime');L.saveEssential();h.flush();assert.equal(L.state.essentials[0].budgetCategory,'transport');assert.equal(L.route,'essentialEdit');assert.match(h.document.getElementById('error').textContent,/already in your Budget/);clean(h);
});
check('a stale saved-item editor cannot recreate a deleted ID as a new row',()=>{
 const h=fixture(),{L}=h;L.state.essentials=[{id:'removed',name:'Food',amount:100,paid:0}];L.go('essentialEdit',{id:'removed'});h.flush();L.state.essentials=[];L.saveEssential();h.flush();assert.equal(L.state.essentials.length,0);assert.match(h.document.getElementById('error').textContent,/no longer available/);clean(h);
});
check('linked fixed Budget sources provide uniform transaction categories without changing the selected source',()=>{
 const h=fixture(),{L}=h;L.state.essentials=[{id:'data',name:'Data & airtime',budgetCategory:'data-airtime',amount:100,paid:0},{id:'rent',name:'My room',budgetCategory:'housing-bills',amount:200,paid:0}];
 const d={method:'campus',essentialId:'data',recipient:'Someone'};const p=L.predictCategory(d);assert.equal(p.category,'Data & airtime');assert.equal(p.budgetCategory,'data-airtime');assert.equal(p.confidence,'confirmed');assert.equal(p.source,'budget-source');assert.equal(d.essentialId,'data');assert.equal(L.predictCategory({...d,essentialId:'rent'}).category,'Housing & bills');clean(h);
});
check('pending payment safeguards remain authoritative when category-only edits are attempted',()=>{
 const h=fixture(),{L}=h;L.state.essentials=[{id:'food',name:'Food',amount:100,paid:0}];L.state.txs=[{id:'pending',type:'out',status:'pending',essentialId:'food',amount:20}];L.go('essentialEdit',{id:'food'});h.flush();h.set('essName','Transport');L.saveEssential();h.flush();assert.equal(L.state.essentials[0].name,'Food');assert.equal(L.state.essentials[0].budgetCategory,undefined);assert.equal(L.route,'essentialEdit');assert.match(h.document.getElementById('error').textContent,/payment in progress/);clean(h);
});
check('a category-only legacy edit invalidates an older fresh-period draft',()=>{
 const h=fixture(),{L}=h;L.state.essentials=[{id:'legacy',name:'My weekly needs',budgetCategory:'food',amount:100,paid:0,coverageVersion:1}];L.openBudgetCycle();h.flush();L.reviewBudgetCycle();h.flush();assert.equal(L.route,'budgetCycleReview');
 L.go('essentialEdit',{id:'legacy'});h.flush();h.set('essName','Transport');L.saveEssential();h.flush();assert.equal(L.state.essentials[0].name,'My weekly needs');assert.equal(L.state.essentials[0].budgetCategory,'transport');const state=JSON.stringify(L.state.essentials);L.confirmBudgetCycle();h.flush();assert.equal(JSON.stringify(L.state.essentials),state);assert(L.state.budgetCycleDraft);clean(h);
});
check('a legacy custom line with explicit Food metadata gets a merchant suggestion without fulfilling the cost automatically',()=>{
 const h=fixture(),{L}=h;L.state.essentials=[{id:'weekly',name:'Weekly needs',budgetCategory:'food',amount:200,paid:0,coverageVersion:1}];L.pickMerchant('AK01');h.flush();h.set('payment-amount','80');
 const before=JSON.stringify([L.state.balance,L.state.essentials,L.state.txs]);assert.equal(L.budgetEveryday.suggestion().id,'weekly');assert.equal(L.state.paymentDraft.essentialId,'');assert.equal(JSON.stringify([L.state.balance,L.state.essentials,L.state.txs]),before);
 L.acceptBudgetPurpose('weekly');h.flush();assert.equal(L.state.paymentDraft.essentialId,'weekly');assert.equal(JSON.stringify([L.state.balance,L.state.essentials,L.state.txs]),before);assert.equal((L.state.budgetPurposeRules||[]).length,0);clean(h);
});
console.log(checks+' fixed student Budget category checks passed.');
