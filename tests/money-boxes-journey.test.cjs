/* Mounted Money Box journeys: metadata is not money; authorisation owns moves. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const shipped=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
assert(shipped.includes('two-account-engine.js'),'Two-account engine must be shipped');
assert(shipped.includes('money-boxes.js'),'Money Box journeys must be shipped');
let passed=0;
const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
function fixture(options={}){
 const h=createHarness({clock:true,testing:true,modules:shipped,...options}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:600,txs:[],paymentDraft:null,essentials:[{id:'food',name:'Food',amount:250,paid:0},{id:'transport',name:'Transport',amount:100,paid:0}],goals:[{id:'laptop',name:'Laptop',target:1000,allocated:100,boxVersion:2}],chats:[],allowance:{amount:0,date:''}});
 L.route='plan';L.params={};L.history=[];L.render();h.flush();return h;
}
const view=h=>h.document.getElementById('view');
const text=h=>view(h).textContent;
function submit(h){const button=view(h).querySelector('button[type="submit"]');assert(button,'Mounted form has a submit action');button.click();h.flush();}
function enter(h,direction,amount){h.L.startMoneyBoxTransfer('laptop',direction);h.flush();h.set(direction==='out'?'release':'allocation',amount);submit(h);}
function authorise(h,outcome='Completed'){
 if(h.L.route==='pause'){h.advance(3900);const hold=view(h).querySelector('[data-pause-hold]');assert(hold);hold.click();h.advance(90);h.flush();}
 else {assert.equal(h.L.route,'paymentReview');h.L.continuePayment();h.flush();}
 assert.equal(h.L.route,'authorize');h.set('payment-pin','123456');h.set('payment-outcome',outcome);submit(h);assert.equal(h.L.route,'paymentResult');assert.deepEqual(h.errors,[]);
}
check('Money Box creation accepts no target, creates no money and exposes the next choices',()=>{
 const h=fixture(),{L}=h;const before=L.accountBalances().total;L.go('goalEdit');h.set('goalName','Emergency breathing room');h.set('goalTarget','');h.set('goalDate','');L.saveGoal();h.flush();
 const created=L.state.goals.find(g=>g.name==='Emergency breathing room');assert(created);assert.equal(created.allocated,0);assert.equal(created.target,0);assert.equal(L.accountBalances().total,before);assert.equal(L.state.txs.length,0);assert(text(h).includes('Fund this box'));assert(text(h).includes('Add another Money Box'));assert(text(h).includes('Close'));
 L.go('goalEdit',{id:'laptop'});h.set('goalName','Laptop');h.set('goalTarget',50);L.saveGoal();assert.equal(L.state.goals[0].allocated,100);assert.equal(L.state.goals[0].target,50,'Target is metadata, so overfunding is allowed');
});
check('a deposit moves operational money into savings only after a separately entered PIN',()=>{
 const h=fixture(),{L}=h;enter(h,'in',80);assert.equal(L.state.balance,600);assert.equal(L.state.goals[0].allocated,100);assert.equal(L.state.txs.length,0);authorise(h);
 assert.equal(L.accountBalances().operational,520);assert.equal(L.accountBalances().savings,180);assert.equal(L.accountBalances().total,700);assert.equal(L.balances().room,170);assert.equal(L.state.txs[0].type,'internal');assert.equal(L.state.txs[0].boxDirection,'in');assert(text(h).includes('Your Money Box is funded.'));
 L.authorizePayment();assert.equal(L.state.txs.length,1);assert.equal(L.accountBalances().total,700);
 L.go('story');assert(text(h).includes('GH₵0.00'),'Internal movement is not categorised as spending');
});
check('funding that underfunds the operational budget receives the existing Pause',()=>{
 const h=fixture(),{L}=h;enter(h,'in',280);assert.equal(L.route,'pause');assert(text(h).includes('30'));assert.equal(L.state.balance,600);assert.equal(L.state.goals[0].allocated,100);authorise(h);assert.equal(L.accountBalances().operational,320);assert.equal(L.accountBalances().savings,380);assert.equal(L.balances().gap,30);
});
check('withdrawal uses the Money Box balance, so an empty operational account does not block it',()=>{
 const h=fixture(),{L}=h;L.state.balance=0;enter(h,'out',80);assert.equal(L.route,'paymentReview');assert(!text(h).includes('more needed'));assert(text(h).includes('Everyday money after'));authorise(h);
 assert.equal(L.accountBalances().operational,80);assert.equal(L.state.goals[0].allocated,20);assert.equal(L.accountBalances().total,100);assert.equal(L.state.txs[0].boxDirection,'out');assert(text(h).includes('Back in your Everyday money.'));L.authorizePayment();assert.equal(L.state.txs.length,1);
});
for(const direction of ['in','out'])for(const outcome of ['Pending','Failed'])check(direction+' '+outcome+' reserves the correct ledger and never claims confirmed arrival',()=>{
 const h=fixture(),{L}=h;enter(h,direction,80);authorise(h,outcome);const t=L.state.txs[0];assert.equal(t.status,outcome.toLowerCase());assert.equal(L.state.balance,600);assert.equal(L.state.goals[0].allocated,100);
 assert.equal(L.accountBalances().available,outcome==='Pending'&&direction==='in'?520:600);assert.equal(L.moneyBoxAvailable('laptop'),outcome==='Pending'&&direction==='out'?20:100);assert(text(h).includes(outcome==='Pending'?'Transfer being checked.':'Transfer not completed.'));
 L.go('txDetail',{id:t.id});assert(text(h).includes(outcome==='Pending'?'It has not arrived yet.':'No money moved.'));if(outcome==='Pending'){L.refreshPayment(t.id);assert.equal(t.status,'pending');L.settlePayment(t.id,'success');assert.equal(t.status,'success');assert.equal(L.state.balance,direction==='in'?520:680);assert.equal(L.state.goals[0].allocated,direction==='in'?180:20);L.settlePayment(t.id,'success');assert.equal(L.state.txs.length,1);}
});
check('a changed Money Box quote returns to review and retains the entered amount',()=>{
 const h=fixture(),{L}=h;enter(h,'out',80);L.continuePayment();assert.equal(L.route,'authorize');L.state.balance+=10;h.set('payment-pin','123456');submit(h);assert.equal(L.route,'paymentReview');assert.equal(L.state.txs.length,0);L.editPayment();assert.equal(L.route,'releaseGoal');assert.equal(h.document.getElementById('release').value,'80');
});
check('five incorrect withdrawal PINs lock the account without moving money',()=>{
 const h=fixture(),{L}=h;enter(h,'out',80);L.continuePayment();for(let attempt=0;attempt<5;attempt++){h.set('payment-pin','000000');L.authorizePayment();}assert.equal(L.state.locked,true);assert.equal(L.route,'signin');assert.equal(L.state.balance,600);assert.equal(L.state.goals[0].allocated,100);assert.equal(L.state.txs.length,0);
});
check('funded or pending Money Boxes cannot be archived, and empty archive is reversible',()=>{
 const h=fixture(),{L}=h;L.archiveGoal('laptop');assert(!L.state.goals[0].archived);assert.equal(L.state.goals[0].allocated,100);enter(h,'out',100);authorise(h,'Pending');L.archiveGoal('laptop');assert(!L.state.goals[0].archived);L.settlePayment(L.state.txs[0].id,'success');L.archiveGoal('laptop');assert(L.state.goals[0].archived);assert.equal(L.state.goals.length,1);assert(text(h).includes('Archived Money Boxes'));L.restoreMoneyBox('laptop');assert.equal(L.state.goals[0].archived,false);assert.equal(L.accountBalances().total,700);
});
check('cancelling or closing a transfer never authorises it',()=>{
 const h=fixture(),{L}=h;enter(h,'out',80);L.leavePayment();assert.equal(L.state.balance,600);assert.equal(L.state.goals[0].allocated,100);assert.equal(L.state.txs.length,0);L.discardPayment();assert.equal(L.state.txs.length,0);
});
check('temporary savings transfers preserve and resume the original payment draft',()=>{
 const h=fixture(),{L}=h;L.pickMerchant('AK01');h.set('payment-amount',80);submit(h);const original={...L.state.paymentDraft};L.go('makeRoom');enter(h,'out',20);authorise(h);L.finishPayment();h.flush();
 assert.equal(L.route,'paymentReview');assert.equal(L.state.paymentDraft.id,original.id);assert.equal(L.state.paymentDraft.amount,80);assert.equal(L.state.paymentDraft.name,original.name);assert.equal(L.state.balance,620);
 L.startMoneyBoxTransfer('laptop','out');h.set('release',10);L.cancelMoneyBoxTransfer();assert.equal(L.route,'paymentReview');assert.equal(L.state.paymentDraft.id,original.id);assert.equal(L.state.txs.length,1);
});
check('internal receipt uses transfer status and saved legacy metadata can become a zero-funded box',()=>{
 const h=fixture(),{L}=h;L.state.moneyBoxDraft={name:'Legacy laptop',target:'2000',date:''};L.go('goalEdit');assert.equal(h.document.getElementById('goalName').value,'Legacy laptop');L.saveGoal();assert(!L.state.moneyBoxDraft);assert.equal(L.state.goals.at(-1).allocated,0);
 enter(h,'out',20);authorise(h,'Failed');const t=L.state.txs[0];let download;L.download=(name,body)=>download={name,body};L.downloadReceipt(t.id);assert.equal(download.name,'Lumo_Receipt_'+t.id+'.html');assert(download.body.includes('<dt>Status</dt><dd>Not completed</dd>'));assert(download.body.includes('No money moved.'));assert(download.body.includes('Money Box → Everyday Money'));assert(!download.body.includes('Payment completed'));
});
console.log(passed+' Money Box journey checks passed.');
