import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminHandler} from '../supabase/functions/lumo-admin/handler.mjs';

const BASE='https://fixture.supabase.co',ORIGIN='https://admin.fixture.example';
const USER='10000000-0000-4000-8000-000000000001',OTHER='10000000-0000-4000-8000-000000000002';
const SESSION='20000000-0000-4000-8000-000000000001',FACTOR='30000000-0000-4000-8000-000000000001';
const CHALLENGE='40000000-0000-4000-8000-000000000001',SERVER_SECRET='fixture-service-role-must-never-reach-client';
const jwt=(claims={})=>'header.'+Buffer.from(JSON.stringify({sub:USER,session_id:SESSION,aal:'aal2',exp:Math.floor(Date.now()/1000)+600,...claims})).toString('base64url')+'.signature';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});

function fixture(options={}){
 const calls=[],accessToken=jwt(options.claims),staff={userId:USER,displayName:'Fixture operator',role:'support',status:'active'};
 const factors=options.factors||(options.noVerifiedFactor?[]:[{id:FACTOR,factor_type:'totp',status:'verified',friendly_name:'Fixture authenticator'}]);
 const session={access_token:accessToken,refresh_token:'fixture-refresh-token',user:{id:USER}};
 const handler=createAdminHandler({supabaseUrl:BASE,serviceRoleKey:SERVER_SECRET,allowedOrigins:[ORIGIN],fetch:async(url,init)=>{
  const path=new URL(url).pathname,body=init.body?JSON.parse(init.body):undefined;
  calls.push({path,body,method:init.method,authorization:init.headers.Authorization});
  if(path==='/auth/v1/user')return options.rejectToken?json({message:SERVER_SECRET},401):json({id:options.upstreamUserId||USER,email:'operator@example.com',app_metadata:{lumo_pilot:true},factors});
  if(path==='/auth/v1/token')return options.rejectLogin?json({message:SERVER_SECRET+' password fixture-password'},options.loginStatus||400):json({...session,user:{id:options.passwordUserId||USER}});
  if(path==='/auth/v1/logout')return json({ok:true});
  if(path==='/auth/v1/admin/users')return options.existingAuth?json({message:SERVER_SECRET},422):json({id:USER});
  if(path==='/auth/v1/admin/users/'+USER)return json({ok:true});
  if(path==='/rest/v1/rpc/lumo_admin_service'){
   if(body.p_command==='setup.reserve')return json(options.rejectSetup?{ok:false,code:'INVALID_SETUP_TOKEN',message:SERVER_SECRET}:{ok:true,data:{reserved:true}});
   if(body.p_command==='setup.complete')return json(options.failComplete?{ok:false,code:'SERVICE_UNAVAILABLE',message:SERVER_SECRET}:{ok:true,data:{staff}});
   if(body.p_command==='session')return json(options.staffDenied?{ok:false,code:options.staffCode||'STAFF_REQUIRED',message:SERVER_SECRET}:{ok:true,data:{staff,requiresMfa:options.claims?.aal==='aal1'}});
   if(options.rpcFailure)throw Error(SERVER_SECRET);
   if(options.denyOperation)return json({ok:false,code:'FORBIDDEN',message:SERVER_SECRET});
   return json({ok:true,data:{command:body.p_command,rows:[],total:0,page:1,pageSize:25}});
  }
  if(path==='/auth/v1/factors')return json({id:FACTOR,type:'totp',totp:{qr_code:'data:image/svg+xml;base64,PHN2Zy8+',secret:'fixture-totp-secret'}});
  if(path==='/auth/v1/factors/'+FACTOR&&init.method==='DELETE')return json({id:FACTOR});
  if(path==='/auth/v1/factors/'+FACTOR+'/challenge')return json({id:CHALLENGE,expires_at:Date.now()/1000+120});
  if(path==='/auth/v1/factors/'+FACTOR+'/verify')return json(session);
  throw Error('Unexpected fixture path '+path);
 }});
 async function request(body,{token=accessToken,origin=ORIGIN,method='POST',contentType='application/json',raw}={}){
  const headers={'Content-Type':contentType};if(origin!==null)headers.Origin=origin;if(token!==null)headers.Authorization='Bearer '+token;
  const response=await handler(new Request(BASE+'/functions/v1/lumo-admin',{method,headers,...(method==='POST'?{body:raw??JSON.stringify(body)}:{})}));
  return {status:response.status,headers:response.headers,data:response.status===204?null:await response.json()};
 }
 return {calls,request,accessToken};
}
const rpcCalls=f=>f.calls.filter(c=>c.path==='/rest/v1/rpc/lumo_admin_service');
const operationalCalls=f=>rpcCalls(f).filter(c=>!['session','setup.reserve','setup.complete'].includes(c.body.p_command));

test('admin rejects unapproved browser origins before credentials or database calls',async()=>{
 const f=fixture(),out=await f.request({action:'login',email:'operator@example.com',password:'fixture-password'},{origin:'https://hostile.example'});
 assert.equal(out.status,403);assert.equal(out.data.code,'ORIGIN_NOT_ALLOWED');assert.equal(f.calls.length,0);assert.equal(out.headers.get('Access-Control-Allow-Origin'),null);
});

test('admin preflight has an exact allowed origin and no upstream work',async()=>{
 const f=fixture(),out=await f.request(undefined,{method:'OPTIONS'});
 assert.equal(out.status,204);assert.equal(out.headers.get('Access-Control-Allow-Origin'),ORIGIN);assert.equal(f.calls.length,0);
});

test('missing, rejected, expired and mismatched tokens never reach operational queries',async()=>{
 for(const [options,requestOptions] of [[{},{token:null}],[{rejectToken:true},{}],[{claims:{exp:1}},{}],[{claims:{sub:OTHER}},{}]]){
  const f=fixture(options),out=await f.request({action:'rpc',command:'overview'},requestOptions);
  assert.equal(out.status,401);assert.equal(out.data.ok,false);assert.equal(operationalCalls(f).length,0);
 }
});

test('consumer pilot metadata alone does not grant staff access',async()=>{
 const f=fixture({staffDenied:true}),out=await f.request({action:'rpc',command:'customers.list'});
 assert.equal(out.status,403);assert.equal(out.data.code,'STAFF_REQUIRED');assert.equal(operationalCalls(f).length,0);
});

test('revoked live staff sessions cannot inspect records',async()=>{
 const f=fixture({staffDenied:true,staffCode:'SESSION_REVOKED'}),out=await f.request({action:'rpc',command:'customers.get',payload:{id:OTHER}});
 assert.equal(out.status,401);assert.equal(out.data.code,'SESSION_REVOKED');assert.equal(operationalCalls(f).length,0);
});

test('aal1 allows staff MFA state but never operational data or invitation creation',async()=>{
 const f=fixture({claims:{aal:'aal1'}}),state=await f.request({action:'session'});
 assert.equal(state.status,200);assert.equal(state.data.data.mfaRequired,true);assert.equal(state.data.data.staff.role,'support');
 for(const body of [{action:'rpc',command:'overview'},{action:'invite',email:'invitee@example.com',name:'Invitee',role:'super_admin'}]){
  const out=await f.request(body);assert.equal(out.status,403);assert.equal(out.data.code,'MFA_REQUIRED');
 }
 assert.equal(operationalCalls(f).length,0);
});

test('aal2 without a currently verified TOTP factor still cannot read or mutate',async()=>{
 const f=fixture({noVerifiedFactor:true}),out=await f.request({action:'rpc',command:'cases.create',payload:{subject:'Fixture'}});
 assert.equal(out.status,403);assert.equal(out.data.code,'MFA_REQUIRED');assert.equal(operationalCalls(f).length,0);
});

test('operational identity is always verified identity even when payload supplies another actor and aal',async()=>{
 const f=fixture(),out=await f.request({action:'rpc',command:'cases.list',payload:{actor:OTHER,session:OTHER,aal:'aal1',page:2}});
 assert.equal(out.status,200);const operation=operationalCalls(f).at(-1);
 assert.equal(operation.body.p_payload.actor,USER);assert.equal(operation.body.p_payload.session,SESSION);assert.equal(operation.body.p_payload.aal,'aal2');assert.equal(operation.body.p_payload.page,2);
 assert.equal(out.headers.get('Cache-Control'),'no-store');assert.equal(out.headers.get('Referrer-Policy'),'no-referrer');assert.ok(!JSON.stringify(out.data).includes(SERVER_SECRET));
});

test('database role denial cannot be bypassed and does not expose upstream diagnostic text',async()=>{
 const f=fixture({denyOperation:true}),out=await f.request({action:'rpc',command:'services.update',payload:{mode:'automatic'}});
 assert.equal(out.status,403);assert.equal(out.data.code,'FORBIDDEN');assert.ok(!JSON.stringify(out.data).includes(SERVER_SECRET));
});

test('unknown RPC names and malformed bodies fail closed without dispatching arbitrary procedures',async()=>{
 for(const body of [{action:'rpc',command:'setup.complete',payload:{}},{action:'rpc',command:'delete_all_records',payload:{}},{action:'rpc',command:'overview',payload:[]},{action:'rpc',command:'overview',payload:'{}'}]){
  const f=fixture(),out=await f.request(body);assert.equal(out.data.ok,false);assert.equal(operationalCalls(f).length,0);
 }
 const f=fixture(),out=await f.request(null,{raw:'{"action":'});assert.equal(out.status,400);assert.equal(f.calls.length,0);
});

test('MFA challenge and verification are bound to the authenticated user factor',async()=>{
 const f=fixture({claims:{aal:'aal1'}}),bad=await f.request({action:'mfa.challenge',factorId:OTHER});
 assert.equal(bad.status,400);assert.equal(f.calls.some(c=>c.path.includes('/factors/')),false);
 const good=await f.request({action:'mfa.challenge',factorId:FACTOR});assert.equal(good.status,200);
 const challenge=f.calls.find(c=>c.path.endsWith('/challenge'));assert.equal(challenge.authorization,'Bearer '+f.accessToken);
 const verify=await f.request({action:'mfa.verify',factorId:FACTOR,challengeId:CHALLENGE,code:'123456'});assert.equal(verify.status,200);
 assert.equal(f.calls.find(c=>c.path.endsWith('/verify')).authorization,'Bearer '+f.accessToken);
});

test('restarting MFA enrollment discards only the current user unverified factor',async()=>{
 const f=fixture({claims:{aal:'aal1'},factors:[{id:FACTOR,factor_type:'totp',status:'unverified'}]}),out=await f.request({action:'mfa.enroll'});
 assert.equal(out.status,200);const removal=f.calls.find(c=>c.method==='DELETE');assert.equal(removal.path,'/auth/v1/factors/'+FACTOR);assert.equal(removal.authorization,'Bearer '+f.accessToken);
 assert.ok(f.calls.indexOf(removal)<f.calls.findIndex(c=>c.path==='/auth/v1/factors'));
 const verified=fixture({claims:{aal:'aal1'}}),blocked=await verified.request({action:'mfa.enroll'});
 assert.equal(blocked.status,409);assert.equal(verified.calls.some(c=>c.method==='DELETE'),false);
});

test('credential errors and thrown transport diagnostics never leak secrets or passwords',async()=>{
 const f=fixture({rejectLogin:true}),login=await f.request({action:'login',email:'operator@example.com',password:'fixture-password'});
 assert.equal(login.status,401);assert.ok(!JSON.stringify(login.data).includes('fixture-password'));assert.ok(!JSON.stringify(login.data).includes(SERVER_SECRET));
 const broken=fixture({rpcFailure:true}),out=await broken.request({action:'rpc',command:'overview'});
 assert.equal(out.status,503);assert.equal(out.data.code,'SERVICE_UNAVAILABLE');assert.ok(!JSON.stringify(out.data).includes(SERVER_SECRET));
});

test('a refresh session for a disabled staff account is revoked before tokens return',async()=>{
 const f=fixture({staffDenied:true}),out=await f.request({action:'refresh',refreshToken:'fixture-refresh-token'});
 assert.equal(out.data.ok,false);assert.equal(out.data.session,undefined);assert.equal(f.calls.at(-1).path,'/auth/v1/logout');assert.equal(f.calls.at(-1).authorization,'Bearer '+f.accessToken);
});

test('expired or mismatched setup reservations cannot create an Auth identity',async()=>{
 const f=fixture({rejectSetup:true}),out=await f.request({action:'setup',token:'a'.repeat(43),email:'operator@example.com',name:'Fixture operator',password:'Fixture-password-1234',role:'super_admin'});
 assert.equal(out.data.code,'INVALID_SETUP_TOKEN');assert.equal(f.calls.some(c=>c.path==='/auth/v1/admin/users'),false);
 const reserve=rpcCalls(f).at(-1);assert.equal(reserve.body.p_payload.role,undefined);assert.match(reserve.body.p_payload.tokenHash,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(reserve.body).includes('a'.repeat(43)));
});

test('an uncertain setup completion never deletes a potentially committed staff identity',async()=>{
 const f=fixture({failComplete:true}),out=await f.request({action:'setup',token:'a'.repeat(43),email:'operator@example.com',name:'Fixture operator',password:'Fixture-password-1234'});
 assert.equal(out.data.ok,false);assert.equal(f.calls.some(c=>c.method==='DELETE'),false);
});

test('interrupted setup can attach an existing identity only after its password authenticates',async()=>{
 const body={action:'setup',token:'a'.repeat(43),email:'operator@example.com',name:'Fixture operator',password:'Fixture-password-1234'};
 const wrong=fixture({existingAuth:true,rejectLogin:true}),denied=await wrong.request(body);
 assert.equal(denied.data.ok,false);assert.equal(rpcCalls(wrong).some(c=>c.body.p_command==='setup.complete'),false);
 const existing=fixture({existingAuth:true}),out=await existing.request(body);
 assert.equal(out.status,200);const completion=rpcCalls(existing).find(c=>c.body.p_command==='setup.complete');assert.equal(completion.body.p_payload.userId,USER);
 assert.ok(existing.calls.findIndex(c=>c.path==='/auth/v1/token')<existing.calls.indexOf(completion));
 const mismatch=fixture({passwordUserId:OTHER}),bad=await mismatch.request(body);
 assert.equal(bad.data.ok,false);assert.equal(rpcCalls(mismatch).some(c=>c.body.p_command==='setup.complete'),false);
});

test('invitation tokens are hashed for storage and privilege remains a database decision',async()=>{
 const f=fixture({denyOperation:true}),out=await f.request({action:'invite',email:'invitee@example.com',name:'Invitee',role:'super_admin'});
 assert.equal(out.data.code,'FORBIDDEN');assert.equal(out.data.invitationToken,undefined);
 const invitation=operationalCalls(f).at(-1);assert.equal(invitation.body.p_command,'staff.invite');assert.match(invitation.body.p_payload.tokenHash,/^[a-f0-9]{64}$/);assert.equal(invitation.body.p_payload.actor,USER);
 const invalid=fixture(),bad=await invalid.request({action:'invite',email:'invitee@example.com',name:'Invitee',role:'database_owner'});assert.equal(bad.status,400);assert.equal(operationalCalls(invalid).length,0);
});
