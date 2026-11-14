import test from 'node:test';
import assert from 'node:assert/strict';
import {createDevices} from '../dist/devices.js';
import {filterRefundActivity,createReporting} from '../dist/reporting.js';
import {createBusiness,reduceBusiness} from '../dist/domain.js';
import {renderCollections} from '../dist/collections-ui.js';

const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)}};
const state={business:{id:'business'},shops:[{id:'a',name:'First counter'},{id:'b',name:'Next counter'}],staff:[],shifts:[],closings:[],transactions:[{id:'sale',reference:'SALE-1',shopId:'a',payer:'Customer',amount:2500,status:'paid',createdAt:'2026-11-10T10:00:00Z'}],refunds:[
 {id:'requested',transactionId:'sale',shopId:'a',payer:'Customer',amount:500,status:'requested',reason:'Wrong amount',createdAt:'2026-11-11T09:00:00Z'},
 {id:'declined',transactionId:'sale',shopId:'a',payer:'Customer',amount:500,status:'rejected',reason:'Duplicate request',createdAt:'2026-11-10T09:00:00Z',decidedAt:'2026-11-11T10:00:00Z',decidedBy:'Owner'},
 {id:'returned',transactionId:'sale',shopId:'a',payer:'Customer',amount:1000,status:'paid',reason:'Customer request',createdAt:'2026-11-10T09:00:00Z',paidAt:'2026-11-11T11:00:00Z'}
]};

test('refund activity includes today’s return and decision against an older payment, with scoped filtering and export',()=>{
 const filters={from:'2026-11-11',to:'2026-11-11'};assert.deepEqual(filterRefundActivity(state,filters).map(item=>item.id),['returned','declined','requested']);
 assert.equal(filterRefundActivity(state,{...filters,shopId:'b'}).length,0);assert.deepEqual(filterRefundActivity(state,{...filters,refundStatus:'rejected'}).map(item=>item.id),['declined']);
 let exported,opened;const report=createReporting({getState:()=>state,onExport:(rows,name)=>exported={rows,name},onOpenTransaction:id=>opened=id});
 for(const name of ['from','to'])report.handleChange({dataset:{reporting:'activity'},name,value:'2026-11-11'});
 const html=report.renderActivity();assert.match(html,/Refunds & decisions/);assert.match(html,/Declined/);assert.match(html,/Wrong amount/);assert.match(html,/Decision by Owner/);
 report.handleClick('reporting-refund',{dataset:{id:'sale'}});assert.equal(opened,'sale');report.handleClick('reporting-export-refunds');assert.equal(exported.rows.length,4);assert.equal(exported.name,'lumo-filtered-refunds.csv');
 assert.equal(exported.rows.find(row=>row[1]==='declined')[9],'');assert.equal(exported.rows.find(row=>row[1]==='returned')[9],'2026-11-11T11:00:00Z');
});

test('phone payment rows keep payer, amount and status in the same receipt control',()=>{
 const report=createReporting({getState:()=>state});report.handleClick('reporting-activity-all');const html=report.renderActivity();
 const row=html.match(/<button class="reporting-mobile-receipt"[\s\S]*?<\/button>/)?.[0];assert.ok(row);assert.match(row,/Customer/);assert.match(row,/25\.00/);assert.match(row,/Confirmed/);assert.match(row,/data-id="sale"/);
});

test('decisions record their real time and owner, and payment-linked cases inherit the source shop',()=>{
 let snapshot=createBusiness({name:'Test Kitchen',ownerName:'Test Owner',phone:'0245550100',businessType:'sole-trader',verification:{phone:true,identity:true,face:true},destination:'Sandbox Bank',shop:{name:'Counter',area:'Campus',category:'Food',lat:5.65,lng:-.18}},{now:'2026-11-10T08:00:00Z'}),shopId=snapshot.shops[0].id;
 snapshot.transactions=[{id:'paid',reference:'PAID-REF',shopId,payer:'Customer',amount:5000,status:'paid',createdAt:'2026-11-10T09:00:00Z'}];
 let result=reduceBusiness(snapshot,'REFUND',{transactionId:'paid',amount:500,reason:'Customer request',attemptId:'refund-original'},{role:'cashier',shopId},{now:'2026-11-10T10:00:00Z'});snapshot=result.state;
 result=reduceBusiness(snapshot,'APPROVE_REFUND',{id:result.entity.id,approve:false},{role:'owner'},{now:'2026-11-11T11:00:00Z'});assert.equal(result.entity.decidedAt,'2026-11-11T11:00:00Z');assert.equal(result.entity.decidedBy,'Test Owner');assert.equal(result.entity.status,'rejected');
 result=reduceBusiness(result.state,'ADD_TICKET',{subject:'Payment help',message:'Please check this payment.',transactionId:'PAID-REF',shopId:null},{role:'owner'});assert.equal(result.entity.shopId,shopId);
});

test('connected shop QR hands off to the canonical consumer without the retired student-wallet preview',()=>{
 const link='https://lumo-connected-pilot.vercel.app/?pay=shop-id&testKey=private-test-key';const html=renderCollections({state,ui:{collectMode:'static'},shop:{...state.shops[0],open:true,accepting:true},money:String,E:String,time:()=>'',icon:()=>'',qrSvg:()=>'<svg></svg>',paymentLink:()=>link,shared:true});
 assert.match(html,/Open in Lumo/);assert.match(html,/target="_blank" rel="noopener"/);assert.ok(html.includes(link));assert.doesNotMatch(html,/data-action="student-pay"/);
});

test('a paired phone can change shop without revoking its session and must test again before receiving',async()=>{
 const previousFormData=globalThis.FormData;globalThis.FormData=class{constructor(form){this.values=form.values}*[Symbol.iterator](){yield* this.values}};
 const session={id:'session',businessId:'business',userId:'owner',role:'owner',shopIds:['a','b']};let record,paired=[];
 const api=async(path,{method='GET',body}={})=>{if(path==='/api/devices'&&method==='POST'){paired.push(body);record={id:body.deviceId,...body,businessId:'business',userId:'owner',sessionId:'session',enabled:true,soundReady:false};return {devices:[{...record}]}}if(body?.action==='test'){record.soundReady=true;record.testedAt=new Date().toISOString()}return {devices:record?[{...record}]:[]}};
 const controller=createDevices({storage:storage(),api,getState:()=>state,getSession:()=>session,getShopId:()=> 'b',onTestVoice(){}});
 try{
  await controller.handleSubmit({values:[['label','Shared counter phone'],['shopId','a']]});await controller.handleClick('device-test');assert.equal(controller.canAnnounce('a'),true);assert.match(controller.render(),/Change receiving shop/);
  const deviceId=controller.getDeviceId();await controller.handleClick('device-change-shop');assert.match(controller.render(),/Save receiving shop/);assert.match(controller.render(),/value="b" selected/);
  await controller.handleSubmit({values:[['label','Shared counter phone'],['shopId','b']]});assert.equal(paired.at(-1).deviceId,deviceId);assert.equal(paired.at(-1).shopId,'b');assert.equal(controller.canAnnounce('a'),false);assert.equal(controller.canAnnounce('b'),false);
  await controller.handleClick('device-test');assert.equal(controller.canAnnounce('b'),true);assert.equal(session.id,'session');
 }finally{controller.stop();globalThis.FormData=previousFormData}
});

test('page restoration restarts one heartbeat while audio remains locked until a user test',async()=>{
 const previous={window:globalThis.window,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval};const events=new Map(),intervals=new Map();let sequence=0,beats=0;
 globalThis.window={addEventListener:(type,fn)=>events.set(type,fn),speechSynthesis:{cancel(){}}};globalThis.setInterval=(fn,delay)=>{const key=++sequence;intervals.set(key,{fn,delay});return key};globalThis.clearInterval=key=>intervals.delete(key);
 const session={id:'session',businessId:'business',userId:'owner',role:'owner'},controller=createDevices({storage:storage(),getState:()=>state,getSession:()=>session,api:async(path,{body}={})=>{if(body?.action==='heartbeat')beats++;return {devices:[{id:controller.getDeviceId(),shopId:'a',businessId:'business',userId:'owner',sessionId:'session',enabled:true,soundReady:false}]}}});
 try{
  await controller.start();assert.equal([...intervals.values()].filter(item=>item.delay===20000).length,1);events.get('pagehide')();assert.equal(intervals.size,0);
  events.get('pageshow')();await new Promise(resolve=>setImmediate(resolve));assert.equal([...intervals.values()].filter(item=>item.delay===20000).length,1);assert.equal(controller.hasUnlockedAudio(),false);assert.ok(beats>=2);
  events.get('pageshow')();await new Promise(resolve=>setImmediate(resolve));assert.equal([...intervals.values()].filter(item=>item.delay===20000).length,1);
 }finally{controller.stop();Object.assign(globalThis,previous)}
});


test('phone Activity keeps search and dates outside native advanced filters and retains the chosen filters when collapsed',()=>{
 const previousWindow=globalThis.window;const media={matches:true,addEventListener(){}};globalThis.window={matchMedia:()=>media};let redraws=0;
 try{
  const report=createReporting({getState:()=>state,onRender:()=>redraws++});report.handleClick('reporting-activity-all');
  let html=report.renderActivity(),detail=html.match(/<details class="reporting-more-filters"[^>]*>[\s\S]*?<\/details>/)?.[0];
  assert.ok(detail);assert.doesNotMatch(detail,/^<details[^>]*\bopen\b/);assert.match(detail,/<summary data-action="reporting-toggle-filters">/);assert.doesNotMatch(detail,/aria-expanded|role="button"/);
  assert.ok(html.indexOf('id="reporting-activity-search"')<html.indexOf('<details'));
  assert.ok(html.indexOf('data-action="reporting-activity-today"')<html.indexOf('<details'));assert.doesNotMatch(detail,/reporting-activity-(?:today|week|all)/);
  for(const name of ['shopId','from','to','staffId','shiftId','status']){assert.match(detail,new RegExp('id="reporting-activity-'+name+'"'));assert.equal(html.split('id="reporting-activity-'+name+'"').length-1,1)}
  assert.match(detail,/Date fields select recorded shop trading days/);assert.match(detail,/0 active/);
  const beforeToggle=redraws;report.handleClick('reporting-toggle-filters',{closest:()=>({open:false})});assert.equal(redraws,beforeToggle,'Native summary activation must perform the toggle without replacing its focused element');
  assert.match(report.renderActivity(),/<details class="reporting-more-filters" open>/);
  for(const [name,value] of [['status','paid'],['shopId','a'],['from','2026-11-09'],['to','2026-11-11']])report.handleChange({dataset:{reporting:'activity'},name,value});
  assert.match(report.renderActivity(),/<details class="reporting-more-filters" open>/);assert.match(report.renderActivity(),/3 active/,'A custom range counts as one filter');
  report.handleClick('reporting-toggle-filters',{closest:()=>({open:true})});html=report.renderActivity();assert.doesNotMatch(html,/<details class="reporting-more-filters" open>/);assert.match(html,/3 active/);assert.deepEqual(report.getFilteredPayments().map(x=>x.id),['sale']);
  report.handleChange({dataset:{reporting:'activity'},name:'from',value:'2026-11-12'});html=report.renderActivity();assert.ok(html.indexOf('The start date must be on or before')>html.indexOf('</details>'),'A date error remains visible outside the closed filters');
 }finally{if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow}
});

test('Activity expands advanced filters on desktop and adapts at the phone breakpoint without losing filter state',()=>{
 const previousWindow=globalThis.window;let onViewportChange,redraws=0;const media={matches:false,addEventListener:(event,callback)=>{assert.equal(event,'change');onViewportChange=callback}};globalThis.window={matchMedia:query=>{assert.equal(query,'(max-width: 600px)');return media}};
 try{
  const report=createReporting({getState:()=>state,onRender:()=>redraws++});assert.match(report.renderActivity(),/<details class="reporting-more-filters" open>/);
  media.matches=true;onViewportChange();assert.equal(redraws,1);assert.doesNotMatch(report.renderActivity(),/<details class="reporting-more-filters" open>/);
  report.handleClick('reporting-toggle-filters',{closest:()=>({open:false})});report.handleChange({dataset:{reporting:'activity'},name:'status',value:'paid'});assert.match(report.renderActivity(),/<details class="reporting-more-filters" open>/);
  media.matches=false;onViewportChange();assert.match(report.renderActivity(),/<details class="reporting-more-filters" open>/);assert.equal(report.getFilters().status,'paid');
  report.reset();media.matches=true;assert.doesNotMatch(report.renderActivity(),/<details class="reporting-more-filters" open>/);assert.match(report.renderActivity(),/0 active/);
 }finally{if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow}
});
