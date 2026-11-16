import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmptyState,applyAction} from '../supabase/functions/lumo-approved/domain/model.js';
import {collectPartnerChanges,overlayPartners,publicPartnerInbox,scrubPartnerSecrets,partnerRespond} from '../supabase/functions/lumo-approved/partners.mjs';
const owner='11111111-1111-4111-8111-111111111111',partner='22222222-2222-4222-8222-222222222222',stranger='33333333-3333-4333-8333-333333333333';
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){const state=createEmptyState({name:'Ama',phone:'0241111111'});state.profile.phone='0241111111';const sent=applyAction(state,'sendBoxPartnerInvitation',{setupId:'setup-1',boxName:'Laptop',partner:{name:'Kofi',phone:'0242222222'}});assert.equal(sent.ok,true,sent.message);return state;}
const resolver={resolve:async query=>({ok:true,recipient:{userId:partner,phone:query,name:'Kofi'}})};

test('initial code is visible only to its invited partner after acceptance',async()=>{
 const state=fixture(),changes=await collectPartnerChanges({},state,{partners:[]},owner,resolver);assert.equal(changes.length,1);
 let row={...changes[0],revision:1};assert.equal(publicPartnerInbox([row],stranger).length,0);assert.equal(publicPartnerInbox([row],partner)[0].code,undefined);
 assert.equal(scrubPartnerSecrets(clone(state)).boxPartnerInvitations[0].code,undefined);
 const repo={service:async(command,payload)=>command==='partner.read'?{ok:true,row,ownerState:state,partners:[row]}:(row={...row,state:payload.state,revision:row.revision+1},{ok:true,row})};
 const response=await partnerRespond({body:{id:row.id,decision:'accepted'},identity:{userId:partner},repo});
 assert.match(response.inbox[0].code,/^\d{6}$/);assert.equal(response.inbox[0].balance,undefined);
 const ownerState=overlayPartners(clone(state),[row],owner);assert.equal(ownerState.boxPartnerInvitations[0].status,'accepted');
 const verified=applyAction(ownerState,'verifyBoxPartnerInvitation',{invitationId:row.id,setupId:'setup-1',boxName:'Laptop',partner:{name:'Kofi',phone:'0242222222'},code:response.inbox[0].code});assert.equal(verified.ok,true,verified.message);
 assert.equal(scrubPartnerSecrets(clone(ownerState)).boxPartnerInvitations[0].verifiedCode,undefined);
});

test('owner cannot impersonate the invited partner',async()=>{
 const state=fixture(),changes=await collectPartnerChanges({},state,{partners:[]},owner,resolver);const row={...changes[0],revision:1};let writes=0;
 const repo={service:async(command)=>{if(command==='partner.read')return {ok:true,row,ownerState:state};writes++;return {ok:true};}};
 await assert.rejects(partnerRespond({body:{id:row.id,decision:'accepted'},identity:{userId:owner},repo}),error=>error.code==='FORBIDDEN');assert.equal(writes,0);
});

test('unregistered partner cannot create a pretend connected invitation',async()=>{
 await assert.rejects(collectPartnerChanges({},fixture(),{partners:[]},owner,{resolve:async()=>({ok:false})}),error=>error.code==='PARTNER_NOT_FOUND');
});

test('release response retains amount scope and reveals no account balance',async()=>{
 const state=fixture();const first=state.boxPartnerInvitations[0];
 assert.equal(applyAction(state,'respondBoxPartnerInitialInvitation',{invitationId:first.id,decision:'accepted'}).ok,true);
 assert.equal(applyAction(state,'verifyBoxPartnerInvitation',{invitationId:first.id,setupId:'setup-1',boxName:'Laptop',partner:first.partner,code:first.code}).ok,true);
 const made=applyAction(state,'createBox',{name:'Laptop',target:100000,accountabilityPartner:first.partner,partnerSetupId:'setup-1',partnerInvitationId:first.id});assert.equal(made.ok,true,made.message);
 const box=state.boxes.find(x=>x.id===made.id);box.balance=10000;
 const requested=applyAction(state,'requestBoxRelease',{boxId:box.id,kind:'withdrawal',amount:2500});assert.equal(requested.ok,true,requested.message);
 const rows=(await collectPartnerChanges({},state,{partners:[]},owner,resolver)).map(row=>({...row,revision:1}));let row=rows.find(row=>row.kind==='release');
 const repo={service:async(command,payload)=>command==='partner.read'?{ok:true,row,ownerState:state,partners:rows}:(row={...row,state:payload.state,revision:2},{ok:true,row})};
 const response=await partnerRespond({body:{id:row.id,decision:'accepted'},identity:{userId:partner},repo});assert.equal(response.inbox[0].amount,2500);assert.match(response.inbox[0].code,/^\d{6}$/);assert.equal(response.inbox[0].balance,undefined);assert.equal(response.inbox[0].wallet,undefined);
 const overlaid=overlayPartners(clone(state),[row],owner),request=overlaid.boxes[0].protectionRequests[0];assert.equal(request.status,'code-issued');assert.equal(request.amount,2500);assert.equal(scrubPartnerSecrets(clone(overlaid)).boxes[0].protectionRequests[0].code,undefined);
});


test('JSON key ordering does not create extra canonical revisions',async()=>{
 const state=fixture(),first=await collectPartnerChanges({},state,{partners:[]},owner,resolver);const row={...first[0],revision:1,state:{ownerName:first[0].state.ownerName,invitation:Object.fromEntries(Object.entries(first[0].state.invitation).reverse())}};
 assert.deepEqual(await collectPartnerChanges(state,state,{partners:[row]},owner,resolver),[]);
});

test('expired codes are never shown even to the invited partner',()=>{
 const state=fixture(),invitation=state.boxPartnerInvitations[0];invitation.status='accepted';invitation.expiresAt=new Date(Date.now()-1000).toISOString();const row={id:invitation.id,kind:'initial',ownerUserId:owner,partnerUserId:partner,revision:1,state:{invitation,ownerName:'Ama'}};
 const view=publicPartnerInbox([row],partner)[0];assert.equal(view.status,'expired');assert.equal(view.code,undefined);
});


test('removed or replaced partner roles are retired in the canonical inbox',async()=>{
 const state=fixture(),initial=state.boxPartnerInvitations[0];
 const old={id:'old-role',kind:'protection',ownerUserId:owner,partnerUserId:partner,revision:3,state:{boxId:'box-1',boxName:'Laptop',ownerName:'Ama',slot:'protection',invitation:{invitationId:'old-role',status:'active',partner:{name:'Kofi',phone:'0242222222'}}}};
 const changes=await collectPartnerChanges({},state,{partners:[old]},owner,resolver);const retired=changes.find(row=>row.id==='old-role');assert.equal(retired.state.invitation.status,'superseded');assert.equal(retired.expectedRevision,3);
});
