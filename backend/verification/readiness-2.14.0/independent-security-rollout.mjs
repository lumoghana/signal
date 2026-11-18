/** Isolated compatibility proof: complete active59 migration chain. No hosted
 * connection, Auth schema trigger, F05 migration, or enabled candidate reset-fence protocol. */
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createAccessHandler} from '../../supabase/functions/lumo-access/handler.mjs';
import {randomUUID} from 'node:crypto';
process.env.LUMO_PGLITE_MODULE ||= fileURLToPath(new URL('../../../verification/node_modules/@electric-sql/pglite/dist/index.js',import.meta.url));
const {bootLedger}=await import('../consumer-loyalty-2.13.0/local-ledger.mjs');
const {assertActiveSchema}=await import('./active-schema.mjs');
const {db,applied}=await bootLedger({through:null});
const checks=[];
try{
 await assertActiveSchema(db,applied);assert.equal(applied.length,59);checks.push('complete active59 migration chain with excluded private Auth fence absent');
 assert.ok(!applied.some(n=>n.includes('recovery_reconciliation')));checks.push('F05 migration excluded');
 const fields=await db.query("select exists(select 1 from information_schema.columns where table_schema='lumo_private' and table_name='access_prototype_reset_executions' and column_name='requires_auth_marker') as marker,exists(select 1 from pg_trigger where tgname='lumo_fence_reset_auth_write') as fence");
 assert.deepEqual(fields.rows[0],{marker:false,fence:false});checks.push('no F05 marker column or Auth write trigger');
 for(const fixture of ['biometric-retention.test.sql','stored-face-templates.test.sql','prototype-enrollment-receipt.test.sql','prototype-reset-serialization.test.sql']){
  await db.exec(await readFile(new URL('../../tests/'+fixture,import.meta.url),'utf8'));checks.push(fixture+' passed unchanged against no-F05 schema');
 }
 const functions=await db.query("select proname,pg_get_functiondef(p.oid) as source from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='lumo_private' and proname in('access_erase_biometrics','access_biometric_retention_sweep','access_erase_on_account_close')");
 assert.equal(functions.rows.length,3);assert.ok(functions.rows.every(r=>!r.source.includes('requires_auth_marker')&&!r.source.includes('access_reconcile_applied_reset')));checks.push('retention helpers contain no F05 dependency');
 const actor=randomUUID(),tid=randomUUID();
 await db.query("insert into auth.users(id,email,encrypted_password,raw_app_meta_data) values($1,'compat@pilot.lumo.invalid','before','{\"lumo_pilot\":true}')",[actor]);
 await db.query("insert into lumo_private.profiles(user_id,handle,display_name,pin_hash,status) values($1,'compat_actor','Synthetic compatibility',extensions.crypt('1234',extensions.gen_salt('bf',4)),'active')",[actor]);
 await db.query("insert into lumo_private.approved_profiles(user_id,personal_account,phone) values($1,true,'0240987123')",[actor]);
 await db.query("insert into lumo_private.access_enrollments(module,user_id,phone,reference_id,face_digests) values('consumer',$1,'+233240987123',$2,'[]')",[actor,tid]);
 const rpcTrace=[],authWrites=[];let loseAck=false;
 const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
 const handler=createAccessHandler({supabaseUrl:'https://iwutbrljiiodamtyoorg.supabase.co',serviceRoleKey:'SYNTHETIC_ONLY',providerMode:'sandbox',prototypeFaceOnly:true,passwordPolicyMode:'pilot',fetch:async(url,init)=>{
  const body=JSON.parse(init.body);
  if(new URL(url).pathname.startsWith('/auth/v1/admin/users/')){authWrites.push(body);await db.query('update auth.users set encrypted_password=$2 where id=$1',[actor,body.password]);if(loseAck)throw Error('Synthetic death after Auth committed, before local acknowledgement');return json({id:actor});}
  rpcTrace.push(body);assert.ok(!body.p_command.startsWith('complete.reconcile'),'disabled flag must never use staged reconciliation RPC');assert.equal(body.p_payload.markerVersion,undefined);
  const out=await db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");return (await tx.query('select public.lumo_access_prototype_service($1,$2) as result',[body.p_command,body.p_payload])).rows[0].result;});return json(out);
 }});
 const resetToken='T'.repeat(43);
 const resetHash=async rid=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('lumo-access-reset-v1\0consumer\0'+rid+'\0'+resetToken)))].map(x=>x.toString(16).padStart(2,'0')).join('');
 const start=async()=>{const rid=randomUUID();const revision=(await db.query("select revision from lumo_private.access_enrollments where module='consumer' and user_id=$1",[actor])).rows[0].revision;await db.query("insert into lumo_private.access_requests(id,module,purpose,method,user_id,enrollment_revision,reference_id,state,reset_token_hash) values($1,'consumer','recovery','face',$2,$3,$4,'verified',$5)",[rid,actor,revision,tid,await resetHash(rid)]);return rid;};
 const complete=async rid=>{const out=await handler(new Request('https://edge.example/lumo-access',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({module:'consumer',operation:'complete',requestId:rid,resetToken,newPassword:'CompatibleStrongSecret9'})}));return {status:out.status,body:await out.json()};};
 const first=await start();const done=await complete(first);assert.equal(done.body.completed,true,JSON.stringify(done));assert.equal(authWrites.length,1);assert.deepEqual(Object.keys(authWrites[0]),['password']);assert.equal((await complete(first)).body.completed,true);assert.equal(authWrites.length,1);checks.push('default-false current HTTP handler completes and replays against actual original SQL without marker');
 const pending=await start();loseAck=true;assert.equal((await complete(pending)).body.code,'RESET_IN_PROGRESS');assert.equal(authWrites.length,2);const callsBefore=rpcTrace.length;assert.equal((await complete(pending)).body.code,'RESET_IN_PROGRESS');assert.equal(authWrites.length,2);assert.equal(rpcTrace.length,callsBefore+1);assert.equal(rpcTrace.at(-1).p_command,'complete.claim');checks.push('lost Auth acknowledgement remains originally guarded; retry performs no replacement PUT or staged RPC');
 assert.equal((await db.query("select exists(select 1 from pg_trigger where tgname='lumo_fence_reset_auth_write') as present")).rows[0].present,false);checks.push('original Auth schema remains unmodified throughout real SQL/HTTP check');
 console.log(JSON.stringify({ok:true,migrations:applied.length,checks:checks.length,details:checks,hostedWrites:false,scope:'complete active59 public release schema, legacy reset protocol retained; no private Auth DDL'}));
}finally{await db.close();}
