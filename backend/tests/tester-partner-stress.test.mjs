import test from 'node:test';
import assert from 'node:assert/strict';
// Exercise the canonical partner implementation; the separate reviewed patch is verified against live v18.
import {createEmptyState,applyAction} from '../supabase/functions/lumo-approved/domain/model.js';
import {normalizePartnerCode} from '../supabase/functions/lumo-approved/domain/partner-code.js';
import {collectPartnerChanges,overlayPartners,publicPartnerInbox,partnerRespond} from '../supabase/functions/lumo-approved/partners.mjs';
const owner='11111111-1111-4111-8111-111111111111',partner='22222222-2222-4222-8222-222222222222',stranger='33333333-3333-4333-8333-333333333333';
const clone=x=>JSON.parse(JSON.stringify(x));const details={setupId:'setup-stress',boxName:'Laptop',partner:{name:'Kofi',phone:'0242222222'}};
const resolver={resolve:async()=>({ok:true,recipient:{userId:partner}})};
async function fixture(kind='initial'){
 const state=createEmptyState({name:'Ama',phone:'0241111111'});state.profile.phone='0241111111';assert.equal(applyAction(state,'sendBoxPartnerInvitation',details).ok,true);
 const invitation=state.boxPartnerInvitations[0];
 if(kind==='release'){
  assert.equal(applyAction(state,'respondBoxPartnerInitialInvitation',{invitationId:invitation.id,decision:'accepted'}).ok,true);
  assert.equal(applyAction(state,'verifyBoxPartnerInvitation',{...details,invitationId:invitation.id,code:invitation.code}).ok,true);
  const made=applyAction(state,'createBox',{name:'Laptop',target:100000,accountabilityPartner:details.partner,partnerSetupId:details.setupId,partnerInvitationId:invitation.id});assert.equal(made.ok,true,made.message);const box=state.boxes.find(x=>x.id===made.id);box.balance=10000;
  assert.equal(applyAction(state,'requestBoxRelease',{boxId:box.id,kind:'withdrawal',amount:2500}).ok,true);
 }
 const rows=(await collectPartnerChanges({},state,{partners:[]},owner,resolver)).map(row=>({...row,revision:1}));let row=rows.find(x=>x.kind===kind),writes=0,reads=0;
 const repo={service:async(command,payload)=>{
  if(command==='partner.read'){reads++;return {ok:true,row:clone(row),ownerState:clone(state),partners:rows.map(x=>clone(x.id===row.id?row:x))};}
  if(payload.expectedRevision!==row.revision)return {ok:false,code:'REVISION_CONFLICT'};
  writes++;row={...row,state:clone(payload.state),revision:row.revision+1};return {ok:true,row:clone(row)};
 }};
 return {state,repo,get row(){return row},set row(value){row=value},get writes(){return writes},get reads(){return reads}};
}
const respond=(f,decision='accepted',actor=partner)=>partnerRespond({body:{id:f.row.id,decision},identity:{userId:actor},repo:f.repo});

test('100 concurrent initial accepts produce one decision write and retain one code',async()=>{
 const f=await fixture(),code=f.row.state.invitation.code;const results=await Promise.all(Array.from({length:100},()=>respond(f)));
 assert.equal(f.writes,1);assert.equal(f.row.revision,2);assert.equal(results.filter(r=>r.result.duplicate).length,99);assert.equal(results.every(r=>r.inbox[0].code===code),true);assert.equal(f.row.state.invitation.status,'accepted');
});
test('100 concurrent declines succeed idempotently with no remaining code',async()=>{
 const f=await fixture();const results=await Promise.all(Array.from({length:100},()=>respond(f,'declined')));assert.equal(f.writes,1);assert.equal(f.row.state.invitation.status,'declined');assert.equal(results.every(r=>r.ok&&!r.inbox[0].code),true);
});
test('lost successful response retry does not rotate code or advance revision',async()=>{
 const f=await fixture();await respond(f);const before=clone(f.row);const retried=await respond(f);assert.equal(retried.result.duplicate,true);assert.deepEqual(f.row,before);assert.equal(f.writes,1);
});
test('expired accepted retry returns expired status without exposing or extending code',async()=>{
 const f=await fixture();await respond(f);f.row.state.invitation.expiresAt=new Date(Date.now()-1000).toISOString();const retry=await respond(f);assert.equal(retry.result.duplicate,true);assert.equal(retry.inbox[0].status,'expired');assert.equal(retry.inbox[0].code,undefined);assert.equal(f.writes,1);
});
test('consumed initial acceptance is acknowledged without restoring confirmation code',async()=>{
 const f=await fixture();await respond(f);f.row.state.invitation.status='consumed';delete f.row.state.invitation.code;const r=await respond(f);assert.equal(r.result.duplicate,true);assert.equal(r.inbox[0].status,'consumed');assert.equal(r.inbox[0].code,undefined);assert.equal(f.writes,1);
});
test('wrong owner, stranger and self-bound rows cannot exploit duplicate response path',async()=>{
 const f=await fixture();await respond(f);for(const actor of[owner,stranger])await assert.rejects(respond(f,'accepted',actor),e=>e.code==='FORBIDDEN');f.row.partnerUserId=owner;await assert.rejects(respond(f,'accepted',owner),e=>e.code==='FORBIDDEN');assert.equal(f.writes,1);
});
test('expired, superseded and locked first invitations cannot be accepted',async()=>{
 for(const status of['expired','superseded','locked']){const f=await fixture();f.row.state.invitation.status=status;f.row.state.invitation.expiresAt=new Date(Date.now()-1000).toISOString();await assert.rejects(respond(f),e=>e.code==='PARTNER_CHANGED');assert.equal(f.writes,0);}
});
test('revision conflicts retry only three times and never claim a response was recorded',async()=>{
 const f=await fixture();let attempts=0;const original=f.repo.service;f.repo.service=async(command,payload)=>command==='partner.read'?original(command,payload):(attempts++,{ok:false,code:'REVISION_CONFLICT'});
 await assert.rejects(respond(f),e=>e.code==='REVISION_CONFLICT');assert.equal(attempts,3);assert.equal(f.writes,0);
});
test('50 simultaneous release accepts issue one amount-scoped code and one canonical write',async()=>{
 const f=await fixture('release');const results=await Promise.all(Array.from({length:50},()=>respond(f)));assert.equal(f.writes,1);assert.equal(f.row.state.request.status,'code-issued');assert.equal(new Set(results.map(r=>r.inbox[0].code)).size,1);assert.equal(results.every(r=>r.inbox[0].amount===2500),true);assert.equal(results.every(r=>!r.inbox[0].balance&&!r.inbox[0].wallet),true);
});
test('repeat release decline stays declined without another revision or approval',async()=>{
 const f=await fixture('release');await respond(f,'declined');const again=await respond(f,'declined');assert.equal(again.result.duplicate,true);assert.equal(f.writes,1);assert.equal(f.row.state.request.status,'denied');assert.equal(again.inbox[0].code,undefined);
});
test('release response refuses a changed current protection mandate',async()=>{
 const f=await fixture('release');f.state.boxes[0].protection.invitationId='different-protection';await assert.rejects(respond(f),e=>e.code==='PARTNER_CHANGED');assert.equal(f.writes,0);
});
test('duplicate release acceptance still checks the current protection mandate before returning code',async()=>{
 const f=await fixture('release');await respond(f);f.state.boxes[0].protection.invitationId='changed-after-approval';await assert.rejects(respond(f),e=>e.code==='PARTNER_CHANGED');assert.equal(f.writes,1);
});
test('code normalization accepts separators only, never guessing digits',()=>{
 for(const input of['123456',' 123 456 ','123-456','123\n456','123\u00a0456'])assert.equal(normalizePartnerCode(input),'123456');
 for(const input of[123456,null,'12345','1234567','123/456','123.456','I23456','１２３４５６','١٢٣٤٥٦','1'.repeat(33),'123\u200b456'])assert.equal(normalizePartnerCode(input),'');
});
test('formatted initial code verifies once while wrong codes still exhaust five attempts',async()=>{
 const f=await fixture();const accepted=await respond(f);let ownerState=overlayPartners(clone(f.state),[f.row],owner),code=accepted.inbox[0].code;
 const ok=applyAction(ownerState,'verifyBoxPartnerInvitation',{...details,invitationId:f.row.id,code:code.slice(0,3)+'-'+code.slice(3)});assert.equal(ok.ok,true,ok.message);assert.equal(ownerState.boxPartnerInvitations[0].status,'verified');
 const g=await fixture();await respond(g);ownerState=overlayPartners(clone(g.state),[g.row],owner);
 for(let i=1;i<=5;i++){const bad=applyAction(ownerState,'verifyBoxPartnerInvitation',{...details,invitationId:g.row.id,code:'000 000'});assert.equal(bad.ok,false);assert.equal(ownerState.boxPartnerInvitations[0].attempts,i);}
 assert.equal(ownerState.boxPartnerInvitations[0].status,'locked');assert.equal(ownerState.boxPartnerInvitations[0].code,undefined);
});
test('formatted release code verifies exact original scope but cannot release money itself',async()=>{
 const f=await fixture('release'),response=await respond(f),code=response.inbox[0].code;const state=overlayPartners(clone(f.state),[f.row],owner),box=state.boxes[0];
 const before=box.balance;const result=applyAction(state,'verifyBoxPartnerCode',{boxId:box.id,requestId:f.row.id,code:code.slice(0,3)+' '+code.slice(3)});assert.equal(result.ok,true);assert.equal(result.authorized,true);assert.equal(box.balance,before);assert.equal(box.protectionRequests[0].status,'approved');assert.equal(box.protectionRequests[0].code,undefined);
});
