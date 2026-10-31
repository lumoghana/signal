/* Actual shipped payment entry, review, authorisation and receipt journeys. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const view=h=>h.document.getElementById('view');
const settle=h=>{h.flushHistory();h.flush();};
const control=(h,label)=>view(h).querySelectorAll('button').find(button=>button.textContent.trim()===label);
const click=(h,label)=>{const button=control(h,label);assert(button,'Visible '+label+' on '+h.L.route);button.click();settle(h);return button;};
const text=h=>view(h).textContent;
const clean=h=>assert.deepEqual(h.errors,[]);
function fixture({testing=false}={}){
 const h=createHarness({clock:true,deferHistory:true,testing}),L=h.L;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:600,goals:[],essentials:[],txs:[],requests:[],paymentDraft:null,groupMoney:undefined});L.state.profile.pin='123456';L.route='home';L.params={};L.history=[];L.save();L.render();settle(h);return h;
}
function collection(h,{accept=true}={}){
 const G=h.L.groupMoney,members=[{id:'self',name:'You',isOwner:true},{id:'abena',name:'Abena'},{id:'kojo',name:'Kojo'}];
 const made=G.createCollection({title:'Class dinner',target:'1200',deadline:new h.context.Date(h.context.Date.now()+14*86400000).toISOString().slice(0,10),members,mandateApproval:'named',mandateApproverIds:['self','abena','kojo'],mandateRequiredApprovals:2,acceptMandate:true,idempotencyKey:'contribution-ui'});assert(made.ok,made.error);const item=made.item;
 if(accept){for(const person of members.filter(person=>person.id!=='self'))assert(G.acceptMandate({itemId:item.id,personId:person.id,version:item.mandate.version,sample:true}).ok);assert(G.recordSamplePayment({itemId:item.id,personId:'abena',amount:'600',reference:'other-member-funds'}).ok);}
 h.L.gm.open(item.id);settle(h);return item;
}
function review(h,amount='50'){
 click(h,'Contribute');assert.equal(h.L.route,'send');assert(text(h).includes('From your Everyday money'));assert.equal(h.document.getElementById('payment-person'),null);
 assert.equal(view(h).querySelectorAll('#payment-projection').length,1,'The existing native injector supplies one live preview');
 h.set('payment-amount',amount);click(h,'Review contribution');assert.equal(h.L.route,'paymentReview');assert(text(h).includes('FromYour Everyday money'));assert(text(h).includes('Everyday money after'));click(h,'Continue');
 assert.equal(h.L.route,'authorize','Covered test amount uses native PIN authorisation');assert.equal(h.document.getElementById('payment-pin').type,'password');
}
function authorise(h,{outcome='Completed',pin='123456'}={}){
 if(h.document.getElementById('payment-outcome'))h.set('payment-outcome',outcome);
 const field=h.set('payment-pin',pin);h.submit(view(h).querySelector('form'));settle(h);return field;
}

test('an own contribution is prominent after the collection balance and charges Everyday money only after the native PIN',()=>{
 const h=fixture(),L=h.L,item=collection(h),before=L.accountBalances(),count=item.payments.length;
 const action=view(h).querySelector('.cc-contribution-action'),hero=view(h).querySelector('.gm-hero'),context=view(h).querySelector('.mono-collection-context');
 assert(action&&hero);const html=view(h).innerHTML;assert(html.indexOf('cc-contribution-action')>html.indexOf('gm-hero'));assert(html.indexOf('cc-contribution-action')<html.indexOf('gm-mandate-card'));if(context)assert(html.indexOf('cc-contribution-action')<html.indexOf('mono-collection-context'));assert.equal(control(h,'Try a sample contribution'),undefined);
 review(h);assert.equal(L.accountBalances().operational,before.operational);assert.equal(item.payments.length,count);const pin=authorise(h);
 assert.equal(pin.value,'');assert.equal(L.route,'paymentResult');assert(text(h).includes('Contribution made'));assert.equal(L.accountBalances().operational,550);assert.equal(L.accountBalances().savings,before.savings);assert.equal(L.groupMoney.summary(item).balanceCents,65000);assert.equal(item.payments.length,count+1);assert.equal(L.state.txs.filter(t=>t.collectionContribution&&t.type==='out').length,1);
 assert(item.payments.find(payment=>payment.personId==='self'&&payment.personalTxId));const id=L.state.paymentDraft.submittedTxId;
 L.authorizePayment();settle(h);assert.equal(L.state.paymentDraft.submittedTxId,id);assert.equal(L.accountBalances().operational,550);assert.equal(L.groupMoney.summary(item).balanceCents,65000);
 click(h,'View receipt');assert.equal(L.route,'txDetail');assert(text(h).includes('Your Everyday money'));assert(text(h).includes(id));assert(!control(h,'Confirm full refund'));
 click(h,'Back to collection');assert.equal(L.route,'groupMoneyDetail');assert.equal(L.state.paymentDraft,null);assert(text(h).includes('You contributed'));clean(h);
});

test('incomplete mandates leave Contribute visible with the waiting reason; target and closed states remain explicit',()=>{
 const h=fixture(),L=h.L,item=collection(h,{accept:false});let button=control(h,'Contribute');assert(button?.hasAttribute('disabled'));assert(text(h).includes('Contributions open after everyone accepts the mandate'));assert(text(h).includes('1 of 3 accepted'));assert.equal(item.payments.length,0);
 L.openCollectionContribution(item.id);settle(h);assert.equal(L.route,'groupMoneyDetail');assert.equal(L.state.paymentDraft,null);
 for(const person of item.people.filter(person=>person.id!=='self'))assert(L.groupMoney.acceptMandate({itemId:item.id,personId:person.id,version:item.mandate.version,sample:true}).ok);
 assert(L.groupMoney.recordSamplePayment({itemId:item.id,personId:'abena',amount:'1200',reference:'target-met'}).ok);L.render();settle(h);button=control(h,'Contribute');assert(button?.hasAttribute('disabled'));assert(text(h).includes('target has been reached'));
 assert(L.groupMoney.cancel(item.id).ok);L.render();settle(h);assert(control(h,'Contribute')?.hasAttribute('disabled'));assert(text(h).includes('closed to contributions'));clean(h);
});

test('wrong PIN and a changed mandate cannot debit or credit, and returning from background requires a fresh review',()=>{
 const h=fixture(),L=h.L,item=collection(h);review(h);const wrong=authorise(h,{pin:'000000'});assert.equal(wrong.value,'');assert.equal(L.route,'authorize');assert.match(h.document.getElementById('error').textContent,/PIN/);assert.equal(L.state.txs.length,0);assert.equal(L.groupMoney.summary(item).balanceCents,60000);
 h.document.hidden=true;h.document.dispatchEvent(new h.Event('visibilitychange'));h.document.hidden=false;h.document.dispatchEvent(new h.Event('visibilitychange'));authorise(h);assert.equal(L.route,'paymentReview');assert.equal(L.state.txs.length,0);assert.equal(h.document.getElementById('payment-pin'),null);
 click(h,'Continue');assert.equal(L.route,'authorize');item.mandateAcceptances=item.mandateAcceptances.filter(row=>row.personId!=='kojo');authorise(h);assert.equal(L.route,'paymentReview');assert.equal(L.state.txs.length,0);assert.equal(L.accountBalances().operational,600);assert(!control(h,'Continue'));assert(text(h).includes('Every member must accept'));clean(h);
});

test('native biometric demonstration authorises the same exact own contribution once without retrieving or filling the PIN',()=>{
 const h=fixture(),L=h.L,item=collection(h);review(h);const biometric=view(h).querySelectorAll('button').find(button=>button.getAttribute('onclick')==='L.biometricPayment.open()');assert(biometric);biometric.click();settle(h);assert(text(h).includes('Biometric demo'));assert.equal(h.document.getElementById('payment-pin'),null);
 click(h,'Approve sample payment');assert.equal(L.route,'paymentResult');assert.equal(L.accountBalances().operational,550);assert.equal(L.groupMoney.summary(item).balanceCents,65000);assert.equal(L.state.txs.length,1);L.biometricPayment.approve();settle(h);assert.equal(L.state.txs.length,1);assert.equal(L.accountBalances().operational,550);clean(h);
});

test('a contribution that needs Pause reviews its exact destination there and keeps the native reading and hold gate before PIN',()=>{
 const h=fixture(),L=h.L,item=collection(h);L.state.essentials=[{id:'food',name:'Food',amount:350,paid:0}];L.state.planSaved=true;L.save();openCollection();
 function openCollection(){L.gm.open(item.id);settle(h);}
 click(h,'Contribute');h.set('payment-amount','500');assert.equal(view(h).querySelectorAll('#payment-projection').length,1);click(h,'Review contribution');assert.equal(L.route,'pause');
 assert(text(h).includes('Class dinner'));assert(text(h).includes(item.collectionAccount.reference));assert(text(h).includes('GH₵500.00'));assert.equal(L.accountBalances().operational,600);assert.equal(L.groupMoney.summary(item).balanceCents,60000);assert.equal(h.document.getElementById('payment-pin'),null);
 click(h,'Cancel contribution');assert.equal(L.route,'groupMoneyDetail');assert.equal(L.state.paymentDraft,null);assert.equal(L.state.txs.length,0);assert.equal(L.accountBalances().operational,600);
 click(h,'Contribute');h.set('payment-amount','500');click(h,'Review contribution');assert.equal(L.route,'pause');
 const hold=view(h).querySelector('[data-pause-hold]');assert(hold);hold.click();h.advance(90);settle(h);assert.equal(L.route,'pause','An early press cannot queue authorisation');
 h.advance(3900);hold.click();h.advance(90);settle(h);assert.equal(L.route,'authorize');assert.equal(L.accountBalances().operational,600);authorise(h);assert.equal(L.route,'paymentResult');assert.equal(L.accountBalances().operational,100);assert.equal(L.groupMoney.summary(item).balanceCents,110000);assert.equal(L.state.txs.filter(row=>row.collectionContribution).length,1);clean(h);
});

test('native Back removes the entered PIN and Forward cannot reuse it to authorise a contribution',()=>{
 const h=fixture(),L=h.L,item=collection(h);review(h);const old=h.set('payment-pin','654321');h.history.back();settle(h);assert.equal(L.route,'paymentReview');assert.equal(old.value,'');assert.equal(h.document.getElementById('payment-pin'),null);
 h.history.forward();settle(h);assert.equal(L.route,'authorize');assert.equal(h.document.getElementById('payment-pin').value,'');h.submit(view(h).querySelector('form'));settle(h);assert.equal(L.state.txs.length,0);assert.equal(L.accountBalances().operational,600);assert.equal(L.groupMoney.summary(item).balanceCents,60000);clean(h);
});

test('pending contributions reserve personal funds, stay outside the pot, and resolve or retry through the existing reference',()=>{
 const h=fixture({testing:true}),L=h.L,item=collection(h);review(h);authorise(h,{outcome:'Pending'});const first=L.state.paymentDraft.submittedTxId;
 assert(text(h).includes('Contribution processing'));assert.equal(L.accountBalances().operational,600);assert.equal(L.accountBalances().available,550);assert.equal(L.groupMoney.summary(item).balanceCents,60000);assert.equal(item.payments.length,1);
 click(h,'Back to collection');assert(control(h,'View pending contribution'));assert(!control(h,'Contribute'));click(h,'View pending contribution');assert.equal(L.route,'txDetail');assert(text(h).includes(first));click(h,'Check contribution status');assert(text(h).includes(first));assert.equal(item.payments.length,1);
 click(h,'Confirm not completed');assert(text(h).includes('Contribution not completed'));assert.equal(L.accountBalances().available,600);assert.equal(L.groupMoney.summary(item).balanceCents,60000);
 click(h,'Review a new attempt');assert.equal(L.route,'send');assert.equal(h.document.getElementById('payment-amount').value,'50');click(h,'Review contribution');click(h,'Continue');authorise(h,{outcome:'Pending'});const second=L.state.paymentDraft.submittedTxId;assert.notEqual(second,first);L.go('txDetail',{id:second});settle(h);click(h,'Confirm completed');assert(text(h).includes('Contribution made'));assert.equal(L.accountBalances().operational,550);assert.equal(L.groupMoney.summary(item).balanceCents,65000);assert.equal(item.payments.length,2);L.settlePayment(second,'success');settle(h);assert.equal(L.accountBalances().operational,550);assert.equal(item.payments.length,2);clean(h);
});

test('leaving and resuming a contribution preserves its amount without moving funds and discard returns to the collection',()=>{
 const h=fixture(),L=h.L,item=collection(h);click(h,'Contribute');h.set('payment-amount','25');click(h,'Leave for now');assert.equal(L.route,'paymentCancel');click(h,'Keep draft & leave');assert.equal(L.route,'groupMoneyDetail');assert.equal(L.state.paymentDraft.amount,'25');assert.equal(L.accountBalances().operational,600);click(h,'Contribute');assert.equal(h.document.getElementById('payment-amount').value,'25');click(h,'Leave for now');click(h,'Discard draft');assert.equal(L.route,'groupMoneyDetail');assert.equal(L.state.paymentDraft,null);assert.equal(L.accountBalances().operational,600);assert.equal(L.groupMoney.summary(item).balanceCents,60000);clean(h);
});

test('a changed pending destination stays processing with an honest receipt and an error instead of a false confirmation',()=>{
 const h=fixture({testing:true}),L=h.L,item=collection(h);review(h);authorise(h,{outcome:'Pending'});const id=L.state.paymentDraft.submittedTxId;L.go('txDetail',{id});settle(h);
 item.title='Different collection title';click(h,'Confirm completed');const payment=L.state.txs.find(row=>row.id===id);
 assert.equal(payment.status,'pending');assert.equal(L.accountBalances().operational,600);assert.equal(L.accountBalances().available,550);assert.equal(L.groupMoney.summary(L.groupMoney.get(item.id)).balanceCents,60000);assert.equal(L.groupMoney.get(item.id).payments.length,1);assert(text(h).includes('Contribution processing'));assert(text(h).includes('Class dinner'));assert(h.document.getElementById('error').textContent);assert(!text(h).includes('Contribution made'));clean(h);
});

test('a confirmed partial group refund keeps the original contribution and shows the returned money and its linked reference',()=>{
 const h=fixture(),L=h.L,item=collection(h),G=L.groupMoney;review(h);authorise(h);const id=L.state.paymentDraft.submittedTxId;
 const made=G.createProposal({itemId:item.id,recipient:'Dinner supplier',purpose:'Dinner deposit',amount:'325',idempotencyKey:'partial-refund-spend'});assert(made.ok,made.error);const p=made.proposal;
 for(const personId of ['self','abena'])assert(G.approveProposal({itemId:item.id,proposalId:p.id,personId,version:p.mandateVersion,fingerprint:p.fingerprint,...(personId==='self'?{}:{sample:true})}).ok);
 const q=G.preparePayout({itemId:item.id,proposalId:p.id});assert(q.ok,q.error);assert(G.executeSampleProposal({itemId:item.id,proposalId:p.id,reviewToken:q.quote.token,pin:'123456',outcome:'Completed'}).ok);assert(G.cancel(item.id).ok);assert(G.refund(item.id).ok);
 const original=L.state.txs.find(row=>row.id===id),refund=L.state.txs.find(row=>row.collectionRefund&&row.originalId===id);assert.equal(original.status,'success');assert.equal(original.refunded,25);assert(refund);L.go('txDetail',{id});settle(h);
 assert(text(h).includes('Contribution partly returned'));assert(text(h).includes('Original contributionGH₵50.00'));assert(text(h).includes('Confirmed returnedGH₵25.00'));assert(text(h).includes('Net paidGH₵25.00'));assert(text(h).includes(refund.id));assert.equal(L.accountBalances().operational,575);clean(h);
});

test('a failed historical contribution with a missing collection offers help instead of throwing on retry',()=>{
 const h=fixture({testing:true}),L=h.L,item=collection(h);review(h);authorise(h,{outcome:'Failed'});const id=L.state.paymentDraft.submittedTxId;L.state.groupMoney.items=[];L.go('txDetail',{id});settle(h);
 assert(text(h).includes('CollectionUnavailable'));click(h,'Review a new attempt');assert.equal(L.route,'txDetail');assert(h.document.getElementById('error').textContent.includes('no longer available'));assert(control(h,'Get help'));assert.equal(L.accountBalances().operational,600);assert.equal(L.state.txs.length,1);clean(h);
});

test('organiser examples cannot record uncharged self contributions and cannot select another member into their own debit',()=>{
 const h=fixture(),L=h.L,item=collection(h);click(h,'Record another member’s sample');assert.equal(L.route,'groupMoneySample');const people=h.document.getElementById('gm-sample-person').querySelectorAll('option');assert(!people.some(option=>option.value==='self'));h.set('gm-sample-amount','25');click(h,'Record sample payment');assert.equal(L.accountBalances().operational,600);assert.equal(L.groupMoney.summary(item).balanceCents,62500);assert.equal(L.state.txs.length,0);
 L.gm.showSample(item.id,'self');settle(h);assert.equal(L.route,'send');assert.equal(L.state.paymentDraft.collectionPersonId,'self');assert.equal(L.accountBalances().operational,600);assert.equal(L.groupMoney.recordSamplePayment({itemId:item.id,personId:'self',amount:'25',reference:'unprotected-self'}).ok,false);clean(h);
});
