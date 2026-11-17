import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAccess} from '../dist/access.js';
import {FACE_CONSENT_VERSION} from '../dist/password-recovery.js';

globalThis.requestAnimationFrame=fn=>fn();
globalThis.document={querySelector(){return null}};
globalThis.window={scrollTo(){}};
globalThis.FormData=class{constructor(form){this.values=Object.entries(form.values||{})}*[Symbol.iterator](){yield* this.values}};
const form=values=>({values});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const owner={id:'own-session',userId:'own-user',businessId:'business',role:'owner',username:'campus.owner',name:'Campus Owner',shopIds:['shop']};
const status={ok:true,simulation:true,environment:'sandbox',prototypeOnly:true,recoveryMode:'prototype-face-only',requiresBackupKey:false,backupKeyAvailable:false,smsAvailable:false,faceAvailable:true,faceMatching:'stored-template',faceSimulation:false,identityVerified:false,livenessVerified:false,livenessSimulation:true,livenessMode:'prototype-simulation',faceConsentVersion:FACE_CONSENT_VERSION,enrollment:{faceEnrolled:false,templateEnrolled:false}};
function fixture({reply=status,session=owner,...overrides}={}){
 let current=session;const requests=[],calls={keys:0,replaced:0,authenticated:0};
 const auth={isShared:true,getSession:()=>current,getRecoveryKey:()=>{calls.keys++;return 'obsolete-merchant-key';},getRecoveryKeyNotice:()=>current?'old pending notice':'',getInvitationRecoveryNotice:()=>'',getCapabilities:()=>({passwordRecoveryCentral:true}),passwordRecoveryRequest:async(...args)=>{requests.push(args);return reply;},verifyStepUp:async()=>({proof:'actual-password-proof'}),regenerateRecoveryKey:async()=>{calls.replaced++;return {recoveryKey:'new-old-key'};},...overrides};
 const access=createAccess({auth,onRender(){},onAuthenticated(){calls.authenticated++;},onBack(){},business:()=>({id:'business'})});
 return {access,auth,requests,calls,setSession:next=>{current=next;}};
}

test('central recovery never forces an obsolete merchant key checkpoint, including old pending accounts',async()=>{
 const f=fixture({session:{...owner,recoveryKeyPending:true}});
 assert.equal(f.access.enforceRecoveryCheckpoint(),false);
 f.access.show('recovery-settings');await tick();
 assert.match(f.access.render(),/Save face for recovery/);
 assert.doesNotMatch(f.access.render(),/YOUR RECOVERY KEY|savedRecoveryKey|REPLACE RECOVERY KEY/);
 assert.equal(f.requests[0][0],'status');assert.equal(f.requests[0][2].authenticated,true);
 assert.equal(f.calls.keys,0);
 f.access.hide();assert.equal(f.access.isActive(),false);
 const stepUp=f.access.requestStepUp({purpose:'refund'});await f.access.handleSubmit(form({currentPassword:'CurrentTest123'}));
 assert.equal((await stepUp).stepUpToken,'actual-password-proof');assert.equal(f.calls.replaced,0);
});

test('old merchant key routes open central settings and never fall back when its status is unavailable',async()=>{
 for(const target of ['recovery-key','regenerate-key']){
  const f=fixture({reply:{ok:false,message:'Recovery temporarily unavailable'}});
  f.access.show(target,{recoveryKey:'obsolete-secret'});await tick();
  const html=f.access.render();assert.match(html,/unavailable/i);assert.doesNotMatch(html,/obsolete-secret|savedRecoveryKey|Generate a new recovery key/);
  await f.access.handleSubmit(form({currentPassword:'CurrentTest123',keySaved:'on'}));
  assert.equal(f.calls.keys,0);assert.equal(f.calls.replaced,0);
 }
});

test('a new invited personal staff account is guided to its own optional face setup',async()=>{
 const staff={...owner,id:'staff-session',userId:'staff-user',username:'campus.cashier',role:'cashier'};
 const f=fixture({session:null,getInvitation:async()=>({name:'Campus Cashier',role:'cashier',shopIds:['shop'],status:'pending',expiresAt:new Date(Date.now()+60000).toISOString()}),acceptInvitation:async()=>{f.setSession(staff);return {session:staff};}});
 f.access.show('invite',{token:'valid-invite'});await tick();
 await f.access.handleSubmit(form({username:staff.username,newPassword:'CashierTest123',confirmPassword:'CashierTest123'}));await tick();
 assert.equal(f.calls.authenticated,1);assert.equal(f.requests[0][0],'status');assert.equal(f.requests[0][2].authenticated,true);
 assert.match(f.access.render(),/Save.*face|face profile|Face recovery/);assert.doesNotMatch(f.access.render(),/savedRecoveryKey|YOUR RECOVERY KEY/);
 await f.access.handleClick('access-central-back');assert.equal(f.access.isActive(),false);
});

test('connected account adapter does not expose a legacy key or preserve a completed invitation key checkpoint',async()=>{
 const url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
 const shared=url(`export let cleared=0;export const getCache=()=>({session:${JSON.stringify({...owner,recoveryKeyPending:true})}});export const getRecoveryKey=()=> 'obsolete-key';export const getRecoveryKeyReference=()=> 'old-reference';export function clearRecoveryKey(){cleared++}`);
 const connected=url('export const MERCHANT_CAPABILITIES={};export function accessRecovery(){}');
 const store=url('export function getState(){return {}};export function getWorkspaceMode(){return "registered"}');
 let source=await readFile(new URL('../dist/account.js',import.meta.url),'utf8');
 source=source.replace("'./shared.js'",JSON.stringify(shared)).replace("'./connected-service.js'",JSON.stringify(connected)).replace("'./store.js'",JSON.stringify(store));
 const auth=await import(url(source));
 assert.equal(auth.getRecoveryKey(),'');assert.equal(auth.getRecoveryKeyReference(),'');assert.equal(auth.getRecoveryKeyNotice({...owner,recoveryKeyPending:true}),'');
 assert.equal((await import(shared)).cleared,1);
});
