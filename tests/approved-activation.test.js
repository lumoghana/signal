import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createEmptyState} from '../dist/js/model.js';
import {resumeSharedActivationDraft,safeActivationStep} from '../dist/js/activation-model.js';
import {renderActivation} from '../dist/js/activation.js';

const owner='11111111-1111-4111-8111-111111111111';
const copy=value=>JSON.parse(JSON.stringify(value));
function stateAt(step='account-created'){
 const state=createEmptyState({name:'Ama Test',phone:'0240000000'});state.onboardingDone=true;
 state.accounts=[{type:'operational',holderName:'Ama Test',status:'simulated-ready',demoNumber:'000000000001'}];
 const funded=['purpose','ready','complete'].includes(step);
 if(funded){state.wallet=10000;state.transactions=[{id:'income-confirmed',ledgerJournalId:'journal-confirmed',type:'income',direction:'in',status:'success',amount:10000,at:'2026-11-13T00:00:00Z'}];}
 if(['ready','complete'].includes(step)){state.budget={...state.budget,created:true,endDate:'2027-01-01',items:[{id:'transport',name:'Transport',amount:3000,spent:0,due:'2027-01-01'}]};state.buffer=1000;}
 state.activation={step,status:step==='waiting'?'waiting':['ready','complete'].includes(step)?'ready':'setting-up',accountAcknowledged:step!=='account-created',fundingTransactionId:funded?'income-confirmed':'',budgetSaved:['ready','complete'].includes(step),fundingDeferred:step==='waiting'};
 return state;
}

test('explicit shared checkpoints restore the approved account, money, purpose and recap order without changing money',()=>{
 for(const step of ['account-created','fund','purpose','ready']){
  const state=stateAt(step),before=JSON.stringify(state),draft=resumeSharedActivationDraft(state,owner);
  assert.equal(draft.shared,true);assert.equal(draft.sharedUserId,owner);assert.equal(safeActivationStep(draft,draft.step),step);
  const html=renderActivation({draft:{activation:draft}},{step});
  assert.match(html,step==='account-created'?/Money just.*got personal/s:step==='fund'?/Your first.*money move/s:step==='purpose'?/Give it a purpose/:/FIRST MOVE\. MADE/);
  assert.equal(JSON.stringify(state),before);assert.notEqual(draft.state,state);
 }
});

test('legacy, terminal and ownerless accounts do not restart first-time setup',()=>{
 const legacy=stateAt();delete legacy.activation;
 assert.equal(resumeSharedActivationDraft(legacy,owner),null);
 legacy.activation={status:'ready'};assert.equal(resumeSharedActivationDraft(legacy,owner),null);
 for(const step of ['complete','waiting'])assert.equal(resumeSharedActivationDraft(stateAt(step),owner),null);
 assert.equal(resumeSharedActivationDraft(stateAt(),''),null);
});

test('money or client completion flags cannot skip the real receipt and plan checkpoints',()=>{
 for(const alter of [state=>{state.transactions=[];},state=>{delete state.transactions[0].ledgerJournalId;},state=>{state.transactions[0].status='pending';}]){
  const state=stateAt('purpose');alter(state);const d=resumeSharedActivationDraft(state,owner);assert.equal(d.funded,false);assert.equal(d.step,'fund');
 }
 const state=stateAt('ready');state.budget.created=false;state.budget.items=[];
 assert.equal(resumeSharedActivationDraft(state,owner).step,'purpose');
});

const app=await readFile(new URL('../dist/js/app.js',import.meta.url),'utf8');
function source(start,end){const a=app.indexOf(start),b=app.indexOf(end,a);assert.ok(a>=0&&b>a);return app.slice(a,b);}
const syncSource=source('function syncSharedActivation(', '\nasync function checkpointActivation(');
const checkpointSource=source('async function checkpointActivation(', '\nfunction installLoadedState(');
const refreshSource=source('async function refreshShared(', '\nvoid refreshShared(');
function harness(state=stateAt()){
 const calls={saved:0,rendered:0,captured:0,initialised:0,posted:[],toasts:[]};
 const shared={connected:true,signedIn:true,user:{id:owner},authVersion:1,account:{userId:owner},partnerRequests:[]};
 const context=vm.createContext({state:copy(state),draft:{},shared,refreshingShared:false,sharedHydrated:true,sharedConnectionError:'',persistence:{release(){}},renderSharedReconnect(){},overlayMeta:null,route:{section:'activity',page:'home'},ctx:{},router:null,
  JSON,structuredClone,resumeSharedActivationDraft,
  reconcileState(target,next){for(const key of Object.keys(target))delete target[key];Object.assign(target,copy(next));},
  captureCurrent(){calls.captured++;},persistSession(){calls.saved++;},render(){calls.rendered++;},readPaymentLink(){return null;},toast(message){calls.toasts.push(message);},
  makeRouter(){return {initialise(){calls.initialised++;}}},view:{querySelector(){return null;}},
  actAsync:async(type,payload)=>{calls.posted.push({type,payload});return {ok:true};},
 });
 context.ctx.saveDraft=()=>calls.saved++;
 shared.snapshot=async()=>({ok:true});
 vm.runInContext(syncSource+'\n'+checkpointSource+'\n'+refreshSource+'\nthis.sync=syncSharedActivation;this.checkpoint=checkpointActivation;this.refresh=refreshShared;',context);
 return {context,shared,calls};
}

test('snapshot installation binds resumed setup to its owner without reusing another account’s typed plan',()=>{
 const h=harness(stateAt('purpose'));h.context.draft.activation={shared:true,sharedUserId:'previous-owner',items:[{name:'Private previous draft'}],state:stateAt('purpose')};
 h.context.sync(owner);const d=h.context.draft.activation;
 assert.equal(d.sharedUserId,owner);assert.deepEqual(copy(d.items),[]);assert.equal(d.step,'purpose');
});

test('a same-account snapshot preserves an essential being edited or deliberately removed',()=>{
 const h=harness(stateAt('ready'));h.context.sync(owner);
 const d=h.context.draft.activation;d.step='purpose';d.items=[];d.budgetSaved=false;d.category='custom';d.categoryName='Typed campus cost';d.amountText='12';
 h.context.sync(owner);
 assert.equal(d.categoryName,'Typed campus cost');assert.equal(d.amountText,'12');assert.equal(d.items.length,0);assert.equal(d.budgetSaved,false);
});

test('shared stage navigation waits for confirmed checkpoint and ignores a late response after account change',async()=>{
 const h=harness(stateAt('fund'));h.context.sync(owner);let resolve;h.context.actAsync=(type,payload)=>{h.calls.posted.push({type,payload});return new Promise(done=>{resolve=done;});};
 const operation=h.context.checkpoint('purpose',{fundingTransactionId:'income-confirmed'});
 assert.equal(h.calls.posted[0].type,'activationCheckpoint');assert.equal(h.calls.saved,0);
 h.shared.authVersion++;h.shared.user={id:'22222222-2222-4222-8222-222222222222'};
 resolve({ok:true});assert.equal((await operation).code,'ACCOUNT_CHANGED');assert.equal(h.calls.saved,0);
});

test('initial shared refresh resumes an explicitly pending setup instead of skipping to Home',async()=>{
 const h=harness(stateAt('purpose'));h.shared.snapshot=async()=>{h.context.sync(owner);return {ok:true};};
 await h.context.refresh({initial:true});
 assert.deepEqual(copy(h.context.route),{section:'activation',step:'purpose'});assert.equal(h.calls.initialised,1);
});

test('unchanged shared polling preserves Activity DOM while genuine state or partner changes refresh it',async()=>{
 const state=stateAt('complete'),h=harness(state);
 await h.context.refresh();assert.equal(h.calls.rendered,0);
 h.shared.snapshot=async()=>{h.context.state.wallet+=100;return {ok:true};};await h.context.refresh();assert.equal(h.calls.rendered,1);
 h.shared.snapshot=async()=>{h.shared.partnerRequests=[{id:'partner-invitation'}];return {ok:true};};await h.context.refresh();assert.equal(h.calls.rendered,2);
});

test('shared refresh honors another device completing setup without reopening the local draft',async()=>{
 const h=harness(stateAt('purpose'));h.context.sync(owner);h.context.route={section:'activation',step:'purpose'};
 h.shared.snapshot=async()=>{h.context.state.activation={step:'complete',status:'ready'};h.context.sync(owner);return {ok:true};};
 await h.context.refresh();assert.equal(h.context.draft.activation,undefined);assert.equal(h.calls.rendered,1);
});

test('an older local shared setup migrates only when both confirmed account aliases match',()=>{
 const state=stateAt('purpose');delete state.activation;state.account.login={username:'ama.test'};
 const h=harness(state),old=resumeSharedActivationDraft(stateAt('purpose'),owner);delete old.sharedUserId;old.state.account.login={username:'ama.test'};old.categoryName='Saved local essential';
 h.context.draft.activation=old;h.context.sync(owner);
 assert.equal(h.context.draft.activation,old);assert.equal(old.sharedUserId,owner);assert.equal(old.categoryName,'Saved local essential');
 for(const mismatch of ['phone','handle']){
  const other=harness(state),draft=copy(old);delete draft.sharedUserId;
  if(mismatch==='phone')draft.state.profile.phone='0550000000';else draft.state.account.login.username='another.test';
  other.context.draft.activation=draft;other.context.sync(owner);assert.equal(other.context.draft.activation,undefined);
 }
});
