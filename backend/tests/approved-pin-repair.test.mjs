import test from 'node:test';
import assert from 'node:assert/strict';
import {createApprovedHandler} from '../supabase/functions/lumo-approved/handler.mjs';

const ORIGIN='https://lumo-connected-pilot.vercel.app',BASE='https://fixture.supabase.co';
const USER='10000000-0000-4000-8000-000000000001',OTHER='10000000-0000-4000-8000-000000000002';
const CURRENT='20000000-0000-4000-8000-000000000001',PROOF='20000000-0000-4000-8000-000000000002';
const REQUEST='30000000-0000-4000-8000-000000000001';
const token=(user,session)=>'header.'+Buffer.from(JSON.stringify({sub:user,session_id:session})).toString('base64url')+'.signature';
const currentToken=token(USER,CURRENT),proofToken=token(USER,PROOF),otherProofToken=token(OTHER,PROOF),password='Private-fixture-password',newPin='0246';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const snapshot={ok:true,account:{id:'40000000-0000-4000-8000-000000000001',userId:USER,handle:'legacy.test',displayName:'Fixture only',balance:0},state:null,revision:0,groups:[],boxes:[],partners:[],requests:[],receipts:[]};
function fixture(options={}){
 const calls=[];
 const user=id=>({id,email:'legacy.test@pilot.lumo.invalid',app_metadata:{lumo_pilot:true}});
 const handler=createApprovedHandler({supabaseUrl:BASE,serviceRoleKey:'fixture-server-only-key',allowedOrigins:[ORIGIN],fetch:async(url,init)=>{
  const parsed=new URL(url),body=init.body?JSON.parse(init.body):null,authorization=init.headers.Authorization;
  calls.push({path:parsed.pathname,body,authorization});
  if(parsed.pathname==='/auth/v1/user')return json(user(authorization==='Bearer '+otherProofToken?OTHER:USER));
  if(parsed.pathname==='/auth/v1/token'){
   if(options.wrongPassword)return json({code:'invalid_grant',message:'must not leak '+password},400);
   return json({access_token:options.wrongActor?otherProofToken:proofToken,refresh_token:'fixture-refresh',user:user(options.wrongActor?OTHER:USER)});
  }
  if(parsed.pathname==='/auth/v1/admin/users')return json(user(USER));
  if(parsed.pathname==='/auth/v1/logout')return json({ok:true});
  if(parsed.pathname==='/rest/v1/rpc/lumo_pilot_bootstrap')return json(body.p_action==='register.reserve'?{ok:true,mode:options.existing?'resume':'new',registrationId:REQUEST}:{ok:true});
  if(parsed.pathname==='/rest/v1/rpc/lumo_approved_pin_repair'){
   assert.equal(body.p_payload.actor,USER);assert.equal(body.p_payload.session,CURRENT);
   if(body.p_command==='status')return json({ok:true,eligible:true,repaired:false,testOnly:true});
   if(body.p_command==='begin')return json(options.beginCode?{ok:false,code:options.beginCode}:{ok:true,requestId:REQUEST});
   assert.equal(body.p_command,'commit');assert.equal(body.p_payload.requestId,REQUEST);assert.equal(body.p_payload.proofSession,PROOF);assert.equal(body.p_payload.newPin,newPin);
   assert.equal(body.p_payload.currentPassword,undefined);
   return json(options.commitCode?{ok:false,code:options.commitCode}:{ok:true,repaired:true,testOnly:true});
  }
  if(parsed.pathname==='/rest/v1/rpc/lumo_approved_service'){
   if(body.p_command==='provision')return json(options.existing?{ok:false,code:'EXISTING_ACCOUNT'}:snapshot);
   if(body.p_command==='pin.change')return json({ok:true});
   assert.equal(body.p_command,'load');return json(snapshot);
  }
  throw Error('Unexpected fixture upstream path '+parsed.pathname);
 }});
 const request=async(body)=>{const response=await handler(new Request(BASE+'/functions/v1/lumo-approved',{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json',Authorization:'Bearer '+currentToken},body:JSON.stringify(body)}));return {status:response.status,data:await response.json()};};
 return {calls,request};
}
const repair={action:'repairTestPin',currentPassword:password,newPin};

test('legacy repair checks password and immutable current/proof identities before a server-only PIN commit',async()=>{
 const f=fixture(),out=await f.request(repair);assert.equal(out.status,200);assert.equal(out.data.ok,true);assert.equal(out.data.testOnly,true);assert.equal(out.data.state.wallet,0);
 const begin=f.calls.findIndex(c=>c.body?.p_command==='begin'),credentials=f.calls.findIndex(c=>c.path==='/auth/v1/token'),commit=f.calls.findIndex(c=>c.body?.p_command==='commit');
 assert.ok(begin>=0&&begin<credentials&&credentials<commit);assert.equal(f.calls.at(-1).path,'/auth/v1/logout');assert.equal(f.calls.at(-1).authorization,'Bearer '+proofToken);
 assert.ok(!JSON.stringify(out).includes(password));assert.ok(!JSON.stringify(out).includes(newPin));
});

test('status is owner-bound and does not create repair attempts or request passwords',async()=>{
 const f=fixture(),out=await f.request({action:'pinRepairStatus',actor:OTHER});assert.equal(out.data.eligible,true);
 assert.equal(f.calls.some(c=>c.path==='/auth/v1/token'),false);assert.deepEqual(f.calls.filter(c=>c.path.endsWith('lumo_approved_pin_repair')).map(c=>c.body.p_command),['status']);
});

test('a wrong password consumes the pre-check but cannot commit a PIN or expose credentials',async()=>{
 const f=fixture({wrongPassword:true}),out=await f.request(repair);assert.equal(out.data.code,'CREDENTIALS_INCORRECT');
 assert.equal(f.calls.filter(c=>c.body?.p_command==='begin').length,1);assert.equal(f.calls.some(c=>c.body?.p_command==='commit'),false);assert.ok(!JSON.stringify(out).includes(password));
});

test('denied eligibility or exhausted repair rate never reaches the password endpoint',async()=>{
 for(const beginCode of ['PIN_REPAIR_UNAVAILABLE','RATE_LIMITED','SESSION_REVOKED']){
  const f=fixture({beginCode}),out=await f.request(repair);assert.equal(out.data.code,beginCode);assert.equal(f.calls.some(c=>c.path==='/auth/v1/token'),false);
 }
});

test('a password session for another identity cannot repair the caller and is revoked',async()=>{
 const f=fixture({wrongActor:true}),out=await f.request(repair);assert.equal(out.data.code,'FORBIDDEN');assert.equal(f.calls.some(c=>c.body?.p_command==='commit'),false);
 assert.equal(f.calls.at(-1).path,'/auth/v1/logout');assert.equal(f.calls.at(-1).authorization,'Bearer '+otherProofToken);
});

test('an expired/replayed database proof still revokes its temporary password session',async()=>{
 const f=fixture({commitCode:'PIN_REPAIR_EXPIRED'}),out=await f.request(repair);assert.equal(out.data.code,'PIN_REPAIR_EXPIRED');assert.equal(f.calls.at(-1).path,'/auth/v1/logout');
});

test('browser-supplied actor/proof flags, numeric or malformed PINs cannot reach repair service',async()=>{
 for(const body of [{...repair,actor:OTHER},{...repair,passwordVerified:true},{...repair,proofSession:PROOF},{...repair,newPin:246},{...repair,newPin:'123'},{...repair,newPin:'12345'},{...repair,currentPassword:''}]){
  const f=fixture(),out=await f.request(body);assert.equal(out.data.code,'INVALID_INPUT');assert.equal(f.calls.some(c=>c.path.endsWith('lumo_approved_pin_repair')),false);
 }
});

test('repeated signup with an existing profile cannot claim a newly chosen PIN was installed',async()=>{
 const f=fixture({existing:true}),out=await f.request({action:'register',handle:'legacy.test',password,displayName:'Fixture only',phone:'0249999901',pin:newPin});
 assert.equal(out.data.code,'EXISTING_ACCOUNT');assert.equal(out.data.session,undefined);assert.equal(f.calls.at(-1).path,'/auth/v1/logout');assert.equal(f.calls.some(c=>c.body?.p_action==='register.complete'),false);
});

test('a genuinely new registration still accepts the supplied four-digit PIN and returns its session',async()=>{
 const f=fixture(),out=await f.request({action:'register',handle:'legacy.test',password,displayName:'Fixture only',phone:'0249999901',pin:newPin});
 assert.equal(out.status,200);assert.equal(out.data.ok,true);assert.equal(out.data.session.access_token,proofToken);assert.equal(f.calls.find(c=>c.body?.p_command==='provision').body.p_payload.pin,newPin);
});

test('ordinary PIN changes continue to forward the current PIN to the existing server check',async()=>{
 const f=fixture(),out=await f.request({action:'changePin',currentPin:'3159',pin:newPin});assert.equal(out.data.ok,true);
 const change=f.calls.find(c=>c.body?.p_command==='pin.change');assert.equal(change.body.p_payload.oldPin,'3159');assert.equal(change.body.p_payload.newPin,newPin);assert.equal(f.calls.some(c=>c.path==='/auth/v1/token'),false);
});
