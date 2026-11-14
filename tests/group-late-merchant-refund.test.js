import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmptyState,applyAction} from '../dist/js/model.js';
import {collectionRefundPreview,groupMoneyEvents} from '../dist/js/group-ledger.js';
import {collectionReturnReview} from '../dist/js/group-policy.js';
import {renderGroupOverview} from '../dist/js/group-overview.js';
import {getGroupAssistantAnswer} from '../dist/js/group-chat-model.js';
const act=(s,type,p={})=>{const r=applyAction(s,type,p);assert.equal(r.ok,true,`${type}: ${r.message}`);return r;};
function closedGroup(){
 const s=createEmptyState({name:'Synthetic creator'});s.wallet=10000;s.buffer=0;
 const g=act(s,'createGroup',{name:'Synthetic printing',target:4000,members:[{id:'me',name:'Synthetic creator',role:'approver'},{id:'other',name:'Synthetic contributor',role:'contributor'}],mandate:{approvers:['me'],threshold:1}}).group;
 const run=(type,p={})=>act(s,type,{groupId:g.id,...p});run('contributeGroup',{amount:1000});run('setGroupParticipant',{memberId:'other'});run('acceptGroupInvite',{acceptHistory:true,mandateRevision:1,invitationVersion:1});run('contributeGroup',{amount:3000});run('setGroupParticipant',{memberId:'me'});
 const p=run('requestPayout',{amount:3200,recipient:'Synthetic printer',destination:'@syntheticprinter',rail:'lumo',note:'Synthetic printing'}).payout;run('reviewPayout',{payoutId:p.id});run('approvePayout',{payoutId:p.id});run('executePayout',{payoutId:p.id});run('settleGroupPayout',{payoutId:p.id,outcome:'success'});run('closeGroup',{idempotencyKey:'synthetic-initial-close'});assert.equal(g.balance,0);assert.equal(s.wallet,9200);
 return {s,g,run};
}
function receive(g,amount,id){g.balance+=amount;(g.merchantRefunds||=[]).push({id,amount,reference:'LM-'+id,createdAt:new Date().toISOString(),shopName:'Synthetic printer'});}

test('multiple partial late refunds return every pesewa to remaining original claims without reopening',()=>{
 const {s,g,run}=closedGroup(),closedAt=g.closedAt,closedBy=g.closedBy;let returned=0,myReturns=0;
 for(const [index,amount]of [803,401,1996].entries()){
  receive(g,amount,'synthetic-late-'+index);const preview=collectionRefundPreview(g),mine=preview.find(r=>r.memberId==='me').amount,before=s.wallet;
  const r=run('closeGroup',{idempotencyKey:'synthetic-return-'+index});assert.equal(g.balance,0);assert.equal(g.status,'closed');assert.equal(g.closedAt,closedAt);assert.equal(g.closedBy,closedBy);assert.equal(s.wallet,before+mine);assert.match(r.message,/stays closed/);returned+=amount;myReturns+=mine;
  const after=s.wallet,records=g.refunds.length;run('closeGroup',{idempotencyKey:'synthetic-return-'+index});assert.equal(s.wallet,after);assert.equal(g.refunds.length,records);
 }
 assert.equal(returned,3200);assert.equal(myReturns,800);assert.equal(s.wallet,10000,'the creator receives exactly their original1000 contribution back overall');assert.ok(g.contributions.every(c=>c.refundedAmount===c.amount));assert.equal(g.refunds.reduce((n,r)=>n+r.amount,0),4000);
 assert.equal(applyAction(s,'contributeGroup',{groupId:g.id,amount:1}).ok,false);assert.equal(applyAction(s,'requestPayout',{groupId:g.id,amount:1,recipient:'Synthetic printer',destination:'@syntheticprinter'}).ok,false);
 const events=groupMoneyEvents(g,s);assert.equal(events.filter(e=>e.type==='collection-closed').length,1);assert.equal(events.find(e=>e.type==='collection-closed').at,closedAt);assert.equal(events.filter(e=>e.title==='Merchant refund returned').reduce((n,e)=>n+e.amount,0),3200);
});

test('replaying an earlier return cannot consume a newer merchant refund',()=>{
 const {s,g,run}=closedGroup();receive(g,800,'first');run('closeGroup',{idempotencyKey:'same-return-reference'});receive(g,400,'second');const before=s.wallet,records=g.refunds.length;
 const old=run('closeGroup',{idempotencyKey:'same-return-reference'});assert.equal(old.duplicate,true);assert.equal(g.balance,400);assert.equal(s.wallet,before);assert.equal(g.refunds.length,records);
 run('closeGroup',{idempotencyKey:'fresh-return-reference'});assert.equal(g.balance,0);assert.equal(s.wallet,before+100);
});

test('late returns retain creator-only authority and UI exposes only the original-source return',()=>{
 const {s,g,run}=closedGroup();receive(g,800,'late');let html=renderGroupOverview({state:s,draft:{}},{section:'life',page:'group-detail',id:g.id});assert.match(html,/data-group-action="return-refund"/);assert.match(html,/Return merchant refund/);assert.doesNotMatch(html,/data-group-action="request"|data-group-action="contribute"/);
 assert.match(getGroupAssistantAnswer(s,g.id,'What do I do next?').paragraphs.join(' '),/review the original-source shares/);
 run('setGroupParticipant',{memberId:'other'});const before=structuredClone(s);const rejected=applyAction(s,'closeGroup',{groupId:g.id});assert.equal(rejected.ok,false);assert.deepEqual(s,before);html=renderGroupOverview({state:s,draft:{}},{section:'life',page:'group-detail',id:g.id});assert.doesNotMatch(html,/data-group-action="return-refund"/);assert.match(getGroupAssistantAnswer(s,g.id,'What do I do next?').paragraphs.join(' '),/Ask the group creator/);
});

test('a corrupt refund larger than all original remaining claims is rejected without credit',()=>{
 const {s,g}=closedGroup();receive(g,3201,'oversized');const wallet=s.wallet,records=g.refunds.length;const result=applyAction(s,'closeGroup',{groupId:g.id});assert.equal(result.ok,false);assert.match(result.message,/exceed.*original contribution/);assert.equal(s.wallet,wallet);assert.equal(g.balance,3201);assert.equal(g.refunds.length,records);
});

test('a reviewed return cannot consume a larger balance arriving during PIN entry',()=>{
 const {s,g}=closedGroup();receive(g,800,'reviewed-credit');const review=collectionReturnReview(g);receive(g,400,'arrived-during-pin');const before=structuredClone(s);
 const result=applyAction(s,'closeGroup',{groupId:g.id,...review,idempotencyKey:'stale-review-reference'});assert.equal(result.ok,false);assert.equal(result.code,'CLOSURE_REVIEW_CHANGED');assert.deepEqual(s,before);
 const fresh=applyAction(s,'closeGroup',{groupId:g.id,...collectionReturnReview(g),idempotencyKey:'fresh-review-reference'});assert.equal(fresh.ok,true);assert.equal(g.balance,0);
});

test('a same-balance return with changed original-source shares requires a fresh review',()=>{
 const {s,g}=closedGroup();receive(g,800,'reviewed-credit');const review=collectionReturnReview(g);g.contributions[0].refundedAmount+=100;const before=structuredClone(s);assert.notEqual(collectionReturnReview(g).reviewedReturnsFingerprint,review.reviewedReturnsFingerprint);
 const result=applyAction(s,'closeGroup',{groupId:g.id,...review});assert.equal(result.ok,false);assert.equal(result.code,'CLOSURE_REVIEW_CHANGED');assert.deepEqual(s,before);
});

test('idempotent replay uses its original reviewed payload and leaves later money for a new review',()=>{
 const {s,g}=closedGroup();receive(g,800,'first');const payload={groupId:g.id,...collectionReturnReview(g),idempotencyKey:'review-bound-reference'};assert.equal(applyAction(s,'closeGroup',payload).ok,true);receive(g,400,'second');const before=s.wallet;
 const replay=applyAction(s,'closeGroup',payload);assert.equal(replay.duplicate,true);assert.equal(g.balance,400);assert.equal(s.wallet,before);
});

test('return review fingerprint is deterministic across source order and uses exact integer shares',()=>{
 const g={balance:2,contributions:[{id:'c_z',memberId:'a',amount:1,status:'success'},{id:'c-a',memberId:'b',amount:1,status:'success'}]};const review=collectionReturnReview(g);assert.deepEqual(review,{reviewedBalance:2,reviewedReturnsFingerprint:'[["c-a",1],["c_z",1]]'});g.contributions.reverse();assert.deepEqual(collectionReturnReview(g),review);
});
