/* Compatibility journeys for previously saved Request → Approve → Release drafts.
   External members, recipient settlement and balances remain sample records. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const view=h=>h.document.getElementById('view');
const settle=h=>{h.flushHistory();h.flush();};
const control=(h,label)=>view(h).querySelectorAll('button').find(b=>b.textContent.trim()===label);
const click=(h,label)=>{const b=control(h,label);assert(b,'Mounted '+label+' on '+h.L.route);b.click();settle(h);return b;};
const text=h=>view(h).textContent;
const personal=h=>JSON.stringify({balance:h.L.state.balance,accounts:h.L.state.accounts,txs:h.L.state.txs,goals:h.L.state.goals,essentials:h.L.state.essentials,requests:h.L.state.requests,paymentDraft:h.L.state.paymentDraft});
const clean=h=>assert.deepEqual(h.errors,[],'No rendering fallback or event errors');
function fixture({testing=false}={}){
 const h=createHarness({clock:true,deferHistory:true,testing}),L=h.L;L.explore();L.ensureAccounts?.();
 Object.assign(L.state,{balance:600,txs:[],goals:[],essentials:[],requests:[],paymentDraft:null,groupMoney:undefined});L.state.profile.pin='123456';L.route='home';L.params={};L.history=[];L.save();L.render();settle(h);return h;
}
function collection(h,{excludeOrganiser=false}={}){
 const G=h.L.groupMoney,people=[{id:'self',name:'You',isOwner:true},{id:'abena',name:'Abena'},{id:'kojo',name:'Kojo'},{id:'esi',name:'Esi'}];
 const made=G.createCollection({title:'Class trip',target:'1200',deadline:new h.context.Date(h.context.Date.now()+14*86400000).toISOString().slice(0,10),members:people,mandateApproval:'named',mandateApproverIds:excludeOrganiser?['abena','kojo','esi']:['self','abena','kojo'],mandateRequiredApprovals:2,acceptMandate:true,idempotencyKey:'ui-collection'});assert(made.ok,made.error);const item=made.item;
 for(const p of people.filter(p=>p.id!=='self'))assert(G.acceptMandate({itemId:item.id,personId:p.id,version:item.mandate.version,sample:true}).ok);
 assert(G.recordSamplePayment({itemId:item.id,personId:'abena',amount:'600',reference:'ui-contribution'}).ok);return item;
}
const open=(h,item)=>{h.L.gm.open(item.id);settle(h);};
function request(h,item,{recipient='Ama’s Transport',purpose='Minibus deposit',amount='150',reference='Invoice INV-024'}={}){
 open(h,item);h.L.state.groupMoney.proposalDraft={account:String(h.L.state.profile.account||h.L.state.profile.handle||h.L.state.profile.phone||h.L.state.profile.name),itemId:item.id,key:h.L.id('legacy-draft'),recipient:'',purpose:'',amount:'',supportingReference:''};h.L.go('groupMoneyProposal',{id:item.id});settle(h);assert.equal(h.L.route,'groupMoneyProposal');
 h.set('gm-proposal-recipient',recipient);h.set('gm-proposal-purpose',purpose);h.set('gm-proposal-amount',amount);h.set('gm-proposal-supportingReference',reference);click(h,'Review payout');assert.equal(h.L.route,'groupMoneyProposalReview');
 assert(text(h).includes('Balance after payout'));assert(text(h).includes(reference));click(h,'Request approval');assert.equal(h.L.route,'groupMoneyProposalDetail');return h.L.groupMoney.proposal(item.id,h.L.params.proposalId);
}
function approve(h,item,p){
 click(h,'Approve payout');assert.equal(h.L.groupMoney.proposalSummary(item.id,p.id).approvalCount,1);click(h,'Try member view');assert.equal(h.L.route,'groupMoneyMember');
 h.set('gm-member-person','abena');h.L.gm.memberPerson();settle(h);click(h,'Simulate member approval');assert.equal(h.L.groupMoney.proposalSummary(item.id,p.id).status,'ready');
}
function release(h,{outcome}={}){
 click(h,control(h,'Review retry')?'Review retry':'Release payment');assert.equal(h.L.route,'groupMoneyPayoutRelease');const pin=h.document.getElementById('gm-payout-pin');assert.equal(pin.type,'password');assert.equal(pin.value,'');
 if(outcome)h.set('gm-payout-outcome',outcome);h.set('gm-payout-pin','123456');h.submit(view(h).querySelector('form'));settle(h);
}

test('collection summary separates Needs attention and Activity, and requesting approval reserves only collection funds',()=>{
 const h=fixture(),item=collection(h),G=h.L.groupMoney,before=personal(h);open(h,item);
 assert(text(h).includes('Needs attention'));assert(text(h).includes('Activity'));assert(text(h).includes('Contributions'));assert(text(h).includes('2 of 3'));
 const p=request(h,item,{recipient:'Transport <svg/onload=alert(1)>',reference:'Invoice <img src=x onerror=alert(1)>'});
 assert.equal(p.amountCents,15000);assert.equal(p.supportingReference,'Invoice <img src=x onerror=alert(1)>');assert.equal(G.summary(item).balanceCents,60000);assert.equal(G.summary(item).reservedCents,15000);assert.equal(G.summary(item).availableCents,45000);
 assert(text(h).includes('Transport <svg/onload=alert(1)>'));assert.equal(view(h).querySelector('.gm-summary svg'),null);assert.equal(view(h).querySelector('.gm-summary img'),null);
 assert(text(h).includes('Awaiting approval'));assert(!control(h,'Release payment'));assert.equal(personal(h),before);clean(h);
});

test('mounted approval quorum unlocks a separate PIN review, Processing stays unpaid, and confirmation yields one immutable receipt',()=>{
 const h=fixture(),item=collection(h),G=h.L.groupMoney,before=personal(h),p=request(h,item);approve(h,item,p);
 assert(control(h,'Release payment'));assert(!control(h,'Approve payout'),'An existing vote cannot be repeated or changed');assert.equal(item.disbursements.length,0);
 click(h,'Release payment');assert.equal(h.L.route,'groupMoneyPayoutRelease');assert(text(h).includes('GH₵450.00'));const pin=h.document.getElementById('gm-payout-pin');h.set('gm-payout-pin','000000');h.submit(view(h).querySelector('form'));settle(h);
 assert.equal(pin.value,'');assert.match(h.document.getElementById('error').textContent,/PIN/);assert.equal(item.disbursements.length,0);h.set('gm-payout-pin','123456');h.submit(view(h).querySelector('form'));settle(h);
 assert.equal(h.L.route,'groupMoneyProposalDetail');assert.equal(G.proposalSummary(item.id,p.id).status,'processing');assert(text(h).includes('Payment is processing'));assert(!text(h).includes('Payment confirmed'));assert(!control(h,'Review retry'));assert(!control(h,'Release payment'));assert(!control(h,'Withdraw request'));assert.equal(G.summary(item).balanceCents,60000);assert.equal(G.summary(item).reservedCents,15000);
 const reference=item.disbursements[0].reference;click(h,'Check sample status');assert.equal(G.proposalSummary(item.id,p.id).status,'paid');assert.equal(G.summary(item).balanceCents,45000);assert.equal(G.summary(item).reservedCents,0);assert.equal(item.disbursements.length,1);assert(text(h).includes('Payout receipt'));assert(text(h).includes(reference));assert(text(h).includes('Approved by'));assert(text(h).includes('GH₵450.00'));
 assert(G.recordSamplePayment({itemId:item.id,personId:'kojo',amount:'50',reference:'later-contribution'}).ok);h.L.render();settle(h);assert.equal(G.summary(item).balanceCents,50000);assert.equal(G.proposalSummary(item.id,p.id).receipt.balanceAfterCents,45000);assert(text(h).includes('GH₵450.00'));assert.equal(item.disbursements.length,1);assert.equal(personal(h),before);clean(h);
});

test('a decline follows any-two-of-three rather than granting one person a veto',()=>{
 const h=fixture(),item=collection(h),G=h.L.groupMoney,p=request(h,item),before=personal(h);
 click(h,'Decline payout');assert.equal(h.L.route,'groupMoneyProposalDecline');assert(text(h).includes('threshold remains possible'));click(h,'Decline payout');let state=G.proposalSummary(item.id,p.id);assert.equal(state.status,'pending');assert.deepEqual([...state.declinedPersonIds],['self']);assert(text(h).includes('Declined by you'));assert(!control(h,'Approve payout'));assert(!control(h,'Decline payout'));
 for(const person of ['abena','kojo']){h.L.gm.openMember(item.id,person,p.id);settle(h);click(h,'Simulate member approval');}
 state=G.proposalSummary(item.id,p.id);assert.equal(state.status,'ready');assert.equal(state.approvalCount,2);assert(control(h,'Release payment'));assert.equal(personal(h),before);clean(h);
});

test('terminal decline closes the request only when the required approvals are no longer possible',()=>{
 const h=fixture(),item=collection(h),G=h.L.groupMoney,p=request(h,item);click(h,'Decline payout');click(h,'Decline payout');h.L.gm.openMember(item.id,'abena',p.id);settle(h);click(h,'Simulate member decline');assert.equal(h.L.route,'groupMoneyProposalDecline');click(h,'Record sample decline');
 assert.equal(G.proposalSummary(item.id,p.id).status,'declined');assert.equal(G.summary(item).reservedCents,0);assert(text(h).includes('can no longer be reached'));assert(!control(h,'Release payment'));assert(!control(h,'Review retry'));h.L.go('groupMoneyRules',{id:item.id});settle(h);assert.equal(view(h).querySelectorAll('[data-activity-kind="payout-decline"]').length,2);assert.equal(view(h).querySelectorAll('[data-activity-kind="payout-paid"]').length,0);clean(h);
});

test('a failed payment can be freshly reviewed and retried under the same reference without duplicate collection debit',()=>{
 const h=fixture({testing:true}),item=collection(h),G=h.L.groupMoney,p=request(h,item),before=personal(h);approve(h,item,p);release(h,{outcome:'Failed'});
 assert.equal(G.proposalSummary(item.id,p.id).status,'failed');assert.equal(G.summary(item).balanceCents,60000);assert.equal(G.summary(item).reservedCents,0);assert(control(h,'Review retry'));const reference=item.disbursements[0].reference;
 release(h,{outcome:'Pending'});assert.equal(G.proposalSummary(item.id,p.id).status,'processing');assert.equal(item.disbursements[0].reference,reference);assert.equal(item.disbursements.length,1);h.set('gm-payout-settlement','Pending');click(h,'Check sample status');assert.equal(G.proposalSummary(item.id,p.id).status,'processing');
 h.set('gm-payout-settlement','Failed');click(h,'Check sample status');assert.equal(G.proposalSummary(item.id,p.id).status,'failed');release(h,{outcome:'Completed'});assert.equal(G.proposalSummary(item.id,p.id).status,'paid');assert.equal(item.disbursements[0].reference,reference);assert.equal(item.disbursements.length,1);assert.equal(item.disbursements[0].attempts.length,3);assert.equal(G.summary(item).balanceCents,45000);assert.equal(personal(h),before);clean(h);
});

test('native Back clears the PIN and release review while keeping the ordinary payout request',()=>{
 const h=fixture(),item=collection(h),G=h.L.groupMoney,p=request(h,item),before=personal(h);approve(h,item,p);click(h,'Release payment');const field=h.set('gm-payout-pin','654321');assert.equal(h.L.route,'groupMoneyPayoutRelease');h.history.back();settle(h);
 assert.equal(h.L.route,'groupMoneyProposalDetail');assert.equal(field.value,'');assert.equal(item.disbursements.length,0);assert.equal(G.proposalSummary(item.id,p.id).status,'ready');assert(!JSON.stringify(h.L.state).includes('654321'));assert(![...h.store.values()].some(v=>String(v).includes('654321')));
 h.history.forward();settle(h);assert.equal(h.L.route,'groupMoneyPayoutRelease');assert.equal(h.document.getElementById('gm-payout-pin'),null);assert(text(h).includes('Review payout again'));assert(!control(h,'Release payment'));assert.equal(personal(h),before);clean(h);
});

test('organiser withdrawal requires confirmation and keeps decisions while releasing an unsubmitted reservation',()=>{
 const h=fixture(),item=collection(h),G=h.L.groupMoney,p=request(h,item),before=personal(h);click(h,'Approve payout');click(h,'Withdraw request');assert.equal(h.L.route,'groupMoneyPayoutWithdraw');assert(text(h).includes('fresh approvals'));assert.equal(G.summary(item).reservedCents,15000);click(h,'Keep request');assert.equal(G.proposalSummary(item.id,p.id).status,'pending');
 click(h,'Withdraw request');click(h,'Withdraw request');assert.equal(G.proposalSummary(item.id,p.id).status,'cancelled');assert.equal(G.summary(item).reservedCents,0);assert.equal(p.approvals.length,1);assert(!control(h,'Release payment'));
 const stages=view(h).querySelector('.gm-payout-steps').querySelectorAll('li');assert.equal(stages[1].classList.contains('is-complete'),false);assert.equal(stages[2].classList.contains('is-complete'),false);assert.equal(stages[2].getAttribute('aria-current'),null);assert.match(view(h).querySelector('.gm-payout-steps').getAttribute('aria-label'),/closed/);
 h.L.go('groupMoneyRules',{id:item.id});settle(h);const withdrawals=view(h).querySelectorAll('[data-activity-kind="payout-withdrawal"]');assert.equal(withdrawals.length,1);assert(withdrawals[0].textContent.includes('withdrawn'));assert.equal(withdrawals[0].querySelector('.gm-person-amount'),null);assert.equal(view(h).querySelectorAll('[data-activity-kind="payout-approval"]').length,1);click(h,'Back to collection');assert.equal(h.L.route,'groupMoneyDetail');assert.equal(personal(h),before);clean(h);
});

test('contributors follow every status and a supplied confirmed receipt without receiving decision or release authority',()=>{
 const h=fixture(),G=h.L.groupMoney,inv=G.createSampleInvitation({scenario:'contributor',idempotencyKey:'ui-contributor'});assert(inv.ok,inv.error);const s=G.invitationSummary(inv.invitation.id),joined=G.acceptInvitation({invitationId:s.id,version:s.mandate.version,fingerprint:s.fingerprint});assert(joined.ok,joined.error);const item=joined.item,p=item.proposals[0];
 open(h,item);assert(text(h).includes('Needs attention'));assert(!control(h,'Pay from collection'));h.L.go('groupMoneyProposalDetail',{id:item.id,proposalId:p.id});settle(h);assert(text(h).includes('Contributor view'));for(const label of ['Approve payout','Decline payout','Release payment','Withdraw request','Try member view'])assert(!control(h,label),label+' is unavailable to contributor');
 // Seed the same confirmed group record that a live reader would receive;
 // this does not invoke or grant a contributor any payment operation.
 const stamp=new h.context.Date().toISOString(),reference='SAMPLE-PAYOUT-'+p.id;p.status='paid';p.paidAt=stamp;item.disbursements.push({id:'read-only-confirmed',proposalId:p.id,fingerprint:p.fingerprint,status:'confirmed',reference,recipient:p.recipient,purpose:p.purpose,amountCents:p.amountCents,feeCents:0,totalCents:p.totalCents,date:stamp,sample:true,receipt:{reference,collectionName:item.title,collectionAccountReference:item.collectionAccount.reference,recipient:p.recipient,purpose:p.purpose,amountCents:p.amountCents,feeCents:0,totalCents:p.totalCents,balanceAfterCents:45000,paidAt:stamp,approvers:[{name:'Organiser',decision:'approved'},{name:'Abena',decision:'approved'}]}});h.L.render();settle(h);
 assert(text(h).includes('Payout receipt'));assert(text(h).includes(reference));assert(text(h).includes('GH₵450.00'));assert(text(h).includes('Approved by'));for(const label of ['Approve payout','Decline payout','Release payment','Withdraw request','Review retry'])assert(!control(h,label));assert.equal(G.preparePayout({itemId:item.id,proposalId:p.id}).ok,false);clean(h);
});

test('a stale rendered approval and a stale release grant cannot authorise changed payout details',()=>{
 const h=fixture(),item=collection(h),G=h.L.groupMoney,p=request(h,item);const old=control(h,'Approve payout');p.supportingReference='Different invoice';old.click();settle(h);assert.equal(p.approvals.length,0);assert.match(h.document.getElementById('error').textContent,/changed|review/i);assert.equal(item.disbursements.length,0);clean(h);
 const next=fixture(),other=collection(next),Q=next.L.groupMoney,requestP=request(next,other);approve(next,other,requestP);click(next,'Release payment');assert(Q.recordSamplePayment({itemId:other.id,personId:'kojo',amount:'50',reference:'changed-balance'}).ok);next.set('gm-payout-pin','123456');next.submit(view(next).querySelector('form'));settle(next);
 assert.equal(other.disbursements.length,0);assert.equal(next.document.getElementById('gm-payout-pin'),null);assert(text(next).includes('Review payout again'));assert(!control(next,'Release payment'));clean(next);
});


test('a stale processing screen cannot confirm a later retry attempt under the stable payout reference',()=>{
 const h=fixture({testing:true}),item=collection(h),G=h.L.groupMoney,p=request(h,item);approve(h,item,p);release(h,{outcome:'Pending'});
 const oldCheck=control(h,'Check sample status'),firstAttempt=G.proposalSummary(item.id,p.id).attemptId;assert(oldCheck);h.set('gm-payout-settlement','Failed');oldCheck.click();settle(h);assert.equal(G.proposalSummary(item.id,p.id).status,'failed');
 release(h,{outcome:'Pending'});const secondAttempt=G.proposalSummary(item.id,p.id).attemptId;assert.notEqual(secondAttempt,firstAttempt);h.set('gm-payout-settlement','Completed');oldCheck.click();settle(h);assert.equal(G.proposalSummary(item.id,p.id).status,'processing');assert.equal(G.summary(item).spentCents,0);assert.match(h.document.getElementById('error').textContent,/attempt|current|reference|changed/i);
 click(h,'Check sample status');assert.equal(G.proposalSummary(item.id,p.id).status,'paid');assert.equal(item.disbursements.length,1);assert.equal(G.summary(item).spentCents,15000);clean(h);
});


test('full activity distinguishes reserved Processing, Failed without debit and a single Paid debit, and blocks cancellation until status is known',()=>{
 const h=fixture({testing:true}),item=collection(h),G=h.L.groupMoney,p=request(h,item),before=personal(h);approve(h,item,p);release(h,{outcome:'Pending'});h.L.go('groupMoneyRules',{id:item.id});settle(h);
 let processing=view(h).querySelectorAll('[data-activity-kind="payout-processing"]');assert.equal(processing.length,1);assert.match(processing[0].textContent,/GH₵150\.00 reserved.*Not paid/);assert.equal(processing[0].querySelector('.gm-person-amount'),null);assert.equal(view(h).querySelectorAll('[data-activity-kind="payout-paid"]').length,0);assert(!control(h,'Cancel collection'));assert(!control(h,'Try sample refunds'));assert(control(h,'View processing payout'));
 for(const action of ['cancel','refund']){h.L.go('groupMoneyRules',{id:item.id,action});settle(h);assert(text(h).includes('Payment is processing'));assert(!control(h,'Confirm cancellation'));assert(!control(h,'Record sample refunds'));assert(control(h,'View processing payout'));assert.equal(item.status,'collecting');}
 click(h,'View processing payout');assert.equal(h.L.route,'groupMoneyProposalDetail');h.set('gm-payout-settlement','Failed');click(h,'Check sample status');h.L.go('groupMoneyRules',{id:item.id});settle(h);
 let failures=view(h).querySelectorAll('[data-activity-kind="payout-failed"]');assert.equal(failures.length,1);assert.match(failures[0].textContent,/not paid.*No debit/);assert.equal(failures[0].querySelector('.gm-person-amount'),null);assert.equal(view(h).querySelectorAll('[data-activity-kind="payout-processing"]').length,0);assert(control(h,'Cancel collection'));assert.equal(G.summary(item).spentCents,0);
 failures[0].click();settle(h);assert.equal(h.L.route,'groupMoneyProposalDetail');release(h,{outcome:'Pending'});click(h,'Check sample status');assert.equal(G.proposalSummary(item.id,p.id).status,'paid');h.L.go('groupMoneyRules',{id:item.id});settle(h);
 const paid=view(h).querySelectorAll('[data-activity-kind="payout-paid"]');assert.equal(paid.length,1);assert.equal(paid[0].querySelector('.gm-person-amount').textContent,'−GH₵150.00');assert.equal(view(h).querySelectorAll('[data-activity-kind="payout-processing"]').length,0);failures=view(h).querySelectorAll('[data-activity-kind="payout-failed"]');assert.equal(failures.length,1,'The earlier failed attempt remains in history without becoming another debit');assert.equal(failures[0].querySelector('.gm-person-amount'),null);assert.equal(view(h).querySelector('[data-activity-kind="payout-request"]').querySelector('.gm-person-amount'),null);assert.equal(G.summary(item).spentCents,15000);assert.equal(G.summary(item).balanceCents,45000);
 click(h,'Back to collection');assert.equal(h.L.route,'groupMoneyDetail');assert.equal(personal(h),before);clean(h);
});

test('ordinary returning navigation leaves the full customer state unchanged when no group-money records exist',()=>{
 const h=fixture(),L=h.L;
 // Let existing first-visit education record its legitimate preference first.
 // The returning navigation below must not initialise collection storage.
 for(const route of ['moneyStoryHome','home']){L.openTab(route);settle(h);}
 delete L.state.groupMoney;L.save();const before=JSON.stringify(L.state),stored=[...h.store.entries()];
 for(const route of ['moneyStoryHome','home']){L.openTab(route);settle(h);assert.equal(L.route,route);assert.equal(JSON.stringify(L.state),before);assert.equal(Object.hasOwn(L.state,'groupMoney'),false);}
 assert.deepEqual([...h.store.entries()],stored);clean(h);
});


test('returning from background with a retired release review removes the PIN form and offers a fresh review without moving money',()=>{
 const h=fixture(),item=collection(h),G=h.L.groupMoney,p=request(h,item),before=personal(h);approve(h,item,p);click(h,'Release payment');const originalPin=h.set('gm-payout-pin','654321');
 h.document.hidden=true;h.document.dispatchEvent(new h.Event('visibilitychange'));assert.equal(originalPin.value,'');h.document.hidden=false;h.document.dispatchEvent(new h.Event('visibilitychange'));
 const foregroundPin=h.set('gm-payout-pin','123456');h.submit(view(h).querySelector('form'));settle(h);assert.equal(foregroundPin.value,'');assert.equal(h.document.getElementById('gm-payout-pin'),null);assert.equal(h.L.route,'groupMoneyPayoutRelease');assert(text(h).includes('Review payout again'));assert(control(h,'Back to payout'));assert(!control(h,'Release payment'));assert.equal(item.disbursements.length,0);assert.equal(G.proposalSummary(item.id,p.id).status,'ready');assert.equal(G.summary(item).balanceCents,60000);assert.equal(personal(h),before);
 h.L.gm.releasePayout();settle(h);assert.equal(item.disbursements.length,0);assert.equal(h.document.getElementById('gm-payout-pin'),null);click(h,'Back to payout');assert.equal(h.L.route,'groupMoneyProposalDetail');release(h);assert.equal(G.proposalSummary(item.id,p.id).status,'processing');assert.equal(item.disbursements.length,1);assert.equal(G.summary(item).spentCents,0);assert.equal(personal(h),before);clean(h);
});
