import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminHandler} from '../supabase/functions/lumo-admin/handler.mjs';
const actor='10000000-0000-4000-8000-000000000001',sid='20000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const commands=['financial.refund.create','financial.refund.get','financial.refund.decide','financial.refund.complete','financial.guest.propose','financial.guest.resolve','financial.exceptions.list','financial.exceptions.create','financial.exceptions.update'];
function fixture({aal='aal2',mfaEnforced=true,denySession=false,code=null}={}){
 const calls=[],token='head.'+Buffer.from(JSON.stringify({sub:actor,session_id:sid,aal,exp:Math.floor(Date.now()/1000)+600})).toString('base64url')+'.signature';
 const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
 const handler=createAdminHandler({supabaseUrl:'https://financial.fixture',serviceRoleKey:'private-server-fixture',allowedOrigins:['https://admin.fixture'],fetch:async(url,init)=>{
  const path=new URL(url).pathname,body=init.body?JSON.parse(init.body):null;calls.push({path,body});
  if(path==='/auth/v1/user')return json({id:actor,factors:aal==='aal2'?[{factor_type:'totp',status:'verified'}]:[]});
  if(path==='/rest/v1/rpc/lumo_admin_service'){assert.equal(body.p_command,'session');return json(denySession?{ok:false,code:'STAFF_REQUIRED'}:{ok:true,data:{staff:{userId:actor,role:'finance'},mfaEnforced}});}
  if(path==='/rest/v1/rpc/lumo_admin_financial')return json(code?{ok:false,code,message:'private-server-fixture'}:{ok:true,data:{record:{status:'recorded'},command:body.p_command}});
  throw Error('Unexpected privileged route '+path);
 }});
 const call=async body=>{const response=await handler(new Request('https://financial.fixture/edge',{method:'POST',headers:{Origin:'https://admin.fixture','Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)}));return {status:response.status,data:await response.json()};};
 return {calls,call};
}
test('each bounded financial command reaches only its service RPC with verified staff identity',async()=>{
 for(const command of commands){const f=fixture(),result=await f.call({action:'rpc',command,payload:{actor:other,session:other,aal:'forged',amount:1000}});assert.equal(result.data.ok,true);const sent=f.calls.find(c=>c.path.endsWith('/lumo_admin_financial'));assert.equal(sent.body.p_command,command);assert.equal(sent.body.p_payload.actor,actor);assert.equal(sent.body.p_payload.session,sid);assert.equal(sent.body.p_payload.aal,'aal2');assert.equal(sent.body.p_payload.amount,1000);}
});
test('unknown financial RPC names and forged procedure names never dispatch',async()=>{
 for(const command of ['financial.execute_anything','lumo_admin_financial','financial.refund.create;drop table']){const f=fixture(),out=await f.call({action:'rpc',command});assert.equal(out.data.code,'INVALID_INPUT');assert.equal(f.calls.some(c=>c.path.endsWith('/lumo_admin_financial')),false);}
});
test('inactive staff and required step-up stop financial dispatch',async()=>{
 for(const options of [{denySession:true},{aal:'aal1'}]){const f=fixture(options),out=await f.call({action:'rpc',command:'financial.refund.create'});assert.equal(out.status,403);assert.equal(f.calls.some(c=>c.path.endsWith('/lumo_admin_financial')),false);}
});
test('only the server-owned existing MFA exception can permit aal1 operations',async()=>{
 const enforced=fixture({aal:'aal1'}),blocked=await enforced.call({action:'rpc',command:'financial.exceptions.list',payload:{mfaEnforced:false}});assert.equal(blocked.data.code,'MFA_REQUIRED');
 const permitted=fixture({aal:'aal1',mfaEnforced:false}),out=await permitted.call({action:'rpc',command:'financial.exceptions.list'});assert.equal(out.data.ok,true);assert.ok(permitted.calls.some(c=>c.path.endsWith('/lumo_admin_financial')));
});
test('financial denials preserve codes and use human messages without upstream diagnostics',async()=>{
 for(const code of ['INVALID_REFUND','REFUND_EXCEEDS_PAYMENT','REFUND_EVIDENCE_MISMATCH','CASE_LINK_REQUIRED','OUTCOME_REVIEW_REQUIRED','OUTCOME_UNCONFIRMED','STALE_CONTROL']){const f=fixture({code}),out=await f.call({action:'rpc',command:'financial.refund.complete'});assert.equal(out.data.code,code);assert.doesNotMatch(out.data.message,/private-server-fixture/);assert.notEqual(out.data.message,'Lumo Admin could not complete this request. Try again shortly.');}
});
