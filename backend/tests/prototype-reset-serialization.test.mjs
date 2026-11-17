import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccessHandler} from '../supabase/functions/lumo-access/handler.mjs';
const actor='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222',executionId='33333333-3333-4333-8333-333333333333';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
function fixture({pending=false,confirming=false,rejection=0,appliedFailure=false}={}){
 const commands=[],writes=[];
 const handler=createAccessHandler({supabaseUrl:'https://iwutbrljiiodamtyoorg.supabase.co',serviceRoleKey:'FIXTURE_EDGE_ONLY',providerMode:'sandbox',prototypeFaceOnly:true,fetch:async(url,init)=>{
  if(url.includes('/auth/v1/admin/users/')){writes.push(JSON.parse(init.body));return rejection?json({code:'rejected'},rejection):json({id:actor});}
  const{p_command,p_payload}=JSON.parse(init.body);commands.push({command:p_command,payload:p_payload});
  if(p_command==='complete.claim')return json(pending?{ok:false,code:'RESET_IN_PROGRESS'}:{ok:true,ownerId:actor,email:'fixture@pilot.lumo.invalid',handle:'fixture',resetState:confirming?'confirming':'applying',executionId});
  if(p_command==='complete.applied'&&appliedFailure)return json({ok:false,code:'RESET_IN_PROGRESS'});
  if(['complete.applied','complete.failed','complete.finish'].includes(p_command))return json({ok:true});
  throw Error('Unexpected RPC '+p_command);
 }});
 const complete=async()=>{const r=await handler(new Request('https://edge.example/access',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({module:'consumer',operation:'complete',requestId,resetToken:'T'.repeat(43),newPassword:'FixturePassword8'})}));return{status:r.status,...await r.json()};};
 return{complete,commands,writes};
}
test('prototype reset requires a durable execution claim before issuing one Auth write',async()=>{
 const f=fixture(),r=await f.complete();assert.equal(r.completed,true);assert.equal(f.writes.length,1);
 assert.deepEqual(f.commands.map(x=>x.command),['complete.claim','complete.applied','complete.finish']);
 assert.match(f.commands[0].payload.executionId,/^[a-f0-9-]{36}$/);
 assert.equal(f.commands[1].payload.executionId,executionId);assert.equal(f.commands[2].payload.executionId,executionId);
});
test('concurrent or ambiguous reset retry cannot start another Auth write',async()=>{
 const f=fixture({pending:true}),r=await f.complete();assert.equal(r.code,'RESET_IN_PROGRESS');assert.equal(r.status,409);assert.equal(f.writes.length,0);assert.deepEqual(f.commands.map(x=>x.command),['complete.claim']);
});
test('acknowledged Auth result is reconciled with finish only, never another Auth write',async()=>{
 const f=fixture({confirming:true}),r=await f.complete();assert.equal(r.completed,true);assert.equal(f.writes.length,0);assert.deepEqual(f.commands.map(x=>x.command),['complete.claim','complete.finish']);
});
test('only definite Auth rejection releases execution authority',async()=>{
 for(const rejection of [400,401,403,422,429,500,503]){
  const f=fixture({rejection}),r=await f.complete();assert.equal(r.code,'RESET_IN_PROGRESS');assert.equal(f.writes.length,1);
  assert.deepEqual(f.commands.map(x=>x.command),rejection<500?['complete.claim','complete.failed']:['complete.claim']);
 }
 const f=fixture({appliedFailure:true}),r=await f.complete();assert.equal(r.code,'RESET_IN_PROGRESS');assert.equal(f.writes.length,1);assert.deepEqual(f.commands.map(x=>x.command),['complete.claim','complete.applied']);
});
