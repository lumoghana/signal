import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createD1} from '../scripts/d1-adapter.mjs';
import {handleAPI} from '../server/api.js';
import {readNetwork,updateNetwork} from '../server/network.js';
import {reduceBusiness} from '../dist/domain.js';

const delay=()=>new Promise(resolve=>setTimeout(resolve,5));
function setup({latency=false}={}){
 const raw=createD1();for(const file of ['0000_shared_sandbox.sql','0001_sharded_state.sql'])raw.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const wrap=statement=>({...statement,bind(...args){return wrap(statement.bind(...args))},async first(...args){await delay();return statement.first(...args)},async all(...args){await delay();return statement.all(...args)}});
 const DB=latency?{...raw,prepare:sql=>wrap(raw.prepare(sql)),async batch(statements){await delay();return raw.batch(statements)}}:raw;
 const env={DB};
 const client=()=>{const cookies=new Map();return {async call(path,body){const headers={'X-Lumo-Request':'1',Origin:'https://lumo.test','cf-connecting-ip':crypto.randomUUID()};if(body!==undefined)headers['Content-Type']='application/json';headers.Cookie=[...cookies].map(([k,v])=>k+'='+v).join('; ');const response=await handleAPI(new Request('https://lumo.test'+path,{method:body===undefined?'GET':'POST',headers,...(body===undefined?{}:{body:JSON.stringify(body)})}),env);for(const cookie of response.headers.getSetCookie()){const [k,...v]=cookie.split(';')[0].split('=');cookies.set(k,v.join('='))}return {status:response.status,data:await response.json()}}}};
 return {env,raw,client,close:()=>raw.close()};
}
const signup=tag=>({name:'Tenant '+tag,ownerName:'Test Owner',phone:'0245550100',businessType:'sole-trader',destination:'Sandbox bank 123',verification:{phone:true,identity:true,face:true},shop:{name:'Shop '+tag,area:'Night Market',category:'Food',lat:5.65,lng:-.18},attemptId:crypto.randomUUID(),credentials:{username:'tenant.'+tag,password:'OwnerTest1234'}});

test('twenty independent API wallets and merchants complete overlapping funding and payments with remote D1 latency',async()=>{
 const t=setup({latency:true});try{
  const cases=[];
  for(let i=0;i<20;i++){const owner=t.client(),student=t.client(),registered=await owner.call('/api/signup',signup('parallel'+i));assert.equal(registered.status,201);assert.equal((await student.call('/api/student/open',{name:'Student '+i})).status,201);cases.push({owner,student,shopId:registered.data.state.shops[0].id,testKey:registered.data.state.shops[0].testAcceptanceToken,businessId:registered.data.state.business.id})}
  const funding=await Promise.all(cases.map(({student},i)=>student.call('/api/student/fund',{amount:2000,confirmSandbox:true,attemptId:'fund-'+i})));
  assert.ok(funding.every(result=>result.status===200),JSON.stringify(funding.map(result=>({status:result.status,code:result.data.code}))));
  const payments=await Promise.all(cases.map(({student,shopId,testKey},i)=>student.call('/api/payments',{shopId,testKey,amount:1000,attemptId:'pay-'+i})));
  assert.ok(payments.every(result=>result.status===201),JSON.stringify(payments.map(result=>({status:result.status,code:result.data.code}))));
  assert.equal(new Set(payments.map(result=>result.data.revision)).size,20,'each completed response has a unique monotonic commit revision');
  const network=await readNetwork(t.env);assert.equal(Object.values(network.state.wallets).length,20);
  assert.ok(Object.values(network.state.wallets).every(wallet=>wallet.balance===1000&&wallet.entries.length===2));
  assert.ok(cases.every(({businessId})=>network.state.businesses[businessId].transactions.length===1));
  const replay=await Promise.all(cases.map(({student,shopId,testKey},i)=>student.call('/api/payments',{shopId,testKey,amount:1000,attemptId:'pay-'+i})));
  assert.ok(replay.every(result=>result.status===201&&result.data.replayed===true));
  assert.equal((await t.raw.prepare('SELECT COUNT(*) AS total FROM lumo_commit_guard').first()).total,0);
 }finally{t.close()}
});

test('scope guards reject access revocation and newly inserted dependencies before a payment batch can commit',async()=>{
 const t=setup();try{
  const owner=t.client(),registered=await owner.call('/api/signup',signup('fence')),shopId=registered.data.state.shops[0].id,testKey=registered.data.state.shops[0].testAcceptanceToken;
  const invite=await owner.call('/api/invitations',{name:'Cashier',phone:'0555550101',role:'cashier',shopIds:[shopId]}),cashier=t.client(),accepted=await cashier.call('/api/invitations/accept',{token:invite.data.invitation.token,username:'cashier.fence',password:'CashierTest123'});
  const before=(await readNetwork(t.env)).state,original=t.env.DB.batch;let injected=false,checked=false;
  t.env.DB.batch=async statements=>{
   if(!injected){injected=true;const id='user:'+accepted.data.user.id;await t.raw.prepare("UPDATE lumo_records SET revision=revision+1, document=json_set(document,'$.active',json('false')) WHERE id=?").bind(id).run();const blocked=await original(statements);assert.equal(blocked[0].meta.changes,0);assert.equal((await readNetwork(t.env)).state.businesses[registered.data.state.business.id].requests.length,before.businesses[registered.data.state.business.id].requests.length);checked=true;return blocked}
   return original(statements);
  };
  const request=await cashier.call('/api/action',{type:'CREATE_REQUEST',payload:{shopId,amount:1000}});assert.equal(request.status,401);assert.equal(checked,true);
 }finally{t.close()}
});

test('a new same-tenant dependency invalidates the mutation snapshot and survives retry',async()=>{
 const t=setup();try{
  const owner=t.client(),registered=await owner.call('/api/signup',signup('phantom')),businessId=registered.data.state.business.id;
  const original=t.env.DB.batch;let inject=true,retries=0;
  t.env.DB.batch=async statements=>{if(inject){inject=false;const createdAt=new Date().toISOString(),document={id:'audit-inserted',businessId,createdAt};await t.raw.prepare('INSERT INTO lumo_records(id,kind,tenant_id,revision,document,updated_at) VALUES (?,?,?,?,?,?)').bind('audit:audit-inserted','audit',businessId,1,JSON.stringify(document),createdAt).run();const blocked=await original(statements);assert.equal(blocked[0].meta.changes,0);return blocked}return original(statements)};
  await updateNetwork(t.env,n=>{retries++;n.businesses[businessId].business.name='After dependency';return {}});
  assert.equal(retries,2);assert.ok((await readNetwork(t.env)).state.audit.some(entry=>entry.id==='audit-inserted'));
 }finally{t.close()}
});

test('cross-merchant username allocation remains unique under concurrent invitation acceptance',async()=>{
 const t=setup({latency:true});try{
  const owners=[t.client(),t.client()],students=[t.client(),t.client()],tokens=[];
  for(let i=0;i<2;i++){const registered=await owners[i].call('/api/signup',signup('username'+i)),invited=await owners[i].call('/api/invitations',{name:'Cashier '+i,phone:'055555010'+i,role:'cashier',shopIds:[registered.data.state.shops[0].id]});tokens.push(invited.data.invitation.token)}
  const accepted=await Promise.all(tokens.map((token,i)=>students[i].call('/api/invitations/accept',{token,username:'same.unique',password:'CashierTest123'})));
  assert.deepEqual(accepted.map(result=>result.status).sort(),[201,400]);
  assert.equal((await readNetwork(t.env)).state.users.filter(user=>user.username==='same.unique').length,1);
 }finally{t.close()}
});

test('shop status and readiness reject non-booleans atomically in domain and API',async()=>{
 const t=setup();try{
  const owner=t.client(),registered=await owner.call('/api/signup',signup('booleans')),shopId=registered.data.state.shops[0].id,testKey=registered.data.state.shops[0].testAcceptanceToken;
  const paused=await owner.call('/api/action',{type:'UPDATE_SHOP',payload:{id:shopId,open:false,accepting:false}});assert.equal(paused.status,200);
  const snapshot=structuredClone(paused.data.state);
  for(const [type,fields] of [['UPDATE_SHOP',['open','accepting','published']],['UPDATE_ACTIVATION',['locationConfirmed','qrReady','ownerOperated']]])for(const field of fields)for(const value of ['false','true',0,1,null,{},[]]){
   const payload={id:shopId,shopId,[field]:value};assert.throws(()=>reduceBusiness(snapshot,type,payload,{role:'owner'}),/true or false|published/);assert.deepEqual(snapshot,paused.data.state);
   const response=await owner.call('/api/action',{type,payload});assert.equal(response.status,400,field+' '+JSON.stringify(value));
  }
  const current=await owner.call('/api/session');assert.equal(current.data.state.shops[0].open,false);assert.equal(current.data.state.shops[0].accepting,false);assert.equal(current.data.state.shops[0].published,false);assert.equal(current.data.state.shops[0].activation.locationConfirmed,false);
  const restored=await owner.call('/api/action',{type:'UPDATE_SHOP',payload:{id:shopId,open:true,accepting:true}});assert.equal(restored.status,200);assert.equal(restored.data.state.shops[0].accepting,true);
 }finally{t.close()}
});

// A combined owner/student browser receives the wallet in merchant responses.
// Hold a merchant write after it computes its response, fund the read-only wallet,
// then let the merchant commit: it must retry before assigning a newer revision.
test('mutation response guards include read-only wallet snapshots before certifying their revision',async()=>{
 const t=setup();try{
  const owner=t.client(),registered=await owner.call('/api/signup',signup('response')),shopId=registered.data.state.shops[0].id,testKey=registered.data.state.shops[0].testAcceptanceToken;
  await owner.call('/api/student/open',{name:'Owner student sandbox'});
  await owner.call('/api/student/fund',{amount:1000,confirmSandbox:true,attemptId:'before'});
  const original=t.env.DB.batch;let injected=false,checked=false,fundingRevision;
  t.env.DB.batch=async statements=>{
   if(!injected){injected=true;const funded=await owner.call('/api/student/fund',{amount:2000,confirmSandbox:true,attemptId:'concurrent'});assert.equal(funded.status,200);fundingRevision=funded.data.revision;const blocked=await original(statements);assert.equal(blocked[0].meta.changes,0);checked=true;return blocked}
   return original(statements);
  };
  const changed=await owner.call('/api/action',{type:'UPDATE_SHOP',payload:{id:shopId,hours:'8 am – 9 pm'}});
  assert.equal(changed.status,200);assert.equal(checked,true);assert.equal(changed.data.student.balance,3000);assert.ok(changed.data.revision>fundingRevision);
 }finally{t.close()}
});

test('a failure inside the guarded batch rolls back merchant, wallet and retry records together',async()=>{
 const t=setup();try{
  const owner=t.client(),student=t.client(),registered=await owner.call('/api/signup',signup('rollback')),shopId=registered.data.state.shops[0].id,testKey=registered.data.state.shops[0].testAcceptanceToken;
  await student.call('/api/student/open',{name:'Rollback student'});await student.call('/api/student/fund',{amount:5000,confirmSandbox:true,attemptId:'fund'});
  const original=t.env.DB.batch;let injected=false;
  t.env.DB.batch=async statements=>{if(!injected){injected=true;return original([...statements.slice(0,3),t.raw.prepare('SELECT __lumo_missing_function()')])}return original(statements)};
  const failed=await student.call('/api/payments',{shopId,testKey,amount:1000,attemptId:'atomic-payment'});assert.ok(failed.status>=400);
  const after=(await readNetwork(t.env)).state;assert.equal(Object.values(after.wallets)[0].balance,5000);assert.equal(after.businesses[registered.data.state.business.id].transactions.length,0);assert.equal(Object.keys(after.attempts).length,0);
  assert.equal((await t.raw.prepare('SELECT COUNT(*) AS total FROM lumo_commit_guard').first()).total,0);
  const retried=await student.call('/api/payments',{shopId,testKey,amount:1000,attemptId:'atomic-payment'});assert.equal(retried.status,201);assert.equal(retried.data.student.balance,4000);
 }finally{t.close()}
});
