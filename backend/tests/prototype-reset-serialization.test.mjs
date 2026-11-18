import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createAccessHandler} from '../supabase/functions/lumo-access/handler.mjs';
const actor='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222',executionId='33333333-3333-4333-8333-333333333333';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
function fixture({pending=false,confirming=false,rejection=0,appliedFailure=false,passwordPolicyMode='pilot',checkPasswordBreach,resetFenceEnabled=false}={}){
 const commands=[],writes=[];
 const handler=createAccessHandler({supabaseUrl:'https://iwutbrljiiodamtyoorg.supabase.co',serviceRoleKey:'FIXTURE_EDGE_ONLY',providerMode:'sandbox',prototypeFaceOnly:true,passwordPolicyMode,checkPasswordBreach,resetFenceEnabled,fetch:async(url,init)=>{
  if(url.includes('/auth/v1/admin/users/')){writes.push(JSON.parse(init.body));return rejection?json({code:'rejected'},rejection):json({id:actor});}
  const{p_command,p_payload}=JSON.parse(init.body);commands.push({command:p_command,payload:p_payload});
  if(p_command==='complete.claim')return json(pending?{ok:false,code:'RESET_IN_PROGRESS'}:{ok:true,ownerId:actor,email:'fixture@pilot.lumo.invalid',handle:'fixture',resetState:confirming?'confirming':'applying',executionId});
  if(p_command==='complete.applied'&&appliedFailure)return json({ok:false,code:'RESET_IN_PROGRESS'});
  if(['complete.applied','complete.failed','complete.finish'].includes(p_command))return json({ok:true});
  throw Error('Unexpected RPC '+p_command);
 }});
 const complete=async(newPassword='FixturePassword8')=>{const r=await handler(new Request('https://edge.example/access',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({module:'consumer',operation:'complete',requestId,resetToken:'T'.repeat(43),newPassword})}));return{status:r.status,...await r.json()};};
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
test('recovery screens original new secrets before claiming execution and keeps long passphrases available',async()=>{
 for(const password of ['aaaaaaaaaa','Password12345','Tr0ub4dor&3']){const f=fixture(),r=await f.complete(password);assert.equal(r.code,'PASSWORD_REJECTED');assert.equal(r.status,400);assert.equal(f.commands.length,0);assert.equal(f.writes.length,0);}
 const strong=fixture(),out=await strong.complete('quiet canoe violet orchard');assert.equal(out.completed,true);assert.equal(strong.writes.length,1);
 const f=fixture({passwordPolicyMode:'production'}),r=await f.complete('quiet canoe violet orchard');assert.equal(r.code,'PASSWORD_POLICY_UNAVAILABLE');assert.equal(r.status,503);assert.equal(f.commands.length,0);assert.equal(f.writes.length,0);
});
test('active Auth password update preserves the exact password-only legacy protocol without a reset marker',async()=>{
 const f=fixture(),r=await f.complete();assert.equal(r.completed,true);assert.equal(f.writes.length,1);
 const password=createHash('sha256').update('lumo-approved-password-v1\0fixture\0FixturePassword8').digest('hex');
 assert.deepEqual(f.writes[0],{password});assert.equal(f.commands[0].payload.markerVersion,undefined);
 assert.ok(f.commands.every(({command,payload})=>!command.startsWith('complete.reconcile')&&!Object.hasOwn(payload,'markerVersion')));
});
test('active rollout flag retains original access7 claim/PUT protocol without any F05 dependency',async()=>{
 const f=fixture({resetFenceEnabled:false}),r=await f.complete();assert.equal(r.completed,true);assert.equal(f.commands[0].payload.markerVersion,undefined);assert.deepEqual(Object.keys(f.writes[0]),['password']);assert.deepEqual(f.commands.map(x=>x.command),['complete.claim','complete.applied','complete.finish']);
 const pending=fixture({resetFenceEnabled:false,pending:true}),out=await pending.complete();assert.equal(out.code,'RESET_IN_PROGRESS');assert.equal(pending.writes.length,0);assert.deepEqual(pending.commands.map(x=>x.command),['complete.claim']);
});
