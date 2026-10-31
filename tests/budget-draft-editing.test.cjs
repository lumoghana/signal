/* Returning Budget edits stay in one proposal until the explicit Save. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const copy=x=>JSON.parse(JSON.stringify(x));
const view=h=>h.document.getElementById('view');
let count=0;const check=(name,fn)=>{fn();count++;console.log('PASS '+name);};
function fixture(patch={}){
 const h=createHarness({clock:true}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:520,txs:[{id:'paid-food',type:'out',status:'success',essentialId:'food',amount:80,fee:0,name:'Lunch',date:new Date().toISOString()}],chats:[],planSaved:true,planDraft:null,budgetGuideSession:null,budgetCycleDraft:null,budgetHistoryDraft:null,firstBudgetPayoff:null,paymentDraft:null,
 essentials:[{id:'food',name:'Food',budgetCategory:'food',amount:250,paid:80,externalPaid:0,coverageVersion:1,date:''},{id:'transport',name:'Transport',budgetCategory:'transport',amount:100,paid:0,externalPaid:0,coverageVersion:1,date:''}],
 goals:[{id:'laptop',name:'Laptop',allocated:100,target:3000,boxVersion:2}],allowance:{amount:0,date:'',source:'Family'},planHorizon:{mode:'date',date:'2099-01-07'},...patch});
 L.openTab('plan');h.flush();return h;
}
const saved=L=>JSON.stringify([L.state.essentials,L.state.planHorizon,L.state.allowance,L.state.planSaved,L.state.balance,L.state.goals,L.state.txs]);
const money=L=>JSON.stringify([L.state.balance,L.state.goals,L.state.txs,L.state.paymentDraft]);
function click(h,label){const buttons=view(h).querySelectorAll('button').filter(x=>x.textContent.trim()===label);const b=buttons.at(-1);assert(b,'Visible '+label+' on '+h.L.route);b.click();h.flushHistory();h.flush();return b;}
function edit(h,id){const b=view(h).querySelectorAll('button').find(x=>x.getAttribute('onclick')===`L.firstPlanEditEssential('${id}')`);assert(b,'Edit exists for '+id+' on '+h.L.route);b.click();h.flushHistory();h.flush();return b;}
function ask(h,q){h.set('chatText',q);h.L.askChat();h.flushHistory();h.flush();}
const clean=h=>assert.deepEqual(h.errors,[]);
check('a returning Chat review can edit the same saved Food row in the form and save once',()=>{
 const h=fixture(),{L}=h,before=saved(L),cash=money(L);click(h,'Update budget');assert.equal(h.L.route,'planEdit');click(h,'Adjust with Lumo');ask(h,'Change Food to 300');click(h,'Review Budget');assert.equal(L.route,'firstPlanReview');click(h,'Edit costs');
 assert.equal(L.route,'firstEssentials');assert.equal(view(h).querySelectorAll('.first-cost-list button').filter(x=>x.textContent==='Edit').length,2);edit(h,'food');
 assert.equal(h.document.getElementById('firstEssName').value,'Food');assert.equal(h.document.getElementById('firstEssAmount').value,'300');assert.equal(L.state.planDraft.editingEssentialId,'food');h.set('firstEssAmount','280');click(h,'Keep this change');
 assert.equal(L.state.planDraft.essentials.filter(x=>x.id==='food').length,1);assert.equal(L.state.planDraft.essentials.find(x=>x.id==='food').amount,280);assert.equal(saved(L),before);click(h,'Review my budget');click(h,'Save my budget');
 assert.equal(L.state.essentials.length,2);assert.equal(L.state.essentials[0].id,'food');assert.equal(L.state.essentials[0].amount,280);assert.equal(L.state.essentials[0].paid,80);assert.equal(L.balances().essentials,300);assert.equal(L.balances().room,220);assert.equal(money(L),cash);L.saveFirstPlan();assert.equal(L.state.essentials[0].amount,280);clean(h);
});
check('the review itself has working Edit controls for existing saved Budget rows',()=>{
 const h=fixture(),{L}=h,before=saved(L);click(h,'Update budget');assert.equal(h.L.route,'planEdit');click(h,'Adjust with Lumo');ask(h,'Change Food to 300');click(h,'Review Budget');edit(h,'food');assert.equal(L.route,'firstEssentials');assert.equal(L.state.planDraft.editingEssentialId,'food');assert.equal(h.document.getElementById('firstEssAmount').value,'300');assert.equal(saved(L),before);clean(h);
});
check('a legacy display name uses a real category option while its ID and coverage survive editing',()=>{
 const h=fixture(),{L}=h;L.state.essentials[0].name='Food for lectures';const before=saved(L),reader=L.value;L.go('firstEssentials');h.flush();edit(h,'food');const select=h.document.getElementById('firstEssName');assert.equal(select.localName,'select');assert.equal(select.value,'Food');assert.equal(select.querySelectorAll('option').length,8);assert(!select.querySelectorAll('option').some(x=>x.value==='Food for lectures'));
 h.set('firstEssAmount','280');click(h,'Keep this change');const x=L.state.planDraft.essentials.find(x=>x.id==='food');assert.equal(x.name,'Food for lectures');assert.equal(x.paid,80);assert.equal(x.budgetCategory,'food');assert.equal(L.value,reader);assert.equal(saved(L),before);click(h,'Review my budget');click(h,'Save my budget');assert.equal(L.state.essentials[0].name,'Food for lectures');assert.equal(L.state.essentials[0].amount,280);clean(h);
});
check('changing a legacy draft category keeps its old label and updates native category availability',()=>{
 const h=fixture(),{L}=h;L.state.essentials[0].name='My everyday cost';L.go('firstEssentials');h.flush();edit(h,'food');h.set('firstEssName','Data & airtime');h.set('firstEssAmount','280');click(h,'Keep this change');const x=L.state.planDraft.essentials.find(x=>x.id==='food');assert.equal(x.name,'My everyday cost');assert.equal(x.budgetCategory,'data-airtime');const options=h.document.getElementById('firstEssName').querySelectorAll('option');assert.equal(options.find(x=>x.value==='Food').disabled,false);assert.equal(options.find(x=>x.value==='Data & airtime').disabled,true);assert.equal(L.state.essentials[0].budgetCategory,'food');clean(h);
});
check('invalid amounts preserve the selected real category, draft values and saved facts',()=>{
 const h=fixture(),{L}=h,before=saved(L),reader=L.value;L.go('firstEssentials');h.flush();edit(h,'food');h.set('firstEssAmount','0');click(h,'Keep this change');assert.equal(L.route,'firstEssentials');assert.equal(L.state.planDraft.editingEssentialId,'food');assert.equal(h.document.getElementById('firstEssName').value,'Food');assert.equal(h.document.getElementById('firstEssAmount').value,'0');assert.match(view(h).textContent,/amount above zero/);assert.equal(L.value,reader);assert.equal(saved(L),before);clean(h);
});
check('a manual draft cannot overwrite a concurrent saved cost edit',()=>{
 const h=fixture(),{L}=h;L.go('firstEssentials');h.flush();edit(h,'food');h.set('firstEssAmount','280');click(h,'Keep this change');L.state.essentials[0].amount=260;const before=saved(L);click(h,'Review my budget');assert.equal(L.route,'firstEssentials');assert.match(view(h).textContent,/saved Budget changed/);L.go('firstPlanReview');h.flush();L.saveFirstPlan();assert.equal(saved(L),before);assert.equal(L.state.planDraft.essentials[0].amount,280);clean(h);
});
check('a deleted saved cost cannot be resurrected by an older manual draft',()=>{
 const h=fixture(),{L}=h;L.go('firstEssentials');h.flush();edit(h,'food');h.set('firstEssAmount','280');click(h,'Keep this change');L.state.essentials=L.state.essentials.filter(x=>x.id!=='food');const before=saved(L);L.go('firstPlanReview');h.flush();L.saveFirstPlan();assert.equal(saved(L),before);assert.equal(L.state.essentials.some(x=>x.id==='food'),false);assert(L.state.planDraft);clean(h);
});
check('pending linked payments block manual changes, review and direct Save without discarding fields',()=>{
 const h=fixture(),{L}=h;L.go('firstEssentials');h.flush();edit(h,'food');h.set('firstEssAmount','280');L.state.txs.push({id:'pending-food',type:'out',status:'pending',essentialId:'food',amount:20,fee:0});const before=saved(L);click(h,'Keep this change');assert.equal(L.state.planDraft.essentials[0].amount,250);assert.equal(h.document.getElementById('firstEssAmount').value,'280');assert.match(view(h).textContent,/linked to your Budget is pending/);L.go('firstPlanReview');h.flush();L.saveFirstPlan();assert.equal(saved(L),before);assert(L.state.planDraft);clean(h);
});
check('new confirmed fulfilment refreshes coverage and does not invalidate a manual Budget edit',()=>{
 const h=fixture({txs:[],essentials:[{id:'food',name:'Food',budgetCategory:'food',amount:250,paid:0,externalPaid:0,coverageVersion:1},{id:'transport',name:'Transport',budgetCategory:'transport',amount:100,paid:0,externalPaid:0,coverageVersion:1}]}),{L}=h;
 L.go('firstEssentials');h.flush();edit(h,'food');h.set('firstEssAmount','280');click(h,'Keep this change');L.state.txs.push({id:'later-food',type:'out',status:'success',essentialId:'food',amount:80,fee:0});L.state.balance=440;click(h,'Review my budget');assert.equal(L.route,'firstPlanReview');click(h,'Save my budget');assert.equal(L.state.essentials[0].amount,280);assert.equal(L.state.essentials[0].paid,80);assert.equal(L.balances().essentials,300);assert.equal(L.state.balance,440);assert.equal(L.state.txs.length,1);clean(h);
});
check('Finish later and returning to the same draft preserve its edit without saving it',()=>{
 const h=fixture(),{L}=h,before=saved(L);L.go('firstEssentials');h.flush();edit(h,'food');h.set('firstEssAmount','280');click(h,'Finish later');assert.equal(saved(L),before);assert.equal(L.state.planDraft.editingEssentialId,'food');assert.equal(L.state.planDraft.essentialFields.amount,'280');L.go('firstEssentials');h.flush();assert.equal(h.document.getElementById('firstEssName').value,'Food');assert.equal(h.document.getElementById('firstEssAmount').value,'280');assert.equal(saved(L),before);clean(h);
});
check('stale manual recovery keeps a draft until explicit confirmation and uses current saved values',()=>{
 const h=fixture(),{L}=h;L.go('firstEssentials');h.flush();edit(h,'food');h.set('firstEssAmount','280');click(h,'Keep this change');const old=L.state.planDraft;L.state.essentials[0].amount=260;L.render();h.flush();L.openPlanDraftRestart();h.flush();assert.equal(L.route,'planDraftRestart');assert.equal(h.document.querySelectorAll(h.L.signalEdition?'.task-sheet[role="region"]':'[role="dialog"]').length,1);click(h,'Keep my draft');assert.equal(L.state.planDraft,old);assert.equal(L.state.planDraft.essentials[0].amount,280);L.openPlanDraftRestart();h.flush();const before=saved(L);click(h,'Replace unsaved draft');assert.equal(L.route,'firstEssentials');assert.notEqual(L.state.planDraft,old);assert.equal(L.state.planDraft.essentials[0].amount,260);assert.equal(saved(L),before);assert.equal(L.planDraftSafety(L.state.planDraft),'');clean(h);
});
check('a stale recovery confirmation cannot replace a draft or Budget that changed while open',()=>{
 const h=fixture(),{L}=h;L.go('firstEssentials');h.flush();const old=L.state.planDraft;L.state.essentials[0].amount=260;L.openPlanDraftRestart();h.flush();L.state.essentials[0].amount=270;const before=saved(L);assert.equal(L.replacePlanDraft(),false);assert.equal(L.state.planDraft,old);assert.equal(saved(L),before);assert.match(view(h).textContent,/changed again/);clean(h);
});
check('unprovable old manual edits are kept rather than overwriting newer saved data',()=>{
 const h=fixture(),{L}=h;L.state.planDraft={step:'firstEssentials',essentials:copy(L.state.essentials),goals:copy(L.state.goals),allowance:copy(L.state.allowance),planHorizon:copy(L.state.planHorizon)};L.state.planDraft.essentials[0].amount=280;L.state.essentials[0].amount=260;L.go('firstEssentials');h.flush();assert.equal(L.state.planDraft.savedBudgetMarkUnverified,true);assert.match(view(h).textContent,/draft is kept/);const before=saved(L);L.go('firstPlanReview');h.flush();L.saveFirstPlan();assert.equal(saved(L),before);clean(h);
});
check('a matching old manual draft can adopt a baseline and edit through the native form',()=>{
 const h=fixture(),{L}=h;L.state.planDraft={step:'firstEssentials',essentials:copy(L.state.essentials),goals:copy(L.state.goals),allowance:copy(L.state.allowance),planHorizon:copy(L.state.planHorizon)};L.go('firstEssentials');h.flush();assert.equal(typeof L.state.planDraft.savedBudgetMark,'string');assert.equal(L.planDraftSafety(L.state.planDraft),'');edit(h,'food');assert.equal(h.document.getElementById('firstEssAmount').value,'250');clean(h);
});
check('a confirmed draft category correction retires old remembered merchant source consent',()=>{
 const h=fixture(),{L}=h;L.state.budgetPurposeRules=[{key:'campus|ak01',sourceId:'food',sourceName:'food'},{key:'campus|rb03',sourceId:'transport',sourceName:'transport'}];const before=money(L);L.go('firstEssentials');h.flush();edit(h,'food');h.set('firstEssName','Data & airtime');click(h,'Keep this change');assert.equal(L.state.budgetPurposeRules.length,2);click(h,'Review my budget');click(h,'Save my budget');assert.equal(L.state.essentials[0].budgetCategory,'data-airtime');assert.equal(L.state.budgetPurposeRules.length,1);assert.equal(L.state.budgetPurposeRules[0].sourceId,'transport');assert.equal(money(L),before);clean(h);
});
check('an older guided draft adopts its existing matching saved snapshot while retaining its proposal',()=>{
 const h=fixture(),{L}=h;L.budgetGuide.start({silent:true});const d=L.state.planDraft;delete d.savedBudgetMark;delete d.savedBudgetMarkUnverified;d.essentials[0].amount=300;const before=saved(L);L.go('firstEssentials');h.flush();assert.equal(typeof d.savedBudgetMark,'string');assert.equal(L.planDraftSafety(d),'');edit(h,'food');assert.equal(h.document.getElementById('firstEssAmount').value,'300');assert.equal(saved(L),before);clean(h);
});
check('unsigned, locked and closed manual drafts cannot commit saved Budget edits',()=>{
 for(const patch of [{onboarded:false},{locked:true},{closed:true}]){const h=fixture(),{L}=h;L.go('firstEssentials');h.flush();edit(h,'food');h.set('firstEssAmount','280');click(h,'Keep this change');L.go('firstPlanReview');h.flush();Object.assign(L.state,patch);const before=saved(L);L.saveFirstPlan();assert.equal(saved(L),before);assert(L.state.planDraft);clean(h);}
});
check('an unresolved category choice keeps its whole proposal through a blocked form edit then resolves in Chat',()=>{
 const h=fixture(),{L}=h,before=saved(L);click(h,'Update budget');assert.equal(h.L.route,'planEdit');click(h,'Adjust with Lumo');ask(h,'Church 50 for seven days');assert.equal(L.state.budgetGuideSession.pending.kind,'category');const proposal=JSON.stringify(L.state.budgetGuideSession.pending);L.budgetGuide.returnToForm();h.flush();edit(h,'food');assert.equal(L.state.planDraft.editingEssentialId,undefined);assert.match(view(h).textContent,/Finish the category or total choice in Chat/);h.set('firstEssName','Study & fees');h.set('firstEssAmount','50');click(h,'Add another budget item');assert.equal(L.state.planDraft.essentials.length,2);assert.equal(JSON.stringify(L.state.budgetGuideSession.pending),proposal);assert.equal(saved(L),before);click(h,'Continue in Chat');click(h,'Study & fees');assert.equal(L.state.budgetGuideSession.pending,null);assert.equal(L.state.planDraft.essentials.find(x=>x.budgetCategory==='study-fees').amount,50);L.budgetGuide.returnToForm();h.flush();edit(h,'food');assert.equal(L.state.planDraft.editingEssentialId,'food');assert.equal(saved(L),before);clean(h);
});
check('an unresolved duplicate quote cannot be invalidated by a manual amount change',()=>{
 const h=fixture(),{L}=h,before=saved(L);click(h,'Update budget');assert.equal(h.L.route,'planEdit');click(h,'Adjust with Lumo');ask(h,'Groceries 50 for seven days');assert.equal(L.state.budgetGuideSession.pending.kind,'duplicate');const proposal=JSON.stringify(L.state.budgetGuideSession.pending);L.budgetGuide.returnToForm();h.flush();edit(h,'food');assert.equal(L.state.planDraft.editingEssentialId,undefined);assert.equal(JSON.stringify(L.state.budgetGuideSession.pending),proposal);assert.equal(L.state.planDraft.essentials[0].amount,250);click(h,'Continue in Chat');click(h,'Add to total · GH₵300.00');assert.equal(L.state.planDraft.essentials[0].amount,300);assert.equal(L.state.budgetGuideSession.pending,null);assert.equal(saved(L),before);clean(h);
});
check('a daily-rate prompt can still be completed as an explicit total in the form',()=>{
 const h=fixture({essentials:[],txs:[],planSaved:false,planHorizon:{mode:'unspecified',date:''}}),{L}=h;click(h,'Build with Lumo');assert.equal(h.L.route,'planEdit');click(h,'Build with Lumo');ask(h,'Food 30 a day');assert.equal(L.state.budgetGuideSession.pending.kind,'rate');L.budgetGuide.returnToForm();h.flush();h.set('firstEssAmount','150');click(h,'Review my budget');assert.equal(L.route,'firstPlanReview');assert.equal(L.state.planDraft.essentials[0].amount,150);click(h,'Save my budget');assert.equal(L.state.essentials[0].amount,150);assert.equal(L.state.balance,520);clean(h);
});
console.log(count+' returning Budget draft editing checks passed.');
