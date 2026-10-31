/* Mounted recurring guidance. Financial facts, approvals and form nodes remain authoritative. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const shipped=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
const source=fs.readFileSync(path.resolve(__dirname,'../dist/page-guidance.js'),'utf8');
const json=x=>JSON.parse(JSON.stringify(x)),view=h=>h.document.getElementById('view');
const settle=h=>{h.flushHistory();h.flush();};
const guide=h=>view(h).querySelector('.page-guidance');
const load=h=>vm.runInContext(source,h.context,{filename:'page-guidance.js'});
function fixture({guidance=true}={}){
 const h=createHarness({clock:true,testing:true,modules:shipped.filter(x=>x!=='page-guidance.js')}),{L}=h;
 L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:1000,txs:[],paymentDraft:null,goals:[{id:'laptop',name:'Laptop',target:3500,allocated:100,boxVersion:2},{id:'trip',name:'Trip',target:500,allocated:0,boxVersion:2}],essentials:[{id:'food',name:'Food',amount:200,paid:0,externalPaid:0,coverageVersion:1}],planSaved:true,planHorizon:{mode:'date',date:'2099-05-20'}});
 delete L.state.pageGuidance;L.route='home';L.params={};L.history=[];
 if(guidance)load(h);L.render();settle(h);return h;
}
function go(h,route,params={}){h.L.go(route,params);settle(h);assert.equal(h.L.route,route);}
function clean(h){assert.deepEqual(h.errors,[]);}
const money=L=>json({balance:L.state.balance,goals:L.state.goals,essentials:L.state.essentials,txs:L.state.txs,accounts:L.state.accounts,paymentDraft:L.state.paymentDraft,savingHacks:L.state.savingHacks});
let passed=0,failed=0;
function check(name,run){try{run();passed++;console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack);}}

check('first Money Boxes visit reuses one lower explainer and keeps primary controls ahead of education',()=>{
 const h=fixture(),before=money(h.L);go(h,'goals');const g=guide(h);assert(g);assert(g.hasAttribute('open'));assert.equal(view(h).querySelectorAll('.page-guidance').length,1);assert.equal(g.querySelector('summary').textContent,'How Money Boxes work');assert(g.textContent.includes('Funding a box transfers Everyday money'));assert(g.textContent.includes('Save for what matters to you.'));assert(view(h).innerHTML.indexOf('Add another Money Box')<view(h).innerHTML.indexOf('page-guidance'));assert(!view(h).querySelector('.page-heading').textContent.includes('Save for what matters'));assert.deepEqual(money(h.L),before);clean(h);
});
check('same-visit rerenders retain open or manually closed state and navigation returns collapsed',()=>{
 const h=fixture();go(h,'goals');assert(guide(h).hasAttribute('open'));h.L.render();settle(h);assert(guide(h).hasAttribute('open'));
 guide(h).querySelector('summary').click();assert(!guide(h).hasAttribute('open'));h.L.render();settle(h);assert(!guide(h).hasAttribute('open'));
 guide(h).querySelector('summary').click();assert(guide(h).hasAttribute('open'));h.L.render();settle(h);assert(guide(h).hasAttribute('open'));
 go(h,'home');go(h,'goals');assert(!guide(h).hasAttribute('open'));guide(h).querySelector('summary').click();assert(guide(h).hasAttribute('open'));clean(h);
});
check('Got it closes in place with focus, scroll and an unfinished form unchanged',()=>{
 const h=fixture(),before=money(h.L);go(h,'goalEdit');h.set('goalName','Unfinished conference');h.set('goalTarget','1200');const input=h.document.getElementById('goalName'),node=guide(h),summary=node.querySelector('summary');view(h).scrollTop=231;input.focus();let renders=0;const render=h.L.render;h.L.render=function(...args){renders++;return render.apply(this,args);};node.querySelector('.page-guidance-dismiss').click();
 assert.equal(renders,0);assert.equal(h.document.getElementById('goalName'),input);assert.equal(input.value,'Unfinished conference');assert.equal(view(h).scrollTop,231);assert.equal(h.document.activeElement,summary);assert(!node.hasAttribute('open'));assert.equal(h.L.state.pageGuidance.dismissed.goalEdit,true);assert.deepEqual(money(h.L),before);summary.click();assert(node.hasAttribute('open'));assert.equal(input.value,'Unfinished conference');clean(h);
});
check('a distinct Money Box visit shares one route preference rather than reopening per box',()=>{
 const h=fixture();go(h,'goal',{id:'laptop'});assert(guide(h).hasAttribute('open'));go(h,'goal',{id:'trip'});assert(!guide(h).hasAttribute('open'));assert.deepEqual(Object.keys(h.L.state.pageGuidance.seen),['goal']);assert(view(h).textContent.includes('Trip'));clean(h);
});
check('same-route state and owner changes cannot inherit an old mounted disclosure state',()=>{
 const h=fixture();go(h,'profile');guide(h).querySelector('.page-guidance-dismiss').click();const firstOwner=h.L.state.pageGuidance.owner;
 h.L.state.profile.account='9300999999';h.L.render();settle(h);assert.notEqual(h.L.state.pageGuidance.owner,firstOwner);assert(guide(h).hasAttribute('open'));
 const next=json(h.L.state);next.profile.account='9300888888';h.L.state=next;h.L.render();settle(h);assert(guide(h).hasAttribute('open'));assert.equal(h.L.state.pageGuidance.owner,'9300888888');clean(h);
});
check('seen guidance is saved in the existing profile state and reloads collapsed',()=>{
 const h=fixture();go(h,'goals');const saved=[...h.store.values()].map(value=>{try{return JSON.parse(value);}catch{return null;}}).find(s=>s?.pageGuidance?.seen?.goals);assert(saved);assert.equal(saved.pageGuidance.owner,h.L.state.profile.account);
 const restored=fixture();restored.L.state=json(saved);restored.L.route='goals';restored.L.params={};restored.L.render();settle(restored);assert(guide(restored));assert(!guide(restored).hasAttribute('open'));clean(restored);
});
for(const route of ['cardsHome','moneyStoryHome'])check(route+' returns to its retained parent DOM with education collapsed',()=>{
 const h=fixture();go(h,route);const original=guide(h);assert(original.hasAttribute('open'));go(h,'addMoney');assert(!original.hasAttribute('open'));h.L.closeTask();settle(h);assert.equal(h.L.route,route);assert.equal(guide(h)===original,true,'Parent guide node retained');assert(!original.hasAttribute('open'));clean(h);
});
for(const route of ['planEdit','essentials','addMoney','sendOptions','requests','activity','virtualCards','cardsHome','moneyStoryHome','profile','profileEdit','security','devices','privacy','notificationPrefs','statements','dataExport','help','supportCase'])check(route+' keeps its task ahead of first-use education and collapses on return',()=>{
 const h=fixture(),before=money(h.L);go(h,route);const node=guide(h);assert(node,'Reviewed education exists on '+route);assert(node.hasAttribute('open'));assert(node.querySelector('.page-guidance-dismiss'));go(h,'home');go(h,route);assert(!guide(h).hasAttribute('open'));assert.deepEqual(money(h.L),before);clean(h);
});
check('Budget amount semantics and Savings hack consent stay outside optional education',()=>{
 const h=fixture();go(h,'essentialEdit',{id:'food'});const total=h.document.getElementById('essential-total-help');assert(total);assert(!total.closest('.page-guidance'));assert(total.textContent.includes('Not per day'));assert.equal(h.document.getElementById('essAmount').value,'200');
 go(h,'goalEdit',{id:'laptop'});h.set('sh-kind','income');const consent=h.document.getElementById('sh-consent');assert(consent);assert(!consent.closest('.page-guidance'));assert.equal(consent.checked,false);assert(view(h).querySelector('.sh-example'));assert(view(h).querySelector('.sh-limits'));clean(h);
});
check('requests move only the fixed tagline while preserving illustration, title, filters and live rows',()=>{
 const h=fixture();h.L.state.requests=[{id:'RQ-1',from:'self',to:'Abena',amount:45,note:'Lunch',status:'waiting',created:new Date().toISOString(),expires:'2099-06-01'}];go(h,'requests');const node=guide(h);assert(node.textContent.includes('A simple ask.'));assert(node.textContent.includes('Keep track of what you’ve asked for'));assert.equal(view(h).querySelector('h1').textContent,'Money requests');assert(view(h).querySelector('.scene-art'));assert(!node.querySelector('.scene-art'));assert(view(h).querySelector('[aria-label="Filter requests"]'));assert(view(h).textContent.includes('GH₵45.00'));assert(!node.textContent.includes('GH₵45.00'));clean(h);
});
check('empty-state help, simulation disclosures and active security advice stay visible',()=>{
 const h=fixture();h.L.state.goals=[];go(h,'goals');const empty=view(h).querySelector('.empty');assert(empty);assert(!empty.closest('.page-guidance'));assert(empty.textContent.includes('A laptop'));
 go(h,'virtualCards');const cardEmpty=view(h).querySelector('.vc-empty');assert(cardEmpty);assert(!cardEmpty.closest('.page-guidance'));assert(!view(h).querySelector('.vc-disclosure').closest('.page-guidance'));
 go(h,'security');const warning=view(h).querySelectorAll('p').find(p=>p.textContent.includes('Lumo support will never ask'));assert(warning);assert(!warning.closest('.page-guidance'));clean(h);
});
check('payment review and typed PIN authorisation remain unchanged and cannot become optional guidance',()=>{
 const h=fixture({guidance:false});h.L.pickMerchant('AK01');settle(h);h.set('payment-amount',40);h.L.preparePayment();settle(h);assert.equal(h.L.route,'paymentReview');const before=view(h).innerHTML,financial=money(h.L);load(h);h.L.render();settle(h);assert.equal(view(h).innerHTML,before);assert.equal(guide(h),null);assert.deepEqual(money(h.L),financial);
 h.L.continuePayment();settle(h);assert.equal(h.L.route,'authorize');const pin=h.document.getElementById('payment-pin');h.set('payment-pin','12');assert.equal(guide(h),null);assert(pin);assert(view(h).textContent.includes('GH₵40.00'));assert(!view(h).querySelector('[data-guidance-route]'));clean(h);
});
check('unguided Plan and Pay do not gain filler and signed-out pages never record tutorial state',()=>{
 const h=fixture();go(h,'plan');assert.equal(guide(h),null);go(h,'pay');assert.equal(guide(h),null);
 const fresh=createHarness({clock:true,testing:true,modules:[...shipped.filter(x=>x!=='page-guidance.js'),'page-guidance.js']});fresh.L.render();settle(fresh);assert.equal(fresh.L.state.pageGuidance,undefined);assert.equal(guide(fresh),null);clean(fresh);clean(h);
});
console.log(`${passed} page guidance checks passed; ${failed} failed.`);if(failed)process.exitCode=1;
