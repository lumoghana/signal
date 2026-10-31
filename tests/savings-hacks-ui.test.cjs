/* Mounted Money Box setup and Savings hack lifecycle. Isolated sample ledgers. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const shipped=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
const additions=['savings-hacks-engine.js','savings-hacks-ui.js'];
const modules=[...shipped.filter(f=>!additions.includes(f)),...additions];
const json=x=>JSON.parse(JSON.stringify(x));
const view=h=>h.document.getElementById('view');
const settle=h=>{h.flushHistory();h.flush();};
const clean=h=>assert.deepEqual(h.errors,[]);
let passed=0,failed=0;
const check=(name,run)=>{try{run();passed++;console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack);}};
function fixture(){
 const h=createHarness({clock:true,testing:true,modules}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:1000,txs:[],paymentDraft:null,goals:[{id:'laptop',name:'Laptop',target:1000,allocated:100,boxVersion:2}],essentials:[{id:'food',name:'Food',amount:250,paid:0,externalPaid:0,coverageVersion:1},{id:'transport',name:'Transport',amount:100,paid:0,externalPaid:0,coverageVersion:1}],chats:[],allowance:{amount:0,date:''},planSaved:true,planHorizon:{mode:'date',date:'2099-01-07'},savingHacks:{version:1,rulesByBox:{},handled:{},events:[]}});
 for(const field of ['savingsHackSetup','moneyBoxDraft','savingPrompts'])delete L.state[field];
 L.route='home';L.params={};L.history=[];L.render();settle(h);clean(h);return h;
}
function button(h,label,scope=view(h)){
 const b=scope.querySelectorAll('button').find(b=>b.textContent.trim()===label);assert(b,'Mounted button '+label+' on '+h.L.route);return b;
}
function click(h,label,scope){button(h,label,scope).click();settle(h);}
function open(h,id){h.L.go('goalEdit',id?{id}:{});settle(h);assert.equal(h.L.route,'goalEdit');}
function name(h,value='Conference trip'){h.set('goalName',value);h.set('goalTarget',1000);}
function consent(h){const c=h.document.getElementById('sh-consent');assert(c,'Explicit standing consent checkbox');c.checked=true;c.dispatchEvent(new h.Event('change'));}
function configureFields(h,kind='spend'){
 h.set('sh-kind',kind);h.set('sh-value',kind==='income'?10:kind==='fixed'?10:5);h.set('sh-cap',100);h.set('sh-buffer',50);
 if(kind==='fixed'){h.set('sh-cadence','weekly');h.set('sh-start',new Date(h.context.Date.now()+14*86400000).toISOString().slice(0,10));}
}
function save(h,existing=false){click(h,existing?'Save changes':'Add Money Box');}
const funds=L=>json({balance:L.state.balance,boxes:L.state.goals.map(g=>({id:g.id,allocated:g.allocated})),txs:L.state.txs,total:L.accountBalances().total});
function unchangedMoney(L,before){assert.equal(L.state.balance,before.balance);assert.equal(L.accountBalances().total,before.total);assert.deepEqual(json(L.state.txs),before.txs);for(const g of before.boxes)assert.equal(L.state.goals.find(b=>b.id===g.id).allocated,g.allocated);}
function rule(h,props={}){const r=h.L.savingsHacks.configure({boxId:'laptop',kind:'spend',value:5,monthlyCap:100,minBalance:50,consent:true,...props});assert.equal(r.ok,true,r.message);return r.rule;}
function goal(h,id='laptop'){h.L.go('goal',{id});settle(h);assert.equal(h.L.params.id,id);return view(h).querySelector('.savings-hack-status');}

check('Savings hack controls share the Fund and Transfer back action group while supporting details stay below',()=>{
 const h=fixture(),before=funds(h.L);let controls=goal(h),fund=button(h,'Fund this box'),back=button(h,'Transfer back'),group=fund.parentNode;
 assert.equal(controls.parentNode,group);assert.equal(back.parentNode,group);let children=[...group.children];assert(children.indexOf(controls)>children.indexOf(back));assert(children.indexOf(controls)<children.indexOf(button(h,'Edit Money Box')));assert.equal(button(h,'Add savings hack').parentNode,controls);assert.equal(view(h).querySelector('.savings-hack-details'),null);
 rule(h);h.L.render();controls=view(h).querySelector('.savings-hack-status');const details=view(h).querySelector('.savings-hack-details');assert(details);assert(controls.querySelector('.sh-heading').textContent.includes('Savings hack'));assert.equal(controls.querySelectorAll('button').length,3);for(const label of ['Edit','Pause','Cancel hack'])assert(button(h,label,controls));assert.equal(details.querySelectorAll('button').length,0);assert(details.querySelector('.sh-info'));assert(!details.querySelector('.sh-info').hasAttribute('open'));assert(details.textContent.includes('Save 5% of what you spend'));assert(!controls.textContent.includes('Save 5% of what you spend'));assert(view(h).innerHTML.indexOf('sh-priority-control')<view(h).innerHTML.toLowerCase().indexOf('your budget applies'));assert(view(h).innerHTML.indexOf('savings-hack-details')>view(h).innerHTML.indexOf('sh-priority-control'));unchangedMoney(h.L,before);clean(h);
});

check('manual is the default and creating a Box never moves money',()=>{
 const h=fixture(),before=funds(h.L);open(h);assert.equal(h.document.getElementById('sh-kind').value,'manual');assert.equal(h.document.getElementById('sh-consent'),null);name(h);save(h);
 const g=h.L.state.goals.find(g=>g.name==='Conference trip');assert(g);assert.equal(g.allocated,0);assert.equal(h.L.savingsHacks.get(g.id),null);unchangedMoney(h.L,before);clean(h);
});
check('automatic saving requires unchecked explicit consent before a Box can be created',()=>{
 const h=fixture(),before=funds(h.L);open(h);name(h);configureFields(h);assert.equal(h.document.getElementById('sh-consent').checked,false);save(h);
 assert.equal(h.L.route,'goalEdit');assert.equal(h.L.state.goals.length,1);assert.equal(Object.keys(h.L.state.savingHacks.rulesByBox).length,0);assert(view(h).textContent.includes('Confirm this automatic saving instruction'));unchangedMoney(h.L,before);clean(h);
});
for(const kind of ['income','roundup','spend','fixed'])check(kind+' persists to the new Box ID without initial funding',()=>{
 const h=fixture(),before=funds(h.L);open(h);name(h,kind+' Box');configureFields(h,kind);consent(h);save(h);
 const g=h.L.state.goals.find(g=>g.name===kind+' Box');assert(g);assert.notEqual(g.id,'laptop');assert.equal(g.allocated,0);const r=h.L.savingsHacks.get(g.id);assert(r);assert.equal(r.boxId,g.id);assert.equal(r.kind,kind);assert.equal(r.enabled,true);assert.equal(r.monthlyCap,100);assert.equal(r.minBalance,50);assert.equal(r.consent.accepted,true);if(kind==='fixed')assert.equal(r.cadence,'weekly');unchangedMoney(h.L,before);clean(h);
});
check('invalid limits cannot create a Box or partially save an instruction',()=>{
 const h=fixture(),before=funds(h.L);open(h);name(h);configureFields(h);h.set('sh-cap',0);consent(h);save(h);assert.equal(h.L.route,'goalEdit');assert.equal(h.L.state.goals.length,1);assert.equal(Object.keys(h.L.state.savingHacks.rulesByBox).length,0);unchangedMoney(h.L,before);clean(h);
});
check('a lock after setup opened blocks Box metadata and instruction together',()=>{
 const h=fixture(),before=funds(h.L);open(h);name(h);configureFields(h);consent(h);h.L.state.locked=true;h.L.saveGoal();assert.equal(h.L.state.goals.length,1);assert.equal(Object.keys(h.L.state.savingHacks.rulesByBox).length,0);unchangedMoney(h.L,before);clean(h);
});
check('active existing copy and fresh checkbox preserve unchanged metadata-only rules',()=>{
 const h=fixture(),r=rule(h),before=funds(h.L);open(h,'laptop');assert(view(h).textContent.includes('Your current hack stays on'));assert(view(h).textContent.includes('new or changed hack'));assert.equal(h.document.getElementById('sh-consent').checked,false);h.set('goalName','My laptop');save(h,true);
 assert.equal(h.L.state.goals[0].name,'My laptop');assert.deepEqual(json(h.L.savingsHacks.get('laptop')),json(r));unchangedMoney(h.L,before);
 open(h,'laptop');h.set('goalName','Rejected metadata');h.set('sh-value',10);save(h,true);assert.equal(h.L.route,'goalEdit');assert.equal(h.L.state.goals[0].name,'My laptop');assert.equal(h.L.savingsHacks.get('laptop').value,5);assert.equal(h.L.savingsHacks.get('laptop').revision,r.revision);consent(h);save(h,true);assert.equal(h.L.state.goals[0].name,'Rejected metadata');assert.equal(h.L.savingsHacks.get('laptop').value,10);assert.equal(h.L.savingsHacks.get('laptop').revision,r.revision+1);unchangedMoney(h.L,before);clean(h);
});
check('Back and task exit retain the same new Box draft and explicit Cancel discards it',()=>{
 const h=fixture();h.L.go('goals');settle(h);click(h,'Add another Money Box');name(h,'Unfinished trip');configureFields(h,'income');h.set('sh-value',12);consent(h);h.L.back();settle(h);open(h);assert.equal(h.document.getElementById('goalName').value,'Unfinished trip');assert.equal(h.document.getElementById('sh-kind').value,'income');assert.equal(h.document.getElementById('sh-value').value,'12');assert.equal(h.document.getElementById('sh-consent').checked,false);
 // Exercise the native whole-journey exit contract; Signal pages expose Back instead of a modal X.
 if(h.L.signalEdition)h.L.closeTask();else{const close=h.document.querySelector('.task-sheet-close');assert(close);close.click();}settle(h);assert.equal(h.L.route,'home');open(h);assert.equal(h.document.getElementById('goalName').value,'Unfinished trip');assert.equal(h.document.getElementById('sh-kind').value,'income');click(h,'Cancel');open(h);assert.equal(h.document.getElementById('goalName').value,'');assert.equal(h.document.getElementById('sh-kind').value,'manual');assert.equal(h.L.state.goals.length,1);clean(h);
});
check('an unfinished new Box rule cannot leak into an existing Box',()=>{
 const h=fixture();open(h);name(h,'Unfinished trip');configureFields(h,'income');h.set('sh-value',12);h.L.go('goals');settle(h);open(h,'laptop');assert.equal(h.document.getElementById('goalName').value,'Laptop');assert.equal(h.document.getElementById('sh-kind').value,'manual');save(h,true);assert.equal(h.L.savingsHacks.get('laptop'),null);open(h);assert.equal(h.document.getElementById('goalName').value,'Unfinished trip');assert.equal(h.document.getElementById('sh-kind').value,'income');assert.equal(h.document.getElementById('sh-value').value,'12');clean(h);
});
check('protected Box creation retains partner invitation and attaches the rule to that Box',()=>{
 const h=fixture(),before=funds(h.L);open(h);name(h,'Protected trip');configureFields(h);consent(h);const protect=h.document.getElementById('goalProtect');assert(protect);protect.checked=true;h.L.toggleMoneyBoxProtectionFields();h.set('goalPartner','0241112222');save(h);
 const g=h.L.state.goals.find(g=>g.name==='Protected trip');assert(g);assert.equal(h.L.route,'boxProtectionInvite');assert.equal(h.L.savingsHacks.get(g.id).enabled,true);assert(h.L.boxProtection.get(g.id).invitation);unchangedMoney(h.L,before);clean(h);
});
check('Edit opens the correct existing Box with fresh consent and focuses its Savings hack section',()=>{
 const h=fixture();rule(h);const section=goal(h);click(h,'Edit',section);assert.equal(h.L.route,'goalEdit');assert.equal(h.L.params.id,'laptop');assert.equal(h.document.getElementById('sh-kind').value,'spend');assert.equal(h.document.getElementById('sh-consent').checked,false);assert.equal(h.document.activeElement.id,'sh-kind');clean(h);
});
check('Add savings hack later opens the chosen Box and focuses its Savings hack section',()=>{
 const h=fixture();h.L.state.goals.push({id:'trip',name:'Trip',target:900,allocated:30,boxVersion:2});const section=goal(h,'trip');click(h,'Add savings hack',section);assert.equal(h.L.route,'goalEdit');assert.equal(h.L.params.id,'trip');assert.equal(h.document.getElementById('goalName').value,'Trip');assert.equal(h.document.getElementById('sh-kind').value,'manual');assert.equal(h.document.activeElement.id,'sh-kind');configureFields(h,'income');consent(h);save(h,true);assert.equal(h.L.savingsHacks.get('trip').kind,'income');assert.equal(h.L.savingsHacks.get('laptop'),null);clean(h);
});
check('Pause and explicit Resume retain limits and never move saved money',()=>{
 const h=fixture(),r=rule(h),before=funds(h.L);let section=goal(h);click(h,'Pause',section);assert.equal(h.L.savingsHacks.get('laptop').enabled,false);section=view(h).querySelector('.savings-hack-status');assert(section.textContent.includes('Paused'));click(h,'Resume hack',section);const resumed=h.L.savingsHacks.get('laptop');assert.equal(resumed.enabled,true);assert.equal(resumed.monthlyCap,r.monthlyCap);assert.equal(resumed.minBalance,r.minBalance);unchangedMoney(h.L,before);clean(h);
});
check('paused metadata editing keeps the instruction paused without a fresh opt-in',()=>{
 const h=fixture();rule(h);h.L.savingsHacks.pause('laptop');const before=json(h.L.savingsHacks.get('laptop'));open(h,'laptop');assert.equal(h.document.getElementById('sh-kind').value,'paused');assert.equal(h.document.getElementById('sh-consent'),null);h.set('goalName','Paused laptop');save(h,true);assert.deepEqual(json(h.L.savingsHacks.get('laptop')),before);assert.equal(h.L.state.goals[0].name,'Paused laptop');clean(h);
});
check('inline Keep hack dismisses cancellation without changing instruction or funds',()=>{
 const h=fixture(),r=rule(h),before=funds(h.L);let section=goal(h);click(h,'Cancel hack',section);assert.equal(h.L.route,'goal');const confirm=section=view(h).querySelector('.sh-cancel-confirm');assert(confirm);assert(confirm.textContent.includes('saved money stay unchanged'));assert.equal(h.L.savingsHacks.get('laptop').enabled,true);click(h,'Keep hack',confirm);assert.equal(view(h).querySelector('.sh-cancel-confirm'),null);assert.deepEqual(json(h.L.savingsHacks.get('laptop')),json(r));unchangedMoney(h.L,before);clean(h);
});
check('confirmed cancellation keeps saved funds and records cancellation rather than a skipped saving',()=>{
 const h=fixture();rule(h);h.L.addTx({type:'out',name:'Sample purchase',amount:40,status:'success',method:'Mobile Money',category:'Other',draftId:'ui-cancel-source'});const before=funds(h.L);assert.equal(h.L.state.goals[0].allocated,102);
 let section=goal(h);click(h,'Cancel hack',section);const confirm=view(h).querySelector('.sh-cancel-confirm');assert(confirm);click(h,'Cancel hack',confirm);section=view(h).querySelector('.savings-hack-status');assert(section.textContent.includes('Add savings hack'));assert(!section.textContent.includes('Resume hack'));const details=view(h).querySelector('.savings-hack-details');assert(details.textContent.includes('Savings hack cancelled'));assert(details.textContent.includes('No money moved'));assert(!details.textContent.includes('Saving skipped'));const r=h.L.savingsHacks.get('laptop');assert.equal(r.enabled,false);assert.equal(r.stoppedReason,'cancelled');assert(r.cancelledAt);assert.equal(r.consent,null);assert.equal(h.L.savingsHacks.history('laptop')[0].status,'cancelled');unchangedMoney(h.L,before);clean(h);
});
check('re-adding a cancelled hack requires fresh consent and preserves all saved money',()=>{
 const h=fixture();rule(h);const before=funds(h.L);goal(h);click(h,'Cancel hack',view(h).querySelector('.savings-hack-status'));click(h,'Cancel hack',view(h).querySelector('.sh-cancel-confirm'));click(h,'Add savings hack',view(h).querySelector('.savings-hack-status'));assert.equal(h.document.getElementById('sh-kind').value,'manual');configureFields(h,'income');assert.equal(h.document.getElementById('sh-consent').checked,false);save(h,true);assert.equal(h.L.route,'goalEdit');assert.equal(h.L.savingsHacks.get('laptop').stoppedReason,'cancelled');consent(h);save(h,true);const r=h.L.savingsHacks.get('laptop');assert.equal(r.enabled,true);assert.equal(r.kind,'income');assert(!r.cancelledAt);assert.equal(h.L.savingsHacks.history('laptop').filter(e=>e.status==='cancelled').length,1);unchangedMoney(h.L,before);clean(h);
});
check('new automatic savings retain the existing separately approved saving prompt preference',()=>{
 const h=fixture();const result=h.L.savingRules.configure({enabled:true,kind:'fixed',value:20,boxId:'laptop'});assert.equal(result.ok,true);const before=JSON.stringify(h.L.state.savingPrompts.rule);open(h,'laptop');configureFields(h,'income');consent(h);save(h,true);assert.equal(JSON.stringify(h.L.state.savingPrompts.rule),before);clean(h);
});
check('per-box Add is the only saving setup for new customers while existing manual preferences remain manageable',()=>{
 const h=fixture(),{L}=h;goal(h);assert.equal(view(h).querySelectorAll('button').filter(b=>b.textContent.trim()==='Add savings hack').length,1);assert(!view(h).textContent.includes('Saving prompt'));assert(view(h).textContent.includes('View savings progress'));
 L.go('goals');settle(h);assert.equal(view(h).querySelector('.saving-rule-link'),null);
 assert.equal(L.savingRules.configure({enabled:true,kind:'fixed',value:20,boxId:'laptop'}).ok,true);const saved=JSON.stringify(L.state.savingPrompts.rule);L.render();assert(view(h).querySelector('.saving-rule-link').textContent.includes('Manual saving prompt'));
 goal(h);assert(view(h).textContent.includes('Manual saving prompt'));rule(h);L.render();assert(!view(h).textContent.includes('Manual saving prompt'));assert(view(h).textContent.includes('View savings progress'));L.go('goals');settle(h);assert.equal(view(h).querySelector('.saving-rule-link'),null);assert.equal(JSON.stringify(L.state.savingPrompts.rule),saved);
 L.savingsHacks.pause('laptop');L.render();assert(view(h).querySelector('.saving-rule-link').textContent.includes('Manual saving prompt'));assert.equal(JSON.stringify(L.state.savingPrompts.rule),saved);clean(h);
});
console.log(passed+' Savings hack UI checks passed; '+failed+' failed.');
if(failed)process.exitCode=1;
