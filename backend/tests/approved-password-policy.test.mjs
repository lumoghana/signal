import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createApprovedHandler} from '../supabase/functions/lumo-approved/handler.mjs';

function fixture(options={}){
 const calls=[];const handler=createApprovedHandler({supabaseUrl:'https://fixture.example',serviceRoleKey:'synthetic-only',crypto:webcrypto,...options,fetch:async(url,init)=>{
  calls.push({path:new URL(url).pathname,body:JSON.parse(init.body||'null')});
  // Stop after policy validation; tests must never create a hosted identity.
  return Response.json({ok:false,code:'RATE_LIMITED'});
 }});
 return {calls,call:async body=>{const r=await handler(new Request('https://fixture.example/approved',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));return {status:r.status,...await r.json()};}};
}
const registration=password=>({action:'register',mode:'merchant',handle:'synthetic_owner',password,displayName:'Synthetic merchant'});
test('registration rejects original repeated/common passwords before reservation or Auth creation',async()=>{
 for(const password of ['aaaaaaaaaa','1111111111','Password12345']){
  const f=fixture(),r=await f.call(registration(password));assert.equal(r.code,'PASSWORD_REJECTED');assert.equal(r.status,400);assert.equal(f.calls.length,0);
 }
});
test('production registration fails closed until an original-secret breach checker confirms a result',async()=>{
 const missing=fixture({passwordPolicyMode:'production'}),a=await missing.call(registration('River mango lantern sunrise'));
 assert.equal(a.code,'PASSWORD_POLICY_UNAVAILABLE');assert.equal(missing.calls.length,0);
 const exposed=fixture({passwordPolicyMode:'production',checkPasswordBreach:async()=>({checked:true,breached:true})}),b=await exposed.call(registration('River mango lantern sunrise'));
 assert.equal(b.code,'PASSWORD_REJECTED');assert.equal(exposed.calls.length,0);
 const accepted=fixture({passwordPolicyMode:'production',checkPasswordBreach:async(value)=>{assert.equal(value,'River mango lantern sunrise');return {checked:true,breached:false};}});await accepted.call(registration('River mango lantern sunrise'));
 assert.equal(accepted.calls[0].body.p_action,'register.reserve');assert.equal(accepted.calls.some(x=>x.path==='/auth/v1/admin/users'),false);
});
test('legacy password login still reaches the credential check independently of new-secret policy',async()=>{
 const f=fixture({passwordPolicyMode:'production'}),r=await f.call({action:'login',mode:'merchant',handle:'synthetic_owner',password:'aaaaaaaaaa'});
 assert.equal(r.code,'RATE_LIMITED');assert.equal(f.calls[0].body.p_action,'login.check');
});
