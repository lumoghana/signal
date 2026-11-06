import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState,applyAction,validStoredState,migrateState} from '../dist/js/model.js';
import {createPersistence} from '../dist/js/persistence.js';
import {commitAction} from '../dist/js/state-boundary.js';
import {getBoxPartnerInvitation,getBoxPartnerInvitationPreview} from '../dist/js/box-partner-invitation.js';

const partner={name:'Esi',phone:'+233 24 111 2222'};
const scope={setupId:'student-goal-one',boxName:'Next semester',partner};
const protectedCreate=(proof,changes={})=>({name:scope.boxName,target:80000,accountabilityPartner:partner,partnerInvitationId:proof.invitationId,partnerSetupId:scope.setupId,...changes});
const must=result=>{assert.equal(result.ok,true,result.message);return result;};
function financialSnapshot(s){return structuredClone({wallet:s.wallet,boxes:s.boxes,transactions:s.transactions,budget:s.budget,ious:s.ious,groups:s.groups});}
function invite(act,s){const sent=must(act('sendBoxPartnerInvitation',scope));must(act('respondBoxPartnerInitialInvitation',{invitationId:sent.invitationId,decision:'accepted'}));const preview=getBoxPartnerInvitationPreview(s,sent.invitationId);assert.match(preview.code,/^\d{6}$/);return {...sent,code:preview.code};}
function verify(act,proof,extra={}){return act('verifyBoxPartnerInvitation',{...scope,invitationId:proof.invitationId,code:proof.code,...extra});}
function storageHarness(){
 const data=new Map();let failWrite=false;
 const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>{if(failWrite&&key==='partner-test')throw new Error('Storage full');data.set(key,value);},removeItem:key=>data.delete(key)};
 const state=createDemoState();
 const controller=createPersistence({storage,key:'partner-test',empty:()=>state,validate:validStoredState,migrate:migrateState});must(controller.load());
 const act=(type,payload)=>commitAction({state,type,payload,apply:applyAction,persistence:controller});
 return {state,storage,controller,act,setFailWrite:value=>{failWrite=value;}};
}

test('initial partner acceptance and number confirmation persist through the actual durable action boundary',()=>{
 const h=storageHarness(),before=financialSnapshot(h.state),proof=invite(h.act,h.state);
 assert.deepEqual(financialSnapshot(h.state),before,'Sending and accepting the invitation must not create a box or move money.');
 must(verify(h.act,proof));assert.deepEqual(financialSnapshot(h.state),before);
 h.controller.release();
 const fresh=createPersistence({storage:h.storage,key:'partner-test',empty:createDemoState,validate:validStoredState,migrate:migrateState});
 const loaded=must(fresh.load()).state;
 assert.equal(getBoxPartnerInvitation(loaded,{...scope,invitationId:proof.invitationId}).status,'verified');
 const create=commitAction({state:loaded,type:'createBox',payload:protectedCreate(proof),apply:applyAction,persistence:fresh});must(create);
 const box=loaded.boxes.find(b=>b.id===create.id);assert.equal(box.protection.status,'active');assert.equal(box.protection.partner.phone,'0241112222');
 assert.equal(loaded.wallet,before.wallet);assert.deepEqual(loaded.transactions,before.transactions);
 assert.equal(getBoxPartnerInvitation(loaded,{...scope,invitationId:proof.invitationId}).status,'consumed');fresh.release();
});

test('a failed save cannot mark the number confirmed or consume a valid code',()=>{
 const h=storageHarness(),proof=invite(h.act,h.state);h.setFailWrite(true);
 const failed=verify(h.act,proof);assert.equal(failed.ok,false);assert.equal(failed.persistenceFailure,true);
 assert.equal(getBoxPartnerInvitation(h.state,{...scope,invitationId:proof.invitationId}).status,'accepted');
 h.setFailWrite(false);must(h.controller.check());must(verify(h.act,proof));
 const created=must(h.act('createBox',protectedCreate(proof,{idempotencyKey:'one-box'})));
 must(h.act('createBox',protectedCreate(proof,{idempotencyKey:'one-box'})));
 assert.equal(h.state.boxes.filter(b=>b.id===created.id).length,1);
 assert.equal(h.act('createBox',protectedCreate(proof,{idempotencyKey:'another-box'})).ok,false);h.controller.release();
});

test('wrong-code lock survives save and reload instead of resetting the attempt allowance',()=>{
 const h=storageHarness(),proof=invite(h.act,h.state),before=financialSnapshot(h.state);
 for(let i=0;i<5;i++)assert.equal(verify(h.act,proof,{code:'000000'}).ok,false);
 assert.equal(getBoxPartnerInvitation(h.state,{...scope,invitationId:proof.invitationId}).status,'locked');
 assert.deepEqual(financialSnapshot(h.state),before);h.controller.release();
 const restored=createPersistence({storage:h.storage,key:'partner-test',empty:createDemoState,validate:validStoredState,migrate:migrateState});const state=must(restored.load()).state;
 assert.equal(applyAction(state,'verifyBoxPartnerInvitation',{...scope,invitationId:proof.invitationId,code:proof.code}).ok,false);
 assert.equal(applyAction(state,'createBox',protectedCreate(proof)).ok,false);restored.release();
});

test('the setup code cannot become a withdrawal authorisation or a reusable cached proof',()=>{
 const s=createDemoState(),act=(type,payload)=>applyAction(s,type,payload),proof=invite(act,s);
 must(verify(act,proof,{idempotencyKey:'verified-once'}));const created=must(act('createBox',protectedCreate(proof)));
 must(act('contributeBox',{boxId:created.id,amount:5000}));const before=financialSnapshot(s);
 assert.equal(act('withdrawBox',{boxId:created.id,amount:2000,code:proof.code,requestId:proof.invitationId,pin:'1234'}).ok,false);
 const request=must(act('requestBoxRelease',{boxId:created.id,kind:'withdrawal',amount:2000}));
 const withdrawalCode=must(act('issueBoxPartnerCode',{boxId:created.id,requestId:request.requestId}));
 assert.notEqual(withdrawalCode.code,proof.code,'A withdrawal receives a fresh code distinct from the setup code.');
 assert.equal(act('verifyBoxPartnerCode',{boxId:created.id,requestId:request.requestId,code:proof.code}).authorized,false);
 assert.equal(act('withdrawBox',{boxId:created.id,requestId:request.requestId,amount:2000,pin:'1234'}).ok,false);
 assert.equal(verify(act,proof,{idempotencyKey:'verified-once'}).ok,false);
 assert.equal(act('createBox',protectedCreate(proof,{name:'Another goal'})).ok,false);
 assert.equal(s.wallet,before.wallet);assert.deepEqual(s.transactions,before.transactions);
 assert.equal(s.boxes.find(b=>b.id===created.id).balance,before.boxes.find(b=>b.id===created.id).balance);
});

test('changing the entered number or goal after confirmation never creates a protected box with stale consent',()=>{
 const s=createDemoState(),act=(type,payload)=>applyAction(s,type,payload),proof=invite(act,s);must(verify(act,proof));const before=financialSnapshot(s);
 for(const changes of [{name:'Something else'},{partnerSetupId:'new-draft'},{accountabilityPartner:{name:'Esi',phone:'0205551234'}},{accountabilityPartner:{name:'Adwoa',phone:'0241112222'}}])assert.equal(act('createBox',protectedCreate(proof,changes)).ok,false);
 assert.deepEqual(financialSnapshot(s),before);
 const view=getBoxPartnerInvitation(s,{...scope,invitationId:proof.invitationId});assert.equal(Object.hasOwn(view,'code'),false);
 for(const key of ['wallet','budget','transactions','ious','pin'])assert.equal(Object.hasOwn(view,key),false);
});
