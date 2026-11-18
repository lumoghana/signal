// Optional isolated PostgreSQL verifier. No hosted connection or production dependency.
// Auth tables and JWT settings are synthetic. App migrations, pgcrypto, journals,
// double-entry constraints, request locks and service RPCs execute their actual SQL.
import {readFile,readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const moduleName=process.env.LUMO_PGLITE_MODULE||'@electric-sql/pglite';
const {PGlite}=await import(moduleName);
const {pgcrypto}=await import(moduleName.startsWith('/')||moduleName.startsWith('file:')?new URL('./contrib/pgcrypto.js',moduleName.startsWith('/')?pathToFileURL(moduleName):moduleName).href:'@electric-sql/pglite/contrib/pgcrypto');
const migrations=new URL('../../supabase/migrations/',import.meta.url);
export async function bootLedger({through='20261114999999',additional=[],log=()=>{}}={}){
 const db=await PGlite.create({extensions:{pgcrypto}});
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;
   create table auth.users(id uuid primary key,aud text,role text,email text,encrypted_password text,raw_app_meta_data jsonb default '{}',raw_user_meta_data jsonb default '{}',email_confirmed_at timestamptz,created_at timestamptz,updated_at timestamptz,deleted_at timestamptz,banned_until timestamptz,is_anonymous boolean default false);
   create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id),created_at timestamptz,updated_at timestamptz,refreshed_at timestamptz,aal text,not_after timestamptz);
   create table auth.mfa_factors(id uuid primary key,user_id uuid not null references auth.users(id),friendly_name text,factor_type text,status text,secret text,created_at timestamptz,updated_at timestamptz);
   create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
   create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
   create function auth.role() returns text language sql stable as $$select auth.jwt()->>'role'$$;`);
  const applied=[];
  for(const name of (await readdir(migrations)).filter(n=>n.endsWith('.sql')).sort()){
   if(through&&name>through&&!additional.includes(name))continue;
   log(name);const source=await readFile(new URL(name,migrations),'utf8');
   // PGlite has no scheduler process; keep run_schedules() itself unchanged.
   const runnable=source.replace(/^create extension if not exists pg_cron;\s*$/m,'').replace(/^select cron\.schedule\('lumo-connected-test-money-schedules'.*;\s*$/m,'');
   await db.exec(runnable);applied.push(name);
  }
  return {db,applied};
 }catch(error){await db.close();throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let stage='boot';try{const {db,applied}=await bootLedger({log:name=>{stage=name;}});try{console.log(JSON.stringify({passed:true,migrations:applied.length,last:applied.at(-1),scope:'Isolated PostgreSQL, synthetic Auth, application migrations and pgcrypto; pg_cron registration omitted (no scheduler process).'}));}finally{await db.close();}}catch(error){console.error(JSON.stringify({stage,message:error.message,code:error.code,detail:error.detail,where:error.where}));process.exitCode=1;}
}
