import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState,applyAction} from '../dist/js/model.js';
import {groupSummary,groupMoneyEvents,collectionRefundPreview,groupPayoutStatus} from '../dist/js/group-ledger.js';
import {GROUP_PROPOSAL_MS,GROUP_REVIEW_MS,validateGroupEvidence} from '../dist/js/group-policy.js';
import {getGroupAssistantAnswer} from '../dist/js/group-chat-model.js';
const action=(s,type,p={})=>{const r=applyAction(s,type,p);assert.equal(r.ok,true,`${type}: ${r.message}`);return r;};
function sample(){const s=createDemoState(),{group:g}=action(s,'ensureProjectPrintingDemo');return{s,g,act:(type,p={})=>action(s,type,{groupId:g.id,...p}),attempt:(type,p={})=>applyAction(s,type,{groupId:g.id,...p})};}
const recipient={recipient:'Balme Library prints',destination:'@balmeprints',rail:'lumo',note:'Six project reports'};
function request(h,p={}){return h.act('requestPayout',{amount:3000,...recipient,...p}).payout;}
function approve(h,p){h.act('reviewPayout',{payoutId:p.id,revision:p.revision});return h.act('approvePayout',{payoutId:p.id,revision:p.revision});}
function approved(h,p){approve(h,p);h.act('setGroupParticipant',{memberId:'esi'});approve(h,p);}
function fakeClock(t){const original=Date.now;let ms=original();t.mock.method(Date,'now',()=>ms);return n=>{ms+=n;};}

test('collection target caps reserve pending contributions and confirmed updates remain once-only',()=>{
 const h=sample(),wallet=h.s.wallet;
 assert.equal(h.attempt('contributeGroup',{amount:3001}).ok,false,'pending GH30 leaves only GH30 uncommitted');
 const {contribution:c}=h.act('contributeGroup',{amount:3000,status:'pending'});
 assert.equal(h.s.wallet,wallet-3000);assert.equal(h.attempt('contributeGroup',{amount:1}).ok,false);
 h.act('settleGroupContribution',{contributionId:'printing-senam',outcome:'success'});h.act('settleGroupContribution',{contributionId:c.id,outcome:'success'});
 assert.equal(groupSummary(h.g).collected,18000);h.act('settleGroupContribution',{contributionId:c.id,outcome:'success'});assert.equal(h.g.balance,18000);
});

test('new past or invalid calendar deadlines are rejected; old expired groups remain readable',()=>{
 const h=sample();for(const deadline of ['2020-01-01','2099-02-31'])assert.equal(applyAction(h.s,'createGroup',{name:'Too late',target:3000,deadline}).ok,false);
 h.g.deadline='2020-01-01';assert.equal(h.attempt('contributeGroup',{amount:3000}).ok,false);
 assert.ok(groupMoneyEvents(h.g,h.s).length);assert.equal(getGroupAssistantAnswer(h.s,h.g.id,'How much is needed?').ok,true);
 h.act('settleGroupContribution',{contributionId:'printing-senam',outcome:'success'});assert.equal(h.g.balance,15000,'an already processing contribution can settle after the deadline');
});

test('contributor invitations never hold up accepted members and invitees still have no access',()=>{
 const h=sample(),{member}=h.act('inviteGroupMember',{name:'Abena',role:'contributor'});
 assert.equal(h.attempt('contributeGroup',{amount:3000}).ok,true);assert.equal(h.attempt('requestPayout',{amount:1000,...recipient}).ok,true);
 h.act('sendGroupMessage',{clientId:'waiting-discussion',text:'We can carry on while Abena decides whether to join.'});
 h.act('setGroupParticipant',{memberId:member.id});assert.equal(h.attempt('contributeGroup',{amount:1}).ok,false);assert.equal(h.attempt('acceptGroupInvite',{}).ok,false);
 h.act('acceptGroupInvite',{acceptHistory:true});assert.equal(member.status,'active');
});

test('group bank payouts use registered recipient, chosen bank and the shared fee',()=>{
 const h=sample(),bad={rail:'bank',recipient:'Someone else',destination:'1234567890123',bank:'GCB Bank'};
 assert.equal(h.attempt('requestPayout',{amount:3000,...bad}).ok,false);
 assert.equal(h.attempt('requestPayout',{amount:3000,rail:'bank',recipient:'Ama Mensah',destination:'1234567890123'}).ok,false);
 const p=request(h,{amount:3000,rail:'bank',recipient:'Ama Mensah',destination:'1234567890123',bank:'GCB Bank'});
 assert.equal(p.bank,'GCB Bank');assert.equal(p.fee,100);assert.equal(groupSummary(h.g).reserved,3100);
 approved(h,p);h.act('executePayout',{payoutId:p.id});const wallet=h.s.wallet;
 h.act('settleGroupPayout',{payoutId:p.id,outcome:'success'});assert.equal(h.g.balance,8900);assert.equal(h.s.wallet,wallet);
 h.act('settleGroupPayout',{payoutId:p.id,outcome:'success'});assert.equal(h.g.balance,8900);
});

test('MoMo registered name and network come from lookup, including a ported number',()=>{
 const h=sample();assert.equal(h.attempt('requestPayout',{amount:3000,rail:'momo',recipient:'Akosua Owusu',destination:'bad'}).ok,false);
 const p=request(h,{rail:'momo',recipient:'Akosua Owusu',destination:'0555550124'});assert.equal(p.network,'Telecel Cash');assert.equal(p.fee,50);
 assert.equal(h.attempt('requestPayout',{amount:9000,rail:'bank',recipient:'Ama Mensah',bank:'GCB Bank',destination:'1234567890123'}).ok,false,'amount plus fee and prior reservation are checked');
});

test('a review records no approval and expires after five minutes',t=>{
 const advance=fakeClock(t),h=sample(),p=request(h);
 assert.equal(h.attempt('approvePayout',{payoutId:p.id}).ok,false);const review=h.act('reviewPayout',{payoutId:p.id}).review;
 assert.equal(p.approvals.length,0);assert.equal(p.status,'pending');advance(GROUP_REVIEW_MS+1);
 assert.equal(h.attempt('approvePayout',{payoutId:p.id,reviewId:review.id}).ok,false);assert.equal(p.approvals.length,0);
 const fresh=h.act('reviewPayout',{payoutId:p.id}).review;assert.equal(h.attempt('approvePayout',{payoutId:p.id,reviewId:review.id}).ok,false);
 h.act('approvePayout',{payoutId:p.id,reviewId:fresh.id});assert.equal(p.approvals.length,1);
});

test('48-hour proposal expiry releases reservations and cannot use earlier approvals',t=>{
 const advance=fakeClock(t),h=sample(),p=request(h);approved(h,p);advance(GROUP_PROPOSAL_MS+1);
 assert.equal(groupPayoutStatus(p),'expired');assert.equal(groupSummary(h.g).reserved,0);assert.equal(h.attempt('executePayout',{payoutId:p.id}).ok,false);
 const before=h.g.balance;h.act('expireGroupPayouts');h.act('expireGroupPayouts');assert.equal(p.status,'expired');assert.equal(h.g.balance,before);
 assert.equal(groupMoneyEvents(h.g,h.s).filter(e=>e.type==='payout-expired').length,1);
 assert.equal(getGroupAssistantAnswer(h.s,h.g.id,'What is awaiting approval?').title,'Nothing awaiting payout.');
});

test('a processing payout may receive confirmation after its proposal window without another debit',t=>{
 const advance=fakeClock(t),h=sample(),p=request(h);approved(h,p);h.act('executePayout',{payoutId:p.id});advance(GROUP_PROPOSAL_MS+1);
 h.act('settleGroupPayout',{payoutId:p.id,outcome:'success'});assert.equal(h.g.balance,9000);h.act('settleGroupPayout',{payoutId:p.id,outcome:'success'});assert.equal(h.g.balance,9000);
});

test('declines are explicit designated votes and revised requests invalidate all authority',()=>{
 const h=sample(),p=request(h);h.act('reviewPayout',{payoutId:p.id});h.act('setGroupParticipant',{memberId:'kwame'});
 assert.equal(h.attempt('declinePayout',{payoutId:p.id,reason:'No quote'}).ok,false);h.act('setGroupParticipant',{memberId:'esi'});h.act('reviewPayout',{payoutId:p.id});
 h.act('declinePayout',{payoutId:p.id,reason:'Please attach the quote.'});assert.equal(p.status,'declined');assert.equal(groupSummary(h.g).reserved,0);assert.equal(p.declines[0].memberId,'esi');
 h.act('editPayout',{payoutId:p.id,note:'Updated printing quote',evidenceReference:'PRINT-006'});assert.equal(p.status,'pending');assert.equal(p.approvals.length,0);assert.equal(Object.keys(p.reviews).length,0);assert.equal(p.history.filter(e=>e.type==='declined').length,1);
});

test('evidence is capped and validated and changing it clears existing approvals',()=>{
 const h=sample(),pdf=btoa('%PDF-1.4\nSample quote'),file={name:'quote.pdf',type:'application/pdf',size:21,dataUrl:`data:application/pdf;base64,${pdf}`};file.size=atob(pdf).length;
 assert.equal(validateGroupEvidence([file]).ok,true);assert.equal(validateGroupEvidence([{...file,dataUrl:'data:text/html;base64,PHNjcmlwdD4='}]).ok,false);
 assert.equal(validateGroupEvidence([{...file,size:500001}]).ok,false);assert.equal(validateGroupEvidence([file,file,file]).ok,false);
 const p=request(h,{evidence:[file],evidenceReference:'QUOTE-1'});approve(h,p);assert.equal(p.approvals.length,1);
 h.act('editPayout',{payoutId:p.id,evidence:[{...file,name:'updated-quote.pdf'}]});assert.deepEqual(p.approvals,[]);assert.equal(Object.keys(p.reviews).length,0);
 assert.doesNotMatch(JSON.stringify(groupMoneyEvents(h.g,h.s)),/JVBER|data:application|quote.pdf/,'system announcements never broadcast attachment contents');
});

test('closure returns every remaining pesewa proportionally to its actual original source once',()=>{
 const h=sample(),wallet=h.s.wallet;h.act('settleGroupContribution',{contributionId:'printing-senam',outcome:'failed'});h.act('contributeGroup',{amount:3000});
 const p=request(h,{amount:10001});approved(h,p);h.act('executePayout',{payoutId:p.id});h.act('settleGroupPayout',{payoutId:p.id,outcome:'success'});
 h.act('setGroupParticipant',{memberId:'me'});assert.equal(h.g.balance,4999);const preview=collectionRefundPreview(h.g),mine=preview.find(r=>r.memberId==='me');
 assert.equal(preview.reduce((n,r)=>n+r.amount,0),4999);assert.ok(mine.amount===999||mine.amount===1000);
 h.act('closeGroup');assert.equal(h.g.balance,0);assert.equal(h.g.status,'closed');assert.equal(h.s.wallet,wallet-3000+mine.amount);
 const after=h.s.wallet,events=groupMoneyEvents(h.g,h.s);h.act('closeGroup');assert.equal(h.s.wallet,after);assert.deepEqual(groupMoneyEvents(h.g,h.s),events);assert.equal(h.g.refunds.length,5);
 assert.equal(h.attempt('contributeGroup',{amount:1}).ok,false);assert.equal(h.attempt('requestPayout',{amount:1,...recipient}).ok,false);assert.ok(h.g.contributions.length,'historical contributions retained');
 h.act('sendGroupMessage',{clientId:'closed-history-message',text:'Printing sorted, thank you everyone.'});
});

test('pending contributions or processing payouts prevent collection closure',()=>{
 const h=sample();assert.equal(h.attempt('closeGroup').ok,false);h.act('settleGroupContribution',{contributionId:'printing-senam',outcome:'failed'});
 const p=request(h);approved(h,p);h.act('executePayout',{payoutId:p.id});h.act('setGroupParticipant',{memberId:'me'});assert.equal(h.attempt('closeGroup').ok,false);
 h.act('settleGroupPayout',{payoutId:p.id,outcome:'failed'});h.act('closeGroup');assert.equal(h.g.status,'closed');assert.equal(p.status,'cancelled');
});

test('only the creator can close and a closed collection cannot grant a waiting invitation access',()=>{
 const h=sample();h.act('settleGroupContribution',{contributionId:'printing-senam',outcome:'failed'});h.act('setGroupParticipant',{memberId:'esi'});assert.equal(h.attempt('closeGroup').ok,false);
 h.act('setGroupParticipant',{memberId:'me'});const {member}=h.act('inviteGroupMember',{name:'Abena'});h.act('closeGroup');h.act('setGroupParticipant',{memberId:member.id});assert.equal(h.attempt('acceptGroupInvite',{acceptHistory:true}).ok,false);
});
