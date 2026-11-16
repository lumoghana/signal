import test from 'node:test';
import assert from 'node:assert/strict';
import {createBusiness, reduceBusiness, metricsFor, ledger, businessDay, applyAutomaticClosings, financialTradingDay, closingTradingDay, isShopCloseDue} from '../dist/domain.js';

const owner = {role: 'owner'};
const student = {role: 'student'};
const registration = {
 name: 'Test Campus Foods', ownerName: 'Test Owner', phone: '0240000000', businessType: 'Sole trader',
 destination: 'GCB Bank · test only', verification: {identity: true, face: true},
 shop: {name: 'Night Market', area: 'Night Market', category: 'Food', lat: 5.6509, lng: -.1878}
};
function setup(now = '2026-11-10T12:00:00.000Z') {
 const state = createBusiness(registration, {now}); const shopId = state.shops[0].id;
 state.staff.push({id: 'cashier', role: 'cashier', name: 'Test Cashier', active: true, shopId});
 const manager = {role: 'manager', shopId, staffId: state.staff[0].id};
 const cashier = {role: 'cashier', shopId, staffId: 'cashier'};
 return {state, shopId, manager, cashier};
}
const apply = (state, type, payload, actor = owner, now = '2026-11-10T12:01:00.000Z') => reduceBusiness(state, type, payload, actor, {now});

test('explicit entrance confirmation survives creating and editing a shop without publishing or claiming QR readiness', () => {
 const {state}=setup(),payload={name:'Confirmed entrance',area:'Sarbah Hall',lat:5.65,lng:-.18,activation:{locationConfirmed:true,qrReady:true}};
 const created=apply(state,'ADD_SHOP',payload);
 assert.equal(created.entity.activation.locationConfirmed,true);assert.equal(created.entity.activation.qrReady,false);assert.equal(created.entity.published,false);
 assert.equal(state.shops.length,1);
 const edited=apply(created.state,'UPDATE_SHOP',{id:created.entity.id,landmark:'Checked entrance',activation:{locationConfirmed:false}});
 assert.equal(edited.entity.activation.locationConfirmed,false);
 const confirmed=apply(edited.state,'UPDATE_SHOP',{id:created.entity.id,hours:'8 am – 10 pm',activation:{locationConfirmed:true}});
 assert.equal(confirmed.entity.activation.locationConfirmed,true);
 for(const activation of [null,'false',[],{locationConfirmed:'false'},{locationConfirmed:1}]){
  assert.throws(()=>apply(state,'ADD_SHOP',{...payload,activation}),/confirmation/);
  assert.throws(()=>apply(created.state,'UPDATE_SHOP',{id:created.entity.id,activation}),/confirmation/);
 }
 const omitted=apply(state,'ADD_SHOP',{...payload,name:'Unchecked entrance',activation:undefined});assert.equal(omitted.entity.activation.locationConfirmed,false);
});

test('pure reducer preserves inputs, supports centrally allocated identity and rejects invalid monetary actions atomically', () => {
 const state = createBusiness(registration, {businessId: 'business-central', shopId: 'shop-central', accountNumber: '9900000001', shopCode: 'LUM000001'});
 assert.equal(state.business.id, 'business-central');assert.equal(state.shops[0].code, 'LUM000001');
 const before = structuredClone(state);
 const result = apply(state, 'PAY', {shopId: state.shops[0].id, amount: 1234, payer: 'Test', attemptId: 'one'}, student);
 assert.deepEqual(state, before);assert.equal(ledger(result.state).balance, 1234);
 assert.throws(() => apply(state, 'PAY', {shopId: state.shops[0].id, amount: -1}, student), /positive amount/);
 assert.deepEqual(state, before);
 const retry = apply(result.state, 'PAY', {shopId: state.shops[0].id, amount: 1234, payer: 'Test', attemptId: 'one'}, student);
 assert.equal(retry.changed, false);assert.equal(retry.entity.id, result.entity.id);
});

test('refunds are counted when paid, including next-day approval and earlier-period adjustments', () => {
 let {state, shopId, cashier} = setup();
 let result = apply(state, 'PAY', {shopId, amount: 5000, payer: 'Test'}, student);state = result.state;
 const txId = result.entity.id;
 state = apply(state, 'CLOSE_DAY', {shopId}, owner, '2026-11-10T22:00:00.000Z').state;
 result = apply(state, 'REFUND', {transactionId: txId, amount: 1000, reason: 'Test refund'}, cashier, '2026-11-10T22:05:00.000Z');state = result.state;
 assert.equal(metricsFor(state, shopId, {now: '2026-11-11T10:00:00.000Z'}).todayRefunds, 0);
 result = apply(state, 'APPROVE_REFUND', {id: result.entity.id, approve: true}, owner, '2026-11-11T10:00:00.000Z');state = result.state;
 const metrics = metricsFor(state, shopId, {now: '2026-11-11T10:01:00.000Z'});
 assert.equal(metrics.todayRefunds, 1000);assert.equal(metrics.priorPeriodRefunds, 1000);assert.equal(metrics.currentNet, -1000);
 assert.equal(ledger(state).balance, 4000);assert.equal(result.entity.priorPeriod, true);
 const closed = apply(state, 'CLOSE_DAY', {shopId}, owner, '2026-11-11T22:00:00.000Z');
 assert.equal(closed.entity.priorPeriodRefunds, 1000);assert.match(closed.entity.adjustmentNote, /earlier closed period/);assert.equal(metricsFor(closed.state, shopId).currentNet, 0);
});

test('late confirmation uses the confirmation business day and daily close never moves merchant funds', () => {
 let {state, shopId} = setup();
 let result = apply(state, 'PAY', {shopId, amount: 2500, status: 'processing', payer: 'Test'}, student, '2026-11-10T23:00:00.000Z');state = result.state;
 assert.equal(ledger(state).balance, 0);
 result = apply(state, 'RESOLVE_PAYMENT', {id: result.entity.id, status: 'paid'}, owner, '2026-11-11T09:00:00.000Z');state = result.state;
 assert.equal(metricsFor(state, shopId, {now: '2026-11-11T10:00:00.000Z'}).todayGross, 2500);
 assert.equal(metricsFor(state, shopId, {now: '2026-11-10T23:30:00.000Z'}).todayGross, 0);
 const balance = ledger(state).balance;
 state = apply(state, 'CLOSE_DAY', {shopId}, owner, '2026-11-11T22:00:00.000Z').state;
 assert.equal(ledger(state).balance, balance);assert.equal(metricsFor(state, shopId).currentNet, 0);
});

test('cutoff follows Ghana time and automatic closing splits overnight payments, saves zero-sales days once', () => {
 let {state, shopId, manager} = setup('2026-11-10T12:00:00.000Z');
 state = apply(state, 'UPDATE_SHOP', {id: shopId, cutoff: '04:00', closeMode: 'automatic', hours: '6 pm – 3 am', landmark: 'Beside the food court'}, manager).state;
 assert.equal(businessDay('2026-11-11T02:00:00.000Z', '04:00'), '2026-11-10');
 state = apply(state, 'PAY', {shopId, amount: 1000}, student, '2026-11-11T02:00:00.000Z').state;
 state = apply(state, 'PAY', {shopId, amount: 2000}, student, '2026-11-11T04:00:00.000Z').state;
 const before = ledger(state).balance;
 let result = applyAutomaticClosings(state, '2026-11-11T05:00:00.000Z');state = result.state;
 assert.equal(result.closings.length, 1);assert.equal(result.closings[0].businessDay, '2026-11-10');assert.equal(result.closings[0].gross, 1000);
 assert.equal(metricsFor(state, shopId, {now: '2026-11-11T05:00:00.000Z'}).currentGross, 2000);
 assert.equal(ledger(state).balance, before);assert.equal(applyAutomaticClosings(state, '2026-11-11T05:00:00.000Z').changed, false);
 result = applyAutomaticClosings(state, '2026-11-13T05:00:00.000Z');state = result.state;
 assert.equal(result.closings.length, 2);assert.equal(result.closings[1].zeroSales, true);
 assert.equal(ledger(state).balance, before);assert.equal(applyAutomaticClosings(state, '2026-11-13T05:00:00.000Z').changed, false);
});

test('a manual zero-sales report is saved and an identical repeated close is idempotent', () => {
 const {state, shopId, manager} = setup();
 const result = apply(state, 'CLOSE_DAY', {shopId}, manager);
 assert.equal(result.entity.zeroSales, true);assert.equal(result.entity.net, 0);assert.equal(result.state.closings.length, 1);
 const retry = apply(result.state, 'CLOSE_DAY', {shopId}, manager);
 assert.equal(retry.changed, false);assert.equal(retry.entity.alreadyClosed, true);assert.equal(retry.state.closings.length, 1);
});

test('shift handover attributes receipts and refuses a cashier closing another person’s shift', () => {
 let {state, shopId, cashier} = setup();
 let result = apply(state, 'START_SHIFT', {shopId}, cashier);state = result.state;const shiftId = result.entity.id;
 result = apply(state, 'CREATE_REQUEST', {shopId, amount: 2000}, cashier);state = result.state;
 result = apply(state, 'PAY', {shopId, amount: 2000, requestId: result.entity.id, payer: 'Test'}, student);state = result.state;
 assert.equal(result.entity.shiftId, shiftId);
 state.staff.push({id: 'cashier-two', name: 'Other', role: 'cashier', active: true, shopId});
 assert.throws(() => apply(state, 'END_SHIFT', {id: shiftId}, {role: 'cashier', shopId, staffId: 'cashier-two'}), /own shift/);
 result = apply(state, 'END_SHIFT', {id: shiftId, note: 'All payments checked'}, cashier, '2026-11-10T20:00:00.000Z');
 assert.equal(result.entity.gross, 2000);assert.equal(result.entity.status, 'closed');assert.equal(result.entity.note, 'All payments checked');
 assert.equal(ledger(result.state).balance, 2000);
});

test('shop readiness and support updates are scoped, and statement matching never changes money', () => {
 let {state, shopId, manager, cashier} = setup();
 state = apply(state, 'UPDATE_ACTIVATION', {shopId, locationConfirmed: true, qrReady: true}, manager).state;
 assert.equal(state.shops[0].activation.locationConfirmed, true);
 assert.throws(() => apply(state, 'UPDATE_ACTIVATION', {shopId, ownerOperated: true}, manager), /owner/);
 state = apply(state, 'UPDATE_ACTIVATION', {shopId, ownerOperated: true}, owner).state;assert.equal(state.shops[0].activation.ownerOperated, true);
 assert.throws(() => apply(state, 'UPDATE_ACTIVATION', {shopId, qrReady: false}, cashier), /manager/);
 let result = apply(state, 'PAY', {shopId, amount: 1000, payer: 'Test'}, student);state = result.state;const reference = result.entity.reference;
 const before = ledger(state);
 result = apply(state, 'SAVE_RECONCILIATION', {source: 'Test statement', rows: [{reference, amount: 1000}, {reference, amount: 1000}, {reference: 'unknown', amount: 500}]});state = result.state;
 assert.equal(result.entity.matched, 1);assert.equal(result.entity.duplicates, 1);assert.equal(result.entity.unmatched, 1);assert.deepEqual(ledger(state), before);
 result = apply(state, 'ADD_TICKET', {shopId, subject: 'Test', message: 'Please check this payment'}, cashier);state = result.state;
 assert.throws(() => apply(state, 'UPDATE_TICKET', {id: result.entity.id, status: 'resolved', response: 'Checked'}, cashier), /owner/);
 result = apply(state, 'UPDATE_TICKET', {id: result.entity.id, status: 'resolved', response: 'Matched to statement'});
 assert.equal(result.entity.status, 'resolved');assert.equal(result.entity.responses[0].message, 'Matched to statement');assert.ok(result.entity.resolvedAt);
});

test('a confirmation arriving after shift handover updates that shift once without moving it to the next cashier', () => {
 let {state, shopId, cashier} = setup();
 let result = apply(state, 'START_SHIFT', {shopId}, cashier);state = result.state;const shiftId = result.entity.id;
 result = apply(state, 'CREATE_REQUEST', {shopId, amount: 2500}, cashier);state = result.state;
 result = apply(state, 'PAY', {shopId, amount: 2500, requestId: result.entity.id, status: 'processing'}, student);state = result.state;const paymentId = result.entity.id;
 result = apply(state, 'END_SHIFT', {id: shiftId}, cashier, '2026-11-10T13:00:00.000Z');state = result.state;assert.equal(result.entity.gross, 0);
 result = apply(state, 'RESOLVE_PAYMENT', {id: paymentId, status: 'paid'}, owner, '2026-11-10T13:01:00.000Z');state = result.state;
 assert.equal(state.shifts[0].gross, 2500);assert.equal(state.shifts[0].lateConfirmedCount, 1);assert.equal(state.transactions[0].shiftId, shiftId);
 const retry = apply(state, 'RESOLVE_PAYMENT', {id: paymentId, status: 'paid'}, owner, '2026-11-10T13:02:00.000Z');
 assert.equal(retry.changed, false);assert.equal(retry.state.shifts[0].gross, 2500);
});


test('frozen financial dates and legacy closing membership survive retrospective cutoff changes', () => {
 let {state, shopId} = setup('2026-11-10T12:00:00.000Z');
 state = apply(state, 'UPDATE_SHOP', {id: shopId, cutoff: '04:00', closeMode: 'automatic'}, owner).state;
 let result = apply(state, 'PAY', {shopId, amount: 2500}, student, '2026-11-11T02:00:00.000Z');state = result.state;const paymentId = result.entity.id;
 state = applyAutomaticClosings(state, '2026-11-11T05:00:00.000Z').state;
 assert.equal(state.closings[0].businessDay, '2026-11-10');
 state = apply(state, 'UPDATE_SHOP', {id: shopId, cutoff: '00:00'}, owner, '2026-11-11T06:00:00.000Z').state;
 const payment = state.transactions.find(tx => tx.id === paymentId);
 assert.equal(financialTradingDay(state,payment), '2026-11-10');assert.equal(payment.tradingCutoff, '04:00');
 assert.equal(metricsFor(state, shopId, {now:'2026-11-11T07:00:00.000Z'}).todayGross, 0);
 const legacy = structuredClone(state);delete legacy.transactions[0].tradingDay;delete legacy.transactions[0].tradingCutoff;
 legacy.closings[0].businessDate=legacy.closings[0].businessDay;delete legacy.closings[0].businessDay;
 assert.equal(financialTradingDay(legacy,legacy.transactions[0]), '2026-11-10');assert.equal(closingTradingDay(legacy,legacy.closings[0]), '2026-11-10');
});

test('moving a cutoff backward does not prematurely archive receipts frozen to the next trading day', () => {
 let {state, shopId} = setup('2026-11-10T12:00:00.000Z');
 let result=apply(state,'PAY',{shopId,amount:1000},student,'2026-11-11T01:00:00.000Z');state=result.state;
 assert.equal(result.entity.tradingDay,'2026-11-11');
 state=apply(state,'UPDATE_SHOP',{id:shopId,cutoff:'04:00',closeMode:'automatic'},owner,'2026-11-11T02:00:00.000Z').state;
 result=applyAutomaticClosings(state,'2026-11-11T05:00:00.000Z');state=result.state;
 assert.equal(result.closings[0].businessDay,'2026-11-10');assert.equal(result.closings[0].gross,0);
 assert.equal(metricsFor(state,shopId,{now:'2026-11-11T05:00:00.000Z'}).currentGross,1000);
 result=applyAutomaticClosings(state,'2026-11-12T05:00:00.000Z');
 assert.equal(result.closings[0].businessDay,'2026-11-11');assert.equal(result.closings[0].gross,1000);assert.equal(ledger(result.state).balance,1000);
});

test('refund approval records the performing owner shift separately from requester and original sale', () => {
 let {state,shopId,cashier} = setup();const ownerActor={role:'owner',userId:'account-owner'};
 let result=apply(state,'START_SHIFT',{shopId},cashier,'2026-11-10T12:00:00.000Z');state=result.state;const cashierShift=result.entity.id;
 result=apply(state,'CREATE_REQUEST',{shopId,amount:5000},cashier,'2026-11-10T12:01:00.000Z');state=result.state;
 result=apply(state,'PAY',{shopId,requestId:result.entity.id,amount:5000},student,'2026-11-10T12:02:00.000Z');state=result.state;const paymentId=result.entity.id;
 result=apply(state,'REFUND',{transactionId:paymentId,amount:1000,reason:'Test return'},cashier,'2026-11-10T12:05:00.000Z');state=result.state;const refundId=result.entity.id;
 assert.equal(result.entity.staffId,null);assert.equal(result.entity.requestedStaffId,'cashier');
 state=apply(state,'END_SHIFT',{id:cashierShift},cashier,'2026-11-10T20:00:00.000Z').state;
 result=apply(state,'START_SHIFT',{shopId},ownerActor,'2026-11-11T09:00:00.000Z');state=result.state;const ownerShift=result.entity.id;
 result=apply(state,'APPROVE_REFUND',{id:refundId,approve:true},ownerActor,'2026-11-11T10:00:00.000Z');state=result.state;
 assert.equal(result.entity.staffId,'owner-account-owner');assert.equal(result.entity.shiftId,ownerShift);assert.equal(result.entity.performedBy,'Test Owner');
 assert.equal(result.entity.requestedStaffId,'cashier');assert.equal(result.entity.requestedShiftId,cashierShift);assert.equal(result.entity.sourceStaffId,'cashier');assert.equal(result.entity.sourceShiftId,cashierShift);
 assert.equal(result.entity.tradingDay,'2026-11-11');assert.equal(state.shifts.find(s=>s.id===cashierShift).refunds,0);
 result=apply(state,'END_SHIFT',{id:ownerShift},ownerActor,'2026-11-11T11:00:00.000Z');state=result.state;
 assert.equal(result.entity.refunds,1000);assert.equal(result.entity.net,-1000);assert.equal(ledger(state).balance,4000);
});

test('close-due checks use the first Ghana cutoff and do not flag a new counter before it has traded', () => {
 let {state,shopId}=setup('2026-11-11T01:00:00.000Z');
 state.shops[0].cutoff='04:00';state.shops[0].createdCutoff='04:00';
 assert.equal(isShopCloseDue(state,shopId,Date.parse('2026-11-11T03:00:00.000Z')),false);
 assert.equal(isShopCloseDue(state,shopId,Date.parse('2026-11-11T05:00:00.000Z')),true);
 state=apply(state,'CLOSE_DAY',{shopId},owner,'2026-11-11T03:30:00.000Z').state;
 assert.equal(isShopCloseDue(state,shopId,Date.parse('2026-11-11T05:00:00.000Z')),false);
});

test('new counters start unpublished and changing visibility does not require or invent a payment', () => {
 const {state,shopId,manager,cashier}=setup();assert.equal(state.shops[0].published,false);
 const published=apply(state,'UPDATE_SHOP',{id:shopId,published:true},manager);
 assert.equal(published.entity.published,true);assert.equal(published.state.transactions.length,0);assert.equal(ledger(published.state).balance,0);
 assert.throws(()=>apply(state,'UPDATE_SHOP',{id:shopId,published:'false'},manager),/published/);
 assert.throws(()=>apply(state,'UPDATE_SHOP',{id:shopId,published:true},cashier),/manager/);
 const fixture=createBusiness(registration,{published:true});assert.equal(fixture.shops[0].published,true);
 const extra=apply(state,'ADD_SHOP',{name:'Second',area:'Pentagon',lat:5.65,lng:-.18,published:true});assert.equal(extra.entity.published,false);
});

test('legacy owner-approved refunds do not keep debiting the requester’s closed handover', () => {
 let {state,shopId,cashier}=setup();
 let result=apply(state,'START_SHIFT',{shopId},cashier);state=result.state;const shiftId=result.entity.id;
 result=apply(state,'CREATE_REQUEST',{shopId,amount:5000},cashier);state=result.state;
 result=apply(state,'PAY',{shopId,requestId:result.entity.id,amount:5000},student);state=result.state;
 state=apply(state,'END_SHIFT',{id:shiftId},cashier,'2026-11-10T20:00:00.000Z').state;
 state.refunds.push({id:'legacy-approved',transactionId:result.entity.id,shopId,amount:1000,status:'paid',staffId:'cashier',shiftId,createdAt:'2026-11-10T19:00:00.000Z',approvedAt:'2026-11-11T10:00:00.000Z',by:'Test Cashier'});
 result=apply(state,'UPDATE_SHOP',{id:shopId,hours:'Open daily'},owner,'2026-11-11T11:00:00.000Z');state=result.state;
 const refund=state.refunds.find(refund=>refund.id==='legacy-approved');
 assert.equal(refund.requestedStaffId,'cashier');assert.equal(refund.requestedShiftId,shiftId);assert.equal(refund.staffId,'owner-legacy-approval');assert.equal(refund.shiftId,null);assert.match(refund.performedBy,/legacy approval/);
 assert.equal(state.shifts.find(shift=>shift.id===shiftId).refunds,0);
});

test('refund retries share one result and a changed fingerprint cannot reuse the attempt reference', () => {
 let {state,shopId}=setup();let result=apply(state,'PAY',{shopId,amount:5000},student);state=result.state;const paymentId=result.entity.id;
 const payload={transactionId:paymentId,amount:2000,reason:'Item unavailable',attemptId:'refund-attempt-one'};
 result=apply(state,'REFUND',payload);state=result.state;const refundId=result.entity.id;
 const retry=apply(state,'REFUND',payload);assert.equal(retry.entity.id,refundId);assert.equal(retry.changed,false);assert.equal(retry.state.refunds.length,1);assert.equal(ledger(retry.state).balance,3000);
 assert.throws(()=>apply(state,'REFUND',{...payload,amount:1000}),/different refund/);
 assert.throws(()=>apply(state,'REFUND',{...payload,reason:'Changed reason'}),/different refund/);
});

test('legacy financial metadata normalises once on sync without creating a closing or moving money', () => {
 let {state,shopId}=setup();let result=apply(state,'PAY',{shopId,amount:2500},student);state=result.state;
 delete state.transactions[0].tradingDay;delete state.transactions[0].tradingCutoff;
 const before=ledger(state);result=applyAutomaticClosings(state,'2026-11-10T20:00:00.000Z');
 assert.equal(result.metadataChanged,true);assert.equal(result.changed,true);assert.equal(result.closings.length,0);assert.deepEqual(ledger(result.state),before);
 const next=applyAutomaticClosings(result.state,'2026-11-10T20:01:00.000Z');assert.equal(next.changed,false);assert.equal(next.metadataChanged,false);
});

test('an owner-operated counter attributes its request to the owner shift while permanent QR receipts stay unattributed', () => {
 let {state,shopId}=setup();const actor={role:'owner',userId:'owner-identity'};
 let result=apply(state,'START_SHIFT',{shopId},actor);state=result.state;const shiftId=result.entity.id;
 result=apply(state,'CREATE_REQUEST',{shopId,amount:2500},actor);state=result.state;
 assert.equal(result.entity.staffId,'owner-owner-identity');assert.equal(result.entity.staffName,'Test Owner');assert.equal(result.entity.shiftId,shiftId);
 result=apply(state,'PAY',{shopId,requestId:result.entity.id,amount:2500},student);state=result.state;
 assert.equal(result.entity.staffId,'owner-owner-identity');assert.equal(result.entity.shiftId,shiftId);assert.equal(result.entity.staffName,'Test Owner');
 result=apply(state,'PAY',{shopId,amount:1500},student);state=result.state;
 assert.equal(result.entity.staffId,null);assert.equal(result.entity.shiftId,null);
 result=apply(state,'END_SHIFT',{id:shiftId},actor);assert.equal(result.entity.gross,2500);assert.equal(ledger(result.state).balance,4000);
});

test('normalization removes an owner-approved legacy refund from a requester handover that already captured it', () => {
 let {state,shopId}=setup();
 state.transactions=[{id:'legacy-sale',shopId,staffId:'cashier',shiftId:'old-shift',amount:5000,status:'paid',payer:'Student',createdAt:'2026-11-10T13:00:00Z',reference:'OLD-SALE',method:'qr'}];
 state.refunds=[{id:'legacy-return',transactionId:'legacy-sale',shopId,staffId:'cashier',shiftId:'old-shift',amount:1000,status:'paid',createdAt:'2026-11-10T14:00:00Z',approvedAt:'2026-11-10T15:00:00Z',by:'Test Cashier'}];
 state.shifts=[{id:'old-shift',shopId,staffId:'cashier',status:'closed',startedAt:'2026-11-10T12:30:00Z',endedAt:'2026-11-10T20:00:00Z',transactionIds:['legacy-sale'],refundIds:['legacy-return'],gross:5000,refunds:1000,net:4000}];
 const before=ledger(state),normalised=applyAutomaticClosings(state,'2026-11-11T10:00:00Z');state=normalised.state;
 assert.equal(normalised.metadataChanged,true);assert.equal(state.refunds[0].staffId,'owner-legacy-approval');assert.equal(state.refunds[0].shiftId,null);
 assert.deepEqual(state.shifts[0].refundIds,[]);assert.equal(state.shifts[0].refunds,0);assert.equal(state.shifts[0].net,5000);assert.deepEqual(ledger(state),before);
 assert.equal(applyAutomaticClosings(state,'2026-11-11T10:01:00Z').changed,false);
});

test('explicitly unassigned events never fall back to handover membership, while genuinely missing legacy fields do', () => {
 let {state,shopId}=setup();
 state.transactions=[
  {id:'legacy',shopId,staffId:'cashier',amount:2500,status:'paid',payer:'Student',createdAt:'2026-11-10T13:00:00Z',reference:'LEGACY',method:'qr'},
  {id:'unassigned',shopId,staffId:'cashier',shiftId:null,amount:1500,status:'paid',payer:'Student',createdAt:'2026-11-10T14:00:00Z',reference:'UNASSIGNED',method:'qr'}
 ];
 state.refunds=[
  {id:'legacy-refund',transactionId:'legacy',shopId,staffId:'cashier',amount:500,status:'paid',createdAt:'2026-11-10T15:00:00Z',by:'Test Cashier'},
  {id:'unassigned-refund',transactionId:'unassigned',shopId,staffId:'cashier',shiftId:null,amount:100,status:'paid',createdAt:'2026-11-10T16:00:00Z',by:'Test Cashier'}
 ];
 state.shifts=[{id:'legacy-shift',shopId,staffId:'cashier',status:'closed',startedAt:'2026-11-10T12:30:00Z',endedAt:'2026-11-10T20:00:00Z',transactionIds:['legacy','unassigned'],refundIds:['legacy-refund','unassigned-refund'],gross:4000,refunds:600,net:3400}];
 state=applyAutomaticClosings(state,'2026-11-11T10:00:00Z').state;
 assert.deepEqual(state.shifts[0].transactionIds,['legacy']);assert.deepEqual(state.shifts[0].refundIds,['legacy-refund']);assert.equal(state.shifts[0].net,2000);
});
