import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmptyState} from '../dist/js/model.js';
import {ensureAccountState,handleAccountAction,supportSummary,exportAccountData} from '../dist/js/account-model.js';
import {renderAccount,bindAccount} from '../dist/js/account-ui.js';
import {createOnboardingDraft} from '../dist/js/onboarding-model.js';
import {renderOnboarding,bindOnboarding,sharedSignupNeedsPassword,canKeepOnboardingPassword} from '../dist/js/onboarding.js';
import {unmatchedReceiptAmount,unmatchedReceipts} from '../dist/js/receipt-matching.js';
import {renderPaymentParity,bindPaymentParity} from '../dist/js/payments-parity-ui.js';
import {renderLife,bindLife} from '../dist/js/life.js';
const credential={version:1,algorithm:'PBKDF2-SHA-256',iterations:210000,salt:'a'.repeat(32),verifier:'b'.repeat(64)};
function fixture({fresh=false}={}){const state=createEmptyState();state.onboardingDone=!fresh;ensureAccountState(state);if(!fresh)state.account.login={username:'ama.student',credential};return {state,draft:{},connected:true};}
function report(ctx){return handleAccountAction(ctx.state,'accountSupportCreate',{title:'Receipt needs checking',body:'I would like to keep this payment reference.'});}

test('connected records, privacy and support describe shared persistence and device-clearing correctly',()=>{
 const ctx=fixture();
 const records=renderAccount(ctx,{page:'account-statements'});assert.match(records,/latest shared account snapshot/);assert.doesNotMatch(records,/financial records saved on this browser/);
 const privacy=renderAccount(ctx,{page:'account-privacy'});assert.match(privacy,/stored in your shared account/);assert.match(privacy,/does not delete your shared account records/);assert.match(privacy,/Private Ask Lux conversations are kept for this tab/);assert.match(privacy,/selfies are memory-only/);assert.doesNotMatch(privacy,/preferences are saved locally/);
 const support=renderAccount(ctx,{page:'account-support'});assert.match(support,/other signed-in devices/);assert.match(support,/No live support team has been contacted/);assert.doesNotMatch(support,/Everything stays on this device/);
 assert.match(renderLife(ctx,{page:'settings'}),/Resetting this browser does not delete your shared account/);
});

test('shared recovery is truthful even on a fresh browser and never invents sample OTP recovery',()=>{
 for(const fresh of [true,false]){
  const ctx=fixture({fresh});ctx.state.account.signedOut=true;
  const html=renderAccount(ctx,{page:'account-recovery'});
  assert.match(html,/Password recovery for shared test accounts is not available/);assert.match(html,/keep that session open/);
  assert.doesNotMatch(html,/No saved account|data-account-resume-signup|data-account-form="recovery|123456|name="phone"/);
 }
});

test('unsupported shared security capabilities are explained before collecting credentials',()=>{
 const ctx=fixture();
 for(const page of ['account-security','account-login-setup']){
  const html=renderAccount(ctx,{page});assert.match(html,/not available/);assert.doesNotMatch(html,/data-account-form="(?:login-change|login-setup|biometric-enroll|biometric-preferences)"|name="(?:password|currentPassword|confirmPassword)"/);
 }
 const security=renderAccount(ctx,{page:'account-security'});assert.match(security,/data-account-form="pin"/);assert.match(security,/name="currentPin"/);
 assert.doesNotMatch(renderAccount(ctx,{page:'account-devices'}),/Device simulation|data-account-revoke|data-account-device-add/);
});

test('existing login passwords do not inherit the stronger new-password creation minimum',()=>{
 const ctx=fixture();ctx.state.account.signedOut=true;
 const signin=renderAccount(ctx,{page:'account-access'}),password=signin.match(/<input[^>]*name="password"[^>]*>/)?.[0];assert.ok(password);assert.match(password,/minlength="1"/);assert.match(password,/current-password/);
 ctx.connected=false;ctx.state.account.signedOut=false;
 const setup=renderAccount(ctx,{page:'account-login-setup'});assert.match(setup,/<input[^>]*name="password"[^>]*minlength="10"/);
});

test('shared closure asks for the actual confirmation PIN once; sample closure retains its local PIN check',()=>{
 const ctx=fixture(),html=renderAccount(ctx,{page:'account-close'});assert.match(html,/name="confirm"/);assert.match(html,/transaction PIN is requested once/);assert.doesNotMatch(html,/name="pin"/);
 ctx.connected=false;assert.match(renderAccount(ctx,{page:'account-close'}),/name="pin"/);
});

test('connected closure forwards only the checklist confirmation to the shared authorisation path',async()=>{
 const ctx=fixture(),calls=[],error={textContent:''},submit={disabled:false};
 const form={dataset:{accountForm:'close'},isConnected:true,querySelector:s=>s==='[data-account-error]'?error:s==='button[type=submit],button:not([type])'?submit:null};
 Object.assign(ctx,{route:{section:'life',page:'account-close'},$:()=>null,$$:s=>s==='[data-account-form]'?[form]:[],actAsync(type,payload){calls.push({type,payload});return {ok:true,message:'Closed'};},toast(){},refresh(){},go(){}});
 const original=globalThis.FormData;globalThis.FormData=class{*[Symbol.iterator](){yield ['confirm','CLOSE'];yield ['pin','unused-client-pin'];}};
 const cleanup=bindAccount(ctx,ctx.route);
 try{await form.onsubmit({preventDefault(){}});assert.deepEqual(calls,[{type:'accountClose',payload:{confirm:'CLOSE'}}]);assert.equal(error.textContent,'');}
 finally{cleanup();globalThis.FormData=original;}
});

test('connected support shows shared labels, hides status simulation, and corrects only historical system copy',()=>{
 const ctx=fixture(),created=report(ctx);assert.equal(created.ok,true);created.case.updates.push({kind:'you',text:'Saved on this device. No support team has received this demo report.',at:'2026-11-13T12:00:00Z'});
 const html=renderAccount(ctx,{page:'account-support-detail',id:created.id});assert.match(html,/SHARED TEST ACCOUNT/);assert.match(html,/Saved with your shared test account/);assert.doesNotMatch(html,/Support status simulation|data-account-case-status/);
 const text=supportSummary(ctx.state,created.id,{connected:true});assert.match(text,/shared test-account support report/);assert.match(text,/No live support team has been contacted/);
 const data=exportAccountData(ctx.state,{connected:true});assert.match(data.supportCases[0].updates[0].text,/shared test account/);assert.equal(data.supportCases[0].updates[1].text,created.case.updates[1].text);
 const local=supportSummary(ctx.state,created.id);assert.match(local,/Lumo local demo support report/);assert.match(local,/saved on this device/);
});

test('resumed shared signup requires raw password reentry while live in-memory and sample credentials can be kept',()=>{
 const ctx=fixture(),draft=createOnboardingDraft();draft.login={username:'ama.student',credential};ctx.draft.onboarding=draft;ctx.hasSignupPassword=()=>false;
 assert.equal(sharedSignupNeedsPassword(ctx),true);assert.equal(canKeepOnboardingPassword(ctx),false);
 const resumed=renderOnboarding(ctx,{step:'login'});assert.match(resumed,/Enter your test password again/);assert.doesNotMatch(resumed,/Leave both password fields blank/);
 ctx.hasSignupPassword=()=>true;assert.equal(canKeepOnboardingPassword(ctx),true);assert.match(renderOnboarding(ctx,{step:'login'}),/Leave both password fields blank/);
 ctx.hasSignupPassword=()=>false;draft.preview=true;assert.equal(sharedSignupNeedsPassword(ctx),false);assert.equal(canKeepOnboardingPassword(ctx),true);
 draft.preview=false;ctx.connected=false;assert.equal(canKeepOnboardingPassword(ctx),true);
});

test('missing registration password redirects both PIN routes before later secret entry or completion',()=>{
 for(const step of ['pin','pin-confirm']){
  const ctx=fixture();ctx.draft.onboarding=createOnboardingDraft();ctx.hasSignupPassword=()=>false;ctx.$=()=>({});const routes=[];ctx.go=(...args)=>routes.push(args);
  const cleanup=bindOnboarding(ctx,{step});assert.deepEqual(routes,[[{section:'onboarding',step:'login'},{replace:true}]]);cleanup();
 }
});

const receipt=overrides=>({id:'income',type:'income',direction:'in',status:'success',amount:10000,ledgerJournalId:'journal',...overrides});
test('receipt matching subtracts both split and IOU allocations and supports partially allocated legacy IDs',()=>{
 assert.equal(unmatchedReceiptAmount(receipt({iouAllocations:[{amount:2000}],splitAllocations:[{amount:3000}]})),5000);
 assert.equal(unmatchedReceiptAmount(receipt({splitAllocations:[{amount:10000}]})),0);
 assert.equal(unmatchedReceiptAmount(receipt({iouId:'old-iou'})),0);
 assert.equal(unmatchedReceiptAmount(receipt({iouId:'partial-iou',iouAllocations:[{amount:2000}]})),8000);
 assert.equal(unmatchedReceiptAmount(receipt({iouAllocations:[{amount:7000}],splitAllocations:[{amount:4000}]})),0);
});

test('only successful incoming ledger receipts are eligible in connected mode and malformed allocations fail closed',()=>{
 const list=[receipt({id:'valid'}),receipt({id:'not-ledger',ledgerJournalId:''}),receipt({id:'pending',status:'pending'}),receipt({id:'outgoing',direction:'out'}),receipt({id:'malformed',splitAllocations:[{amount:-1}]}),receipt({id:'fractional',amount:1.5})];
 assert.deepEqual(unmatchedReceipts(list,{requireLedger:true}).map(x=>x.id),['valid']);assert.deepEqual(unmatchedReceipts(list).map(x=>x.id),['valid','not-ledger']);
});

test('connected money requests explain authoritative delivery rather than local participant simulation',()=>{
 const ctx=fixture();ctx.state.moneyRequests=[{id:'request-one',name:'Kofi',amount:5000,direction:'outgoing',status:'open',expiresAt:'2099-11-20T12:00:00Z'}];
 const html=renderPaymentParity(ctx,{page:'request-detail',id:'request-one'});assert.match(html,/Payments → Requests/);assert.match(html,/personal receiving QR does not carry this request/);assert.doesNotMatch(html,/Participant simulation|Local participant simulation/);
});

test('actual IOU picker shows only unmatched amounts including existing split allocations',async()=>{
 const ctx=fixture(),iou={id:'owed',type:'owedToMe',status:'open',name:'Kofi',amount:10000,paid:0};ctx.state.ious=[iou];ctx.state.settings.hideBalance=false;
 ctx.state.transactions=[receipt({id:'partial',merchant:'Partial receipt',splitAllocations:[{amount:7500}]}),receipt({id:'full',merchant:'Fully matched',splitAllocations:[{amount:10000}]}),receipt({id:'local',merchant:'No ledger',ledgerJournalId:''})];
 let click,markup='';const b={dataset:{action:'life-iou-settle'},addEventListener(t,fn){click=fn;}};
 const original=globalThis.document;globalThis.document={querySelector:s=>s==='#view'?{querySelectorAll:()=>[b]}:null};
 ctx.sheet=html=>{markup=html;};
 try{bindLife(ctx,{page:'iou-detail',id:iou.id});await click();assert.match(markup,/value="partial"/);assert.match(markup,/25\.00.*unmatched/);assert.doesNotMatch(markup,/value="full"|value="local"/);}
 finally{globalThis.document=original;}
});

test('IOU receipt review rejects an amount above the current unmatched receipt before calling the service',async()=>{
 const ctx=fixture(),iou={id:'owed',type:'owedToMe',status:'open',name:'Kofi',amount:10000,paid:0};ctx.state.ious=[iou];ctx.state.settings.hideBalance=false;
 ctx.state.transactions=[receipt({id:'partial',merchant:'Partial receipt',splitAllocations:[{amount:7500}]})];
 let click,calls=0;const error={textContent:''},form={},amount={value:'50.00',addEventListener(){}},close={},choice={addEventListener(){}},select={addEventListener(){}};
 const el={querySelector:s=>({'[name="settleAmount"]':amount,'[name="receiptDestination"]':choice,'[name="receiptTransaction"]':select,'[data-action="life-settlement-close"]':close,'form':form,'.life-form-error':error}[s]||null)};
 const b={dataset:{action:'life-iou-settle'},addEventListener(t,fn){click=fn;}};
 const original=globalThis.document;globalThis.document={querySelector:s=>s==='#view'?{querySelectorAll:()=>[b]}:null};
 Object.assign(ctx,{sheet(html,bind){bind(el);},actAsync(){calls++;return {ok:true};},saveDraft(){},closeSheet(){},refresh(){},toast(){}});
 try{
  bindLife(ctx,{page:'iou-detail',id:iou.id});await click();Object.assign(ctx.draft.iouSettlement,{destination:'lumo',receiptTransactionId:'partial'});
  await form.onsubmit({preventDefault(){}});assert.match(error.textContent,/25\.00 unmatched/);assert.equal(calls,0);
  amount.value='25.00';ctx.state.transactions[0].splitAllocations.push({amount:2500});await form.onsubmit({preventDefault(){}});assert.match(error.textContent,/0\.00 unmatched/);assert.equal(calls,0);
 }finally{globalThis.document=original;}
});


test('reviewing a money request cannot replace an unresolved original payment',async()=>{
 const ctx=fixture(),originalPayment={idempotencyKey:'original-uncertain-payment',submissionState:'unknown',amount:2500,recipient:{name:'Original recipient'}};ctx.draft.payment=originalPayment;
 ctx.state.moneyRequests=[{id:'incoming-request',name:'Kofi',amount:5000,direction:'incoming',status:'open',expiresAt:'2099-11-20T12:00:00Z'}];
 let clicked,guards=0;const routes=[],root={isConnected:true,addEventListener(type,fn){clicked=fn;},removeEventListener(){}};
 Object.assign(ctx,{$:()=>root,go:r=>routes.push(r),toast(){},canStartPayment(){guards++;return false;}});
 const cleanup=bindPaymentParity(ctx,{page:'request-detail',id:'incoming-request'});
 await clicked({target:{closest:()=>({dataset:{parityAction:'request-pay'}})}});
 assert.equal(guards,1);assert.equal(ctx.draft.payment,originalPayment);assert.equal(ctx.draft.payment.submissionState,'unknown');assert.deepEqual(routes,[]);cleanup();
});
