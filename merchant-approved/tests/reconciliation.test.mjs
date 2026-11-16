import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileRows} from '../dist/reconciliation.js';
import {createBusiness,reduceBusiness,ledger} from '../dist/domain.js';
const registration={name:'Reconcile Kitchen',ownerName:'Owner',phone:'0240000000',businessType:'sole-trader',destination:'Test bank',verification:{identity:true,face:true},shop:{name:'Night Market',area:'Night Market',category:'Food',lat:5.65,lng:-.18}};
function setup(){let state=createBusiness(registration);for(const [index,status]of ['paid','paid','processing'].entries()){state=reduceBusiness(state,'PAY',{shopId:state.shops[0].id,amount:(index+1)*1000,status,payer:'Test '+index},{role:'student'}).state;}return state;}

test('reference and internal-ID aliases can match one receipt only once in preview and saved results',()=>{
 const state=setup(),payment=state.transactions.find(tx=>tx.amount===1000),rows=[{reference:payment.reference,amount:1000,status:'paid'},{reference:payment.id,amount:1000,status:'confirmed'}];
 const preview=reconcileRows(state,rows),saved=reduceBusiness(state,'SAVE_RECONCILIATION',{source:'Test statement',rows},{role:'owner'});
 assert.equal(preview.matched,1);assert.equal(preview.duplicates,1);assert.equal(preview.matchedTotal,1000);assert.equal(preview.exceptions,1);
 assert.deepEqual(saved.entity.results,preview.results);assert.equal(saved.entity.matchedTotal,preview.matchedTotal);assert.deepEqual(ledger(saved.state),ledger(state));
});

test('unknown references, incorrect amounts and unconfirmed statuses never become successful matches',()=>{
 const state=setup(),paid=state.transactions.find(tx=>tx.amount===1000),other=state.transactions.find(tx=>tx.amount===2000),pending=state.transactions.find(tx=>tx.status==='processing');
 const comparison=reconcileRows(state,[{reference:paid.reference,amount:1001,status:'paid'},{reference:other.id,amount:2000,status:'failed'},{reference:pending.reference,amount:3000,status:'paid'},{reference:'not-a-receipt',amount:1000,status:'paid'}]);
 assert.equal(comparison.matched,0);assert.equal(comparison.matchedTotal,0);assert.equal(comparison.exceptions,4);assert.equal(comparison.mismatches,3);assert.equal(comparison.unmatched,1);
 assert.equal(comparison.results[3].paymentId,null);
});

test('an ambiguous alias is an exception and malformed imported money is rejected atomically',()=>{
 const state=setup();state.transactions[0].reference=state.transactions[1].id;
 const comparison=reconcileRows(state,[{reference:state.transactions[1].id,amount:state.transactions[1].amount,status:'paid'}]);
 assert.equal(comparison.results[0].result,'ambiguous-reference');assert.equal(comparison.matchedTotal,0);
 const before=structuredClone(state);
 assert.throws(()=>reduceBusiness(state,'SAVE_RECONCILIATION',{source:'Bad amount',rows:[{reference:'unknown',amount:1.1}]},{role:'owner'}),/whole pesewas/);
 assert.deepEqual(state,before);
});
