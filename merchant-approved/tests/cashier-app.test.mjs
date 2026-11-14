import './legacy-d1-transport.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {createD1} from '../scripts/d1-adapter.mjs';
import {handleAPI} from '../server/api.js';

// App wiring against the retained server API with an explicit test transport.
// Supabase counter-capability and shared-auth enforcement are covered separately.
// Every click and submit below runs the shipped app event handlers.
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
async function submit(values,type='access',dataset={}){const entries=Object.entries(values).flatMap(([key,value])=>Array.isArray(value)?value.map(v=>[key,v]):[[key,value]]);const form={dataset:{form:type,...dataset},values:entries,elements:Object.fromEntries(entries.map(([key,value])=>[key,{value,checked:value==='on'}])),querySelectorAll(){return []},reset(){}};await Promise.all((listeners.get('submit')||[]).map(fn=>fn({target:form,preventDefault(){},submitter:{value:'save'}})));await new Promise(resolve=>setImmediate(resolve))}
async function change(name,value,dataset={}){const element={...new Element(),name,value,dataset,closest(){return null}};await Promise.all((listeners.get('change')||[]).map(fn=>fn({target:element})));await new Promise(resolve=>setImmediate(resolve))}
async function external(path,body,jar){const result=await jarClient(jar)(path,{method:'POST',headers:{'Content-Type':'application/json','X-Lumo-Request':'1'},body:JSON.stringify(body)});assert.ok(result.ok,await result.clone().text());return result.json()}


let store,Auth,Shared;

test('cashier app wiring preserves shared counter authority, handover and exact receipt confirmation', async t => {
 const ownerJar=new Map(),customerJar=new Map(),staff=[];
 const registration={attemptId:'cashier-app-business',name:'Counter Campus Kitchen',ownerName:'Counter Owner',phone:'0245550155',businessType:'sole-trader',destination:'Sandbox bank',verification:{phone:true,identity:true,face:true},shop:{name:'Night Market Till',area:'Night Market',category:'Food & drinks',lat:5.65,lng:-.18},credentials:{username:'counter.app.owner',password:'CounterOwner12345'}};
 let shop,requestA,requestB,counterId,shiftA;
 try {
  const account=await external('/api/signup',registration,ownerJar);shop=account.state.shops[0];
  await external('/api/auth/recovery-key/ack',{reference:account.session.recoveryKeyReference},ownerJar);
  for(const [index,name,pin] of [[0,'Ama','147258'],[1,'Kojo','258369']]){
   const invitation=await external('/api/invitations',{name,phone:'055555016'+index,role:'cashier',shopIds:[shop.id]},ownerJar);
   const jar=new Map(),accepted=await external('/api/invitations/accept',{token:invitation.invitation.token,username:'counter.app.staff'+index,password:'CounterCashier12345'},jar);
   staff.push({...accepted.user,pin});
  }
  await import('../dist/app.js');store=await import('../dist/store.js');Auth=await import('../dist/account.js');Shared=await import('../dist/shared.js');

  await t.test('owner sets individual PINs and converts this phone to a locked cashier-only counter', async()=>{
   await click('signup-login');await submit({username:registration.credentials.username,password:registration.credentials.password});
   await until(()=>Auth.getSession()?.role==='owner'&&html().includes('Net collected'),'owner opens business');
   await click('go-counter-setup');await until(()=>html().includes('Ready for the shop floor')&&html().includes('Kojo'),'counter setup roster');
   for(const person of staff)await submit({userId:person.id,pin:person.pin,confirmation:person.pin},'counter-pin');
   await submit({counterShop:shop.id,label:'Shared front counter',counterMode:'shared',approved:'on'},'counter-setup');
   await until(()=>html().includes('Who’s collecting'),'locked counter after setup');
   counterId=Shared.getCache().counter.id;
   assert.equal(Auth.getSession().role,'cashier');assert.equal(store.getWorkspaceMode(),'registered');
   assert.equal(Shared.getCache().counter.locked,true);assert.deepEqual(store.getState().transactions,[]);
   assert.doesNotMatch(html(),/Merchant balance|Administration|data-page="reports"|data-page="team"|Explore sample roles/);
   await Shared.refresh();assert.equal(store.getWorkspaceMode(),'registered');assert.match(html(),/Who’s collecting/);
  });

  await t.test('PIN unlock creates the correct shift and an amount request uses that cashier and counter',async()=>{
   await submit({userId:staff[0].id,pin:staff[0].pin},'cashier',{cashierForm:'unlock'});
   await until(()=>Shared.getCache().counter?.locked===false&&html().includes('Collect payment'),'Ama unlock');
   assert.equal(Shared.getCache().counter.staffName,'Ama');assert.equal(store.getWorkspaceMode(),'registered');
   await click('cashier-key',{value:'2'});await click('cashier-key',{value:'5'});await click('cashier-create');
   await until(()=>store.getState().requests.length===1&&html().includes('Waiting for payment'),'Ama request QR');
   requestA=store.getState().requests[0];shiftA=requestA.shiftId;
   assert.equal(requestA.amount,2500);assert.equal(requestA.counterId,counterId);assert.equal(requestA.staffId,'access-'+staff[0].id);assert.ok(shiftA);
   assert.doesNotMatch(html(),/Payment received/);
  });

  await t.test('handover keeps the original pending request and starts the next cashier’s own shift',async()=>{
   await click('cashier-menu');await click('cashier-handover');
   await submit({note:'Ama’s customer is still paying.'},'cashier',{cashierForm:'handover'});
   await until(()=>html().includes('Who’s collecting'),'handover locks counter');
   assert.deepEqual(store.getState().requests,[]);assert.equal(store.getWorkspaceMode(),'registered');
   await submit({userId:staff[1].id,pin:staff[1].pin},'cashier',{cashierForm:'unlock'});
   await until(()=>Shared.getCache().counter?.staffName==='Kojo'&&!Shared.getCache().counter.locked,'Kojo unlock');
   assert.equal(store.getState().requests.find(value=>value.id===requestA.id).staffId,requestA.staffId);
   assert.ok(store.getState().shifts.some(value=>value.id===shiftA&&value.status==='closed'));
   await click('cashier-key',{value:'2'});await click('cashier-key',{value:'5'});await click('cashier-create');
   await until(()=>store.getState().requests.length===2,'Kojo request QR');
   requestB=store.getState().requests.find(value=>value.id!==requestA.id);
   assert.equal(requestB.staffId,'access-'+staff[1].id);assert.notEqual(requestB.shiftId,shiftA);
   assert.match(html(),/Waiting for payment/);
  });

  await t.test('shop QR and late prior-cashier payments cannot complete the current customer request',async()=>{
   await external('/api/student/open',{name:'Counter Test Customer'},customerJar);
   await external('/api/student/fund',{amount:10000,confirmSandbox:true,attemptId:'counter-app-funding'},customerJar);
   await external('/api/payments',{shopId:shop.id,testKey:shop.testAcceptanceToken,amount:2500,attemptId:'counter-app-static'},customerJar);
   await Shared.refresh();assert.match(html(),/Waiting for payment/);assert.doesNotMatch(html(),/Payment received/);
   assert.equal(store.getState().transactions.length,0);assert.equal(store.getState().shopQRReceipts.length,1);
   await external('/api/payments',{shopId:shop.id,testKey:shop.testAcceptanceToken,requestId:requestA.id,amount:2500,attemptId:'counter-app-ama-late'},customerJar);
   await Shared.refresh();assert.match(html(),/Waiting for payment/);assert.doesNotMatch(html(),/Payment received/);
   const receipt=store.getState().transactions.find(value=>value.requestId===requestA.id);
   assert.equal(receipt.staffId,requestA.staffId);assert.equal(receipt.shiftId,shiftA);assert.equal(receipt.counterId,counterId);
   assert.equal(store.getState().requests.find(value=>value.id===requestB.id).status,'open');
   await click('cashier-tab',{page:'receipts'});assert.match(html(),/Ama/);
   await click('cashier-receipt',{id:receipt.id});assert.match(html(),new RegExp(receipt.reference));assert.match(html(),/Ama/);
   await click('cashier-refund');await submit({amount:'5.00',reason:'Wrong item'},'cashier',{cashierForm:'refund'});
   assert.equal(store.getState().refunds.find(value=>value.transactionId===receipt.id).status,'requested');
   const owner=(await (await jarClient(ownerJar)('/api/session')).json());assert.equal(owner.metrics.balance,5000);assert.equal(owner.state.closings.length,0);
   await click('cashier-close');await click('cashier-tab',{page:'collect'});
  });

  await t.test('only the matching confirmed receipt completes the request and duplicate refreshes do not replay sound',async()=>{
   await click('cashier-sound');await click('device-test');await until(()=>Shared.getCache().devices.some(value=>value.soundReady),'cashier sound ready');await click('dismiss');
   await click('cashier-request',{id:requestB.id});assert.match(html(),/Waiting for payment/);
   const before=speech.spoken.length;
   await external('/api/payments',{shopId:shop.id,testKey:shop.testAcceptanceToken,requestId:requestB.id,amount:2500,attemptId:'counter-app-kojo-paid'},customerJar);
   await Shared.refresh();await until(()=>html().includes('Payment received'),'Kojo confirmation');
   const receipt=store.getState().transactions.find(value=>value.requestId===requestB.id);assert.match(html(),new RegExp(receipt.reference));assert.match(html(),/Next customer/);
   assert.equal(speech.spoken.length,before+1);await Shared.refresh();await Shared.refresh();assert.equal(speech.spoken.length,before+1);
   await click('cashier-next');assert.match(html(),/Collect payment/);assert.doesNotMatch(html(),/Payment received/);
  });

  await t.test('offline screen lock hides receipts immediately and stays locked through reconnect and refresh',async()=>{
   navigator.onLine=false;await click('cashier-menu');await click('cashier-lock');
   assert.match(html(),/Who’s collecting/);assert.doesNotMatch(html(),/Confirmed by Lumo|Counter Test Customer/);
   const marker=localStorage.getItem('lumo-counter-screen-lock-v1');assert.ok(marker);assert.doesNotMatch(marker,/147258|258369|Counter Test Customer/);
   navigator.onLine=true;await Shared.refresh();assert.match(html(),/Who’s collecting/);
   const before=calls.length;await submit({userId:staff[1].id,pin:staff[1].pin},'cashier',{cashierForm:'unlock'});
   await until(()=>html().includes('Collect payment')&&!html().includes('Who’s collecting'),'unlock after reconnect');
   const paths=calls.slice(before).map(value=>value.path);assert.ok(paths.indexOf('/api/counter/lock')<paths.indexOf('/api/counter/unlock'));
   assert.equal(localStorage.getItem('lumo-counter-screen-lock-v1'),null);
  });

  await t.test('owner revocation removes the live counter and every protected receipt',async()=>{
   await external('/api/counter/revoke',{counterId},ownerJar);await Shared.refresh();
   await until(()=>!Auth.getSession()&&html().includes('Welcome back'),'counter revoked');
   assert.equal(Shared.getCache().counter,null);assert.equal(Shared.getCache().state,null);
   assert.doesNotMatch(html(),/Counter Test Customer|Payment received|cashier-nav/);
  });
 } finally {
  DB.close();Object.assign(globalThis,{fetch:original.fetch,setTimeout:original.setTimeout,setInterval:original.setInterval,clearInterval:original.clearInterval,FormData:original.FormData});
 }
});
