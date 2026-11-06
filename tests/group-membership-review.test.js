import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState, applyAction, saveState, loadState } from '../dist/js/model.js';
import { groupApprovers, groupMandateReady, canReadGroup, groupSummary } from '../dist/js/group-ledger.js';
import { groupMandatePending } from '../dist/js/group-policy.js';
import { ensureGroupChat } from '../dist/js/group-chat-model.js';

function sample() {
  const state=createDemoState(), result=applyAction(state,'ensureProjectPrintingDemo');
  assert.equal(result.ok,true);const group=result.group;
  const act=(type,payload={})=>{const result=applyAction(state,type,{groupId:group.id,...payload});assert.equal(result.ok,true,`${type}: ${result.message}`);return result;};
  const attempt=(type,payload={})=>applyAction(state,type,{groupId:group.id,...payload});
  const participant=id=>act('setGroupParticipant',{memberId:id});
  const accept=()=>act('acceptGroupMandate',{acceptMandate:true,mandateRevision:group.mandateRevision});
  return {state,group,act,attempt,participant,accept};
}
const request=h=>h.act('requestPayout',{amount:3000,recipient:'Balme Library prints',destination:'@balmeprints',rail:'lumo',note:'Six reports'}).payout;
const approve=(h,p)=>{h.act('reviewPayout',{payoutId:p.id});h.act('approvePayout',{payoutId:p.id});};

test('inviting a designated approver invalidates open approvals and requires explicit acceptance of the new rule',()=>{
  const h=sample(),p=request(h);approve(h,p);const funds=JSON.stringify([h.state.wallet,h.group.balance,h.group.contributions]);
  const {member}=h.act('inviteGroupMember',{name:'Abena',phone:'0201112222',role:'approver'});
  assert.equal(h.group.mandateRevision,2);assert.equal(groupMandateReady(h.group),false);assert.deepEqual(p.approvals,[]);assert.deepEqual(p.reviews,{});assert.equal(p.status,'pending');assert.equal(p.revision,2);
  assert.equal(h.attempt('contributeGroup',{amount:3000}).ok,false);
  h.participant(member.id);assert.equal(canReadGroup(h.group),false);assert.equal(h.attempt('acceptGroupMandate',{acceptMandate:true,mandateRevision:2}).ok,false);
  h.act('acceptGroupInvite',{acceptHistory:true,mandateRevision:2,invitationVersion:1});assert.equal(canReadGroup(h.group),true);assert.equal(groupMandateReady(h.group),false);
  for(const id of ['esi','kofi']){h.participant(id);h.accept();}
  assert.equal(groupMandateReady(h.group),true);assert.equal(groupApprovers(h.group).length,4);assert.deepEqual(p.approvals,[],'agreement acceptance is never a payment approval');assert.equal(JSON.stringify([h.state.wallet,h.group.balance,h.group.contributions]),funds);
  h.participant('me');approve(h,p);h.participant('esi');approve(h,p);assert.equal(p.status,'approved');h.act('executePayout',{payoutId:p.id});assert.equal(p.status,'processing');h.act('settleGroupPayout',{payoutId:p.id,outcome:'success'});assert.equal(h.group.balance,9000);
});

test('promoting an active contributor keeps chat access but gives no payout authority before role acceptance',()=>{
  const h=sample();h.act('setGroupMemberRole',{memberId:'kwame',role:'approver'});h.participant('kwame');
  assert.equal(canReadGroup(h.group),true);assert.equal(groupApprovers(h.group).some(m=>m.id==='kwame'),false);h.act('sendGroupMessage',{clientId:'role-chat',text:'I’ll review the agreement first.'});
  assert.equal(h.attempt('acceptGroupMandate',{acceptMandate:true,mandateRevision:1}).ok,false);assert.equal(h.attempt('acceptGroupMandate',{acceptMandate:true,mandateRevision:2,memberId:'esi'}).ok,false);
  assert.equal(h.attempt('acceptGroupMandate',{mandateRevision:2}).ok,false);h.accept();assert.equal(groupApprovers(h.group).some(m=>m.id==='kwame'),true);
  for(const id of ['esi','kofi']){h.participant(id);h.accept();}assert.equal(groupMandateReady(h.group),true);
});

test('removing an ordinary contributor does not invalidate another member’s payment approval or freeze the group',()=>{
  const h=sample(),p=request(h);approve(h,p);const revision=p.revision;
  h.act('removeGroupMember',{memberId:'kwame'});assert.deepEqual(p.approvals,['me']);assert.equal(p.revision,revision);assert.equal(groupMandateReady(h.group),true);assert.equal(h.group.mandateRevision,1);
});

test('rejoining preserves stable identity and earlier contributions while demanding a fresh invitation acceptance',()=>{
  const h=sample(),beforeMembers=h.group.members.length,record=h.group.members.find(m=>m.id==='kwame'),history=JSON.stringify(h.group.contributions);
  h.act('removeGroupMember',{memberId:'kwame'});const {member}=h.act('inviteGroupMember',{memberId:'kwame',name:'Kwame',phone:'0241113333'});
  assert.equal(member,record);assert.equal(member.invitationVersion,2);assert.equal(member.amount,3000);assert.equal(h.group.members.length,beforeMembers);assert.equal(JSON.stringify(h.group.contributions),history);assert.equal(groupSummary(h.group).collected,12000);
  h.participant('kwame');assert.equal(canReadGroup(h.group),false);assert.equal(h.attempt('acceptGroupInvite',{acceptHistory:true,invitationVersion:1}).ok,false);
  h.act('acceptGroupInvite',{acceptHistory:true,invitationVersion:2,mandateRevision:1});assert.equal(canReadGroup(h.group),true);assert.equal(member.amount,3000);assert.equal(JSON.stringify(h.group.contributions),history);
});

test('normalized contact identifies a removed membership even with a changed display name',()=>{
  const h=sample(),{member}=h.act('inviteGroupMember',{name:'Esi',phone:'0241112222'});h.participant(member.id);h.act('acceptGroupInvite',{acceptHistory:true});h.participant('me');h.act('removeGroupMember',{memberId:member.id});
  const count=h.group.members.length,rejoin=h.act('inviteGroupMember',{name:'Esi A.',phone:'+233241112222'}).member;assert.equal(rejoin.id,member.id);assert.equal(h.group.members.length,count);assert.equal(rejoin.invitationVersion,2);
  assert.equal(h.attempt('inviteGroupMember',{name:'Someone else',phone:'0241112222'}).ok,false);
});

test('approver invitation cannot change an in-flight payout mandate; a contributor invitation can',()=>{
  const h=sample(),p=request(h);approve(h,p);h.participant('esi');approve(h,p);h.act('executePayout',{payoutId:p.id});h.participant('me');
  const before=JSON.stringify(h.group);assert.equal(h.attempt('inviteGroupMember',{name:'Adjoa',role:'approver'}).ok,false);assert.equal(JSON.stringify(h.group),before);
  h.act('inviteGroupMember',{name:'Adjoa',role:'contributor'});h.act('settleGroupPayout',{payoutId:p.id,outcome:'success'});assert.equal(h.group.balance,9000);
});

test('refresh retains the exact pending mandate acceptances and never grants unaccepted approver authority',()=>{
  const h=sample();h.act('setGroupMemberRole',{memberId:'kwame',role:'approver'});h.participant('esi');h.accept();
  const prior=globalThis.localStorage,store=new Map();globalThis.localStorage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)};
  try {saveState(h.state);const state=loadState(),group=state.groups.find(g=>g.id===h.group.id);assert.equal(group.mandateRevision,2);assert.deepEqual(groupMandatePending(group).map(m=>m.id),['kofi','kwame']);assert.deepEqual(groupApprovers(group).map(m=>m.id),['me','esi']);assert.equal(groupMandateReady(group),false);}finally{globalThis.localStorage=prior;}
});

test('the sample conversation makes no claim of unsupported file sharing and updates only untouched sample copy',()=>{
  const h=sample(),message=h.group.chat.messages.find(m=>m.id==='project-printing-message-3');assert.doesNotMatch(message.text,/PDF here/);
  message.text='Yes! Let’s check the final PDF here first, then review the payout together.';ensureGroupChat(h.group);assert.match(message.text,/agree the printing details/);
  const restored=h.group.chat.messages.find(m=>m.id==='project-printing-message-3');restored.text='My own edited sample message';restored.editedAt=new Date().toISOString();ensureGroupChat(h.group);assert.equal(h.group.chat.messages.find(m=>m.id===restored.id).text,'My own edited sample message');
});


test('repeated acceptance remains idempotent, while an old invitation reference cannot accept a rejoin',()=>{
  const h=sample(),{member}=h.act('inviteGroupMember',{name:'Adjoa',phone:'0241114444'});h.participant(member.id);
  const payload={acceptHistory:true,invitationVersion:1,mandateRevision:1,idempotencyKey:'adjoa-first-invitation'};
  h.act('acceptGroupInvite',payload);assert.equal(h.act('acceptGroupInvite',payload).duplicate,true);
  h.participant('me');h.act('removeGroupMember',{memberId:member.id});h.act('inviteGroupMember',{memberId:member.id,name:member.name,phone:member.phone});h.participant(member.id);
  assert.equal(h.attempt('acceptGroupInvite',payload).ok,false);assert.equal(member.status,'invited');
  h.act('acceptGroupInvite',{...payload,invitationVersion:2,idempotencyKey:'adjoa-rejoin-invitation'});assert.equal(member.status,'active');
  h.participant('me');h.act('setGroupMemberRole',{memberId:member.id,role:'approver'});h.participant(member.id);
  const mandate={acceptMandate:true,mandateRevision:h.group.mandateRevision,idempotencyKey:'adjoa-approver-role'};h.act('acceptGroupMandate',mandate);assert.equal(h.act('acceptGroupMandate',mandate).duplicate,true);
});
