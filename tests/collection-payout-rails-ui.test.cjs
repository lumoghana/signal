/* Shipped recipient entry and requester authorisation for pot-funded payouts. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const view=h=>h.document.getElementById('view');
const settle=h=>{h.flushHistory();h.flush();};
const text=h=>view(h).textContent;
const control=(h,label)=>view(h).querySelectorAll('button').find(b=>b.textContent.trim()===label);
const click=(h,label)=>{const b=control(h,label);assert(b,'Visible '+label+' on '+h.L.route);b.click();settle(h);return b;};
function fixture(){
 const h=createHarness({clock:true,deferHistory:true}),L=h.L;L.explore();L.ensureAccounts();Object.assign(L.state,{balance:0,goals:[],essentials:[],txs:[],requests:[],paymentDraft:null,groupMoney:undefined});L.state.profile.pin='123456';L.route='home';L.params={};L.history=[];
 const G=L.groupMoney,members=[{id:'self',name:'You',isOwner:true},{id:'abena',name:'Abena'},{id:'kojo',name:'Kojo'}];
 const made=G.createCollection({title:'Class dinner',target:'1200',deadline:new h.context.Date(h.context.Date.now()+14*86400000).toISOString().slice(0,10),members,mandateApproval:'named',mandateApproverIds:['self','abena','kojo'],mandateRequiredApprovals:2,acceptMandate:true,idempotencyKey:'payout-ui'});assert(made.ok,made.error);const item=made.item;
 for(const p of members.slice(1))assert(G.acceptMandate({itemId:item.id,personId:p.id,version:2,sample:true}).ok);
 assert(G.recordSamplePayment({itemId:item.id,personId:'abena',amount:'600',reference:'other-funds'}).ok);L.gm.open(item.id);settle(h);return {h,L,G,item};
}
function start(f,method='lumo'){
 const {h,L,item}=f;L.gm.startProposal(item.id);settle(h);assert.equal(L.route,'collectionPayoutRail');click(h,{lumo:'Lumo',momo:'Mobile Money',bank:'Bank transfer'}[method]);assert.equal(L.route,'send');
 h.set('payment-amount','100');h.set('payment-note','Minibus deposit');
 if(method==='lumo'){L.pickPerson('abena');settle(h);}else{h.set('recipient-number',method==='momo'?'0241234567':'102345678901');if(method==='bank')h.set('recipient-provider','GCB Bank');}
}
function review(f){click(f.h,'Review payout');assert.equal(f.L.route,'paymentReview');assert(text(f.h).includes('Total from collection'));click(f.h,'Continue to authorise');assert.equal(f.L.route,'authorize');}
function authorize(f,pin='123456'){const field=f.h.set('payment-pin',pin);f.h.submit(view(f.h).querySelector('form'));settle(f.h);return field;}

test('all existing recipient rails lead through pot review and PIN before creating a request',()=>{
 for(const method of ['lumo','momo','bank']){
  const f=fixture(),{h,L,G,item}=f;start(f,method);assert.equal(item.proposals.length,0);review(f);assert.equal(item.proposals.length,0);const field=authorize(f);assert.equal(field.value,'');assert.equal(L.route,'groupMoneyProposalDetail');
  const p=item.proposals[0];assert(p,p?.error);assert.equal(p.rail.method,method);assert.equal(G.proposalSummary(item.id,p.id).status,'pending');assert.equal(item.disbursements.length,0);assert.equal(G.summary(item).balanceCents,60000);assert.equal(L.state.txs.length,0);assert.equal(L.state.balance,0);assert(text(h).includes('Destination'));assert(text(h).includes('Payment method'));assert.equal(control(h,'Release payment'),undefined);assert.deepEqual(h.errors,[]);
 }
});

test('the native details surface shows a required visible purpose and no personal balance or category claims',()=>{
 const f=fixture();start(f);const {h}=f,purpose=h.document.getElementById('payment-note');assert(purpose.hasAttribute('required'));assert.equal(purpose.closest('details'),null);assert.equal(h.document.getElementById('entry-category'),null);assert.equal(h.document.getElementById('payment-projection'),null);assert.equal(view(h).querySelector('[data-payment-balance]'),null);assert(!text(h).includes('What’s this for?'));assert(text(h).includes('From collectionClass dinner'));assert.deepEqual(h.errors,[]);
});

test('a wrong PIN keeps the payout uncreated and the review editable',()=>{
 const f=fixture();start(f);review(f);authorize(f,'000000');assert.equal(f.L.route,'authorize');assert.equal(f.item.proposals.length,0);assert.equal(f.G.summary(f.item).reservedCents,0);assert(text(f.h).includes('That PIN did not match'));assert.equal(f.h.document.getElementById('payment-pin').value,'');
});

test('the existing biometric demo authorises the request while preserving zero personal money',()=>{
 const f=fixture();start(f);review(f);assert(f.L.biometricPayment.open());settle(f.h);assert(view(f.h).querySelector('.biometric-prompt'));assert(f.L.biometricPayment.approve());settle(f.h);assert.equal(f.L.route,'groupMoneyProposalDetail');assert.equal(f.item.proposals[0].requesterAuthorisation.method,'biometric-demo');assert.equal(f.item.disbursements.length,0);assert.equal(f.L.state.txs.length,0);assert.deepEqual(f.h.errors,[]);
});

test('remaining approvals automatically submit the exact rail once, then confirmation changes only the pot',()=>{
 const f=fixture();start(f,'bank');review(f);authorize(f);const {h,L,G,item}=f,p=item.proposals[0];
 click(h,'Approve payout');assert.equal(G.proposalSummary(item.id,p.id).status,'pending');assert.equal(item.disbursements.length,0);
 const approved=G.approveProposal({itemId:item.id,proposalId:p.id,personId:'abena',version:2,fingerprint:p.fingerprint,sample:true});assert(approved.ok,approved.error);L.render();settle(h);const s=G.proposalSummary(item.id,p.id);assert.equal(s.status,'processing');assert.equal(s.disbursement.method,'bank');assert.equal(s.disbursement.destination,'102345678901');assert.equal(item.disbursements.length,1);assert.equal(G.summary(item).balanceCents,60000);assert.equal(control(h,'Release payment'),undefined);
 click(h,'Check sample status');assert.equal(G.proposalSummary(item.id,p.id).status,'paid');assert.equal(G.summary(item).balanceCents,49900);assert.equal(L.state.balance,0);assert.equal(L.state.txs.length,0);assert.deepEqual(h.errors,[]);
});

test('backgrounding retires the pending authorisation and clears the PIN',()=>{
 const f=fixture();start(f);review(f);f.h.set('payment-pin','123456');f.h.document.hidden=true;f.h.document.dispatchEvent(new f.h.context.Event('visibilitychange'));assert.equal(f.h.document.getElementById('payment-pin').value,'');f.h.document.hidden=false;f.L.authorizePayment();settle(f.h);assert.equal(f.L.route,'paymentReview');assert.equal(f.item.proposals.length,0);assert.deepEqual(f.h.errors,[]);
});

test('a pending unrelated payment is kept when a payout is requested',()=>{
 const f=fixture(),old={id:'personal-draft',method:'lumo',name:'Ama',amount:5};f.L.state.paymentDraft=old;f.L.gm.startProposal(f.item.id);settle(f.h);assert.equal(f.L.state.paymentDraft,old);assert.notEqual(f.L.route,'collectionPayoutRail');
});

test('discarding a payout draft returns to its collection with no instruction or reservation',()=>{
 const f=fixture();start(f);click(f.h,'Leave for now');assert.equal(f.L.route,'paymentCancel');click(f.h,'Discard draft');assert.equal(f.L.route,'groupMoneyDetail');assert.equal(f.L.params.id,f.item.id);assert.equal(f.L.state.paymentDraft,null);assert.equal(f.item.proposals.length,0);assert.equal(f.G.summary(f.item).reservedCents,0);assert.deepEqual(f.h.errors,[]);
});

test('native payout entry preserves optional uploaded evidence and binds it to the authorised rail request',()=>{
 const f=fixture();start(f);const {h,L}=f,readers=[];
 class Reader{constructor(){readers.push(this);}readAsDataURL(file){this.file=file;}abort(){this.onabort?.();}finish(value){this.result=value;this.onload?.();}}
 h.context.FileReader=Reader;const bytes=Buffer.from('%PDF-1.7\nInvoice\n%%EOF'),input=h.document.getElementById('gm-proposal-attachment');input.files=[{name:'invoice.pdf',type:'application/pdf',size:bytes.length}];h.set('gm-proposal-supportingReference','INV-020');assert(L.collectionEvidence.add(input));readers[0].finish('data:application/pdf;base64,'+bytes.toString('base64'));settle(h);
 assert.equal(L.state.paymentDraft.note,'Minibus deposit');assert.equal(L.state.paymentDraft.supportingReference,'INV-020');assert.equal(L.state.paymentDraft.attachment.name,'invoice.pdf');review(f);authorize(f);const p=f.item.proposals[0];assert.equal(p.attachment.dataUrl,'data:application/pdf;base64,'+bytes.toString('base64'));assert.equal(p.supportingReference,'INV-020');assert(f.G.proposalSummary(f.item.id,p.id).valid);assert.deepEqual(h.errors,[]);
});

test('a late supporting-file read cannot follow a changed payout recipient',()=>{
 const f=fixture();start(f);const {h,L}=f;let reader;
 class Reader{constructor(){reader=this;}readAsDataURL(){}abort(){this.onabort?.();}finish(value){this.result=value;this.onload?.();}}
 h.context.FileReader=Reader;const bytes=Buffer.from('%PDF-1.7\nInvoice\n%%EOF'),input=h.document.getElementById('gm-proposal-attachment');input.files=[{name:'invoice.pdf',type:'application/pdf',size:bytes.length}];assert(L.collectionEvidence.add(input));L.pickPerson('kojo');settle(h);reader.finish('data:application/pdf;base64,'+bytes.toString('base64'));assert.equal(L.state.paymentDraft.attachment,undefined);assert.deepEqual(h.errors,[]);
});

test('failed payout retry keeps its original recipient and reference, then needs a fresh requester authorisation',()=>{
 const f=fixture();start(f,'momo');review(f);authorize(f);const {h,L,G,item}=f,p=item.proposals[0];for(const id of ['self','abena'])assert(G.approveProposal({itemId:item.id,proposalId:p.id,personId:id,version:2,fingerprint:p.fingerprint,sample:id!=='self'}).ok);
 let s=G.proposalSummary(item.id,p.id);assert(G.settleSamplePayout({itemId:item.id,proposalId:p.id,reference:s.reference,attemptId:s.attemptId,outcome:'Failed',sample:true}).ok);L.render();settle(h);click(h,'Review retry');assert.equal(L.route,'paymentReview');assert.equal(L.state.paymentDraft.destination,'0241234567');assert.equal(L.state.paymentDraft.recipient,'0241234567');assert.equal(item.disbursements[0].attempts.length,1);click(h,'Continue to authorise');authorize(f);s=G.proposalSummary(item.id,p.id);assert.equal(s.status,'processing');assert.equal(s.reference,item.disbursements[0].reference);assert.equal(item.proposals.length,1);assert.equal(item.disbursements[0].attempts.length,2);assert.equal(L.state.txs.length,0);assert.deepEqual(h.errors,[]);
});
