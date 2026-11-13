import './legacy-d1-transport.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {createD1} from '../scripts/d1-adapter.mjs';
import {handleAPI} from '../server/api.js';

// Legacy domain/UI compatibility: real browser modules use the actual D1 API
// through an explicit test-only transport. This is not a Supabase integration test.
// A minimal DOM is sufficient for checking event wiring, role gates and rendered data.
class Storage { constructor(){this.data=new Map()} getItem(k){return this.data.get(k)??null} setItem(k,v){this.data.set(k,String(v))} removeItem(k){this.data.delete(k)} clear(){this.data.clear()} }
class Element {
 constructor(){this.innerHTML='';this.dataset={};this.children=[];this.inert=false;this.disabled=false;this.value='';this.classList={add(){},remove(){},toggle(){},contains(){return false}}}
 querySelector(){return null} querySelectorAll(){return []} append(child){this.children.push(child)} remove(){} focus(){} scrollTo(){} scrollIntoView(){} setAttribute(){} contains(){return false} matches(){return false}
}

const original={fetch:globalThis.fetch,setTimeout:globalThis.setTimeout,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval,FormData:globalThis.FormData};
const DB=createD1();for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())await DB.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
const env={DB},cookies=new Map(),listeners=new Map(),windowListeners=new Map(),nodes=new Map(['app','modal-root','toast-root','payment-announcement'].map(id=>[id,new Element()]));
const calls=[];
function jarClient(jar=cookies){
 return async function call(path,{method='GET',headers={},body}={}){
  const requestHeaders=new Headers(headers);requestHeaders.set('Origin','https://merchant.example.test');requestHeaders.set('cf-connecting-ip','shared-app-harness');
  if(jar.size)requestHeaders.set('Cookie',[...jar].map(([k,v])=>k+'='+v).join('; '));
  const response=await handleAPI(new Request(new URL(path,'https://merchant.example.test'),{method,headers:requestHeaders,...(body===undefined?{}:{body})}),env);
  for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1))}
  calls.push({path,method,status:response.status});return response;
 };
}
const rawFetch=jarClient();
const document={body:new Element(),activeElement:null,querySelector(selector){return /^#[a-z-]+$/.test(selector)?nodes.get(selector.slice(1))||null:null},querySelectorAll(){return []},getElementById(id){return nodes.get(id)||null},createElement(){return new Element()},addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn)}};
Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
const lockQueue=new Map(),browserLocks={request(name,options,callback){const next=(lockQueue.get(name)||Promise.resolve()).catch(()=>{}).then(callback);lockQueue.set(name,next);return next.finally(()=>{if(lockQueue.get(name)===next)lockQueue.delete(name)})}};
Object.defineProperty(globalThis,'navigator',{value:{userAgent:'Shared app module test',onLine:true,locks:browserLocks,clipboard:{writeText:async()=>{}}},configurable:true});
const speech={spoken:[],cancelCount:0,getVoices(){return [{lang:'en-GH'}]},speak(value){this.spoken.push(value);value.onend?.()},cancel(){this.cancelCount++}};
Object.assign(globalThis,{document,localStorage:new Storage(),sessionStorage:new Storage(),location:new URL('https://merchant.example.test/'),fetch:rawFetch,
 window:{addEventListener(name,fn){if(!windowListeners.has(name))windowListeners.set(name,[]);windowListeners.get(name).push(fn)},scrollTo(){},matchMedia(){return {matches:false}},speechSynthesis:speech},speechSynthesis:speech,SpeechSynthesisUtterance:class {constructor(value){this.text=value}},requestAnimationFrame(fn){fn();return 1},cancelAnimationFrame(){},BroadcastChannel:class {addEventListener(){}postMessage(){}close(){}},
 setInterval(){return {unref(){}}},clearInterval(){},setTimeout(fn,ms,...args){const timer=original.setTimeout(fn,ms,...args);timer.unref();return timer},
 FormData:class {constructor(form){this.entries=form.values}getAll(name){return this.entries.filter(([key])=>key===name).map(([,value])=>value)}*[Symbol.iterator](){yield* this.entries}}
});
const html=()=>nodes.get('app').innerHTML,modal=()=>nodes.get('modal-root').innerHTML;
async function until(predicate,label){for(let i=0;i<500;i++){if(predicate())return;await new Promise(resolve=>original.setTimeout(resolve,5))}throw Error('Timed out: '+label+'; page: '+html().replace(/<[^>]+>/g,' ').slice(-1000)+'; modal: '+modal().replace(/<[^>]+>/g,' ').slice(-500))}
async function click(action,dataset={}){const element={...new Element(),tagName:'BUTTON',dataset:{action,...dataset},disabled:false,focus(){},closest(selector){return selector==='[data-action]'?this:null}};await Promise.all((listeners.get('click')||[]).map(fn=>fn({target:element,preventDefault(){}})));await new Promise(resolve=>setImmediate(resolve))}
async function submit(values,type='access',dataset={}){const entries=Object.entries(values).flatMap(([key,value])=>Array.isArray(value)?value.map(v=>[key,v]):[[key,value]]);const form={dataset:{form:type,...dataset},values:entries,elements:Object.fromEntries(entries.map(([key,value])=>[key,{value,checked:value==='on'}])),querySelectorAll(){return []}};await Promise.all((listeners.get('submit')||[]).map(fn=>fn({target:form,preventDefault(){},submitter:{value:'save'}})));await new Promise(resolve=>setImmediate(resolve))}
async function change(name,value,dataset={}){const element={...new Element(),name,value,dataset,closest(){return null}};await Promise.all((listeners.get('change')||[]).map(fn=>fn({target:element})));await new Promise(resolve=>setImmediate(resolve))}
async function external(path,body,jar){const result=await jarClient(jar)(path,{method:'POST',headers:{'Content-Type':'application/json','X-Lumo-Request':'1'},body:JSON.stringify(body)});assert.ok(result.ok,await result.clone().text());return result.json()}

let store,Auth,Shared;
const username='shared.ui.owner',password='SharedOwner123';

test('legacy D1 compatibility: app modules connect signup, team access, campus wallet and current merchant balances',async t=>{
 try{
  await import('../dist/app.js');store=await import('../dist/store.js');Auth=await import('../dist/account.js');Shared=await import('../dist/shared.js');
  await t.test('fresh-browser sign-in opens the account form',async()=>{
   assert.equal(store.hasRegistration(),false);await click('signup-login');assert.match(html(),/Welcome back/);await click('access-signup');assert.match(html(),/Create merchant account/);
  });
  await t.test('sample Collect and both QR types explain the consumer-app limitation and open the existing signup',async()=>{
   const warning=/Its QR and shop code cannot receive payments from the Lumo consumer app/;
   await click('signup-demo');await click('collect-shortcut',{mode:'amount'});
   assert.equal(store.getWorkspaceMode(),'sample');assert.match(html(),warning);assert.match(html(),/data-action="onboarding">Create merchant account/);assert.match(html(),/collect-keypad/);
   await click('key',{value:'1'});await click('create-charge');
   assert.match(modal(),warning);assert.match(modal(),/data-action="onboarding"[^>]*>Create merchant account/);assert.match(modal(),/GH₵1.00/);assert.match(modal(),/Preview a sample payment in this browser/);assert.doesNotMatch(modal(),/Scan with Lumo/);
   await click('onboarding');assert.equal(modal(),'');assert.match(html(),/signup-shell is-welcome/);assert.match(html(),/Create merchant account/);
   await click('signup-demo');await click('collect-shortcut',{mode:'static'});
   assert.match(html(),warning);assert.match(html(),/Preview a sample payment in this browser/);assert.match(html(),/Use Preview customer payment to explore this sample/);assert.doesNotMatch(html(),/Customer scans, enters the amount and pays/);
   await click('shop-qr',{id:store.getState().shops[0].id});assert.match(modal(),warning);assert.match(modal(),/data-action="onboarding"[^>]*>Create merchant account/);
   await click('onboarding');assert.equal(modal(),'');assert.match(html(),/signup-shell is-welcome/);assert.equal(calls.filter(call=>call.path==='/api/signup').length,0,'The clarity action opens signup without registering or publishing the sample shop');
  });
  await t.test('signup success displays the new server business, not sample account data',async()=>{
   await click('signup-begin');await submit({phone:'0245550188'},'signup');await submit({otp:'123456'},'signup');
   await submit({username,password,confirmation:password},'signup');await submit({name:'Shared Campus Kitchen',ownerName:'Shared Owner',businessType:'sole-proprietor'},'signup');
   await click('signup-verify-id');await click('signup-verify-face');await submit({},'signup');await submit({bankProvider:'GCB Bank',bankNumber:'113004567890'},'signup');
   await submit({shopName:'Shared Night Market Counter',area:'Night Market',category:'Food & drinks',managerName:'Shared Owner'},'signup');await submit({consent:'on'},'signup');
   await until(()=>Auth.getSession()?.role==='owner'&&html().includes('signup-success-account'),'shared owner signup');
   const remote=Shared.getCache().state;
   assert.equal(remote.business.name,'Shared Campus Kitchen');assert.equal(remote.shops.length,1);
   assert.match(html(),new RegExp(remote.business.accountNumber));assert.doesNotMatch(html(),/9900123400/);
   await click('signup-enter');await until(()=>html().includes('recovery-key')||html().includes('Keep a way back'),'recovery key prompt');
   await submit({keySaved:'on'});await until(()=>html().includes('Net collected · since last close'),'owner home');await click('go-overview');await until(()=>html().includes('Merchant balance'),'owner dashboard');
   assert.equal(store.getWorkspaceMode(),'registered');assert.equal(store.metrics().balance,0);assert.equal(store.getState().business.id,remote.business.id);
   for(const storage of [localStorage,sessionStorage])for(const value of storage.data.values())assert.ok(!value.includes(password),'A test password must not be stored as plaintext');
  });
  await t.test('Home holds the collection overview while focused Collect and Administration keep their own navigation',async()=>{
   await click('go-home');assert.match(html(),/Net collected · since last close/);assert.match(html(),/Confirmed payments/);assert.match(html(),/Still processing/);assert.match(html(),/Your receiving phone/);assert.match(html(),/data-change="collectShop"/);
   for (const navigation of [html().match(/<nav class="sidebar-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1],html().match(/<nav class="bottom-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1]]) {
    assert.ok(navigation,'Both desktop and mobile main navigation must render');
    assert.deepEqual([...navigation.matchAll(/data-page="([^"]+)"/g)].map(match=>match[1]),['home','checkout','administration']);
    assert.match(navigation,/>Home</);assert.match(navigation,/>Collect</);assert.match(navigation,/>Administration</);
   }
   for(const panel of ['requests','receiver']){
    const disclosure=html().match(new RegExp('<details\\b(?=[^>]*data-home-panel="'+panel+'")([^>]*)>'));
    assert.ok(disclosure,`Home keeps ${panel} tools in an expandable section`);assert.doesNotMatch(disclosure[1],/\bopen(?:[\s=]|$)/,'Extra tools start collapsed');
   }
   for(const mode of ['amount','static'])assert.match(html(),new RegExp('<button\\b(?=[^>]*data-action="collect-shortcut")(?=[^>]*data-mode="'+mode+'")[^>]*>'),'Both Home collection shortcuts must be wired');
   await click('collect-shortcut',{mode:'static'});assert.match(html(),/static-qr/);assert.match(html(),/Customer scans, enters the amount and pays/);assert.match(html(),/Shared Night Market Counter/);assert.doesNotMatch(html(),/collect-keypad/);assert.equal(modal(),'','The shortcut opens Collect rather than a second QR dialog');
   assert.doesNotMatch(html(),/Browser-only sample|cannot receive payments from the Lumo consumer app|data-action="onboarding"/);
   await click('go-home');await click('collect-shortcut',{mode:'amount'});assert.match(html(),/Generate payment QR/);assert.match(html(),/collect-keypad/);assert.doesNotMatch(html(),/static-qr/);
   await click('go-administration');assert.match(html(),/Business overview/);assert.match(html(),/Settle to bank/);assert.match(html(),/Team & access/);
   await click('go-checkout');assert.match(html(),/Generate payment QR/);assert.doesNotMatch(html(),/Merchant balance|Net collected · since last close|Confirmed payments|Still processing|Your receiving phone|data-change="collectShop"|data-action="collection-requests"/);assert.match(html(),/Shared Night Market Counter/);
  });
  await t.test('rapid QR generation taps create one fixed-amount request, and a lost response retrieves that same request',async()=>{
   const receivingShop=store.getState().shops[0].id,before=store.getState().requests.length;
   await click('key',{value:'2'});await click('key',{value:'5'});await change('note','Lunch',{change:'collectionNote'});
   let release,createCalls=0;
   globalThis.fetch=async(path,options={})=>{const body=options.body?JSON.parse(options.body):null;if(path==='/api/action'&&body?.type==='CREATE_REQUEST'){createCalls++;await new Promise(resolve=>{release=resolve})}return rawFetch(path,options)};
   try {
    const posting=click('create-charge');await until(()=>Boolean(release),'QR creation held in flight');await click('create-charge');assert.equal(createCalls,1,'A second tap must not send another creation request');release();await posting;
    const request=store.getState().requests[0];assert.equal(store.getState().requests.length,before+1);assert.equal(request.shopId,receivingShop);assert.equal(request.amount,2500);assert.equal(request.description,'Lunch');assert.ok(request.attemptId);assert.match(modal(),/GH₵25.00/);
    await click('cancel-request',{id:request.id});await click('next-customer');
   } finally {release?.();globalThis.fetch=rawFetch}
   await click('key',{value:'3'});await click('key',{value:'5'});
   let drop=true;const references=[];
   globalThis.fetch=async(path,options={})=>{const body=options.body?JSON.parse(options.body):null,response=await rawFetch(path,options);if(path==='/api/action'&&body?.type==='CREATE_REQUEST'){references.push(body.payload.attemptId);if(drop){drop=false;assert.ok(response.ok,await response.clone().text());throw new TypeError('QR committed but response lost')}}return response};
   try {
    await click('create-charge');await click('create-charge');assert.equal(references.length,2);assert.equal(references[0],references[1],'A network retry must reuse the saved request reference');
    assert.equal(store.getState().requests.length,before+2);const request=store.getState().requests.find(request=>request.attemptId===references[0]);assert.equal(request.amount,3500);assert.match(modal(),/GH₵35.00/);await click('cancel-request',{id:request.id});await click('next-customer');
   } finally {globalThis.fetch=rawFetch}
  });
  await t.test('QR presentation stops payment for expired, cancelled, processing and confirmed requests',async()=>{
   const {requestPresentation}=await import('../dist/collections-ui.js');
   const request={id:'presentation-request',status:'open',expiresAt:'2026-11-12T12:15:00.000Z'};
   const before=Date.parse('2026-11-12T12:10:00.000Z'),after=Date.parse('2026-11-12T12:16:00.000Z');
   assert.equal(requestPresentation({transactions:[]},request,before).canPay,true);
   const expired=requestPresentation({transactions:[]},request,after);assert.equal(expired.status,'expired');assert.equal(expired.canPay,false);assert.equal(expired.remaining,0);
   const cancelled=requestPresentation({transactions:[]},{...request,status:'cancelled'},before);assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.canPay,false);
   const processing=requestPresentation({transactions:[{id:'processing',requestId:request.id,status:'processing'}]},request,before);assert.equal(processing.status,'processing');assert.equal(processing.canPay,false);
   const paid=requestPresentation({transactions:[{id:'confirmed',requestId:request.id,status:'paid'}]},request,after);assert.equal(paid.status,'paid');assert.equal(paid.canPay,false);assert.equal(paid.transaction.id,'confirmed');
   assert.equal(requestPresentation({transactions:[{id:'unrelated',requestId:'another-request',status:'paid'}]},request,before).status,'waiting');
  });
  await t.test('a known QR recovered after a lost response releases the counter for the next customer',async()=>{
   await click('go-checkout');await click('key',{value:'4'});await click('key',{value:'7'});
   let drop=true,attemptId;
   globalThis.fetch=async(path,options={})=>{const body=options.body?JSON.parse(options.body):null,response=await rawFetch(path,options);if(path==='/api/action'&&body?.type==='CREATE_REQUEST'&&drop){drop=false;attemptId=body.payload.attemptId;assert.ok(response.ok,await response.clone().text());throw new TypeError('QR committed but response lost')}return response};
   try {
    await click('create-charge');await click('next-customer');assert.match(html(),/aria-label="47 Ghana cedis"/,'An unknown outcome must preserve the original amount for retrieval');await click('key',{value:'9'});assert.doesNotMatch(html(),/aria-label="479 Ghana cedis"/);
    await Shared.refresh();const request=store.getState().requests.find(request=>request.attemptId===attemptId);assert.ok(request);
    await Shared.api('/api/action',{method:'POST',body:{type:'CANCEL_REQUEST',payload:{id:request.id}}});await click('request-detail',{id:request.id});assert.match(modal(),/Request cancelled/);
    await click('next-customer');await click('key',{value:'9'});assert.match(html(),/aria-label="9 Ghana cedis"/,'A known original outcome must release amount entry');assert.doesNotMatch(html(),/Retrieve payment QR/);await click('clear-charge');
   } finally {globalThis.fetch=rawFetch}
  });
  await t.test('Home retains processing requests while static confirmations stay above the Collect QR',async()=>{
   await click('go-checkout');await click('clear-charge');await click('key',{value:'6'});await click('create-charge');
   const request=store.getState().requests[0];
   const processing=await Shared.api('/api/simulate',{method:'POST',body:{type:'PAY',payload:{shopId:request.shopId,requestId:request.id,amount:request.amount,payer:'Queue Student',status:'processing',method:'request',attemptId:'queue-ui-processing'}}});
   await click('dismiss');await click('go-home');assert.match(html(),/data-action="collection-requests"/);await click('collection-requests');assert.match(modal(),/Checking payment/);assert.match(modal(),/GH₵6.00/);assert.doesNotMatch(modal(),/No active requests/);
   await Shared.api('/api/action',{method:'POST',body:{type:'RESOLVE_PAYMENT',payload:{id:processing.entity.id,status:'paid'}}});
   await click('dismiss');await click('go-checkout');await click('collect-mode',{mode:'static'});assert.match(html(),/collection-received new-receipt/);assert.match(html(),/Payment received/);assert.match(html(),/Queue Student/);assert.ok(html().indexOf('collection-received')<html().indexOf('static-qr'),'The exact receipt is visible before the reusable QR');assert.match(nodes.get('payment-announcement').textContent,/Payment received.*Queue Student/);
   await click('go-administration');assert.match(html(),/Refund approvals/);await click('approvals');assert.match(modal(),/Refund/);await click('dismiss');await click('go-checkout');await click('collect-mode',{mode:'amount'});
  });
  let cashier,shopId,secondShopId,ownerJar;
  await t.test('owner invitations create a shop-scoped cashier, with inaccessible owner controls',async()=>{
   shopId=store.getState().shops[0].id;const second=await Shared.api('/api/action',{method:'POST',body:{type:'ADD_SHOP',payload:{name:'Shared Pentagon Counter',area:'Pentagon',category:'Food & drinks',lat:5.6535,lng:-.1845}}});secondShopId=second.entity.id;ownerJar=new Map(cookies);
   await click('go-team');assert.match(html(),/Business users/);await click('people-new');
   await submit({name:'Shared Cashier',phone:'0555550101',role:'cashier',shopIds:[shopId]},'people',{peopleForm:'invite'});
   await until(()=>html().includes('Their place is ready'),'invitation created');
   const invite=Auth.listInvitations(store.getState().business.id).find(i=>i.name==='Shared Cashier');assert.ok(invite);
   await click('people-try-invitation',{token:invite.token});await until(()=>html().includes('Welcome to'),'invitation lookup');
   await submit({username:'shared.ui.cashier',newPassword:'SharedCashier123',confirmPassword:'SharedCashier123'});
   await until(()=>Auth.getSession()?.role==='cashier','accepted cashier');
   await until(()=>html().includes('recovery-key')||html().includes('Keep a way back'),'cashier recovery key');await submit({keySaved:'on'});
   await until(()=>html().includes('Your receiving phone'),'cashier Home');cashier=Auth.getSession();
   assert.doesNotMatch(html(),/Merchant balance|data-page="settlements"|data-page="team"|data-action="role-switch"/);
   await click('go-settlements');assert.match(html(),/Your receiving phone/);
   await submit({name:'Unauthorised Rename'},'business');assert.equal(Shared.getCache().state.business.name,'Shared Campus Kitchen');
  });
  await t.test('a new merchant stays private until counter setup and explicit publication are complete',async()=>{
   const before=await (await rawFetch('/api/directory')).json();assert.ok(!before.shops.some(shop=>shop.id===shopId),'A new signup must not silently become a public campus listing');
   await click('go-devices');await submit({label:'Night Market test phone',shopId},'devices');await until(()=>Shared.getCache().devices.some(device=>device.shopId===shopId),'cashier receiving phone paired');
   await click('device-test');await until(()=>Shared.getCache().devices.some(device=>device.shopId===shopId&&device.testedAt&&device.soundReady===true),'cashier receiving phone tested');
   await click('go-home');await until(()=>html().includes('Announcements are on'),'registered Home receiving status');assert.match(html(),/This tab is the receiving device/);
   await external('/api/action',{type:'UPDATE_ACTIVATION',payload:{shopId,locationConfirmed:true,qrReady:true}},ownerJar);
   await external('/api/action',{type:'UPDATE_SHOP',payload:{id:shopId,published:true}},ownerJar);
   const after=await (await rawFetch('/api/directory')).json();assert.ok(after.shops.some(shop=>shop.id===shopId));assert.ok(!after.shops.some(shop=>shop.id===secondShopId));
  });
  await t.test('student demo wallet payment debits once and refreshes owner collections',async()=>{
   const beforeOwner=await (await jarClient(ownerJar)('/api/session')).json();
   await click('access-sign-out');await until(()=>!Auth.getSession()&&html().includes('Welcome back'),'cashier signout');
   await click('access-demo');await click('switch-role',{role:'student'});await click('directory-refresh');
   await until(()=>html().includes('Shared Campus Kitchen'),'campus directory');
   const businessId=Shared.getCache().state?.business?.id||store.getState().business.id;
   // The public directory is the source for this globally allocated shop, not the sample workspace.
   const directory=await (await rawFetch('/api/directory')).json();const publicShop=directory.shops.find(s=>s.id===shopId);assert.ok(publicShop);
   await click('directory-pay',{id:publicShop.businessId+':'+shopId});await until(()=>modal().includes('Try Campus Pay'),'student create view');
   await submit({name:'Shared Student'},'campus-pay',{campusForm:'create'});await until(()=>modal().includes('Pay the right counter'),'student pay view');
   await click('campus-pay-fund');await submit({fundAmount:'50.00'},'campus-pay',{campusForm:'fund'});await until(()=>modal().includes('Pay the right counter')&&modal().includes('50.00'),'wallet funded');
   await submit({amount:'15.25'},'campus-pay',{campusForm:'amount'});assert.match(modal(),/One final check/);
   await click('campus-pay-confirm');await until(()=>modal().includes('Payment confirmed')||modal().includes('payment is confirmed'),'student receipt');
   assert.equal(Shared.getCache().student.balance,3475);
   const ownerResponse=await (await jarClient(ownerJar)('/api/session')).json();assert.equal(ownerResponse.metrics.balance,beforeOwner.metrics.balance+1525);assert.equal(ownerResponse.state.transactions.length,beforeOwner.state.transactions.length+1);
   await click('campus-pay-close');assert.equal(modal(),'');assert.equal(nodes.get('app').inert,false);
   await click('merchant-signin');await submit({username,password});await until(()=>Auth.getSession()?.role==='owner'&&html().includes('Net collected · since last close'),'returning owner home');await click('go-overview');
   assert.equal(store.metrics().balance,beforeOwner.metrics.balance+1525);assert.equal(store.getState().business.id,publicShop.businessId);
  });
  await t.test('administration cannot switch the receiving shop while QR creation is unresolved',async()=>{
   await click('go-home');await change('shop',shopId,{change:'collectShop'});await click('go-checkout');await click('key',{value:'6'});await click('key',{value:'2'});
   let release;
   globalThis.fetch=async(path,options={})=>{const body=options.body?JSON.parse(options.body):null;if(path==='/api/action'&&body?.type==='CREATE_REQUEST')await new Promise(resolve=>{release=resolve});return rawFetch(path,options)};
   let posting;
   try {
    posting=click('create-charge');await until(()=>Boolean(release),'unresolved QR before administration shop switch');
    await click('go-activation');await change('operationsShop',secondShopId);await click('ops-checkout');assert.doesNotMatch(html(),/aria-label="Receive a payment"/,'Blocked central shop selection must abort navigation');
    release();await posting;const request=store.getState().requests[0];assert.equal(request.shopId,shopId);assert.equal(request.amount,6200);await click('cancel-request',{id:request.id});await click('next-customer');
    await click('go-home');assert.match(html(),new RegExp('value="'+shopId+'" selected'));await click('go-checkout');await click('key',{value:'8'});assert.match(html(),/aria-label="8 Ghana cedis"/);await click('clear-charge');
   } finally {release?.();await posting;globalThis.fetch=rawFetch}
  });
  await t.test('a paused shop can retrieve its existing request after a lost creation response',async()=>{
   await click('go-home');await change('shop',shopId,{change:'collectShop'});await click('go-checkout');await click('key',{value:'5'});await click('key',{value:'4'});
   let drop=true,attemptId;
   globalThis.fetch=async(path,options={})=>{const body=options.body?JSON.parse(options.body):null,response=await rawFetch(path,options);if(path==='/api/action'&&body?.type==='CREATE_REQUEST'&&drop){drop=false;attemptId=body.payload.attemptId;assert.ok(response.ok,await response.clone().text());throw new TypeError('QR committed but response lost')}return response};
   try {
    await click('create-charge');await Shared.api('/api/action',{method:'POST',body:{type:'UPDATE_SHOP',payload:{id:shopId,accepting:false}}});assert.match(html(),/data-action="create-charge"\s*>Retrieve payment QR/,'Retrieval must remain enabled for an existing request while the shop is paused');
    await click('create-charge');assert.match(modal(),/GH₵54.00/);const request=store.getState().requests.find(request=>request.attemptId===attemptId);assert.ok(request);assert.equal(store.getState().requests.filter(request=>request.attemptId===attemptId).length,1);await click('cancel-request',{id:request.id});await click('next-customer');
   } finally {globalThis.fetch=rawFetch;await Shared.api('/api/action',{method:'POST',body:{type:'UPDATE_SHOP',payload:{id:shopId,accepting:true}}})}
  });
  await t.test('shop readiness hands the selected counter to checkout and team invitations',async()=>{
   await click('go-activation');await change('operationsShop',secondShopId);await click('ops-checkout');assert.match(html(),/Shared Pentagon Counter/);assert.match(html(),/Generate payment QR/);
   await click('go-activation');await click('ops-invite');assert.match(html(),/New invitation/);assert.match(html(),new RegExp('name="shopIds" value="'+secondShopId+'" checked'));assert.doesNotMatch(html(),new RegExp('name="shopIds" value="'+shopId+'" checked'));
  });
  await t.test('authorised receipts announce once on protected account pages and never replay after return',async()=>{
   await click('go-devices');await click('device-new-pairing');await submit({label:'Owner counter test phone',shopId},'devices');await until(()=>Shared.getCache().devices.some(device=>device.id===localStorage.getItem('lumo-receiving-device-id-v2')&&device.shopId===shopId),'owner receiving phone paired');
   await click('device-test');await until(()=>html().includes('Announcements are on in this tab')||html().includes('Voice test completed'),'owner receiving phone tested');
   await click('go-home');assert.match(html(),/Announcements are on/);const baseline=speech.spoken.length;
   for(const [index,action] of ['open-profile','access-password','access-sessions'].entries()){
    await click(action);assert.match(html(),/Your individual merchant account|Your password|Know where/);
    await external('/api/simulate',{shopId,amount:725+index*100,payer:'Account Screen Student',status:'paid',method:'qr',attemptId:'protected-payment-'+index},ownerJar);await Shared.refresh();assert.equal(speech.spoken.length,baseline+index+1,'An authorised receiver must announce a new receipt once even on an account page');
   }
   await click('access-back');await Shared.api('/api/action',{method:'POST',body:{type:'UPDATE_BUSINESS',payload:{name:'Shared Campus Kitchen'}}});assert.equal(speech.spoken.length,baseline+3,'A protected-screen receipt must not replay after returning to the counter');
   await external('/api/simulate',{shopId,amount:1025,payer:'Active Counter Student',status:'paid',method:'qr',attemptId:'active-payment'},ownerJar);await Shared.refresh();assert.equal(speech.spoken.length,baseline+4,'A genuinely new active-counter receipt should still announce');assert.match(speech.spoken.at(-1).text,/10 cedis.*25 pesewas/);
  });
  await t.test('the assigned shop can read the owner’s support response',async()=>{
   const created=await Shared.api('/api/action',{method:'POST',body:{type:'ADD_TICKET',payload:{shopId,subject:'Receiving phone issue',message:'Please check the counter audio.'}}});const ticketId=created.entity.id;
   await Shared.api('/api/action',{method:'POST',body:{type:'UPDATE_TICKET',payload:{id:ticketId,status:'investigating',response:'Volume checked. Keep this phone connected.'}}});
   await click('access-sign-out');await until(()=>!Auth.getSession()&&html().includes('Welcome back'),'owner signout before support view');await submit({username:'shared.ui.cashier',password:'SharedCashier123'});await until(()=>Auth.getSession()?.role==='cashier'&&html().includes('Your receiving phone'),'cashier support login');
   await click('go-support');await click('ticket-detail',{id:ticketId});assert.match(modal(),/Volume checked\. Keep this phone connected\./);assert.match(modal(),/Investigating|investigating/);await click('dismiss');
   await click('access-sign-out');await until(()=>!Auth.getSession(),'cashier support signout');await submit({username,password});await until(()=>Auth.getSession()?.role==='owner','owner restored for role management');await click('go-overview');
  });
  await t.test('a lost settlement response retries the saved reference and reserves funds once without another password proof',async()=>{
   await click('go-settlements');await click('open-settle');let dropNextSettlement=true;
   const stepUpBefore=calls.filter(call=>call.path==='/api/auth/step-up').length;
   globalThis.fetch=async(path,options={})=>{
    const body=options.body?JSON.parse(options.body):null;
    const response=await rawFetch(path,options);
    if(path==='/api/action'&&body?.type==='SETTLE'&&dropNextSettlement){dropNextSettlement=false;assert.ok(response.ok,await response.clone().text());throw new TypeError('Settlement committed but its response was lost')}
    return response;
   };
   try{
    const posting=submit({amount:'5.00'},'settle');await until(()=>html().includes('Confirm this settlement'),'settlement owner confirmation');await submit({currentPassword:password});await posting;
    const key=[...localStorage.data.keys()].find(key=>key.startsWith('lumo-pending-settlement-v1:'));assert.ok(key);const saved=JSON.parse(localStorage.getItem(key));assert.equal(saved.amount,500);assert.equal(saved.submitted,true);assert.ok(saved.destination);assert.ok(!JSON.stringify(saved).includes(password));
    await click('open-settle');assert.match(modal(),/Check your saved settlement|Check original settlement/);assert.match(modal(),/value="5.00"[^>]*readonly/);
    await submit({amount:'9.00'},'settle');await until(()=>modal().includes('Settlement details'),'original settlement lookup');
    assert.equal(Shared.getCache().state.settlements.length,1);assert.equal(Shared.getCache().state.settlements[0].amount,500);assert.equal(store.metrics().reserved,500);
    assert.equal(Shared.getCache().state.settlements[0].attemptId,saved.attemptId);assert.equal(localStorage.getItem(key),null);
    assert.equal(calls.filter(call=>call.path==='/api/auth/step-up').length,stepUpBefore+1,'Lookup of an existing payout must not require a new proof or create another payout');await click('dismiss');
   }finally{globalThis.fetch=rawFetch}
  });
  await t.test('a definitive unavailable settlement releases its saved intent while an unknown failure preserves the same reference',async()=>{
   const before=store.getState().settlements.length;let code='UNAVAILABLE_SERVICE';
   globalThis.fetch=async(path,options={})=>{const body=options.body?JSON.parse(options.body):null;if(path==='/api/action'&&body?.type==='SETTLE')return Response.json({ok:false,error:'This service is not connected.',code},{status:503});return rawFetch(path,options)};
   async function attempt(){await click('open-settle');const posting=submit({amount:'1.00'},'settle');await until(()=>html().includes('Confirm this settlement'),'owner checks unavailable payout');await submit({currentPassword:password});await posting;}
   try{
    await attempt();assert.equal([...localStorage.data.keys()].filter(key=>key.startsWith('lumo-pending-settlement-v1:')).length,0);assert.equal(Shared.connectionStatus().status,'online');assert.equal(Auth.getSession().role,'owner');
    code='STORAGE_UNAVAILABLE';await attempt();const key=[...localStorage.data.keys()].find(key=>key.startsWith('lumo-pending-settlement-v1:'));assert.ok(key);const original=JSON.parse(localStorage.getItem(key));assert.equal(original.submitted,true);assert.equal(original.amount,100);
    await click('open-settle');assert.match(modal(),/Check your saved settlement/);assert.match(modal(),/value="1.00"[^>]*readonly/);assert.equal(JSON.parse(localStorage.getItem(key)).attemptId,original.attemptId);assert.equal(store.getState().settlements.length,before);
    localStorage.removeItem(key); // Fixture cleanup only; product retains this unknown reference.
   }finally{globalThis.fetch=rawFetch;await Shared.refresh();await click('dismiss')}
  });
  await t.test('UI preference storage failure does not block navigation and Lux identifies its selected shop',async()=>{
   const write=localStorage.setItem;localStorage.setItem=function(key,value){if(key==='lumo-merchant-ui-v2')throw Error('Preference storage full');return write.call(this,key,value)};
   try{await click('go-home');assert.match(html(),/Net collected/);await click('go-activity');assert.match(html(),/Every payment, clearly/);assert.equal(Auth.getSession().role,'owner')}finally{localStorage.setItem=write}
   await click('go-overview');await change('scope',secondShopId,{change:'scope'});await click('go-lux');const selected=store.getState().shops.find(shop=>shop.id===secondShopId).name;assert.ok(html().includes('Viewing '+selected));await click('ask-lux',{question:'How much did we collect today?'});assert.ok(html().includes(selected+' · Today you have'));await change('scope','all',{change:'scope'});await click('go-overview');
  });
  await t.test('owner payment support inherits the linked shop instead of creating a business-only case',async()=>{
   const payment=store.getState().transactions.find(item=>item.shopId===shopId&&item.status==='paid');await click('support-ticket',{transaction:payment.id});await submit({subject:'Owner counter case',message:'Please check this counter receipt.',transactionId:payment.reference},'ticket');const ticket=store.getState().tickets.find(item=>item.subject==='Owner counter case');assert.equal(ticket.shopId,shopId);assert.equal(ticket.transactionId,payment.id);await click('dismiss');
  });
  await t.test('a queued settlement cannot request confirmation or submit under a different signed-in owner',async()=>{
   await click('go-settlements');await click('open-settle');const originalRequest=browserLocks.request;let release,held=false;
   browserLocks.request=(name,options,callback)=>{if(!held){held=true;return new Promise(resolve=>{release=()=>resolve(originalRequest.call(browserLocks,name,options,callback))})}return originalRequest.call(browserLocks,name,options,callback)};
   const before=calls.length,posting=submit({amount:'3.00'},'settle');await until(()=>Boolean(release),'queued payout lock');
   try{
    const otherJar=new Map();const other=await external('/api/signup',{attemptId:'lock-scope-other-owner',name:'Other Scope Business',ownerName:'Other Scope Owner',phone:'0245550199',businessType:'sole-trader',destination:'Sandbox different bank',verification:{phone:true,identity:true,face:true},shop:{name:'Other Scope Counter',area:'Pentagon',category:'Other',lat:5.6535,lng:-.1845},credentials:{username:'scope.other.owner',password:'OtherOwnerScope123'}},otherJar);
    await external('/api/auth/recovery-key/ack',{reference:other.session.recoveryKeyReference},otherJar);
    await Auth.signIn('scope.other.owner','OtherOwnerScope123');release();await posting;
    assert.equal(Auth.getSession().username,'scope.other.owner');assert.doesNotMatch(html(),/data-access-stage="step-up/);assert.equal(calls.slice(before).filter(call=>call.path==='/api/auth/step-up').length,0);assert.equal(Shared.getCache().state.settlements.length,0);
   }finally{browserLocks.request=originalRequest;release?.();await posting;await click('access-login');await submit({username,password});await until(()=>Auth.getSession()?.username===username&&html().includes('Net collected · since last close'),'owner UI restored after queued lock');await click('go-overview')}
  });
  await t.test('shop GPS callbacks cannot overwrite a newer manual pin, a different shop or a newer capture',async()=>{
   const previous=navigator.geolocation,captures=[];navigator.geolocation={getCurrentPosition(success,failure){captures.push({success,failure})}};
   const makeForm=(lat,lng)=>{const form=new Element();form.elements={lat:{value:String(lat)},lng:{value:String(lng)},locationConfirmed:{checked:true}};return form};
   try{
    await click('go-shops');await click('edit-shop',{id:shopId});const formA=makeForm(5.6509,-.1878);nodes.set('shop-form',formA);nodes.set('shop-map-link',{});
    await click('capture-shop-location');const old=captures.at(-1);
    const area={name:'area',value:'Pentagon',dataset:{change:'shopArea'},closest:selector=>selector==='form'?formA:null};for(const listener of listeners.get('change')||[])await listener({target:area});
    assert.deepEqual([Number(formA.elements.lat.value),Number(formA.elements.lng.value)],[5.6535,-.1845]);old.success({coords:{latitude:5.6509,longitude:-.1878}});assert.deepEqual([Number(formA.elements.lat.value),Number(formA.elements.lng.value)],[5.6535,-.1845]);assert.equal(formA.elements.locationConfirmed.checked,false);
    await click('capture-shop-location');const dismissed=captures.at(-1);await click('dismiss');await click('edit-shop',{id:secondShopId});const formB=makeForm(5.6535,-.1845);nodes.set('shop-form',formB);dismissed.success({coords:{latitude:5.6509,longitude:-.1878}});assert.deepEqual([Number(formB.elements.lat.value),Number(formB.elements.lng.value)],[5.6535,-.1845]);
    await click('capture-shop-location');const earlier=captures.at(-1);await click('capture-shop-location');const latest=captures.at(-1);latest.success({coords:{latitude:5.6536,longitude:-.1844}});earlier.success({coords:{latitude:5.6509,longitude:-.1878}});assert.deepEqual([Number(formB.elements.lat.value),Number(formB.elements.lng.value)],[5.6536,-.1844]);assert.equal(formB.elements.locationConfirmed.checked,false);
    const toastCount=nodes.get('toast-root').children.length;await click('dismiss');latest.failure();assert.equal(nodes.get('toast-root').children.length,toastCount,'An obsolete GPS error must not interrupt another screen');
   }finally{navigator.geolocation=previous;nodes.delete('shop-form');nodes.delete('shop-map-link')}
  });
  await t.test('failed receipt speech withdraws readiness until retest and never replays the failed receipt',async()=>{
   await click('go-devices');await submit({label:'Owner speech regression phone',shopId},'devices');await click('device-test');await click('go-activation');await change('operationsShop',shopId);await click('ops-checkout');await click('go-home');await until(()=>html().includes('Announcements are on'),'receiver active before speech failure');
   const originalSpeak=speech.speak,baseline=speech.spoken.length;
   speech.speak=function(utterance){this.spoken.push(utterance);utterance.onerror?.({error:'synthesis-failed'})};
   try{await external('/api/simulate',{shopId,amount:1375,payer:'Speech Failure Student',status:'paid',method:'qr',attemptId:'v8-failed-speech'},ownerJar);await Shared.refresh();await until(()=>Shared.getCache().devices.some(device=>device.id===localStorage.getItem('lumo-receiving-device-id-v2')&&device.soundReady===false),'failed speech server readiness');assert.doesNotMatch(html(),/Announcements are on/);assert.match(html(),/Sound failed/);assert.match(html(),/Retest sound/);await click('go-devices');assert.match(html(),/announcement|Announcement/);assert.match(html(),/LM/)}finally{speech.speak=originalSpeak}
   await click('device-test');await until(()=>Shared.getCache().devices.some(device=>device.id===localStorage.getItem('lumo-receiving-device-id-v2')&&device.soundReady===true),'receiver restored by test');const afterTest=speech.spoken.length;await Shared.refresh();assert.equal(speech.spoken.length,afterTest,'Retesting must not announce an old sale');assert.equal(afterTest,baseline+2);
   await click('go-overview');
  });
  await t.test('custom campus areas survive editing other shop details',async()=>{
   await Shared.api('/api/action',{method:'POST',body:{type:'UPDATE_SHOP',payload:{id:shopId,area:'Sarbah Hall'}}});await click('edit-shop',{id:shopId});assert.match(modal(),/<option selected>Other<\/option>/);assert.match(modal(),/name="customArea" value="Sarbah Hall"/);
   await submit({id:shopId,name:'Shared Night Market Counter',area:'Other',customArea:'Sarbah Hall',category:'Food & drinks',landmark:'Beside the hall entrance',hours:'8 am – 11 pm',lat:'5.6509',lng:'-.1878',locationConfirmed:'on'},'shop');assert.equal(store.getState().shops.find(shop=>shop.id===shopId).area,'Sarbah Hall');assert.equal(store.getState().shops.find(shop=>shop.id===shopId).hours,'8 am – 11 pm');
  });
  await t.test('payment filters reset when opening another workspace and returning to the owner',async()=>{
   await click('go-activity');await change('shopId',shopId,{reporting:'activity'});await click('open-sample');await click('go-activity');assert.equal(store.getWorkspaceMode(),'sample');assert.doesNotMatch(html(),/No payments match/);assert.match(html(),/value="all" selected/);
   await click('merchant-signin');await submit({username,password});await until(()=>Auth.getSession()?.username===username&&store.getWorkspaceMode()==='registered','owner restored from sample');await click('go-overview');
  });
  await t.test('central recovery checkpoint blocks dashboard and account navigation until exact acknowledgement',async()=>{
   await Auth.regenerateRecoveryKey({currentPassword:password});assert.equal(Auth.getSession().recoveryKeyPending,true);await click('go-overview');assert.match(html(),/data-access-stage="recovery-key/);await click('access-back');assert.doesNotMatch(html(),/class="account-card/);await click('open-profile');assert.match(html(),/data-access-stage="recovery-key/);assert.equal(Auth.getSession().recoveryKeyPending,true);await submit({keySaved:'on'});await until(()=>Auth.getSession()?.recoveryKeyPending===false&&!html().includes('data-access-stage="recovery-key'),'key acknowledged through central checkpoint');await click('go-overview');
  });
  await t.test('a lost refund response retains its original reference and UI retry returns one refund',async()=>{
   const transaction=store.getState().transactions.find(tx=>tx.status==='paid'&&tx.amount>=200),before=store.getState().refunds.length;await click('refund',{id:transaction.id});let drop=true;globalThis.fetch=async(path,options={})=>{const body=options.body?JSON.parse(options.body):null,response=await rawFetch(path,options);if(path==='/api/action'&&body?.type==='REFUND'&&drop){drop=false;assert.ok(response.ok,await response.clone().text());throw new TypeError('Refund committed but response lost')}return response};
   async function confirmedRefund(values){const posting=submit(values,'refund');await until(()=>html().includes('Confirm this refund'),'refund password confirmation');await submit({currentPassword:password});await posting;}
   try{await confirmedRefund({transactionId:transaction.id,amount:'1.00',reason:'Customer request'});const key=[...localStorage.data.keys()].find(key=>key.startsWith('lumo-pending-refund-v1:'));assert.ok(key);const pending=JSON.parse(localStorage.getItem(key));await confirmedRefund({transactionId:transaction.id,amount:'9.00',reason:'Changed reason'});assert.equal(store.getState().refunds.length,before+1);assert.equal(store.getState().refunds.find(refund=>refund.attemptId===pending.attemptId)?.amount,100);assert.equal(localStorage.getItem(key),null)}finally{globalThis.fetch=rawFetch;await click('dismiss')}
  });
  await t.test('Add Shop retains the explicitly checked entrance confirmation through the actual app and API',async()=>{
   await click('go-shops');await click('add-shop');await submit({id:'',name:'Shared Confirmed Entrance',area:'Other',customArea:'Sarbah Hall',category:'Food & drinks',landmark:'Checked hall entrance',hours:'8 am – 10 pm',lat:'5.65',lng:'-.18',locationConfirmed:'on'},'shop');
   const created=store.getState().shops.find(shop=>shop.name==='Shared Confirmed Entrance');assert.ok(created);assert.equal(created.area,'Sarbah Hall');assert.equal(created.activation.locationConfirmed,true);assert.equal(created.activation.qrReady,false);assert.equal(created.published,false);await click('go-overview');
  });
  await t.test('role change and suspension from another owner client invalidate the open staff view',async()=>{
   await Shared.api('/api/users/'+cashier.userId,{method:'POST',body:{role:'manager',shopIds:[shopId,secondShopId]}});
   await click('access-sign-out');await until(()=>!Auth.getSession(),'owner signout');await submit({username:'shared.ui.cashier',password:'SharedCashier123'});await until(()=>Auth.getSession()?.role==='manager'&&html().includes('Net collected · since last close'),'manager sign-in to Home');assert.doesNotMatch(html(),/Merchant balance|data-page="settlements"/);
   await click('go-team');for(const id of [shopId,secondShopId])assert.ok(html().includes(store.getState().shops.find(shop=>shop.id===id).name));assert.doesNotMatch(html(),/Role controls are simulated|Production access requires/);await click('go-home');
   const otherOwner=new Map();await external('/api/auth/login',{username,password},otherOwner);await external('/api/users/'+cashier.userId,{active:false},otherOwner);
   await Shared.refresh();await until(()=>!Auth.getSession()&&html().includes('Welcome back'),'suspended staff gate');
   assert.equal(Shared.getCache().state,null);assert.match(html(),/Welcome back/);
  });
 }finally{
  DB.close();Object.assign(globalThis,{fetch:original.fetch,setTimeout:original.setTimeout,setInterval:original.setInterval,clearInterval:original.clearInterval,FormData:original.FormData});
 }
});
