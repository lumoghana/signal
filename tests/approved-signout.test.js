import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const appSource=await readFile(new URL('../dist/js/app.js',import.meta.url),'utf8');
const start=appSource.indexOf('async function signOut(){');
const end=appSource.indexOf('\nfunction toast(',start);
if(start<0||end<0)throw Error('The actual application signOut function could not be located.');
const signOutSource=appSource.slice(start,end);
const copy=value=>JSON.parse(JSON.stringify(value));
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve};}
function harness(){
 const logout=deferred(),calls={cleanup:0,media:[],closeSheet:0,sample:[],removed:[],routerCreated:0,routerInitialised:0,focus:0,toasts:[]};
 const originalCapture=()=>{},originalRouter={identity:'router-a'},originalCleanup=()=>{calls.cleanup++};
 const shared={connected:true,signedIn:true,authVersion:1,signOut(){this.authVersion++;this.signedIn=false;return logout.promise;},setSample(value){calls.sample.push(value);const next=value!==true;if(this.connected!==next)this.authVersion++;this.connected=next;}};
 const context=vm.createContext({
  shared,state:{owner:'account-a',wallet:1200},draft:{onboarding:{owner:'account-a'},payment:{recipient:'a-reviewed-recipient'}},route:{section:'home',page:'home',owner:'account-a'},
  signupPassword:'transient-signup-password',authorizationPin:'transient-pin',cleanup:originalCleanup,captureCurrent:originalCapture,pendingPageNavigation:false,router:originalRouter,
  act(){throw Error('The connected application must use shared sign-out.');},
  toast:message=>calls.toasts.push(message),clearOnboardingMedia:value=>calls.media.push(copy(value)),closeSheet:()=>{calls.closeSheet++},
  reconcileState(target,next){for(const key of Object.keys(target))delete target[key];Object.assign(target,copy(next));},createEmptyState:()=>({owner:null,wallet:0}),
  sessionStorage:{removeItem:key=>calls.removed.push(key)},makeRouter(){calls.routerCreated++;return {initialise(){calls.routerInitialised++}}},focusView:()=>{calls.focus++},
 });
 vm.runInContext(signOutSource+'\nthis.runSignOut=signOut;',context);
 function replaceContext(owner,{pending=false,sample=false}={}){
  shared.authVersion++;shared.signedIn=!pending&&!sample;shared.connected=!sample;
  context.state={owner,wallet:7900};context.draft={onboarding:{owner},payment:{recipient:owner+'-reviewed-recipient'}};context.route={section:sample?'welcome':'home',page:pending?'account-access':'home',owner};
  context.signupPassword=owner+'-password';context.authorizationPin=owner+'-pin';
 }
 function snapshot(){return {state:copy(context.state),draft:copy(context.draft),route:copy(context.route),signupPassword:context.signupPassword,authorizationPin:context.authorizationPin,captureCurrent:context.captureCurrent,cleanup:context.cleanup,router:context.router,pendingPageNavigation:context.pendingPageNavigation,connected:shared.connected,signedIn:shared.signedIn,authVersion:shared.authVersion};}
 function assertIntact(before){assert.deepEqual(snapshot(),before);assert.equal(calls.cleanup,0);assert.equal(calls.closeSheet,0);assert.equal(calls.routerCreated,0);assert.equal(calls.focus,0);assert.deepEqual(calls.sample,[]);assert.deepEqual(calls.removed,[]);}
 return {context,shared,calls,logout,replaceContext,snapshot,assertIntact};
}

test('old logout completion leaves a newer login-in-progress state, draft and route intact',async()=>{
 const h=harness(),operation=h.context.runSignOut();h.replaceContext('account-b',{pending:true});const before=h.snapshot();
 h.logout.resolve({ok:true});await operation;h.assertIntact(before);assert.deepEqual(h.calls.toasts,[]);
});

test('old logout completion leaves a newly signed-in account state, draft and route intact',async()=>{
 const h=harness(),operation=h.context.runSignOut();h.replaceContext('account-b');const before=h.snapshot();
 h.logout.resolve({ok:true});await operation;h.assertIntact(before);assert.deepEqual(h.calls.toasts,[]);
});

test('old connected logout completion does not replace a newly selected sample mode',async()=>{
 const h=harness(),operation=h.context.runSignOut();h.replaceContext('sample',{sample:true});const before=h.snapshot();
 h.logout.resolve({ok:true});await operation;h.assertIntact(before);assert.equal(h.shared.connected,false);
});

test('verified current-account sign-out clears private UI state and opens original account access',async()=>{
 const h=harness(),operation=h.context.runSignOut();h.logout.resolve({ok:true});await operation;
 assert.deepEqual(copy(h.context.state),{owner:null,wallet:0});assert.deepEqual(copy(h.context.draft),{});assert.deepEqual(copy(h.context.route),{section:'life',page:'account-access'});
 assert.equal(h.context.signupPassword,'');assert.equal(h.context.authorizationPin,'');assert.equal(h.context.cleanup,null);assert.equal(h.context.captureCurrent,null);assert.equal(h.context.pendingPageNavigation,true);
 assert.equal(h.calls.cleanup,1);assert.equal(h.calls.closeSheet,1);assert.equal(h.calls.routerCreated,1);assert.equal(h.calls.routerInitialised,1);assert.equal(h.calls.focus,1);
 assert.deepEqual(h.calls.media,[{owner:'account-a'}]);assert.deepEqual(h.calls.sample,[false]);assert.deepEqual(h.calls.removed,['lumo-session-v1']);assert.deepEqual(h.calls.toasts,[]);
});

test('failed sign-out preserves the current UI and shows its actual failure',async()=>{
 const h=harness(),operation=h.context.runSignOut(),before=h.snapshot();h.logout.resolve({ok:false,message:'Sign-out is not confirmed. Keep this tab open.'});await operation;
 h.assertIntact(before);assert.deepEqual(h.calls.toasts,['Sign-out is not confirmed. Keep this tab open.']);
});
