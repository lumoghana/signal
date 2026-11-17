import test from 'node:test';
import assert from 'node:assert/strict';
import {createCashier, cashierReceipts, cashierRequests, cashierShiftSummary, appendCashierDigit} from '../dist/cashier.js';

const click = (view, action, extra = {}) => view.handleClick({dataset: {action: `cashier-${action}`, ...extra}});
const request = (id, extra = {}) => ({id, shopId: 'shop-a', staffId: 'a', staffName: 'Ama', counterId: 'counter-a', shiftId: 'shift-a', amount: 2500, status: 'open', createdAt: '2026-11-14T10:00:00Z', expiresAt: '2099-11-14T10:15:00Z', ...extra});
const payment = (id, extra = {}) => ({id, shopId: 'shop-a', staffId: 'a', staffName: 'Ama', counterId: 'counter-a', shiftId: 'shift-a', amount: 2500, status: 'paid', payer: 'Kofi', reference: `LUMO-${id}`, createdAt: '2026-11-14T10:02:00Z', confirmedAt: '2026-11-14T10:02:00Z', ...extra});
function fixture(extra = {}) {
  const state = {business: {id: 'business-a'}, shops: [{id: 'shop-a', name: 'Night Market', code: 'LM123', accepting: true}], staff: [{id: 'a', name: 'Ama'}], shifts: [{id: 'shift-a', shopId: 'shop-a', staffId: 'a', status: 'open'}], requests: [], transactions: [], refunds: [], ...extra};
  let actor = {shopId: 'shop-a', staffId: 'a'}, counter = {id: 'counter-a', mode: 'shared', label: 'Front counter', staffId: 'a', staffName: 'Ama', locked: false}, connectivity = 'online';
  const saved = new Map(), storage = {getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key)};
  const config = {getState: () => state, getActor: () => actor, getCounter: () => counter, getShop: () => state.shops[0], getSession: () => ({id: 'session-a', businessId: 'business-a'}), getConnectivity: () => connectivity, storage, qrSvg: () => '<svg data-qr="test"></svg>', paymentLink: (shopId, r) => `pay/${shopId}/${r?.id || 'static'}`};
  return {state, config, saved, setActor: value => {actor = value;}, setCounter: value => {counter = value;}, setConnectivity: value => {connectivity = value;}};
}

test('counter projection contains its receipts and original cashier, excluding other counters, shops and unattributed shop QR', () => {
  const f = fixture({transactions: [payment('mine'), payment('previous', {staffId: 'previous', staffName: 'Kojo'}), payment('other-counter', {staffId: 'other', counterId: 'counter-b'}), payment('other-shop', {shopId: 'shop-b'}), payment('static', {staffId: null, counterId: null, requestId: null})]});
  assert.deepEqual(cashierReceipts(f.state, f.config.getActor(), f.config.getCounter()).map(item => item.id), ['mine', 'previous']);
  assert.deepEqual(cashierReceipts(f.state, f.config.getActor(), {...f.config.getCounter(), locked: true}), []);
  assert.deepEqual(cashierReceipts(f.state, {}, f.config.getCounter()), []);
});

test('shift total uses only confirmed receipts belonging to this cashier and current shift', () => {
  const f = fixture({transactions: [payment('mine'), payment('old-shift', {shiftId: 'shift-old', amount: 900000}), payment('previous-cashier', {staffId: 'old', amount: 800000}), payment('processing', {status: 'processing', amount: 700000}), payment('static', {shiftId: null, staffId: null, amount: 600000})]});
  assert.deepEqual(cashierShiftSummary(f.state, f.config.getActor(), f.config.getCounter()), {shift: f.state.shifts[0], count: 1, gross: 2500});
});

test('handover keeps pending original requests visible without reassigning their owner', () => {
  const f = fixture({requests: [request('previous', {staffId: 'previous', staffName: 'Kojo'}), request('other', {staffId: 'other', counterId: 'counter-b'}), request('expired', {expiresAt: '2020-01-01T00:00:00Z'})]});
  const pending = cashierRequests(f.state, f.config.getActor(), f.config.getCounter());
  assert.equal(pending.length, 1);
  assert.equal(pending[0].staffId, 'previous');
  assert.equal(pending[0].staffName, 'Kojo');
});

test('a same-amount receipt from another request or static QR does not complete the displayed payment', async () => {
  const f = fixture({requests: [request('current')], transactions: [payment('other', {requestId: 'other'}), payment('static', {staffId: null, counterId: null, requestId: null})]});
  const view = createCashier(f.config);
  await click(view, 'request', {id: 'current'});
  let html = view.render();
  assert.match(html, /Waiting for payment/);
  assert.doesNotMatch(html, /Payment received/);
  f.state.transactions.push(payment('matching', {requestId: 'current'}));
  html = view.render();
  assert.match(html, /Payment received/);
  assert.match(html, /LUMO-matching/);
  assert.match(html, /Next customer/);
});

test('disconnecting cannot show a newly inferred success, even when a cached matching receipt exists', async () => {
  const f = fixture({requests: [request('current')], transactions: [payment('matching', {requestId: 'current'})]});
  const view = createCashier(f.config);
  await click(view, 'request', {id: 'current'});
  f.setConnectivity('offline');
  const html = view.render();
  assert.match(html, /Connection lost/);
  assert.match(html, /Checking connection/);
  assert.doesNotMatch(html, /Payment received/);
});

test('a lost creation response is retrieved with the same attempt after reopening the workspace', async () => {
  const f = fixture(), attempts = [];
  f.config.onCreateRequest = async payload => {attempts.push(payload); throw new Error('Response lost');};
  let view = createCashier(f.config);
  view.handleChange({name: 'cashierAmount', value: '25.50'});
  view.handleChange({name: 'cashierNote', value: 'Lunch'});
  await click(view, 'create');
  assert.equal(attempts.length, 1);
  view = createCashier(f.config);
  assert.match(view.render(), /Retrieve payment QR/);
  f.config.onCreateRequest = async payload => {attempts.push(payload); const created = request('saved', {amount: payload.amount}); f.state.requests.push(created); return created;};
  await click(view, 'create');
  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts[0], attempts[1]);
  assert.equal(f.saved.size, 0);
  assert.match(view.render(), /Ready to scan/);
});

test('locking or switching cashier clears every receipt, draft and confirmation from the screen', async () => {
  const f = fixture({requests: [request('current')], transactions: [payment('matching', {requestId: 'current'})]});
  const view = createCashier(f.config);
  await click(view, 'request', {id: 'current'});
  assert.match(view.render(), /Payment received/);
  f.setActor({shopId: 'shop-a', staffId: null});
  f.setCounter({...f.config.getCounter(), locked: true, staffName: '', eligibleStaff: [{id: 'access-user-a', userId: 'user-a', name: 'Ama', pinReady: true}]});
  const html = view.render();
  assert.match(html, /Who’s collecting/);
  assert.doesNotMatch(html, /LUMO-matching|Payment received|Your shift|Cashier navigation/);
  await click(view, 'request', {id: 'current'});
  assert.doesNotMatch(view.render(), /Payment received/);
});

test('cashier navigation and More provide no owner financial, team, reports or close-day tools', async () => {
  const f = fixture(), view = createCashier({...f.config, onExit: () => {}, onDemoRoles: () => {}, isSample: () => false});
  await click(view, 'menu');
  const html = view.render();
  assert.match(html, /Collect/);
  assert.match(html, /Receipts/);
  assert.match(html, /Sound & receiving phone/);
  assert.match(html, /Sign out of this phone/);
  assert.doesNotMatch(html, /Merchant balance|Settle|Reports|Close shop day|Team &|Explore sample roles/);
});

test('general shop QR receipts stay in a separate read-only list and never enter the shift total', async () => {
  const f = fixture({shopQRReceipts: [payment('static', {staffId: null, counterId: null, requestId: null}), payment('wrong-shop', {shopId: 'shop-b', requestId: null}), payment('request-payment', {requestId: 'request-a'})]});
  const view = createCashier(f.config);
  await click(view, 'shop-receipts');
  const html = view.render();
  assert.match(html, /Shop QR · no cashier assigned/);
  assert.match(html, /LUMO-static/);
  assert.doesNotMatch(html, /LUMO-wrong-shop|LUMO-request-payment|Request a refund|Payment received/);
  assert.equal(cashierShiftSummary(f.state, f.config.getActor(), f.config.getCounter()).gross, 0);
});

test('text amount entry redraws availability and prevents malformed values or extra decimal places', () => {
  let redraws = 0;
  const f = fixture(), view = createCashier({...f.config, onChange: () => {redraws++;}});
  view.handleChange({name: 'cashierAmount', value: '1.25'});
  assert.equal(redraws, 1);
  assert.match(view.render(), /value="1.25"/);
  const invalid = {name: 'cashierAmount', value: '1.250'};
  view.handleChange(invalid);
  assert.equal(invalid.value, '1.25');
  assert.equal(appendCashierDigit('1.25', '0'), '1.25');
  assert.equal(appendCashierDigit('1.25', '⌫'), '1.2');
  assert.equal(appendCashierDigit('', '.'), '0.');
});

test('cashier PIN is cleared from its input before authentication and never persisted or echoed', async () => {
  const OriginalFormData = globalThis.FormData;
  globalThis.FormData = class {constructor(form) {return new Map(Object.entries(form.values));}};
  try {
    const f = fixture();
    f.setActor({shopId: 'shop-a', staffId: null});
    f.setCounter({...f.config.getCounter(), locked: true, eligibleStaff: [{id: 'access-user-a', userId: 'user-a', name: 'Ama', pinReady: true}]});
    const pinInput = {value: '314159'};
    let checked;
    const view = createCashier({...f.config, onUnlock: async payload => {checked = payload; assert.equal(pinInput.value, ''); throw new Error('Try again');}});
    view.render();
    await view.handleSubmit({dataset: {form: 'cashier', cashierForm: 'unlock'}, values: {userId: 'user-a', pin: '314159'}, elements: {namedItem: () => pinInput}});
    assert.deepEqual(checked, {userId: 'user-a', pin: '314159'});
    assert.equal(f.saved.size, 0);
    assert.doesNotMatch(view.render(), /314159/);
  } finally {globalThis.FormData = OriginalFormData;}
});

test('Escape closes the cashier sheet and reports that the keyboard action was handled', async () => {
  const f = fixture(), view = createCashier(f.config);
  await click(view, 'menu');
  let prevented = false;
  assert.equal(view.handleKeydown({key: 'Escape', preventDefault() {prevented = true;}}), true);
  assert.equal(prevented, true);
  assert.equal(view.isOpen(), false);
});

test('sample collection explains its browser scope and offers preview only for an open sample request', async () => {
  const f = fixture({requests: [request('sample-request')]}), previews = [];
  const view = createCashier({...f.config, isSample: () => true, onPreviewPayment: value => previews.push(value.id)});
  await click(view, 'request', {id: 'sample-request'});
  const html = view.render();
  assert.match(html, /Sample in this browser\. Sign in to collect from the Lumo consumer app\./);
  assert.match(html, /Sample QR · this browser only/);
  assert.match(html, /Preview customer payment/);
  await click(view, 'preview-payment');
  assert.deepEqual(previews, ['sample-request']);
  f.state.requests[0].status = 'cancelled';
  await click(view, 'preview-payment');
  assert.equal(previews.length, 1);
  const connected = createCashier({...f.config, isSample: () => false, onPreviewPayment: () => previews.push('forbidden')});
  await click(connected, 'request', {id: 'sample-request'});
  await click(connected, 'preview-payment');
  assert.doesNotMatch(connected.render(), /Sample in this browser|Sample QR ·|Preview customer payment/);
  assert.equal(previews.length, 1);
});


test('cashiers can prepare a shared online amount without posting or relabelling a counter QR',async()=>{
 const f=fixture(),shared=[];f.config.onSharePayment=value=>shared.push(value);const view=createCashier(f.config);view.handleChange({name:'cashierAmount',value:'25.50'});view.handleChange({name:'cashierNote',value:'Order 40'});await click(view,'share-amount');assert.deepEqual(shared,[{amount:2550,description:'Order 40'}]);assert.equal(f.state.requests.length,0);assert.match(view.render(),/Share payment link/);
});

test('cashier sharing keeps a fixed request reference and stops for paid or locked requests',async()=>{
 const f=fixture({requests:[request('current')]}),shared=[];f.config.onSharePayment=value=>shared.push(value);const view=createCashier(f.config);await click(view,'request',{id:'current'});await click(view,'share-request');assert.deepEqual(shared,[{requestId:'current'}]);f.state.transactions.push(payment('paid',{requestId:'current'}));await click(view,'share-request');assert.equal(shared.length,1);f.setCounter({...f.config.getCounter(),locked:true});await click(view,'share-shop');assert.equal(shared.length,1);
});


test('cashier help queue shows own counter cases and status without another cashier or owner thread',async()=>{
 const f=fixture({tickets:[{id:'case-mine',shopId:'shop-a',createdByStaffId:'a',counterId:'counter-a',subject:'Sound problem',message:'Please check sound.',createdAt:'2026-11-14T10:00:00Z',status:'investigating',responses:[{by:'Manager',message:'Checking the speaker.'}]},{id:'case-other',shopId:'shop-a',createdByStaffId:'other',counterId:'counter-a',subject:'Other private case'},{id:'case-owner',shopId:'shop-a',subject:'Owner-only case'},{id:'case-other-counter',shopId:'shop-a',createdByStaffId:'a',counterId:'counter-b',subject:'Other phone case'}]});
 const view=createCashier(f.config);await click(view,'menu');assert.match(view.render(),/My help requests/);await click(view,'help-requests');let html=view.render();
 assert.match(html,/case-mine|Being checked|Checking the speaker/);assert.doesNotMatch(html,/Other private case|Owner-only case|Other phone case/);
 f.setActor({shopId:'shop-a',staffId:'other'});assert.doesNotMatch(view.render(),/case-mine|Checking the speaker/);
});

test('shop receipt screen discloses both capped catch-up channels and an older-reference handoff',async()=>{
 const f=fixture(),view=createCashier(f.config);await click(view,'shop-receipts');const html=view.render();
 assert.match(html,/latest 20 shop QR and 20 online receipts/);assert.match(html,/Ask your manager to check an older or missing reference/);
});

function historyResult(f,receipts,nextCursor=null){
 const actor=f.config.getActor(),counter=f.config.getCounter();
 return {ok:true,readOnly:true,noMutation:true,scope:{businessId:f.state.business.id,sessionId:'session-a',counterId:counter.id,shopId:actor.shopId,staffId:actor.staffId,shiftId:counter.shiftId||'shift-a'},receipts,nextCursor,window:{hours:24}};
}
const historyReceipt=(id,extra={})=>payment(id,{staffId:null,counterId:null,requestId:null,attribution:'shop',unattributed:true,confirmedAt:new Date(Date.now()-60000).toISOString(),createdAt:new Date(Date.now()-60000).toISOString(),...extra});

test('counter browses an earlier actual receipt page without changing shift money or the financial snapshot',async()=>{
 const f=fixture(),calls=[],first=Array.from({length:20},(_,index)=>historyReceipt('recent-'+index)),older=[historyReceipt('older-21'),historyReceipt('older-22')];
 f.config.api=async path=>{calls.push(new URL(path,'https://merchant.test'));return historyResult(f,calls.length===1?first:older,calls.length===1?'first-cursor':null);};
 const view=createCashier(f.config);await click(view,'shop-receipts');let html=view.render();assert.match(html,/Earlier receipts/);assert.match(html,/LUMO-recent-0/);assert.equal(calls[0].searchParams.get('shiftId'),'shift-a');
 await click(view,'earlier-shop-receipts');html=view.render();assert.match(html,/LUMO-older-21|Page 2/);assert.doesNotMatch(html,/LUMO-recent-0/);assert.equal(calls[1].searchParams.get('cursor'),'first-cursor');
 await click(view,'receipt',{id:'older-21'});assert.match(view.render(),/LUMO-older-21|Confirmed by Lumo/);assert.equal(f.state.transactions.length,0);assert.equal(cashierShiftSummary(f.state,f.config.getActor(),f.config.getCounter()).gross,0);assert.equal(f.saved.size,0);
});

test('a failed earlier receipt request retries the same cursor and never invents payment success',async()=>{
 const f=fixture(),calls=[];let fail=true;
 f.config.api=async path=>{const url=new URL(path,'https://merchant.test');calls.push(url);if(url.searchParams.has('cursor')&&fail)throw Error('Connection lost');return historyResult(f,[historyReceipt(url.searchParams.has('cursor')?'older-confirmed':'first-confirmed')],url.searchParams.has('cursor')?null:'same-cursor');};
 const view=createCashier(f.config);await click(view,'shop-receipts');await click(view,'earlier-shop-receipts');assert.match(view.render(),/Connection lost/);assert.doesNotMatch(view.render(),/LUMO-older-confirmed/);fail=false;await click(view,'earlier-shop-receipts');assert.equal(calls[1].searchParams.get('cursor'),calls[2].searchParams.get('cursor'));assert.match(view.render(),/LUMO-older-confirmed/);
});

test('late receipt pages cannot reappear after locking, cashier handover or a new shift for the same cashier',async()=>{
 for(const change of [f=>f.setCounter({...f.config.getCounter(),locked:true}),f=>f.setActor({shopId:'shop-a',staffId:'other'}),f=>f.setCounter({...f.config.getCounter(),shiftId:'new-shift'})]){
  const f=fixture();let finish;const old=historyResult(f,[historyReceipt('late-private')]);f.config.api=()=>new Promise(resolve=>{finish=resolve;});const view=createCashier(f.config),pending=click(view,'shop-receipts');change(f);finish(old);await pending;assert.doesNotMatch(view.render(),/LUMO-late-private/);assert.equal(f.saved.size,0);
 }
});

test('exact-reference search handles missing results and rejects uncertain receipt data',async()=>{
 const f=fixture(),calls=[];f.config.api=async path=>{const url=new URL(path,'https://merchant.test');calls.push(url);return historyResult(f,[]);};
 const OriginalFormData=globalThis.FormData;globalThis.FormData=class{constructor(form){return new Map(Object.entries(form.values||{}));}};
 try{
  const view=createCashier(f.config);await click(view,'shop-receipts');await view.handleSubmit({dataset:{form:'cashier',cashierForm:'receipt-search'},values:{cashierReceiptReference:'MISSING-123'}});assert.equal(calls.at(-1).searchParams.get('reference'),'MISSING-123');assert.match(view.render(),/No confirmed receipt matches this reference/);assert.doesNotMatch(view.render(),/Payment received/);
  f.config.api=async()=>historyResult(f,[historyReceipt('uncertain',{status:'processing'})]);await click(view,'refresh-shop-receipts');assert.match(view.render(),/could not verify this receipt page/);assert.doesNotMatch(view.render(),/LUMO-uncertain/);
 }finally{globalThis.FormData=OriginalFormData;}
});

test('browser-only sample help history remains available without inventing a server counter identity',async()=>{
 const f=fixture({tickets:[{id:'sample-help',shopId:'shop-a',createdByStaffId:'a',counterId:null,subject:'Sample phone help',message:'Check this phone.',status:'open',createdAt:new Date().toISOString()}]});f.config.isSample=()=>true;
 const view=createCashier(f.config);await click(view,'help-requests');assert.match(view.render(),/sample-help|Sample phone help/);assert.equal(f.saved.size,0);
});

test('personal cashier accounts can manage their own recovery but dedicated counters cannot',async()=>{
 const f=fixture();let opened=0;f.setCounter(null);
 const personal=createCashier({...f.config,onRecoverySettings:()=>opened++});await click(personal,'menu');
 assert.match(personal.render(),/Password recovery/);await click(personal,'recovery-settings');assert.equal(opened,1);
 f.setCounter({id:'counter-a',mode:'dedicated',staffId:'a',locked:false});
 const paired=createCashier({...f.config,onRecoverySettings:()=>opened++});await click(paired,'menu');
 assert.doesNotMatch(paired.render(),/data-action="cashier-recovery-settings"/);assert.match(paired.render(),/sign in to your own account/);
 await click(paired,'recovery-settings');assert.equal(opened,1);
 f.setCounter({...f.config.getCounter(),locked:true});await click(paired,'recovery-settings');assert.equal(opened,1);
 f.setCounter(null);const sample=createCashier({...f.config,isSample:()=>true,onRecoverySettings:()=>opened++});await click(sample,'menu');assert.doesNotMatch(sample.render(),/data-action="cashier-recovery-settings"/);await click(sample,'recovery-settings');assert.equal(opened,1);
});
