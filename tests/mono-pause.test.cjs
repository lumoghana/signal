/* Actual-index checks for Monochrome's simplified Pause. The DOM harness checks
   decisions, facts and payment authority; it makes no browser-layout claim. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const view=h=>h.document.getElementById('view');
const settle=h=>{h.flushHistory();h.flush();};
const clean=h=>assert.deepEqual(h.errors,[]);
const moneyState=L=>JSON.stringify([L.state.balance,L.state.txs,L.state.essentials,L.state.goals,L.state.groupMoney?.items]);
const button=(h,code)=>view(h).querySelectorAll('button').find(b=>b.getAttribute('onclick')===code);
const click=(h,code)=>{const b=button(h,code);assert(b,'Existing action '+code+' on '+h.L.route);b.click();settle(h);return b;};
function fixture({balance=600,essentials=[{id:'food',name:'Food',amount:400,paid:0}],reducedMotion=false}={}){
 const h=createHarness({clock:true,deferHistory:true,reducedMotion}),L=h.L;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance,goals:[],essentials,txs:[],requests:[],paymentDraft:null,groupMoney:undefined,allowance:{amount:0,date:''}});
 L.state.profile.pin='123456';L.route='home';L.params={};L.history=[];L.save();L.render();settle(h);return h;
}
function campus(h,amount=280){
 const L=h.L;L.openPayTab('campus');L.pickMerchant('AK01');h.set('payment-amount',amount);if(h.document.getElementById('payment-essential'))h.set('payment-essential','');L.preparePayment();settle(h);
 if(L.route==='paymentReview'){L.continuePayment();settle(h);}
 assert.equal(L.route,'pause');assert(view(h).querySelector('.mono-pause-simple'));return h;
}
function foreground(root){
 function read(node){
  if(node.nodeType===3)return node.text||'';
  if(node.hidden||node.hasAttribute?.('hidden')||node.getAttribute?.('aria-hidden')==='true'||node.classList?.contains('sr-only'))return '';
  if(node.localName==='details'&&!node.hasAttribute('open'))return read(node.querySelector('summary'));
  return (node.childNodes||[]).map(read).join(' ');
 }
 return read(root).replace(/\s+/g,' ').trim();
}
function continueAfterPause(h,wait=3900){
 h.advance(wait);const hold=view(h).querySelector('[data-pause-hold]');assert(hold);hold.click();h.advance(90);settle(h);assert.equal(h.L.route,'authorize');
}
function authorise(h,pin='123456'){
 h.set('payment-pin',pin);h.submit(view(h).querySelector('form'));settle(h);
}

test('one prominent Lumo identity and one consequence replace the competing diagrams without hiding review facts',()=>{
 const h=fixture(),before=moneyState(h.L);campus(h);h.advance(900);
 const screen=view(h),moment=screen.querySelector('.mono-pause-moment'),why=screen.querySelector('.mono-pause-why');
 assert.equal(moment.querySelector('.mono-pause-face img').getAttribute('src'),'/brand/lumo-avatar-icon-512.png');
 assert(moment.querySelector('.mono-pause-character'));assert(moment.querySelector('.mono-pause-hand'),'The original 2D avatar retains its native flat raised hand');assert.equal(moment.querySelector('.signal-pause-label').textContent,'Pause.');assert.equal(screen.querySelectorAll('h1').length,1);
 assert.match(screen.querySelector('.focus-pause-insight h1').textContent,/Food.*GH₵80\.00 short/);
 assert.equal(screen.querySelector('.pause-money-stage'),null);assert.equal(screen.querySelector('.payment-balance'),null);
 assert(why&&!why.hasAttribute('open'));assert.equal(why.querySelector('summary').textContent,'See why');
 assert(why.textContent.includes('AK01'));assert(why.textContent.includes('Available now'));assert(why.textContent.includes('Fee'));
 const visible=foreground(screen);assert(visible.includes('GH₵280.00'));assert(visible.includes('Akua’s Kitchen'));assert(!visible.includes('Available now'));assert(!visible.includes('Budget coverage'));
 assert.equal(button(h,"L.pauseAction('edit_amount')").textContent.trim(),'Change amount');
 assert(button(h,"L.pauseAction('cancel_payment')"));assert.equal(moneyState(h.L),before);clean(h);
});

test('a shared gap names the budget rather than assigning it to one of several costs',()=>{
 const h=campus(fixture({essentials:[{id:'tuition',name:'Tuition',amount:300,paid:0},{id:'transport',name:'Transport',amount:150,paid:0}]}));
 const title=view(h).querySelector('.focus-pause-insight h1').textContent;
 assert.match(title,/budget.*GH₵130\.00 short/i);assert(!/Tuition|Transport/.test(title));
 assert.equal(h.L.planImpactSummary().essentialGap,130);clean(h);
});

test('a pre-existing shortfall is distinguished from the additional shortfall caused by this payment',()=>{
 const h=campus(fixture({essentials:[{id:'food',name:'Food',amount:650,paid:0}]}),100);h.advance(900);
 const title=view(h).querySelector('.focus-pause-insight h1').textContent,why=view(h).querySelector('.mono-pause-why');
 assert.match(title,/adds GH₵100\.00.*budget shortfall/);assert(!title.includes('GH₵150.00'));
 assert(why.textContent.includes('GH₵50.00 was already uncovered'));assert(why.textContent.includes('GH₵150.00'));
 const p=h.L.planImpactSummary();assert.equal(p.totalGapBefore,50);assert.equal(p.extraGap,100);assert.equal(p.totalGap,150);clean(h);
});

test('an ended Budget is qualified on the simple screen while its actual costs and shortfall remain available',()=>{
 const h=fixture(),L=h.L;L.state.planHorizon={mode:'date',date:'2020-10-01'};L.save();const before=moneyState(L);campus(h);h.advance(900);
 const screen=view(h),why=screen.querySelector('.mono-pause-why'),title=screen.querySelector('.focus-pause-insight h1').textContent;
 assert.equal(screen.querySelector('.mono-pause-budget-note').textContent,'Budget period ended.');assert(foreground(screen).includes('Budget period ended.'));
 assert.match(title,/Food.*GH₵80\.00 short/);assert(!/week|goal|laptop/i.test(title));assert.equal(L.planImpactSummary().essentialGap,80);
 assert(!why.hasAttribute('open'));const qualifier=why.querySelector('[data-budget-period]');assert(qualifier);assert.match(qualifier.textContent,/through 1 Oct 2020/);
 assert.equal(screen.querySelectorAll('[data-budget-period]').length,1);assert.equal(moneyState(L),before);assert.equal(L.state.txs.length,0);clean(h);
});

test('without a saved budget Pause shows real remaining money and invents no goal delay',()=>{
 const h=campus(fixture({essentials:[]}),580);h.advance(900);
 const title=view(h).querySelector('.focus-pause-insight h1').textContent;
 assert.match(title,/GH₵20\.00 left/);assert(!/budget|week|laptop|goal|food/i.test(title));
 assert.equal(h.L.state.balance,600);assert.equal(h.L.state.txs.length,0);assert.equal(h.L.pauseEngine.evaluate(h.L.state.paymentDraft).triggered,true);clean(h);
});

test('a payment fee remains explicit beside the exact total while zero fees stay out of the compact summary',()=>{
 const noFee=campus(fixture());assert.equal(view(noFee).querySelector('.mono-pause-fee'),null);assert(!view(noFee).querySelector('.mono-pause-payment').textContent.includes('GH₵0.00'));clean(noFee);
 const h=fixture(),L=h.L;L.startSend('momo');h.set('recipient-number','0241234567');h.set('payment-amount',280);h.submit(view(h).querySelector('form'));settle(h);
 if(L.route==='paymentReview'){L.continuePayment();settle(h);}assert.equal(L.route,'pause');
 assert.equal(L.state.paymentDraft.fee,.5);assert(view(h).querySelector('.mono-pause-payment-line').textContent.includes('GH₵280.50'));
 assert(view(h).querySelector('.mono-pause-fee').textContent.includes('GH₵0.50'));assert(view(h).querySelector('.mono-pause-why').textContent.includes('0241234567'));
 assert.match(view(h).querySelector('.focus-pause-insight h1').textContent,/GH₵80\.50 short/);assert.equal(L.state.balance,600);clean(h);
});

test('the simpler screen retains the reading gate and separate PIN, then debits exactly once',()=>{
 const h=campus(fixture()),L=h.L,before=moneyState(L),hold=view(h).querySelector('[data-pause-hold]');
 hold.click();h.advance(90);settle(h);assert.equal(L.route,'pause');assert.equal(moneyState(L),before);
 h.advance(3809);assert.equal(hold.getAttribute('aria-disabled'),'true');h.advance(1);assert.notEqual(hold.getAttribute('aria-disabled'),'true');
 hold.click();h.advance(89);settle(h);assert.equal(L.route,'pause');h.advance(1);settle(h);assert.equal(L.route,'authorize');assert.equal(moneyState(L),before);
 authorise(h,'000000');assert.equal(L.route,'authorize');assert.equal(moneyState(L),before);assert.match(h.document.getElementById('error').textContent,/PIN/);
 authorise(h);assert.equal(L.route,'paymentResult');assert.equal(L.state.balance,320);assert.equal(L.state.txs.length,1);
 L.authorizePayment();settle(h);assert.equal(L.state.balance,320);assert.equal(L.state.txs.length,1);clean(h);
});

test('reduced motion preserves the same consequence, immediate cancel and full three-second reading window',()=>{
 const h=campus(fixture({reducedMotion:true})),L=h.L,before=moneyState(L),heading=view(h).querySelector('.focus-pause-insight');
 assert.equal(heading.getAttribute('aria-hidden'),'false');assert(!heading.hasAttribute('inert'));
 h.advance(2999);assert.equal(view(h).querySelector('[data-pause-hold]').getAttribute('aria-disabled'),'true');
 h.advance(1);assert.notEqual(view(h).querySelector('[data-pause-hold]').getAttribute('aria-disabled'),'true');
 click(h,"L.pauseAction('cancel_payment')");assert.equal(L.state.paymentDraft,null);assert.notEqual(L.route,'authorize');assert.equal(moneyState(L),before);clean(h);
});

test('an own collection contribution keeps its exact destination and requires biometric demo approval after Pause',()=>{
 const h=fixture({essentials:[{id:'food',name:'Food',amount:350,paid:0}]}),L=h.L,G=L.groupMoney;
 const members=[{id:'self',name:'You',isOwner:true},{id:'abena',name:'Abena'},{id:'kojo',name:'Kojo'}];
 const made=G.createCollection({title:'Class dinner',target:'1200',deadline:new h.context.Date(h.context.Date.now()+14*86400000).toISOString().slice(0,10),members,mandateApproval:'named',mandateApproverIds:['self','abena','kojo'],mandateRequiredApprovals:2,acceptMandate:true,idempotencyKey:'mono-pause-test'});assert(made.ok,made.error);const item=made.item;
 for(const member of members.filter(p=>p.id!=='self'))assert(G.acceptMandate({itemId:item.id,personId:member.id,version:item.mandate.version,sample:true}).ok);
 assert(G.recordSamplePayment({itemId:item.id,personId:'abena',amount:'600',reference:'other-contributor'}).ok);
 L.gm.open(item.id);settle(h);L.openCollectionContribution(item.id);settle(h);h.set('payment-amount',500);L.preparePayment();settle(h);
 assert.equal(L.route,'pause');assert(view(h).querySelector('.mono-pause-simple'));assert(view(h).querySelector('.mono-pause-why').textContent.includes(item.collectionAccount.reference));
 assert.equal(L.accountBalances().operational,600);assert.equal(G.summary(item).balanceCents,60000);assert(button(h,"L.pauseAction('cancel_payment')").textContent.includes('Cancel contribution'));
 continueAfterPause(h);assert.equal(L.accountBalances().operational,600);assert.equal(G.summary(item).balanceCents,60000);
 click(h,'L.biometricPayment.open()');assert.equal(h.document.getElementById('payment-pin'),null);assert(view(h).textContent.includes('Biometric demo'));
 const approve=view(h).querySelectorAll('button').find(b=>b.textContent.trim()==='Approve sample payment');assert(approve);approve.click();settle(h);
 assert.equal(L.route,'paymentResult');assert.equal(L.accountBalances().operational,100);assert.equal(G.summary(item).balanceCents,110000);assert.equal(L.state.txs.filter(row=>row.collectionContribution).length,1);
 L.biometricPayment.approve();settle(h);assert.equal(L.accountBalances().operational,100);assert.equal(G.summary(item).balanceCents,110000);assert.equal(L.state.txs.filter(row=>row.collectionContribution).length,1);clean(h);
});
