/* Durable rail-payout lifecycle: requester auth precedes group decisions. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
function fixture(){
 const h=createHarness({clock:true,deferHistory:true,testing:true}),L=h.L;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:0,txs:[],requests:[],paymentDraft:null,essentials:[],goals:[],groupMoney:undefined});L.route='home';L.params={};L.history=[];L.save();h.flushHistory();h.flush();
 const G=L.groupMoney,r=G.createCollection({title:'Class dinner',target:'2000',deadline:new h.context.Date(h.context.Date.now()+14*86400000).toISOString().slice(0,10),members:[{id:'self',name:'You',isOwner:true},{id:'abena',name:'Abena'},{id:'kojo',name:'Kojo'}],mandateApproval:'named',mandateApproverIds:['self','abena','kojo'],mandateRequiredApprovals:2,acceptMandate:true,idempotencyKey:'lifecycle-pot'});assert(r.ok,r.error);
 for(const id of ['abena','kojo'])assert(G.acceptMandate({itemId:r.item.id,personId:id,version:r.item.mandate.version,sample:true}).ok);
 assert(G.recordSamplePayment({itemId:r.item.id,personId:'abena',amount:'600',reference:'initial-fund'}).ok);
 return {h,L,G,id:r.item.id};
}
function draft(f,changes={}){const d={id:f.L.id('RP'),collectionPayout:true,collectionId:f.id,method:'bank',name:'Kwesi Osei',destination:'102345678901',provider:'GCB Bank',checked:true,amount:150,fee:1,note:'Dinner deposit',essentialId:'',...changes};f.L.state.paymentDraft=d;return d;}
function review(f,d){f.L.route='paymentReview';const r=f.G.prepareRailPayout(d);assert(r.ok,r.error);return r.quote;}
function authorise(f,d,q=review(f,d),changes={}){f.L.route='authorize';return f.G.authorizeRailPayout({draft:d,reviewToken:q.token,pin:'123456',...changes});}
function request(f){const d=draft(f),r=authorise(f,d);assert(r.ok,r.error);return r.proposal;}
function vote(f,p,personId){return f.G.approveProposal({itemId:f.id,proposalId:p.id,personId,version:p.mandateVersion,fingerprint:p.fingerprint,sample:personId!=='self'});}
function ready(f){const p=request(f);assert(vote(f,p,'self').ok);assert(vote(f,p,'abena').ok);return p;}
const status=(f,p)=>f.G.proposalSummary(f.id,p.id);
function result(f,p,outcome){const s=status(f,p);return f.G.settleSamplePayout({itemId:f.id,proposalId:p.id,reference:s.reference,attemptId:s.attemptId,outcome,sample:true});}
const clean=f=>assert.deepEqual(f.h.errors,[]);

test('five wrong PINs lock the profile without creating a request or reserving pot funds',()=>{
 const f=fixture(),d=draft(f),q=review(f,d);for(let i=0;i<5;i++){const r=authorise(f,d,q,{pin:'000000'});assert.equal(r.ok,false);assert.equal(!!r.locked,i===4);}
 assert.equal(f.L.state.locked,true);assert.equal(f.L.state.groupMoney.items[0].proposals.length,0);assert.equal(f.L.state.txs.length,0);assert.equal(f.L.state.balance,0);clean(f);
});

test('personal exports, earlier releases and rail requests share one persisted account cooldown',()=>{
 const f=fixture(),{L,G,h}=f;
 const made=G.createProposal({itemId:f.id,recipient:'Earlier supplier',purpose:'Earlier release',amount:'100',idempotencyKey:'legacy-common-policy'});assert(made.ok,made.error);const p=made.proposal;
 assert(vote(f,p,'self').ok);assert(vote(f,p,'abena').ok);const legacy=G.preparePayout({itemId:f.id,proposalId:p.id});assert(legacy.ok,legacy.error);
 const d=draft(f),q=review(f,d),groupBefore=JSON.stringify(L.state.groupMoney);L.download=()=>assert.fail('A wrong PIN cannot export private records');
 for(let i=0;i<2;i++){L.go('dataExport');h.flushHistory();h.flush();h.set('authPin','000000');L.acct.downloadData();assert.equal(L.authPolicy.status().failures,i+1);}
 const earlier=G.executeSampleProposal({itemId:f.id,proposalId:p.id,reviewToken:legacy.quote.token,pin:'000000',outcome:'Pending'});assert.equal(earlier.ok,false);assert.equal(L.authPolicy.status().failures,3);
 assert.equal(authorise(f,d,q,{pin:'000000'}).ok,false);assert.equal(L.authPolicy.status().failures,4);
 L.go('dataExport');h.flushHistory();h.flush();h.set('authPin','000000');L.acct.downloadData();h.flushHistory();h.flush();assert.equal(L.state.locked,true);assert.equal(L.route,'signin');assert.equal(L.authPolicy.status().failures,5);assert.equal(L.authPolicy.status().seconds,60);assert.equal(JSON.stringify(L.state.groupMoney),groupBefore);assert.equal(L.state.txs.length,0);
 const [key,raw]=[...h.store.entries()][0],saved=JSON.parse(raw);assert.equal(saved.credentialPolicy.failures,5);assert(saved.credentialPolicy.blockedUntil>h.context.Date.now());assert.equal(saved.collectionPayoutAuthFailures,undefined);
 const restored=createHarness({clock:true,testing:true,deferHistory:true});restored.store.set(key,raw);assert(restored.L.persistence.reloadLatest());restored.L.go('signin');restored.flushHistory();restored.flush();assert.equal(restored.L.state.locked,true);assert(restored.L.authPolicy.status().seconds>0);
 restored.set('signPhone',restored.L.state.profile.phone);restored.set('signPin','123456');restored.L.onboarding.signin();assert.equal(restored.L.state.locked,true);restored.advance(60000);restored.set('signPin','123456');restored.L.onboarding.signin();restored.flushHistory();restored.flush();assert.equal(restored.L.state.locked,false);assert.equal(restored.L.authPolicy.status().failures,0);assert.equal(JSON.stringify(restored.L.state.groupMoney),groupBefore);assert.deepEqual(restored.errors,[]);clean(f);
});

test('both group owner-PIN paths reject malformed PINs without consuming a valid-guess attempt',()=>{
 const f=fixture(),p=f.G.createProposal({itemId:f.id,recipient:'Earlier supplier',purpose:'Earlier release',amount:'100',idempotencyKey:'malformed-legacy'}).proposal;assert(vote(f,p,'self').ok);assert(vote(f,p,'abena').ok);
 const old=f.G.preparePayout({itemId:f.id,proposalId:p.id});assert(old.ok);assert.equal(f.G.executeSampleProposal({itemId:f.id,proposalId:p.id,reviewToken:old.quote.token,pin:'wrong',outcome:'Pending'}).ok,false);
 const d=draft(f),q=review(f,d);assert.equal(authorise(f,d,q,{pin:'123'}).ok,false);assert.equal(f.L.authPolicy.status().failures,0);assert.equal(f.L.state.locked,false);assert.equal(f.G.get(f.id).disbursements.length,0);clean(f);
});

test('group PIN attempt and approval changes roll back together when durable storage fails',()=>{
 for(const path of ['legacy','rail'])for(const pin of ['000000','123456']){
  const f=fixture();let run;
  if(path==='legacy'){
   const created=f.G.createProposal({itemId:f.id,recipient:'Earlier supplier',purpose:'Earlier release',amount:'100',idempotencyKey:'quota-legacy'});assert(created.ok);const p=created.proposal;assert(vote(f,p,'self').ok);assert(vote(f,p,'abena').ok);const q=f.G.preparePayout({itemId:f.id,proposalId:p.id});assert(q.ok);run=()=>f.G.executeSampleProposal({itemId:f.id,proposalId:p.id,reviewToken:q.quote.token,pin,outcome:'Pending'});
  }else{const d=draft(f),q=review(f,d);run=()=>authorise(f,d,q,{pin});}
  const before=JSON.stringify(f.L.state),stored=[...f.h.store.entries()],save=f.h.context.localStorage.setItem;f.h.context.localStorage.setItem=()=>{throw Error('Quota');};const r=run();assert.equal(r.ok,false,path+' '+pin);assert.equal(r.needsReview,true);assert.equal(JSON.stringify(f.L.state),before);assert.deepEqual([...f.h.store.entries()],stored);assert.equal(f.L.authPolicy.status().failures,0);assert.equal(f.G.get(f.id).disbursements.length,0);assert.equal(f.L.state.txs.length,0);f.h.context.localStorage.setItem=save;assert(f.L.persistence.retrySave());clean(f);
 }
});

test('failed payout retries only its approved rail and uses a fresh authorisation and attempt',()=>{
 const f=fixture(),p=ready(f),initial=status(f,p),reference=initial.reference,firstAttempt=initial.attemptId;assert(result(f,p,'Failed').ok);assert.equal(status(f,p).canRetry,true);
 const changed=draft(f,{collectionProposalId:p.id,amount:151});assert.equal(f.G.prepareRailPayout(changed).ok,false);
 const d=draft(f,{collectionProposalId:p.id}),q=review(f,d);assert.equal(authorise(f,d,q,{pin:'000000'}).ok,false);assert.equal(status(f,p).status,'failed');
 assert(authorise(f,d,q).ok);assert.equal(status(f,p).status,'processing');assert.equal(status(f,p).reference,reference);assert.notEqual(status(f,p).attemptId,firstAttempt);assert.equal(f.G.get(f.id).disbursements.length,1);assert.equal(f.G.get(f.id).disbursements[0].attempts.length,2);
 assert.equal(f.G.settleSamplePayout({itemId:f.id,proposalId:p.id,reference,attemptId:firstAttempt,outcome:'Completed',sample:true}).ok,false);assert.equal(status(f,p).status,'processing');assert(result(f,p,'Completed').ok);assert.equal(f.G.summary(f.id).balanceCents,44900);clean(f);
});

test('paid rail receipt freezes destination, fee and requester authorisation across later funding',()=>{
 const f=fixture(),p=ready(f);assert(result(f,p,'Completed').ok);const r=status(f,p).receipt,snapshot=JSON.stringify(r);
 assert.equal(r.rail.method,'bank');assert.equal(r.rail.destination,'102345678901');assert.equal(r.rail.provider,'GCB Bank');assert.equal(r.feeCents,100);assert.equal(r.requesterAuthorisation.method,'pin');assert.equal(r.balanceAfterCents,44900);
 assert(!snapshot.includes('123456'));assert(!snapshot.includes('reviewToken'));assert(!snapshot.includes('token'));assert.equal(r.approvers.filter(a=>a.decision==='approved').length,2);
 assert(f.G.recordSamplePayment({itemId:f.id,personId:'kojo',amount:'25',reference:'later-contribution'}).ok);assert.equal(JSON.stringify(status(f,p).receipt),snapshot);assert.equal(f.L.state.balance,0);assert.equal(f.L.state.txs.length,0);clean(f);
});

test('credential changes invalidate a current payout review without invoking a PIN getter',()=>{
 const f=fixture(),d=draft(f),q=review(f,d);f.L.state.profile.pin='654321';assert.equal(f.G.railPayoutCurrent(d,q.token),false);assert.equal(authorise(f,d,q,{pin:'654321'}).needsReview,true);
 let reads=0;Object.defineProperty(f.L.state.profile,'pin',{get(){reads++;return '654321';},enumerable:false,configurable:true});const next=review(f,d);assert.equal(f.G.railPayoutCurrent(d,next.token),true);assert.equal(reads,0);clean(f);
});

test('quota failure during withdrawal preserves the pending request and its reservation',()=>{
 const f=fixture(),p=request(f),before=JSON.stringify(f.G.get(f.id)),save=f.h.context.localStorage.setItem;f.h.context.localStorage.setItem=()=>{throw Error('Quota');};
 const r=f.G.cancelProposal({itemId:f.id,proposalId:p.id,fingerprint:p.fingerprint});assert.equal(r.ok,false);assert.equal(JSON.stringify(f.G.get(f.id)),before);assert.equal(f.G.summary(f.id).reservedCents,15100);f.h.context.localStorage.setItem=save;clean(f);
});

test('quota failure during provider settlement leaves the processing reference and hold intact',()=>{
 const f=fixture(),p=ready(f),before=JSON.stringify(f.G.get(f.id)),save=f.h.context.localStorage.setItem;f.h.context.localStorage.setItem=()=>{throw Error('Quota');};
 assert.equal(result(f,p,'Completed').ok,false);assert.equal(JSON.stringify(f.G.get(f.id)),before);assert.equal(status(f,p).status,'processing');assert.equal(f.G.summary(f.id).reservedCents,15100);assert.equal(f.G.summary(f.id).balanceCents,60000);
 f.h.context.localStorage.setItem=save;assert.equal(f.L.persistence.status().saveFailed,true);assert(f.L.persistence.retrySave());assert(result(f,p,'Completed').ok);assert.equal(f.G.summary(f.id).spentCents,15100);clean(f);
});

test('a changed submitted route, total or stable reference cannot settle or start a retry',()=>{
 for(const change of [d=>{d.destination='102345678902';},d=>{d.provider='Ecobank';},d=>{d.totalCents=1;},d=>{d.reference='changed-reference';},d=>{d.attemptId='another-attempt';}]){
  const f=fixture(),p=ready(f),d=f.G.get(f.id).disbursements[0];change(d);assert.equal(result(f,p,'Completed').ok,false);assert.equal(f.G.summary(f.id).spentCents,0);assert.equal(f.G.get(f.id).disbursements[0].status,'processing');clean(f);
 }
});
