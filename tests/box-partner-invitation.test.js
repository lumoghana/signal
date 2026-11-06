import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState,applyAction,getSummary,migrateState,validStoredState} from '../dist/js/model.js';
import {getBoxPartnerInvitation,getBoxPartnerInvitationPreview,PARTNER_CODE_LIFETIME,PARTNER_PROOF_LIFETIME} from '../dist/js/box-partner-invitation.js';
const partner={name:'Esi Owusu',phone:'+233 24 123 4567'};
const scope={setupId:'semester-box-setup',boxName:'Next semester',partner};
const run=(s,type,p={})=>{const r=applyAction(s,type,p);assert.equal(r.ok,true,r.message);return r;};
function sent(){const s=createDemoState(),r=run(s,'sendBoxPartnerInvitation',scope);return {s,id:r.invitationId};}
function accepted(){const f=sent();run(f.s,'respondBoxPartnerInitialInvitation',{invitationId:f.id,decision:'accepted'});f.code=getBoxPartnerInvitationPreview(f.s,f.id).code;return f;}
function verified(){const f=accepted();run(f.s,'verifyBoxPartnerInvitation',{...scope,invitationId:f.id,code:f.code});return f;}
const create=(f,extra={})=>applyAction(f.s,'createBox',{name:scope.boxName,target:80000,accountabilityPartner:partner,partnerInvitationId:f.id,partnerSetupId:scope.setupId,...extra});
function clock(t){const original=Date.now;let now=original();Date.now=()=>now;t.after(()=>{Date.now=original;});return n=>{now+=n;};}

test('sending the first code creates no box and does not change any money',()=>{
 const s=createDemoState(),before=getSummary(s),count=s.boxes.length,tx=structuredClone(s.transactions);
 const r=run(s,'sendBoxPartnerInvitation',scope);assert.equal(s.boxes.length,count);assert.deepEqual(getSummary(s),before);assert.deepEqual(s.transactions,tx);
 assert.equal(r.view.status,'awaiting-partner');assert.equal(r.view.partner.phone,'0241234567');assert.equal(r.view.mode,'simulation');assert.equal(r.code,undefined);
 assert.equal(getBoxPartnerInvitationPreview(s,r.invitationId).code,undefined);
});
test('protected creation is blocked without acceptance and a verified first code, even with forged flags',()=>{
 const f=sent(),before=f.s.boxes.length;
 assert.equal(create(f).ok,false);assert.equal(applyAction(f.s,'createBox',{name:'Fake',target:2000,accountabilityPartner:partner,partnerVerified:true}).ok,false);
 const privateCode=f.s.boxPartnerInvitations[0].code;assert.equal(applyAction(f.s,'verifyBoxPartnerInvitation',{...scope,invitationId:f.id,code:privateCode}).ok,false);
 assert.equal(f.s.boxes.length,before);
});
test('role acceptance reveals a scoped simulation code without exposing personal money',()=>{
 const f=accepted(),view=getBoxPartnerInvitationPreview(f.s,f.id);assert.match(view.code,/^\d{6}$/);assert.equal(view.boxName,'Next semester');
 assert.equal(view.partner.phone,'0241234567');assert.equal(view.wallet,undefined);assert.equal(view.balance,undefined);assert.equal(view.budget,undefined);
 const ownerView=getBoxPartnerInvitation(f.s,{...scope,invitationId:f.id});assert.equal(ownerView.code,undefined);assert.equal(ownerView.status,'accepted');assert.equal(create(f).ok,false);
});
test('verified initial acceptance creates an active protected box and consumes exactly one proof',()=>{
 const f=verified(),before=getSummary(f.s),result=create(f,{idempotencyKey:'box-create-once'});assert.equal(result.ok,true,result.message);
 assert.equal(result.box.protection.status,'active');assert.equal(result.box.protection.verificationMode,'simulation');assert.ok(result.box.protection.phoneVerifiedAt);assert.ok(result.box.protection.respondedAt);
 assert.equal(f.s.boxPartnerInvitations[0].status,'consumed');assert.equal(f.s.boxPartnerInvitations[0].code,undefined);assert.equal(f.s.boxPartnerInvitations[0].verifiedCode,undefined);
 assert.deepEqual(getSummary(f.s),before);const count=f.s.boxes.length;
 assert.equal(create(f,{idempotencyKey:'box-create-once'}).duplicate,true);assert.equal(f.s.boxes.length,count);assert.equal(create(f,{idempotencyKey:'different-create'}).ok,false);assert.equal(f.s.boxes.length,count);
});
test('wrong codes persist attempts and the fifth failed try locks this invitation',()=>{
 const f=accepted();for(let n=1;n<=5;n++){const r=applyAction(f.s,'verifyBoxPartnerInvitation',{...scope,invitationId:f.id,code:'000000',idempotencyKey:'reused-bad-key'});assert.equal(r.ok,false);assert.equal(r.persistFailure,true);assert.equal(r.view.attempts,n);}
 assert.equal(getBoxPartnerInvitation(f.s,{...scope,invitationId:f.id}).status,'locked');assert.equal(applyAction(f.s,'verifyBoxPartnerInvitation',{...scope,invitationId:f.id,code:f.code}).ok,false);assert.equal(create(f).ok,false);
});
test('expired SMS code cannot verify or accept; resend uses a fresh code and supersedes the first',t=>{
 const advance=clock(t),f=accepted();advance(PARTNER_CODE_LIFETIME+1);
 const expired=applyAction(f.s,'verifyBoxPartnerInvitation',{...scope,invitationId:f.id,code:f.code});assert.equal(expired.ok,false);assert.equal(expired.persistFailure,true);assert.equal(expired.view.status,'expired');
 const next=run(f.s,'sendBoxPartnerInvitation',{...scope,invitationId:f.id});assert.notEqual(next.invitationId,f.id);assert.equal(f.s.boxPartnerInvitations[0].status,'superseded');
 assert.equal(next.view.status,'accepted');assert.notEqual(getBoxPartnerInvitationPreview(f.s,next.invitationId).code,f.code);
 assert.equal(applyAction(f.s,'verifyBoxPartnerInvitation',{...scope,invitationId:f.id,code:f.code}).ok,false);
});
test('a second send inside 30 seconds cannot issue a new code or reset attempts',t=>{
 clock(t);const f=accepted();applyAction(f.s,'verifyBoxPartnerInvitation',{...scope,invitationId:f.id,code:'000000'});
 const r=applyAction(f.s,'sendBoxPartnerInvitation',scope);assert.equal(r.ok,false);assert.equal(f.s.boxPartnerInvitations.length,1);assert.equal(f.s.boxPartnerInvitations[0].attempts,1);assert.equal(getBoxPartnerInvitationPreview(f.s,f.id).code,f.code);
});
test('editing phone, partner name, box name or setup scope invalidates verification and creation',()=>{
 for(const extra of [{partner:{...partner,phone:'0201112222'}},{partner:{...partner,name:'Adwoa'}},{boxName:'Another goal'},{setupId:'another-draft'}]){
  const f=accepted();assert.equal(applyAction(f.s,'verifyBoxPartnerInvitation',{...scope,...extra,invitationId:f.id,code:f.code}).ok,false);
 }
 for(const extra of [{accountabilityPartner:{...partner,phone:'0201112222'}},{accountabilityPartner:{...partner,name:'Adwoa'}},{name:'Another goal'},{partnerSetupId:'another-draft'}]){const f=verified();assert.equal(create(f,extra).ok,false);}
});
test('changed details require a new role acceptance, even if the old number was verified',()=>{
 const f=verified(),changed={...scope,partner:{name:'Adwoa',phone:'0201112222'}},r=run(f.s,'sendBoxPartnerInvitation',changed);
 assert.equal(r.view.status,'awaiting-partner');assert.equal(getBoxPartnerInvitationPreview(f.s,r.invitationId).code,undefined);assert.equal(f.s.boxPartnerInvitations[0].status,'superseded');assert.equal(create(f).ok,false);
});
test('declining or revoking acceptance before creation blocks the protected box',()=>{
 for(const status of ['accepted','verified']){const f=status==='verified'?verified():accepted();run(f.s,'respondBoxPartnerInitialInvitation',{invitationId:f.id,decision:'declined'});assert.equal(create(f).ok,false);assert.equal(getBoxPartnerInvitationPreview(f.s,f.id).code,undefined);}
});
test('verified proof survives a JSON refresh but expires after 30 minutes',t=>{
 const advance=clock(t),f=verified();f.s=migrateState(JSON.parse(JSON.stringify(f.s)));assert.equal(validStoredState(f.s),true);assert.equal(getBoxPartnerInvitation(f.s,{...scope,invitationId:f.id}).status,'verified');
 advance(PARTNER_PROOF_LIFETIME+1);assert.equal(create(f).ok,false);assert.equal(f.s.boxPartnerInvitations[0].status,'verified','read-only expiry checks do not rewrite history');
});
test('initial code never authorises withdrawal; the first release requires a different fresh code and owner PIN',()=>{
 const f=verified(),made=create(f);assert.equal(made.ok,true);const b=made.box;run(f.s,'contributeBox',{boxId:b.id,amount:2000});
 assert.equal(applyAction(f.s,'withdrawBox',{boxId:b.id,amount:1000,pin:'1234',code:f.code,partnerInvitationId:f.id}).ok,false);
 const request=run(f.s,'requestBoxRelease',{boxId:b.id,kind:'withdrawal',amount:1000});const release=run(f.s,'issueBoxPartnerCode',{boxId:b.id,requestId:request.requestId});assert.notEqual(release.code,f.code);
 const stale=run(f.s,'verifyBoxPartnerCode',{boxId:b.id,requestId:request.requestId,code:f.code});assert.equal(stale.authorized,false);assert.equal(applyAction(f.s,'withdrawBox',{boxId:b.id,amount:1000,pin:'1234',requestId:request.requestId}).ok,false);
});
test('invalid partner and own number cannot receive setup codes, and optional boxes still create normally',()=>{
 const s=createDemoState(),n=s.boxPartnerInvitations.length;
 for(const p of [{name:'Me',phone:s.profile.phone},{name:'Esi',phone:'123'},{name:'',phone:'0241234567'}])assert.equal(applyAction(s,'sendBoxPartnerInvitation',{...scope,partner:p}).ok,false);
 assert.equal(s.boxPartnerInvitations.length,n);assert.equal(run(s,'createBox',{name:'Just saving',target:0}).box.protection,undefined);
});
