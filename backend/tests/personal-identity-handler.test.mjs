import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createApprovedHandler} from '../supabase/functions/lumo-approved/handler.mjs';
const userId='11111111-1111-4111-8111-111111111111',sessionId='22222222-2222-4222-8222-222222222222';
const token='x.'+Buffer.from(JSON.stringify({sub:userId,session_id:sessionId})).toString('base64url')+'.x';
const json=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
function fixture({taken=false,personal=false}={}){
 const calls=[];
 const handler=createApprovedHandler({supabaseUrl:'https://identity.example',serviceRoleKey:'synthetic-test-only',crypto:webcrypto,fetch:async(url,init)=>{
  const body=init.body?JSON.parse(init.body):null;calls.push({path:new URL(url).pathname,body});
  if(url.endsWith('/auth/v1/user'))return json({id:userId,email:'cashier.test@pilot.lumo.invalid',app_metadata:{lumo_pilot:true}});
  if(url.includes('/auth/v1/token'))return json({access_token:token,refresh_token:'synthetic-refresh',user:{id:userId}});
  if(url.endsWith('/auth/v1/admin/users'))return json({id:userId});
  if(url.endsWith('/rest/v1/rpc/lumo_pilot_bootstrap'))return json(taken&&body.p_action==='register.reserve'?{ok:false,code:'HANDLE_TAKEN'}:{ok:true,registrationId:sessionId,mode:'new'});
  if(url.endsWith('/rest/v1/rpc/lumo_approved_service'))return json(body.p_command==='provision'?{ok:true}:{ok:false,code:'PERSONAL_ACCOUNT_REQUIRED'});
  if(url.includes('/auth/v1/logout'))return json({ok:true});
  throw Error('Unexpected transport '+url);
 }});
 const call=async body=>{const r=await handler(new Request('https://gateway.example',{method:'POST',body:JSON.stringify(body),headers:{'content-type':'application/json'}}));return {status:r.status,body:await r.json()}};
 return {calls,call};
}
test('merchant registration explicitly provisions a staff identity without a consumer envelope',async()=>{
 const f=fixture(),r=await f.call({action:'register',mode:'merchant',handle:'@Cashier.Test',password:'Synthetic!Password',displayName:'Counter Staff'});
 assert.equal(r.status,200);assert.equal(r.body.ok,true);assert.ok(r.body.session.access_token);assert.equal('state'in r.body,false);assert.equal('account'in r.body,false);
 const provision=f.calls.find(x=>x.body?.p_command==='provision');assert.equal(provision.body.p_payload.mode,'merchant');assert.equal(provision.body.p_payload.handle,'cashier.test');
});
test('merchant login retains merchant access without loading a personal wallet',async()=>{
 const f=fixture(),r=await f.call({action:'login',mode:'merchant',handle:'@Cashier.Test',password:'Synthetic!Password'});assert.equal(r.status,200);assert.equal(r.body.ok,true);assert.equal(f.calls.some(x=>x.body?.p_command==='load'),false);
});
test('personal account failures return an actionable error without invented money records',async()=>{
 const f=fixture(),r=await f.call({action:'login',handle:'cashier.test',password:'Synthetic!Password'});assert.equal(r.body.code,'PERSONAL_ACCOUNT_REQUIRED');assert.match(r.body.message,/merchant staff|personal Lumo/i);assert.equal('state'in r.body,false);
});
test('a taken username is actionable before creating auth identities or funding accounts',async()=>{
 const f=fixture({taken:true}),r=await f.call({action:'register',handle:'@Cashier.Test',password:'Synthetic!Password',displayName:'Personal User',phone:'0241234567',pin:'1234'});assert.equal(r.body.code,'HANDLE_TAKEN');assert.match(r.body.message,/already taken/i);assert.equal(f.calls.some(x=>x.path.endsWith('/admin/users')||x.body?.p_command==='provision'),false);
});
