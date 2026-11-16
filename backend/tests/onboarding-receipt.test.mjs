import test from 'node:test';
import assert from 'node:assert/strict';
import {onboardingReceipt} from '../supabase/functions/lumo-approved/onboarding-receipt.mjs';
import {buildState} from '../supabase/functions/lumo-approved/engine.mjs';
import {getSummary} from '../supabase/functions/lumo-approved/domain/model.js';
import {createApprovedHandler} from '../supabase/functions/lumo-approved/handler.mjs';
import {buildState as buildMaintenanceState} from '../supabase/functions/lumo-maintenance/approved/engine.mjs';
const now=Date.now(),at=new Date(now).toISOString();
const receipt=()=>({termsAcceptance:{version:'2026-11-08.1',acceptedAt:at},verification:{mode:'simulation',capture:'live-camera',status:'complete',method:'ghana-card-number',liveness:'guided-camera',sampleIdentity:true,detailsConfirmed:true,completedAt:at}});
const snapshot={account:{id:'11111111-1111-4111-8111-111111111111',userId:'22222222-2222-4222-8222-222222222222',displayName:'Fixture',balance:5000},state:null,receipts:[],groups:[],boxes:[],requests:[],partners:[]};
test('a new unfunded-plan account can plan incoming GH₵50 without an unchosen buffer',()=>{
 const state=buildState(snapshot);assert.equal(state.buffer,0);assert.equal(getSummary(state).spendable,5000);
 const metadataState=buildMaintenanceState(snapshot);assert.equal(metadataState.buffer,0);assert.equal(getSummary(metadataState).spendable,5000);
 state.buffer=1200;const reloaded=buildState({...snapshot,state});assert.equal(reloaded.buffer,1200);assert.equal(getSummary(reloaded).spendable,3800);
});
test('server-received acceptance and simulated verification survive fresh and stored snapshots',()=>{
 const onboarding={...onboardingReceipt(receipt(),now),receivedAt:at};
 const first=buildState({...snapshot,onboarding});assert.deepEqual(first.termsAcceptance,onboarding.termsAcceptance);assert.deepEqual(first.verification,onboarding.verification);assert.equal(first.setupReceiptAt,at);
 const metadataFirst=buildMaintenanceState({...snapshot,onboarding});assert.deepEqual(metadataFirst.termsAcceptance,onboarding.termsAcceptance);assert.deepEqual(metadataFirst.verification,onboarding.verification);assert.equal(metadataFirst.wallet,5000);
 const reloaded=buildState({...snapshot,state:first,onboarding});assert.deepEqual(reloaded.termsAcceptance,first.termsAcceptance);assert.equal(reloaded.wallet,5000);
 assert.equal(buildState(snapshot).termsAcceptance,undefined);
});
test('receipt rejects stale or invented verification, unknown terms and uploaded private evidence',()=>{
 assert.equal(onboardingReceipt(undefined,now),undefined);
 for(const change of [x=>x.termsAcceptance.version='old',x=>x.termsAcceptance.acceptedAt='invalid',x=>x.termsAcceptance.acceptedAt=new Date(now+301000).toISOString(),x=>x.verification.completedAt=new Date(now-86401000).toISOString(),x=>x.verification.mode='live',x=>x.verification.sampleIdentity=false,x=>x.verification.detailsConfirmed=false,x=>x.verification.photos=['secret'],x=>x.legalName='Private name',x=>x.receivedAt=at]){const value=receipt();change(value);assert.throws(()=>onboardingReceipt(value,now),e=>e.code==='INVALID_INPUT');}
});
test('connected signup forwards only checked receipt and reload renders persisted evidence',async()=>{
 const userId=snapshot.account.userId,sid='33333333-3333-4333-8333-333333333333',token='header.'+Buffer.from(JSON.stringify({sub:userId,session_id:sid})).toString('base64url')+'.signature',calls=[];let saved;
 const json=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
 const handler=createApprovedHandler({supabaseUrl:'https://signup.example',serviceRoleKey:'synthetic-only',fetch:async(url,init)=>{
  const path=new URL(url).pathname,body=init.body?JSON.parse(init.body):null;calls.push({path,body});
  if(path==='/auth/v1/user')return json({id:userId,app_metadata:{lumo_pilot:true}});
  if(path==='/auth/v1/admin/users')return json({id:userId});
  if(path==='/auth/v1/token')return json({access_token:token,refresh_token:'synthetic-refresh'});
  if(path==='/rest/v1/rpc/lumo_pilot_bootstrap')return json({ok:true,registrationId:sid,mode:'new'});
  if(path==='/rest/v1/rpc/lumo_approved_service'){
   if(body.p_command==='provision')saved={...body.p_payload.onboarding,receivedAt:at};
   return json({...snapshot,ok:true,onboarding:saved});
  }
  throw Error('Unexpected synthetic signup route');
 }});
 const call=async body=>(await handler(new Request('https://signup.example/gateway',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)}))).json();
 const signup=await call({action:'register',handle:'review.fixture',displayName:'Fixture',phone:'0241000001',password:'SyntheticOnlyPassword',pin:'1234',onboarding:receipt()});
 assert.equal(signup.ok,true);assert.equal(signup.state.buffer,0);assert.equal(signup.state.termsAcceptance.version,'2026-11-08.1');
 const provision=calls.find(c=>c.body?.p_command==='provision');assert.deepEqual(provision.body.p_payload.onboarding,onboardingReceipt(receipt()));
 const reload=await call({action:'snapshot'});assert.equal(reload.state.setupReceiptAt,at);assert.deepEqual(reload.state.verification,receipt().verification);
 const bad=receipt();bad.verification.photos=['private'];const before=calls.length;
 const rejected=await call({action:'register',handle:'review.bad',displayName:'Fixture',phone:'0241000001',password:'SyntheticOnlyPassword',pin:'1234',onboarding:bad});
 assert.equal(rejected.code,'INVALID_INPUT');assert.equal(calls.length,before,'private media is rejected before creating any upstream identity');
});
