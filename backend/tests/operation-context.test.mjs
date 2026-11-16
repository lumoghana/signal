import test from 'node:test';
import assert from 'node:assert/strict';
import {withOperationEvents} from '../supabase/functions/lumo-approved/operations.mjs';
const actor='11111111-1111-4111-8111-111111111111';
const req=(body,origin='https://lumo-connected-pilot.vercel.app')=>new Request('https://edge.example',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)});
const ok=()=>new Response('{"ok":true}',{headers:{'X-Lumo-Outcome':'ok'}});
const config=(events,extra={})=>({supabaseUrl:'https://project.example',serviceRoleKey:'SERVER_ONLY',fetch:async(_,init)=>{events.push(JSON.parse(init.body).p_payload);return new Response('{"ok":true}');},...extra});
test('actual payout and case-inbox routes have safe distinct names',async()=>{
 const events=[],handler=withOperationEvents(async()=>ok(),config(events));
 for(const type of ['requestPayout','approvePayout','executePayout'])await handler(req({action:'action',type}));
 await withOperationEvents(async()=>new Response('{}',{status:401,headers:{'X-Lumo-Outcome':'rejected'}}),config(events))(req({action:'caseInbox',operation:'detail'}));
 assert.deepEqual(events.map(e=>e.action),['action.requestPayout','action.approvePayout','action.executePayout','caseInbox.detail']);
});
test('only request-bound verified context becomes actor attribution',async()=>{
 const events=[],contexts=new WeakMap(),handler=withOperationEvents(async request=>{contexts.set(request,{actorId:actor});return ok();},config(events,{contextFor:request=>contexts.get(request)}));
 await handler(req({action:'action',type:'payment',actorId:'spoofed',userId:'spoofed',payload:{phone:'0244123456'}}));
 assert.equal(events[0].actorId,actor);assert.doesNotMatch(JSON.stringify(events),/spoofed|0244123456/);
 const unverified=[];await withOperationEvents(async()=>ok(),config(unverified))(req({action:'action',type:'payment',actorId:actor}));assert.equal('actorId' in unverified[0],false);
});
test('concurrent accounts cannot swap event attribution',async()=>{
 const events=[],contexts=new WeakMap(),other='22222222-2222-4222-8222-222222222222';let count=0;
 const handler=withOperationEvents(async r=>{const current=count++?other:actor;contexts.set(r,{actorId:current});await new Promise(resolve=>setTimeout(resolve,current===actor?15:1));return ok();},config(events,{contextFor:r=>contexts.get(r)}));
 await Promise.all([handler(req({action:'action',type:'payment',attemptId:'attempt-actor-one'})),handler(req({action:'action',type:'payment',attemptId:'attempt-actor-two'}))]);
 assert.equal(events.find(e=>e.attemptId==='attempt-actor-one').actorId,actor);assert.equal(events.find(e=>e.attemptId==='attempt-actor-two').actorId,other);
});
test('merchant Vercel origin maps correctly and successful reads sample explicitly',async()=>{
 const events=[];await withOperationEvents(async()=>ok(),config(events))(req({action:'merchant',method:'POST'},'https://lumo-merchant.vercel.app'));assert.equal(events[0].channel,'merchant_web');
 await withOperationEvents(async()=>ok(),config(events,{readSampleRate:1}))(req({action:'snapshot'}));assert.equal(events[1].sampledRead,true);
});
test('event loss reports bounded reasons without altering financial response',async()=>{
 const losses=[],original=ok();const handler=withOperationEvents(async()=>original,{...config([]),fetch:async()=>new Response('{"ok":false}',{status:500}),onEventLoss:x=>losses.push(x)});
 assert.equal(await handler(req({action:'action',type:'payment'})),original);assert.equal(losses.length,1);assert.equal(losses[0].reason,'rejected');assert.deepEqual(Object.keys(losses[0]).sort(),['reason','requestId']);
});
