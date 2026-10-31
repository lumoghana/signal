/* Shared collection mandates against the shipped app. All external member
   actions and payments here are explicit same-device simulations. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const index=fs.readFileSync(path.resolve(__dirname,'../dist/index.html'),'utf8');
const modules=[...index.matchAll(/<script\b[^>]*\bsrc="\/([^"?]+)(?:\?[^" ]*)?"/g)].map(m=>m[1]);
const storageKey=fs.readFileSync(path.resolve(__dirname,'../dist/core.js'),'utf8').match(/\bconst key=['"]([^'"]+)['"]/)[1];
let passed=0;
const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
const clone=x=>JSON.parse(JSON.stringify(x));
const people=()=>[{id:'self',name:'You',isOwner:true},{id:'abena',name:'Abena'},{id:'kojo',name:'Kojo'}];
function fixture(){
 const h=createHarness({clock:true,testing:false,modules}),{L}=h;L.explore();L.ensureAccounts?.();
 Object.assign(L.state,{balance:600,txs:[],requests:[],paymentDraft:null,essentials:[],goals:[],groupMoney:undefined});
 L.route='home';L.params={};L.history=[];L.save();h.flush();return {h,L,G:L.groupMoney};
}
const future=f=>new f.h.context.Date(f.h.context.Date.now()+86400000).toISOString().slice(0,10);
const input=(f,changes={})=>({title:'Cape Coast trip',target:'600',deadline:future(f),members:people(),mandateApproval:'majority',acceptMandate:true,idempotencyKey:'collection-once',...changes});
const create=(f,changes={})=>{const r=f.G.createCollection(input(f,changes));assert(r.ok,r.error);return r.item;};
const personal=f=>JSON.stringify({balance:f.L.state.balance,accounts:f.L.state.accounts,txs:f.L.state.txs,requests:f.L.state.requests,goals:f.L.state.goals,essentials:f.L.state.essentials,paymentDraft:f.L.state.paymentDraft});
const accepted=(f,g)=>{for(const p of g.people.filter(p=>!p.isOwner)){const r=f.G.acceptMandate({itemId:g.id,personId:p.id,version:g.mandate.version,sample:true});assert(r.ok,r.error);}return g;};
const receive=(f,g,personId,amount,reference)=>f.G.recordSamplePayment({itemId:g.id,personId,amount,reference});
const funded=(f,changes={})=>{const g=accepted(f,create(f,changes));assert(receive(f,g,'abena',changes.target||'600','funding-1').ok);return g;};
const propose=(f,g,changes={})=>{const r=f.G.createProposal({itemId:g.id,recipient:'Trip bus company',purpose:'Bus booking for our trip',amount:'450',idempotencyKey:'proposal-once',...changes});assert(r.ok,r.error);return r.proposal;};
const vote=(f,g,p,personId='self')=>f.G.approveProposal({itemId:g.id,proposalId:p.id,personId,version:g.mandate.version,...(personId!=='self'?{sample:true}:{})});
const approved=(f,g,p)=>{for(const member of g.people.slice(0,g.mandate.requiredApprovals))assert(vote(f,g,p,member.id).ok);return p;};
const execute=(f,g,p)=>{const q=f.G.preparePayout({itemId:g.id,proposalId:p.id});if(!q.ok)return f.G.proposalSummary(g.id,p.id)?.paid?f.G.executeSampleProposal({itemId:g.id,proposalId:p.id}):q;return f.G.executeSampleProposal({itemId:g.id,proposalId:p.id,reviewToken:q.quote.token,pin:f.L.state.profile.pin,outcome:'Completed'});};
const clean=f=>assert.deepEqual(f.h.errors,[],'No shipped rendering fallback');
const visible=f=>f.h.document.getElementById('view').textContent;
const click=(f,label)=>{const b=f.h.document.querySelectorAll('button').find(b=>b.textContent.trim()===label);assert(b,'Actual button '+label+' exists');b.click();f.h.flush();};

check('creation requires explicit mandate acceptance and deterministically defines equal-member approvals',()=>{
 const f=fixture(),before=personal(f),preview=f.G.previewCollection(input(f,{acceptMandate:false}));assert(preview.ok,preview.error);
 assert.equal(f.G.list().length,0);assert.equal(f.G.createCollection(input(f,{acceptMandate:false})).ok,false);
 const g=create(f);assert.equal(g.collectionAccount.kind,'group-collection');assert.equal(g.collectionAccount.demo,true);assert.match(g.collectionAccount.reference,/sample/i);
 assert.equal(g.mandate.requiredApprovals,2);assert.equal(g.mandate.memberIds.length,3);assert.equal(g.mandate.version,1);
 const m=f.G.mandateSummary(g);assert.equal(m.acceptedCount,1);assert.equal(m.allAccepted,false);assert.equal(m.people.find(p=>p.isOwner).accepted,true);
 assert.equal(f.G.createCollection(input(f)).item.id,g.id,'same consent and creation reference are idempotent');
 assert.equal(f.G.createCollection(input(f,{mandateApproval:'everyone'})).ok,false,'a changed mandate cannot reuse the creation key');
 for(const n of [2,3,6,9])for(const approval of ['majority','everyone']){
  const members=[people()[0],...Array.from({length:n-1},(_,i)=>({id:'member-'+i,name:'Member '+i}))];
  const r=f.G.previewCollection(input(f,{members,mandateApproval:approval}));assert(r.ok,r.error);
  assert.equal(r.item.mandate.requiredApprovals,approval==='everyone'?n:Math.floor(n/2)+1);
 }
 assert.equal(f.G.previewCollection(input(f,{mandateApproval:'organiser-only'})).ok,false);assert.equal(personal(f),before);clean(f);
});

check('each member must explicitly accept the current mandate before funding opens',()=>{
 const f=fixture(),g=create(f),before=personal(f);
 assert.equal(receive(f,g,'abena','10','before-consent').ok,false);
 for(const args of [{personId:'abena',version:1},{personId:'abena',version:2,sample:true},{personId:'stranger',version:1,sample:true}])assert.equal(f.G.acceptMandate({itemId:g.id,...args}).ok,false);
 let r=f.G.acceptMandate({itemId:g.id,personId:'abena',version:1,sample:true});assert(r.ok,r.error);assert.equal(f.G.mandateSummary(g).acceptedCount,2);
 const once=JSON.stringify(g);assert(f.G.acceptMandate({itemId:g.id,personId:'abena',version:1,sample:true}).ok);assert.equal(JSON.stringify(g),once,'duplicate acceptance cannot add another record');
 assert.equal(receive(f,g,'abena','10','before-last-consent').ok,false);
 assert(f.G.acceptMandate({itemId:g.id,personId:'kojo',version:1,sample:true}).ok);assert.equal(f.G.mandateSummary(g).allAccepted,true);assert.equal(f.G.summary(g).mandateReady,true);
 assert(receive(f,g,'abena','10','after-consent').ok);assert.equal(f.G.summary(g).balanceCents,1000);assert.equal(personal(f),before);clean(f);
});

check('shared collection details include the mandate and disclose their preview boundary',()=>{
 const f=fixture(),g=create(f),shared=f.G.shareText(g.id);
 for(const name of ['Abena','Kojo'])assert(shared.includes(name));assert.match(shared,/mandate/i);assert(shared.includes(g.collectionAccount.reference));
 assert.match(shared,/2\s*(?:of|\/).*3|majority/i);assert.match(shared,/accept/i);assert.match(shared,/refund|unspent|cancel/i);
 assert.match(shared,/no real money|no real.*collect/i);assert.match(shared,/not a payable link/i);assert.doesNotMatch(shared,/bank.guaranteed|insured funds|held with GCB/i);clean(f);
});

check('proposals reserve collection funds and cannot borrow personal money or another proposal reservation',()=>{
 const f=fixture(),g=funded(f),before=personal(f),p=propose(f,g,{amount:'400'}),s=f.G.summary(g);
 assert.equal(p.approvals.length,0,'proposing is not a vote');assert.equal(p.feeCents,0);assert.equal(p.totalCents,40000);
 assert.equal(s.balanceCents,60000);assert.equal(s.reservedCents,40000);assert.equal(s.availableCents,20000);
 assert.equal(f.G.createProposal({itemId:g.id,recipient:'Other supplier',purpose:'Other booking',amount:'200.01',idempotencyKey:'too-much'}).ok,false);
 const next=propose(f,g,{amount:'200',idempotencyKey:'next'});assert.equal(f.G.summary(g).availableCents,0);
 const repeat=f.G.createProposal({itemId:g.id,recipient:p.recipient,purpose:p.purpose,amount:'400',idempotencyKey:'proposal-once'});assert(repeat.ok,repeat.error);assert.equal(repeat.proposal.id,p.id);
 assert.equal(f.G.createProposal({itemId:g.id,recipient:p.recipient,purpose:p.purpose,amount:'399',idempotencyKey:'proposal-once'}).ok,false);
 assert.equal(f.G.summary(g).reservedCents,60000);assert.notEqual(next.id,p.id);assert.equal(personal(f),before);clean(f);
});

check('organiser approval alone cannot pay and duplicate or unknown member votes cannot reach the threshold',()=>{
 const f=fixture(),g=funded(f),p=propose(f,g),before=personal(f);assert(vote(f,g,p).ok);assert.equal(execute(f,g,p).ok,false);
 let r=f.G.proposalSummary(g.id,p.id);assert.equal(r.approvalCount,1);assert.equal(r.requiredApprovals,2);assert.equal(r.availableToExecute,false);
 const once=JSON.stringify(p);assert(vote(f,g,p).ok);assert.equal(JSON.stringify(p),once);
 for(const args of [{personId:'abena',version:1},{personId:'abena',version:2,sample:true},{personId:'stranger',version:1,sample:true}])assert.equal(f.G.approveProposal({itemId:g.id,proposalId:p.id,...args}).ok,false);
 assert(vote(f,g,p,'abena').ok);r=f.G.proposalSummary(g.id,p.id);assert.equal(r.approvalCount,2);assert.equal(r.availableToExecute,true);
 assert.equal(personal(f),before);clean(f);
});

check('an everyone mandate waits for every member and a sample payout is recorded exactly once',()=>{
 const f=fixture(),g=funded(f,{mandateApproval:'everyone'}),p=propose(f,g),before=personal(f);
 assert(vote(f,g,p).ok);assert(vote(f,g,p,'abena').ok);assert.equal(execute(f,g,p).ok,false);
 assert(vote(f,g,p,'kojo').ok);let r=execute(f,g,p);assert(r.ok,r.error);
 assert.equal(f.G.summary(g).spentCents,45000);assert.equal(f.G.summary(g).balanceCents,15000);assert.equal(f.G.summary(g).reservedCents,0);assert.equal(g.disbursements.length,1);
 const once=JSON.stringify(g);r=execute(f,g,p);assert(r.ok,r.error);assert.equal(JSON.stringify(g),once,'retry cannot spend twice');assert.equal(personal(f),before);clean(f);
});

check('approvals bind the exact recipient amount and purpose instead of surviving edited proposals',()=>{
 for(const change of [{recipient:'Someone else'},{amountCents:44000,totalCents:44000},{purpose:'Different purpose'},{feeCents:100,totalCents:45100}]){
  const f=fixture(),g=funded(f),p=approved(f,g,propose(f,g)),before=personal(f);Object.assign(p,change);
  assert.equal(execute(f,g,p).ok,false,JSON.stringify(change));assert.equal(vote(f,g,p,'kojo').ok,false,'new vote cannot bless altered payment details');
  assert.equal(g.disbursements.length,0);assert.equal(f.G.summary(g).spentCents,0);assert.equal(personal(f),before);clean(f);
 }
});

check('membership or mandate changes cannot reuse accepted rules and previous approvals',()=>{
 for(const change of ['members','approval','version']){
  const f=fixture(),g=funded(f),p=approved(f,g,propose(f,g)),before=personal(f);
  if(change==='members')g.people.push({id:'extra',name:'Extra person',isOwner:false});
  if(change==='approval')g.mandate.requiredApprovals=1;
  if(change==='version')g.mandate.version=2;
  assert.equal(execute(f,g,p).ok,false,change+' blocks spending');assert.equal(g.disbursements.length,0);assert.equal(personal(f),before);clean(f);
 }
});

check('copied approvals cannot authorise a cloned proposal under a fresh id key or duplicate stored identity',()=>{
 for(const paid of [false,true])for(const identity of ['new-id','new-id-and-key','duplicate-id']){
  const f=fixture(),g=funded(f),p=approved(f,g,propose(f,g,{amount:'200'}));if(paid)assert(execute(f,g,p).ok);
  const copied=clone(p);copied.status='pending';delete copied.paidAt;
  if(identity!=='duplicate-id')copied.id='copied-proposal';
  if(identity==='new-id-and-key')copied.idempotencyKey='copied-reference';
  const spent=f.G.summary(g).spentCents,count=g.disbursements.length,before=personal(f);g.proposals.push(copied);
  assert.equal(f.G.proposalSummary(g.id,copied.id).valid,false,identity+' is not the approved proposal');
  assert.equal(vote(f,g,copied,'kojo').ok,false);assert.equal(execute(f,g,copied).ok,false);
  assert.equal(g.disbursements.length,count);assert.equal(f.G.summary(g).spentCents,spent);assert.equal(personal(f),before);clean(f);
 }
});

check('expired proposals release reservations and cannot execute with old approvals',()=>{
 const f=fixture(),g=funded(f),p=approved(f,g,propose(f,g,{amount:'600'}));assert.equal(f.G.summary(g).availableCents,0);
 f.h.advance(49*60*60*1000);assert.equal(f.G.summary(g).availableCents,60000);assert.equal(f.G.summary(g).reservedCents,0);
 assert.equal(f.G.proposalSummary(g.id,p.id).status,'expired');assert.equal(execute(f,g,p).ok,false);assert.equal(vote(f,g,p,'kojo').ok,false);
 const next=propose(f,g,{amount:'600',idempotencyKey:'after-expiry'});assert.notEqual(next.id,p.id);assert.equal(g.disbursements.length,0);clean(f);
});

check('reaching the target or collection deadline closes funding while approved spending remains available',()=>{
 for(const deadlinePassed of [false,true]){
  const f=fixture(),g=funded(f),p=approved(f,g,propose(f,g));assert.equal(f.G.summary(g).canReceive,false);
  if(deadlinePassed)f.h.advance(25*60*60*1000);
  const result=execute(f,g,p);assert(result.ok,result.error);assert.equal(f.G.summary(g).balanceCents,15000);
  assert.equal(receive(f,g,'kojo','1','after-closed-funding').ok,false);clean(f);
 }
});

check('cancellation releases pending proposals and blocks later votes payments and contributions',()=>{
 const f=fixture(),g=funded(f),p=approved(f,g,propose(f,g));assert(f.G.cancel(g.id).ok);assert.equal(f.G.summary(g).reservedCents,0);
 assert.equal(execute(f,g,p).ok,false);assert.equal(vote(f,g,p,'kojo').ok,false);assert.equal(receive(f,g,'kojo','1','after-cancellation').ok,false);
 assert.equal(f.G.createProposal({itemId:g.id,recipient:'Other supplier',purpose:'Late proposal',amount:'1',idempotencyKey:'late'}).ok,false);
 assert.equal(g.disbursements.length,0);clean(f);
});

check('refunds distribute only unspent money proportionally to original sources with exact pesewa rounding',()=>{
 const f=fixture(),g=accepted(f,create(f,{target:'0.07',members:[...people(),{id:'esi',name:'Esi'}]})),before=personal(f);
 assert(receive(f,g,'esi','0.01','small-esi').ok);assert(receive(f,g,'abena','0.02','small-abena').ok);assert(receive(f,g,'kojo','0.04','small-kojo').ok);
 const p=approved(f,g,propose(f,g,{amount:'0.02'}));assert(execute(f,g,p).ok);assert.equal(f.G.summary(g).balanceCents,5);
 assert(f.G.cancel(g.id).ok);const r=f.G.refund(g.id);assert(r.ok,r.error);const s=f.G.summary(g);
 assert.equal(s.refundedCents,5);assert.equal(s.spentCents,2);assert.equal(s.balanceCents,0);assert.equal(g.refunds.reduce((n,x)=>n+x.amountCents,0),5);
 assert(g.refunds.every(r=>r.destination==='original-sample-source'&&g.payments.some(p=>p.id===r.paymentId&&p.personId===r.personId)));
 assert.equal(g.refunds.find(r=>r.personId==='esi').amountCents,1);assert.equal(g.refunds.find(r=>r.personId==='abena').amountCents,1);assert.equal(g.refunds.find(r=>r.personId==='kojo').amountCents,3);
 const once=JSON.stringify(g);assert(f.G.refund(g.id).ok);assert.equal(JSON.stringify(g),once);assert.equal(personal(f),before);clean(f);
});

check('locked closed unonboarded and different-profile callers cannot mutate mandates or payments',()=>{
 for(const change of [{locked:true},{closed:true},{onboarded:false},{differentProfile:true}]){
  const f=fixture(),g=funded(f),p=propose(f,g),beforePersonal=personal(f);
  if(change.differentProfile)f.L.state.profile.account='another-account';else Object.assign(f.L.state,change);
  const before=JSON.stringify(f.L.state.groupMoney);
  assert.equal(f.G.acceptMandate({itemId:g.id,personId:'abena',version:1,sample:true}).ok,false);
  assert.equal(vote(f,g,p).ok,false);assert.equal(execute(f,g,p).ok,false);
  assert.equal(f.G.createProposal({itemId:g.id,recipient:'Other supplier',purpose:'Blocked proposal',amount:'1',idempotencyKey:'blocked'}).ok,false);
  assert.equal(f.G.cancel(g.id).ok,false);assert.equal(f.G.refund(g.id).ok,false);assert.equal(JSON.stringify(f.L.state.groupMoney),before);assert.equal(personal(f),beforePersonal);clean(f);
 }
});

check('legacy collections retain evidence and refunds without inventing mandate acceptance',()=>{
 const f=fixture(),g=funded(f),before=personal(f);delete g.mandate;delete g.mandateAcceptances;delete g.collectionAccount;
 assert.equal(f.G.mandateSummary(g).legacy,true);assert.equal(f.G.summary(g).canReceive,false);
 assert.equal(receive(f,g,'kojo','1','legacy-funding').ok,false);assert.equal(f.G.createProposal({itemId:g.id,recipient:'Supplier',purpose:'Legacy proposal',amount:'1',idempotencyKey:'legacy'}).ok,false);
 assert.equal(g.payments.length,1);assert(f.G.cancel(g.id).ok);assert(f.G.refund(g.id).ok);assert.equal(f.G.summary(g).refundedCents,60000);assert.equal(g.payments.length,1);assert.equal(g.mandateAcceptances,undefined);assert.equal(personal(f),before);clean(f);
});

check('saved collection state retains mandate acceptance and proposals under its existing edition key',()=>{
 const f=fixture(),g=funded(f),p=approved(f,g,propose(f,g));f.L.save();
 const saved=JSON.parse(f.h.store.get(storageKey)),stored=saved.groupMoney.items.find(i=>i.id===g.id);
 assert.equal(stored.mandate.version,1);assert.equal(stored.mandateAcceptances.length,3);assert.equal(stored.proposals.length,1);assert.equal(stored.proposals[0].id,p.id);
 const replacement=clone(saved.groupMoney);f.L.state.groupMoney=replacement;
 assert.equal(f.G.mandateSummary(g.id).allAccepted,true);assert.equal(f.G.proposalSummary(g.id,p.id).approvalCount,2);assert(execute(f,f.G.get(g.id),f.G.proposal(g.id,p.id)).ok);assert.equal(f.G.summary(g.id).balanceCents,15000);clean(f);
});

check('the shipped journey communicates the mandate and requires explicit member decisions before a sample payment',()=>{
 const f=fixture(),before=personal(f);f.L.gm.startCollection();f.h.flush();
 f.h.set('gm-title','Cape Coast trip');f.h.set('gm-target','600');f.h.set('gm-deadline',future(f));f.L.gm.next();f.h.flush();
 f.h.set('gm-name-1','Abena');f.L.gm.addPerson();f.h.flush();f.h.set('gm-name-2','Kojo');f.L.gm.next();f.h.flush();
 assert.equal(f.L.route,'groupMoneyReview');assert.match(visible(f),/Separate group collection/);assert.match(visible(f),/2 of 3/);assert.match(visible(f),/mandate/i);
 click(f,'View full mandate');assert.equal(f.L.route,'groupMoneyMandate');assert.match(visible(f),/Silence is not approval/);assert.match(visible(f),/in proportion to contributions/);
 click(f,'Back to review');assert.equal(f.G.list().length,0);click(f,'Agree & create collection');
 const g=f.G.list()[0];assert.equal(f.G.mandateSummary(g).acceptedCount,1);assert.equal(f.G.summary(g).canReceive,false);
 assert.match(visible(f),/1 of 3 members accepted/);assert.equal(g.payments.length,0);
 click(f,'View mandate');click(f,'Try member view');assert.equal(f.L.route,'groupMoneyMember');assert.match(visible(f),/No one is contacted/);assert.match(visible(f),/mandate acceptance required/);
 click(f,'Simulate acceptance');assert.equal(f.G.mandateSummary(g).acceptedCount,2);assert.equal(f.G.summary(g).canReceive,false);
 click(f,'Try member view');assert.match(visible(f),/Kojo/);click(f,'Simulate acceptance');assert.equal(f.G.mandateSummary(g).allAccepted,true);
 click(f,'Back to collection');f.L.gm.showSample(g.id,g.people.find(p=>p.name==='Abena').id);f.h.flush();
 f.h.set('gm-sample-amount','600');click(f,'Record sample payment');assert.equal(f.G.summary(g).balanceCents,60000);
 // Compatibility: a previously saved unauthorised legacy draft keeps its original release flow.
 f.L.state.groupMoney.proposalDraft={account:String(f.L.state.profile.account||f.L.state.profile.handle||f.L.state.profile.phone||f.L.state.profile.name),itemId:g.id,key:f.L.id('legacy-mandate'),recipient:'',purpose:'',amount:'',supportingReference:''};f.L.go('groupMoneyProposal',{id:g.id});f.h.flush();assert.equal(f.L.route,'groupMoneyProposal');
 f.h.set('gm-proposal-recipient','Trip bus company');f.h.set('gm-proposal-purpose','Bus booking for our trip');f.h.set('gm-proposal-amount','450');click(f,'Review payout');
 assert.equal(f.L.route,'groupMoneyProposalReview');assert.match(visible(f),/Trip bus company/);assert.match(visible(f),/GH₵450.00/);assert.equal(g.proposals.length,0);
 click(f,'Request approval');const p=g.proposals[0];assert.equal(p.approvals.length,0);assert.equal(f.G.summary(g).balanceCents,60000);
 click(f,'Approve payout');assert.equal(f.G.proposalSummary(g.id,p.id).approvalCount,1);assert(!f.h.document.querySelectorAll('button').some(b=>b.textContent.trim()==='Record sample payment'));
 click(f,'Try member view');assert.match(visible(f),/Member preview only/);assert.match(visible(f),/Trip bus company/);assert.match(visible(f),/GH₵450.00/);click(f,'Simulate member approval');
 assert.equal(f.G.proposalSummary(g.id,p.id).approvalCount,2);click(f,'Release payment');assert.equal(f.L.route,'groupMoneyPayoutRelease');f.h.set('gm-payout-pin',f.L.state.profile.pin);f.h.submit(f.h.document.querySelector('.gm-form'));f.h.flush();assert.equal(f.G.proposalSummary(g.id,p.id).status,'processing');assert.equal(f.G.summary(g).balanceCents,60000);click(f,'Check sample status');assert.equal(g.disbursements.length,1);assert.equal(f.G.summary(g).balanceCents,15000);
 assert.match(visible(f),/Paid/);assert.equal(personal(f),before);clean(f);
});

console.log(passed+' collection mandate and shared-authorisation checks passed.');
