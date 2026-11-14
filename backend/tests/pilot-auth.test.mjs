import test from 'node:test';
import assert from 'node:assert/strict';
import {createPilotAuthHandler} from '../supabase/functions/lumo-pilot-auth/handler.mjs';

const URL='https://project.supabase.co';
const KEY='test-service-role-key-never-return-this-value';
const USER='a0000000-0000-4000-8000-000000000001',ACCOUNT='b0000000-0000-4000-8000-000000000001',REG='c0000000-0000-4000-8000-000000000001';
const ACCOUNT_DATA={id:ACCOUNT,userId:USER,handle:'akua',displayName:'Akua',balance:0,currency:'GHS',sandbox:true};
const SESSION={access_token:'access-user-token',refresh_token:'refresh-user-token',expires_in:3600,token_type:'bearer',user:{id:USER,email:'akua@pilot.lumo.invalid',app_metadata:{provider:'email'},email_confirmed_at:'2026-11-12T00:00:00Z'}};
const REGISTER={handle:'akua',displayName:'Akua',password:'A-test-password-12',pin:'314159'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
function harness(overrides={}){
 const calls=[];
 const fetch=async(url,options)=>{
  const body=JSON.parse(options.body),path=new globalThis.URL(url).pathname,query=new globalThis.URL(url).search;calls.push({url,path,query,options,body});
  if(overrides.fetch){const response=await overrides.fetch({url,path,query,options,body,calls});if(response)return response;}
  if(path==='/rest/v1/rpc/lumo_pilot_bootstrap')return json(body.p_action==='register.reserve'?{ok:true,mode:overrides.mode||'new',registrationId:REG}:{ok:true});
  if(path==='/auth/v1/admin/users')return json({id:USER,email:'akua@pilot.lumo.invalid'});
  if(path==='/auth/v1/token')return json(SESSION);
  if(path==='/rest/v1/rpc/lumo_rpc')return json({ok:true,sandbox:true,currency:'GHS',account:ACCOUNT_DATA});
  if(path==='/auth/v1/logout')return new Response(null,{status:204});
  throw new Error('Unexpected test endpoint');
 };
 return {calls,handler:createPilotAuthHandler({supabaseUrl:URL,serviceRoleKey:KEY,allowedOrigins:['https://lumo.example','http://localhost:4173'],fetch}),request(action,body=REGISTER,headers={}){
  return this.handler(new Request(URL+'/functions/v1/lumo-pilot-auth/'+action,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}));
 }};
}

test('register creates only a synthetic test identity and opens a zero shared account under the user token',async()=>{
 const h=harness(),response=await h.request('register'),result=await response.json();
 assert.equal(response.status,200);assert.equal(result.access_token,SESSION.access_token);assert.equal(result.refresh_token,SESSION.refresh_token);assert.equal(result.user.id,USER);assert.equal(result.account.id,ACCOUNT);assert.equal(result.account.balance,0);assert.equal(result.contactVerified,false);assert.equal(result.sandbox,true);
 const create=h.calls.find(c=>c.path==='/auth/v1/admin/users');assert.equal(create.body.email,'akua@pilot.lumo.invalid');assert.equal(create.body.email_confirm,true);assert.deepEqual(create.body.app_metadata,{lumo_pilot:true,contact_verified:false});assert.equal(create.options.headers.Authorization,'Bearer '+KEY);
 const opened=h.calls.find(c=>c.path==='/rest/v1/rpc/lumo_rpc');assert.equal(opened.body.p_command,'account.open');assert.deepEqual(opened.body.p_payload,{handle:'akua',displayName:'Akua',pin:'314159'});assert.equal(opened.options.headers.Authorization,'Bearer '+SESSION.access_token);
 assert.equal(JSON.stringify(result).includes(KEY),false);assert.equal(JSON.stringify(result).includes(REGISTER.password),false);assert.equal(JSON.stringify(result).includes(REGISTER.pin),false);assert.equal('app_metadata' in result.user,false);assert.equal('email_confirmed_at' in result.user,false);
 for(const call of h.calls.filter(c=>c.path.endsWith('lumo_pilot_bootstrap'))){assert.equal(JSON.stringify(call.body).includes(REGISTER.password),false);assert.equal(JSON.stringify(call.body).includes(REGISTER.pin),false);}
});

test('login uses the same handle identity and regular password token endpoint, without creating another user',async()=>{
 const h=harness(),response=await h.request('login',{handle:' AKUA ',password:REGISTER.password});const result=await response.json();
 assert.equal(response.status,200);assert.equal(result.user.id,USER);assert.equal(result.account.id,ACCOUNT);assert.equal(h.calls.some(c=>c.path==='/auth/v1/admin/users'),false);
 assert.equal(h.calls.find(c=>c.path==='/auth/v1/token').query,'?grant_type=password');assert.equal(h.calls.find(c=>c.path==='/auth/v1/token').body.email,'akua@pilot.lumo.invalid');assert.equal(h.calls.at(-1).body.p_command,'account.get');
});

test('rate rejection occurs before any Auth operation and reveals no underlying diagnostics',async()=>{
 const h=harness({fetch:({path})=>path.endsWith('lumo_pilot_bootstrap')?json({ok:false,code:'RATE_LIMITED',debug:KEY}):null});
 for(const action of ['register','login']){const response=await h.request(action,action==='register'?REGISTER:{handle:'akua',password:REGISTER.password});assert.equal(response.status,429);const body=await response.text();assert.equal(body.includes(KEY),false);assert.equal(JSON.parse(body).error.code,'RATE_LIMITED');}
 assert.equal(h.calls.some(c=>c.path.startsWith('/auth/')),false);
});

test('unknown browser origins fail before reading credentials; approved origins get exact CORS headers',async()=>{
 const h=harness();const denied=await h.request('register',REGISTER,{origin:'https://attacker.example'});assert.equal(denied.status,403);assert.equal(h.calls.length,0);assert.equal(denied.headers.has('access-control-allow-origin'),false);
 const preflight=await h.handler(new Request(URL+'/functions/v1/lumo-pilot-auth/register',{method:'OPTIONS',headers:{origin:'https://lumo.example'}}));assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),'https://lumo.example');assert.equal(preflight.headers.get('access-control-allow-credentials'),null);assert.match(preflight.headers.get('access-control-allow-headers'),/apikey/);
 const ok=await h.request('register',REGISTER,{origin:'http://localhost:4173'});assert.equal(ok.status,200);assert.equal(ok.headers.get('access-control-allow-origin'),'http://localhost:4173');assert.equal(ok.headers.get('cache-control'),'no-store');
});

test('native requests work without Origin while invalid methods and routes do not reach upstream',async()=>{
 const h=harness();assert.equal((await h.request('register')).status,200);
 const initial=h.calls.length;assert.equal((await h.handler(new Request(URL+'/functions/v1/lumo-pilot-auth/login'))).status,405);assert.equal((await h.request('other')).status,404);assert.equal(h.calls.length,initial);
});

test('strict input and size validation rejects roles, real-contact substitutions and numeric PINs',async()=>{
 const h=harness();for(const payload of [{...REGISTER,app_metadata:{role:'admin'}},{...REGISTER,email:'person@example.com'},{...REGISTER,handle:'a.b'},{...REGISTER,displayName:1},{...REGISTER,displayName:'<script>'},{...REGISTER,pin:314159},{...REGISTER,password:'short'},{...REGISTER,password:'é'.repeat(37)}]){assert.equal((await h.request('register',payload)).status,400);}
 const oversized=await h.request('register',{...REGISTER,displayName:'a'.repeat(5000)});assert.equal(oversized.status,413);
 const advertised=await h.request('register',REGISTER,{'content-length':'5000'});assert.equal(advertised.status,413);assert.equal(h.calls.length,0);
});

test('partial Auth provisioning resumes using the same password and never deletes an identity or account',async()=>{
 const h=harness({mode:'resume'}),response=await h.request('register');assert.equal(response.status,200);assert.equal(h.calls.some(c=>c.path==='/auth/v1/admin/users'),false);
 assert.equal(h.calls.find(c=>c.path.endsWith('lumo_pilot_bootstrap')).body.p_action,'register.reserve');assert.equal(h.calls.some(c=>c.options.method==='DELETE'),false);
});

test('a committed Auth create with a lost response preserves the account and uses only a safe database abort check',async()=>{
 const h=harness({fetch:({path})=>{if(path==='/auth/v1/admin/users')throw new Error('Network failed after '+KEY+' password='+REGISTER.password);}});
 const response=await h.request('register'),body=await response.text();assert.equal(response.status,503);assert.equal(body.includes(KEY),false);assert.equal(body.includes(REGISTER.password),false);assert.equal(body.includes('Network failed'),false);assert.equal(h.calls.at(-1).body.p_action,'register.abort');assert.equal(h.calls.some(c=>c.options.method==='DELETE'),false);
});

test('a definitive rejected create releases an unused reservation before the user corrects its details',async()=>{
 const h=harness({fetch:({path,body})=>{
  if(path==='/auth/v1/admin/users')return json({error:KEY,code:'weak_password'},422);
  if(path.endsWith('lumo_pilot_bootstrap')&&body.p_action==='register.abort')return json({ok:true,identityPresent:false});
 }});
 const response=await h.request('register');assert.equal(response.status,400);assert.equal((await response.json()).error.code,'INVALID_INPUT');assert.equal(h.calls.some(c=>c.path==='/auth/v1/token'),false);assert.equal(h.calls.some(c=>c.path.endsWith('lumo_pilot_bootstrap')&&c.body.p_action==='register.abort'),true);
});

test('a create collision resumes only when the database confirms an existing canonical Auth identity',async()=>{
 const h=harness({fetch:({path,body})=>{
  if(path==='/auth/v1/admin/users')return json({error:'duplicate'},422);
  if(path.endsWith('lumo_pilot_bootstrap')&&body.p_action==='register.abort')return json({ok:true,identityPresent:true});
 }});
 const response=await h.request('register');assert.equal(response.status,200);assert.equal((await response.json()).user.id,USER);assert.equal(h.calls.some(c=>c.path==='/auth/v1/token'),true);
});

test('failed account opening revokes only the provisioning session, retaining its recoverable identity',async()=>{
 const h=harness({fetch:({path})=>path.endsWith('lumo_rpc')?json({ok:false,code:'HANDLE_TAKEN',message:KEY}):null});
 const response=await h.request('register'),body=await response.text();assert.equal(response.status,409);assert.equal(body.includes(SESSION.access_token),false);assert.equal(body.includes(KEY),false);assert.equal(h.calls.at(-1).path,'/auth/v1/logout');assert.equal(h.calls.some(c=>c.options.method==='DELETE'),false);
});

test('login with an unfinished account requires setup and does not return its temporary session',async()=>{
 const h=harness({fetch:({path})=>path.endsWith('lumo_rpc')?json({ok:false,code:'ACCOUNT_REQUIRED'}):null});
 const response=await h.request('login',{handle:'akua',password:REGISTER.password}),body=await response.json();assert.equal(response.status,409);assert.equal(body.error.code,'ACCOUNT_SETUP_REQUIRED');assert.equal('access_token' in body,false);assert.equal(h.calls.at(-1).path,'/auth/v1/logout');
});

test('wrong passwords have one safe error and cannot bind a registration or obtain an account',async()=>{
 const h=harness({fetch:({path})=>path==='/auth/v1/token'?json({error:'invalid_grant',error_description:KEY},400):null});
 const response=await h.request('login',{handle:'akua',password:REGISTER.password}),body=await response.json();assert.equal(response.status,401);assert.equal(body.error.code,'CREDENTIALS_INCORRECT');assert.equal(JSON.stringify(body).includes(KEY),false);assert.equal(h.calls.some(c=>c.path.endsWith('lumo_rpc')),false);
});

test('server-issued session and account identities must match before any credentials return',async()=>{
 for(const mismatch of [{...ACCOUNT_DATA,userId:'a0000000-0000-4000-8000-000000000002'},{...ACCOUNT_DATA,currency:'USD'},{...ACCOUNT_DATA,balance:-1}]){
  const h=harness({fetch:({path})=>path.endsWith('lumo_rpc')?json({ok:true,account:mismatch}):null});const response=await h.request('login',{handle:'akua',password:REGISTER.password});assert.equal(response.status,503);assert.equal((await response.text()).includes(SESSION.access_token),false);
 }
});

test('registration pending response does not launch a competing Auth create',async()=>{
 const h=harness({fetch:({path})=>path.endsWith('lumo_pilot_bootstrap')?json({ok:false,code:'REGISTRATION_PENDING'}):null});const response=await h.request('register');assert.equal(response.status,409);assert.equal((await response.json()).error.code,'REGISTRATION_PENDING');assert.equal(h.calls.length,1);
});

test('every rate request contains only hashed ingress address and no user credentials',async()=>{
 const h=harness();await h.request('login',{handle:'akua',password:REGISTER.password},{'x-forwarded-for':'198.51.100.4, 203.0.113.8'});const payload=h.calls[0].body.p_payload;assert.match(payload.ipHash,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(payload).includes('203.0.113'),false);assert.deepEqual(Object.keys(payload).sort(),['handle','ipHash']);
});
