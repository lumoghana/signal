import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createApprovedService} from '../dist/js/approved-service.js';
import {locksFor,createWebLocks} from './helpers/web-locks.js';
import {createEmptyState} from '../dist/js/model.js';
import {savePaymentRecovery,loadPaymentRecovery,recoveryPending} from '../dist/js/payment-recovery.js';
import {createSignupRecovery} from '../dist/js/signup-recovery.js';
import {createAppRecoveryContext} from './helpers/app-recovery-vm.js';

const KEY='lumo-approved-session-v1';
const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};};
const session=(id,expires=9999999999,suffix='original')=>({access_token:`${id}-${suffix}-access`,refresh_token:`${id}-${suffix}-refresh`,expires_at:expires,user:{id}});
const deferred=()=>{let resolve;return {promise:new Promise(done=>{resolve=done;}),resolve:value=>resolve(value)};};
const eventBus=()=>{const listeners=new Set();return {addEventListener:(name,fn)=>listeners.add(fn),removeEventListener:(name,fn)=>listeners.delete(fn),storage:()=>{for(const fn of listeners)fn({key:KEY});}};};
const service=(storage,fetch,extra={})=>createApprovedService({storage,lockManager:locksFor(storage),modeStorage:memory(),fetch,...extra});
const tick=()=>new Promise(resolve=>setImmediate(resolve));

async function holdCredentialLock(locks){const entered=deferred(),release=deferred();const finished=locks.request(KEY,{mode:'exclusive'},async()=>{entered.resolve();await release.promise;});await entered.promise;return {release:async()=>{release.resolve();await finished;}};}

test('an old tab locks immediately on a browser account change and cannot overwrite or sign out the new account',async()=>{
 const storage=memory(),events=eventBus(),calls=[];storage.setItem(KEY,JSON.stringify(session('owner-a',1)));
 const a=service(storage,async url=>{calls.push(url);return Response.json(session('owner-a'));},{eventTarget:events});
 const b=service(storage,async()=>Response.json({ok:true,session:session('owner-b')}));
 const changed=[];a.subscribeAuth(value=>changed.push(value.reason));await b.login('owner-b','synthetic');events.storage();
 assert.deepEqual(changed,['ACCOUNT_CHANGED']);assert.equal(a.signedIn,false);assert.equal(a.user,null);
 assert.equal((await a.snapshot()).code,'UNAUTHENTICATED');await a.signOut();assert.equal(calls.length,0);
 assert.equal(JSON.parse(storage.getItem(KEY)).user.id,'owner-b');assert.equal(b.signedIn,true);
 a.dispose();
});

test('a delayed refresh cannot replace a new login even when the browser switches back to the same person',async()=>{
 const storage=memory(),wait=deferred();storage.setItem(KEY,JSON.stringify(session('owner-a',1)));
 const a=service(storage,()=>wait.promise),b=service(storage,async()=>Response.json({ok:true,session:session('owner-b')}));
 const pending=a.snapshot();await b.login('owner-b','synthetic');
 const fresh=service(storage,async()=>Response.json({ok:true,session:session('owner-a',9999999999,'fresh')}));
 await fresh.login('owner-a','synthetic');const saved=storage.getItem(KEY);wait.resolve(Response.json(session('owner-a',9999999999,'stale')));
 assert.equal((await pending).code,'ACCOUNT_CHANGED');assert.equal(a.signedIn,false);assert.equal(storage.getItem(KEY),saved);
 assert.equal(fresh.signedIn,true);
});

test('terminal revocation clears private application state without deleting original account payment recovery',async()=>{
 const storage=memory(),tabStorage=memory();storage.setItem(KEY,JSON.stringify(session('owner-a')));tabStorage.setItem('lumo-session-v1','private draft');
 const payload={rail:'lumo',recipient:{handle:'recipient'},amount:1000,idempotencyKey:'original-reference'};
 savePaymentRecovery('owner-a',{...payload,submittedPayload:payload,submissionState:'unknown',submissionOwnerId:'owner-a'},storage);
 const shared=service(storage,async()=>Response.json({ok:false,code:'SESSION_REVOKED'},{status:401}));
 const app=await readFile(new URL('../dist/js/app.js',import.meta.url),'utf8'),from=app.indexOf('function clearSharedPrivateView(){'),to=app.indexOf('async function refreshShared(',from);
 const calls={cleanup:0,media:0,closed:0,inbox:0,social:0,route:0,rewards:0},state={wallet:12345,profile:{name:'Private account'}};
 const scope=vm.createContext({ctx:{shared},resetConsumerRewards:()=>calls.rewards++,shared,state,draft:{payment:{...payload,submittedPayload:payload,submissionState:'unknown',submissionOwnerId:'owner-a'},chat:[{text:'private'}]},recoveryPending,savePaymentRecovery:(owner,payment)=>savePaymentRecovery(owner,payment,storage),signupPassword:'private password',authorizationPin:'1234',cleanup:()=>calls.cleanup++,clearSignupRecovery(){},clearOnboardingMedia:()=>calls.media++,captureCurrent:()=>{},pendingSharedRender:true,pendingPageNavigation:false,closeSheet:()=>calls.closed++,sharedDraftOwner:'owner-a',sharedHydrated:true,sharedConnectionError:'',persistence:{release(){}},reconcileState(target,next){for(const key of Object.keys(target))delete target[key];Object.assign(target,next);},createEmptyState,caseUpdates:{get snapshot(){calls.inbox++;return{};}},social:{get snapshot(){calls.social++;return{};}},sessionStorage:tabStorage,route:{section:'pay',page:'review'},router:{},makeRouter:()=>({initialise:()=>calls.route++}),focusView(){}});
 vm.runInContext(app.slice(from,to)+'\nthis.clear=clearSharedPrivateView;',scope);shared.subscribeAuth(()=>scope.clear());
 const response=await shared.snapshot();assert.equal(response.code,'SESSION_REVOKED');assert.equal(shared.signedIn,false);assert.equal(storage.getItem(KEY),null);
 assert.equal(scope.state.wallet,0);assert.equal(scope.signupPassword,'');assert.equal(scope.authorizationPin,'');assert.deepEqual(Object.keys(scope.draft),[]);assert.equal(scope.route.page,'account-access');assert.equal(tabStorage.getItem('lumo-session-v1'),null);
 assert.deepEqual(calls,{cleanup:1,media:1,closed:1,inbox:1,social:1,route:1,rewards:1});assert.equal(loadPaymentRecovery('owner-a',storage).idempotencyKey,'original-reference');
});

test('a transient network failure preserves the current account and its saved tokens',async()=>{
 const storage=memory();storage.setItem(KEY,JSON.stringify(session('owner-a')));const initial=storage.getItem(KEY),events=[];
 const shared=service(storage,async()=>{throw Error('offline');});shared.subscribeAuth(value=>events.push(value));
 const result=await shared.snapshot();assert.equal(result.unknown,true);assert.equal(shared.signedIn,true);assert.equal(storage.getItem(KEY),initial);assert.deepEqual(events,[]);
});

test('the social and pilot endpoints also discard terminal revoked sessions',async()=>{
 for(const call of [shared=>shared.socialRequest({action:'notifications',operation:'list'}),shared=>shared.businessRequest({action:'context'})]){
  const storage=memory();storage.setItem(KEY,JSON.stringify(session('owner-a')));const shared=service(storage,async()=>Response.json({ok:false,code:'SESSION_REVOKED'},{status:401}));
  assert.equal((await call(shared)).code,'SESSION_REVOKED');assert.equal(shared.signedIn,false);assert.equal(storage.getItem(KEY),null);
 }
});

test('connected signup forwards only accepted terms and the explicit verification summary',async()=>{
 const app=await readFile(new URL('../dist/js/app.js',import.meta.url),'utf8'),from=app.indexOf('async function completeSignup(){'),to=app.indexOf('\nasync function ',from+1);
 assert.ok(from>=0&&to>from);
 const termsAcceptance={version:'2026-11-08.1',acceptedAt:'2026-11-16T10:00:00Z'},verification={mode:'simulation',capture:'live-camera',status:'complete',detailsConfirmed:true},d={login:{username:'test.student'},name:'Test student',phone:'0241000001',pin:'1234'},calls=[];
 const scope=vm.createContext({completingSignup:false,signupRecoveryLifecycle:0,pendingSignupRecoverySeed:null,onboardingDraft:()=>d,buildOnboardingState:()=>({ok:true,state:{termsAcceptance,verification,profile:{legalName:'Do not forward this'},cameraPhotos:['do-not-forward']}}),shared:{connected:true,register:async payload=>{calls.push(payload);return {ok:false,code:'SERVICE_UNAVAILABLE',message:'Synthetic stop after registration contract'};}},signupPassword:'synthetic-password',onboardingRecoveryCaptures:()=>['one','two','three'],signupUsernameMessage:()=>'',toast(){},render(){}});
 vm.runInContext(app.slice(from,to)+'\nthis.complete=completeSignup;',scope);await scope.complete();
 assert.equal(calls.length,1);assert.deepEqual(JSON.parse(JSON.stringify(calls[0].onboarding)),{termsAcceptance,verification});assert.deepEqual(Object.keys(calls[0]).sort(),['displayName','handle','onboarding','password','phone','pin']);
});

test('pagehide clears pending signup recovery seeds and late registration keeps only the account-created checkpoint',async()=>{
 const source=await readFile(new URL('../dist/js/app.js',import.meta.url),'utf8'),from=source.indexOf('async function completeSignup(){'),to=source.indexOf('\nfunction exitAccountActivation()',from),hideFrom=source.indexOf("window.addEventListener('pagehide',()=>"),hideTo=source.indexOf('\n',hideFrom);
 assert.ok(from>=0&&to>from&&hideFrom>=0&&hideTo>hideFrom);
 for(const timing of ['pending-registration','consent-screen']){
  const registration=deferred(),listeners=new Map(),requests=[],seeds=[],checkpoints=[],flows=[],captured=['synthetic-one','synthetic-two','synthetic-three'];let encoded=0;
  const d={login:{username:'test.student'},name:'Test student',phone:'0241000001',pin:'1234'},draft={onboarding:d},shared={connected:true,signedIn:true,user:{id:'created-owner'},authVersion:1,register:()=>registration.promise,passwordRecoveryRequest:async operation=>{requests.push(operation);return {ok:true,faceAvailable:true,faceMatching:'stored-template',faceSimulation:false,identityVerified:false,livenessVerified:false,requiresBackupKey:true,faceConsentVersion:'2026-11-16.face.1'};}};
  const scope=createAppRecoveryContext({completingSignup:false,signupPassword:'transient-signup-password',onboardingDraft:()=>d,buildOnboardingState:()=>({ok:true,state:{}}),onboardingRecoveryCaptures:()=>captured,shared,draft,state:{},window:{addEventListener:(name,fn)=>listeners.set(name,fn)},suspendMainTabPage(){},cleanup:null,captureCurrent:null,closeSheet(){},shell:{innerHTML:''},app:{dataset:{}},view:{innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]},createSignupRecovery:options=>{seeds.push({password:options.password,captures:[...options.captures]});const flow=createSignupRecovery(options);flows.push(flow);return flow;},encodeSignupRecoveryCaptures:async()=>{encoded++;throw Error('Interrupted setup must not encode or upload photos');},pilotExperience:{record:async()=>{}},clearOnboardingMedia(){},createActivationDraft:()=>({}),persistSession(){},checkpointActivation:async name=>{checkpoints.push(name);return {ok:true};},toast(){},render(){},signupUsernameMessage:()=>'',go(){},signOut(){}},source);
  vm.runInContext(source.slice(from,to)+'\n'+source.slice(hideFrom,hideTo)+'\nthis.complete=completeSignup;',scope);
  const pending=scope.complete(),seed=scope.pendingSignupRecoverySeed;assert.equal(seed.password,'transient-signup-password');assert.deepEqual([...seed.captures],captured);
  if(timing==='pending-registration'){
   listeners.get('pagehide')();assert.equal(seed.password,'');assert.equal(seed.captures.length,0);assert.equal(scope.pendingSignupRecoverySeed,null);
  }
  registration.resolve({ok:true});await pending;await tick();
  assert.deepEqual(checkpoints,['account-created']);assert.equal(draft.activation.sharedUserId,'created-owner');assert.equal(draft.activation.recoverySetupPending,true);assert.equal(draft.onboarding,undefined);assert.equal(scope.pendingSignupRecoverySeed,null);assert.equal(scope.signupPassword,'');assert.equal(encoded,0);
  if(timing==='pending-registration'){
   assert.deepEqual(seeds,[{password:'',captures:[]}]);assert.equal(flows[0].view.phase,'interrupted');assert.deepEqual(requests,[]);
  }else{
   assert.deepEqual(seeds,[{password:'transient-signup-password',captures:captured}]);assert.equal(flows[0].view.phase,'consent');assert.deepEqual(requests,['status']);
   listeners.get('pagehide')();assert.equal(scope.signupRecovery,null);assert.equal(await flows[0].submit({faceConsent:true}),false);assert.equal(encoded,0);assert.deepEqual(requests,['status']);
  }
 }
});

test('a login queued ahead of an old refresh wins the shared credential lock, including a fresh login by the same owner',async()=>{
 for(const nextOwner of ['owner-b','owner-a']){
  const storage=memory(),locks=createWebLocks(),held=await holdCredentialLock(locks),requests=[];storage.setItem(KEY,JSON.stringify(session('owner-a',1)));
  const a=service(storage,async url=>{requests.push(url);return Response.json(session('owner-a',9999999999,'stale-refresh'));},{lockManager:locks});
  const b=service(storage,async()=>Response.json({ok:true,session:session(nextOwner,9999999999,'fresh-login')}),{lockManager:locks});
  const login=b.login(nextOwner,'synthetic');await tick();
  const refresh=a.snapshot();await tick();assert.equal(requests.length,1);assert.match(requests[0],/refresh_token/);
  await held.release();assert.equal((await login).ok,true);assert.equal((await refresh).code,'ACCOUNT_CHANGED');
  const stored=JSON.parse(storage.getItem(KEY));assert.equal(stored.user.id,nextOwner);assert.equal(stored.access_token,`${nextOwner}-fresh-login-access`);assert.equal(a.signedIn,false);assert.equal(b.signedIn,true);
 }
});

test('queued sign-out clears local access immediately and never removes a newer login',async()=>{
 const storage=memory(),locks=createWebLocks(),held=await holdCredentialLock(locks);storage.setItem(KEY,JSON.stringify(session('owner-a')));
 const a=service(storage,async()=>new Response(null,{status:204}),{lockManager:locks}),b=service(storage,async()=>Response.json({ok:true,session:session('owner-b')}),{lockManager:locks});
 const login=b.login('owner-b','synthetic');await tick();const notices=[];a.subscribeAuth(event=>notices.push(event.reason));
 const logout=a.signOut();assert.equal(a.signedIn,false);assert.deepEqual(notices,['SIGNED_OUT']);assert.notEqual(storage.getItem(KEY),null);
 await held.release();assert.equal((await login).ok,true);await logout;assert.equal(JSON.parse(storage.getItem(KEY)).user.id,'owner-b');assert.equal(b.signedIn,true);
});

test('terminal expiry locks the page before its queued removal and cannot erase a newer account',async()=>{
 const storage=memory(),locks=createWebLocks(),held=await holdCredentialLock(locks);storage.setItem(KEY,JSON.stringify(session('owner-a')));
 const a=service(storage,async()=>Response.json({ok:false,code:'SESSION_REVOKED'},{status:401}),{lockManager:locks}),b=service(storage,async()=>Response.json({ok:true,session:session('owner-b')}),{lockManager:locks});
 const login=b.login('owner-b','synthetic');await tick();const revoked=a.snapshot();await tick();assert.equal(a.signedIn,false);
 await held.release();assert.equal((await login).ok,true);assert.equal((await revoked).code,'SESSION_REVOKED');assert.equal(JSON.parse(storage.getItem(KEY)).user.id,'owner-b');assert.equal(b.signedIn,true);
});

test('missing or failed credential locks never write a session and cannot claim a completed local sign-out',async()=>{
 for(const locks of [null,{request:async()=>undefined},{request:async()=>{throw Error('lock service unavailable');}}]){
  const storage=memory(),changes=[],originalSet=storage.setItem,originalRemove=storage.removeItem;storage.setItem(KEY,JSON.stringify(session('owner-a')));
  storage.setItem=(key,value)=>{changes.push(['set',key]);originalSet(key,value);};storage.removeItem=key=>{changes.push(['remove',key]);originalRemove(key);};
  const shared=service(storage,async url=>url.includes('logout')?new Response(null,{status:204}):Response.json({ok:true,session:session('owner-b')}),{lockManager:locks});
  const login=await shared.login('owner-b','synthetic');assert.equal(login.code,'SESSION_STORAGE_UNAVAILABLE');assert.equal(JSON.parse(storage.getItem(KEY)).user.id,'owner-a');
  const logout=shared.signOut();assert.equal(shared.signedIn,false);assert.equal((await logout).code,'SIGNOUT_UNCONFIRMED');assert.deepEqual(changes,[]);assert.equal(JSON.parse(storage.getItem(KEY)).user.id,'owner-a');
 }
});

test('a failed storage read inside the credential lock cannot overwrite the saved account',async()=>{
 const storage=memory(),base=createWebLocks(),get=storage.getItem,set=storage.setItem;let locked=false,writes=0;
 storage.setItem(KEY,JSON.stringify(session('owner-a')));storage.getItem=key=>{if(locked&&key===KEY)throw Error('Storage read unavailable');return get(key);};storage.setItem=(key,value)=>{writes++;set(key,value);};
 const locks={request:(name,options,work)=>base.request(name,options,()=>{locked=true;try{return work();}finally{locked=false;}})};
 const shared=service(storage,async()=>Response.json({ok:true,session:session('owner-b')}),{lockManager:locks});
 assert.equal((await shared.login('owner-b','synthetic')).code,'SESSION_STORAGE_UNAVAILABLE');assert.equal(writes,0);assert.equal(JSON.parse(get(KEY)).user.id,'owner-a');
});
