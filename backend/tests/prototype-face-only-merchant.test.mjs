import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createMerchantHandler} from '../supabase/functions/lumo-approved/merchant/handler.mjs';
import {emptyNetwork} from '../supabase/functions/lumo-approved/merchant/server/network.js';

const password='Merchant-review-password-2026',clone=value=>structuredClone(value);
const identity=handle=>({userId:crypto.randomUUID(),sessionId:crypto.randomUUID(),user:{email:handle+'@pilot.lumo.invalid'}});
function fixture(prototypeFaceOnly){
 let state=emptyNetwork(),revision=0,calls=0;
 const serviceRpc=async(name,p)=>{
  calls++;
  if(name==='lumo_approved_merchant_read')return {ok:true,state:clone(state),revision,ledger:[],requests:[],balances:{},ledgerStamp:''};
  assert.equal(name,'lumo_approved_merchant_commit');
  if(p.p_revision!==revision)return {ok:false,code:'CONCURRENT_UPDATE'};
  state=clone(p.p_state);return {ok:true,revision:++revision};
 };
 const make=mode=>createMerchantHandler({serviceRpc,...(mode===undefined?{}:{prototypeFaceOnly:mode})});
 let handler=make(prototypeFaceOnly);
 return {
  api:(who,path,body,token)=>handler({identity:who,body:{action:'merchant',path,method:body?'POST':'GET',body:body||{},merchantToken:token}}),
  setMode:mode=>{handler=make(mode)},read:()=>clone(state),calls:()=>calls
 };
}
function registration(handle){return {name:'Review Kitchen',ownerName:'Akua Owner',phone:'0240000001',businessType:'sole-trader',destination:'Test destination',verification:{identity:true,face:true},shop:{name:'Night Market',area:'Legon',category:'Food',lat:5.65,lng:-.18},credentials:{username:handle,password},attemptId:'signup-'+crypto.randomUUID()};}
async function owner(f,handle='review.owner',extra={}){const who=identity(handle),payload={...registration(handle),...extra},result=await f.api(who,'/api/signup',payload);assert.equal(result.ok,true,result.message);return {who,payload,result,token:result.merchantToken};}
function assertNoKey(result){
 assert.equal(result.recoveryKey,undefined);assert.equal(result.recoveryKeyReference,undefined);assert.equal(result.recoveryAction,undefined);assert.equal(result.keyUnavailable,undefined);
 assert.equal(result.recoveryKeyAvailable,false);assert.equal(result.requiresRecoveryKey,false);
 if(result.session){assert.equal(result.session.recoveryKeyPending,false);assert.equal(result.session.recoveryKeyReference,null);}
 for(const session of result.sessions||[]){assert.equal(session.recoveryKeyPending,false);assert.equal(session.recoveryKeyReference,null);}
}

test('pilot merchant owner signup and lost-response retry issue no key or checkpoint',async()=>{
 const f=fixture(true),o=await owner(f);assertNoKey(o.result);
 const saved=f.read().users[0];assert.equal(saved.recoveryHash,null);assert.equal(saved.recoveryKeyPending,false);assert.equal(saved.recoveryKeyReference,null);assert.equal(saved.recoveryKeyIssuedAt,null);
 const replay=await f.api(o.who,'/api/signup',o.payload);assert.equal(replay.ok,true,replay.message);assert.equal(replay.replayed,true);assertNoKey(replay);assert.equal(f.read().users.length,1);assert.equal(Object.keys(f.read().businesses).length,1);
 assertNoKey(await f.api(o.who,'/api/session',null,replay.merchantToken));
 const denied=await f.api({...o.who,userId:crypto.randomUUID()},'/api/session',null,replay.merchantToken);assert.equal(denied.ok,false);assert.equal(denied.code,'FORBIDDEN');
});

test('pilot staff invitation acceptance and retry issue no key and preserve staff scope',async()=>{
 const f=fixture(true),o=await owner(f),shopId=o.result.state.shops[0].id;
 const invite=await f.api(o.who,'/api/invitations',{name:'Review Cashier',phone:'0240000002',role:'cashier',shopIds:[shopId]},o.token);assert.equal(invite.ok,true,invite.message);
 const who=identity('review.cashier'),payload={token:invite.invitation.token,username:'review.cashier',password};
 const accepted=await f.api(who,'/api/invitations/accept',payload);assert.equal(accepted.ok,true,accepted.message);assertNoKey(accepted);assert.equal(accepted.user.role,'cashier');assert.deepEqual(accepted.user.shopIds,[shopId]);
 const retry=await f.api(who,'/api/invitations/accept',payload);assert.equal(retry.ok,true,retry.message);assert.equal(retry.replayed,true);assertNoKey(retry);assert.equal(f.read().users.filter(user=>user.username==='review.cashier').length,1);
 const saved=f.read().users.find(user=>user.username==='review.cashier');assert.equal(saved.recoveryHash,null);assert.equal(saved.recoveryKeyPending,false);
 const denied=await f.api(who,'/api/invitations',{name:'Forbidden',phone:'0240000003',role:'cashier',shopIds:[shopId]},retry.merchantToken);assert.equal(denied.ok,false);assert.equal(denied.code,'OWNER_REQUIRED');
});

test('pilot hides historical pending keys without rewriting saved credentials',async()=>{
 const f=fixture(),o=await owner(f);assert.ok(o.result.recoveryKey);assert.equal(o.result.session.recoveryKeyPending,true);
 const old=f.read().users[0];f.setMode(true);
 const result=await f.api(o.who,'/api/session',null,o.token);assert.equal(result.ok,true,result.message);assertNoKey(result);
 const saved=f.read().users[0];for(const key of ['recoveryHash','recoveryKeyPending','recoveryKeyReference','recoveryKeyIssuedAt','password','sessionVersion'])assert.deepEqual(saved[key],old[key],key);
});

test('pilot key regeneration and acknowledgement cannot be reached through aliases or client hints',async()=>{
 const f=fixture(true),o=await owner(f),before=f.calls();
 for(const path of ['/api/auth/recovery-key','/api/auth/recovery-key/','/api/auth/recovery-key/ack','/api/auth/recovery-key/ack/','/api/recovery/start','/api/recovery/complete','/api/auth/username/recover']){
  const result=await f.api(o.who,path,{currentPassword:password,recoveryKey:'LUMO-OLD',reference:'old',prototypeFaceOnly:false},o.token);assert.equal(result.ok,false,path);assert.equal(result.code,'UNAVAILABLE_SERVICE',path);
 }
 assert.equal(f.calls(),before,'disabled key routes stop before storage reads or writes');assert.equal(f.read().users[0].recoveryHash,null);
});

test('default and non-boolean opt-in retain protected key setup despite client flags',async()=>{
 for(const mode of [undefined,false,'true']){
  const f=fixture(mode),o=await owner(f,'protected.owner',{prototypeFaceOnly:true,recoveryMode:'prototype-face-only'});assert.ok(o.result.recoveryKey);assert.equal(o.result.session.recoveryKeyPending,true);assert.ok(f.read().users[0].recoveryHash);
  const rotated=await f.api(o.who,'/api/auth/recovery-key',{currentPassword:password},o.token);assert.equal(rotated.ok,true,rotated.message);assert.ok(rotated.recoveryKey);assert.notEqual(rotated.recoveryKey,o.result.recoveryKey);
 }
});

test('merchant entrypoint opts in only the exact sandbox pilot and follows the access recovery mode',async()=>{
 const source=(await readFile(new URL('../supabase/functions/lumo-approved/index.ts',import.meta.url),'utf8')).replace(/^import .*;\s*$/gm,'');
 for(const [values,expected] of [
  [{SUPABASE_URL:'https://iwutbrljiiodamtyoorg.supabase.co'},true],
  [{SUPABASE_URL:'https://iwutbrljiiodamtyoorg.supabase.co/'},true],
  [{SUPABASE_URL:'https://other-project.supabase.co'},false],
  [{SUPABASE_URL:'https://iwutbrljiiodamtyoorg.supabase.co',LUMO_ACCESS_MODE:'production'},false],
  [{SUPABASE_URL:'https://iwutbrljiiodamtyoorg.supabase.co',LUMO_ACCESS_RECOVERY_MODE:'protected'},false]
 ]){
  let options;
  vm.runInNewContext(source,{Deno:{env:{get:name=>values[name]},serve(){}},WeakMap,console,createApprovedHandler:config=>{config.merchantHandler({});return ()=>{}},createMerchantHandler:config=>{options=config;return ()=>{}},withOperationEvents:handler=>handler});
  assert.equal(options.prototypeFaceOnly,expected,JSON.stringify(values));
 }
});
