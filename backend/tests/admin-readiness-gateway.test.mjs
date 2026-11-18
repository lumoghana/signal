import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminHandler} from '../supabase/functions/lumo-admin/handler.mjs';
const actor='10000000-0000-4000-8000-000000000001',session='20000000-0000-4000-8000-000000000001';
function fixture({aal='aal2',mfaEnforced=false,requireMfa=false,factor=true,recoveryResetsEnabled,resultData}={}){
 const calls=[],token='head.'+Buffer.from(JSON.stringify({sub:actor,session_id:session,aal,exp:Math.floor(Date.now()/1000)+600})).toString('base64url')+'.synthetic';
 const json=x=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json'}});
 const handler=createAdminHandler({supabaseUrl:'https://admin.fixture',serviceRoleKey:'synthetic-private-server',requireMfa,recoveryResetsEnabled,fetch:async(url,init)=>{
  const path=new URL(url).pathname,body=init.body?JSON.parse(init.body):null;calls.push({path,body});
  if(path==='/auth/v1/user')return json({id:actor,factors:factor?[{factor_type:'totp',status:'verified'}]:[]});
  if(path==='/rest/v1/rpc/lumo_admin_service'&&body.p_command==='session')return json({ok:true,data:{staff:{userId:actor,role:'super_admin'},mfaEnforced}});
  return json({ok:true,data:resultData??{command:body.p_command}});
 }});
 return {calls,async call(body){const response=await handler(new Request('https://admin.fixture/edge',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)}));return {status:response.status,data:await response.json()};}};
}
test('approval cancellation and security/recovery commands route with trusted actor identity',async()=>{
 for(const command of ['approvals.cancel','security.policy','security.mfa.enable','security.mode.production','recovery.resets.list','recovery.resets.reconcile','recovery.resets.cancel']){
  const f=fixture({recoveryResetsEnabled:true}),out=await f.call({action:'rpc',command,payload:{actor:'forged',session:'forged',aal:'aal1',reason:'Synthetic evidence'}});assert.equal(out.data.ok,true);
  const sent=f.calls.at(-1);assert.equal(sent.body.p_payload.actor,actor);assert.equal(sent.body.p_payload.session,session);assert.equal(sent.body.p_payload.aal,'aal2');
  assert.equal(sent.path,command.startsWith('approvals.')?'/rest/v1/rpc/lumo_admin_service':'/rest/v1/rpc/lumo_admin_security');
 }
});
test('production gateway cannot inherit the pilot password-only exception',async()=>{
 const f=fixture({aal:'aal1',requireMfa:true});const out=await f.call({action:'rpc',command:'overview'});
 assert.equal(out.status,403);assert.equal(out.data.code,'MFA_REQUIRED');assert.equal(f.calls.filter(x=>x.path.startsWith('/rest/v1/rpc/')).length,1);
});
test('recovery reads and security mutations require actual MFA even when the pilot exception remains',async()=>{
 for(const command of ['security.mfa.enable','security.mode.production','recovery.resets.list','recovery.resets.reconcile','recovery.resets.cancel'])for(const options of [{aal:'aal1'},{factor:false}]){
  const f=fixture(options),out=await f.call({action:'rpc',command,payload:{mfaEnforced:false,aal:'aal2'}});assert.equal(out.data.code,'MFA_REQUIRED');assert.equal(f.calls.some(x=>x.path.endsWith('/lumo_admin_security')),false);
 }
 const f=fixture({aal:'aal1'}),out=await f.call({action:'rpc',command:'security.policy'});assert.equal(out.data.ok,true);
});
test('unknown security/reset commands never invoke a privileged RPC',async()=>{
 for(const command of ['security.mfa.disable','recovery.resets.force_release','security.execute_sql']){const f=fixture(),out=await f.call({action:'rpc',command});assert.equal(out.data.code,'INVALID_INPUT');assert.equal(f.calls.some(x=>x.path.endsWith('/lumo_admin_security')),false);}
});

test('staged recovery commands default off and cannot be enabled by a request payload',async()=>{
 for(const command of ['recovery.resets.list','recovery.resets.reconcile','recovery.resets.cancel']){
  const f=fixture(),out=await f.call({action:'rpc',command,recoveryResetsEnabled:true,payload:{recoveryResetsEnabled:true,actor,session,aal:'aal2'}});
  assert.equal(out.status,503);assert.equal(out.data.code,'RECOVERY_RESOLUTION_UNAVAILABLE');
  assert.equal(f.calls.filter(x=>x.path.startsWith('/rest/v1/rpc/')).length,1,'only trusted staff-session check may reach SQL');
  assert.equal(f.calls.some(x=>x.path.endsWith('/lumo_admin_security')),false,'unsupported recovery SQL must not be called');
 }
 const ordinary=fixture(),allowed=await ordinary.call({action:'rpc',command:'security.policy'});assert.equal(allowed.data.ok,true);
});

test('historical SQL system notes show Lumo while names, staff text and financial facts stay exact',async()=>{
 const old='Pause trigger and Lux answer telemetry are not recorded by the current backend.';
 const records={limitations:[old],definitions:['Only recorded outcomes are counted. Client abandonments and Lux satisfaction are not yet instrumented.'],name:'Lux Café',message:old,total:2300,customer:{name:'Lux Mensah',limitations:[old]}};
 const before=structuredClone(records),f=fixture({resultData:records}),out=await f.call({action:'rpc',command:'reports'});
 assert.equal(out.status,200);assert.match(out.data.data.limitations[0],/Lumo answer/);assert.match(out.data.data.definitions[0],/Lumo satisfaction/);
 assert.equal(out.data.data.name,'Lux Café');assert.equal(out.data.data.message,old);assert.deepEqual(out.data.data.customer,records.customer);assert.equal(out.data.data.total,2300);assert.deepEqual(records,before);
});
