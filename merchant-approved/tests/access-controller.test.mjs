import assert from 'node:assert/strict';
import test from 'node:test';
import {createAccess,accessSessionState,securityPage} from '../dist/access.js';
import {createPeople} from '../dist/people.js';

// Controller tests use disposable values and a minimal DOM. No network, storage or real credentials.
globalThis.requestAnimationFrame=fn=>fn();
globalThis.document={querySelector(){return null}};
globalThis.window={scrollTo(){}};
globalThis.location={origin:'https://merchant.example.test',pathname:'/'};
globalThis.FormData=class {
 constructor(form){this.values=form.values}
 *[Symbol.iterator](){yield* this.values}
 getAll(name){return this.values.filter(([key])=>key===name).map(([,value])=>value)}
};
const form=(values,extra={})=>({dataset:extra,values:Object.entries(values).flatMap(([key,value])=>Array.isArray(value)?value.map(x=>[key,x]):[[key,value]])});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const owner=()=>({id:'owner-session',userId:'owner',businessId:'business',name:'Akua Owner',username:'akua.owner',phone:'+233245550100',role:'owner',shopIds:['shop-1']});
function fixture(overrides={}){
 let current=owner();
 const calls={cleared:0,saved:0,back:0,transferred:0};
 const users=[{...current,id:'owner',active:true},{id:'staff',businessId:'business',name:'Ama Manager',username:'ama.manager',role:'manager',active:true,shopIds:['shop-1']}];
 const auth={isShared:true,getSession:()=>current,hasOwner:()=>true,listUsers:()=>users,listInvitations:()=>[],listSessions:()=>[],getAuthAudit:()=>[],getRecoveryKey:()=>null,clearRecoveryKey(){calls.cleared++},...overrides};
 const access=createAccess({auth,business:()=>({id:'business',name:'Campus Kitchen'}),hasRegistration:()=>true,onRender(){},onBack(){calls.back++},onRecoveryKeySaved(){calls.saved++}});
 const people=createPeople({auth,getState:()=>({business:{id:'business'},shops:[{id:'shop-1',name:'Night Market',area:'Night Market',code:'LUM-ONE'}]}),getSession:()=>current,onRender(){},onOwnershipTransferred(){calls.transferred++}});
 return {auth,access,people,calls,users,setSession(value){current=value}};
}

test('session history distinguishes ended access and exposes actions only for active sessions',()=>{
 const now=Date.now(),sessions=[
  {id:'owner-session',userId:'owner',createdAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+60000).toISOString(),active:true},
  {id:'revoked',userId:'owner',expiresAt:new Date(now+60000).toISOString(),revokedAt:new Date(now-3000).toISOString(),active:false},
  {id:'expired',userId:'owner',expiresAt:new Date(now-5000).toISOString(),active:false}
 ];
 assert.equal(accessSessionState(sessions[0]),'active');assert.equal(accessSessionState(sessions[1]),'revoked');assert.equal(accessSessionState(sessions[2]),'expired');
 const {access}=fixture({listSessions:()=>sessions});access.show('sessions');const html=access.render();
 assert.match(html,/Revoked/);assert.match(html,/Expired/);assert.equal((html.match(/data-action="access-revoke-session"/g)||[]).length,1);assert.match(html,/1 active session/);
 assert.match(securityPage({session:owner(),sessions}),/1 active session/);
});

test('invitation lookup accepts asynchronous server reads and discards stale results',async()=>{
 let release;const waiting=new Promise(resolve=>{release=resolve});
 const {access}=fixture({getInvitation:()=>waiting});access.show('invite',{token:'test-invitation'});assert.match(access.render(),/Checking your/);
 access.show('login');release({name:'Kojo Cashier',role:'cashier',shopIds:['shop-1'],status:'pending',expiresAt:new Date(Date.now()+60000).toISOString()});await tick();
 assert.match(access.render(),/Welcome back/);assert.doesNotMatch(access.render(),/the team, Kojo/);
 const fresh=fixture({getInvitation:async()=>({name:'Kojo Cashier',role:'cashier',shopIds:['shop-1'],status:'pending',expiresAt:new Date(Date.now()+60000).toISOString()})}).access;
 fresh.show('invite',{token:'valid-invitation'});await tick();assert.match(fresh.render(),/the team, Kojo/);assert.doesNotMatch(fresh.render(),/value="akua.owner"/);
});

test('shared password recovery requires the private key and never presents a universal demo code',async()=>{
 let received=null;
 const {access}=fixture({beginRecovery:async()=>({challengeId:'private-recovery',method:'recovery-key',maskedPhone:'+233 ••• 0100'}),completeRecovery:async value=>{received=value;return {success:true}}});
 access.show('recovery');await access.handleSubmit(form({username:'akua.owner'}));assert.match(access.render(),/Saved recovery key/);assert.doesNotMatch(access.render(),/123456/);
 await access.handleSubmit(form({newPassword:'RecoveredTest123',confirmPassword:'RecoveredTest123'}));assert.equal(received,null);assert.match(access.render(),/Enter the private recovery key/);
 await access.handleSubmit(form({recoveryKey:'SampleRecoveryKey',newPassword:'RecoveredTest123',confirmPassword:'RecoveredTest123'}));
 assert.deepEqual(received,{challengeId:'private-recovery',recoveryKey:'SampleRecoveryKey',newPassword:'RecoveredTest123'});assert.match(access.render(),/You’re ready/);
});

test('username recovery sends both the registered number and private key before displaying account names',async()=>{
 let received=null;
 const {access}=fixture({recoverUsername:async value=>{received=value;return {usernames:['akua.owner']}}});access.show('username-recovery');
 await access.handleSubmit(form({phone:'0245550100'}));assert.equal(received,null);assert.doesNotMatch(access.render(),/@akua.owner/);
 await access.handleSubmit(form({phone:'0245550100',recoveryKey:'SampleRecoveryKey'}));assert.deepEqual(received,{phone:'0245550100',recoveryKey:'SampleRecoveryKey'});assert.match(access.render(),/@akua.owner/);
});

test('phone changes require the current password and do not claim carrier verification',async()=>{
 let received=null;const {access}=fixture({changePhone:async value=>{received=value;return {success:true}}});access.show('phone');
 await access.handleSubmit(form({newPhone:'0555550100'}));assert.equal(received,null);
 await access.handleSubmit(form({newPhone:'0555550100',currentPassword:'OwnerTest123'}));assert.deepEqual(received,{newPhone:'0555550100',currentPassword:'OwnerTest123'});assert.match(access.render(),/No carrier or SMS verification/);
});

test('owner confirmation normalizes server proofs, retains failures, supports cancellation and refuses staff',async()=>{
 let count=0;const {access,setSession}=fixture({verifyStepUp:async value=>{count++;if(value.currentPassword!=='OwnerTest123')throw Error('Password incorrect');return {proof:'server-proof',purpose:value.purpose}}});
 let pending=access.requestStepUp({purpose:'settlement'});await access.handleSubmit(form({currentPassword:'wrong'}));assert.match(access.render(),/Password incorrect/);
 await access.handleSubmit(form({currentPassword:'OwnerTest123'}));assert.equal((await pending).stepUpToken,'server-proof');assert.equal(count,2);
 pending=access.requestStepUp({purpose:'destination'});await access.handleClick('access-cancel-step-up',{});assert.equal(await pending,null);
 setSession({...owner(),role:'cashier'});await assert.rejects(access.requestStepUp({purpose:'settlement'}),/business owner/);
});

test('one-time recovery key remains until saving is acknowledged and is then cleared',async()=>{
 const {access,calls}=fixture();access.show('recovery-key',{recoveryKey:'OnceOnlySampleKey'});
 await access.handleSubmit(form({}));assert.equal(calls.cleared,0);assert.match(access.render(),/Confirm that you have saved/);
 await access.handleSubmit(form({keySaved:'on'}));assert.equal(calls.cleared,1);assert.equal(calls.saved,1);assert.equal(access.isActive(),false);
});

test('recovery key replacement verifies the password and shows the returned key for acknowledgement',async()=>{
 let received=null;const {access,calls}=fixture({regenerateRecoveryKey:async value=>{received=value;return {recoveryKey:'ReplacementSampleKey'}}});access.show('regenerate-key');
 await access.handleSubmit(form({}));assert.equal(received,null);
 await access.handleSubmit(form({currentPassword:'OwnerTest123'}));assert.deepEqual(received,{currentPassword:'OwnerTest123'});assert.match(access.render(),/ReplacementSampleKey/);assert.match(access.render(),/Save this private recovery key/);assert.equal(calls.cleared,0);
 await access.handleSubmit(form({keySaved:'on'}));assert.equal(calls.cleared,1);
});

test('ownership handover requires an active target, exact confirmation, password and agreed consent',async()=>{
 let received=null;const {people,calls}=fixture({transferOwner:async (value,actor)=>{received={value,actor};return {success:true}}});
 await people.handleClick('people-user',{dataset:{id:'staff'}});assert.match(people.render(),/Transfer business ownership/);
 await people.handleClick('people-ask-transfer',{dataset:{id:'staff'}});assert.match(people.render(),/Type TRANSFER/);
 await people.handleSubmit(form({targetUserId:'staff',currentPassword:'OwnerTest123',confirmation:'wrong',acceptResponsibility:'on'},{peopleForm:'transfer'}));assert.equal(received,null);
 await people.handleSubmit(form({targetUserId:'staff',currentPassword:'OwnerTest123',confirmation:'TRANSFER',acceptResponsibility:'on'},{peopleForm:'transfer'}));
 assert.equal(received.value.targetUserId,'staff');assert.equal(received.value.acceptResponsibility,true);assert.equal(received.actor.userId,'owner');assert.equal(calls.transferred,1);
});

test('an ordinary shared-business logout never advertises legacy setup or accepts a migration action',async()=>{
 const {access}=fixture({hasOwner:()=>false,canMigrateLegacyBusiness:()=>false});
 access.show('login');assert.doesNotMatch(access.render(),/Finish setting up account access|Import a saved prototype/);
 access.show('secure');assert.match(access.render(),/already shared/);assert.doesNotMatch(access.render(),/123456/);
});

test('legacy import needs explicit upload consent before collecting new shared credentials',async()=>{
 let received=null;const {auth}=fixture({canMigrateLegacyBusiness:()=>true,getPendingLegacyImport:()=>null});
 const access=createAccess({auth,business:()=>({id:'old-browser-business',name:'Saved Kitchen'}),onRender(){},onSecureExisting:value=>{received=value},onAuthenticated(){}});
 access.show('secure');assert.match(access.render(),/uploads the saved business/);assert.doesNotMatch(access.render(),/123456/);
 await access.handleSubmit(form({}));assert.equal(received,null);assert.match(access.render(),/Confirm that you want to upload/);
 await access.handleSubmit(form({importConsent:'on'}));await access.handleSubmit(form({username:'saved.owner',newPassword:'ImportedTest123',confirmPassword:'ImportedTest123'}));
 assert.deepEqual(received,{username:'saved.owner',password:'ImportedTest123',confirmImport:true});
});

test('an interrupted legacy import resumes in its existing owner account with password and consent',async()=>{
 let received=null;const {access}=fixture({canMigrateLegacyBusiness:()=>true,getPendingLegacyImport:()=>({targetBusinessId:'business',businessName:'Saved Kitchen'}),resumeLegacyImport:async value=>{received=value;return {success:true}}});
 access.show('resume-import');await access.handleSubmit(form({currentPassword:'OwnerTest123'}));assert.equal(received,null);
 await access.handleSubmit(form({currentPassword:'OwnerTest123',importConsent:'on'}));assert.deepEqual(received,{currentPassword:'OwnerTest123',confirmImport:true});
});

test('sign-out locks the visible access screen and calls device cleanup even if the server is offline',async()=>{
 let cleaned=0;const {auth}=fixture({signOut:async()=>{throw Error('Network disconnected')}});
 const access=createAccess({auth,onRender(){},onSignOut(){cleaned++}});await access.handleClick('access-sign-out',{});
 assert.equal(cleaned,1);assert.equal(access.isActive(),true);assert.match(access.render(),/Welcome back/);assert.match(access.render(),/device is locked/);
});

test('a session-ended navigation cancels an outstanding owner-action confirmation',async()=>{
 const {access}=fixture();const pending=access.requestStepUp({purpose:'settlement'});access.show('login');assert.equal(await pending,null);
});

test('shop readiness can open an invitation with that exact shop preselected',()=>{
 const {auth}=fixture();const people=createPeople({auth,getSession:auth.getSession,getState:()=>({business:{id:'business'},shops:[{id:'shop-1',name:'Night Market',area:'Night Market',code:'LUM1'},{id:'shop-2',name:'Pentagon',area:'Pentagon',code:'LUM2'}]}),onRender(){}});
 people.openInvite('shop-2');const html=people.render();assert.match(html,/name="shopIds" value="shop-2" checked/);assert.doesNotMatch(html,/name="shopIds" value="shop-1" checked/);
});

test('an uncertain protected password change switches the actual controller to sign-in when identity is lost',async()=>{
 const f=fixture();f.auth.changePassword=async()=>{f.setSession(null);throw Error('Connection interrupted')};f.access.show('password');
 await f.access.handleSubmit(form({currentPassword:'OwnerTest123',newPassword:'NewOwnerTest123',confirmPassword:'NewOwnerTest123'}));
 const html=f.access.render();assert.match(html,/data-access-view="login"/);assert.match(html,/Sign in again before continuing/);assert.match(html,/Connection interrupted/);assert.doesNotMatch(html,/name="currentPassword"/);
});

test('an uncertain invitation keeps its original username and resumes after lookup without another credential creation form',async()=>{
 let pending=null;const received=[];
 const {access}=fixture({getPendingInvitation:()=>pending,getInvitation:async()=>({name:'Kojo Cashier',role:'cashier',shopIds:['shop-1'],status:'pending',expiresAt:new Date(Date.now()+60000).toISOString()}),acceptInvitation:async payload=>{received.push(payload);pending={token:payload.token,username:payload.username,stage:'uncertain'};throw Object.assign(Error('Connection lost'),{invitationPending:true})}});
 access.show('invite',{token:'original-invite'});await tick();await access.handleSubmit(form({username:'kojo.cashier',newPassword:'OriginalStaff123',confirmPassword:'OriginalStaff123'}));
 let html=access.render();assert.match(html,/Finish your/);assert.match(html,/Original password/);assert.match(html,/value="kojo.cashier"[^>]+readonly/);assert.doesNotMatch(html,/Choose a username|Create password|OriginalStaff123/);
 await access.handleSubmit(form({username:'another.username',password:'OriginalStaff123'}));assert.equal(received.length,1);assert.match(access.render(),/Use the original username/);
 access.show('invite',{token:'original-invite'});await tick();html=access.render();assert.match(html,/Original password/);assert.match(html,/value="kojo.cashier"[^>]+readonly/);
});

test('another invitation cannot replace an unresolved original request, while its sign-in route retains the chosen username',async()=>{
 const lookups=[],pending={token:'original-invite',username:'kojo.cashier',stage:'uncertain'};
 const {access}=fixture({getPendingInvitation:()=>pending,getInvitation:async token=>{lookups.push(token);return {name:'Kojo Cashier',role:'cashier',shopIds:['shop-1'],status:'accepted',retryAllowed:true}}});
 access.show('invite',{token:'different-invite'});assert.match(access.render(),/Finish your first/);assert.deepEqual(lookups,[]);
 await access.handleClick('access-resume-invitation',{});await tick();assert.deepEqual(lookups,['original-invite']);assert.match(access.render(),/Original password/);
 await access.handleClick('access-invitation-sign-in',{});assert.match(access.render(),/data-access-view="login"/);assert.match(access.render(),/value="kojo.cashier"/);
});

test('a recovered invitation with no returned key guides the signed-in person to password-authorized key replacement',async()=>{
 let pending={token:'recovered-invite',username:'kojo.cashier',stage:'uncertain'};const f=fixture({getPendingInvitation:()=>pending,getInvitation:async()=>({name:'Kojo Cashier',role:'cashier',shopIds:['shop-1'],status:'accepted',retryAllowed:true}),getInvitationRecoveryNotice:()=>pending?'Your invitation account needs a replacement recovery key.':''});
 const current={...owner(),id:'staff-session',userId:'staff',role:'cashier',username:'kojo.cashier'};
 f.auth.acceptInvitation=async()=>{f.setSession(current);pending={...pending,stage:'needs-key'};return {session:current,replayed:true,keyUnavailable:true,recoveryKeyAvailable:false}};
 f.access.show('invite',{token:'recovered-invite'});await tick();await f.access.handleSubmit(form({username:'kojo.cashier',password:'OriginalStaff123'}));
 const html=f.access.render();assert.match(html,/data-access-view="regenerate-key"/);assert.match(html,/Confirm your password/);assert.match(html,/Current password/);assert.doesNotMatch(html,/Save this private recovery key|name="savedRecoveryKey"/);
});


test('reload lookup of a definitively revoked request clears its pending marker and permits a new invitation',async()=>{
 let pending={token:'revoked-before-reload',username:'original.staff',stage:'uncertain'};const lookups=[];
 const {access}=fixture({getPendingInvitation:()=>pending,clearPendingInvitation:()=>{pending=null},getInvitation:async token=>{lookups.push(token);return {name:'Staff',role:'cashier',shopIds:['shop-1'],status:token==='revoked-before-reload'?'revoked':'pending',expiresAt:new Date(Date.now()+60000).toISOString()}}});
 access.show('invite',{token:pending.token});await tick();assert.equal(pending,null);assert.match(access.render(),/expired or been revoked/);
 await access.handleClick('access-invite',{});assert.match(access.render(),/Invitation code or link/);assert.match(access.render(),/name="token" value=""/);
 access.show('invite',{token:'replacement-invite'});await tick();assert.match(access.render(),/Create password/);assert.doesNotMatch(access.render(),/Finish your first/);assert.deepEqual(lookups,['revoked-before-reload','replacement-invite']);
});
