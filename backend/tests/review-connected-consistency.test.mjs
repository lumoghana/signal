import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmptyState,applyAction} from '../supabase/functions/lumo-approved/domain/model.js';
import {collectionReturnReview} from '../supabase/functions/lumo-approved/domain/group-policy.js';
import {prepareMutation,publicState,envelope,mapIdentity,clone,buildState} from '../supabase/functions/lumo-approved/engine.mjs';
const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002';
const SHOP='30000000-0000-4000-8000-000000000001';
const now=()=>new Date().toISOString();
function group(id='synthetic-group'){
 const state=createEmptyState({name:'Synthetic owner'});
 const made=applyAction(state,'createGroup',{name:'Synthetic collection',target:10000,members:[{id:'me',name:'Synthetic owner',role:'approver'},{id:B,name:'Synthetic member',role:'contributor'}],mandate:{approvers:['me'],threshold:1}});assert.equal(made.ok,true);
 const g=made.group;g.id=id;g.balance=5000;g.chat={version:1,messages:[{id:'group-message:shared-client-id',clientId:'shared-client-id',senderId:B,senderName:'Synthetic member',text:'A shared message',at:now(),status:'sent'}],readBy:{},preferences:{},reports:[]};
 const member=g.members.find(m=>m.id===B);member.status='active';member.historyConsentAt=now();member.joinedAt=now();
 return mapIdentity(g,'me',A);
}
function snapshot(actor=A,groups=[group()]){
 return {account:{id:'20000000-0000-4000-8000-'+actor.slice(-12),userId:actor,displayName:actor===A?'Synthetic owner':'Synthetic member',balance:0},phone:actor===A?'0241000001':'0241000002',revision:1,state:null,groups:groups.map(g=>({id:g.id,revision:1,state:clone(g),balance:g.balance})),boxes:[],requests:[],partners:[],receipts:[]};
}
const repo={resolve:async()=>({ok:false,code:'RECIPIENT_NOT_FOUND'}),quote:async()=>({ok:true,shop:{id:SHOP,name:'Synthetic shop'},merchant:{name:'Synthetic merchant'},merchantAccessApproved:true})};
const prepare=(snap,type,payload,attempt='synthetic-review-attempt')=>prepareMutation(snap,type,payload,attempt,repo);

for(const actor of [A,B])test(`publicState strips report contents from accepted member ${actor===A?'creator':'reported person'}`,()=>{
 const snap=snapshot(actor),g=snap.groups[0].state;g.chat.reports=[{id:'private-report',messageId:g.chat.messages[0].id,reporterId:A,reason:'Synthetic private reason',at:now()}];
 const response=envelope(snap);assert.equal(response.state.groups[0].chat.reports.length,0);assert.doesNotMatch(JSON.stringify(response),/Synthetic private reason|private-report/);assert.equal(snap.groups[0].state.chat.reports.length,1,'projection never erases the stored record');assert.equal(response.state.groups[0].balance,5000);
});

test('prepareMutation moves a new report into a private commit field and returns only acknowledgement',async()=>{
 const snap=snapshot(),before=clone(snap),prepared=await prepare(snap,'reportGroupMessage',{groupId:'synthetic-group',messageId:'group-message:shared-client-id',reason:'A synthetic private complaint'});
 assert.equal(prepared.ok,true);assert.equal(prepared.privateReports.length,1);assert.equal(prepared.privateReports[0].reporterId,A);assert.equal(prepared.privateReports[0].groupId,'synthetic-group');assert.equal(prepared.privateReports[0].reason,'A synthetic private complaint');assert.equal(prepared.intents.length,0,'reporting cannot move money');
 assert.deepEqual(Object.keys(prepared.result.report).sort(),['id','messageId','status']);assert.doesNotMatch(JSON.stringify(prepared.result),/complaint|reporterId/);assert.doesNotMatch(JSON.stringify(prepared.groups),/complaint|reporterId/);assert.equal(prepared.state.groups[0].chat.reports.length,0);assert.deepEqual(snap,before);
});

test('a member cannot report their own message or report before invitation acceptance',async()=>{
 const own=snapshot(B),self=await prepare(own,'reportGroupMessage',{groupId:'synthetic-group',messageId:'group-message:shared-client-id',reason:'Synthetic reason'});assert.equal(self.ok,false);assert.match(self.result.message,/another member/);
 const invited=snapshot(A);invited.groups[0].state.members.find(m=>m.id===A).status='invited';const blocked=await prepare(invited,'reportGroupMessage',{groupId:'synthetic-group',messageId:'group-message:shared-client-id',reason:'Synthetic reason'});assert.equal(blocked.ok,false);assert.equal(blocked.privateReports,undefined);
});

test('private report identifiers are scoped to the group when client message IDs repeat',async()=>{
 const first=await prepare(snapshot(A,[group('group-one')]),'reportGroupMessage',{groupId:'group-one',messageId:'group-message:shared-client-id',reason:'Synthetic reason'},'synthetic-report-first');
 const second=await prepare(snapshot(A,[group('group-two')]),'reportGroupMessage',{groupId:'group-two',messageId:'group-message:shared-client-id',reason:'Synthetic reason'},'synthetic-report-second');
 assert.equal(first.ok,true);assert.equal(second.ok,true);assert.notEqual(first.privateReports[0].id,second.privateReports[0].id,'private storage has a global primary key');
});

async function merchantProposal(){
 let snap=snapshot();const requested=await prepare(snap,'requestPayout',{groupId:'synthetic-group',amount:1000,rail:'lumo',recipient:'Untrusted typed name',destination:'LUM100001',note:'Synthetic supplies'},'synthetic-payout-request');assert.equal(requested.ok,true);
 snap={...snap,revision:2,state:requested.durableState,groups:requested.groups.map(row=>({...row,balance:5000,revision:2}))};
 const payoutId=requested.result.payout.id;
 for(const [type,attempt]of[['reviewPayout','synthetic-payout-review'],['approvePayout','synthetic-payout-approve']]){const p=await prepare(snap,type,{groupId:'synthetic-group',payoutId},attempt);assert.equal(p.ok,true,p.result?.message);snap={...snap,revision:snap.revision+1,state:p.durableState,groups:p.groups.map(row=>({...row,balance:5000,revision:row.expectedRevision+1}))};}
 return {snap,payoutId,requested};
}

test('group merchant payout binds the verified shop and preserves personal funds',async()=>{
 const {snap,payoutId,requested}=await merchantProposal();assert.equal(requested.result.payout.destination,'merchant:'+SHOP);assert.equal(requested.result.payout.recipient,'Synthetic merchant · Synthetic shop');
 const p=await prepare(snap,'executePayout',{groupId:'synthetic-group',payoutId},'synthetic-payout-execute');assert.equal(p.ok,true,p.result?.message);assert.equal(p.state.wallet,0);assert.equal(p.state.groups[0].balance,4000);assert.equal(p.intents.length,1);assert.equal(p.intents[0].kind,'merchant_payment');assert.deepEqual(p.intents[0].source,{kind:'group',id:'synthetic-group'});assert.deepEqual(p.intents[0].destination,{kind:'merchant',id:SHOP});assert.equal(p.intents[0].metadata.merchantAccessApproved,true);assert.equal(p.requiresAuth,true);
});

test('changing an approved shop identity requires fresh review rather than redirecting the payout',async()=>{
 const {snap,payoutId}=await merchantProposal(),before=clone(snap);
 await assert.rejects(prepareMutation(snap,'executePayout',{groupId:'synthetic-group',payoutId},'synthetic-payout-changed',{...repo,quote:async()=>({ok:true,shop:{id:SHOP,name:'Changed shop'},merchant:{name:'Synthetic merchant'}})}),e=>e.code==='PAYOUT_CHANGED');assert.deepEqual(snap,before);
});

test('an execution quote cannot replace the approved canonical shop UUID',async()=>{
 const {snap,payoutId}=await merchantProposal();
 await assert.rejects(prepareMutation(snap,'executePayout',{groupId:'synthetic-group',payoutId},'synthetic-payout-wrong-shop',{...repo,quote:async()=>({ok:true,shop:{id:'30000000-0000-4000-8000-000000000002',name:'Synthetic shop'},merchant:{name:'Synthetic merchant'}})}),e=>['PAYOUT_CHANGED','REQUEST_UNAVAILABLE'].includes(e.code));
});

test('an empty active group membership blocks closure until the collection is resolved',async()=>{
 const g=group();g.balance=0;g.contributions=[];const p=await prepare(snapshot(A,[g]),'accountClose',{confirm:'CLOSE'},'synthetic-close-open-group');assert.equal(p.ok,false);assert.match(p.result.message,/checklist|Resolve/i);assert.equal(p.closeAccount,undefined);
});

test('a closed empty collection permits PIN-authorised account closure and read-only history',async()=>{
 const g=group();g.balance=0;g.status='closed';g.contributions=[];const snap=snapshot(A,[g]);const p=await prepare(snap,'accountClose',{confirm:'CLOSE'},'synthetic-close-closed-group');assert.equal(p.ok,true,p.result?.message);assert.equal(p.closeAccount,true);assert.equal(p.requiresAuth,true);assert.equal(p.state.account.status,'closed');assert.deepEqual(p.intents,[]);
 const closed={...snap,state:p.durableState};const view=envelope(closed);assert.equal(view.state.account.status,'closed');assert.equal(view.state.groups[0].status,'closed');const fund=await prepare(closed,'fund',{amount:100},'synthetic-fund-closed');assert.equal(fund.ok,false);assert.match(fund.result.message,/closed|read-only/);
});

test('an invitation alone does not create an active group closure responsibility',async()=>{
 const g=group();g.creatorId=B;g.balance=0;g.mandate.approvers=[B];g.members.find(m=>m.id===A).status='invited';g.members.find(m=>m.id===A).role='contributor';g.members.find(m=>m.id===B).role='approver';g.contributions=[];
 const p=await prepare(snapshot(A,[g]),'accountClose',{confirm:'CLOSE'},'synthetic-close-invited');assert.equal(p.ok,true,p.result?.message);assert.equal(p.closeAccount,true);
});

test('merchant refunds are projected from group ledger facts once without crediting personal money',async()=>{
 const {groupMoneyEvents}=await import('../supabase/functions/lumo-approved/domain/group-ledger.js');const snap=snapshot();const row=snap.groups[0];row.balance=7000;row.state.merchantRefunds=[{id:'stale-local-refund',amount:999999}];row.merchantRefunds=[{id:'canonical-refund',amount:2000,reference:'LM-SYNTHETIC-REFUND',originalPaymentId:'original-payout',createdAt:now(),merchantName:'Synthetic merchant',shopName:'Synthetic shop'}];
 const before=clone(snap),state=buildState(snap);assert.equal(state.wallet,0);assert.equal(state.groups[0].balance,7000);assert.deepEqual(state.groups[0].merchantRefunds,row.merchantRefunds);assert.equal(state.transactions.filter(t=>t.type==='income'||t.type==='refund').length,0,'group money is never projected as a personal receipt');
 const events=groupMoneyEvents(state.groups[0],state).filter(x=>x.type==='merchant-refund');assert.equal(events.length,1);assert.equal(events[0].amount,2000);assert.equal(events[0].reference,'LM-SYNTHETIC-REFUND');assert.match(events[0].body,/returned to the group/);assert.deepEqual(groupMoneyEvents(buildState(snap).groups[0],state).filter(x=>x.type==='merchant-refund'),events);assert.deepEqual(snap,before);
});

test('group merchant refund history follows invitation and earlier-history access boundaries',()=>{
 const g=group(),joined='2026-11-13T00:00:00Z';g.members.find(m=>m.id===B).joinedAt=joined;delete g.members.find(m=>m.id===B).historyConsentAt;
 const snap=snapshot(B,[g]);snap.groups[0].merchantRefunds=[{id:'before-join',amount:1000,createdAt:'2026-01-01T00:00:00Z'},{id:'after-join',amount:500,createdAt:'2026-11-13T01:00:00Z'}];let projected=envelope(snap).state.groups[0];assert.deepEqual(projected.merchantRefunds.map(x=>x.id),['after-join']);
 snap.groups[0].state.members.find(m=>m.id===B).status='invited';projected=envelope(snap).state.groups[0];assert.deepEqual(projected.merchantRefunds,[]);assert.equal(projected.balance,0);
});

test('closed group late refunds prepare only PIN-authorised original-source ledger returns across batches',async()=>{
 const g=group();g.status='closed';g.balance=0;g.closedAt='2026-11-01T12:00:00Z';g.closedBy=A;g.contributions=[{id:'source-a',memberId:A,memberName:'Synthetic owner',amount:1000,refundedAmount:200,status:'success',walletDebited:true,transactionId:'source-tx-a',at:now()},{id:'source-b',memberId:B,memberName:'Synthetic member',amount:3000,refundedAmount:600,status:'success',walletDebited:true,transactionId:'source-tx-b',at:now()}];
 let snap=snapshot(A,[g]);snap.groups[0].balance=800;
 const first=await prepare(snap,'closeGroup',{groupId:g.id,...collectionReturnReview(buildState(snap).groups[0])},'synthetic-late-return-one');assert.equal(first.ok,true,first.result?.message);assert.equal(first.requiresAuth,true);assert.equal(first.state.wallet,200);assert.equal(first.state.groups[0].status,'closed');assert.equal(first.state.groups[0].closedAt,g.closedAt);assert.equal(first.intents.reduce((n,i)=>n+i.amount,0),800);assert.deepEqual(first.intents.map(i=>[i.kind,i.amount,i.destination]),[['group_refund',200,{kind:'wallet'}],['group_refund',600,{kind:'user',id:B}]]);
 snap={...snap,account:{...snap.account,balance:200},revision:2,state:first.durableState,groups:first.groups.map(row=>({...row,revision:2,balance:400}))};
 const second=await prepare(snap,'closeGroup',{groupId:g.id,...collectionReturnReview(buildState(snap).groups[0])},'synthetic-late-return-two');assert.equal(second.ok,true,second.result?.message);assert.equal(second.requiresAuth,true);assert.equal(second.state.wallet,300);assert.equal(second.intents.reduce((n,i)=>n+i.amount,0),400);assert.equal(second.state.groups[0].balance,0);assert.equal(second.state.groups[0].closedAt,g.closedAt);assert.equal(second.state.groups[0].refunds.reduce((n,r)=>n+r.amount,0),1200);
 const other={...snapshot(B,[g]),groups:[{...snapshot(B,[g]).groups[0],balance:800}]};const rejected=await prepare(other,'closeGroup',{groupId:g.id,...collectionReturnReview(buildState(other).groups[0])},'synthetic-late-return-other');assert.equal(rejected.ok,false);assert.match(rejected.result.message,/Only the creator/);
});

test('shared group returns require the exact reviewed balance and original-source fingerprint',async()=>{
 const g=group();g.status='closed';g.balance=0;g.closedAt='2026-11-01T12:00:00Z';g.closedBy=A;g.contributions=[{id:'source-a',memberId:A,memberName:'Synthetic owner',amount:1000,refundedAmount:200,status:'success',walletDebited:true,transactionId:'source-tx-a',at:now()},{id:'source-b',memberId:B,memberName:'Synthetic member',amount:3000,refundedAmount:600,status:'success',walletDebited:true,transactionId:'source-tx-b',at:now()}];
 const snap=snapshot(A,[g]);snap.groups[0].balance=800;const review=collectionReturnReview(buildState(snap).groups[0]);
 await assert.rejects(prepare(snap,'closeGroup',{groupId:g.id},'synthetic-review-missing'),e=>e.code==='CLOSURE_REVIEW_CHANGED');
 const increased=clone(snap);increased.groups[0].balance=1200;await assert.rejects(prepare(increased,'closeGroup',{groupId:g.id,...review},'synthetic-review-increased'),e=>e.code==='CLOSURE_REVIEW_CHANGED');
 const changed=clone(snap);changed.groups[0].state.contributions[0].refundedAmount+=100;await assert.rejects(prepare(changed,'closeGroup',{groupId:g.id,...review},'synthetic-review-new-shares'),e=>e.code==='CLOSURE_REVIEW_CHANGED');
 const good=await prepare(snap,'closeGroup',{groupId:g.id,...review},'synthetic-review-current');assert.equal(good.ok,true);assert.equal(good.requiresAuth,true);assert.equal(good.intents.reduce((n,i)=>n+i.amount,0),800);
});
