import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoyalty,loyaltyMembersCsv,loyaltyRulesText} from '../dist/loyalty.js';

const originalFormData=globalThis.FormData;
class Fields {constructor(form){this.entries=form.entries||Object.entries(form.values||{});}*[Symbol.iterator](){yield* this.entries;}getAll(key){return this.entries.filter(([name])=>name===key).map(([,value])=>value);}}
globalThis.FormData=Fields;
test.after(()=>{globalThis.FormData=originalFormData;});
const form=(kind,values={})=>({dataset:{loyaltyForm:kind},values});
const control=(action,extra={})=>({dataset:{action:'loyalty-'+action,...extra}});
const owner={id:'session-a',userId:'user-a',businessId:'business-a',role:'owner',shopIds:['shop-a','shop-b']};
const member={id:'member-a',name:'Ama Example',code:'MEMBER-EXAMPLE-123',phone:'0240000000',phoneMasked:'••••0000',marketingConsent:false,active:true,ruleVersion:1,createdAt:'2026-01-01T10:00:00Z',progress:4,target:5,earning:'visits',history:[],externalSales:[],rewards:[{id:'reward-a',type:'discount',name:'GH₵5 off',value:500,cost:500,minimumSpend:2000,state:'available',expiresAt:'2030-01-01T00:00:00Z'},{id:'reward-item',type:'item',name:'A free drink',value:0,cost:200,state:'available',expiresAt:'2030-01-01T00:00:00Z'}]};
const rules={version:1,earning:'visits',minimumSpend:2000,target:5,onePerDay:true,shopIds:['shop-a','shop-b'],reward:{type:'discount',name:'GH₵5 off',value:500,cost:500,minimumSpend:2000,expiryDays:30}};
const base=()=>({revision:1,access:{canConfigure:true,canEnroll:true,canAdjust:true,canExport:true,canViewReports:true,canListMembers:true,canRecordExternal:true,allowedShopIds:['shop-a','shop-b']},programme:{id:'programme-a',name:'Campus Regulars',colour:'#d6f675',status:'active',currentVersion:1,budgetLimit:50000,budgetUsed:1000,budgetRemaining:49000},rules:structuredClone(rules),ruleVersions:[structuredClone(rules)],managerShopIds:[],shops:[{id:'shop-a',name:'Night Market'},{id:'shop-b',name:'Pentagon'}],members:[structuredClone(member)],member:null,metrics:{members:1,repeatMembers:1,memberSales:10000,confirmedPurchases:5,averagePurchase:2000,redeemedRewards:1,outstandingRewards:1,outstandingCost:500,rewardCostUsed:500,discountsGiven:500,externalRecordedSales:0},activity:[],reviews:[]});
function memory(){const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),values};}
function fixture({data=base(),role='owner',sample=false,storage=memory(),api,extra={}}={}){
 let current={...owner,role},counter=null,shop='shop-a',epoch='epoch-a',draws=0;const requests=[],collected=[],downloads=[];
 const state={business:{id:'business-a',name:'Campus Shop'},shops:[{id:'shop-a',name:'Night Market'},{id:'shop-b',name:'Pentagon'}],transactions:[{id:'tx-a',status:'paid',amount:2500,shopId:'shop-a',reference:'REF-A',createdAt:'2026-01-01T10:00:00Z'}]};
 const invoke=async(path,options)=>{requests.push({path,options:options?structuredClone(options):undefined});if(api)return api(path,options,{data,current,state});const result=structuredClone(data);const params=new URL(path,'https://example.test').searchParams;if(params.get('memberId')===member.id||params.get('code')===member.code)result.member=structuredClone(member);return {ok:true,loyalty:result};};
 const config={getState:()=>state,getSession:()=>current,getCounter:()=>counter,getShopId:()=>shop,getAuthEpoch:()=>epoch,isSample:()=>sample,storage,api:invoke,onChange:()=>draws++,onCollect:e=>collected.push(e),download:(...args)=>downloads.push(args),now:()=>Date.parse('2026-11-17T00:00:00Z'),...extra};
 const module=createLoyalty(config);
 return {module,config,requests,collected,downloads,storage,data,state,getDraws:()=>draws,setUser:s=>{current=s;},setCounter:c=>{counter=c;},setShop:s=>{shop=s;},setEpoch:e=>{epoch=e;}};
}
const findMember=async f=>{await f.module.refresh();await f.module.handleSubmit(form('lookup',{memberCode:member.code}));};

test('sample and signed-out workspaces do not fabricate a programme, members or balances',async()=>{
 const f=fixture({sample:true});assert.match(f.module.render(),/Sign in to register customers/);await f.module.refresh();assert.equal(f.requests.length,0);assert.doesNotMatch(f.module.render(),/Campus Regulars|GH₵100\.00/);
 const g=fixture();g.setUser(null);assert.match(g.module.render(),/Sign in to register customers/);await g.module.refresh();assert.equal(g.requests.length,0);
});

test('owner reports include attested external records in sales without calling them bank-confirmed or incremental',async()=>{
 const f=fixture();await f.module.refresh();const html=f.module.render();assert.match(html,/Members who returned/);assert.match(html,/Recorded member sales/);assert.match(html,/not a claim that loyalty generated additional revenue/);assert.match(html,/Outstanding reward cost/);assert.match(html,/GH₵100\.00/);assert.match(html,/merchant-attested, not bank-confirmed/);assert.match(html,/external sales amount below is included in this total/);assert.match(html,/Connected purchases · all paid links/);assert.doesNotMatch(html,/Confirmed member sales|Confirmed qualifying purchases/);
});

test('an owner with no programme is led to creation even when launched from Collect',async()=>{
 const d=base();d.programme=null;d.rules=null;const f=fixture({data:d});f.module.open({amount:2000,shopId:'shop-a'});assert.equal(f.requests.length,0);await f.module.refresh();assert.match(f.module.render(),/Create a programme/);assert.doesNotMatch(f.module.render(),/Create membership/);
});

test('cashier member lookup exposes no owner tools, contact register or costs',async()=>{
 const d=base();d.access={canConfigure:false,canEnroll:true,canAdjust:false,canExport:false,canViewReports:false,canListMembers:false,canRecordExternal:false,allowedShopIds:['shop-a','shop-b']};d.members=[];const safe={...member,phone:undefined,phoneMasked:'••••0000',rewards:member.rewards.map(r=>({...r,cost:undefined}))};
 const f=fixture({data:d,role:'cashier',api:async()=>({loyalty:{...structuredClone(d),member:structuredClone(safe)}})});await f.module.refresh();await f.module.handleClick(control('tab',{value:'members'}));await f.module.refresh();const html=f.module.render();assert.match(html,/Find a member|Ama Example/);assert.doesNotMatch(html,/Edit for future|Save funding limit|Export shown|0240000000|Record cash or external|estimated cost GH₵0/);
 await f.module.handleClick(control('external'));assert.doesNotMatch(f.module.render(),/name="externalAmount"/);
});

test('programme wizard sends precise integer amounts, selected shops and future-version rules',async()=>{
 const requests=[];const f=fixture({api:async(path,o)=>{if(o)requests.push(o.body);return {loyalty:base()};}});await f.module.refresh();await f.module.handleClick(control('edit'));
 await f.module.handleSubmit(form('programme',{name:'My Regulars',colour:'#123456'}));
 await f.module.handleSubmit(form('programme',{earning:'visits',minimumSpend:'12.34',target:'5',onePerDay:'on',rewardType:'discount',rewardName:'Five cedis off',rewardValue:'5.00',rewardMinimumSpend:'20.00',expiryDays:'30'}));
 await f.module.handleSubmit({dataset:{loyaltyForm:'programme'},entries:[['programmeShopIds','shop-a'],['budgetLimit','200.00']]});
 assert.match(f.module.render(),/Existing members keep the terms/);assert.match(f.module.render(),/Ready for your regulars/);
 await f.module.handleSubmit(form('programme'));assert.equal(requests.length,1);const b=requests[0];assert.equal(b.operation,'saveProgramme');assert.equal(b.expectedRevision,1);assert.equal(b.payload.minimumSpend,1234);assert.equal(b.payload.reward.value,500);assert.equal(b.payload.budgetLimit,20000);assert.deepEqual(b.payload.shopIds,['shop-a']);assert.equal(b.payload.onePerDay,true);
});

test('programme validation and zero-valued existing minimums do not silently change terms',async()=>{
 const d=base();d.rules.minimumSpend=0;d.rules.reward.minimumSpend=0;const f=fixture({data:d});await f.module.refresh();await f.module.handleClick(control('edit'));await f.module.handleSubmit(form('programme',{name:'',colour:'#123456'}));assert.equal(f.module.getView().step,0);assert.match(f.module.render(),/Give your programme a name/);await f.module.handleSubmit(form('programme',{name:'Zero Minimums',colour:'#123456'}));assert.match(f.module.render(),/name="minimumSpend" value="0\.00"/);assert.match(f.module.render(),/name="rewardMinimumSpend" value="0\.00"/);assert.equal(f.requests.filter(r=>r.options).length,0);
});

test('enrollment requires membership consent and sends separate explicit marketing permission',async()=>{
 let sent;const f=fixture({api:async(path,o)=>{if(o)sent=o.body;return {loyalty:base(),entity:{id:member.id,memberId:member.id,code:member.code}};}});await f.module.refresh();await f.module.handleClick(control('enroll'));await f.module.handleSubmit(form('enroll',{memberName:'Ama',memberPhone:'0240000000',memberShop:'shop-a'}));assert.equal(sent,undefined);assert.match(f.module.render(),/customer agreed to join/);
 await f.module.handleSubmit(form('enroll',{memberName:'Ama',memberPhone:'0240000000',memberShop:'shop-a',membershipConsent:'on'}));assert.equal(sent.operation,'enrollMember');assert.equal(sent.payload.membershipConsent,true);assert.equal(sent.payload.marketingConsent,false);assert.equal(sent.payload.phone,'0240000000');
});

test('unknown enrollment persists only a private reference marker, never name or phone',async()=>{
 const f=fixture({api:async(path,o)=>{if(o)throw new TypeError('Response interrupted');return {loyalty:base()};}});await f.module.refresh();await f.module.handleClick(control('enroll'));await f.module.handleSubmit(form('enroll',{memberName:'Private customer',memberPhone:'0241234567',memberShop:'shop-a',membershipConsent:'on'}));const saved=[...f.storage.values.values()].join('');assert.doesNotMatch(saved,/Private customer|0241234567/);assert.match(saved,/"payload":null/);assert.equal(f.module.getView().pending.operation,'enrollMember');assert.match(f.module.render(),/Retry keeps the same details/);
});

test('same-page unknown mutation retries the exact envelope and request reference',async()=>{
 const sent=[];let fail=true;const f=fixture({api:async(path,o)=>{if(o){sent.push(structuredClone(o.body));if(fail)throw new TypeError('Interrupted');}return {loyalty:base()};}});await f.module.refresh();await f.module.handleClick(control('pause'));assert.equal(sent.length,1);assert.match(f.module.render(),/saved request needs an outcome/);fail=false;await f.module.handleClick(control('retry'));assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);assert.equal(f.module.getView().pending,null);
});

test('an unknown collection keeps its request across page leave and a same-actor shop change',async()=>{
 const sent=[];let fail=true;const f=fixture({api:async(path,o)=>{const d=base();d.member=structuredClone(member);if(o){sent.push(structuredClone(o.body));if(fail)throw new TypeError('Interrupted');return {loyalty:d,entity:{id:'request-original',shopId:'shop-a',amount:2000}};}return {loyalty:d};}});await findMember(f);await f.module.handleClick(control('member-collect'));await f.module.handleSubmit(form('collect',{actionShop:'shop-a',grossAmount:'25.00',rewardId:'reward-a'}));assert.equal(f.module.hasPendingCollection(),true);f.module.leave();assert.equal(f.module.hasPendingCollection(),true);f.setShop('shop-b');f.module.render();assert.equal(f.module.hasPendingCollection(),true);await f.module.refresh();fail=false;await f.module.handleClick(control('retry'));assert.deepEqual(sent[0],sent[1]);assert.equal(sent.length,2);assert.equal(f.collected.length,1);assert.equal(f.collected[0].id,'request-original');assert.equal(f.module.hasPendingCollection(),false);
});

test('post-reload collection receipt opens the confirmed original QR once, without another mutation',async()=>{
 const storage=memory();const first=fixture({storage,api:async(path,o)=>{const d=base();d.member=structuredClone(member);if(o)throw new TypeError('Interrupted');return {loyalty:d};}});await findMember(first);await first.module.handleClick(control('member-collect'));await first.module.handleSubmit(form('collect',{actionShop:'shop-a',grossAmount:'25.00',rewardId:'reward-a'}));first.module.leave();
 const next=fixture({storage,api:async(path,o)=>{assert.equal(o,undefined);const d=base();d.mutationReceipt={found:true,operation:'prepareCollection',entity:{id:'loyalty-collection-internal',collectionId:'loyalty-collection-internal',requestId:'request-original',shopId:'shop-a'}};return {loyalty:d};}});await next.module.refresh();assert.equal(next.module.hasPendingCollection(),false);assert.equal(next.collected.length,1);assert.equal(next.collected[0].id,'request-original');await next.module.refresh();assert.equal(next.collected.length,1);
});

test('stale member lookups and successful mutations cannot render after auth epoch changes',async()=>{
 let release;const f=fixture({api:async()=>new Promise(resolve=>{release=resolve;})});const pending=f.module.refresh();f.setEpoch('epoch-b');f.module.render();release({loyalty:{...base(),member:structuredClone(member)}});await pending;assert.equal(f.module.getView().loaded,false);assert.doesNotMatch(f.module.render(),/Ama Example|0240000000/);
});

test('counter handover invalidates previous member details and never replays an old mutation',async()=>{
 let release;const f=fixture({role:'cashier',api:async()=>new Promise(resolve=>{release=resolve;})});f.setCounter({id:'counter-a',staffId:'access-a',shiftId:'shift-a',shopId:'shop-a',locked:false});const pending=f.module.refresh();f.setCounter({id:'counter-a',staffId:'access-b',shiftId:'shift-b',shopId:'shop-a',locked:false});f.module.render();release({loyalty:{...base(),member:structuredClone(member)}});await pending;assert.equal(f.module.getView().loaded,false);assert.doesNotMatch(f.module.render(),/Ama Example/);assert.equal(f.module.hasPendingCollection(),false);
});

test('locked counters make no loyalty API call or display protected data',async()=>{
 const f=fixture({role:'cashier'});f.setCounter({id:'counter',staffId:'access-a',shiftId:'shift-a',shopId:'shop-a',locked:true});assert.match(f.module.render(),/Unlock this counter first/);await f.module.refresh();assert.equal(f.requests.length,0);
});

test('counter requests carry current identity guards; cashier selectors use only the current shop',async()=>{
 let sent;const d=base();d.member=structuredClone(member);const f=fixture({role:'cashier',data:d,api:async(path,o)=>{if(o)sent=o.body;return {loyalty:d,entity:{id:'request-a'}};}});f.setCounter({id:'counter-a',staffId:'access-a',shiftId:'shift-a',shopId:'shop-a',locked:false});await f.module.refresh();const url=new URL(f.requests[0].path,'https://example.test');assert.equal(url.searchParams.get('counterId'),'counter-a');assert.equal(url.searchParams.get('staffId'),'access-a');assert.equal(url.searchParams.get('shiftId'),'shift-a');await f.module.handleClick(control('member-collect'));assert.doesNotMatch(f.module.render(),/<option value="shop-b"/);await f.module.handleSubmit(form('collect',{actionShop:'shop-a',grossAmount:'20.00'}));assert.equal(sent.payload.counterStaffId,'access-a');assert.equal(sent.payload.counterShiftId,'shift-a');
});

test('existing QR or paid-receipt contexts cannot add a discount or change original payment amounts',async()=>{
 for(const context of [{requestId:'request-a',amount:2000},{transactionId:'tx-a'}]){
  let sent;const d=base();d.member=structuredClone(member);const f=fixture({api:async(path,o)=>{if(o)sent=o.body;return {loyalty:d};}});f.module.open({shopId:'shop-a',...context});await f.module.refresh();await f.module.handleClick(control('member-collect'));assert.doesNotMatch(f.module.render(),/name="grossAmount"|name="rewardId"/);await f.module.handleSubmit(form('collect',{actionShop:'shop-a',grossAmount:'1.00',rewardId:'reward-a'}));assert.equal(sent.operation,context.requestId?'attachRequest':'attachPayment');assert.deepEqual(Object.keys(sent.payload).sort(),['memberId',context.requestId?'requestId':'transactionId','shopId'].sort());
 }
});

test('external sale and return recording require deliberate confirmation and stay outside wallet claims',async()=>{
 let sent;const d=base();d.member={...structuredClone(member),externalSales:[{id:'external-a',shopId:'shop-a',amount:2500,refunded:0,method:'cash',reference:'CASH-123',createdAt:'2026-01-01T00:00:00Z'}]};const f=fixture({api:async(path,o)=>{if(o)sent=o.body;return {loyalty:d};}});await f.module.refresh();await f.module.handleClick(control('external'));await f.module.handleSubmit(form('external',{actionShop:'shop-a',externalAmount:'25.00',externalMethod:'cash',externalReference:'CASH-456'}));assert.equal(sent,undefined);await f.module.handleSubmit(form('external',{actionShop:'shop-a',externalAmount:'25.00',externalMethod:'cash',externalReference:'CASH-456',externalConfirmed:'on'}));assert.equal(sent.operation,'recordExternalSale');assert.equal(sent.payload.amount,2500);assert.equal(sent.payload.confirmed,true);
 await f.module.handleClick(control('external-return',{id:'external-a'}));assert.match(f.module.render(),/does not transfer money/);await f.module.handleSubmit(form('external-return',{actionShop:'shop-a',returnAmount:'5.00',reason:'Returned to customer',returnConfirmed:'on'}));assert.equal(sent.operation,'refundExternalSale');assert.equal(sent.payload.amount,500);assert.equal(sent.payload.saleId,'external-a');
});

test('free item reward is consumed only after staff confirms actual handover',async()=>{
 let sent;const d=base();d.member=structuredClone(member);const f=fixture({api:async(path,o)=>{if(o)sent=o.body;return {loyalty:d};}});await f.module.refresh();await f.module.handleClick(control('fulfil',{id:'reward-item'}));await f.module.handleSubmit(form('fulfil',{actionShop:'shop-a',reason:'Drink handed over'}));assert.equal(sent,undefined);await f.module.handleSubmit(form('fulfil',{actionShop:'shop-a',reason:'Drink handed over',fulfilledConfirmed:'on'}));assert.equal(sent.operation,'fulfilItem');assert.equal(sent.payload.rewardId,'reward-item');assert.match(f.module.render(),/No money moved/);
});

test('programme/customer fields are HTML escaped and custom dark branding keeps readable text',async()=>{
 const d=base();d.programme.name='<script>alert(1)</script>';d.programme.colour='#000000';const f=fixture({data:d});await f.module.refresh();await f.module.handleClick(control('tab',{value:'programme'}));const html=f.module.render();assert.doesNotMatch(html,/<script>alert/);assert.match(html,/&lt;script&gt;/);assert.match(html,/--loyalty-ink:#ffffff/);
});

test('CSV export neutralizes formulas and exports only authorized matching rows',async()=>{
 const csv=loyaltyMembersCsv([{...member,name:' =HYPERLINK("unsafe")',phone:'+233000000000'}]);assert.match(csv,/' =HYPERLINK/);assert.match(csv,/'\+233/);assert.match(csv,/""unsafe""/);const f=fixture();await f.module.refresh();await f.module.handleClick(control('export'));assert.equal(f.downloads.length,1);assert.equal(f.downloads[0][0],'merchant-loyalty-members.csv');assert.match(f.module.render(),/All matching members in this filtered view were exported/);
});

test('membership card text never presents itself as a payment QR',async()=>{
 const f=fixture();await findMember(f);assert.match(f.module.render(),/not a payment QR/);assert.match(loyaltyRulesText(rules),/Existing members keep the terms they joined under/);
});

test('late camera permission results release every track after leaving loyalty',async()=>{
 let release,stops=0;const stream={getTracks:()=>[{stop(){stops++;}}]};const f=fixture({extra:{mediaDevices:{getUserMedia:()=>new Promise(resolve=>{release=resolve;})}}});await f.module.refresh();const scan=f.module.handleClick(control('scan'));f.module.leave();release(stream);await scan;assert.equal(stops,1);assert.equal(f.module.getView().loaded,false);
});

test('local directory pagination retains every matching member beyond 100 for owner export',async()=>{
 const d=base();d.members=Array.from({length:137},(_,i)=>({...member,id:`member-${i}`,code:`MEMBER-${i}`,name:`Customer ${i}`}));d.memberCount=137;const f=fixture({data:d});await f.module.refresh();await f.module.handleClick(control('tab',{value:'members'}));let html=f.module.render();assert.match(html,/1–25 of 137 matching members/);assert.equal((html.match(/class="loyalty-member-row"/g)||[]).length,25);assert.doesNotMatch(html,/Customer 100</);
 for(let i=0;i<4;i++)await f.module.handleClick(control('page-next'));html=f.module.render();assert.match(html,/101–125 of 137 matching members/);assert.match(html,/Customer 100</);await f.module.handleClick(control('export'));const csv=f.downloads[0][1];assert.equal(csv.split('\r\n').length,138);assert.match(csv,/Customer 136/);
 await f.module.handleSubmit(form('search',{memberQuery:'Customer'}));assert.match(f.module.render(),/1–25 of 137 matching members/);
});

test('all-shops owner reports keep the selected scope after a response installs',async()=>{
 const f=fixture();await f.module.refresh();f.module.handleChange({name:'loyaltyShop',value:''});await f.module.refresh();assert.equal(f.module.getView().selectedShop,'');const latest=new URL(f.requests.at(-1).path,'https://example.test');assert.equal(latest.searchParams.has('shopId'),false);assert.match(f.module.render(),/<option value="" selected>All participating shops/);
});

test('a saved collection that cannot open keeps its original reference until receipt recovery succeeds',async()=>{
 let receipt=false,canOpen=false;const opened=[];const f=fixture({api:async(path,o)=>{const d=base();d.member=structuredClone(member);if(o)return {loyalty:d,entity:{id:'request-original',shopId:'shop-a'}};if(receipt)d.mutationReceipt={found:true,operation:'prepareCollection',entity:{id:'internal-collection',requestId:'request-original',shopId:'shop-a'}};return {loyalty:d};},extra:{onCollect:entity=>{opened.push(entity);return canOpen;}}});await f.module.refresh();await f.module.handleClick(control('member-collect'));await f.module.handleSubmit(form('collect',{actionShop:'shop-a',grossAmount:'25.00',rewardId:'reward-a'}));assert.equal(f.module.hasPendingCollection(),true);assert.match(f.module.render(),/QR could not open/);const reference=f.module.getView().pending.mutationId;f.module.leave();receipt=true;await f.module.handleClick(control('refresh'));assert.equal(f.module.hasPendingCollection(),true);assert.equal(f.module.getView().pending.mutationId,reference);assert.equal(opened.at(-1).id,'request-original');canOpen=true;await f.module.handleClick(control('refresh'));assert.equal(f.module.hasPendingCollection(),false);assert.equal(f.requests.filter(r=>r.options).length,1);
});

test('re-entering private enrollment after reload keeps the original idempotency envelope',async()=>{
 const storage=memory(),sent=[];const first=fixture({storage,api:async(path,o)=>{if(o){sent.push(structuredClone(o.body));throw new TypeError('Interrupted');}return {loyalty:base()};}});await first.module.refresh();await first.module.handleClick(control('enroll'));const details={memberName:'Private customer',memberPhone:'0241234567',memberShop:'shop-a',membershipConsent:'on'};await first.module.handleSubmit(form('enroll',details));first.module.leave();
 const next=fixture({storage,api:async(path,o)=>{if(o)sent.push(structuredClone(o.body));const d=base();d.mutationReceipt={found:false};return {loyalty:d};}});await next.module.refresh();await next.module.handleClick(control('reenter'));await next.module.handleSubmit(form('enroll',details));assert.equal(sent.length,2);assert.deepEqual(sent[1],sent[0]);assert.doesNotMatch([...storage.values.values()].join(''),/Private customer|0241234567/);
});

test('member cards retain original rules while resolved reviews remain read-only history',async()=>{
 const d=base();d.programme.currentVersion=2;d.rules={...structuredClone(rules),version:2,target:9};d.ruleVersions=[structuredClone(rules),structuredClone(d.rules)];d.member=structuredClone(member);const f=fixture({data:d});await f.module.refresh();let html=f.module.render();assert.match(html,/4 \/ 5 stamps/);assert.match(html,/retains the original programme terms/);assert.doesNotMatch(html,/4 \/ 9 stamps/);
 d.member=null;d.reviews=[{id:'open-review',state:'open',shopId:'shop-a',reason:'Open adjustment',createdAt:'2026-01-01T00:00:00Z'},{id:'resolved-review',state:'resolved',shopId:'shop-a',reason:'Previous adjustment',resolution:'Merchant reviewed the return',resolvedAt:'2026-01-02T00:00:00Z'}];const g=fixture({data:d});await g.module.refresh();html=g.module.render();assert.match(html,/data-id="open-review"/);assert.doesNotMatch(html,/data-id="resolved-review"/);assert.match(html,/Resolved review history/);assert.match(html,/Merchant reviewed the return/);
});

test('wizard validates core bounds and item rewards require no new purchase',async()=>{
 const f=fixture();await f.module.refresh();await f.module.handleClick(control('edit'));await f.module.handleSubmit(form('programme',{name:'My rules',colour:'#123456'}));const values={earning:'visits',minimumSpend:'20.00',target:'5',rewardType:'discount',rewardName:'Five off',rewardValue:'5.00',rewardMinimumSpend:'20.00',expiryDays:'366'};
 await f.module.handleSubmit(form('programme',values));assert.equal(f.module.getView().step,1);assert.match(f.module.render(),/1–365 days/);await f.module.handleSubmit(form('programme',{...values,expiryDays:'365',minimumSpend:'0'}));assert.equal(f.module.getView().step,1);await f.module.handleSubmit(form('programme',{...values,expiryDays:'365',rewardMinimumSpend:'5.00'}));assert.equal(f.module.getView().step,1);assert.match(f.module.render(),/greater than the discount/);
 f.module.handleChange({name:'rewardType',value:'item'});assert.doesNotMatch(f.module.render(),/name="rewardMinimumSpend"/);assert.match(f.module.render(),/No new purchase is required/);await f.module.handleSubmit(form('programme',{...values,expiryDays:'365',rewardType:'item',rewardCost:'3.00',rewardMinimumSpend:'50.00'}));await f.module.handleSubmit({dataset:{loyaltyForm:'programme'},entries:[['programmeShopIds','shop-a'],['budgetLimit','200.00']]});await f.module.handleSubmit(form('programme'));const saved=f.requests.find(r=>r.options).options.body.payload;assert.equal(saved.reward.minimumSpend,0);assert.equal(saved.reward.expiryDays,365);assert.equal(saved.reward.cost,300);
 const spendTerms=loyaltyRulesText({...rules,earning:'spend',target:20000,onePerDay:true});assert.doesNotMatch(spendTerms,/one qualifying visit|one visit|per day/i);
});

test('camera preview rebinds after rerender and a late decoded card cannot cross an auth boundary',async()=>{
 const previous={detector:globalThis.BarcodeDetector,raf:globalThis.requestAnimationFrame,cancel:globalThis.cancelAnimationFrame};let tick,release,stops=0;const tracks=[{stop(){stops++;}}],stream={getTracks:()=>tracks};const videos=[{srcObject:null,play:async()=>{},pause(){}},{srcObject:null,play:async()=>{},pause(){}}];let video=videos[0];
 try{globalThis.BarcodeDetector=class{async detect(){return new Promise(resolve=>{release=resolve;});}};globalThis.requestAnimationFrame=fn=>{tick=fn;return 1;};globalThis.cancelAnimationFrame=()=>{};const f=fixture({extra:{mediaDevices:{getUserMedia:async()=>stream},getVideo:()=>video}});await f.module.refresh();await f.module.handleClick(control('scan'));assert.equal(videos[0].srcObject,stream);video=videos[1];const detection=tick();await Promise.resolve();assert.equal(videos[0].srcObject,null);assert.equal(videos[1].srcObject,stream);f.setEpoch('new-auth');f.module.render();release([{rawValue:member.code}]);await detection;assert.equal(stops,1);assert.equal(videos[1].srcObject,null);assert.equal(f.requests.length,1);assert.equal(f.module.getView().loaded,false);
 }finally{globalThis.BarcodeDetector=previous.detector;globalThis.requestAnimationFrame=previous.raf;globalThis.cancelAnimationFrame=previous.cancel;}
});

test('activity uses merchant labels while retaining source event types and recorded notes',async()=>{
 const d=base();d.activity=[{id:'a',type:'member-enrolled',units:0,memberId:member.id,shopId:'shop-a',createdAt:'2026-01-01T00:00:00Z'},{id:'b',type:'earn',units:1,memberId:member.id,shopId:'shop-a',createdAt:'2026-01-01T00:00:00Z'},{id:'c',type:'reward-earned',units:-5,memberId:member.id,shopId:'shop-a',createdAt:'2026-01-01T00:00:00Z'},{id:'d',type:'refund-adjustment',units:-1,memberId:member.id,shopId:'shop-a',reason:'Returned receipt verified',createdAt:'2026-01-01T00:00:00Z'}];const f=fixture({data:d});await f.module.refresh();const html=f.module.render();assert.match(html,/>Member joined<\/strong>/);assert.match(html,/>Purchase counted<\/strong>/);assert.match(html,/>Reward earned<\/strong>/);assert.match(html,/>Returned purchase adjustment<\/strong>/);assert.match(html,/data-event-type="refund-adjustment"/);assert.match(html,/Returned receipt verified/);assert.doesNotMatch(html,/>earn<\/strong>|>member-enrolled<\/strong>/);
});

test('linking a customer requires their presence and sends only a hashed one-time code',async()=>{
 const sent=[],d=base();d.member=structuredClone(member);const f=fixture({data:d,api:async(path,o)=>{if(o)sent.push(o.body);return {loyalty:structuredClone(d),entity:o?{memberId:member.id,grantId:'grant-a',expiresAt:'2030-01-01T00:00:00Z'}:undefined};}});
 await findMember(f);await f.module.handleClick('link-grant');await f.module.handleSubmit(form('link-grant',{actionShop:'shop-a'}));assert.equal(sent.length,0);assert.match(f.module.render(),/customer is here and agrees/);
 await f.module.handleSubmit(form('link-grant',{actionShop:'shop-a',linkConfirmed:'on'}));assert.equal(sent.length,1);assert.equal(sent[0].operation,'createLinkGrant');assert.match(sent[0].payload.claimHash,/^[a-f0-9]{64}$/);assert.equal(sent[0].payload.claimCode,undefined);
 const raw=f.module.render().match(/value="(LC1-[A-F0-9]{48})"/)?.[1];assert.ok(raw);const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))).toString('hex');assert.equal(sent[0].payload.claimHash,hash);assert.doesNotMatch(JSON.stringify(sent),/LC1-/);assert.doesNotMatch([...f.storage.values.values()].join(''),/LC1-/);
 f.module.leave();await f.module.refresh();assert.doesNotMatch(f.module.render(),/value="LC1-/);
});

test('lost linking response retries the same hash and private code without issuing a second grant',async()=>{
 const sent=[],d=base();d.member=structuredClone(member);let fail=true;const f=fixture({data:d,api:async(path,o)=>{if(o){sent.push(structuredClone(o.body));if(fail)throw new TypeError('Interrupted');}return {loyalty:structuredClone(d),entity:o?{memberId:member.id,expiresAt:'2030-01-01T00:00:00Z'}:undefined};}});
 await findMember(f);await f.module.handleClick('link-grant');await f.module.handleSubmit(form('link-grant',{actionShop:'shop-a',linkConfirmed:'on'}));assert.equal(f.module.getView().pending.operation,'createLinkGrant');assert.doesNotMatch([...f.storage.values.values()].join(''),/LC1-/);fail=false;await f.module.handleClick('retry');assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);assert.match(f.module.render(),/value="LC1-[A-F0-9]{48}"/);
});

test('a locked or changed operator cannot retain or finish a linking code',async()=>{
 let resolve;const gate=new Promise(r=>resolve=r),sent=[],d=base();d.member=structuredClone(member);const realCrypto=globalThis.crypto;const f=fixture({data:d,api:async(path,o)=>{if(o)sent.push(o.body);return {loyalty:structuredClone(d)};},extra:{crypto:{getRandomValues:v=>realCrypto.getRandomValues(v),subtle:{digest:async(...a)=>{await gate;return realCrypto.subtle.digest(...a);}}}}});
 await findMember(f);await f.module.handleClick('link-grant');const pending=f.module.handleSubmit(form('link-grant',{actionShop:'shop-a',linkConfirmed:'on'}));f.setUser({...owner,id:'different-session',userId:'other-owner'});f.module.render();resolve();await pending;assert.equal(sent.length,0);assert.doesNotMatch(f.module.render(),/value="LC1-/);
});

test('double-submit during secure code creation issues one grant only',async()=>{
 let resolve;const gate=new Promise(r=>resolve=r),sent=[],d=base();d.member=structuredClone(member);const realCrypto=globalThis.crypto;const f=fixture({data:d,api:async(path,o)=>{if(o)sent.push(o.body);return {loyalty:structuredClone(d),entity:o?{memberId:member.id,expiresAt:'2030-01-01T00:00:00Z'}:undefined};},extra:{crypto:{getRandomValues:v=>realCrypto.getRandomValues(v),subtle:{digest:async(...a)=>{await gate;return realCrypto.subtle.digest(...a);}}}}});
 await findMember(f);await f.module.handleClick('link-grant');const first=f.module.handleSubmit(form('link-grant',{actionShop:'shop-a',linkConfirmed:'on'}));const second=f.module.handleSubmit(form('link-grant',{actionShop:'shop-a',linkConfirmed:'on'}));resolve();await Promise.all([first,second]);assert.equal(sent.length,1);
});

test('linked memberships show automatic progress without issuing another account link',async()=>{
 const d=base();d.member={...structuredClone(member),consumerLinked:true};const f=fixture({data:d,api:async()=>({loyalty:structuredClone(d)})});await findMember(f);assert.match(f.module.render(),/Linked to the customer’s Lumo app/);assert.doesNotMatch(f.module.render(),/data-action="loyalty-link-grant"/);
});

test('unavailable secure code generation gives an actionable error without a mutation',async()=>{
 const sent=[],d=base();d.member=structuredClone(member);const f=fixture({data:d,api:async(path,o)=>{if(o)sent.push(o.body);return {loyalty:structuredClone(d)};},extra:{crypto:{}}});await findMember(f);await f.module.handleClick('link-grant');assert.equal(await f.module.handleSubmit(form('link-grant',{actionShop:'shop-a',linkConfirmed:'on'})),false);assert.equal(sent.length,0);assert.match(f.module.render(),/Secure link codes are unavailable/);
});

test('backgrounding cancels an unfinished private code and never restores it after hashing',async()=>{
 const previous=globalThis.document,listeners=new Map();globalThis.document={visibilityState:'visible',addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:()=>{}};
 try{let resolve;const gate=new Promise(r=>resolve=r),sent=[],d=base();d.member=structuredClone(member);const realCrypto=globalThis.crypto;const f=fixture({data:d,api:async(path,o)=>{if(o)sent.push(o.body);return {loyalty:structuredClone(d)};},extra:{crypto:{getRandomValues:v=>realCrypto.getRandomValues(v),subtle:{digest:async(...a)=>{await gate;return realCrypto.subtle.digest(...a);}}}}});await findMember(f);await f.module.handleClick('link-grant');const request=f.module.handleSubmit(form('link-grant',{actionShop:'shop-a',linkConfirmed:'on'}));globalThis.document.visibilityState='hidden';listeners.get('visibilitychange')({type:'visibilitychange'});globalThis.document.visibilityState='visible';resolve();await request;assert.equal(sent.length,0);assert.doesNotMatch(f.module.render(),/value="LC1-/);f.module.destroy();}finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
