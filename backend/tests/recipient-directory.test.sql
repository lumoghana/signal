-- Every identity and test record rolls back, including when an assertion fails.
begin;
create function pg_temp.people_assert(value boolean,label text) returns void language plpgsql as $$begin
 if value is distinct from true then raise exception 'Recipient directory: %',label;end if;
 perform set_config('lumo.people.checks',(coalesce(nullif(current_setting('lumo.people.checks',true),''),'0')::integer+1)::text,true);
end $$;
create function pg_temp.people(payload jsonb) returns jsonb language plpgsql as $$declare result jsonb;begin
 execute 'set local role service_role';result:=public.lumo_approved_people_search(payload);execute 'reset role';return result;
 exception when others then execute 'reset role';raise;
end $$;
do $$
declare actor uuid:=gen_random_uuid();session uuid:=gen_random_uuid();other uuid;target uuid;target_session uuid:=gen_random_uuid();prefix text:='zzpeople'||substr(replace(gen_random_uuid()::text,'-',''),1,8);handle text;payload jsonb;r jsonb;before_money bigint;i integer;
begin
 perform set_config('lumo.people.checks','0',true);
 perform pg_temp.people_assert(not has_function_privilege('anon','public.lumo_approved_people_search(jsonb)','execute'),'anonymous cannot search');
 perform pg_temp.people_assert(not has_function_privilege('authenticated','public.lumo_approved_people_search(jsonb)','execute'),'client cannot forge a trusted search actor');
 perform pg_temp.people_assert(not has_function_privilege('authenticated','lumo_private.approved_people_search(jsonb)','execute'),'private implementation is inaccessible');
 insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values(actor,'authenticated','authenticated',prefix||'actor@pilot.lumo.invalid','{"lumo_pilot":true}','{}',now(),now());
 insert into auth.sessions(id,user_id,created_at,updated_at)values(session,actor,now(),now());
 insert into lumo_private.profiles(user_id,handle,display_name,pin_hash)values(actor,prefix||'actor','Synthetic Directory Sender','fixture-unused');
 insert into lumo_private.accounts(owner_user_id,kind)values(actor,'consumer');
 for i in 1..24 loop
  other:=gen_random_uuid();handle:=prefix||lpad(i::text,2,'0');if i=1 then target:=other;end if;
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values(other,'authenticated','authenticated',handle||'@pilot.lumo.invalid','{"lumo_pilot":true}','{}',now(),now());
  insert into lumo_private.profiles(user_id,handle,display_name,pin_hash)values(other,handle,case when i<=2 then 'Synthetic Duplicate Name' else 'Synthetic Directory Person' end,'fixture-unused');
  insert into lumo_private.accounts(owner_user_id,kind)values(other,'consumer');
 end loop;
 insert into auth.sessions(id,user_id,created_at,updated_at)values(target_session,target,now(),now());
 insert into lumo_private.approved_profiles(user_id,phone)values(target,'0240009123');
 payload:=jsonb_build_object('actor',actor,'session',session,'query',prefix);
 select count(*) into before_money from lumo_private.journals;
 perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
 perform pg_temp.people_assert(pg_temp.people(payload)->>'code'='FORBIDDEN','a role claim must also be service authority');
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 r:=pg_temp.people(payload);perform pg_temp.people_assert(jsonb_array_length(r->'people')=20 and (r->>'hasMore')::boolean,'bounded first page with more-results hint');
 perform pg_temp.people_assert(not exists(select 1 from jsonb_array_elements(r->'people') p where p->>'id'=actor::text),'sender is excluded');
 perform pg_temp.people_assert(not exists(select 1 from jsonb_array_elements(r->'people') p,jsonb_object_keys(p) k where k not in('id','userId','handle','name','rail')),'only public payment identity fields');
 r:=pg_temp.people(payload||jsonb_build_object('query','@'||prefix||'01'));perform pg_temp.people_assert(jsonb_array_length(r->'people')=1 and r->'people'->0->>'id'=target::text,'partial/exact @handle search uses real registered identity');
 r:=pg_temp.people(payload||jsonb_build_object('query','Synthetic Duplicate Name'));perform pg_temp.people_assert(jsonb_array_length(r->'people')=2 and r->'people'->0->>'handle'<>r->'people'->1->>'handle','duplicate display names keep distinct handles');
 r:=pg_temp.people(payload||jsonb_build_object('query','+233 24 000 9123'));perform pg_temp.people_assert(jsonb_array_length(r->'people')=1 and not(r->'people'->0 ? 'phone'),'exact formatted phone lookup without a phone directory');
 perform pg_temp.people_assert(jsonb_array_length(pg_temp.people(payload||jsonb_build_object('query','024000'))->'people')=0,'partial phone does not enumerate numbers');
 perform pg_temp.people_assert(jsonb_array_length(pg_temp.people(payload||jsonb_build_object('query','%_'))->'people')=0,'SQL wildcards remain literal');
 perform pg_temp.people_assert(jsonb_array_length(pg_temp.people(payload||jsonb_build_object('query','z'))->'people')=0,'one letter does not trigger broad matches');
 perform pg_temp.people_assert(pg_temp.people(payload||jsonb_build_object('session',target_session))->>'code'='SESSION_REVOKED','another user session cannot authorise sender lookup');
 update lumo_private.profiles set status='suspended' where user_id=target;
 perform pg_temp.people_assert(jsonb_array_length(pg_temp.people(payload||jsonb_build_object('query',prefix||'01'))->'people')=0,'suspended users are excluded');
 update lumo_private.profiles set status='active' where user_id=target;update lumo_private.accounts set status='suspended' where owner_user_id=target and kind='consumer';
 perform pg_temp.people_assert(jsonb_array_length(pg_temp.people(payload||jsonb_build_object('query',prefix||'01'))->'people')=0,'unavailable consumer wallets are excluded');
 update lumo_private.accounts set status='active' where owner_user_id=target and kind='consumer';update auth.users set banned_until=now()+interval '1 hour' where id=target;
 perform pg_temp.people_assert(jsonb_array_length(pg_temp.people(payload||jsonb_build_object('query',prefix||'01'))->'people')=0,'banned recipients are excluded');
 update auth.sessions set not_after=now()-interval '1 second' where id=session;
 perform pg_temp.people_assert(pg_temp.people(payload)->>'code'='SESSION_REVOKED','expired sessions are rejected');
 perform pg_temp.people_assert((select count(*)=before_money from lumo_private.journals),'directory search never posts money');
end $$;
select current_setting('lumo.people.checks')::integer as recipient_directory_checks;
rollback;
