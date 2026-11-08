import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState,createEmptyState,applyAction,getSummary,validStoredState,migrateState} from '../dist/js/model.js';
import {createPersistence} from '../dist/js/persistence.js';
import {commitAction} from '../dist/js/state-boundary.js';
import {getMonthlyInsights} from '../dist/js/insights.js';
const apply=(s,type,p={})=>{const result=applyAction(s,type,p);assert.equal(result.ok,true,result.message);return result;};
test('account access guards financial handlers and retained records survive sign-out and closure',()=>{
 const s=createDemoState(),before=s.wallet,ledger=structuredClone(s.transactions);
 s.account.login={username:'ama.student',credential:{version:1,algorithm:'PBKDF2-SHA-256',iterations:210000,salt:'a'.repeat(32),verifier:'b'.repeat(64)}};
 apply(s,'accountSignOut');assert.equal(applyAction(s,'fund',{amount:1000,source:'MoMo'}).ok,false);assert.equal(applyAction(s,'createDemoVirtualCard').ok,false);
 apply(s,'accountSignIn',{username:'ama.student',passwordProof:'b'.repeat(64)});assert.equal(s.wallet,before);assert.deepEqual(s.transactions,ledger);
 const empty=createEmptyState();empty.onboardingDone=true;apply(empty,'accountClose',{confirm:'CLOSE',pin:'1234'});
 assert.equal(applyAction(empty,'fund',{amount:1000,source:'MoMo'}).ok,false);assert.equal(applyAction(empty,'createBox',{name:'Goal',target:10000}).ok,false);assert.equal(empty.wallet,0);
});
test('durable app boundary settles funding and a funded card once, retaining actual total money',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const state=createEmptyState({phone:'0244304593'});state.onboardingDone=true;state.buffer=0;
 const controller=createPersistence({storage,empty:()=>state,validate:validStoredState,migrate:migrateState});controller.load();
 const act=(type,payload)=>{const r=commitAction({state,type,payload,apply:applyAction,persistence:controller});assert.equal(r.ok,true,r.message);return r;};
 const f=act('startFundingAttempt',{amount:20000,rail:'momo',number:'0244304593',source:'Mobile money',idempotencyKey:'funding-1'});
 assert.equal(state.wallet,0);act('resolveFundingAttempt',{id:f.id,status:'success',idempotencyKey:'confirm-1'});const total=getSummary(state).total;
 act('resolveFundingAttempt',{id:f.id,status:'success',idempotencyKey:'confirm-1'});assert.equal(getSummary(state).total,total);
 const card=act('createDemoVirtualCard',{}).card;act('cardFund',{cardId:card.id,amount:5000,idempotencyKey:'card-fund'});assert.equal(state.wallet,15000);assert.equal(getSummary(state).total,20000);assert.equal(getSummary(state).cardTotal,5000);
 assert.equal(controller.reload().state.virtualCards[0].balance,5000);controller.release();
});
test('insights count actual card spending net of refund and fees, excluding internal card funding',()=>{
 const s=createEmptyState();s.transactions=[{type:'card-transfer',amount:10000,at:'2026-10-04T12:00:00Z',status:'success',direction:'out',rail:'internal'},{type:'card-purchase',amount:3000,refunded:1000,at:'2026-10-05T12:00:00Z',status:'success',direction:'out',rail:'card',category:'Food'},{type:'card-refund',amount:1000,at:'2026-10-06T12:00:00Z',status:'success',direction:'in',rail:'card'},{type:'payment',amount:1000,fee:50,at:'2026-10-07T12:00:00Z',status:'success',direction:'out',rail:'momo',category:'Food'}];
 const insights=getMonthlyInsights(s,'2026-10',new Date('2026-11-02T12:00:00Z'));assert.equal(insights.spent,3050);assert.equal(insights.categories[0].amount,3050);assert.equal(insights.moneyIn,0);
});
test('actual app migration repairs optional display data while preserving funded invalid records for recovery',()=>{
 const s=createDemoState(),before=structuredClone(s.transactions),wallet=s.wallet;
 s.paymentFavorites=[{id:'broken',rail:'wrong'}];delete s.virtualCards;s.virtualCard={id:'broken',number:'never-show-this'};
 migrateState(s);assert.equal(validStoredState(s),true);assert.deepEqual(s.paymentFavorites,[]);assert.equal(s.wallet,wallet);assert.deepEqual(s.transactions,before);
 const funded=createDemoState();funded.virtualCards=[{id:'card-bad',name:'Saved card',last4:'4242',createdAt:'2026-10-01T00:00:00Z',balance:-100,limit:10000,status:'active',history:[]}];
 migrateState(funded);assert.equal(validStoredState(funded),false);assert.equal(funded.virtualCards[0].balance,-100,'Do not replace malformed monetary records with zero.');
});
