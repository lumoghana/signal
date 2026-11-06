import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState} from '../dist/js/model.js';
import {ensureAccountState} from '../dist/js/account-model.js';
import {createLoginCredential} from '../dist/js/login-credentials.js';
import {renderAccount,openBiometricAuth,bindAccountSettings,bindWelcomeAccess,bindAccount} from '../dist/js/account-ui.js';
const credential={version:1,algorithm:'PBKDF2-SHA-256',iterations:210000,salt:'a'.repeat(32),verifier:'b'.repeat(64)};
function state(){const s=createDemoState();ensureAccountState(s);s.account.login={username:'ama.student',credential:{...credential}};return s;}
function bioFixture(authenticateDevice,act=()=>({ok:true})){
 const s=state();s.account.biometrics={credential:{id:'device-one'},loginEnabled:true,paymentsEnabled:true};
 const nodes=new Map(),el={isConnected:true,querySelector(selector){if(!nodes.has(selector))nodes.set(selector,{disabled:false,textContent:''});return nodes.get(selector);}};
 let config,success=0,fallback=0,cancel=0,calls=0,closed=0;
 const ctx={state:s,route:{section:'pay',page:'review'},sheet(html,bind,options){assert.doesNotMatch(html,/Simulate a match|BIOMETRIC SIMULATION/);config=options;bind(el);},closeSheet(){closed++;},act(type,payload){calls++;assert.equal(type,'accountBiometricVerified');return act(type,payload);}};
 assert.equal(openBiometricAuth(ctx,{onSuccess:()=>success++,onFallback:()=>fallback++,onCancel:()=>cancel++,deviceAuth:{authenticateDevice}}),true);
 return {s,ctx,el,nodes,verify:()=>nodes.get('[data-biometric-verify]').onclick(),pin:()=>nodes.get('[data-biometric-pin]').onclick(),cancel:()=>config.onClose(),counts:()=>({success,fallback,cancel,calls,closed})};
}
test('sign-in asks for username/password and keeps the transaction PIN out of its form',()=>{
 const s=state();s.account.signedOut=true;let html=renderAccount({state:s,draft:{}},{page:'account-access'});
 assert.match(html,/name="username"/);assert.match(html,/name="password"/);assert.doesNotMatch(html,/name="pin"/);assert.match(html,/Welcome,<br>Ama/);assert.match(html,/@ama.student/);assert.match(html,/Not Ama\?/);assert.doesNotMatch(html,/data-account-biometric-login/);
 s.account.biometrics={credential:{id:'one'},loginEnabled:true,paymentsEnabled:false};html=renderAccount({state:s,draft:{}},{page:'account-access'});assert.match(html,/data-account-biometric-login/);
 s.account.biometrics.loginEnabled=false;assert.doesNotMatch(renderAccount({state:s,draft:{}},{page:'account-access'}),/data-account-biometric-login/);
});
test('setup and recovery clearly distinguish login password from authorisation PIN',()=>{
 const s=state();delete s.account.login;const ctx={state:s,draft:{}};
 const setup=renderAccount(ctx,{page:'account-login-setup'});assert.match(setup,/data-account-form="login-setup"/);assert.match(setup,/name="currentPin"/);assert.match(setup,/name="confirmPassword"/);
 s.account.signedOut=true;assert.doesNotMatch(renderAccount(ctx,{page:'account-login-setup'}),/data-account-form="login-setup"/);
 s.account.recovery={status:'code-sent'};const recovery=renderAccount(ctx,{page:'account-recovery'});assert.match(recovery,/name="password"/);assert.match(recovery,/name="username"/);assert.doesNotMatch(recovery,/name="(?:newPin|confirmPin)"/);assert.match(recovery,/transaction PIN and money stay/);
});
test('security has independent login/payment biometric choices and PIN backup',()=>{
 const s=state(),html=renderAccount({state:s,draft:{}},{page:'account-security'});
 assert.match(html,/name="loginEnabled"/);assert.match(html,/name="paymentsEnabled"/);assert.match(html,/Password is your backup/);assert.match(html,/Transaction PIN is your backup/);assert.match(html,/Activate phone biometrics/);assert.doesNotMatch(html,/Simulate a match|Demo method/);
});
test('legacy signout delegates immediately without forcing login setup',()=>{
 const s=state();delete s.account.login;const b={};let signed=0,navigated=0;
 bindAccountSettings({state:s,$$:selector=>selector==='[data-account-signout]'?[b]:[],signOut:()=>signed++,go:()=>navigated++});b.onclick();assert.equal(signed,1);assert.equal(navigated,0);
});
test('cancelled native check offers PIN backup without approving',async()=>{
 const f=bioFixture(async()=>({ok:false,code:'cancelled',message:'Verification cancelled.'}));await f.verify();assert.deepEqual(f.counts(),{success:0,fallback:0,cancel:0,calls:0,closed:0});assert.match(f.nodes.get('[data-biometric-error]').textContent,/cancelled/);f.pin();assert.equal(f.counts().fallback,1);assert.equal(f.counts().success,0);
});
test('a verified device must also pass model proof verification, and repeated taps approve once',async()=>{
 const f=bioFixture(async()=>({ok:true,proof:'opaque-proof'}));await f.verify();await f.verify();assert.equal(f.counts().success,1);assert.equal(f.counts().calls,1);
 const rejected=bioFixture(async()=>({ok:true,proof:'bad-proof'}),()=>({ok:false,message:'Expired verification.'}));await rejected.verify();assert.equal(rejected.counts().success,0);assert.match(rejected.nodes.get('[data-biometric-error]').textContent,/Expired/);
});
test('closing or falling back while native verification is pending ignores late success',async()=>{
 let finish;const pending=new Promise(resolve=>finish=resolve),f=bioFixture(()=>pending);const work=f.verify();f.cancel();finish({ok:true,proof:'late'});await work;assert.equal(f.counts().success,0);assert.equal(f.counts().calls,0);assert.equal(f.counts().cancel,1);
 let finish2;const pending2=new Promise(resolve=>finish2=resolve),fallback=bioFixture(()=>pending2);const work2=fallback.verify();fallback.pin();finish2({ok:true,proof:'late'});await work2;assert.equal(fallback.counts().success,0);assert.equal(fallback.counts().calls,0);assert.equal(fallback.counts().fallback,1);
});
test('route changes, signout and removed enrollment invalidate an in-flight approval',async()=>{
 for(const change of [f=>f.ctx.route={section:'home',page:'home'},f=>f.s.account.signedOut=true,f=>f.s.account.biometrics.paymentsEnabled=false,f=>f.s.account.biometrics.credential={id:'different'}]){
  let finish;const pending=new Promise(resolve=>finish=resolve),f=bioFixture(()=>pending),work=f.verify();change(f);finish({ok:true,proof:'late'});await work;assert.equal(f.counts().success,0);assert.equal(f.counts().calls,0);
 }
});

const flush=()=>new Promise(resolve=>setImmediate(resolve));
function welcomeFixture({probe=async()=>({available:true}),enrolled=true}={}){
 const s=state(),saved=JSON.stringify(s);let aborts=0;
 const make=extra=>({hidden:false,disabled:false,value:'',textContent:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},click(){this.listeners.click?.();},focus(){this.focused=true;},...extra});
 const password=make({value:'not-persisted'}),username=make({value:'ama.student'}),remembered=make({value:'ama.student'}),note=make({hidden:true}),greeting=make({textContent:'Welcome, Ama.'}),row=make(),usernameGroup=make({hidden:true,querySelector:()=>username}),returnBio=make({hidden:true}),status=make(),native=make({hidden:true}),usePassword=make(),switchUser=make();
 const form=make({hidden:enrolled,querySelector:selector=>selector==='[name="password"]'?password:null});
 const choice=enrolled?make():null;
 const queries={'[data-account-form="signin"]':form,'[data-auth-biometric-choice]':choice,'[data-account-biometric-login]':enrolled?native:null,'[data-auth-check-status]':status,'[data-auth-use-biometrics]':returnBio,'[data-auth-use-password]':usePassword,'[data-auth-switch-user]':switchUser,'[data-auth-greeting]':greeting,'[data-auth-remembered-row]':row,'[data-auth-username-field]':usernameGroup,'[data-auth-remembered-username]':remembered,'[data-auth-username-field] [name="username"]':username,'[data-auth-local-account-note]':note};
 const root=make({dataset:{authMode:enrolled?'checking':'password',authRemembered:'true'},querySelector:selector=>queries[selector]||null,querySelectorAll:()=>[password]});
 const api=bindWelcomeAccess({state:s,$:selector=>selector==='[data-auth-access]'?root:null},{probe,onMethodChange:()=>aborts++});
 return {s,saved,api,root,form,choice,native,usePassword,switchUser,password,username,remembered,note,greeting,row,returnBio,get aborts(){return aborts;}};
}
test('remembered biometrics become primary only after an available-device check',async()=>{
 const f=welcomeFixture();assert.equal(f.form.hidden,true);assert.equal(f.native.hidden,true);await flush();assert.equal(f.root.dataset.authMode,'biometric');assert.equal(f.native.hidden,false);assert.equal(f.form.hidden,true);assert.equal(f.password.value,'');
 f.usePassword.click();assert.equal(f.root.dataset.authMode,'password');assert.equal(f.form.hidden,false);assert.equal(f.choice.hidden,true);assert.equal(f.returnBio.hidden,false);assert.equal(f.password.focused,true);
});
test('unavailable and failed support probes always expose working password entry',async()=>{
 for(const probe of [async()=>({available:false,reason:'No device authenticator'}),async()=>{throw Error('Not supported');}]){
  const f=welcomeFixture({probe});await flush();assert.equal(f.root.dataset.authMode,'password');assert.equal(f.form.hidden,false);assert.equal(f.choice.hidden,true);assert.equal(f.returnBio.hidden,true);
 }
});
test('choosing password before the support check completes is respected',async()=>{
 let finish;const f=welcomeFixture({probe:()=>new Promise(resolve=>finish=resolve)});f.usePassword.click();await flush();finish({available:true});await flush();assert.equal(f.root.dataset.authMode,'password');assert.equal(f.form.hidden,false);assert.equal(f.choice.hidden,true);assert.equal(f.returnBio.hidden,false);
});
test('Not you clears only transient identity fields and leaves saved money and enrollment untouched',async()=>{
 const f=welcomeFixture();await flush();f.password.value='private-temporary';f.switchUser.click();assert.equal(f.root.dataset.authRemembered,'false');assert.equal(f.greeting.textContent,'Welcome back.');assert.equal(f.row.hidden,true);assert.equal(f.form.hidden,false);assert.equal(f.username.value,'');assert.equal(f.password.value,'');assert.equal(f.username.disabled,false);assert.equal(f.remembered.disabled,true);assert.equal(f.note.hidden,false);assert.equal(f.returnBio.hidden,true);assert.ok(f.aborts>0);assert.equal(JSON.stringify(f.s),f.saved);
});
test('a support result arriving after cleanup cannot change the disposed screen',async()=>{
 let finish;const f=welcomeFixture({probe:()=>new Promise(resolve=>finish=resolve)});await flush();f.api.cleanup();finish({available:true});await flush();assert.equal(f.root.dataset.authMode,'checking');assert.equal(f.native.hidden,true);assert.equal(f.password.value,'');f.switchUser.click();assert.equal(f.root.dataset.authRemembered,'true');
});

test('switching remembered identity while password hashing is pending cannot sign in with the old credentials',async()=>{
 const f=welcomeFixture({enrolled:false});f.s.account.login.credential=await createLoginCredential('A-test-password-42');f.password.value='A-test-password-42';
 const submit={disabled:false},error={textContent:''};f.form.dataset={accountForm:'signin'};f.form.isConnected=true;
 f.form.querySelector=selector=>selector==='[name="password"]'?f.password:selector==='[data-account-error]'?error:selector==='button[type=submit],button:not([type])'?submit:null;
 let signins=0;const ctx={state:f.s,draft:{},route:{section:'life',page:'account-access'},$:selector=>selector==='[data-auth-access]'?f.root:selector==='[data-account-error]'?error:null,$$:selector=>selector==='[data-account-form]'?[f.form]:[],act(){signins++;return {ok:true};},go(){},toast(){},refresh(){}};
 const oldFormData=globalThis.FormData;globalThis.FormData=class{constructor(){this.values=[['username','ama.student'],['password',f.password.value]];}[Symbol.iterator](){return this.values[Symbol.iterator]();}};
 let cleanup;
 try{cleanup=bindAccount(ctx,ctx.route);const pending=f.form.onsubmit({preventDefault(){}});assert.equal(submit.disabled,true);f.switchUser.click();await pending;assert.equal(signins,0);assert.equal(submit.disabled,false);assert.equal(f.username.value,'');assert.equal(error.textContent,'');}
 finally{globalThis.FormData=oldFormData;cleanup?.();}
});

test('login setup and recovery forms without a welcome root still submit normally',async()=>{
 for(const kind of ['login-setup','recovery-start']){
  const s=state();delete s.account.login;const submit={disabled:false},error={textContent:''};
  const form={dataset:{accountForm:kind},isConnected:true,querySelector:selector=>selector==='[data-account-error]'?error:selector==='button[type=submit],button:not([type])'?submit:null};
  const calls=[];const ctx={state:s,draft:{},route:{section:'life',page:kind==='login-setup'?'account-login-setup':'account-recovery'},$:selector=>selector==='[data-account-error]'?error:null,$$:selector=>selector==='[data-account-form]'?[form]:[],act(type,payload){calls.push({type,payload});return {ok:true,message:'Saved'};},go(){},toast(){},refresh(){}};
  const values=kind==='login-setup'?[['username','ama.student'],['password','A-test-password-42'],['confirmPassword','A-test-password-42'],['currentPin','1234']]:[['phone','0240000000']];
  const oldFormData=globalThis.FormData;globalThis.FormData=class{[Symbol.iterator](){return values[Symbol.iterator]();}};let cleanup;
  try{cleanup=bindAccount(ctx,ctx.route);await form.onsubmit({preventDefault(){}});assert.equal(calls.length,1);assert.equal(calls[0].type,kind==='login-setup'?'accountSetLogin':'accountStartRecovery');assert.equal(submit.disabled,false);assert.equal(error.textContent,'');if(kind==='login-setup'){assert.ok(calls[0].payload.credential.verifier);assert.equal(calls[0].payload.password,undefined);}}
  finally{globalThis.FormData=oldFormData;cleanup?.();}
 }
});
