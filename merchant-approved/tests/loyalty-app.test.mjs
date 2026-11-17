import './legacy-d1-transport.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {createD1} from '../scripts/d1-adapter.mjs';
import {handleAPI} from '../server/api.js';

// Loyalty app wiring against the retained server API with an explicit test transport.
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
let loseCollectionResponse=false;
function jarClient(jar=cookies){
 return async function call(path,{method='GET',headers={},body}={}){
  const requestHeaders=new Headers(headers);requestHeaders.set('Origin','https://merchant.example.test');requestHeaders.set('cf-connecting-ip','loyalty-app-harness');
  if(jar.size)requestHeaders.set('Cookie',[...jar].map(([k,v])=>k+'='+v).join('; '));
  const response=await handleAPI(new Request(new URL(path,'https://merchant.example.test'),{method,headers:requestHeaders,...(body===undefined?{}:{body})}),env);
  for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1))}
  const input=typeof body==='string'?JSON.parse(body):body;calls.push({path,method,status:response.status,input});
  if(loseCollectionResponse&&path==='/api/loyalty'&&input?.operation==='prepareCollection'){loseCollectionResponse=false;throw new Error('Loyalty response lost after storage');}
  return response;
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
async function until(predicate,label){for(let i=0;i<500;i++){if(predicate())return;await new Promise(resolve=>original.setTimeout(resolve,5))}throw Error('Timed out: '+label+'; page: '+html().replace(/<[^>]+>/g,' ').slice(-3500)+'; modal: '+modal().replace(/<[^>]+>/g,' ').slice(-500))}
async function click(action,dataset={}){const element={...new Element(),tagName:'BUTTON',dataset:{action,...dataset},disabled:false,focus(){},closest(selector){return selector==='[data-action]'?this:null}};await Promise.all((listeners.get('click')||[]).map(fn=>fn({target:element,preventDefault(){}})));await new Promise(resolve=>setImmediate(resolve))}
async function submit(values,type='access',dataset={}){const entries=Object.entries(values).flatMap(([key,value])=>Array.isArray(value)?value.map(v=>[key,v]):[[key,value]]);const form={dataset:{form:type,...dataset},values:entries,elements:Object.fromEntries(entries.map(([key,value])=>[key,{value,checked:value==='on'}])),querySelectorAll(){return []},reset(){}};await Promise.all((listeners.get('submit')||[]).map(fn=>fn({target:form,preventDefault(){},submitter:{value:'save'}})));await new Promise(resolve=>setImmediate(resolve))}
async function change(name,value,dataset={}){const element={...new Element(),name,value,dataset,closest(){return null}};await Promise.all((listeners.get('change')||[]).map(fn=>fn({target:element})));await new Promise(resolve=>setImmediate(resolve))}
async function external(path,body,jar){const result=await jarClient(jar)(path,{method:'POST',headers:{'Content-Type':'application/json','X-Lumo-Request':'1'},body:JSON.stringify(body)});assert.ok(result.ok,await result.clone().text());return result.json()}

async function read(path,jar){const result=await jarClient(jar)(path);assert.ok(result.ok,await result.clone().text());return result.json();}
let store,Auth,Shared;

test('merchant loyalty is wired through the actual app, API, collection QR and locked counter boundary',async t=>{
 const ownerJar=new Map(),customerJar=new Map(),staffJar=new Map();
 const registration={attemptId:'loyalty-app-business',name:'Loyalty Campus Kitchen',ownerName:'Loyalty Owner',phone:'0245550255',businessType:'sole-trader',destination:'Sandbox bank',verification:{phone:true,identity:true,face:true},shop:{name:'Loyalty Night Market',area:'Night Market',category:'Food & drinks',lat:5.65,lng:-.18},credentials:{username:'loyalty.app.owner',password:'LoyaltyOwner12345'}};
 let shop,member,counterId,cashierUser;
 try{
  const account=await external('/api/signup',registration,ownerJar);shop=account.state.shops[0];
  await external('/api/auth/recovery-key/ack',{reference:account.session.recoveryKeyReference},ownerJar);
  const invitation=await external('/api/invitations',{name:'Loyalty Cashier',phone:'0555550266',role:'cashier',shopIds:[shop.id]},ownerJar);
  const accepted=await external('/api/invitations/accept',{token:invitation.invitation.token,username:'loyalty.app.cashier',password:'LoyaltyCashier12345'},staffJar);cashierUser=accepted.user;
  await external('/api/student/open',{name:'Loyalty Test Buyer'},customerJar);
  await external('/api/student/fund',{amount:30000,confirmSandbox:true,attemptId:'loyalty-app-funding'},customerJar);
  await import('../dist/app.js');store=await import('../dist/store.js');Auth=await import('../dist/account.js');Shared=await import('../dist/shared.js');

  await t.test('owner opens loyalty, publishes programme rules and enrolls a consenting member',async()=>{
   await click('signup-login');await submit({username:registration.credentials.username,password:registration.credentials.password});
   await until(()=>Auth.getSession()?.role==='owner'&&html().includes('Net collected'),'owner login');
   await click('nav',{page:'administration'});assert.match(html(),/Customers &amp; loyalty|Customers & loyalty/);
   await click('nav',{page:'loyalty'});await until(()=>html().includes('loyalty-workspace')&&!html().includes('Opening loyalty'),'new loyalty area');await click('loyalty-tab',{value:'programme'});await until(()=>html().includes('Create a programme'),'programme setup entry');
   await click('loyalty-create');await submit({name:'Kitchen Regulars',colour:'#d6f675'},'loyalty',{loyaltyForm:'programme'});
   await submit({earning:'visits',minimumSpend:'20.00',target:'2',rewardType:'discount',rewardName:'Five cedis off',rewardValue:'5.00',rewardMinimumSpend:'20.00',expiryDays:'30'},'loyalty',{loyaltyForm:'programme'});
   await submit({programmeShopIds:[shop.id],budgetLimit:'100.00'},'loyalty',{loyaltyForm:'programme'});
   assert.match(html(),/Ready for your regulars/);await submit({},'loyalty',{loyaltyForm:'programme'});
   await until(()=>html().includes('Kitchen Regulars')&&!html().includes('Publish programme'),'programme published');
   await click('loyalty-tab',{value:'members'});await click('loyalty-enroll');
   await submit({memberName:'Ama Loyalty',memberPhone:'0245550277',memberShop:shop.id,membershipConsent:'on'},'loyalty',{loyaltyForm:'enroll'});
   await until(()=>html().includes('Ama Loyalty'),'member created');
   const result=await read('/api/loyalty?shopId='+shop.id,ownerJar);member=result.loyalty.members.find(value=>value.name==='Ama Loyalty');
   assert.ok(member?.id);assert.ok(member.code);assert.equal(member.marketingConsent,false);
  });

  await t.test('owner member collection creates the original fixed request and confirmed payments build the right reward',async()=>{
   for(let index=0;index<2;index++){
    await click('nav',{page:'checkout'});await click('loyalty-open');await until(()=>html().includes('Find a member'),'loyalty from collect');
    await submit({memberCode:member.code},'loyalty',{loyaltyForm:'lookup'});await until(()=>html().includes('Ama Loyalty')&&html().includes('Prepare collection'),'member collection form');
    await submit({actionShop:shop.id,grossAmount:'25.00',collectionNote:'Member lunch'},'loyalty',{loyaltyForm:'collect'});
    await until(()=>modal().includes('Member lunch')&&store.getState().requests.length===index+1,'owner QR returned from loyalty');
    const request=store.getState().requests[0];assert.equal(request.amount,2500);
    const posted=calls.filter(c=>c.path==='/api/loyalty'&&c.input?.operation==='prepareCollection').at(-1);assert.equal(posted.input.payload.grossAmount,2500);assert.equal(posted.input.payload.memberId,member.id);
    await external('/api/payments',{shopId:shop.id,testKey:shop.testAcceptanceToken,requestId:request.id,amount:request.amount,attemptId:'loyalty-owner-payment-'+index},customerJar);
    await Shared.refresh();await click('dismiss');
   }
   const details=(await read('/api/loyalty?shopId='+shop.id+'&memberId='+member.id,ownerJar)).loyalty.member;
   assert.equal(details.rewards.filter(value=>value.state==='available').length,1);assert.equal(details.progress,0);
  });

  await t.test('owner cannot create a second ordinary request while its loyalty collection outcome is unknown',async()=>{
   await click('nav',{page:'checkout'});await click('key',{value:'2'});await click('key',{value:'5'});await click('loyalty-open');
   await until(()=>html().includes('Find a member'),'owner unknown collection entry');
   await submit({memberCode:member.code},'loyalty',{loyaltyForm:'lookup'});await until(()=>html().includes('Prepare collection'),'owner unknown member');
   loseCollectionResponse=true;await submit({actionShop:shop.id,grossAmount:'25.00',collectionNote:'Uncertain owner lunch'},'loyalty',{loyaltyForm:'collect'});
   await until(()=>html().includes('A saved request needs an outcome'),'owner original reference retained');
   await click('loyalty-back');await Shared.refresh();await until(()=>html().includes('Generate payment QR'),'owner returns from unknown request');
   const links=calls.filter(c=>c.path==='/api/payment-links'&&c.method==='POST').length,shareAttempts=[...sessionStorage.data.keys()].filter(key=>key.startsWith('lumo-merchant-share-attempt-v1:'));
   await click('share-payment-link',{id:shop.id,amount:'draft'});await until(()=>html().includes('Find a member')&&html().includes('A saved request needs an outcome'),'owner sharing returns to original request');
   assert.equal(calls.filter(c=>c.path==='/api/payment-links'&&c.method==='POST').length,links);assert.deepEqual([...sessionStorage.data.keys()].filter(key=>key.startsWith('lumo-merchant-share-attempt-v1:')),shareAttempts);assert.equal(modal(),'');
   await click('loyalty-back');await until(()=>html().includes('Generate payment QR'),'owner returns after sharing guard');
   const before=calls.filter(c=>c.path==='/api/action'&&c.input?.type==='CREATE_REQUEST').length;
   await click('create-charge');await until(()=>html().includes('Find a member')&&html().includes('A saved request needs an outcome'),'owner guard reopens original loyalty request');
   assert.equal(calls.filter(c=>c.path==='/api/action'&&c.input?.type==='CREATE_REQUEST').length,before);
   await click('loyalty-retry');await until(()=>modal().includes('Uncertain owner lunch'),'owner retrieves exact saved request');
   const requests=(await read('/api/session',ownerJar)).state.requests.filter(value=>value.description?.includes('Uncertain owner lunch'));
   assert.equal(requests.length,1);await click('dismiss');
  });

  await t.test('an unlocked paired cashier looks up only the member, uses the server discount and returns to its exact QR',async()=>{
   await click('go-counter-setup');await until(()=>html().includes('Ready for the shop floor')&&html().includes('Loyalty Cashier'),'counter roster');
   await submit({userId:cashierUser.id,pin:'369258',confirmation:'369258'},'counter-pin');
   await submit({counterShop:shop.id,label:'Loyalty counter',counterMode:'shared',approved:'on'},'counter-setup');
   await until(()=>html().includes('Who’s collecting'),'counter locked');counterId=Shared.getCache().counter.id;
   await submit({userId:cashierUser.id,pin:'369258'},'cashier',{cashierForm:'unlock'});await until(()=>!Shared.getCache().counter.locked&&html().includes('Customer loyalty'),'cashier unlocked');
   await click('cashier-key',{value:'2'});await click('cashier-key',{value:'5'});await click('cashier-loyalty');await until(()=>html().includes('Find a member'),'cashier loyalty area');
   assert.doesNotMatch(html(),/Your member register|Publish programme|Funding limit/);
   await submit({memberCode:member.code},'loyalty',{loyaltyForm:'lookup'});await until(()=>html().includes('Ama Loyalty')&&html().includes('Five cedis off'),'cashier finds member');
   assert.doesNotMatch(html(),/0245550277/);
   const ownerDetails=(await read('/api/loyalty?shopId='+shop.id+'&memberId='+member.id,ownerJar)).loyalty.member;
   const reward=ownerDetails.rewards.find(value=>value.state==='available');
   await submit({actionShop:shop.id,grossAmount:'25.00',rewardId:reward.id,collectionNote:'Reward lunch'},'loyalty',{loyaltyForm:'collect'});
   await until(()=>html().includes('Ready to scan')&&html().includes('Reward lunch'),'cashier exact loyalty QR');
   const request=store.getState().requests[0];assert.equal(request.amount,2000);assert.equal(request.counterId,counterId);assert.equal(request.staffId,'access-'+cashierUser.id);
   await external('/api/payments',{shopId:shop.id,testKey:shop.testAcceptanceToken,requestId:request.id,amount:2000,attemptId:'loyalty-cashier-discount'},customerJar);await Shared.refresh();
   await until(()=>html().includes('Payment received'),'discounted payment confirmed');
   const detail=(await read('/api/loyalty?shopId='+shop.id+'&memberId='+member.id,ownerJar)).loyalty.member;
   assert.equal(detail.rewards.find(value=>value.id===reward.id).state,'redeemed');
   await click('cashier-next');await click('cashier-loyalty');await until(()=>html().includes('Find a member'),'cashier reopens loyalty');await click('loyalty-back');assert.match(html(),/Collect payment/);assert.doesNotMatch(html(),/loyalty-workspace/);
  });

  await t.test('locking while a member is open immediately clears the member from the counter view',async()=>{
   await click('cashier-next');await click('cashier-loyalty');await until(()=>html().includes('Find a member'),'loyalty before lock');
   await submit({memberCode:member.code},'loyalty',{loyaltyForm:'lookup'});await until(()=>html().includes('Ama Loyalty'),'member visible before lock');
   await external('/api/counter/lock',{endShift:false},cookies);await Shared.refresh();await until(()=>html().includes('Who’s collecting'),'counter lock hides loyalty');
   assert.doesNotMatch(html(),/Ama Loyalty|0245550277|loyalty-workspace|Your member register/);
   await click('loyalty-member',{id:member.id});assert.doesNotMatch(html(),/Ama Loyalty|loyalty-workspace/);
   await submit({userId:cashierUser.id,pin:'369258'},'cashier',{cashierForm:'unlock'});await until(()=>!Shared.getCache().counter.locked&&html().includes('Collect payment'),'unlock after loyalty privacy check');
  });

  await t.test('unknown loyalty collection blocks an ordinary second request and remains recoverable',async()=>{
   await click('cashier-key',{value:'2'});await click('cashier-key',{value:'5'});await click('cashier-loyalty');await until(()=>html().includes('Find a member'),'unknown collection entry');
   await submit({memberCode:member.code},'loyalty',{loyaltyForm:'lookup'});await until(()=>html().includes('Prepare collection'),'unknown collection member');
   loseCollectionResponse=true;await submit({actionShop:shop.id,grossAmount:'25.00',collectionNote:'Uncertain lunch'},'loyalty',{loyaltyForm:'collect'});
   await until(()=>html().includes('A saved request needs an outcome'),'loyalty original request retained');
   await click('loyalty-back');await Shared.refresh();await until(()=>html().includes('Collect payment'),'return from uncertain request');
   const links=calls.filter(c=>c.path==='/api/payment-links'&&c.method==='POST').length,shareAttempts=[...sessionStorage.data.keys()].filter(key=>key.startsWith('lumo-merchant-share-attempt-v1:'));
   await click('cashier-share-amount');await until(()=>html().includes('Find a member')&&html().includes('A saved request needs an outcome'),'cashier sharing returns to original request');
   assert.equal(calls.filter(c=>c.path==='/api/payment-links'&&c.method==='POST').length,links);assert.deepEqual([...sessionStorage.data.keys()].filter(key=>key.startsWith('lumo-merchant-share-attempt-v1:')),shareAttempts);assert.equal(modal(),'');
   await click('loyalty-back');await until(()=>html().includes('Collect payment'),'cashier returns after sharing guard');
   const before=calls.filter(c=>c.path==='/api/action'&&c.input?.type==='CREATE_REQUEST').length;
   await click('cashier-create');
   assert.equal(calls.filter(c=>c.path==='/api/action'&&c.input?.type==='CREATE_REQUEST').length,before);
   await click('cashier-loyalty');await until(()=>html().includes('Find a member')&&html().includes('A saved request needs an outcome'),'return to saved loyalty request');
   const prepared=calls.filter(c=>c.path==='/api/loyalty'&&c.input?.operation==='prepareCollection').length;
   await click('loyalty-refresh');await until(()=>html().includes('Ready to scan')&&html().includes('Uncertain lunch'),'saved receipt resolves into original QR');
   assert.equal(calls.filter(c=>c.path==='/api/loyalty'&&c.input?.operation==='prepareCollection').length,prepared);
   const requests=(await read('/api/session',ownerJar)).state.requests.filter(value=>value.description?.includes('Uncertain lunch'));
   assert.equal(requests.length,1);
  });

 }finally{DB.close();Object.assign(globalThis,{fetch:original.fetch,setTimeout:original.setTimeout,setInterval:original.setInterval,clearInterval:original.clearInterval,FormData:original.FormData});}
});
