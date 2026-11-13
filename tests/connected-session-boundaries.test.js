import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createApprovedService} from '../dist/js/approved-service.js';
import {attachPersistenceEvents} from '../dist/js/persistence.js';
import {createEmptyState} from '../dist/js/model.js';
import {savePaymentRecovery,loadPaymentRecovery,clearPaymentRecovery,ownsSavedSession} from '../dist/js/payment-recovery.js';

const app=await readFile(new URL('../dist/js/app.js',import.meta.url),'utf8');
function functionSource(start,end){const from=app.indexOf(start),to=app.indexOf(end,from+start.length);assert.ok(from>=0&&to>from);return app.slice(from,to)}
const memory=entries=>{const values=new Map(entries);return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)}};

test('global sign-out from a sample clears a retained shared session and cannot hydrate it again',async()=>{
 const storage=memory([['lumo-approved-session-v1',JSON.stringify({access_token:'synthetic-session',refresh_token:'synthetic-refresh',user:{id:'synthetic-owner'}})]]),modeStorage=memory([['lumo-approved-sample-v1','true']]);
 const requests=[],snapshots=[];
 const shared=createApprovedService({storage,modeStorage,fetch:async(url)=>{requests.push(url);return new Response(null,{status:204})},onSnapshot:value=>snapshots.push(value)});
 assert.equal(shared.connected,false);assert.equal(shared.signedIn,true);
 const scope=vm.createContext({shared,state:{wallet:100},draft:{payment:{amount:10}},route:{section:'home',page:'home'},authorizationPin:'',signupPassword:'',cleanup:null,captureCurrent:null,pendingPageNavigation:false,router:null,sharedHydrated:true,sharedConnectionError:'',persistence:{release(){}},act(){throw Error('A retained shared session must use shared sign-out')},toast(){},clearOnboardingMedia(){},closeSheet(){},reconcileState(target,next){for(const key of Object.keys(target))delete target[key];Object.assign(target,next)},createEmptyState,sessionStorage:modeStorage,makeRouter:()=>({initialise(){}}),focusView(){}});
 vm.runInContext(functionSource('async function signOut(){','\nfunction toast(')+'\nthis.run=signOut;',scope);await scope.run();
 assert.equal(shared.connected,true);assert.equal(shared.signedIn,false);assert.equal(storage.getItem('lumo-approved-session-v1'),null);
 assert.equal(requests.length,1);assert.match(requests[0],/logout/);
 const result=await shared.snapshot();assert.equal(result.ok,false);assert.equal(requests.length,1);assert.equal(snapshots.length,0);
 assert.equal(scope.state.wallet,0);assert.equal(scope.route.page,'account-access');
});

test('a remote logout alone cannot claim complete sign-out while the browser retains its saved session',async()=>{
 const storage=memory([['lumo-approved-session-v1',JSON.stringify({access_token:'synthetic-session',user:{id:'synthetic-owner'}})]]);
 storage.removeItem=()=>{throw Error('Removal unavailable')};
 const shared=createApprovedService({storage,modeStorage:memory(),fetch:async()=>new Response(null,{status:204})});
 const result=await shared.signOut();assert.equal(result.ok,false);assert.equal(result.code,'SIGNOUT_UNCONFIRMED');assert.equal(result.remoteRevoked,true);assert.ok(storage.getItem('lumo-approved-session-v1'));
});

test('connected snapshot recovery cannot install a local sample into the account',()=>{
 const state={owner:'shared-owner',wallet:500},calls=[];
 const scope=vm.createContext({state,shared:{connected:true},sharedHydrated:true,refreshShared:options=>calls.push(options),closeSheet(){throw Error('Sample recovery must not replace the connected screen')},reconcileState(){throw Error('Sample state must not enter shared state')}});
 vm.runInContext(functionSource('function installLoadedState(saved){','\nfunction act(')+'\nthis.run=installLoadedState;',scope);scope.run({owner:'sample-owner',wallet:999999});
 assert.equal(state.owner,'shared-owner');assert.equal(state.wallet,500);assert.equal(calls.length,1);assert.equal(calls[0].initial,false);
});

test('recovery records and session drafts are isolated by the immutable signed-in owner',()=>{
 const storage=memory(),payload={rail:'lumo',recipient:{handle:'other.student'},amount:1000,idempotencyKey:'original-reference'},payment={...payload,submittedPayload:payload,submissionState:'unknown',submissionOwnerId:'owner-a',submissionAttemptId:'attempt-a'};
 assert.equal(savePaymentRecovery('owner-a',payment,storage),true);assert.equal(loadPaymentRecovery('owner-b',storage),null);
 assert.deepEqual(loadPaymentRecovery('owner-a',storage).submittedPayload,payload);
 assert.equal(savePaymentRecovery('owner-b',payment,storage),false);
 assert.equal(ownsSavedSession({mode:'shared',sharedUserId:'owner-a',draft:{payment}},{connected:true,userId:'owner-b'}),false);
 assert.equal(ownsSavedSession({mode:'shared',sharedUserId:'owner-a',draft:{payment}},{connected:true,userId:'owner-a'}),true);
 const privatePayload={...payload,password:'must-never-save'};assert.equal(savePaymentRecovery('owner-a',{...payment,submittedPayload:privatePayload},storage),false);
 clearPaymentRecovery('owner-b',storage);assert.ok(loadPaymentRecovery('owner-a',storage));clearPaymentRecovery('owner-a',storage);assert.equal(loadPaymentRecovery('owner-a',storage),null);
});

test('hydrating a different account clears its predecessor’s drafts and restores only its own recovery',()=>{
 const storage=memory(),state={owner:'owner-a'},payload={amount:1000,idempotencyKey:'a-reference'},payment={...payload,submittedPayload:payload,submissionState:'unknown',submissionOwnerId:'owner-a'};
 savePaymentRecovery('owner-a',payment,storage);
 const scope=vm.createContext({state,draft:{payment,onboarding:{name:'Private A draft'}},shared:{user:{id:'owner-b'}},sharedDraftOwner:'owner-a',sharedHydrated:true,sharedConnectionError:'',captureCurrent:()=>{},signupPassword:'transient',authorizationPin:'transient',clearOnboardingMedia(){},loadPaymentRecovery:owner=>loadPaymentRecovery(owner,storage),reconcileState(target,next){for(const key of Object.keys(target))delete target[key];Object.assign(target,next)},migrateState:value=>value,syncSharedActivation(){}});
 vm.runInContext(functionSource('function installSharedSnapshot(saved,envelope){','\nfunction syncSharedActivation(')+'\nthis.run=installSharedSnapshot;',scope);scope.run({owner:'owner-b',wallet:0},{account:{userId:'owner-b',handle:'b.student'}});
 assert.equal(scope.draft.payment,undefined);assert.equal(scope.draft.onboarding,undefined);assert.equal(scope.sharedDraftOwner,'owner-b');assert.equal(scope.signupPassword,'');assert.ok(loadPaymentRecovery('owner-a',storage));
});

test('sample persistence listeners remain dormant in connected mode and resume only for a sample',()=>{
 const listeners=new Map(),calls=[];let enabled=false;
 const target={addEventListener:(event,callback)=>listeners.set(event,callback),removeEventListener:event=>listeners.delete(event)};
 const controller={status:()=>({reason:''}),check:()=>calls.push('check'),receiveStorage:()=>calls.push('storage'),release:()=>calls.push('release')};
 const cleanup=attachPersistenceEvents(controller,{target,enabled:()=>enabled});
 listeners.get('storage')({key:'sample'});listeners.get('focus')();assert.deepEqual(calls,['release']);
 enabled=true;listeners.get('storage')({key:'sample'});listeners.get('focus')();assert.deepEqual(calls,['release','storage','check']);cleanup();assert.equal(listeners.size,0);
});

test('a failed returning-account snapshot keeps a reconnect state instead of opening new-user Welcome',async()=>{
 const calls={reconnect:0,initialised:0},shared={connected:true,signedIn:true,user:{id:'owner'},authVersion:1,account:null,partnerRequests:[],snapshot:async()=>({ok:false,unknown:true,message:'Reconnect to open your account'})};
 const scope=vm.createContext({shared,state:createEmptyState(),draft:{},route:{section:'home',page:'home'},sharedHydrated:false,sharedConnectionError:'',refreshingShared:false,overlayMeta:null,captureCurrent:null,JSON,renderSharedReconnect:()=>calls.reconnect++,persistence:{release(){}},view:{querySelector(){return null}},persistSession(){},readPaymentLink(){return null},makeRouter:()=>({initialise(){calls.initialised++}}),render(){throw Error('A failed load cannot render a fabricated account')},toast(){}});
 vm.runInContext(functionSource('async function refreshShared({initial=false}={}){','\nvoid refreshShared(')+'\nthis.run=refreshShared;',scope);await scope.run({initial:true});
 assert.equal(scope.sharedHydrated,false);assert.match(scope.sharedConnectionError,/Reconnect/);assert.equal(scope.route.section,'home');assert.equal(calls.initialised,0);assert.equal(calls.reconnect,2);
 // The actual render gate precedes both sample recovery and first-time route normalization.
 scope.renderSharedReconnect=()=>calls.reconnect++;
 vm.runInContext(functionSource('function render(options={}){','\nfunction bindRoot(')+'\nthis.renderActual=render;',scope);scope.renderActual();assert.equal(calls.reconnect,3);
});
