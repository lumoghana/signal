import test from 'node:test';
import assert from 'node:assert/strict';
import {persistentDeviceId,deviceCanReceive,deviceConnection,createDevices} from '../dist/devices.js';
import {distanceMetres,filterDirectory,lookupDirectory,createDirectory} from '../dist/directory.js';
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}};
const shops=[{id:'night',businessId:'one',businessName:'Campus Kitchen',name:'Night Counter',area:'Night Market',category:'Food',code:'LUM100001',accountNumber:'9900000001',lat:5.6509,lng:-.1878,hours:'7 am – 11 pm',open:true,accepting:true},{id:'penta',businessId:'two',businessName:'Books & More',name:'Pentagon Books',area:'Pentagon',category:'Books',code:'LUM100002',accountNumber:'9900000002',lat:5.6535,lng:-.1845,hours:'8 am – 8 pm',open:true,accepting:true},{id:'closed',businessId:'one',businessName:'Campus Kitchen',name:'Closed Counter',area:'Night Market',category:'Food',code:'LUM100003',accountNumber:'9900000001',lat:5.651,lng:-.188,open:false,accepting:false}];
test('receiving phone id survives reload and does not contain a session credential',()=>{const s=storage();const id=persistentDeviceId(s,()=> 'durable-phone-id-123');assert.equal(persistentDeviceId(s,()=> 'different-phone-id-456'),id);assert.equal(id,'durable-phone-id-123');assert.doesNotThrow(()=>persistentDeviceId({getItem(){throw Error('blocked')}},()=> 'memory-phone-id-123'));});
test('receiving authorization binds business, person and assigned shop',()=>{const device={id:'phone',businessId:'one',userId:'cashier',shopId:'night',enabled:true};const s={businessId:'one',userId:'cashier',role:'cashier',shopIds:['night']};assert.equal(deviceCanReceive(device,s,'night',shops),true);assert.equal(deviceCanReceive(device,{...s,shopIds:['penta']},'night',shops),false);assert.equal(deviceCanReceive(device,{...s,userId:'owner',role:'owner'},'night',shops),false);assert.equal(deviceCanReceive({...device,revokedAt:new Date().toISOString()},s,'night',shops),false);assert.equal(deviceCanReceive(device,null,'night',shops),false);assert.equal(deviceCanReceive(device,{...s,businessId:'two'},'night',shops),false);});
test('device status distinguishes offline, paired and revoked phones',()=>{const now=Date.now();assert.equal(deviceConnection({lastSeen:new Date(now-1000).toISOString()},now),'online');assert.equal(deviceConnection({lastSeen:new Date(now-100000).toISOString()},now),'offline');assert.equal(deviceConnection({},now),'paired');assert.equal(deviceConnection({revokedAt:new Date(now).toISOString()},now),'revoked');});
test('shared directory searches multiple businesses, sorts distance and includes account shops',()=>{assert.equal(distanceMetres([5.6509,-.1878],[5.6509,-.1878]),0);assert.equal(filterDirectory(shops)[0].id,'night');assert.equal(filterDirectory(shops,{position:[5.6535,-.1845]})[0].businessId,'two');assert.equal(filterDirectory(shops,{query:'books'}).length,1);assert.equal(filterDirectory(shops,{openOnly:false}).length,3);assert.equal(filterDirectory(shops,{category:'Food'}).length,1);assert.deepEqual(lookupDirectory(shops,' lum100002 ').map(x=>x.id),['penta']);assert.deepEqual(lookupDirectory(shops,'9900 000001','account').map(x=>x.id),['night','closed']);});
test('paired phone needs an explicit audio gesture, deduplicates and stops after access loss',async()=>{const oldStorage=globalThis.localStorage,oldFormData=globalThis.FormData;globalThis.localStorage=storage();globalThis.FormData=class {constructor(f){this.data=f.values}*[Symbol.iterator](){yield* this.data}};
try{let current={businessId:'one',userId:'cashier',role:'cashier',shopIds:['night']},records=[],outage=false,tests=0;const previous={id:'old',reference:'OLD',shopId:'night',status:'paid'};const state={business:{id:'one'},shops,transactions:[previous]};const api=async(path,{method='GET',body}={})=>{if(outage)throw Error('offline');if(path==='/api/devices'&&method==='POST'){records=[{id:body.deviceId,...body,businessId:'one',userId:'cashier',enabled:false,lastSeen:new Date().toISOString()}];return {device:records[0]}}if(path==='/api/devices')return {devices:records.map(x=>({...x}))};const d=records[0];if(body.action==='enable')d.enabled=true;if(body.action==='disable')d.enabled=false;if(body.action==='test')d.testedAt=new Date().toISOString();if(body.action==='revoke')d.revokedAt=new Date().toISOString();return {device:{...d}}};const controller=createDevices({api,getState:()=>state,getSession:()=>current,getShopId:()=> 'night',onTestVoice:()=>{tests++}});await controller.refresh();await controller.handleSubmit({values:[['label','Night phone'],['shopId','night']]});assert.equal(controller.canAnnounce('night'),false);await controller.handleClick('device-test');assert.equal(tests,1);assert.equal(controller.canAnnounce('night'),true);assert.deepEqual(controller.consumePayments([previous]),[]);const paid={id:'new',reference:'NEW',shopId:'night',status:'paid'};assert.equal(controller.consumePayments([previous,paid]).length,1,'the first confirmed receipt after enabling is announced rather than swallowed as history');assert.deepEqual(controller.consumePayments([previous,paid]),[]);assert.deepEqual(controller.consumePayments([{id:'waiting',shopId:'night',status:'processing'}]),[]);assert.deepEqual(controller.consumePayments([{id:'other',shopId:'penta',status:'paid'}]),[]);outage=true;await controller.refresh();assert.equal(controller.canAnnounce('night'),false);outage=false;await controller.refresh();assert.equal(controller.canAnnounce('night'),false);await controller.handleClick('device-test');assert.equal(controller.canAnnounce('night'),true);current={...current,shopIds:['penta']};assert.equal(controller.canAnnounce('night'),false);current=null;assert.equal(controller.canAnnounce('night'),false);const oldDeviceId=controller.getDeviceId();await controller.handleClick('device-new-pairing');assert.equal(controller.getDeviceId(),oldDeviceId,'a signed-out or revoked session cannot repair its pairing by rotating identifiers');assert.equal(controller.hasUnlockedAudio(),false);controller.stop();}finally{globalThis.localStorage=oldStorage;globalThis.FormData=oldFormData}});
test('directory controller emits globally identified pay context and never sends student location',async()=>{const oldFormData=globalThis.FormData;globalThis.FormData=class {constructor(f){this.data=f.values}*[Symbol.iterator](){yield* this.data}};try{const calls=[],paid=[];const controller=createDirectory({api:async(path,options)=>{calls.push({path,options});return {shops}},onPay:(shop,context)=>paid.push({shop,context})});await controller.refresh();assert.match(controller.render(),/Campus Kitchen/);assert.match(controller.render(),/Books &amp; More/);await controller.handleSubmit({values:[['type','account'],['value','9900000001']]});assert.match(controller.render(),/Choose the shop receiving this payment/);await controller.handleClick('directory-pay',{dataset:{id:'one:night'}});assert.equal(paid[0].shop.businessId,'one');assert.equal(paid[0].context.method,'account');assert.equal(calls.length,1);assert.equal(calls[0].path,'/api/directory');assert.deepEqual(calls[0].options,{method:'GET'});await controller.handleClick('directory-pay',{dataset:{id:'one:closed'}});assert.equal(paid.length,1);}finally{globalThis.FormData=oldFormData}});


test('one persistent phone has one active receiver tab, with shared receipt dedupe and lease handover',async()=>{
 const s=storage(),current={id:'session-one',businessId:'one',userId:'cashier',role:'cashier',shopIds:['night']},state={business:{id:'one'},shops,transactions:[]};let clock=Date.now(),record;
 const api=async(path,{body}={})=>{if(path==='/api/devices')return {devices:[{...record}]};if(body.action==='enable')record.enabled=true;if(body.action==='test'){record.testedAt=new Date().toISOString();record.soundReady=body.soundReady}if(body.action==='heartbeat')record.soundReady=body.soundReady;return {devices:[{...record}]}};
 const base={storage:s,api,getState:()=>state,getSession:()=>current,onTestVoice:()=>{},now:()=>clock};const a=createDevices({...base,tabId:'tab-a'});record={id:a.getDeviceId(),businessId:'one',userId:'cashier',sessionId:'session-one',shopId:'night',enabled:true,soundReady:false,lastSeen:new Date(clock).toISOString()};const b=createDevices({...base,tabId:'tab-b'});
 try{
  await a.start();await b.start();await Promise.all([a.handleClick('device-test'),b.handleClick('device-test')]);
  assert.equal(Number(a.canAnnounce('night'))+Number(b.canAnnounce('night')),1);
  const winner=a.canAnnounce('night')?a:b,other=winner===a?b:a,receipt={id:'p1',reference:'LEASE-P1',shopId:'night',status:'paid',amount:2500};state.transactions=[receipt];
  assert.deepEqual(other.consumePayments([receipt]),[],'an inactive tab cannot consume the active counter’s receipt');assert.equal(winner.consumePayments([receipt]).length,1);assert.deepEqual(winner.consumePayments([receipt]),[]);assert.deepEqual(other.consumePayments([receipt]),[]);
  winner.stop();await other.handleClick('device-test');assert.equal(other.canAnnounce('night'),true);assert.deepEqual(other.consumePayments([receipt]),[],'handover never replays delivered history');
  const next={id:'p2',reference:'LEASE-P2',shopId:'night',status:'paid',amount:3000};state.transactions.push(next);assert.equal(other.consumePayments(state.transactions).length,1);assert.deepEqual(winner.consumePayments(state.transactions),[]);
  clock+=13000;assert.equal(other.canAnnounce('night'),false,'expired ownership never remains Ready');
 }finally{a.stop();b.stop()}
});

test('authoritative device updates revoke audio immediately and reject stale snapshots',async()=>{
 const s=storage(),current={id:'current-session',businessId:'one',userId:'cashier',role:'cashier',shopIds:['night']},state={business:{id:'one'},shops,transactions:[]};let record,revision=1;
 const api=async(path,{body}={})=>{if(body?.action==='test')record.soundReady=true;if(body?.action==='enable')record.enabled=true;return {devices:[{...record}],revision}};
 const c=createDevices({storage:s,api,getState:()=>state,getSession:()=>current,onTestVoice:()=>{}});record={id:c.getDeviceId(),businessId:'one',userId:'cashier',sessionId:'current-session',shopId:'night',enabled:true,soundReady:false,lastSeen:new Date().toISOString()};
 try{await c.start();await c.handleClick('device-test');assert.equal(c.canAnnounce('night'),true);const stale={...record};revision=2;c.applyDevices([{...record,enabled:false,revokedAt:new Date().toISOString()}],{revision});assert.equal(c.canAnnounce('night'),false);assert.equal(c.hasUnlockedAudio(),false);assert.equal(c.applyDevices([stale],{revision:1}),false);assert.equal(c.canAnnounce('night'),false);const id=c.getDeviceId();await c.handleClick('device-new-pairing');assert.equal(c.getDeviceId(),id,'a revoked phone cannot bypass the signed-out repair journey');}finally{c.stop()}
});

test('refresh heartbeat reports audio locked until a real voice test succeeds',async()=>{
 const s=storage(),current={id:'ready-session',businessId:'one',userId:'cashier',role:'cashier',shopIds:['night']},state={business:{id:'one'},shops,transactions:[]};let record;const heartbeats=[];
 const api=async(path,{body}={})=>{if(body?.action==='heartbeat'){heartbeats.push(body.soundReady);record.soundReady=body.soundReady}if(body?.action==='test')record.soundReady=body.soundReady;if(body?.action==='enable')record.enabled=true;return {devices:[{...record}]}};
 const c=createDevices({storage:s,api,getState:()=>state,getSession:()=>current,onTestVoice:()=>{}});record={id:c.getDeviceId(),businessId:'one',userId:'cashier',sessionId:'ready-session',shopId:'night',enabled:true,soundReady:true,testedAt:new Date().toISOString(),lastSeen:new Date().toISOString()};
 try{await c.start();assert.deepEqual(heartbeats,[false]);assert.equal(c.canAnnounce('night'),false);await c.handleClick('device-test');assert.equal(c.canAnnounce('night'),true);await c.refresh({heartbeat:true});assert.equal(heartbeats.at(-1),true);c.setConnection('offline');assert.equal(c.canAnnounce('night'),false);await c.refresh({heartbeat:true});assert.equal(heartbeats.at(-1),false);assert.equal(c.canAnnounce('night'),false,'reconnection does not silently claim unlocked audio');}finally{c.stop()}
});

test('closed published shops remain discoverable while unpublished shops never enter lookup',async()=>{
 const hidden={...shops[0],id:'hidden',code:'HIDDEN',published:false};const all=[...shops,hidden];assert.equal(filterDirectory(all,{openOnly:false}).length,3);assert.deepEqual(lookupDirectory(all,'HIDDEN'),[]);
 const d=createDirectory({api:async()=>({shops:all})});await d.refresh();d.handleChange({name:'directoryOpen',checked:false});const html=d.render();assert.match(html,/Closed Counter/);assert.doesNotMatch(html,/data-id="one:hidden"/);assert.match(html,/Merchant’s stated hours|Hours not set|7 am/);
});

test('a late location callback cannot override a campus area chosen by the user',async()=>{
 const oldNavigator=globalThis.navigator;let success;Object.defineProperty(globalThis,'navigator',{configurable:true,value:{geolocation:{getCurrentPosition(fn){success=fn}}}});
 try{const d=createDirectory({api:async()=>({shops})});await d.refresh();await d.handleClick('directory-locate');d.handleChange({name:'directoryArea',value:'Pentagon'});success({coords:{latitude:5.6509,longitude:-.1878}});assert.match(d.render(),/Near Pentagon/);assert.doesNotMatch(d.render(),/Near your location/);}finally{Object.defineProperty(globalThis,'navigator',{configurable:true,value:oldNavigator})}
});


test('expired or revoked bound sessions cannot show a ready receiving phone',()=>{
 const record={id:'bound-phone',businessId:'one',userId:'cashier',sessionId:'signed-in',sessionValid:false,shopId:'night',enabled:true,soundReady:true,lastSeen:new Date().toISOString()};
 const session={id:'signed-in',businessId:'one',userId:'cashier',role:'cashier',shopIds:['night']};
 assert.equal(deviceCanReceive(record,session,'night',shops),false);assert.equal(deviceConnection(record),'signed-out');
 const c=createDevices({storage:storage(),getState:()=>({business:{id:'one'},shops}),getSession:()=>session});c.applyDevices([record]);assert.match(c.render(),/Sign-in needed/);assert.equal(c.canAnnounce('night'),false);c.stop();
});

test('voice retesting preserves a working receiver, its lease and receipts arriving during the test',async()=>{
 const current={id:'retest-session',businessId:'one',userId:'owner',role:'owner',shopIds:['night']},state={business:{id:'one'},shops,transactions:[]};let record,revision=1,voiceCount=0,enableCount=0;
 const api=async(path,{body}={})=>{if(body?.action==='enable'){enableCount++;record.enabled=true;record.soundReady=false}if(body?.action==='test'){record.soundReady=true;record.testedAt=new Date().toISOString()}if(body?.action==='heartbeat')record.soundReady=body.soundReady;return {devices:[{...record}],revision:revision++}};
 const receipt={id:'retest-arrival',reference:'RETEST-ARRIVAL',shopId:'night',status:'paid',amount:3500};
 const c=createDevices({storage:storage(),api,getState:()=>state,getSession:()=>current,onTestVoice:()=>{voiceCount++;if(voiceCount===2)state.transactions.push(receipt)}});record={id:c.getDeviceId(),businessId:'one',userId:'owner',sessionId:current.id,sessionValid:true,shopId:'night',enabled:true,soundReady:false,lastSeen:new Date().toISOString()};
 try{
  await c.start();await c.handleClick('device-test');assert.equal(c.canAnnounce('night'),true);const lease=c.getReceiverLease();
  await c.handleClick('device-test');assert.equal(c.canAnnounce('night'),true);assert.equal(c.getReceiverLease().tabId,lease.tabId);assert.equal(enableCount,0,'an enabled receiver must not reset its server readiness before a retest');
  assert.equal(c.consumePayments(state.transactions).length,1,'a receipt arriving during a working receiver’s retest is not swallowed as historical');assert.deepEqual(c.consumePayments(state.transactions),[]);
  record.enabled=false;record.soundReady=false;c.applyDevices([{...record}],{revision:revision++});assert.equal(c.canAnnounce('night'),false);
  await c.handleClick('device-test');assert.equal(enableCount,1,'a muted receiver is deliberately enabled again');assert.equal(c.canAnnounce('night'),true);assert.deepEqual(c.consumePayments(state.transactions),[],'muted-phone activation never replays prior receipts');
 }finally{c.stop()}
});

test('a failed voice retest clears readiness and a revocation during testing cannot be reversed',async()=>{
 const current={id:'test-revocation-session',businessId:'one',userId:'owner',role:'owner',shopIds:['night']},state={business:{id:'one'},shops,transactions:[]};let record,mode='success',testWrites=0,revision=1,c;
 const api=async(path,{body}={})=>{if(body?.action==='test'){testWrites++;record.soundReady=true;record.testedAt=new Date().toISOString()}if(body?.action==='heartbeat')record.soundReady=body.soundReady;return {devices:[{...record}],revision:revision++}};
 c=createDevices({storage:storage(),api,getState:()=>state,getSession:()=>current,onTestVoice:()=>{if(mode==='fail')throw Error('The speaker did not play');if(mode==='revoke'){record={...record,revokedAt:new Date().toISOString(),enabled:false,soundReady:false,sessionValid:false};c.applyDevices([record],{revision:revision++})}}});record={id:c.getDeviceId(),businessId:'one',userId:'owner',sessionId:current.id,sessionValid:true,shopId:'night',enabled:true,soundReady:false,lastSeen:new Date().toISOString()};
 try{
  await c.start();await c.handleClick('device-test');assert.equal(c.canAnnounce('night'),true);
  mode='fail';await c.handleClick('device-test');assert.equal(c.canAnnounce('night'),false);assert.equal(c.getReceiverLease(),null);assert.equal(record.soundReady,false,'the server must no longer advertise an audible phone after a failed retest');assert.match(c.render(),/speaker did not play/);
  mode='success';await c.handleClick('device-test');assert.equal(c.canAnnounce('night'),true);const previousWrites=testWrites;
  mode='revoke';await c.handleClick('device-test');assert.equal(testWrites,previousWrites,'revoked authority cannot receive a new successful test write');assert.equal(c.canAnnounce('night'),false);assert.equal(c.getReceiverLease(),null);assert.equal(record.revokedAt!==null,true);
 }finally{c.stop()}
});

test('revoked phones require an explicit fresh owner restoration or replacement, never a staff bypass',async()=>{
 const previousFormData=globalThis.FormData;globalThis.FormData=class{constructor(form){this.entries=Object.entries(form.values||{})}*[Symbol.iterator](){yield* this.entries}};
 const at=Date.now(),revokedAt=new Date(at-2000).toISOString(),expiresAt=new Date(at+3600000).toISOString();let current={id:'fresh-owner',businessId:'one',userId:'owner',role:'owner',shopIds:['night'],createdAt:new Date(at-1000).toISOString(),expiresAt},record,calls=0;
 const state={business:{id:'one'},shops,transactions:[]};const api=async(path,{method,body}={})=>{if(method==='POST'&&path==='/api/devices'){calls++;record={...record,label:body.label,shopId:body.shopId,sessionId:current.id,sessionValid:true,revokedAt:null,enabled:true,soundReady:false,testedAt:null}}return {devices:[{...record}]}};
 const c=createDevices({storage:storage(),api,getState:()=>state,getSession:()=>current});record={id:c.getDeviceId(),businessId:'one',userId:'owner',sessionId:'revoked-owner',sessionValid:false,shopId:'night',enabled:false,soundReady:false,revokedAt};
 try{
  c.applyDevices([record]);assert.match(c.render(),/Restore this phone/);assert.match(c.render(),/name="confirmRestore"/);
  await c.handleSubmit({values:{label:'Restored counter',shopId:'night'}});assert.equal(calls,0,'restoration requires an explicit owner confirmation');
  await c.handleSubmit({values:{label:'Restored counter',shopId:'night',confirmRestore:'on'}});assert.equal(calls,1);assert.equal(record.sessionId,current.id);assert.equal(record.revokedAt,null);assert.equal(c.canAnnounce('night'),false,'restoring a phone never silently unlocks audio');
  record={...record,revokedAt,sessionId:'revoked-owner',sessionValid:false,enabled:false};current={...current,id:'staff-session',userId:'cashier',role:'cashier'};c.applyDevices([record]);const originalId=c.getDeviceId();await c.handleSubmit({values:{label:'Bypass',shopId:'night',confirmRestore:'on'}});await c.handleClick('device-new-pairing');assert.equal(calls,1);assert.equal(c.getDeviceId(),originalId);
  current={...current,id:'revoked-owner',userId:'owner',role:'owner',createdAt:new Date(at-5000).toISOString()};c.applyDevices([record]);await c.handleClick('device-new-pairing');assert.equal(c.getDeviceId(),originalId,'the old owner sign-in cannot rotate a revoked phone identifier');
  current={...current,id:'fresh-owner',createdAt:new Date(at-1000).toISOString()};c.applyDevices([record]);await c.handleClick('device-new-pairing');assert.notEqual(c.getDeviceId(),originalId,'a fresh owner explicitly approves a replacement pairing');assert.equal(c.hasUnlockedAudio(),false);
 }finally{c.stop();globalThis.FormData=previousFormData}
});

test('actual shared API restores a revoked phone only after fresh owner sign-in and a new audible test',async()=>{
 const {createD1}=await import('../scripts/d1-adapter.mjs'),{handleAPI}=await import('../server/api.js'),{readFileSync,readdirSync}=await import('node:fs');const DB=createD1();for(const filename of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())await DB.exec(readFileSync(new URL('../drizzle/'+filename,import.meta.url),'utf8'));
 const previousFormData=globalThis.FormData;globalThis.FormData=class{constructor(form){this.entries=Object.entries(form.values||{})}*[Symbol.iterator](){yield* this.entries}};
 const cookies=new Map();let current=null,state={},pairCalls=0,c;
 async function api(path,options={}){
  const headers={'Content-Type':'application/json','X-Lumo-Request':'1',Origin:'https://devices-test.example','cf-connecting-ip':crypto.randomUUID()};if(cookies.size)headers.Cookie=[...cookies].map(([k,v])=>k+'='+v).join('; ');
  if(path==='/api/devices'&&options.method==='POST')pairCalls++;
  const response=await handleAPI(new Request('https://devices-test.example'+path,{method:options.method||'GET',headers,...(options.body===undefined?{}:{body:JSON.stringify(options.body)})}),{DB});for(const value of response.headers.getSetCookie()){const pair=value.split(';')[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1))}const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error),{status:response.status,code:data.code});
  if(Object.hasOwn(data,'session'))current=data.session;if(data.state)state=data.state;if(data.devices)c?.applyDevices(data.devices,{revision:data.revision});return data;
 }
 try{
  const credentials={username:'phone.restore.owner',password:'RestoreCounter123'};await api('/api/signup',{method:'POST',body:{attemptId:crypto.randomUUID(),name:'Restore Counter Test',ownerName:'Owner Test',phone:'0245550100',businessType:'sole-trader',destination:'Sandbox destination',verification:{phone:true,identity:true,face:true},shop:{name:'Night Counter',area:'Night Market',category:'Food & drinks',lat:5.6509,lng:-.1878},credentials}});const shopId=state.shops[0].id;
  c=createDevices({storage:storage(),api,getState:()=>state,getSession:()=>current,onTestVoice:()=>{}});await c.start();await c.handleSubmit({values:{label:'Original counter',shopId}});await c.handleClick('device-test');assert.equal(c.canAnnounce(shopId),true);const phoneId=c.getDeviceId(),oldSession=current.id;
  await api('/api/devices/'+phoneId,{method:'POST',body:{action:'revoke'}});assert.equal(current,null);await c.handleSubmit({values:{label:'Attempt without sign-in',shopId,confirmRestore:'on'}});assert.equal(pairCalls,1,'a revoked session cannot restore itself');
  await api('/api/auth/login',{method:'POST',body:credentials});assert.notEqual(current.id,oldSession);await c.refresh();assert.match(c.render(),/Restore this phone/);assert.equal(c.getDeviceId(),phoneId);
  await c.handleSubmit({values:{label:'Confirmed restored counter',shopId,confirmRestore:'on'}});assert.equal(pairCalls,2);assert.equal(c.canAnnounce(shopId),false);const restored=c.getDevices().find(d=>d.id===phoneId);assert.equal(restored.sessionId,current.id);assert.equal(restored.revokedAt,null);assert.equal(restored.soundReady,false);
  await c.handleClick('device-test');assert.equal(c.canAnnounce(shopId),true);await c.handleClick('device-test');assert.equal(c.canAnnounce(shopId),true,'the real enable endpoint must not mute a successful retest');
 }finally{c?.stop();DB.close();globalThis.FormData=previousFormData}
});

test('directory refresh resets an unavailable category rather than leaving an invisible filter',async()=>{
 let current=[...shops];const d=createDirectory({api:async()=>({shops:current})});await d.refresh();d.handleChange({name:'directoryCategory',value:'Books'});assert.match(d.render(),/1 shop found/);
 current=[shops[0]];await d.refresh();const html=d.render();assert.match(html,/<option value="all" selected>All categories/);assert.match(html,/1 shop found/);assert.match(html,/Campus Kitchen/);assert.doesNotMatch(html,/No matching merchants/);
});

test('a code lookup waits for the initial in-flight directory load and shares the same request',async()=>{
 const before=globalThis.FormData;globalThis.FormData=class{constructor(f){this.values=Object.entries(f.values)}*[Symbol.iterator](){yield* this.values}};
 try{
  let release,calls=0;const d=createDirectory({api:()=>{calls++;return new Promise(resolve=>release=()=>resolve({shops}))}});const load=d.refresh();await d.handleClick('directory-lookup-code');const lookup=d.handleSubmit({values:{type:'code',value:'LUM100001'}});
  assert.doesNotMatch(d.render(),/No merchant matches/);assert.equal(calls,1);release();await Promise.all([load,lookup]);assert.match(d.render(),/Check the receiving shop/);assert.match(d.render(),/Night Counter/);assert.doesNotMatch(d.render(),/No merchant matches/);
 }finally{globalThis.FormData=before}
});

test('a failed in-flight directory load reports loading failure instead of a false invalid code',async()=>{
 const before=globalThis.FormData;globalThis.FormData=class{constructor(f){this.values=Object.entries(f.values)}*[Symbol.iterator](){yield* this.values}};
 try{
  let reject;const d=createDirectory({api:()=>new Promise((_,no)=>reject=no)});const load=d.refresh();await d.handleClick('directory-lookup-code');const lookup=d.handleSubmit({values:{type:'code',value:'LUM100001'}});reject(Error('Directory connection lost'));await Promise.all([load,lookup]);assert.match(d.render(),/Directory connection lost/);assert.doesNotMatch(d.render(),/No merchant matches/);
 }finally{globalThis.FormData=before}
});
