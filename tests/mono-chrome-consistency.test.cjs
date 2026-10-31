/* Contextual labels use the native mounted controller and retain its metadata. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const source=fs.readFileSync(path.join(__dirname,'../dist/mono-chrome-consistency.js'),'utf8');
const settle=h=>{h.flushHistory();h.flush();};
const view=h=>h.document.getElementById('view');
const financial=L=>JSON.stringify({balance:L.state.balance,accounts:L.state.accounts,txs:L.state.txs,goals:L.state.goals,essentials:L.state.essentials,requests:L.state.requests});
function fixture({adapter=true}={}){
 const modules=adapter?undefined:require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..')).filter(file=>file!=='mono-chrome-consistency.js');
 const h=createHarness({clock:true,deferHistory:true,modules}),L=h.L;
 if(adapter&&!L.monoChromeConsistency)vm.runInContext(source,h.context,{filename:'mono-chrome-consistency.js'});
 L.explore();L.ensureAccounts();Object.assign(L.state,{balance:600,txs:[],goals:[],essentials:[],requests:[],paymentDraft:null,groupMoney:undefined});L.state.profile.pin='123456';L.route='home';L.params={};L.history=[];L.save();L.render();settle(h);
 return {h,L};
}
function collection(f){
 const {L,h}=f,G=L.groupMoney,members=[{id:'self',name:'You',isOwner:true},{id:'abena',name:'Abena'},{id:'kojo',name:'Kojo'}];
 const made=G.createCollection({title:'Class trip',target:'1200',deadline:new h.context.Date(h.context.Date.now()+14*86400000).toISOString().slice(0,10),members,mandateApproval:'named',mandateApproverIds:['self','abena','kojo'],mandateRequiredApprovals:2,acceptMandate:true,idempotencyKey:'chrome-group'});assert(made.ok,made.error);
 for(const id of ['abena','kojo'])assert(G.acceptMandate({itemId:made.item.id,personId:id,version:2,sample:true}).ok);
 assert(G.recordSamplePayment({itemId:made.item.id,personId:'abena',amount:'600',reference:'chrome-fund'}).ok);return made.item;
}
function chrome(f,label,{kind='payment',treatment}={}){
 const {h,L}=f,title=h.document.getElementById('task-sheet-title');assert(title);assert.equal(title.textContent,label);
 const layer=title.closest('.task-sheet-layer');assert.equal(layer.getAttribute('data-task-route'),L.route);assert.equal(L.taskSheet.kind,kind);
 for(const close of layer.querySelectorAll('.task-sheet-close,.task-sheet-backdrop'))assert.equal(close.getAttribute('aria-label'),'Close '+label);
 assert.match(layer.querySelector('.task-sheet-back').getAttribute('aria-label'),/^(Previous step|Back to Home)$/);
 if(treatment)assert.equal(L.taskSheet.treatment,treatment);
 assert.deepEqual(h.errors,[]);return title;
}
function payout(f,rail){
 const {L,h}=f,item=collection(f);L.gm.startProposal(item.id);settle(h);L.collectionPayoutRails.choose(rail);settle(h);
 chrome(f,'Payout details',{treatment:rail==='lumo'?'selection':'form'});
 if(rail==='lumo')L.pickPerson('abena');else{h.set('recipient-number',rail==='momo'?'0241234567':'102345678901');if(rail==='bank')h.set('recipient-provider','GCB Bank');L.checkRecipient();}
 settle(h);chrome(f,'Payout details',{treatment:'edit'});h.set('payment-amount','150');h.set('payment-note','Class trip deposit');L.reviewTransactionDetails();settle(h);return item;
}
for(const rail of ['lumo','momo','bank'])test(rail+' payout names requester review and authorisation while retaining native sheet metadata and Back',()=>{
 const f=fixture(),before=financial(f.L),item=payout(f,rail);chrome(f,'Review payout',{treatment:'confirmation'});
 const heading=view(f.h).querySelector('.page-heading>h1');assert.equal(heading.textContent,'Review payout');assert(heading.classList.contains('product-title-echo'));assert.equal(heading.getAttribute('aria-hidden'),null);
 f.L.continuePayment();settle(f.h);chrome(f,'Authorise payout request',{treatment:'confirmation'});const pin=f.h.set('payment-pin','123456');
 f.h.history.back();settle(f.h);chrome(f,'Review payout',{treatment:'confirmation'});assert.equal(pin.value,'');f.h.history.forward();settle(f.h);chrome(f,'Authorise payout request');
 assert.equal(financial(f.L),before);assert.equal(item.proposals.length,0);assert.equal(item.disbursements.length,0);
});

test('a contribution has its own entry review authorisation and confirmed-result labels',()=>{
 const f=fixture(),{L,h}=f,item=collection(f);L.openCollectionContribution(item.id);settle(h);chrome(f,'Contribution amount',{treatment:'edit'});
 h.set('payment-amount','50');L.preparePayment();settle(h);assert.equal(L.route,'paymentReview');chrome(f,'Review contribution');
 const heading=view(h).querySelector('.page-heading>h1');assert.equal(heading.textContent,'Review contribution');assert(heading.classList.contains('product-title-echo'));
 L.continuePayment();settle(h);chrome(f,'Authorise contribution');h.set('payment-pin','123456');L.authorizePayment();settle(h);assert.equal(L.route,'paymentResult');chrome(f,'Contribution result');
 assert.equal(L.state.balance,550);assert.equal(L.state.txs.length,1);assert.equal(L.groupMoney.summary(item).balanceCents,65000);
});

test('contextual cancellation labels preserve the original explicit leave choices',()=>{
 const f=fixture(),{L,h}=f;payout(f,'lumo');L.leavePayment();settle(h);chrome(f,'Leave this payout?');assert.match(view(h).textContent,/Keep draft & leave/);assert.match(view(h).textContent,/Discard draft/);L.collectionPayoutRails.leave({discard:true});settle(h);
 const item=L.groupMoney.list()[0];L.openCollectionContribution(item.id);settle(h);L.leavePayment();settle(h);chrome(f,'Leave this contribution?');assert.match(view(h).textContent,/Keep draft & leave/);assert.match(view(h).textContent,/Discard draft/);
});

test('ordinary payment entry review authorisation and results retain native labels',()=>{
 const f=fixture(),{L,h}=f;L.startSend('lumo');settle(h);chrome(f,'Send money',{treatment:'selection'});L.pickPerson('abena');settle(h);chrome(f,'Payment amount',{treatment:'edit'});
 h.set('payment-amount','20');h.set('payment-note','Lunch');L.preparePayment();settle(h);chrome(f,'Review payment');L.continuePayment();settle(h);chrome(f,'Authorise payment');h.set('payment-pin','123456');L.authorizePayment();settle(h);chrome(f,'Payment result');assert.equal(L.state.txs.length,1);assert.equal(L.state.balance,580);
});

test('Money Box transfers retain native transfer labels and financial state before authorisation',()=>{
 const f=fixture(),{L,h}=f;L.state.goals=[{id:'box',name:'Laptop',target:800,allocated:200,boxVersion:2}];const before=financial(L);
 L.startMoneyBoxTransfer('box','in');settle(h);h.set('allocation','20');L.reviewAllocation();settle(h);chrome(f,'Review transfer');L.continuePayment();settle(h);chrome(f,'Authorise transfer');assert.equal(financial(L),before);
});

test('static Money Boxes and Profile aliases retain accessible echoes alongside edition artwork',()=>{
 const f=fixture(),{L,h}=f;
 for(const [route,title,text,kind]of [['goals','Your Money Boxes','Money Boxes','plan'],['profile','Your profile','Profile','account']]){
  L.go(route);settle(h);chrome(f,title,{kind});const heading=view(h).querySelector('.page-heading>h1');assert.equal(heading.textContent,text);assert(heading.classList.contains('product-title-echo'));assert.equal(heading.getAttribute('aria-hidden'),null);
  const accountArt=heading.parentElement.querySelector('.signal-account-mark');
  if(route==='profile'&&L.signalAccount){assert(accountArt);assert.equal(accountArt.getAttribute('aria-hidden'),'true');assert(!heading.parentElement.classList.contains('product-title-only'),'The new decorative account mark remains visible beside the native title echo');}
  else assert(heading.parentElement.classList.contains('product-title-only'));
 }
 L.state.goals=[{id:'entity',name:'Profile',target:800,allocated:20,boxVersion:2}];L.go('goal',{id:'entity'});settle(h);const entity=view(h).querySelector('.page-heading>h1');assert.equal(entity.textContent,'Profile');assert(!entity.classList.contains('product-title-echo'));assert.equal(entity.getAttribute('data-mono-title-echo'),null);assert.deepEqual(h.errors,[]);
});

test('repeat rendering cannot grant authority change registration metadata or move funds',()=>{
 const f=fixture(),{L,h}=f;payout(f,'bank');const before=JSON.stringify(L.state),coverage=JSON.stringify(L.taskSheet.coverage),history=JSON.stringify(h.history.state);
 for(let n=0;n<3;n++){L.render();settle(h);chrome(f,'Review payout');}
 assert.equal(JSON.stringify(L.state),before);assert.equal(JSON.stringify(L.taskSheet.coverage),coverage);assert.equal(JSON.stringify(h.history.state),history);
});

test('native Back names depth family and treatment match an adapter-free control journey',()=>{
 function journey(adapter){
  const f=fixture({adapter}),{L,h}=f,item=collection(f),steps=[],before=financial(L);
  const record=()=>{settle(h);const layer=h.document.getElementById('task-sheet-title').closest('.task-sheet-layer');steps.push({route:L.route,kind:L.taskSheet.kind,treatment:L.taskSheet.treatment,parent:L.taskSheet.parentRoute,back:layer.querySelector('.task-sheet-back').getAttribute('aria-label'),depth:h.history.state.taskSheet.depth});};
  L.gm.startProposal(item.id);record();L.collectionPayoutRails.choose('lumo');record();L.pickPerson('abena');record();h.set('payment-amount','150');h.set('payment-note','Transport');L.reviewTransactionDetails();record();L.continuePayment();record();h.history.back();record();h.history.forward();record();
  assert.equal(financial(L),before,'Each journey preserves its own financial state, including account creation metadata');
  return {steps,coverage:JSON.stringify(L.taskSheet.coverage)};
 }
 assert.deepEqual(journey(true),journey(false));
});
