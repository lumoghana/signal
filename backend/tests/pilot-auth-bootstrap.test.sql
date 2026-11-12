-- Hosted bootstrap boundary checks. Everything, including synthetic Auth rows, is rolled back.
begin;
create function pg_temp.check_true(value boolean,label text) returns void language plpgsql as $$
begin
 if value is distinct from true then raise exception 'Pilot Auth check failed: %',label;end if;
 perform set_config('lumo.auth.checks',(coalesce(nullif(current_setting('lumo.auth.checks',true),''),'0')::integer+1)::text,true);
end $$;
create function pg_temp.bootstrap(action text,payload jsonb) returns jsonb language plpgsql as $$
declare result jsonb;
begin
 execute 'set local role service_role';result:=public.lumo_pilot_bootstrap(action,payload);execute 'reset role';return result;
exception when others then execute 'reset role';raise;
end $$;
do $$
declare
 suffix text:=substr(replace(gen_random_uuid()::text,'-',''),1,8);
 handle_a text; handle_b text; address_hash text:=encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex');
 user_a uuid:=gen_random_uuid(); other_user uuid:=gen_random_uuid(); session_a uuid:=gen_random_uuid();
 result jsonb; second jsonb; registration uuid; prior_registration uuid; i integer;
begin
 perform set_config('lumo.auth.checks','0',true);
 handle_a:='auth_'||suffix;handle_b:='brute_'||suffix;
 perform pg_temp.check_true(not has_function_privilege('anon','public.lumo_pilot_bootstrap(text,jsonb)','EXECUTE'),'anonymous bootstrap forbidden');
 perform pg_temp.check_true(not has_function_privilege('authenticated','public.lumo_pilot_bootstrap(text,jsonb)','EXECUTE'),'user bootstrap forbidden');
 perform pg_temp.check_true(has_function_privilege('service_role','public.lumo_pilot_bootstrap(text,jsonb)','EXECUTE'),'server bootstrap explicitly granted');
 perform pg_temp.check_true(not has_table_privilege('authenticated','lumo_private.pilot_auth_rates','SELECT,INSERT,UPDATE,DELETE'),'private rate records not exposed');
 perform pg_temp.check_true(not has_function_privilege('authenticated','lumo_private.command(text,jsonb)','EXECUTE'),'old unguarded command cannot be called directly');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated')::text,true);
 result:=pg_temp.bootstrap('register.reserve',jsonb_build_object('handle',handle_a,'ipHash',address_hash));perform pg_temp.check_true(result->>'code'='FORBIDDEN','trusted service JWT role required in addition to grants');
 perform set_config('request.jwt.claims',jsonb_build_object('role','service_role')::text,true);
 result:=pg_temp.bootstrap('register.reserve',jsonb_build_object('handle',handle_a,'ipHash','unsafe-address'));perform pg_temp.check_true(result->>'code'='INVALID_INPUT','raw address cannot be persisted');
 result:=pg_temp.bootstrap('register.reserve',jsonb_build_object('handle',handle_a,'ipHash',address_hash));registration:=(result->>'registrationId')::uuid;perform pg_temp.check_true((result->>'ok')::boolean and result->>'mode'='new','new handle reserved before Auth creation');
 second:=pg_temp.bootstrap('register.reserve',jsonb_build_object('handle',handle_a,'ipHash',address_hash));perform pg_temp.check_true(second->>'code'='REGISTRATION_PENDING','concurrent empty reservation cannot start another create');
 result:=pg_temp.bootstrap('register.abort',jsonb_build_object('handle',handle_a,'registrationId',registration));perform pg_temp.check_true((result->>'ok')::boolean and result->>'identityPresent'='false' and not exists(select 1 from lumo_private.pilot_registrations r where r.handle=handle_a),'definitive rejected create can release unused handle');
 result:=pg_temp.bootstrap('register.reserve',jsonb_build_object('handle',handle_a,'ipHash',address_hash));registration:=(result->>'registrationId')::uuid;
 insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,created_at,updated_at)
 values(user_a,'authenticated','authenticated',handle_a||'@pilot.lumo.invalid',clock_timestamp(),'{"lumo_pilot":true,"contact_verified":false}',clock_timestamp(),clock_timestamp()),
 (other_user,'authenticated','authenticated','auth-other-'||suffix||'@example.invalid',clock_timestamp(),'{}',clock_timestamp(),clock_timestamp());
 insert into auth.sessions(id,user_id,created_at,updated_at) values(session_a,user_a,clock_timestamp(),clock_timestamp());
 result:=pg_temp.bootstrap('register.bind',jsonb_build_object('handle',handle_a,'registrationId',registration,'userId',other_user));perform pg_temp.check_true(result->>'code'='RESERVATION_CHANGED','reservation cannot bind another Auth identity');
 result:=pg_temp.bootstrap('register.bind',jsonb_build_object('handle',handle_a,'registrationId',registration,'userId',user_a));perform pg_temp.check_true((result->>'ok')::boolean,'canonical Auth identity binds');
 result:=pg_temp.bootstrap('register.abort',jsonb_build_object('handle',handle_a,'registrationId',registration));perform pg_temp.check_true((result->>'ok')::boolean and result->>'identityPresent'='true' and exists(select 1 from lumo_private.pilot_registrations r where r.handle=handle_a),'unknown committed Auth create is retained for recovery');
 prior_registration:=registration;
 result:=pg_temp.bootstrap('register.reserve',jsonb_build_object('handle',handle_a,'ipHash',address_hash));registration:=(result->>'registrationId')::uuid;perform pg_temp.check_true(result->>'mode'='resume' and registration=prior_registration,'resuming the same identity does not invalidate an active lease');
 result:=pg_temp.bootstrap('register.complete',jsonb_build_object('handle',handle_a,'registrationId',registration,'userId',user_a));perform pg_temp.check_true(result->>'code'='ACCOUNT_REQUIRED','completion requires an actual ledger profile');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',user_a,'session_id',session_a)::text,true);
 execute 'set local role authenticated';result:=public.lumo_rpc('account.open',jsonb_build_object('handle',handle_a,'displayName','Auth fixture','pin','315926'));execute 'reset role';perform pg_temp.check_true((result->>'ok')::boolean,'approved pilot identity can open a zero account');
 update auth.users set raw_app_meta_data='{}',raw_user_meta_data='{"lumo_pilot":true}' where id=user_a;
 execute 'set local role authenticated';result:=public.lumo_rpc('account.get','{}');execute 'reset role';perform pg_temp.check_true(result->>'code'='PILOT_REQUIRED','editable user metadata cannot self-approve pilot access');
 update auth.users set raw_app_meta_data='{"lumo_pilot":true,"contact_verified":false}' where id=user_a;
 perform set_config('request.jwt.claims',jsonb_build_object('role','service_role')::text,true);
 result:=pg_temp.bootstrap('register.complete',jsonb_build_object('handle',handle_a,'registrationId',registration,'userId',user_a));perform pg_temp.check_true((result->>'ok')::boolean and exists(select 1 from lumo_private.pilot_registrations r where r.handle=handle_a and r.state='complete'),'profile completion recorded without funding');
 -- A password attempt through registration and one through login share a single handle quota.
 for i in 1..14 loop result:=pg_temp.bootstrap('login.check',jsonb_build_object('handle',handle_b,'ipHash',address_hash));end loop;
 perform pg_temp.check_true((result->>'ok')::boolean,'first fourteen login attempts allowed');
 result:=pg_temp.bootstrap('register.reserve',jsonb_build_object('handle',handle_b,'ipHash',address_hash));perform pg_temp.check_true((result->>'ok')::boolean,'registration consumes fifteenth shared credential attempt');
 result:=pg_temp.bootstrap('login.check',jsonb_build_object('handle',handle_b,'ipHash',address_hash));perform pg_temp.check_true(result->>'code'='RATE_LIMITED','registration cannot bypass credential handle quota');
 for i in 1..51 loop result:=pg_temp.bootstrap('register.reserve',jsonb_build_object('handle','cap_'||suffix||'_'||i,'ipHash',address_hash));end loop;
 perform pg_temp.check_true(result->>'code'='RATE_LIMITED','per-address registration ceiling enforced');
 perform pg_temp.check_true(not exists(select 1 from lumo_private.journals j where j.actor_user_id=user_a),'registration creates no test funds or money postings');
end $$;
select jsonb_build_object('checks',current_setting('lumo.auth.checks')::integer,'testFixturesRolledBack',true) as lumo_pilot_auth_bootstrap_test;
rollback;
