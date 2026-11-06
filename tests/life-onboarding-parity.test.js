import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, createDemoState, getSummary, applyAction, loadState, saveState } from '../dist/js/model.js';
import { createActivationDraft, fundActivation, addActivationBudgetItem, saveActivationBudget } from '../dist/js/activation-model.js';
import { createOnboardingDraft, completeOnboardingStep, updateOnboardingField, attemptOnboardingCode, resendOnboardingCode, expireOnboardingCode, demoCodeError, LIVENESS_PROMPTS, recordSelfieCapture, beginIdentityVerification, resolveIdentityVerification, checkPendingIdentityVerification, confirmIdentityDetails, persistableOnboardingDraft, normalizeOnboardingDraft } from '../dist/js/onboarding-model.js';
import { renderIdentityVerification, renderOnboarding } from '../dist/js/onboarding.js';
import { renderLife } from '../dist/js/life.js';
const ok = r => { assert.equal(r.ok,true,r.message); return r; };
function codeReady(){const d=createOnboardingDraft();updateOnboardingField(d,'name','Ama');ok(completeOnboardingStep(d,'name'));ok(completeOnboardingStep(d,'phone'));return d;}
function faceReady(){const d=codeReady();updateOnboardingField(d,'code','123456');ok(completeOnboardingStep(d,'code'));updateOnboardingField(d,'ghanaCardNumber','GHA-000000000-0');ok(completeOnboardingStep(d,'card-number'));updateOnboardingField(d,'consent',true);LIVENESS_PROMPTS.forEach(p=>ok(recordSelfieCapture(d,p)));return d;}
function ctx(state=createDemoState()){return {state,draft:{},route:{section:'life'},$:()=>null};}

test('first signup budget duration controls daily guide and never invents income',()=>{
  const s=createEmptyState();s.onboardingDone=true;s.buffer=0;
  const d=createActivationDraft({state:s});ok(fundActivation(d,{amount:10000,source:'Mobile money'}));ok(addActivationBudgetItem(d,{name:'Food',amount:3000}));
  const expectedDate=d.state.income.nextDate;const due=new Date(Date.now()+30*86400000).toISOString().slice(0,10);ok(saveActivationBudget(d,{due}));
  assert.equal(d.state.income.nextDate,expectedDate);assert.equal(d.state.budget.endDate,due);assert.equal(d.state.income.amount,0);assert.equal(getSummary(d.state).daysLeft,30);assert.equal(getSummary(d.state).dailyAllowance,233);assert.equal(d.state.wallet,10000);
});
test('expired OTP cannot verify or unlock identity and requires a fresh request',()=>{
  const d=codeReady();updateOnboardingField(d,'code','123456');ok(expireOnboardingCode(d));
  assert.match(attemptOnboardingCode(d).message,/expired/);assert.equal(completeOnboardingStep(d,'code').ok,false);assert.equal(d.phoneVerified,false);
  ok(resendOnboardingCode(d));assert.equal(d.code,'');updateOnboardingField(d,'code','123456');ok(attemptOnboardingCode(d));ok(completeOnboardingStep(d,'code'));
  assert.equal(d.phoneVerified,true);
});
test('five incorrect attempts lock OTP and resending cannot bypass the lock',()=>{
  const d=codeReady();updateOnboardingField(d,'code','000000');const now=Date.now();
  for(let i=0;i<5;i++)assert.equal(attemptOnboardingCode(d,{now}).ok,false);
  assert.equal(d.otp.attempts,5);updateOnboardingField(d,'code','123456');assert.equal(attemptOnboardingCode(d,{now}).ok,false);assert.equal(resendOnboardingCode(d,{now}).ok,false);
  assert.equal(d.phoneVerified,false);ok(resendOnboardingCode(d,{now:now+61000}));assert.equal(d.otp.attempts,0);assert.equal(d.otp.lockedUntil,0);
});
test('OTP resend cooldown does not change the active code generation',()=>{
  const d=codeReady(),before=JSON.stringify(d);assert.equal(resendOnboardingCode(d).ok,false);assert.equal(JSON.stringify(d),before);
  const next=d.otp.issuedAt+31000;ok(resendOnboardingCode(d,{now:next}));assert.equal(d.otp.issuedAt,next);assert.equal(d.otp.phone,'0240000000');
});
test('verified number remains verified when its earlier code expires',()=>{
  const d=codeReady();updateOnboardingField(d,'code','123456');ok(attemptOnboardingCode(d));ok(completeOnboardingStep(d,'code'));
  d.otp.expiresAt=Date.now()-1;assert.equal(demoCodeError(d),'');assert.equal(normalizeOnboardingDraft(d).phoneVerified,true);
  updateOnboardingField(d,'phone','020 000 0000');assert.equal(d.phoneVerified,false);assert.equal(d.otp.expiresAt,0);
});
test('pending verification stays blocked on status check until explicit confirmed simulation',()=>{
  const d=faceReady(),{attemptId}=ok(beginIdentityVerification(d));ok(resolveIdentityVerification(d,{outcome:'pending',attemptId}));
  assert.equal(d.verificationStatus,'pending');assert.equal(confirmIdentityDetails(d).ok,false);assert.equal(completeOnboardingStep(d,'selfie').ok,false);
  ok(checkPendingIdentityVerification(d));assert.equal(d.verificationStatus,'pending');assert.equal(d.verificationRecord,null);
  ok(checkPendingIdentityVerification(d,{outcome:'success'}));assert.equal(d.verificationStatus,'success');ok(completeOnboardingStep(d,'selfie'));ok(confirmIdentityDetails(d));
  assert.equal(checkPendingIdentityVerification(d,{outcome:'success'}).ok,false);
});
test('attention and already-linked results cannot create an identity proof',()=>{
  for(const outcome of ['attention','already-linked']){const d=faceReady(),{attemptId}=ok(beginIdentityVerification(d));ok(resolveIdentityVerification(d,{outcome,attemptId}));assert.equal(d.verificationRecord,null);assert.equal(confirmIdentityDetails(d).ok,false);assert.equal(completeOnboardingStep(d,'selfie').ok,false);assert.match(renderIdentityVerification(d),/DEMO VERIFICATION/);}
});
test('changing number invalidates a pending result instead of accepting a late check',()=>{
  const d=faceReady(),{attemptId}=ok(beginIdentityVerification(d));ok(resolveIdentityVerification(d,{outcome:'pending',attemptId}));updateOnboardingField(d,'ghanaCardNumber','GHA-123456789-1');
  assert.equal(checkPendingIdentityVerification(d,{outcome:'success'}).ok,false);assert.equal(d.verificationRecord,null);
});
test('pending identity and all raw identifiers are excluded from saved signup',()=>{
  const d=faceReady(),{attemptId}=ok(beginIdentityVerification(d));ok(resolveIdentityVerification(d,{outcome:'pending',attemptId}));const saved=persistableOnboardingDraft(d);
  assert.equal(saved.ghanaCardNumber,'');assert.equal(saved.capturedNumber,'');assert.equal(saved.verificationRecord,null);assert.equal(saved.verificationStatus,'idle');assert.equal(saved.selfieCaptured,false);
});
test('code page offers clear simulation, expiry and resend without adding setup pages',()=>{
  const d=codeReady(),c=ctx();c.draft.onboarding=d;
  const html=renderOnboarding(c,{step:'code'});assert.match(html,/Valid for five minutes/);assert.match(html,/Resend code/);assert.match(html,/Expire this code/);assert.match(html,/123456/);
});
test('IOU budget link is available only for a liability and carries the selected item',()=>{
  const c=ctx();c.draft.iouCreate={type:'owedByMe',name:'Kofi',amount:3000,due:'2026-12-01',note:'Prints',step:3,budgetItemId:c.state.budget.items[0].id};
  const html=renderLife(c,{page:'iou-create',step:3});assert.match(html,/Already included in your plan/);assert.match(html,/Count|counts it once/);assert.match(html,/selected/);
  c.draft.iouCreate.type='owedToMe';assert.doesNotMatch(renderLife(c,{page:'iou-create',step:3}),/name="iouBudgetItem"/);
});
test('outside-money history remains reachable after its final balance is removed',()=>{
  const c=ctx();c.state.externalBalances=[];c.state.externalBalanceHistory=[{id:'h1',externalBalanceId:'cash1',type:'removed',at:new Date().toISOString(),before:{name:'Cash',balance:4000}}];
  assert.match(renderLife(c,{page:'overview'}),/Balance change history/);assert.equal(c.state.externalBalances.length,0);
});
test('recovery previews protect costs by default and do not mutate money or expected income',()=>{
  const c=ctx(),before=JSON.stringify(c.state);c.draft.recovery={days:7,checkInDate:'2026-12-01',adjustments:{}};
  const html=renderLife(c,{page:'recovery',step:1});assert.match(html,/Every cost starts protected/);assert.match(html,/Automatic saving pauses/);assert.equal(JSON.stringify(c.state),before);
});
test('active recovery shows a progress dashboard instead of restarting setup',()=>{
  const c=ctx();c.state.recovery={active:true,startedAt:new Date().toISOString(),checkInDate:'2026-12-01',days:7,pauseSavings:true};
  const html=renderLife(c,{page:'recovery',step:0});assert.match(html,/YOUR RECOVERY PLAN/);assert.match(html,/Review &amp; finish|Review & finish/);assert.match(html,/Money arrived/);assert.doesNotMatch(html,/How many more days/);
});
test('Money Story counts card spend net of refunds while ignoring card funding',()=>{
  const c=ctx();c.state.settings.hideBalance=false;c.state.transactions=[{id:'p',type:'card-purchase',direction:'out',status:'success',amount:10000,refunded:3000,category:'Study'},{id:'r',type:'card-refund',direction:'in',status:'success',amount:3000,category:'Study'},{id:'f',type:'card-transfer',direction:'out',status:'success',amount:20000,category:'Transfers'}];
  const html=renderLife(c,{page:'story'});assert.match(html,/70\.00/);assert.doesNotMatch(html,/200\.00/);assert.match(html,/Study/);
});

test('OTP failure and lock counters survive saved signup while private identity does not',()=>{
  const d=codeReady();updateOnboardingField(d,'code','000000');
  for(let i=0;i<5;i++)assert.equal(attemptOnboardingCode(d).ok,false);
  const resumed=normalizeOnboardingDraft(JSON.parse(JSON.stringify(persistableOnboardingDraft(d))));
  assert.equal(resumed.otp.attempts,5);assert.equal(resumed.otp.lockedUntil,d.otp.lockedUntil);assert.equal(resumed.phoneVerified,false);
  updateOnboardingField(resumed,'code','123456');assert.equal(attemptOnboardingCode(resumed).ok,false);assert.equal(resendOnboardingCode(resumed).ok,false);
});
test('complete recovery journey preserves expected date, pauses savings, reviews confirmed income and resumes safely',()=>{
  const s=createEmptyState();s.onboardingDone=true;s.wallet=30000;s.buffer=1000;s.income.amount=100000;
  const incomeDate=s.income.nextDate, checkInDate=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  ok(applyAction(s,'createBudget',{items:[{id:'food',name:'Food',amount:10000,spent:0},{id:'fun',name:'Fun',amount:5000,spent:0}]}));
  const box=ok(applyAction(s,'createBox',{name:'Laptop',target:100000,hack:{type:'fixed',value:1000}})).box;
  ok(applyAction(s,'recoveryPlan',{checkInDate,days:7,reduceCategories:[{id:'fun',amount:2000}]}));
  assert.equal(s.income.nextDate,incomeDate);assert.equal(s.income.amount,100000);assert.equal(getSummary(s).daysLeft,7);assert.equal(s.budget.items.find(i=>i.id==='food').amount,10000);assert.equal(s.budget.items.find(i=>i.id==='fun').amount,2000);
  const priorBox=box.balance;ok(applyAction(s,'payment',{merchant:'Lunch',amount:500,rail:'lumo',category:'Food'}));assert.equal(box.balance,priorBox,'recovery must pause automatic saving even when there is room');
  const arrival=ok(applyAction(s,'fund',{amount:5000,source:'Mobile money',rail:'momo'}));const wallet=s.wallet;
  ok(applyAction(s,'reviewRecoveryIncome',{transactionId:arrival.id}));assert.equal(s.wallet,wallet,'review never credits the arrival a second time');
  ok(applyAction(s,'completeRecovery',{idempotencyKey:'finish-recovery-test'}));assert.equal(s.recovery.active,false);assert.equal(s.income.nextDate,incomeDate);
  ok(applyAction(s,'payment',{merchant:'Lunch',amount:500,rail:'lumo',category:'Food'}));assert.equal(box.balance,priorBox+1000,'saving resumes only on the next legitimate trigger');
  const latest=s.wallet;ok(applyAction(s,'completeRecovery',{idempotencyKey:'finish-recovery-test'}));assert.equal(s.wallet,latest);
});
test('a small confirmed arrival cannot silently complete a recovery that still has a gap',()=>{
  const s=createEmptyState();s.onboardingDone=true;s.wallet=0;s.buffer=1000;
  ok(applyAction(s,'createBudget',{items:[{id:'fees',name:'Fees',amount:10000,spent:0}]}));
  ok(applyAction(s,'recoveryPlan',{checkInDate:new Date(Date.now()+7*86400000).toISOString().slice(0,10),days:7}));
  const arrival=ok(applyAction(s,'fund',{amount:100,source:'Mobile money',rail:'momo'}));ok(applyAction(s,'reviewRecoveryIncome',{transactionId:arrival.id}));
  assert.equal(applyAction(s,'completeRecovery',{}).ok,false);assert.equal(s.recovery.active,true);assert.equal(s.wallet,100);
  assert.equal(s.budget.items[0].amount,10000);assert.equal(s.buffer,1000);
});
test('multiple IOUs consume linked budget coverage once and money owed to you stays expected',()=>{
  const s=createEmptyState();s.onboardingDone=true;s.wallet=30000;s.buffer=0;
  ok(applyAction(s,'createBudget',{items:[{id:'print',name:'Printing',amount:10000,spent:0}]}));
  const due=new Date().toISOString().slice(0,10);
  for(const name of ['Kofi','Esi'])ok(applyAction(s,'createIOU',{name,type:'owedByMe',amount:8000,due,budgetItemId:'print'}));
  assert.equal(getSummary(s).planned,16000);const available=getSummary(s).available;
  ok(applyAction(s,'createIOU',{name:'Kwame',type:'owedToMe',amount:20000,due}));
  assert.equal(getSummary(s).planned,16000);assert.equal(getSummary(s).available,available);assert.equal(getSummary(s).expected,20000);
});
test('recovery and linked IOUs survive a real model save-load without inventing balances',()=>{
  const previous=globalThis.localStorage,values=new Map();globalThis.localStorage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  try{const s=createEmptyState();s.onboardingDone=true;s.wallet=30000;s.buffer=0;const incomeDate=s.income.nextDate;
    ok(applyAction(s,'createBudget',{items:[{id:'fees',name:'Fees',amount:10000,spent:0}]}));ok(applyAction(s,'createIOU',{name:'Kofi',type:'owedByMe',amount:5000,due:new Date().toISOString().slice(0,10),budgetItemId:'fees'}));
    ok(applyAction(s,'recoveryPlan',{checkInDate:new Date(Date.now()+7*86400000).toISOString().slice(0,10),days:7}));assert.equal(saveState(s),true);const restored=loadState();
    assert.equal(restored.wallet,30000);assert.equal(restored.ious[0].budgetItemId,'fees');assert.equal(getSummary(restored).planned,10000);assert.equal(restored.recovery.active,true);assert.equal(restored.income.nextDate,incomeDate);assert.equal(getSummary(restored).daysLeft,7);
  }finally{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});
