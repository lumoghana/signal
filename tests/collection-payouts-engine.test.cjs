/* Collection payouts remain same-device samples. The engine owns the exact
   mandate, decisions, PIN review, reservation, result and receipt lifecycle. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
function fixture(options={}){
 const h=createHarness({clock:true,deferHistory:true,...options}),L=h.L;L.explore();L.ensureAccounts?.();
 Object.assign(L.state,{balance:600,txs:[],requests:[],paymentDraft:null,essentials:[],goals:[],groupMoney:undefined});L.route='home';L.params={};L.history=[];L.save();h.flush();
 return {h,L,G:L.groupMoney};
}
const personal=f=>JSON.stringify({balance:f.L.state.balance,accounts:f.L.state.accounts,txs:f.L.state.txs,requests:f.L.state.requests,goals:f.L.state.goals,essentials:f.L.state.essentials,paymentDraft:f.L.state.paymentDraft});
const people=()=>[{id:'self',name:'You',isOwner:true},{id:'abena',name:'Abena'},{id:'kojo',name:'Kojo'},{id:'esi',name:'Esi'}];
const collection=(f,changes={})=>{
 const r=f.G.createCollection({title:'Class trip',target:'1200',deadline:new f.h.context.Date(f.h.context.Date.now()+14*86400000).toISOString().slice(0,10),members:people(),mandateApproval:'named',mandateApproverIds:['self','abena','kojo'],mandateRequiredApprovals:2,acceptMandate:true,idempotencyKey:'collection',...changes});assert(r.ok,r.error);const g=r.item;
 for(const p of g.people.filter(p=>p.id!=='self')){const a=f.G.acceptMandate({itemId:g.id,personId:p.id,version:g.mandate.version,sample:true});assert(a.ok,a.error);}
 assert(f.G.recordSamplePayment({itemId:g.id,personId:g.people.find(person=>!person.isOwner).id,amount:'600',reference:'initial-fund'}).ok);return g;
};
const propose=(f,g,changes={})=>{const r=f.G.createProposal({itemId:g.id,recipient:'Ama Transport',purpose:'Minibus deposit',amount:'150',idempotencyKey:'payout',...changes});assert(r.ok,r.error);return r.proposal;};
const vote=(f,g,p,id='self',decline=false,changes={})=>f.G[decline?'declineProposal':'approveProposal']({itemId:g.id,proposalId:p.id,personId:id,version:p.mandateVersion,fingerprint:p.fingerprint,...(id!=='self'?{sample:true}:{}),...changes});
const approve=(f,g,p)=>{assert(vote(f,g,p).ok);assert(vote(f,g,p,'abena').ok);return p;};
const review=(f,g,p)=>{const r=f.G.preparePayout({itemId:g.id,proposalId:p.id});assert(r.ok,r.error);return r.quote;};
const release=(f,g,p,quote=review(f,g,p),changes={})=>f.G.executeSampleProposal({itemId:g.id,proposalId:p.id,reviewToken:quote.token,pin:f.L.state.profile.pin,outcome:'Pending',...changes});
const state=(f,g,p)=>f.G.proposalSummary(g.id,p.id);
const settle=(f,g,p,outcome='Completed',changes={})=>f.G.settleSamplePayout({itemId:g.id,proposalId:p.id,reference:state(f,g,p).reference,attemptId:state(f,g,p).attemptId,outcome,sample:true,...changes});
const clean=f=>assert.deepEqual(f.h.errors,[]);

test('Request, exact approvals, scoped PIN and confirmed result debit only the collection once',()=>{
 const f=fixture(),g=collection(f),p=propose(f,g),before=personal(f);assert.equal(state(f,g,p).status,'pending');assert.equal(f.G.summary(g).reservedCents,15000);
 assert.equal(f.G.preparePayout({itemId:g.id,proposalId:p.id}).ok,false);approve(f,g,p);assert.equal(state(f,g,p).status,'ready');assert.equal(g.disbursements.length,0);
 const saved=JSON.stringify(g),q=review(f,g,p);assert.equal(JSON.stringify(g),saved,'Review moves no money and stores no authorization in the account');assert.equal(q.balanceAfterCents,45000);
 assert.equal(f.G.executeSampleProposal({itemId:g.id,proposalId:p.id}).ok,false,'No legacy direct-execute authentication bypass');
 const r=release(f,g,p,q);assert(r.ok,r.error);assert.equal(state(f,g,p).status,'processing');assert.equal(f.G.summary(g).balanceCents,60000);assert.equal(f.G.summary(g).availableCents,45000);
 assert(settle(f,g,p).ok);assert.equal(state(f,g,p).status,'paid');assert.equal(f.G.summary(g).balanceCents,45000);assert.equal(f.G.summary(g).reservedCents,0);assert.equal(g.disbursements.length,1);
 const once=JSON.stringify(g);assert(release(f,g,p,q).idempotent);assert(settle(f,g,p).idempotent);assert.equal(JSON.stringify(g),once);assert.equal(personal(f),before);clean(f);
});

test('one decline does not veto any-two-of-three while impossible quorum ends the request',()=>{
 const f=fixture(),g=collection(f),p=propose(f,g);assert(vote(f,g,p,'kojo',true).ok);assert.equal(state(f,g,p).status,'pending');assert.equal(state(f,g,p).declineCount,1);
 approve(f,g,p);assert.equal(state(f,g,p).status,'ready');assert(release(f,g,p,undefined,{outcome:'Completed'}).ok);assert.equal(state(f,g,p).status,'paid');
 const second=propose(f,g,{idempotencyKey:'declined',amount:'100'});assert(vote(f,g,second,'abena',true).ok);assert(vote(f,g,second,'kojo',true).ok);assert.equal(state(f,g,second).status,'declined');assert.equal(f.G.summary(g).reservedCents,0);
 const once=JSON.stringify(second);assert(vote(f,g,second,'kojo',true).idempotent);assert.equal(JSON.stringify(second),once);assert.equal(f.G.preparePayout({itemId:g.id,proposalId:second.id}).ok,false);clean(f);
});

test('decisions remain scoped, role-gated and immutable for each named member',()=>{
 const f=fixture(),g=collection(f),p=propose(f,g);assert.equal(vote(f,g,p,'esi',true).ok,false,'A contributor cannot decline on behalf of approvers');
 assert.equal(vote(f,g,p,'abena',true,{sample:false}).ok,false);assert.equal(vote(f,g,p,'self',false,{fingerprint:'stale'}).ok,false);
 assert(vote(f,g,p,'self').ok);assert.equal(vote(f,g,p,'self',true).ok,false);assert(vote(f,g,p,'kojo',true).ok);assert.equal(vote(f,g,p,'kojo').ok,false);clean(f);
});

test('wrong PIN never releases money and five failures survive reopening or another request',()=>{
 const f=fixture(),g=collection(f),p=approve(f,g,propose(f,g)),before=personal(f);let q=review(f,g,p);
 assert.equal(release(f,g,p,q,{pin:'000000'}).ok,false);assert.equal(f.L.authPolicy.status().failures,1);assert.equal(g.disbursements.length,0);
 for(let i=0;i<4;i++){q=review(f,g,p);const r=release(f,g,p,q,{pin:'000000'});assert.equal(r.ok,false);}
 assert.equal(f.L.state.locked,true);assert.equal(g.disbursements.length,0);assert.equal(personal(f),before);assert.equal(f.G.preparePayout({itemId:g.id,proposalId:p.id}).ok,false);clean(f);
});

test('a correct PIN may use the same review after a typo, but discarded or expired reviews cannot pay',()=>{
 const f=fixture(),g=collection(f),p=approve(f,g,propose(f,g)),q=review(f,g,p);
 assert.equal(release(f,g,p,q,{pin:'000000'}).ok,false);assert(release(f,g,p,q,{outcome:'Failed'}).ok);assert.equal(f.L.authPolicy.status().failures,0);
 const retry=review(f,g,p);assert(f.G.discardPayoutReview({reviewToken:retry.token}));assert.equal(release(f,g,p,retry).needsReview,true);
 const expired=review(f,g,p);f.h.advance(5*60*1000);assert.equal(release(f,g,p,expired).needsReview,true);assert.equal(state(f,g,p).status,'failed');clean(f);
});

test('changed funds, decisions, credentials or account identity invalidate a prepared release',()=>{
 for(const mutate of [
  (f,g,p)=>f.G.recordSamplePayment({itemId:g.id,personId:'kojo',amount:'1',reference:'new-fund'}),
  (f,g,p)=>vote(f,g,p,'kojo',true),
  (f,g,p)=>{f.L.state.profile.pin='654321';},
  (f,g,p)=>{f.L.state={...f.L.state,profile:{...f.L.state.profile}};}
 ]){const f=fixture(),g=collection(f),p=approve(f,g,propose(f,g)),q=review(f,g,p);mutate(f,g,p);assert.equal(release(f,g,p,q).needsReview,true);assert.equal(g.disbursements.length,0);clean(f);}
});

test('processing holds survive approval expiry and cannot be cancelled refunded or retried',()=>{
 const f=fixture(),g=collection(f),p=approve(f,g,propose(f,g));assert(release(f,g,p).ok);const reference=state(f,g,p).reference;
 f.h.advance(49*60*60*1000);assert.equal(state(f,g,p).status,'processing');assert.equal(f.G.summary(g).reservedCents,15000);assert.equal(f.G.cancel(g.id).ok,false);assert.equal(f.G.refund(g.id).ok,false);assert.equal(f.G.preparePayout({itemId:g.id,proposalId:p.id}).ok,false);
 assert.equal(settle(f,g,p,'Completed',{reference:'another-reference'}).ok,false);assert(settle(f,g,p).ok);assert.equal(state(f,g,p).reference,reference);assert.equal(state(f,g,p).status,'paid');assert.equal(f.G.summary(g).balanceCents,45000);clean(f);
});

test('failed payout releases its hold and retries with the same reference after fresh fund review and PIN',()=>{
 const f=fixture(),g=collection(f),p=approve(f,g,propose(f,g)),q=review(f,g,p);assert(release(f,g,p,q,{outcome:'Failed'}).ok);const reference=state(f,g,p).reference;
 assert.equal(f.G.summary(g).reservedCents,0);assert.equal(f.G.summary(g).balanceCents,60000);assert.equal(state(f,g,p).canRetry,true);assert.equal(release(f,g,p,q).ok,false);
 const competing=propose(f,g,{idempotencyKey:'other',amount:'500'});assert.equal(state(f,g,p).canRetry,false);assert.equal(f.G.preparePayout({itemId:g.id,proposalId:p.id}).ok,false);
 assert(vote(f,g,competing,'abena',true).ok);assert(vote(f,g,competing,'kojo',true).ok);assert.equal(state(f,g,p).canRetry,true);
 const next=review(f,g,p);assert.equal(next.reference,reference);assert(release(f,g,p,next).ok);assert(settle(f,g,p).ok);assert.equal(g.disbursements.length,1);assert.equal(g.disbursements[0].attempts.length,2);assert.equal(f.G.summary(g).spentCents,15000);clean(f);
});

test('paid receipts retain their original collection, decisions and remaining balance after later activity',()=>{
 const f=fixture(),g=collection(f),p=approve(f,g,propose(f,g,{supportingReference:'Invoice BUS-21'}));assert(release(f,g,p,undefined,{outcome:'Completed'}).ok);
 const receipt=state(f,g,p).receipt,snapshot=JSON.stringify(receipt);assert.equal(receipt.collectionName,'Class trip');assert.equal(receipt.collectionAccountReference,g.collectionAccount.reference);assert.equal(receipt.balanceAfterCents,45000);assert.equal(receipt.supportingReference,'Invoice BUS-21');assert.equal(receipt.approvers.filter(a=>a.decision==='approved').length,2);assert(receipt.paidAt);
 assert(f.G.recordSamplePayment({itemId:g.id,personId:'kojo',amount:'25',reference:'later-funding'}).ok);assert.equal(f.G.summary(g).balanceCents,47500);assert.equal(JSON.stringify(state(f,g,p).receipt),snapshot);clean(f);
});

test('a conflicting repeated sample result cannot reverse a final paid or failed reference',()=>{
 const f=fixture(),g=collection(f),p=approve(f,g,propose(f,g));assert(release(f,g,p).ok);assert(settle(f,g,p,'Failed').ok);assert(settle(f,g,p,'Completed').idempotent);assert.equal(state(f,g,p).status,'failed');assert.equal(f.G.summary(g).spentCents,0);
 assert(release(f,g,p).ok);assert(settle(f,g,p).ok);assert(settle(f,g,p,'Failed').idempotent);assert.equal(state(f,g,p).status,'paid');assert.equal(f.G.summary(g).spentCents,15000);clean(f);
});

test('supporting reference changes invalidate existing approval while saved proof-free fingerprints remain compatible',()=>{
 const f=fixture(),g=collection(f,{mandateApproval:'majority',mandateApproverIds:undefined,mandateRequiredApprovals:undefined}),p=propose(f,g);
 assert.equal(p.fingerprint,JSON.stringify([p.id,p.idempotencyKey,p.itemId,p.recipient,p.purpose,p.amountCents,p.feeCents,p.totalCents,p.mandateVersion,p.mandateFingerprint,p.memberIds,p.requiredApprovals,p.createdAt,p.expiresAt]));
 const next=approve(f,g,propose(f,g,{idempotencyKey:'proof',supportingReference:'Invoice BUS-21'}));assert.equal(state(f,g,next).valid,true);next.supportingReference='Different quotation';assert.equal(state(f,g,next).valid,false);assert.equal(f.G.preparePayout({itemId:g.id,proposalId:next.id}).ok,false);clean(f);
});

const attachment=(type='application/pdf',bytes=Buffer.from('%PDF-1.7\nSample invoice'))=>({name:'invoice.pdf',type,size:bytes.length,dataUrl:'data:'+type+';base64,'+bytes.toString('base64')});
test('only bounded correctly encoded JPEG PNG and PDF proof is accepted and exact file content is approval-bound',()=>{
 const f=fixture();for(const [type,bytes]of [['application/pdf',Buffer.from('%PDF-1.7')],['image/png',Buffer.from([137,80,78,71,13,10,26,10,0])],['image/jpeg',Buffer.from([255,216,255,224])]])assert(f.G.validateAttachment(attachment(type,bytes)).ok);
 const good=attachment();for(const bad of [{...good,size:good.size+1},{...good,type:'image/svg+xml'},{...good,dataUrl:'data:application/pdf;base64,PGh0bWw+'},{...good,name:'../invoice.pdf'},{...good,size:200*1024+1},{...good,dataUrl:good.dataUrl+'!'}])assert.equal(f.G.validateAttachment(bad).ok,false);
 const g=collection(f),p=approve(f,g,propose(f,g,{attachment:good}));assert(release(f,g,p,undefined,{outcome:'Completed'}).ok);assert.equal(state(f,g,p).receipt.attachment.dataUrl,good.dataUrl);assert(!f.G.shareText(g.id).includes(good.dataUrl));
 p.attachment.dataUrl=attachment('application/pdf',Buffer.from('%PDF-1.7\nAltered invoice')).dataUrl;assert.equal(state(f,g,p).valid,false);assert.equal(f.G.preparePayout({itemId:g.id,proposalId:p.id}).ok,false);clean(f);
});


test('withdrawal keeps decisions and history while releasing only an unsubmitted request reservation',()=>{
 const f=fixture(),g=collection(f),p=approve(f,g,propose(f,g)),q=review(f,g,p),before=personal(f),approvals=JSON.stringify(p.approvals);
 assert.equal(f.G.cancelProposal({itemId:g.id,proposalId:p.id,fingerprint:'stale'}).ok,false);
 assert(f.G.cancelProposal({itemId:g.id,proposalId:p.id,fingerprint:p.fingerprint}).ok);assert.equal(state(f,g,p).status,'cancelled');assert.equal(f.G.summary(g).reservedCents,0);assert.equal(JSON.stringify(p.approvals),approvals);assert(g.activity.some(a=>a.type==='proposal-cancelled'&&a.proposalId===p.id));
 assert.equal(release(f,g,p,q).ok,false);const once=JSON.stringify(g);assert(f.G.cancelProposal({itemId:g.id,proposalId:p.id}).idempotent);assert.equal(JSON.stringify(g),once);
 const next=approve(f,g,propose(f,g,{idempotencyKey:'replacement',recipient:'Different supplier'}));assert(release(f,g,next).ok);assert.equal(f.G.cancelProposal({itemId:g.id,proposalId:next.id}).ok,false);assert.equal(personal(f),before);clean(f);
});

test('a release review cannot pay another approved request and a forged token cannot authorise',()=>{
 const f=fixture(),g=collection(f),p=approve(f,g,propose(f,g)),other=approve(f,g,propose(f,g,{idempotencyKey:'second'})),q=review(f,g,p);
 assert.equal(release(f,g,other,q).needsReview,true);assert.equal(f.G.executeSampleProposal({itemId:g.id,proposalId:p.id,reviewToken:{},pin:f.L.state.profile.pin}).ok,false);assert.equal(g.disbursements.length,0);clean(f);
});

test('submitted reservation comes from the payout record even if the saved proposal is later corrupted',()=>{
 const f=fixture(),g=collection(f),p=approve(f,g,propose(f,g));assert(release(f,g,p).ok);p.amountCents=1;p.totalCents=1;
 assert.equal(state(f,g,p).valid,false);assert.equal(f.G.summary(g).reservedCents,15000);assert.equal(f.G.cancel(g.id).ok,false);assert.equal(f.G.preparePayout({itemId:g.id,proposalId:p.id}).ok,false);clean(f);
});


test('an earlier failed attempt result cannot settle a freshly authorised retry with the same payout reference',()=>{
 const f=fixture(),g=collection(f),p=approve(f,g,propose(f,g));assert(release(f,g,p).ok);
 const stale={itemId:g.id,proposalId:p.id,reference:state(f,g,p).reference,attemptId:state(f,g,p).attemptId,outcome:'Completed',sample:true};
 assert(settle(f,g,p,'Failed').ok);assert(release(f,g,p).ok);const active=state(f,g,p);assert.notEqual(active.attemptId,stale.attemptId);assert.equal(active.reference,stale.reference);
 assert.equal(f.G.settleSamplePayout(stale).ok,false);assert.equal(state(f,g,p).status,'processing');assert.equal(f.G.summary(g).spentCents,0);assert.equal(f.G.summary(g).reservedCents,15000);assert(settle(f,g,p).ok);assert.equal(f.G.summary(g).spentCents,15000);clean(f);
});

test('compact evidence digests match Node SHA-256 across ASCII block boundaries and random maximum-size files',()=>{
 const {createHash,randomBytes}=require('node:crypto'),f=fixture();
 for(const length of [5,6,7,8,19,20,21,22,23,24,31,32,33,42,43,44,45,46,47,48,49,55,56,57,63,64,65,127,128,129,1024,200*1024]){
  const bytes=randomBytes(length);Buffer.from('%PDF-').copy(bytes);const proof=attachment('application/pdf',bytes),result=f.G.validateAttachment(proof);assert(result.ok,result.error);assert.equal(result.digest,createHash('sha256').update(proof.dataUrl,'ascii').digest('hex'),'Canonical ASCII data URL at byte length '+length);
 }
 clean(f);
});

test('maximum proof with all nine approver decisions stays bounded instead of duplicating the file into votes',()=>{
 const f=fixture(),members=[people()[0],...Array.from({length:8},(_,i)=>({id:'approver-'+i,name:'Approver '+(i+1)}))],g=collection(f,{members,mandateApproverIds:members.map(p=>p.id)}),bytes=Buffer.alloc(200*1024,65);Buffer.from('%PDF-1.7').copy(bytes);
 const p=propose(f,g,{attachment:attachment('application/pdf',bytes)});assert.equal(p.evidenceVersion,1);assert.match(p.attachmentDigest,/^[a-f0-9]{64}$/);assert(p.fingerprint.length<4096,'Votes bind compact evidence metadata and digest');
 for(const member of members)assert(vote(f,g,p,member.id).ok);assert.equal(state(f,g,p).approvalCount,9);assert(JSON.stringify(f.L.state).length<500*1024,'All decisions fit with the proof stored once');
 assert(release(f,g,p,undefined,{outcome:'Completed'}).ok);assert(JSON.stringify(f.L.state).length<800*1024,'The original proof and frozen receipt remain bounded');clean(f);
});

test('direct creation cannot bypass preview evidence capacity limits',()=>{
 const f=fixture(),g=collection(f),proof=attachment();f.L.state.largeSavedRecord='x'.repeat(Math.ceil(2*1024*1024));
 const before=g.proposals.length,r=f.G.createProposal({itemId:g.id,recipient:'Supplier',purpose:'Proof storage boundary',amount:'1',attachment:proof,idempotencyKey:'full-storage'});assert.equal(r.ok,false);assert.equal(g.proposals.length,before);assert.match(r.error,/smaller file|invoice reference/);clean(f);
});


const closureReady=f=>{
 Object.assign(f.L.state,{balance:0,txs:[],requests:[],cases:[],essentials:[],goals:[],paymentDraft:null,merchant:{collections:[],settlements:[],adjustments:[]},refunds:[],incomingCredits:[]});
 f.L.route='home';f.L.params={};f.L.history=[];f.L.render();f.h.flushHistory();f.h.flush();assert.equal(f.L.acct.blockers().length,0);
};
const closureAction=(f,code)=>f.h.document.getElementById('view').querySelectorAll('button').find(button=>button.getAttribute('onclick')===code);
const openClosure=f=>{f.L.go('closeAccount');f.h.flushHistory();f.h.flush();f.h.set('authPin',f.L.state.profile.pin);f.h.document.getElementById('closeConfirm').checked=true;};

test('the actual closure checklist blocks organiser collection money and routes to its unchanged record',()=>{
 const f=fixture({testing:true});closureReady(f);const g=collection(f),before=personal(f),record=JSON.stringify(g),blocks=f.L.acct.blockers();
 const blocker=blocks.find(b=>b.route==='groupMoneyDetail'&&b.id===g.id);assert(blocker);assert(blocker.sub.includes('GH₵600.00'));assert(blocker.sub.includes('Class trip'));
 f.L.go('closeAccount');f.h.flushHistory();f.h.flush();const page=f.h.document.getElementById('view');assert(page.textContent.includes('Money in your collection account'));assert.equal(page.querySelectorAll('button').some(button=>button.getAttribute('onclick')==='L.acct.submitClosure()'),false);
 const link=page.querySelectorAll('button').find(b=>b.getAttribute('onclick')===`L.go('groupMoneyDetail',{id:'${g.id}'})`);assert(link);link.click();f.h.flushHistory();f.h.flush();assert.equal(f.L.route,'groupMoneyDetail');assert.equal(f.L.params.id,g.id);assert.equal(f.L.state.closed,undefined);assert.equal(JSON.stringify(g),record);assert.equal(personal(f),before);clean(f);
});

test('a stale mounted closure form and later provider confirmation both recheck new collection obligations',()=>{
 const acceptNative=f=>{const button=closureAction(f,'L.acceptNativeDecision()');assert(button,'The existing native confirmation is mounted');button.click();f.h.flushHistory();f.h.flush();};
 const f=fixture({testing:true});closureReady(f);openClosure(f);const stale=closureAction(f,'L.acct.submitClosure()'),g=collection(f),p=approve(f,g,propose(f,g));assert(release(f,g,p).ok);const before=JSON.stringify(g);
 stale.click();f.h.flushHistory();f.h.flush();assert.equal(f.L.state.closure,undefined);assert.equal(f.L.route,'closeAccount','A new blocker stops the stale initial request before native confirmation');assert.equal(f.L.nativeDecisionContext(),null);assert.equal(f.L.state.closed,undefined);
 assert.equal(f.L.acct.blockers().filter(b=>b.id===g.id).length,1);assert.equal(f.L.acct.blockers().find(b=>b.id===g.id).route,'groupMoneyPayments');assert.equal(JSON.stringify(g),before);
 const second=fixture({testing:true});closureReady(second);openClosure(second);closureAction(second,'L.acct.submitClosure()').click();second.h.flushHistory();second.h.flush();assert.equal(second.L.route,'actionConfirm');acceptNative(second);assert.equal(second.L.state.closure.status,'Closing');
 second.L.acct.confirmClosure();second.h.flushHistory();second.h.flush();assert.equal(second.L.route,'actionConfirm','Provider closure still uses its native confirmation');
 const pot=collection(second),request=approve(second,pot,propose(second,pot));assert(release(second,pot,request).ok);acceptNative(second);assert.equal(second.L.state.closure.status,'Closing');assert.equal(second.L.state.closed,undefined);assert.equal(state(second,pot,request).status,'processing');
 assert(settle(second,pot,request,'Failed').ok);assert.equal(second.L.acct.blockers().find(b=>b.id===pot.id).route,'groupMoneyDetail');assert(second.G.cancel(pot.id).ok);assert(second.G.refund(pot.id).ok);assert.equal(second.L.acct.blockers().length,0);second.L.acct.confirmClosure();second.h.flushHistory();second.h.flush();acceptNative(second);assert.equal(second.L.state.closed,true);assert.equal(second.L.state.closure.status,'Closed');clean(f);clean(second);
});

test('historical organiser obligations remain blockers when the mandate is invalid while invited contributors do not inherit them',()=>{
 const f=fixture({testing:true});closureReady(f);const g=collection(f);g.mandateFingerprint='changed';assert.equal(f.G.access(g).canExecute,false);assert(f.L.acct.blockers().some(b=>b.route==='groupMoneyDetail'&&b.id===g.id));f.L.state.locked=true;assert(f.L.acct.blockers().some(b=>b.route==='groupMoneyDetail'&&b.id===g.id),'A lock cannot erase historical collection ownership or its closure blocker');f.L.state.locked=false;
 const outsider=fixture({testing:true});closureReady(outsider);const invitation=outsider.G.createSampleInvitation({scenario:'contributor',idempotencyKey:'closure-contributor'});assert(invitation.ok,invitation.error);const read=outsider.G.invitationSummary(invitation.invitation.id),joined=outsider.G.acceptInvitation({invitationId:read.id,version:read.mandate.version,fingerprint:read.fingerprint});assert(joined.ok,joined.error);assert.equal(outsider.G.access(joined.item).isOrganiser,false);assert.equal(outsider.G.summary(joined.item).balanceCents,60000);assert.equal(outsider.L.acct.blockers().filter(b=>b.id===joined.item.id).length,0);clean(f);clean(outsider);
});


test('account closure checks do not create or normalise group-money state while reading unrelated account obligations',()=>{
 const f=fixture();f.L.acct.blockers();delete f.L.state.groupMoney;let before=JSON.stringify(f.L.state);
 for(let i=0;i<3;i++)f.L.acct.blockers();assert.equal(JSON.stringify(f.L.state),before);assert.equal(Object.prototype.hasOwnProperty.call(f.L.state,'groupMoney'),false);
 f.L.state.groupMoney={version:1,items:[]};before=JSON.stringify(f.L.state);f.L.acct.blockers();assert.equal(JSON.stringify(f.L.state),before,'An empty historical store gains no contacts or template arrays');
 const g=collection(f);delete f.L.state.groupMoney.templates;delete f.L.state.groupMoney.contacts;delete f.L.state.groupMoney.invitations;before=JSON.stringify(f.L.state);assert(f.L.acct.blockers().some(b=>b.id===g.id));assert.equal(JSON.stringify(f.L.state),before,'Reading an owned balance does not invoke the normalising group list');clean(f);
});
