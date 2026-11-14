import test from 'node:test';
import assert from 'node:assert/strict';
import {withOperationEvents,operationOutcome} from '../supabase/functions/lumo-approved/operations.mjs';

const request=(body,origin='https://lumo-connected-pilot.vercel.app')=>new Request('https://edge.example/functions/v1/lumo-approved',{method:'POST',headers:{'content-type':'application/json',origin,authorization:'Bearer PRIVATE_ACCESS_TOKEN'},body:JSON.stringify(body)});
const response=(outcome='ok',code='',status=200,noMutation=false)=>new Response(JSON.stringify({ok:outcome==='ok',privateSnapshot:{phone:'0244123456',pin:'1234'}}),{status,headers:{'X-Lumo-Outcome':outcome,'X-Lumo-Error-Code':code,'X-Lumo-No-Mutation':String(noMutation)}});
const config=fetch=>({supabaseUrl:'https://project.example',serviceRoleKey:'SERVER_ONLY_KEY',fetch});

test('operational event contains only routing evidence, never request payload or response snapshot',async()=>{
 let recorded;const original=response();const handler=withOperationEvents(async()=>original,config(async(url,init)=>{recorded=JSON.parse(init.body).p_payload;return new Response('{}');}));
 const result=await handler(request({action:'action',type:'payment',attemptId:'attempt-safe-1234',pin:'8237',userId:'spoofed-user',payload:{rail:'momo',recipient:{network:'MTN MoMo',phone:'0244123456',name:'Private Name'},amount:999,notes:'PRIVATE CHAT',token:'PRIVATE_TOKEN'}}));
 assert.equal(result,original);assert.equal(recorded.serviceId,'momo_send');assert.equal(recorded.action,'action.payment');assert.equal(recorded.attemptId,'attempt-safe-1234');assert.equal(recorded.outcome,'ok');
 assert.deepEqual(Object.keys(recorded).sort(),['action','attemptId','channel','durationMs','errorCode','httpStatus','outcome','requestId','serviceId'].sort());
 for(const secret of ['8237','0244123456','Private Name','PRIVATE CHAT','PRIVATE_TOKEN','spoofed-user','PRIVATE_ACCESS_TOKEN'])assert.equal(JSON.stringify(recorded).includes(secret),false);
 assert.equal('actor' in recorded,false);assert.equal('userId' in recorded,false);assert.match(result.headers.get('X-Lumo-Request-Id'),/^[a-f0-9-]{36}$/);
});

test('normal successful polling does not write one diagnostic event every refresh',async()=>{
 let calls=0;const handler=withOperationEvents(async()=>response(),config(async()=>{calls++;return new Response('{}');}));
 await handler(request({action:'snapshot'}));await handler(request({action:'serviceStatus'}));assert.equal(calls,0);
});

test('failed read records only safe code and service route',async()=>{
 let event;const handler=withOperationEvents(async()=>response('rejected','SESSION_REVOKED',401),config(async(_,init)=>{event=JSON.parse(init.body).p_payload;return new Response('{}');}));
 await handler(request({action:'snapshot',phone:'0244123456'}));assert.equal(event.outcome,'rejected');assert.equal(event.errorCode,'SESSION_REVOKED');assert.equal(event.action,'snapshot');
});

test('an infrastructure timeout is unknown unless backend proves no mutation',()=>{
 assert.equal(operationOutcome(response('rejected','SERVICE_UNAVAILABLE',503)).outcome,'unknown');
 assert.equal(operationOutcome(response('rejected','SERVICE_UNAVAILABLE',503,true)).outcome,'rejected');
 assert.equal(operationOutcome(response('rejected','INSUFFICIENT_FUNDS',200)).outcome,'rejected');
});

test('credential and registration actions never reach the event recorder',async()=>{
 let calls=0;const handler=withOperationEvents(async()=>response('rejected','AUTH_REQUIRED',401),config(async()=>{calls++;return new Response('{}');}));
 for(const action of ['login','register','verifyPin','changePin','repairTestPin'])await handler(request({action,password:'PRIVATE_PASSWORD',pin:'1234'}));assert.equal(calls,0);
});

test('telemetry failure leaves the confirmed financial response unchanged',async()=>{
 const original=response();const expected=await original.clone().text();const handler=withOperationEvents(async()=>original,config(async()=>{throw Error('PRIVATE upstream diagnostic');}));
 const result=await handler(request({action:'action',type:'payment',attemptId:'attempt-safe-1234',payload:{rail:'lumo'}}));assert.equal(result,original);assert.equal(await result.text(),expected);assert.equal(result.status,200);
});

test('an unresponsive telemetry transport has a bounded wait',async()=>{
 const handler=withOperationEvents(async()=>response(),{...config(()=>new Promise(()=>{})),timeoutMs:20});const start=performance.now();
 const result=await handler(request({action:'action',type:'fund',attemptId:'attempt-safe-1234'}));assert.equal(result.status,200);assert.ok(performance.now()-start<250);
});

test('unexpected handler error is recorded unknown and the original exception is preserved',async()=>{
 let event;const original=Error('PRIVATE failure context');const handler=withOperationEvents(async()=>{throw original;},config(async(_,init)=>{event=JSON.parse(init.body).p_payload;return new Response('{}');}));
 await assert.rejects(handler(request({action:'action',type:'payment',attemptId:'attempt-safe-1234'})),e=>e===original);assert.equal(event.outcome,'unknown');assert.equal(JSON.stringify(event).includes('PRIVATE'),false);
});

test('caller-controlled labels cannot become free-text event names or identity',async()=>{
 let event;const handler=withOperationEvents(async()=>response('rejected','INVALID_INPUT',400),config(async(_,init)=>{event=JSON.parse(init.body).p_payload;return new Response('{}');}));
 await handler(request({action:'action',type:'My phone is 0244123456',attemptId:'unsafe \n phone',actor:'spoofed',payload:{rail:'unknown'}},'https://unrecognised.example'));
 assert.equal(event.action,'action.other');assert.equal(event.attemptId,null);assert.equal(event.channel,'unknown');assert.equal('actor' in event,false);
});
