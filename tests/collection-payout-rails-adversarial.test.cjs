/* Independent adversarial checks of pot-backed, authorised rail payouts. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const settle=f=>{f.h.flushHistory();f.h.flush();};
function fixture({personal=600,fund='600',approval='named',required=2}={}){
 const h=createHarness({clock:true,deferHistory:true,testing:true}),L=h.L;
 L.explore();L.ensureAccounts();Object.assign(L.state,{balance:personal,txs:[],requests:[],paymentDraft:null,essentials:[],goals:[],groupMoney:undefined});L.route='home';L.params={};L.history=[];L.save();
 const f={h,L,G:L.groupMoney};settle(f);
 const r=f.G.createCollection({title:'Class trip',target:'2000',deadline:new h.context.Date(h.context.Date.now()+14*86400000).toISOString().slice(0,10),members:[{id:'self',name:'You',isOwner:true},{id:'abena',name:'Abena'},{id:'kojo',name:'Kojo'},{id:'esi',name:'Esi'}],mandateApproval:approval,...(approval==='named'?{mandateApproverIds:['self','abena','kojo'],mandateRequiredApprovals:required}:{}),acceptMandate:true,idempotencyKey:'adversarial-pot'});
 assert(r.ok,r.error);f.g=r.item;
 for(const member of f.g.people.filter(p=>p.id!=='self'))assert(f.G.acceptMandate({itemId:f.g.id,personId:member.id,version:f.g.mandate.version,sample:true}).ok);
 if(Number(fund)>0)assert(f.G.recordSamplePayment({itemId:f.g.id,personId:'abena',amount:fund,reference:'adversarial-initial-fund'}).ok);
 return f;
}
function draft(f,{rail='bank',amount=150,...changes}={}){
 const details=rail==='bank'?{name:'Kwesi Osei',destination:'102345678901',provider:'GCB Bank'}:rail==='momo'?{name:'Abena Asante',destination:'0241234567',provider:'MTN MoMo'}:{name:'Abena Asante',destination:'@abena.a',recipient:'abena'};
 const d={id:f.L.id('ADVPAY'),method:rail,collectionPayout:true,collectionId:f.g.id,amount,fee:f.L.paymentFee(rail,amount),note:'Minibus deposit',essentialId:'',checked:true,pinAttempts:0,...details,...changes};
 f.L.state.paymentDraft=d;return d;
}
function review(f,d=f.L.state.paymentDraft){f.L.route='paymentReview';f.L.params={};const result=f.G.prepareRailPayout(d);assert(result.ok,result.error);return result.quote;}
function authorize(f,d=f.L.state.paymentDraft,q=review(f,d),changes={}){f.L.route='authorize';return f.G.authorizeRailPayout({draft:d,reviewToken:q.token,pin:'123456',...changes});}
function request(f,changes={}){const d=draft(f,changes),q=review(f,d),r=authorize(f,d,q);assert(r.ok,r.error);return r.proposal;}
function vote(f,p,personId='self',decline=false,changes={}){return f.G[decline?'declineProposal':'approveProposal']({itemId:f.g.id,proposalId:p.id,personId,version:p.mandateVersion,fingerprint:p.fingerprint,...(personId==='self'?{}:{sample:true}),...changes});}
const state=(f,p)=>f.G.proposalSummary(f.g.id,p.id);
const own=f=>JSON.stringify({balance:f.L.state.balance,accounts:f.L.state.accounts,txs:f.L.state.txs,goals:f.L.state.goals,essentials:f.L.state.essentials,requests:f.L.state.requests});
const clean=f=>assert.deepEqual(f.h.errors,[]);
function confirm(f,p,outcome='Completed') {const s=state(f,p);return f.G.settleSamplePayout({itemId:f.g.id,proposalId:p.id,reference:s.reference,attemptId:s.attemptId,outcome,sample:true});}

test('all three rails keep exact recipient and fee, with authorisation separate from approval',()=>{
 for(const [rail,fee]of [['lumo',0],['momo',50],['bank',100]]){
  const f=fixture(),before=own(f),p=request(f,{rail});
  assert.equal(p.feeCents,fee);assert.equal(p.totalCents,15000+fee);assert.equal(p.rail.method,rail);
  assert.equal(state(f,p).approvalCount,0,'PIN authorisation is not an implicit approval vote');assert.equal(state(f,p).status,'pending');
  assert.equal(f.G.get(f.g.id).disbursements.length,0);assert.equal(f.G.summary(f.g).balanceCents,60000);assert.equal(f.G.summary(f.g).reservedCents,15000+fee);assert.equal(own(f),before);clean(f);
 }
});

test('a funded collection works with no personal funds and never changes the personal ledger',()=>{
 const f=fixture({personal:0}),before=own(f),p=request(f);
 assert(vote(f,p).ok);assert.equal(state(f,p).status,'pending');assert.equal(f.G.get(f.g.id).disbursements.length,0);assert.equal(own(f),before);
 assert(vote(f,p,'abena').ok);assert.equal(state(f,p).status,'processing');assert.equal(f.G.summary(f.g).balanceCents,60000);assert.equal(f.G.summary(f.g).reservedCents,15100);assert.equal(own(f),before);
 assert(confirm(f,p).ok);assert.equal(f.G.summary(f.g).balanceCents,44900);assert.equal(own(f),before);clean(f);
});

test('abundant personal money cannot fund an empty pot or cover a missing rail fee',()=>{
 for(const fund of ['0','150']){const f=fixture({personal:10000,fund}),d=draft(f);f.L.route='paymentReview';const before=JSON.stringify(f.G.get(f.g.id)),r=f.G.prepareRailPayout(d);assert.equal(r.ok,false);assert.equal(JSON.stringify(f.G.get(f.g.id)),before);assert.equal(f.L.state.balance,10000);assert.equal(f.L.state.txs.length,0);clean(f);}
});

test('every exact destination field and changed mandate/pot facts invalidate the review token',()=>{
 const mutations=[
  (f,d)=>{d.destination='102345678902';},(f,d)=>{d.provider='Ecobank';},(f,d)=>{d.name='Someone else';},(f,d)=>{d.method='momo';},(f,d)=>{d.amount=151;},(f,d)=>{d.fee=0;},(f,d)=>{d.note='A different purpose';},
  (f,d)=>{f.G.get(f.g.id).mandateFingerprint='changed';},
  (f,d)=>{assert(f.G.recordSamplePayment({itemId:f.g.id,personId:'kojo',amount:'1',reference:'changed-funding'}).ok);},
  (f,d)=>{f.L.state={...f.L.state,profile:{...f.L.state.profile}};}
 ];
 for(const mutate of mutations){const f=fixture(),d=draft(f),q=review(f,d);mutate(f,d);const before=own(f);assert.equal(authorize(f,d,q).ok,false);assert.equal(f.G.get(f.g.id)?.proposals.length||0,0);assert.equal(own(f),before);clean(f);}
});

test('wrong PIN cannot create an instruction or reserve pot funds',()=>{
 const f=fixture(),d=draft(f),q=review(f,d),before=own(f);
 assert.equal(authorize(f,d,q,{pin:'000000'}).ok,false);assert.equal(f.G.get(f.g.id).proposals.length,0);assert.equal(f.G.summary(f.g).reservedCents,0);assert.equal(own(f),before);
 assert(authorize(f,d,q).ok);assert.equal(f.G.get(f.g.id).proposals.length,1);clean(f);
});

test('a review token is draft-specific, expires, and cannot survive state reload',()=>{
 for(const mutate of [(f,d)=>{f.L.state.paymentDraft={...d,id:'different'};},(f,d)=>{f.h.advance(5*60*1000);},(f,d)=>{f.L.state=JSON.parse(JSON.stringify(f.L.state));}]){
  const f=fixture(),d=draft(f),q=review(f,d);mutate(f,d);assert.equal(authorize(f,f.L.state.paymentDraft,q).ok,false);assert.equal(f.G.get(f.g.id).proposals.length,0);assert.equal(f.G.summary(f.g).reservedCents,0);clean(f);
 }
});

test('unanimous mandates wait for the last member while majority mandates use their accepted threshold',()=>{
 for(const [approval,threshold]of [['everyone',4],['majority',3],['named',2]]){
  const f=fixture({approval}),p=request(f);assert.equal(p.requiredApprovals,threshold);
  const ids=['self','abena','kojo','esi'];for(let i=0;i<threshold;i++){assert(vote(f,p,ids[i]).ok);assert.equal(state(f,p).status,i+1===threshold?'processing':'pending');assert.equal(f.G.get(f.g.id).disbursements.length,i+1===threshold?1:0);}
  assert.equal(f.G.summary(f.g).spentCents,0);clean(f);
 }
});

test('repeated final approvals and repeated provider confirmation cannot dispatch or debit twice',()=>{
 const f=fixture(),p=request(f);assert(vote(f,p).ok);assert(vote(f,p,'abena').ok);const once=JSON.stringify(f.G.get(f.g.id));
 for(let i=0;i<3;i++)assert(vote(f,p,'abena').idempotent);assert.equal(JSON.stringify(f.G.get(f.g.id)),once);assert.equal(f.G.get(f.g.id).disbursements[0].attempts.length,1);
 assert(confirm(f,p).ok);const paid=JSON.stringify(f.G.get(f.g.id));assert(confirm(f,p).idempotent);assert.equal(JSON.stringify(f.G.get(f.g.id)),paid);assert.equal(f.G.summary(f.g).spentCents,15100);clean(f);
});

test('expired approval windows cannot trigger payment, and release only their reservation',()=>{
 const f=fixture(),p=request(f);assert(vote(f,p).ok);f.h.advance(48*60*60*1000);assert.equal(state(f,p).status,'expired');assert.equal(vote(f,p,'abena').ok,false);assert.equal(f.G.get(f.g.id).disbursements.length,0);assert.equal(f.G.summary(f.g).balanceCents,60000);assert.equal(f.G.summary(f.g).reservedCents,0);clean(f);
});

test('a persisted authorised instruction still waits for approvals after reload',()=>{
 const f=fixture(),p=request(f);assert(vote(f,p).ok);const pId=p.id,groupId=f.g.id;f.L.state=JSON.parse(JSON.stringify(f.L.state));f.g=f.G.get(groupId);const restored=f.G.proposal(groupId,pId);
 assert.equal(state(f,restored).status,'pending');assert.equal(f.g.disbursements.length,0);assert(vote(f,restored,'abena').ok);assert.equal(state(f,restored).status,'processing');assert.equal(f.G.summary(f.g).spentCents,0);assert.equal(f.L.state.txs.length,0);clean(f);
});

test('request persistence failure rolls back the instruction and invalidates its auth review',()=>{
 const f=fixture(),d=draft(f),q=review(f,d),before=JSON.stringify(f.L.state),save=f.h.context.localStorage.setItem;f.h.context.localStorage.setItem=()=>{throw Error('Quota exceeded');};
 const result=authorize(f,d,q);assert.equal(result.ok,false);assert.equal(JSON.stringify(f.L.state),before);assert.equal(f.G.get(f.g.id).proposals.length,0);
 f.h.context.localStorage.setItem=save;assert.equal(authorize(f,f.L.state.paymentDraft,q).ok,false);clean(f);
});

test('last approval and automatic dispatch roll back together when durable save fails',()=>{
 const f=fixture(),p=request(f);assert(vote(f,p).ok);const before=JSON.stringify(f.L.state),save=f.h.context.localStorage.setItem;f.h.context.localStorage.setItem=()=>{throw Error('Quota exceeded');};
 const result=vote(f,p,'abena');assert.equal(result.ok,false);assert.equal(JSON.stringify(f.L.state),before);const restored=f.G.proposal(f.g.id,p.id);assert.equal(state(f,restored).approvalCount,1);assert.equal(state(f,restored).status,'pending');assert.equal(f.G.get(f.g.id).disbursements.length,0);
 f.h.context.localStorage.setItem=save;assert.equal(f.L.persistence.status().saveFailed,true);assert(f.L.persistence.retrySave());assert(vote(f,restored,'abena').ok);assert.equal(state(f,restored).status,'processing');assert.equal(f.G.get(f.g.id).disbursements.length,1);clean(f);
});

test('an error inside automatic submission cannot commit the final vote or a partial payout record',()=>{
 const f=fixture(),p=request(f);assert(vote(f,p).ok);const before=JSON.stringify(f.L.state),id=f.L.id;f.L.id=prefix=>{if(prefix==='GD')throw Error('Submission could not start');return id(prefix);};const r=vote(f,p,'abena');assert.equal(r.ok,false);assert.equal(JSON.stringify(f.L.state),before);assert.equal(state(f,p).approvalCount,1);assert.equal(f.G.get(f.g.id).disbursements.length,0);f.L.id=id;const restored=f.G.proposal(f.g.id,p.id);assert(vote(f,restored,'abena').ok);assert.equal(state(f,restored).status,'processing');clean(f);
});

test('the requester can decline without vetoing an accepted any-two-of-three mandate',()=>{
 const f=fixture(),p=request(f);assert(vote(f,p,'self',true).ok);assert.equal(state(f,p).status,'pending');assert(vote(f,p,'abena').ok);assert.equal(state(f,p).status,'pending');assert(vote(f,p,'kojo').ok);assert.equal(state(f,p).status,'processing');assert.equal(f.G.get(f.g.id).disbursements.length,1);assert.equal(state(f,p).declineCount,1);clean(f);
});

test('too many declines close the request without submission or pot debit',()=>{
 const f=fixture(),p=request(f),before=own(f);assert(vote(f,p,'abena',true).ok);assert(vote(f,p,'kojo',true).ok);assert.equal(state(f,p).status,'declined');assert.equal(f.G.get(f.g.id).disbursements.length,0);assert.equal(f.G.summary(f.g).reservedCents,0);assert.equal(f.G.summary(f.g).balanceCents,60000);assert.equal(own(f),before);clean(f);
});

test('older requests never inherit automatic submission without a requester-authorised rail',()=>{
 const f=fixture(),r=f.G.createProposal({itemId:f.g.id,recipient:'Ama Transport',purpose:'Earlier minibus request',amount:'150',idempotencyKey:'legacy-request'});assert(r.ok,r.error);const p=r.proposal;
 assert(vote(f,p).ok);assert(vote(f,p,'abena').ok);assert.equal(state(f,p).status,'ready');assert.equal(state(f,p).availableToExecute,true);assert.equal(f.G.get(f.g.id).disbursements.length,0);assert.equal(f.G.summary(f.g).balanceCents,60000);clean(f);
});

test('rail-backed requests cannot bypass approvals through the legacy release executor',()=>{
 const f=fixture(),p=request(f),before=JSON.stringify(f.G.get(f.g.id));assert.equal(f.G.preparePayout({itemId:f.g.id,proposalId:p.id}).ok,false);assert.equal(f.G.executeSampleProposal({itemId:f.g.id,proposalId:p.id,pin:'123456',outcome:'Completed'}).ok,false);assert.equal(JSON.stringify(f.G.get(f.g.id)),before);assert.equal(f.L.state.txs.length,0);clean(f);
});

test('changed approved rail details cannot receive a final vote or be dispatched',()=>{
 for(const mutate of [p=>{p.rail.destination='102345678902';},p=>{p.rail.provider='Ecobank';},p=>{p.feeCents=0;p.totalCents=p.amountCents;},p=>{p.requesterAuthorisation.personId='abena';}]){
  const f=fixture(),p=request(f);assert(vote(f,p).ok);mutate(p);assert.equal(state(f,p).valid,false);assert.equal(vote(f,p,'abena').ok,false);assert.equal(f.G.get(f.g.id).disbursements.length,0);assert.equal(f.G.summary(f.g).spentCents,0);clean(f);
 }
});

test('backgrounding or hiding an open PIN task retires its payout review and clears entered PIN',()=>{
 for(const event of ['visibilitychange','pagehide','blur']){
  const f=fixture(),d=draft(f);f.L.go('paymentReview');settle(f);f.L.continuePayment();settle(f);assert.equal(f.L.route,'authorize');assert.equal(f.L.paymentAuthorizationCurrent(d),true);const pin=f.h.set('payment-pin','123456');
  if(event==='visibilitychange'){f.h.document.hidden=true;f.h.document.dispatchEvent(new f.h.Event('visibilitychange'));}else f.h.emit(event);
  assert.equal(pin.value,'');assert.equal(f.L.paymentAuthorizationCurrent(d),false);f.h.document.hidden=false;if(event==='pagehide')f.h.emit('pageshow');f.L.authorizePayment();settle(f);assert.equal(f.G.get(f.g.id).proposals.length,0);assert.equal(f.L.route,'paymentReview');
  f.L.continuePayment();settle(f);f.h.set('payment-pin','123456');f.L.authorizePayment();settle(f);assert.equal(f.G.get(f.g.id).proposals.length,1);assert.equal(f.G.get(f.g.id).disbursements.length,0);clean(f);
 }
});
