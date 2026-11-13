import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmptyState,applyAction} from '../dist/js/model.js';
import {getGroupAssistantAnswer} from '../dist/js/group-chat-model.js';
function fixture(withApprover=false){const s=createEmptyState({name:'Synthetic owner'});const r=applyAction(s,'createGroup',{name:'Synthetic group',target:10000,members:[{id:'me',name:'Synthetic owner',role:'approver'},{id:'member',name:'Synthetic member',role:withApprover?'approver':'contributor'}],mandate:{approvers:withApprover?['me','member']:['me'],threshold:withApprover?2:1}});assert.equal(r.ok,true);return {s,g:r.group};}
const prose=a=>[a.title,...a.paragraphs].join(' ');

test('group Lux identifies the exact missing agreement without treating chat as approval',()=>{
 const {s,g}=fixture(true),before=structuredClone(s);const answer=getGroupAssistantAnswer(s,g.id,'Why is this payment blocked?');assert.match(prose(answer),/Synthetic member still needs to accept/);assert.match(prose(answer),/Open Your people/);assert.match(prose(answer),/message or emoji does not/);assert.deepEqual(s,before);
});

test('a contributor gets the authorised next person rather than an unavailable payout instruction',()=>{
 const {s,g}=fixture();g.participantId='member';g.members[1].status='active';g.members[1].mandateAcceptedRevision=1;const a=getGroupAssistantAnswer(s,g.id,'What do I do next?');assert.match(prose(a),/Only designated|cannot approve|cannot authorise|chat reply cannot approve/);assert.match(prose(a),/Synthetic owner/);
});

test('an expired payout needs a fresh request while approved payouts retain final review and PIN',()=>{
 const {s,g}=fixture();g.payouts=[{id:'payout',amount:1000,fee:0,status:'approved',requiredApprovals:1,approvals:['me'],recipient:'Synthetic shop',expiresAt:new Date(Date.now()-1000).toISOString()}];let a=getGroupAssistantAnswer(s,g.id,'Why can’t we pay?');assert.match(prose(a),/fresh request/);assert.match(prose(a),/48-hour/);
 g.payouts[0].expiresAt=new Date(Date.now()+60000).toISOString();a=getGroupAssistantAnswer(s,g.id,'What do I do next?');assert.match(prose(a),/Reviews last five minutes/);assert.match(prose(a),/your PIN/);
});

test('unconfirmed contributions are not described as debts and pending receipts stay pending',()=>{
 const {s,g}=fixture();g.members[1].status='active';g.members[1].mandateAcceptedRevision=1;g.contributions.push({id:'pending',memberId:'member',amount:1000,status:'pending'});const a=getGroupAssistantAnswer(s,g.id,'Who still needs to pay?');assert.match(prose(a),/Synthetic member: no confirmed contribution recorded; a contribution is processing/);assert.match(prose(a),/not an IOU or a promise/);assert.doesNotMatch(prose(a),/owes|must pay GH/);
});
