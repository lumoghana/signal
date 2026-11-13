import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createD1} from '../scripts/d1-adapter.mjs';
import {handleAPI} from '../server/api.js';
import {createAccess} from '../dist/access.js';
class Storage{data=new Map();getItem(key){return this.data.get(key)??null}setItem(key,value){this.data.set(key,String(value))}removeItem(key){this.data.delete(key)}}
Object.assign(globalThis,{localStorage:new Storage(),sessionStorage:new Storage(),window:{addEventListener(){},scrollTo(){}},document:{querySelector(){return null}},requestAnimationFrame(fn){fn()},BroadcastChannel:class{addEventListener(){}postMessage(){}close(){}},FormData:class{constructor(form){this.entries=Object.entries(form.values||{})}*[Symbol.iterator](){yield* this.entries}}});
const DB=createD1();for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())await DB.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
const originalFetch=globalThis.fetch,jar=new Map(),calls=[];
async function rawFetch(path,options={}){
 const headers=new Headers(options.headers);headers.set('Origin','https://checkpoint.test');headers.set('X-Lumo-Request','1');headers.set('cf-connecting-ip','checkpoint-'+crypto.randomUUID());if(jar.size)headers.set('Cookie',[...jar].map(([key,value])=>key+'='+value).join('; '));
 const response=await handleAPI(new Request(new URL(path,'https://checkpoint.test'),{method:options.method||'GET',headers,...(options.body===undefined?{}:{body:options.body})}),{DB});
 for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],index=pair.indexOf('=');jar.set(pair.slice(0,index),pair.slice(index+1))}calls.push({path,status:response.status});return response;
}
globalThis.fetch=rawFetch;
let sequence=0;
async function browserReload(){
 const sharedURL=new URL('../dist/shared.js?checkpoint='+ ++sequence,import.meta.url).href,storeURL=new URL('../dist/store.js',import.meta.url).href;
 const source=readFileSync(new URL('../dist/account.js',import.meta.url),'utf8').replace("'./shared.js'",JSON.stringify(sharedURL)).replace("'./store.js'",JSON.stringify(storeURL));
 const shared=await import(sharedURL),auth=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source)+'#checkpoint='+sequence);return {shared,auth};
}
const form=values=>({values});
const registration={attemptId:'owner-checkpoint-signup',name:'Checkpoint Campus Counter',ownerName:'Checkpoint Owner',phone:'0245550180',businessType:'sole-trader',destination:'Sandbox Bank',verification:{phone:true,identity:true,face:true},shop:{name:'Night Counter',area:'Night Market',category:'Food & drinks',lat:5.6509,lng:-.1878},credentials:{username:'checkpoint.owner',password:'CheckpointOwner123'}};
function noSecrets(...secrets){for(const storage of [localStorage,sessionStorage])for(const value of storage.data.values())for(const secret of secrets)if(secret)assert.ok(!value.includes(secret),'Passwords and private keys must not be persisted')}
function access(auth){let controller;controller=createAccess({auth,onRender(){},onRecoveryKeySaved(){const current=auth.getSession();if(auth.getRecoveryKey())controller.show('recovery-key',{recoveryKey:auth.getRecoveryKey()});else if(auth.getRecoveryKeyNotice(current))controller.show('regenerate-key',{notice:auth.getRecoveryKeyNotice(current)})}});return controller}

test('owner key saving survives refresh, requires a generation-bound server acknowledgement and safely retries a lost acknowledgement',async()=>{
 try{
  const first=await browserReload(),created=await first.auth.signup(registration),originalKey=first.auth.getRecoveryKey();assert.ok(originalKey);assert.equal(created.session.recoveryKeyPending,true);assert.equal(first.auth.getRecoveryKeyReference(),created.recoveryKeyReference);noSecrets(registration.credentials.password,originalKey);
  const restored=await browserReload();await restored.shared.bootstrap();assert.equal(restored.auth.getSession().username,registration.credentials.username);assert.equal(restored.auth.getRecoveryKey(),'');assert.match(restored.auth.getRecoveryKeyNotice(),/still needs saving/);
  const ui=access(restored.auth);ui.show('regenerate-key',{notice:restored.auth.getRecoveryKeyNotice()});await ui.handleSubmit(form({currentPassword:registration.credentials.password}));assert.match(ui.render(),/YOUR RECOVERY KEY/);
  const replacement=restored.auth.getRecoveryKey(),reference=restored.auth.getRecoveryKeyReference();assert.ok(replacement);assert.notEqual(replacement,originalKey);assert.ok(reference);noSecrets(registration.credentials.password,originalKey,replacement);
  globalThis.fetch=async(path,options)=>{if(path==='/api/auth/recovery-key/ack')throw new TypeError('Offline before acknowledgement');return rawFetch(path,options)};
  await ui.handleSubmit(form({keySaved:'on'}));assert.equal(restored.auth.getRecoveryKey(),replacement);assert.equal(restored.auth.getSession().recoveryKeyPending,true);assert.match(ui.render(),/YOUR RECOVERY KEY/);assert.match(ui.render(),/Offline before acknowledgement/);
  let dropped=false;globalThis.fetch=async(path,options)=>{const response=await rawFetch(path,options);if(path==='/api/auth/recovery-key/ack'&&!dropped){dropped=true;throw new TypeError('Acknowledgement committed but response lost')}return response};
  await ui.handleSubmit(form({keySaved:'on'}));assert.equal(restored.auth.getRecoveryKey(),replacement);assert.match(ui.render(),/YOUR RECOVERY KEY/);
  globalThis.fetch=rawFetch;await ui.handleSubmit(form({keySaved:'on'}));assert.equal(restored.auth.getRecoveryKey(),'');assert.equal(restored.auth.getRecoveryKeyReference(),'');assert.equal(restored.auth.getSession().recoveryKeyPending,false);assert.equal(ui.isActive(),false);
  const after=await browserReload();await after.shared.bootstrap();assert.equal(after.auth.getSession().recoveryKeyPending,false);assert.equal(after.auth.getRecoveryKeyNotice(),'');assert.equal(after.auth.getRecoveryKey(),'');noSecrets(registration.credentials.password,originalKey,replacement);
 }finally{globalThis.fetch=rawFetch}
});

test('an older key view cannot acknowledge a newer replacement generated in another tab',async()=>{
 const tabA=await browserReload();await tabA.shared.bootstrap();const old=await tabA.auth.regenerateRecoveryKey({currentPassword:registration.credentials.password}),ui=access(tabA.auth);ui.show('recovery-key',{recoveryKey:old.recoveryKey});const frozen=tabA.auth.getRecoveryKeyReference();
 const tabB=await browserReload();await tabB.shared.bootstrap();const current=await tabB.auth.regenerateRecoveryKey({currentPassword:registration.credentials.password});assert.notEqual(current.recoveryKeyReference,frozen);
 await ui.handleSubmit(form({keySaved:'on'}));assert.match(ui.render(),/data-access-view="regenerate-key"/);assert.equal(tabA.auth.getRecoveryKey(),'');
 await tabB.shared.refresh();assert.equal(tabB.auth.getSession().recoveryKeyPending,true);assert.equal(tabB.auth.getSession().recoveryKeyReference,current.recoveryKeyReference);
 await tabB.auth.acknowledgeRecoveryKey();assert.equal(tabB.auth.getSession().recoveryKeyPending,false);noSecrets(old.recoveryKey,current.recoveryKey,registration.credentials.password);
});

test('late acknowledgement responses cannot dismiss a newer key checkpoint already observed in this tab',async()=>{
 const tabA=await browserReload();await tabA.shared.bootstrap();const old=await tabA.auth.regenerateRecoveryKey({currentPassword:registration.credentials.password}),ui=access(tabA.auth);ui.show('recovery-key',{recoveryKey:old.recoveryKey});let release,received;const committed=new Promise(resolve=>received=resolve);
 globalThis.fetch=async(path,options)=>{const response=await rawFetch(path,options);if(path==='/api/auth/recovery-key/ack'){received();return new Promise(resolve=>release=()=>resolve(response))}return response};
 const saving=ui.handleSubmit(form({keySaved:'on'}));await committed;
 const tabB=await browserReload();await tabB.shared.bootstrap();const current=await tabB.auth.regenerateRecoveryKey({currentPassword:registration.credentials.password});await tabA.shared.refresh();assert.equal(tabA.auth.getRecoveryKey(),'');assert.equal(tabA.auth.getSession().recoveryKeyReference,current.recoveryKeyReference);
 release();await saving;assert.equal(tabA.auth.getSession().recoveryKeyPending,true);assert.match(ui.render(),/data-access-view="regenerate-key"/);
 globalThis.fetch=rawFetch;await tabB.auth.acknowledgeRecoveryKey();noSecrets(old.recoveryKey,current.recoveryKey,registration.credentials.password);
});

test.after(()=>{globalThis.fetch=originalFetch;DB.close()});

test('a pending recovery checkpoint cannot be escaped through navigation, hiding or owner step-up',async()=>{
 const tab=await browserReload();await tab.shared.bootstrap();const replacement=await tab.auth.regenerateRecoveryKey({currentPassword:registration.credentials.password});assert.equal(tab.auth.getSession().recoveryKeyPending,true);
 // Simulate refresh: the pending checkpoint survives, while its raw key does not.
 const reloaded=await browserReload();await reloaded.shared.bootstrap();const ui=access(reloaded.auth);ui.show('regenerate-key',{notice:reloaded.auth.getRecoveryKeyNotice()});let html=ui.render();assert.ok(!html.includes('Back to business'));assert.ok(!html.includes('My account'));assert.match(html,/data-action="access-sign-out"/);
 for(const action of ['access-back','access-profile','access-demo','access-signup']){await ui.handleClick(action);assert.equal(ui.isActive(),true);assert.match(ui.render(),/data-access-view="regenerate-key"/);}
 ui.hide();assert.equal(ui.isActive(),true);ui.show('profile');assert.match(ui.render(),/data-access-view="regenerate-key"/);await assert.rejects(ui.requestStepUp({purpose:'settlement'}),/Save your private recovery key/);
 await ui.handleSubmit(form({currentPassword:registration.credentials.password}));assert.match(ui.render(),/YOUR RECOVERY KEY/);await ui.handleClick('access-back');assert.match(ui.render(),/YOUR RECOVERY KEY/);
 await ui.handleSubmit(form({keySaved:'on'}));assert.equal(reloaded.auth.getSession().recoveryKeyPending,false);assert.equal(ui.isActive(),false);noSecrets(replacement.recoveryKey,registration.credentials.password);
});
