import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmptyState,applyAction} from '../dist/js/model.js';
import {ensureAccountState,accountLoginConfigured,handleAccountAction,exportAccountData} from '../dist/js/account-model.js';
const record={version:1,algorithm:'PBKDF2-SHA-256',iterations:210000,salt:'a'.repeat(32),verifier:'b'.repeat(64)};
const next={...record,salt:'c'.repeat(32),verifier:'d'.repeat(64)};
const now=()=>Date.parse('2026-11-05T12:00:00Z');
function fixture({configured=false}={}){
 const state=createEmptyState({name:'Ama',phone:'0240000000'});state.onboardingDone=true;state.settings.pin='2468';ensureAccountState(state);
 if(configured)state.account.login={username:'ama.student',credential:{...record}};
 return {state,act:(type,payload={})=>handleAccountAction(state,type,payload,{now})};
}
test('legacy saved accounts have no default login and PIN sign-in never succeeds',()=>{
 const {state,act}=fixture();assert.equal(accountLoginConfigured(state),false);
 act('accountSignOut');assert.equal(act('accountSignIn',{pin:'2468'}).ok,false);
 assert.equal(act('accountSignIn',{username:'ama.student',passwordProof:record.verifier}).ok,false);
 assert.equal(act('accountSetLogin',{username:'ama.student',credential:record,currentPin:'2468'}).ok,false,'Signed-out users must use recovery, not setup.');
 assert.equal(state.account.signedOut,true);
});
test('first login setup checks transaction PIN, normalises username and stores only credential fields',()=>{
 const {state,act}=fixture();
 assert.equal(act('accountSetLogin',{username:'ama.student',credential:record,currentPin:'0000'}).ok,false);
 assert.equal(act('accountSetLogin',{username:'a',credential:record,currentPin:'2468'}).ok,false);
 assert.equal(act('accountSetLogin',{username:' Ama.Student ',credential:{...record,password:'never-save-this'},currentPin:'2468'}).ok,true);
 assert.equal(state.account.login.username,'ama.student');assert.equal(state.settings.pin,'2468');assert.equal(accountLoginConfigured(state),true);
 assert.equal(JSON.stringify(state).includes('never-save-this'),false);
 const events=state.account.securityEvents.length;
 assert.equal(act('accountSetLogin',{username:'other.user',credential:next,currentPin:'2468'}).ok,false);
 assert.equal(state.account.securityEvents.length,events);
});
test('password login is independent of transaction PIN and repeated submissions do not duplicate activity',()=>{
 const {state,act}=fixture({configured:true});state.wallet=12000;state.transactions=[{id:'kept',amount:12000}];
 act('accountSignOut');const events=state.account.securityEvents.length;act('accountSignOut');assert.equal(state.account.securityEvents.length,events);
 assert.equal(act('accountSignIn',{pin:'2468'}).ok,false);
 assert.equal(act('accountSignIn',{username:'Ama.Student',passwordProof:record.verifier}).ok,true);
 const signedInEvents=state.account.securityEvents.length;
 assert.equal(act('accountSignIn',{username:'ama.student',passwordProof:record.verifier}).ok,true);
 assert.equal(state.account.securityEvents.length,signedInEvents);assert.equal(state.wallet,12000);assert.equal(state.transactions[0].id,'kept');
 assert.equal(act('accountChangePin',{currentPin:'2468',newPin:'1357',confirmPin:'1357'}).ok,true);
 act('accountSignOut');assert.equal(act('accountSignIn',{username:'ama.student',passwordProof:record.verifier}).ok,true);
 assert.equal(state.settings.pin,'1357');
});
test('password changes require the existing password and leave the transaction PIN untouched',()=>{
 const {state,act}=fixture({configured:true});
 assert.equal(act('accountChangeLogin',{username:'ama.new',credential:next,currentPasswordProof:'2468'}).ok,false);
 assert.equal(act('accountChangeLogin',{username:'ama.new',credential:next,currentPasswordProof:record.verifier}).ok,true);
 assert.equal(state.settings.pin,'2468');act('accountSignOut');
 assert.equal(act('accountSignIn',{username:'ama.student',passwordProof:record.verifier}).ok,false);
 assert.equal(act('accountSignIn',{username:'ama.new',passwordProof:next.verifier}).ok,true);
});
test('login recovery replaces only login credentials and revokes biometric access',()=>{
 const {state,act}=fixture({configured:true});state.wallet=17000;state.account.biometrics={credential:{id:'old-device'},loginEnabled:true,paymentsEnabled:true};
 act('accountSignOut');act('accountStartRecovery',{phone:'0240000000'});
 assert.equal(act('accountCompleteRecovery',{code:'123456',username:'ama.recovered',credential:next}).ok,true);
 assert.equal(state.wallet,17000);assert.equal(state.settings.pin,'2468');assert.equal(state.account.login.username,'ama.recovered');
 assert.deepEqual(state.account.biometrics,{credential:null,loginEnabled:false,paymentsEnabled:false});
 assert.equal(act('accountCompleteRecovery',{code:'123456',username:'ama.other',credential:record}).ok,false);
 assert.equal(state.account.login.username,'ama.recovered');
});
test('account exports exclude login and device verification records',()=>{
 const {state}=fixture({configured:true});state.account.biometrics={credential:{id:'private-key-id',publicKey:'private-public-record'},loginEnabled:true,paymentsEnabled:true};
 const output=JSON.stringify(exportAccountData(state));
 for(const secret of ['ama.student',record.salt,record.verifier,'private-key-id','private-public-record'])assert.equal(output.includes(secret),false);
 assert.match(output,/login credentials/);
});
test('integrated actions persist lockout failures while keeping money untouched',()=>{
 const {state}=fixture({configured:true});state.wallet=2300;applyAction(state,'accountSignOut');
 for(let i=0;i<5;i++)assert.equal(applyAction(state,'accountSignIn',{username:'ama.student',passwordProof:'e'.repeat(64)}).persistFailure,true);
 assert.equal(applyAction(state,'accountSignIn',{username:'ama.student',passwordProof:record.verifier}).ok,false);
 assert.equal(applyAction(state,'fund',{amount:1000,source:'MoMo'}).ok,false);assert.equal(state.wallet,2300);
});
test('forged biometric payloads never enable access or authorise money',()=>{
 const {state,act}=fixture({configured:true});
 assert.equal(act('accountBiometricRegister',{credential:{id:'fake',publicKey:'fake',origin:'https://fake'},proof:{verified:true},currentPasswordProof:record.verifier,loginEnabled:true,paymentsEnabled:true}).ok,false);
 assert.equal(state.account.biometrics.credential,null);
 assert.equal(act('accountBiometric',{enabled:true,method:'face'}).ok,false,'The old simulation switch cannot authorise.');
 state.account.biometrics={credential:{id:'fake'},loginEnabled:true,paymentsEnabled:true};
 act('accountSignOut');assert.equal(act('accountBiometricSignIn',{proof:'forged'}).ok,false);assert.equal(state.account.signedOut,true);
 assert.equal(act('accountSignIn',{username:'ama.student',passwordProof:record.verifier}).ok,true);
 assert.equal(act('accountBiometricVerified',{proof:'forged'}).ok,false);
 state.account.biometrics.loginEnabled=false;state.account.biometrics.paymentsEnabled=false;
 assert.equal(act('accountBiometricPreferences',{loginEnabled:true,paymentsEnabled:true,passwordProof:'2468'}).ok,false);
 assert.equal(state.account.biometrics.loginEnabled,false);assert.equal(state.account.biometrics.paymentsEnabled,false);
});
