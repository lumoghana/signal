/** Local PostgreSQL only. Never reads a hosted URL, credential or customer record. */
import {readFile,readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
process.env.LUMO_PGLITE_MODULE ||= fileURLToPath(new URL('../verification/node_modules/@electric-sql/pglite/dist/index.js',import.meta.url));
const fixtureArgument=process.argv.find(arg=>arg.startsWith('--fixture='));
const fixture=fixtureArgument?.slice('--fixture='.length);
if(fixture&&!/^[a-z0-9-]+\.test\.sql$/.test(fixture))throw Error('Use a named committed SQL fixture.');

async function check(){
 let stage='bootstrap';
 const {bootLedger}=await import('../backend/verification/consumer-loyalty-2.13.0/local-ledger.mjs');
 let db;
 try{
  const boot=await bootLedger({through:null,log:name=>{stage=name;}});db=boot.db;
  const {assertActiveSchema}=await import('../backend/verification/readiness-2.14.0/active-schema.mjs');
  await assertActiveSchema(db,boot.applied);
  const expected=['case_notifications','admin_staff','approved_states','accounts','journals','entries','access_face_templates','business_pilot'];
  for(const table of expected){const r=await db.query("select to_regclass($1) is not null as present",['lumo_private.'+table]);if(!r.rows[0].present)throw Error('Missing restored table: '+table);}
  const insecure=await db.query("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='lumo_private' and c.relkind in ('r','p') and not c.relrowsecurity");
  if(insecure.rows.length)throw Error('Private table missing RLS: '+insecure.rows.map(x=>x.relname).join(','));
  const exposed=await db.query("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'lumo%' and has_function_privilege('anon',p.oid,'EXECUTE')");
  if(exposed.rows.length)throw Error('Anonymous execution grant: '+exposed.rows.map(x=>x.proname).join(','));
  if(fixture){
   stage=fixture;
   const {prepareSqlContext}=await import('../verification/sql-context.mjs');
   await prepareSqlContext(db,fixture);
   const sql=await readFile(new URL('../backend/tests/'+fixture,import.meta.url),'utf8');
   const hasTransaction=/^\s*(?:--[^\n]*\n\s*)*begin\s*;/i.test(sql);
   await db.exec(hasTransaction?sql:'begin;\n'+sql+'\nrollback;');
  }
  console.log(JSON.stringify({ok:true,scope:'complete active59 PostgreSQL + synthetic Auth; excluded private Auth fence absent; no hosted writes',migrations:boot.applied.length,fixture:fixture||null,privateRls:true,noAnonymousRpc:true}));
 }catch(error){console.error(JSON.stringify({ok:false,stage,code:error.code||null,message:error.message,where:error.where||null,detail:error.detail||null}));process.exitCode=1;}
 finally{await db?.close();}
}

if(process.argv.includes('--fixtures')&&!fixture){
 const names=(await readdir(new URL('../backend/tests/',import.meta.url))).filter(n=>n.endsWith('.test.sql')).sort();
 const outcomes=[];let cursor=0;
 async function worker(){while(cursor<names.length){const name=names[cursor++];const result=await new Promise(resolve=>{const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--fixture='+name],{cwd:root,env:process.env,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',s=>stdout+=s);child.stderr.on('data',s=>stderr+=s);child.once('error',e=>resolve({name,ok:false,error:e.message}));child.once('close',code=>resolve({name,ok:code===0,details:stdout.trim(),error:stderr.trim()}));});outcomes.push(result);console.log(JSON.stringify(result));}}
 await Promise.all([worker(),worker()]);
 const failed=outcomes.filter(x=>!x.ok);console.log(JSON.stringify({scope:'all committed transactional SQL fixtures',total:outcomes.length,passed:outcomes.length-failed.length,failed:failed.map(x=>x.name)}));if(failed.length)process.exitCode=1;
}else await check();
