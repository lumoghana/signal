import test from 'node:test';
import assert from 'node:assert/strict';
import {createApprovedService} from '../dist/js/approved-service.js';
import {locksFor} from './helpers/web-locks.js';

const memory=()=>{const data=new Map();return{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
const user={id:'11111111-1111-4111-8111-111111111111'};
const session={access_token:'synthetic-token',refresh_token:'synthetic-refresh',expires_at:Date.now()/1000+3600,user};
const reply=(body,status=200)=>({ok:status<400,status,json:async()=>body});
const success={ok:true,state:{wallet:0},result:{ok:true,message:'Saved'},account:{userId:user.id}};
function harness(transport){const calls=[],storage=memory(),service=createApprovedService({storage,modeStorage:memory(),lockManager:locksFor(storage),fetch:async(url,options)=>{const call={url,body:JSON.parse(options.body),headers:options.headers};calls.push(call);return transport(call,calls);}});return{service,calls,storage};}

test('only the seven reviewed record actions use the isolated endpoint; login and payments retain their routes',async()=>{
 const h=harness(c=>reply(c.body.action==='login'?{...success,session}:success));
 await h.service.login('synthetic-user','synthetic-password');
 for(const type of ['externalMovement','confirmExternalBalance','saveCommitment','reuseEssentialPlan','setEssentialRecurring','setMaintenancePreferences','completeMoneyCheck']){
  await h.service.action(type,{idempotencyKey:`route-${type}`});
  assert.match(h.calls.at(-1).url,/\/functions\/v1\/lumo-maintenance$/);
  assert.equal(h.calls.at(-1).headers.Authorization,'Bearer synthetic-token');
  assert.equal(h.calls.at(-1).body.type,type);
 }
 await h.service.action('payment',{amount:100,idempotencyKey:'original-payment-route'},{pin:'1234'});
 assert.match(h.calls.at(-1).url,/\/functions\/v1\/lumo-approved$/);
 assert.match(h.calls[0].url,/\/functions\/v1\/lumo-approved$/);
});

test('an uncertain upkeep response retains exactly the same reviewed payload and reference',async()=>{
 let lose=true;const h=harness(c=>{if(c.body.action==='login')return reply({...success,session});if(lose){lose=false;throw Error('Lost synthetic response');}return reply(success);});
 await h.service.login('synthetic-user','synthetic-password');
 const payload={id:'record-cash',direction:'out',amount:2500,expectedRevision:1,idempotencyKey:'outside-review-original'};
 assert.equal((await h.service.action('externalMovement',payload)).unknown,true);
 assert.equal((await h.service.action('externalMovement',payload)).ok,true);
 assert.equal(h.calls[1].body.attemptId,h.calls[2].body.attemptId);
 assert.deepEqual(h.calls[1].body.payload,h.calls[2].body.payload);
 assert.equal(h.calls[1].url,h.calls[2].url);
});

test('authentication refresh retries the same upkeep endpoint and attempt',async()=>{
 let expired=false;const h=harness(c=>{if(c.body.action==='login')return reply({...success,session});if(c.url.includes('/auth/v1/token'))return reply({...session,access_token:'refreshed-synthetic-token'});if(!expired){expired=true;return reply({ok:false,code:'UNAUTHENTICATED'},401);}return reply(success);});
 await h.service.login('synthetic-user','synthetic-password');
 assert.equal((await h.service.action('completeMoneyCheck',{idempotencyKey:'short-check-original'})).ok,true);
 const updates=h.calls.filter(c=>c.body.type==='completeMoneyCheck');assert.equal(updates.length,2);
 assert.equal(updates[0].body.attemptId,updates[1].body.attemptId);
 assert.match(updates[1].url,/\/lumo-maintenance$/);
 assert.equal(updates[1].headers.Authorization,'Bearer refreshed-synthetic-token');
});
