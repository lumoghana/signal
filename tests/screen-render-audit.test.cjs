/* Valid-record simulation smoke checks. The generic route inventory uses
   unavailable IDs; these journeys exercise the record-backed branches too.
   This mounted DOM is not a browser layout or physical-keyboard test. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let passed=0;
const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
const view=h=>h.document.getElementById('view');
const text=h=>view(h).textContent;
const longName='Akua’s Kitchen and Student Food Delivery at the University of Ghana';
const longReference='SALE-20261022-EXTRA-LONG-VALID-REFERENCE-FOR-RENDER-TEST';
function fixture(){
 const h=createHarness({clock:true,testing:true}),{L}=h;L.explore();
 L.state.merchant={approved:true,name:longName,application:{id:'BIZ-LONG-SAMPLE-APPLICATION-REFERENCE',status:'Demo approved'},destination:{institution:'Ghanaian sample settlement institution',name:longName,number:'12345678901234567890',verified:true},collections:[],settlements:[],adjustments:[],roleTerms:true};
 L.route='merchant';L.params={};L.history=[];L.render();h.flush();return h;
}
const clean=h=>assert.deepEqual(h.errors,[]);
function click(h,label){const b=view(h).querySelectorAll('button').find(b=>b.textContent.trim()===label);assert(b,'Visible '+label+' on '+h.L.route);b.click();h.flush();}
function sale(h,amount=5000){const {L}=h;L.go('merchantCollect');h.set('saleAmount',amount);L.acct.createSale();h.flush();const c=L.state.merchant.collections[0];assert(c);return c;}
const studentLedger=L=>JSON.stringify({balance:L.state.balance,txs:L.state.txs,goals:L.state.goals});
check('a real sample sale opens customer preview, validates approval and stays separate from student money',()=>{
 const h=fixture(),{L}=h,before=studentLedger(L),c=sale(h);assert.equal(c.status,'Waiting for customer');const qr=view(h).querySelector('.lumo-payment-qr');assert(qr,'A waiting sale displays its actual Lumo QR');assert.equal(qr.getAttribute('role'),'img');assert(qr.querySelector('path').getAttribute('d').length>100);const payload=L.qr.payload(c.id);assert.match(payload,/^LUMO1:SALE:SALE-/);assert.equal(L.qr.parse(payload).code,c.id);const encoded=L.qr.svg(payload,184);assert.equal(qr.querySelector('path').getAttribute('d'),encoded.match(/<path d="([^"]+)"/)[1]);assert.equal(qr.getAttribute('viewBox'),encoded.match(/viewBox="([^"]+)"/)[1]);assert(text(h).includes('Lumo sample sale QR'));assert(text(h).includes('GH₵5,000.00'));
 L.acct.customerStart(c.id);h.flush();assert.equal(L.route,'merchantPayer');assert(h.document.getElementById('customerCode'));assert(h.document.getElementById('payerApproval'));assert(text(h).includes('GH₵0.00 · demo fee'));assert(text(h).includes(longName));clean(h);
 h.set('customerCode','0000');L.acct.customerPay(c.id);assert.equal(c.status,'Waiting for customer');assert(text(h).includes('sample customer PIN'));
 h.set('customerCode','1234');L.acct.customerPay(c.id);assert.equal(c.status,'Waiting for customer');assert(text(h).includes('must authorise'));
 h.document.getElementById('payerApproval').checked=true;L.acct.customerPay(c.id);h.flush();assert.equal(c.status,'Processing');assert(text(h).includes('Do not create a replacement'));assert(!text(h).includes('Collection confirmed'));
 L.acct.resolveSale(c.id,'Unknown');assert.equal(c.status,'Unknown');assert(text(h).includes('Following this payment'));L.acct.resolveSale(c.id,'Confirmed');assert.equal(c.status,'Confirmed');assert(text(h).includes('Collection confirmed'));assert(text(h).includes('separate settlement result'));assert.equal(studentLedger(L),before);clean(h);
});
check('settlement pending, failure, retry and confirmation keep one obligation and truthful record views',()=>{
 const h=fixture(),{L}=h,c=sale(h,80),before=studentLedger(L);c.status='Processing';L.acct.resolveSale(c.id,'Confirmed');L.acct.createSettlement();h.flush();const s=L.state.merchant.settlements[0];assert(s);assert.equal(s.status,'Queued');assert(text(h).includes('not yet confirmed'));assert.equal(s.net,80);
 L.acct.settleState(s.id,'Processing');assert.equal(s.status,'Processing');assert(text(h).includes('not yet confirmed'));L.acct.settleState(s.id,'Unknown');assert.equal(s.status,'Unknown');assert(text(h).includes('not yet confirmed'));
 L.acct.settleState(s.id,'Failed');assert(text(h).includes('remains owed'));assert.equal(c.status,'Confirmed');L.acct.settleState(s.id,'Processing');assert.equal(s.attempts,2);assert.equal(L.state.merchant.settlements.length,1);assert.equal(c.settlementId,s.id);
 L.acct.settleState(s.id,'Settled');assert(text(h).includes('provider confirmed this batch'));assert(!text(h).includes('Demo settlement response'));L.acct.settleState(s.id,'Failed');assert.equal(s.status,'Settled');assert.equal(studentLedger(L),before);clean(h);
});
check('expired and cancelled valid sale references remain inspectable and cannot authorise another payment',()=>{
 for(const status of ['Expired','Cancelled','Failed']){
  const h=fixture(),{L}=h,c=sale(h,50),before=studentLedger(L);c.id=longReference;c.status=status;L.go('merchantCollection',{id:c.id});h.flush();assert(text(h).includes(longReference));assert(text(h).includes(status));assert(text(h).includes('cannot accept a new payment'));assert(!text(h).includes('Open sample customer payment'));
  L.acct.customerStart(c.id);assert.equal(L.route,'merchantCollection');L.acct.customerPay(c.id);assert.equal(c.status,status);assert.equal(studentLedger(L),before);clean(h);
 }
});
check('long local support content and context preserve the record and return action without exposing fields as markup',()=>{
 const h=fixture(),{L}=h;L.go('supportCase',{reference:longReference,kind:'Merchant settlement',returnRoute:'merchantCollection',returnParams:{id:longReference}});h.set('caseDescription','Please check this reference. '+('word '.repeat(370))+'<script>not markup</script>');L.acct.submitCase();h.flush();assert.equal(L.route,'caseDetail');assert(text(h).includes(longReference));assert(text(h).includes('<script>not markup</script>'));assert.equal(view(h).querySelectorAll('script').length,0);assert(text(h).includes('Return to your task'));assert.equal(L.state.cases[0].context.returnParams.id,longReference);assert.equal(L.state.cases[0].status,'Saved on device');assert(text(h).includes('has not been sent'));clean(h);
});
console.log(passed+' valid-record simulation and long-content smoke checks passed. Browser geometry is checked separately.');
