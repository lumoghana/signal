// Local PostgreSQL test setup. Never accepts a URL, external token, credentials,
// or an existing hosted customer. The caller supplies its isolated database.
import assert from 'node:assert/strict';
import {basename} from 'node:path';
import {createMerchantHandler} from '../supabase/functions/lumo-approved/merchant/handler.mjs';
import {hashToken} from '../supabase/functions/lumo-approved/merchant/server/network.js';

const guestFixtures=new Set(['guest-checkout-transaction.test.sql','guest-link-purpose-transaction.test.sql']);
const argumentTypes={p_command:'text',p_payload:'jsonb',p_actor:'uuid',p_session:'uuid',p_revision:'bigint',p_ledger_stamp:'text',p_state:'jsonb',p_money_authorized:'boolean',p_token_hash:'text',p_merchant_token_hash:'text',p_operation:'text'};

/** Seed a real merchant HTTP context before the runner's BEGIN / test / ROLLBACK.
 * Synthetic Auth rows + actual provision/signup/activation/receiver/publish code
 * execute in one local transaction. Only its hash-only QA context is retained in
 * a session GUC; this intentionally survives into the runner's next transaction.
 */
export async function prepareSqlFixture(db,name){
 const file=basename(String(name));if(!guestFixtures.has(file))return {prepared:false};
 if(typeof db?.transaction!=='function'||typeof db?.query!=='function')throw Error('Supply the isolated SQL test database.');
 return db.transaction(async tx=>{
  const userId=crypto.randomUUID(),sessionId=crypto.randomUUID(),suffix=crypto.randomUUID().replace(/-/g,'').slice(0,12);
  const handle='guestqa_'+suffix,phone='024'+String(Number.parseInt(suffix.slice(0,6),16)%10000000).padStart(7,'0');
  const identity={userId,sessionId,user:{email:handle+'@pilot.lumo.invalid'}};
  await tx.query("insert into auth.users(id,aud,role,email,raw_app_meta_data,email_confirmed_at,created_at,updated_at) values($1,'authenticated','authenticated',$2,'{\"lumo_pilot\":true}',now(),now(),now())",[userId,identity.user.email]);
  await tx.query('insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())',[sessionId,userId]);
  async function serviceRpc(functionName,args={}){
   assert.match(functionName,/^lumo_[a-z_]+$/);
   const entries=Object.entries(args);assert.ok(entries.every(([key])=>argumentTypes[key]),'Use a reviewed fixture RPC argument type.');
   await tx.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");
   await tx.exec('set local role service_role');
   try{
    const params=entries.map(([,v])=>v&&typeof v==='object'?JSON.stringify(v):v);
    const named=entries.map(([key],i)=>key+'=>$'+(i+1)+'::'+argumentTypes[key]).join(',');
    return (await tx.query('select public.'+functionName+'('+named+') as value',params)).rows[0].value;
   }finally{await tx.exec('reset role');}
  }
  const provision=await serviceRpc('lumo_approved_service',{p_command:'provision',p_payload:{actor:userId,session:sessionId,handle,displayName:'Synthetic QA owner',pin:'452913',mode:'merchant'}});
  assert.equal(provision.ok,true,'Synthetic shared Auth identity must provision. '+JSON.stringify(provision));
  const merchant=createMerchantHandler({serviceRpc,commerceEnabled:true,prototypeFaceOnly:true});
  let token='';
  const api=async(path,body)=>{
   const out=await merchant({identity,body:{action:'merchant',path,method:body===undefined?'GET':'POST',body:body||{},merchantToken:token}});
   assert.equal(out.ok,true,path+' fixture setup failed: '+JSON.stringify(out.message||out.error||out));
   return out;
  };
  const signup=await api('/api/signup',{name:'Synthetic QA merchant '+suffix,ownerName:'Synthetic QA owner',phone,businessType:'sole-trader',destination:'Sandbox QA destination',verification:{identity:true,face:true},shop:{name:'QA counter',area:'Legon',category:'Food',lat:5.65,lng:-.18},credentials:{username:handle,password:'SyntheticGuestFixture2026!'},attemptId:'qa-signup-'+suffix});
  token=signup.merchantToken;assert.match(token,/^[a-f0-9]{64}$/);
  const merchantId=signup.state.business.id,shopId=signup.state.shops[0].id,deviceId='qa-receiver-'+suffix;
  await api('/api/action',{type:'UPDATE_ACTIVATION',payload:{shopId,locationConfirmed:true,qrReady:true,ownerOperated:true}});
  await api('/api/devices',{shopId,deviceId,label:'Synthetic QA receiving phone'});
  await api('/api/devices/'+deviceId,{action:'test',soundReady:true,expectedFailureVersion:0});
  await api('/api/action',{type:'UPDATE_SHOP',payload:{id:shopId,published:true}});
  const context={actor:userId,authSession:sessionId,merchantTokenHash:await hashToken(token),merchantId,shopId};
  // Session-local to this isolated database, not transaction-local: the SQL
  // runner wraps each untouched test file in its own following transaction.
  await tx.query("select set_config('lumo.guest.test_context',$1,false)",[JSON.stringify(context)]);
  await tx.query("select set_config('request.jwt.claims','{}',false)");
  return {prepared:true,kind:'synthetic-merchant-http',fixture:file,context,hostedWrites:false};
 });
}
