/** Explicit synthetic setup for SQL chunks formerly requiring private QA sessions. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export async function prepareSqlContext(db,name){
 if(name==='personal-identity-boundary.test.sql'){
  for(const [label,mode] of [['sender','consumer'],['recipient','consumer'],['staff','merchant']]){
   const actor=randomUUID(),session=randomUUID(),handle='fixture_'+label+'_'+actor.slice(0,8);
   await db.query("insert into auth.users(id,email,raw_app_meta_data,email_confirmed_at) values($1,$2,'{\"lumo_pilot\":true}',now())",[actor,handle+'@pilot.lumo.invalid']);
   await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,actor]);
   await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)");
   const r=await db.query('select public.lumo_approved_service($1,$2::jsonb) as value',['provision',JSON.stringify({actor,session,handle,displayName:'Synthetic '+label,pin:'3159',mode})]);
   assert.equal(r.rows[0].value.ok,true,'Current personal/staff identity is provisioned');
  }
 }
 if(name==='review-gateway-consistency.test.sql'){
  await db.exec(`create function pg_temp.assert_approved(value boolean,label text) returns void language plpgsql as $$begin
   if value is distinct from true then raise exception 'Approved current review: %',label;end if;
   perform set_config('lumo.approved.checks',(coalesce(nullif(current_setting('lumo.approved.checks',true),''),'0')::int+1)::text,true);
  end $$;
  create function pg_temp.approved(command text,payload jsonb) returns jsonb language plpgsql as $$declare result jsonb;begin
   execute 'set local role service_role'; result:=public.lumo_approved_service(command,payload);execute 'reset role';return result;
   exception when others then execute 'reset role';raise;
  end $$;`);
 }
 if(['guest-checkout-transaction.test.sql','guest-link-purpose-transaction.test.sql'].includes(name)){
  const {prepareSqlFixture}=await import('../backend/verification/sql-fixtures.mjs');
  await prepareSqlFixture(db,name);
 }
}
