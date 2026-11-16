import test from 'node:test';
import assert from 'node:assert/strict';
import {activationReadiness,parseReconciliationRows,reconcileRows,operationExceptions,createOperations,shopPhoneReadiness,filterReconciliationResults,reconciliationExportRows} from '../dist/operations.js';
import {createBusiness,reduceBusiness} from '../dist/domain.js';

const stamp='2026-11-11T10:00:00.000Z';
const snapshot=()=>({
 business:{id:'business-one',name:'Campus Foods',ownerName:'Test Owner',accountNumber:'9900123456',verificationStatus:'approved-demo'},
 shops:[{id:'shop-one',name:'Night Market',area:'Night Market',code:'TEST101',lat:5.65,lng:-.187,open:true,accepting:true,published:true,createdAt:'2026-11-10T08:00:00.000Z',activation:{locationConfirmed:true,qrReady:true}},{id:'shop-two',name:'Pentagon',area:'Pentagon',code:'TEST102',createdAt:'2026-11-10T08:00:00.000Z',lat:5.66,lng:-.18,open:true,accepting:true}],
 staff:[{id:'staff-one',authUserId:'user-one',name:'Test Cashier',active:true,shopIds:['shop-one']}],
 transactions:[{id:'tx-one',shopId:'shop-one',reference:'REF001',amount:2500,status:'paid',createdAt:stamp},{id:'tx-two',shopId:'shop-one',reference:'REF002',amount:1000,status:'processing',createdAt:stamp}],
 closings:[],refunds:[],settlements:[],tickets:[],shifts:[],reconciliations:[]
});

test('counter readiness requires actual staff, tested active receiving device and confirmed receipt',()=>{
 const data=snapshot(),s=data.shops[0];
 const steps=activationReadiness(data,s,[{shopId:s.id,active:true,enabled:true,soundReady:true,lastTestAt:stamp,lastSeen:stamp}],{now:Date.parse(stamp)});
 assert.equal(steps.filter(step=>step.done).length,6);
 data.transactions[0].status='processing';
 s.activation.payment=true;
 assert.equal(activationReadiness(data,s,[{shopId:s.id,active:true,enabled:true,soundReady:true,lastTestAt:stamp,lastSeen:stamp}],{now:Date.parse(stamp)}).find(step=>step.key==='payment').done,false);
 assert.equal(activationReadiness(data,s,[{shopId:s.id,active:false,lastTestAt:stamp}]).find(step=>step.key==='phone').done,false);
 assert.equal(activationReadiness(data,s,[{shopId:s.id,active:true,lastTestAt:stamp,revokedAt:stamp}]).find(step=>step.key==='phone').done,false);
});

test('readiness never counts another shop’s team or receipt',()=>{
 const data=snapshot(),second=data.shops[1];
 second.activation={locationConfirmed:true,qrReady:true};
 const steps=activationReadiness(data,second,[]);
 assert.equal(steps.find(step=>step.key==='people').done,false);
 assert.equal(steps.find(step=>step.key==='payment').done,false);
 assert.deepEqual(activationReadiness(data,null),[]);
});

test('statement parsing handles BOM, quoted fields, CRLF and exact pesewas',()=>{
 const rows=parseReconciliationRows('\uFEFFreference,amount,status\r\n"REF,ONE",25.01,confirmed\r\nREF002,10,pending\r\nREF003,0.5,failed\r\n');
 assert.deepEqual(rows,[{reference:'REF,ONE',amount:2501,status:'paid'},{reference:'REF002',amount:1000,status:'processing'},{reference:'REF003',amount:50,status:'failed'}]);
});

test('statement parsing rejects invalid money, statuses, headers and broken quoting',()=>{
 for(const source of ['ref,value\nA,1','reference,amount\nA,0','reference,amount\nA,-1','reference,amount\nA,1.001','reference,amount,status\nA,1,maybe','reference,amount\n"A,1']){
  assert.throws(()=>parseReconciliationRows(source));
 }
});

test('reconciliation distinguishes duplicate, missing, amount and status exceptions without changing money',()=>{
 const data=snapshot(),before=structuredClone(data);
 const result=reconcileRows(data,[{reference:'REF001',amount:2500,status:'paid'},{reference:'REF001',amount:2500,status:'paid'},{reference:'REF002',amount:1000,status:'paid'},{reference:'NOREF',amount:100,status:'paid'},{reference:'REF001',amount:2501,status:'paid'}]);
 assert.deepEqual(result.results.map(row=>row.result),['matched','duplicate','payment-not-confirmed','unmatched','duplicate']);
 assert.equal(result.matched,1);assert.equal(result.unmatched,1);assert.equal(result.duplicates,2);assert.equal(result.mismatches,1);
 assert.deepEqual(data,before);
 const mismatch=reconcileRows(data,[{reference:'REF001',amount:2499,status:'paid'}]);assert.equal(mismatch.results[0].result,'amount-mismatch');
});

test('owner attention checks include aged payments, stale phones, unallocated receipts and missed closings',()=>{
 const data=snapshot();
 data.transactions.push({id:'tx-unassigned',shopId:null,status:'paid',amount:100,reference:'NO-SHOP',createdAt:stamp});
 data.refunds.push({status:'requested'});
 data.settlements.push({status:'processing',createdAt:'2026-11-09T10:00:00.000Z'});
 const items=operationExceptions(data,[{shopId:'shop-one',active:true,lastSeen:stamp}],Date.parse('2026-11-11T10:30:00.000Z'));
 for(const type of ['closing','device','payment','unallocated','refund','settlement'])assert.ok(items.some(item=>item.type===type),type);
 assert.ok(items.find(item=>item.type==='payment').detail.includes('GH₵10.00'));
});

test('operations renderer restricts owner queue and manager shop scope, escaping user content',()=>{
 const data=snapshot();data.shops[0].name='<script>not HTML</script>';
 const manager=createOperations({getState:()=>data,getSession:()=>({role:'manager',userId:'user-one',shopIds:['shop-one']}),getShopId:()=> 'shop-one'});
 const shopHTML=manager.render('shop-operations');
 assert.match(shopHTML,/&lt;script&gt;/);assert.doesNotMatch(shopHTML,/<script>/);assert.doesNotMatch(shopHTML,/<option value="shop-two"/);
 assert.match(manager.render('operations'),/Owner access required/);
 const owner=createOperations({getState:()=>data,getSession:()=>({role:'owner',userId:'owner'})});
 for(const page of ['activation','shop-operations','operations'])assert.ok(owner.render(page).length>1000);
 assert.match(createOperations({getState:()=>data}).render('operations'),/Sign in to continue/);
});

test('shop draft fields survive an operations redraw',()=>{
 const data=snapshot(),controller=createOperations({getState:()=>data,getSession:()=>({role:'manager',userId:'user-one',shopIds:['shop-one']})});
 controller.render('shop-operations');
 controller.handleChange({name:'hours',value:'8 am – midnight'});
 controller.handleChange({name:'landmark',value:'Beside the main entrance'});
 controller.handleChange({name:'cutoff',value:'03:00'});
 controller.handleChange({name:'closeMode',value:'automatic'});
 const html=controller.render('shop-operations');
 assert.match(html,/8 am – midnight/);assert.match(html,/Beside the main entrance/);assert.match(html,/value="03:00"/);
 assert.match(html,/<option value="automatic" selected>/);
});

test('operations forms execute manager settings, shifts, owner case updates and saved comparisons through the real domain',async()=>{
 let data=createBusiness({name:'Operations Test Foods',ownerName:'Test Owner',phone:'0245550100',businessType:'sole-trader',destination:'Test destination',verification:{identity:true,face:true},shop:{name:'Night Market',area:'Night Market',category:'Food',lat:5.65,lng:-.18}});
 const sid=data.shops[0].id,staff=data.staff[0];
 staff.authUserId='manager-user';staff.shopIds=[sid];
 let actor={role:'manager',userId:'manager-user',staffId:staff.id,shopId:sid};
 const apply=async(type,payload)=>{const result=reduceBusiness(data,type,payload,actor);data=result.state;return result.entity};
 const controller=createOperations({getState:()=>data,getSession:()=>({...actor,shopIds:[sid]}),getShopId:()=>sid,act:apply});
 const NativeFormData=globalThis.FormData;
 globalThis.FormData=class {constructor(form){this.values=form.values}*[Symbol.iterator](){yield* Object.entries(this.values)}};
 const form=(kind,values)=>({dataset:{operationsForm:kind},values,querySelector:()=>null});
 try{
  await controller.handleClick('ops-toggle');
  assert.equal(data.shops[0].accepting,false);
  await controller.handleSubmit(form('shop',{shopId:sid,hours:'8 am – midnight',landmark:'Near the west gate',lat:'5.651',lng:'-.188'}));
  assert.equal(data.shops[0].landmark,'Near the west gate');
  await controller.handleSubmit(form('closing',{shopId:sid,cutoff:'03:00',closeMode:'automatic'}));
  assert.equal(data.shops[0].cutoff,'03:00');assert.equal(data.shops[0].closeMode,'automatic');
  await controller.handleClick('ops-start-shift');
  assert.equal(data.shifts[0].staffId,staff.id);
  await controller.handleSubmit(form('shift',{id:data.shifts[0].id,note:'Next shift should check the volume.'}));
  assert.equal(data.shifts[0].status,'closed');assert.match(data.shifts[0].note,/volume/);
  actor={role:'owner',userId:'owner-user'};
  const receipt=(await apply('PAY',{shopId:sid,amount:2500,payer:'Test Student',status:'paid',method:'qr'}));
  const ticket=(await apply('ADD_TICKET',{subject:'Phone help',message:'Check this receiving phone.',shopId:sid}));
  await controller.handleClick('ops-ticket',{dataset:{id:ticket.id}});
  await controller.handleSubmit(form('ticket',{id:ticket.id,status:'resolved',response:'The receiving phone was tested.'}));
  assert.equal(data.tickets[0].status,'resolved');assert.equal(data.tickets[0].responses.length,1);
  await controller.handleSubmit(form('reconciliation',{source:'Test statement',period:'Today',statement:`reference,amount,status\n${receipt.reference},25.00,paid`}),{submitter:{value:'save'}});
  assert.equal(data.reconciliations.length,1);assert.equal(data.reconciliations[0].matched,1);
  assert.equal(data.transactions.length,1,'comparing statements must not create extra money');
 }finally{globalThis.FormData=NativeFormData}
});

test('muted, offline, revoked and sound-locked phones never complete counter readiness',()=>{
 const data=snapshot(),shop=data.shops[0],now=Date.parse(stamp);
 const good={shopId:shop.id,enabled:true,soundReady:true,testedAt:stamp,lastSeen:stamp};
 assert.equal(shopPhoneReadiness(shop.id,[good],[],now).ready,true);
 for(const changed of [{enabled:false},{lastSeen:'2026-11-11T09:58:00.000Z'},{revokedAt:stamp},{soundReady:false},{testedAt:null},{pairedAt:'2026-11-11T10:01:00.000Z'}]){
  const device={...good,...changed};
  assert.equal(shopPhoneReadiness(shop.id,[device],[],now).ready,false,JSON.stringify(changed));
  assert.equal(activationReadiness(data,shop,[device],{now}).find(step=>step.key==='phone').done,false);
  assert.ok(operationExceptions(data,[device],now).some(item=>item.type==='device'&&item.shopId===shop.id));
 }
});

test('privacy-safe shop readiness covers a cashier phone without disclosing its device identity',()=>{
 const data=snapshot(),shop=data.shops[0],now=Date.parse(stamp);
 data.shopReadiness=[{shopId:shop.id,phoneReady:true,phoneCount:1,readyCount:1,offlineCount:0,checkedAt:stamp,readyUntil:'2026-11-11T10:01:30.000Z'}];
 const step=activationReadiness(data,shop,[],{now}).find(step=>step.key==='phone');
 assert.equal(step.done,true);
 assert.equal(activationReadiness(data,shop,[],{now:now+91000}).find(step=>step.key==='phone').done,false,'cached readiness must expire');
 assert.equal(JSON.stringify(step).includes('deviceId'),false);
 const controller=createOperations({getState:()=>data,getSession:()=>({role:'manager',shopIds:[shop.id]}),getDeviceReadiness:()=>data.shopReadiness,getConnectionStatus:()=> 'offline'});
 assert.match(controller.render('activation'),/A receiving phone is offline/);
});

test('missed-close alerts follow Ghana cutoff and do not warn a newly opened shop before its first cutoff',()=>{
 const data=snapshot(),shop=data.shops[0];shop.cutoff='03:00';
 data.transactions=[];data.closings=[{id:'last',shopId:shop.id,createdAt:'2026-11-11T03:00:00.000Z',businessDay:'2026-11-10',cutoff:'03:00',transactionIds:[],refundIds:[]}];
 assert.equal(operationExceptions(data,[],Date.parse('2026-11-12T02:59:00.000Z')).some(item=>item.type==='closing'&&item.shopId===shop.id),false);
 assert.equal(operationExceptions(data,[],Date.parse('2026-11-12T06:00:00.000Z')).some(item=>item.type==='closing'&&item.shopId===shop.id),true,'27 hours since last close is already overdue for a 3am cutoff');
 shop.createdAt='2026-11-12T05:00:00.000Z';data.closings=[];
 assert.equal(operationExceptions(data,[],Date.parse('2026-11-12T06:00:00.000Z')).some(item=>item.type==='closing'&&item.shopId===shop.id),false);
});

test('selected shop is retained by navigation, receiving-phone and invitation handoffs',async()=>{
 const data=snapshot(),calls=[];let appShop='shop-one';
 const controller=createOperations({getState:()=>data,getSession:()=>({role:'owner'}),getShopId:()=>appShop,onSelectShop:id=>{appShop=id},onNavigate:(...args)=>calls.push(['navigate',...args]),onSound:id=>calls.push(['sound',id]),onInvite:id=>calls.push(['invite',id]),onQR:id=>calls.push(['qr',id])});
 controller.render('activation');await controller.handleChange({name:'operationsShop',value:'shop-two'});
 for(const action of ['ops-checkout','ops-shop','ops-sound','ops-invite','ops-qr'])await controller.handleClick(action);
 assert.equal(appShop,'shop-two');
 assert.deepEqual(calls,[['navigate','checkout','shop-two'],['navigate','shop-operations','shop-two'],['sound','shop-two'],['invite','shop-two'],['qr','shop-two']]);
});

test('publication is deliberate and does not require a first payment',async()=>{
 const data=snapshot(),shop=data.shops[0],actions=[];shop.published=false;data.transactions=[];
 data.shopReadiness=[{shopId:shop.id,phoneReady:true,phoneCount:1}];
 const controller=createOperations({getState:()=>data,getSession:()=>({role:'owner'}),act:async(type,payload)=>{actions.push([type,payload]);shop.published=payload.published;return shop}});
 let html=controller.render('activation');
 assert.match(html,/Publishing makes the shop name, hours, landmark and map pin visible/);
 assert.match(html,/data-action="ops-publish"\s*>/,'ready minimum allows explicit publication before first receipt');
 await controller.handleClick('ops-publish');assert.deepEqual(actions,[['UPDATE_SHOP',{id:shop.id,published:true}]]);
 assert.equal(data.transactions.length,0);
 html=controller.render('activation');assert.match(html,/Remove from campus search/);
 data.shopReadiness=[{shopId:shop.id,phoneReady:false,phoneCount:1,offlineCount:1}];shop.published=false;
 await controller.handleClick('ops-publish');assert.equal(actions.length,1,'an offline phone prevents publication');
 assert.match(controller.render('activation'),/Confirm the location, display the QR/);
});

test('saved comparisons reopen all rows, paginate beyond 100, filter exceptions and export the same selection',async()=>{
 let data=snapshot();data.transactions=Array.from({length:125},(_,i)=>({id:'tx-'+i,shopId:'shop-one',reference:'ROW'+String(i).padStart(3,'0'),amount:1000,status:'paid',createdAt:stamp}));
 const result=reconcileRows(data,data.transactions.map((tx,i)=>({reference:tx.reference,amount:i===124?1500:1000,status:'paid'})));
 data.reconciliations=[{id:'run-1',source:'Saved statement',createdAt:stamp,period:'Today',...result}];
 let exported;
 const controller=createOperations({getState:()=>data,getSession:()=>({role:'owner'}),onExport:rows=>{exported=rows}});
 controller.setTab('reconciliation');await controller.handleClick('ops-open-reconciliation',{dataset:{id:'run-1'}});
 let html=controller.render('operations');assert.match(html,/Saved comparison/);assert.match(html,/ROW000/);assert.doesNotMatch(html,/>ROW124</);
 await controller.handleClick('ops-result-page',{dataset:{page:'5'}});html=controller.render('operations');assert.match(html,/ROW124/);assert.match(html,/Page 5 of 5/);
 await controller.handleChange({name:'operationsResultExceptions',checked:true});html=controller.render('operations');assert.match(html,/ROW124/);assert.match(html,/1–1 of 1 rows with exceptions/);assert.doesNotMatch(html,/>ROW000</);
 await controller.handleClick('ops-export-results');assert.equal(exported.length,2);assert.equal(exported[1][0],'ROW124');assert.equal(exported[1][1],'15.00');
 assert.equal(filterReconciliationResults(result,{exceptionsOnly:true}).length,1);
 assert.equal(reconciliationExportRows(result,{query:'ROW124'}).length,2);
 const other=snapshot();other.business.id='other-business';other.reconciliations=[];data=other;
 controller.setTab('reconciliation');html=controller.render('operations');assert.doesNotMatch(html,/ROW124|Saved statement/,'comparison data must not leak into another account');
});
