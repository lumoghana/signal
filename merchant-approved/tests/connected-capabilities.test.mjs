import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccess,securityPage} from '../dist/access.js';
import {createPeople} from '../dist/people.js';

class Storage{data=new Map();getItem(key){return this.data.get(key)??null}setItem(key,value){this.data.set(key,String(value))}removeItem(key){this.data.delete(key)}}
Object.assign(globalThis,{localStorage:new Storage(),sessionStorage:new Storage(),requestAnimationFrame:fn=>fn(),document:{querySelector(){return null}},window:{addEventListener(){},scrollTo(){}},BroadcastChannel:class{addEventListener(){}postMessage(){}close(){}}});
const Shared=await import('../dist/shared.js'),Auth=await import('../dist/account.js'),Store=await import('../dist/store.js');
const session={id:'test-session',userId:'test-owner',businessId:'test-business',username:'test.owner',name:'Test Owner',role:'owner',shopIds:[],expiresAt:new Date(Date.now()+3600000).toISOString()};
const snapshot=Store.getState();snapshot.business.id=session.businessId;
Shared.applyResponse({session,user:{id:session.userId},state:snapshot,users:[{id:'test-staff',name:'Test Staff',username:'test.staff',role:'manager',active:true,shopIds:[snapshot.shops[0].id]}],sessions:[],invitations:[],audit:[]},{authEpoch:Shared.getAuthEpoch(),unlockOnSuccess:true});

test('unsupported account maintenance preserves the real account identity and never calls authentication',async()=>{
 const previous=globalThis.fetch;let requests=0;globalThis.fetch=async()=>{requests++;throw Error('Must not submit an unavailable capability')};
 try{
  const epoch=Shared.getAuthEpoch(),before=JSON.stringify(Shared.getCache());
  for(const operation of [()=>Auth.changePassword({}),()=>Auth.beginRecovery('test.owner'),()=>Auth.completeRecovery({}),()=>Auth.recoverUsername({}),()=>Auth.requestUserReset('test-staff'),()=>Auth.transferOwner({})]){
   await assert.rejects(operation(),error=>error.code==='UNAVAILABLE_SERVICE'&&error.definitiveNoMutation===true);
   assert.equal(Shared.getAuthEpoch(),epoch);assert.equal(JSON.stringify(Shared.getCache()),before);assert.equal(Auth.getSession().id,session.id);assert.equal(Shared.isLocallyLocked(),false);
  }
  assert.equal(requests,0);
 }finally{globalThis.fetch=previous}
});

test('unavailable account UI explains the capability before collecting credentials or promising recovery',async()=>{
 const access=createAccess({auth:Auth,business:()=>snapshot.business,onRender(){}});
 for(const view of ['password','recovery','username-recovery']){
  access.show(view);const html=access.render();assert.match(html,/not available in the connected test/);assert.doesNotMatch(html,/name="(?:currentPassword|newPassword|recoveryKey|username|phone)"/);
  await access.handleSubmit({});assert.equal(Auth.getSession().id,session.id);
 }
 access.show('recovery-key',{recoveryKey:'Synthetic one-time key'});assert.doesNotMatch(access.render(),/It can recover your account/);assert.match(access.render(),/recovery is not available/);
 assert.match(securityPage({session,capabilities:Auth.getCapabilities()}),/Password changes are not available/);
 const people=createPeople({auth:Auth,getState:()=>snapshot,getSession:()=>session,onRender(){}});await people.handleClick('people-user',{dataset:{id:'test-staff'}});
 assert.doesNotMatch(people.render(),/data-action="people-reset-password"|data-action="people-ask-transfer"/);
 await people.handleClick('people-ask-transfer',{dataset:{id:'test-staff'}});assert.doesNotMatch(people.render(),/name="currentPassword"/);assert.equal(Auth.getSession().id,session.id);
});

test('a definitive capability rejection is not a network outage, while an unknown server failure is',async()=>{
 const previous=globalThis.fetch;let failure=false,code='UNAVAILABLE_SERVICE';
 globalThis.fetch=async()=>Response.json(failure?{ok:false,code,error:'Service unavailable'}:{ok:true},{status:failure?503:200});
 try{
  await Shared.api('/api/health');assert.equal(Shared.connectionStatus().status,'online');failure=true;
  await assert.rejects(Shared.api('/api/health'),error=>error.definitiveNoMutation===true);assert.equal(Shared.connectionStatus().status,'online');assert.equal(Auth.getSession().id,session.id);
  code='STORAGE_UNAVAILABLE';await assert.rejects(Shared.api('/api/health'));assert.equal(Shared.connectionStatus().status,'offline');
 }finally{globalThis.fetch=previous}
});
