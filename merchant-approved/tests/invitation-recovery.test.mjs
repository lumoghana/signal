import './legacy-d1-transport.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createD1} from '../scripts/d1-adapter.mjs';
import {handleAPI} from '../server/api.js';
import {createAccess} from '../dist/access.js';

class Storage{constructor(){this.data=new Map()}getItem(key){return this.data.get(key)??null}setItem(key,value){this.data.set(key,String(value))}removeItem(key){this.data.delete(key)}}
Object.assign(globalThis,{localStorage:new Storage(),sessionStorage:new Storage(),window:{addEventListener(){},scrollTo(){}},document:{querySelector(){return null}},requestAnimationFrame(fn){fn()},BroadcastChannel:class{addEventListener(){}postMessage(){}close(){}},FormData:class{constructor(form){this.entries=Object.entries(form.values||{})}*[Symbol.iterator](){yield* this.entries}}});
const Shared=await import('../dist/shared.js');
const Auth=await import('../dist/account.js');
const originalFetch=globalThis.fetch;
const DB=createD1();for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(file=>file.endsWith('.sql')).sort())await DB.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
const env={DB},calls=[];
function client(){
 const jar=new Map();
 return async(path,options={})=>{
  const headers=new Headers(options.headers);headers.set('Origin','https://invitation.test');headers.set('X-Lumo-Request','1');headers.set('cf-connecting-ip','invitation-recovery-'+crypto.randomUUID());
  if(jar.size)headers.set('Cookie',[...jar].map(([key,value])=>key+'='+value).join('; '));
  let body=options.body;if(body!==undefined&&typeof body!=='string'){headers.set('Content-Type','application/json');body=JSON.stringify(body)}
  const response=await handleAPI(new Request(new URL(path,'https://invitation.test'),{method:options.method||'GET',headers,...(body===undefined?{}:{body})}),env);
  for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],index=pair.indexOf('=');jar.set(pair.slice(0,index),pair.slice(index+1))}
  calls.push({path,status:response.status});return response;
 };
}
async function request(client,path,body){const response=await client(path,{method:body===undefined?'GET':'POST',body});const result=await response.json();assert.ok(response.ok,result.error||'API request failed');return result}
const owner=client(),staff=client();
const form=values=>({values});
async function until(predicate){for(let count=0;count<100;count++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5))}assert.fail('Invitation view did not settle')}
const registration={attemptId:'invitation-recovery-owner',name:'Invitation Recovery Kitchen',ownerName:'Recovery Owner',phone:'0245550199',businessType:'sole-trader',destination:'Sandbox Bank',verification:{phone:true,identity:true,face:true},shop:{name:'Recovery Counter',area:'Night Market',category:'Food & drinks',lat:5.6509,lng:-.1878},credentials:{username:'invite.recovery.owner',password:'OwnerRecovery123'}};
function controller(){return createAccess({auth:Auth,onRender(){},onAuthenticated(){},onRecoveryKeySaved(){},business:()=>Shared.getCache().state?.business||{}})}
function noStoredSecrets(password,key){for(const storage of [localStorage,sessionStorage])for(const value of storage.data.values()){assert.ok(!value.includes(password),'Password must not be persisted');if(key)assert.ok(!value.includes(key),'Private key must not be persisted')}}

test('a committed lost invitation response survives reload, replays one account and replaces the unavailable key explicitly',async t=>{
 try{
  const registered=await request(owner,'/api/signup',registration),shopId=registered.state.shops[0].id;
  const invite=await request(owner,'/api/invitations',{name:'Recovery Cashier',phone:'0555550190',role:'cashier',shopIds:[shopId]});
  const token=invite.invitation.token,password='OriginalStaff123',username='invitation.cashier';let interrupted=false,firstKey='';
  globalThis.fetch=async(path,options)=>{const response=await staff(path,options);if(path==='/api/invitations/accept'&&!interrupted){interrupted=true;firstKey=(await response.clone().json()).recoveryKey;throw new DOMException('Response timed out after the account was created','TimeoutError')}return response};
  const first=controller();first.show('invite',{token});await until(()=>first.render().includes('Accept invitation &amp; sign in')||first.render().includes('Accept invitation & sign in'));
  await first.handleSubmit(form({username,newPassword:password,confirmPassword:password}));
  assert.match(first.render(),/Original password/);assert.match(first.render(),/Your account may already exist/);assert.doesNotMatch(first.render(),/expired or been revoked/);assert.equal(Auth.getPendingInvitation().username,username);assert.equal(Auth.getSession(),null);assert.equal(Auth.getRecoveryKey(),'');noStoredSecrets(password,firstKey);
  let remote=await request(owner,'/api/session');assert.equal(remote.users.filter(user=>user.username===username).length,1);
  const other=await request(owner,'/api/invitations',{name:'Different Staff',phone:'0555550191',role:'cashier',shopIds:[shopId]});
  const reloaded=controller();reloaded.show('invite',{token:other.invitation.token});assert.match(reloaded.render(),/Finish your first/);
  await reloaded.handleClick('access-resume-invitation',{});await until(()=>reloaded.render().includes('Original password'));assert.match(reloaded.render(),/value="invitation.cashier"[^>]+readonly/);
  await reloaded.handleSubmit(form({username,password:'IncorrectStaff123'}));assert.match(reloaded.render(),/original account details or sign in/);assert.equal(Auth.getPendingInvitation().username,username);assert.equal(Auth.getSession(),null);
  await reloaded.handleSubmit(form({username,password}));
  assert.equal(Auth.getSession().username,username);assert.match(reloaded.render(),/data-access-view="regenerate-key"/);assert.equal(Auth.getRecoveryKey(),'');assert.equal(Auth.getPendingInvitation().stage,'needs-key');assert.doesNotMatch(reloaded.render(),new RegExp(firstKey));
  remote=await request(owner,'/api/session');assert.equal(remote.users.filter(user=>user.username===username).length,1);assert.equal(remote.invitations.find(value=>value.token===token)?.status,'accepted');
  await reloaded.handleSubmit(form({currentPassword:password}));assert.match(reloaded.render(),/YOUR RECOVERY KEY/);const replacement=Auth.getRecoveryKey();assert.ok(replacement);assert.notEqual(replacement,firstKey);noStoredSecrets(password,replacement);
  await reloaded.handleSubmit(form({keySaved:'on'}));assert.equal(Auth.getPendingInvitation(),null);assert.equal(Auth.getRecoveryKey(),'');
  await t.test('a definitive revoked race does not leave a false uncertain request',async()=>{
   await Auth.signOut();const pending=await request(owner,'/api/invitations',{name:'Revoked Staff',phone:'0555550192',role:'cashier',shopIds:[shopId]});const ui=controller();ui.show('invite',{token:pending.invitation.token});await until(()=>ui.render().includes('Create password'));
   await request(owner,'/api/invitations/'+pending.invitation.id+'/revoke',{});
   await ui.handleSubmit(form({username:'revoked.invitation',newPassword:password,confirmPassword:password}));assert.equal(Auth.getPendingInvitation(),null);assert.match(ui.render(),/Check this invitation/);assert.doesNotMatch(ui.render(),/Original password/);
  });
  await t.test('an accepted link without a local request marker permits correction after mistyped original credentials',async()=>{
   const previous=Auth.getSession();await Auth.signOut();assert.equal(Auth.getPendingInvitation(),null);globalThis.fetch=staff;
   const ui=controller();ui.show('invite',{token});await until(()=>ui.render().includes('Original password'));assert.doesNotMatch(ui.render(),/value="invitation.cashier"[^>]+readonly/);
   await ui.handleSubmit(form({username:'mistyped.staff',password}));assert.equal(Auth.getPendingInvitation(),null);assert.match(ui.render(),/Original password/);assert.doesNotMatch(ui.render(),/name="username"[^>]+readonly/);
   await ui.handleSubmit(form({username,password}));assert.equal(Auth.getSession().username,username);assert.match(ui.render(),/data-access-view="regenerate-key"/);
   await ui.handleSubmit(form({currentPassword:password}));await ui.handleSubmit(form({keySaved:'on'}));assert.equal(Auth.getPendingInvitation(),null);await Auth.signOut();
  });
  await t.test('sign-in is a safe alternative after an interrupted invitation, with key replacement still required',async()=>{
   const pending=await request(owner,'/api/invitations',{name:'Sign-in Staff',phone:'0555550193',role:'cashier',shopIds:[shopId]});let lost=false;
   globalThis.fetch=async(path,options)=>{const response=await staff(path,options);if(path==='/api/invitations/accept'&&!lost){lost=true;throw new TypeError('Lost after commit')}return response};
   const ui=controller();ui.show('invite',{token:pending.invitation.token});await until(()=>ui.render().includes('Create password'));await ui.handleSubmit(form({username:'invitation.signin',newPassword:password,confirmPassword:password}));
   await ui.handleClick('access-invitation-sign-in',{});assert.match(ui.render(),/value="invitation.signin"/);await ui.handleSubmit(form({username:'invitation.signin',password}));
   assert.equal(Auth.getSession().username,'invitation.signin');assert.match(ui.render(),/data-access-view="regenerate-key"/);assert.equal(Auth.getRecoveryKey(),'');assert.equal(Auth.getPendingInvitation().stage,'needs-key');noStoredSecrets(password);
   await ui.handleSubmit(form({currentPassword:password}));await ui.handleSubmit(form({keySaved:'on'}));assert.equal(Auth.getPendingInvitation(),null);
  });
  await t.test('invalid invitation usernames are rejected before submission and can be corrected',async()=>{
   await Auth.signOut();globalThis.fetch=staff;
   const invited=await request(owner,'/api/invitations',{name:'Correctable Staff',phone:'0555550194',role:'cashier',shopIds:[shopId]}),ui=controller();ui.show('invite',{token:invited.invitation.token});await until(()=>ui.render().includes('Create password'));
   const before=calls.filter(call=>call.path==='/api/invitations/accept').length;
   for(const invalid of ['.staff','_staff']){
    await ui.handleSubmit(form({username:invalid,newPassword:password,confirmPassword:password}));assert.match(ui.render(),/starting with a letter or number/);assert.match(ui.render(),/Create password/);assert.equal(Auth.getPendingInvitation(),null);
    await assert.rejects(Auth.acceptInvitation({token:invited.invitation.token,username:invalid,password}),error=>error.status===400&&error.code==='INVALID_REQUEST');assert.equal(Auth.getPendingInvitation(),null);
   }
   assert.equal(calls.filter(call=>call.path==='/api/invitations/accept').length,before,'Invalid names must not send an acceptance request');
   await ui.handleSubmit(form({username:'1.corrected.staff',newPassword:password,confirmPassword:password}));assert.equal(Auth.getSession().username,'1.corrected.staff');assert.match(ui.render(),/YOUR RECOVERY KEY/);noStoredSecrets(password,Auth.getRecoveryKey());
   await ui.handleSubmit(form({keySaved:'on'}));const remote=await request(owner,'/api/session');assert.equal(remote.users.filter(user=>user.username==='1.corrected.staff').length,1);
  });
  await t.test('an impossible legacy username marker does not block reopening or a reissued invitation',async()=>{
   await Auth.signOut();globalThis.fetch=staff;
   const invited=await request(owner,'/api/invitations',{name:'Legacy Retry Staff',phone:'0555550195',role:'cashier',shopIds:[shopId]});
   sessionStorage.setItem('lumo-merchant-invitation-pending-v1',JSON.stringify({version:1,token:invited.invitation.token,username:'.staff',stage:'uncertain',startedAt:new Date().toISOString()}));
   const first=controller();first.show('invite',{token:invited.invitation.token});await until(()=>first.render().includes('Create password'));assert.equal(Auth.getPendingInvitation(),null);assert.doesNotMatch(first.render(),/Original username|readonly/);
   const resent=await request(owner,'/api/invitations/'+invited.invitation.id+'/resend',{});assert.notEqual(resent.invitation.token,invited.invitation.token);
   sessionStorage.setItem('lumo-merchant-invitation-pending-v1',JSON.stringify({version:1,token:invited.invitation.token,username:'_staff',stage:'uncertain'}));
   const reopened=controller();reopened.show('invite',{token:resent.invitation.token});await until(()=>reopened.render().includes('Create password'));assert.doesNotMatch(reopened.render(),/Finish your first|Original username/);assert.equal(Auth.getPendingInvitation(),null);
   await reopened.handleSubmit(form({username:'legacy.corrected',newPassword:password,confirmPassword:password}));assert.equal(Auth.getSession().username,'legacy.corrected');assert.match(reopened.render(),/YOUR RECOVERY KEY/);await reopened.handleSubmit(form({keySaved:'on'}));assert.equal(Auth.getPendingInvitation(),null);
  });
  await t.test('definitive server credential rejection releases the invitation without pretending an account may exist',async()=>{
   await Auth.signOut();const invited=await request(owner,'/api/invitations',{name:'Rejected Request Staff',phone:'0555550196',role:'cashier',shopIds:[shopId]}),ui=controller();globalThis.fetch=staff;ui.show('invite',{token:invited.invitation.token});await until(()=>ui.render().includes('Create password'));
   let rejected=false;globalThis.fetch=async(path,options)=>{
    if(path==='/api/invitations/accept'&&!rejected){rejected=true;const body=JSON.parse(options.body);body.password='short';return staff(path,{...options,body:JSON.stringify(body)})}
    return staff(path,options);
   };
   await ui.handleSubmit(form({username:'server.corrected',newPassword:password,confirmPassword:password}));assert.equal(Auth.getPendingInvitation(),null);assert.match(ui.render(),/Create password/);assert.doesNotMatch(ui.render(),/Original username|readonly|Your account may already exist/);
   let remote=await request(owner,'/api/session');assert.equal(remote.users.filter(user=>user.username==='server.corrected').length,0);
   await ui.handleSubmit(form({username:'server.corrected',newPassword:password,confirmPassword:password}));assert.equal(Auth.getSession().username,'server.corrected');assert.match(ui.render(),/YOUR RECOVERY KEY/);await ui.handleSubmit(form({keySaved:'on'}));remote=await request(owner,'/api/session');assert.equal(remote.users.filter(user=>user.username==='server.corrected').length,1);noStoredSecrets(password);
  });
  await t.test('a valid unresolved invitation remains protected from replacement',async()=>{
   await Auth.signOut();sessionStorage.setItem('lumo-merchant-invitation-pending-v1',JSON.stringify({version:1,token:'original-valid-token',username:'valid.uncertain',stage:'uncertain'}));
   await assert.rejects(Auth.acceptInvitation({token:'different-token',username:'different.staff',password}),error=>error.code==='INVITATION_PENDING');assert.equal(Auth.getPendingInvitation().username,'valid.uncertain');assert.equal(Auth.getPendingInvitation().token,'original-valid-token');Auth.clearPendingInvitation('valid.uncertain');
  });
 }finally{globalThis.fetch=originalFetch;DB.close()}
});
