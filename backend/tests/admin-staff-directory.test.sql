-- Transaction-only fixture checks. No identities, cases, sessions or audit rows persist.
begin;
create function pg_temp.directory_assert(p_value boolean,p_label text) returns void language plpgsql as $$begin
 if p_value is distinct from true then raise exception 'Directory check failed: %',p_label;end if;
 perform set_config('lumo.admin.directory_checks',(coalesce(nullif(current_setting('lumo.admin.directory_checks',true),''),'0')::integer+1)::text,true);
end $$;
do $test$
#variable_conflict use_variable
declare support_id uuid:=gen_random_uuid();support_session uuid:=gen_random_uuid();colleague uuid:=gen_random_uuid();case_id uuid;suffix text:=substr(replace(gen_random_uuid()::text,'-',''),1,10);base jsonb;out jsonb;
begin
 perform set_config('lumo.admin.directory_checks','0',true);
 insert into auth.users(id,aud,role,email,raw_app_meta_data,email_confirmed_at,created_at,updated_at) values(support_id,'authenticated','authenticated','directory-support-'||suffix||'@example.test','{}',now(),now(),now()),(colleague,'authenticated','authenticated','directory-colleague-'||suffix||'@example.test','{}',now(),now(),now());
 insert into auth.sessions(id,user_id,created_at,updated_at) values(support_session,support_id,now(),now());
 insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,secret,created_at,updated_at) values(gen_random_uuid(),support_id,'Directory fixture','totp','verified','fixture-not-a-real-secret',now(),now());
 insert into lumo_private.admin_staff(user_id,display_name,email,role) values(support_id,'Directory support '||suffix,'directory-support-'||suffix||'@example.test','support'),(colleague,'Directory colleague '||suffix,'directory-colleague-'||suffix||'@example.test','finance');
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);base:=jsonb_build_object('actor',support_id,'session',support_session,'aal','aal2','q',suffix);
 out:=public.lumo_admin_staff_directory(base);perform pg_temp.directory_assert(out->>'ok'='true' and jsonb_array_length(out#>'{data,rows}')=2 and position('@example.test' in out::text)=0 and position('session' in out::text)=0 and position('fixture-not-a-real-secret' in out::text)=0,'support can read minimal active directory without contacts or authentication material');
 out:=public.lumo_admin_staff_directory(base||'{"aal":"aal1"}');perform pg_temp.directory_assert(out->>'code'='MFA_REQUIRED','directory requires MFA');
 perform pg_temp.directory_assert(not has_function_privilege('anon','public.lumo_admin_staff_directory(jsonb)','execute') and not has_function_privilege('authenticated','public.lumo_admin_staff_directory(jsonb)','execute'),'directory remains service-only');
 out:=public.lumo_admin_service('cases.create',base||jsonb_build_object('subject','Directory assignment fixture','assigneeId',colleague));case_id:=(out#>>'{data,record,id}')::uuid;perform pg_temp.directory_assert(out->>'ok'='true' and case_id is not null,'active colleague can receive a case');
 update lumo_private.admin_staff set status='disabled' where user_id=colleague;
 out:=public.lumo_admin_staff_directory(base);perform pg_temp.directory_assert(out->>'ok'='true' and jsonb_array_length(out#>'{data,rows}')=1,'disabled colleague omitted from directory');
 out:=public.lumo_admin_service('cases.create',base||jsonb_build_object('subject','Invalid new assignment','assigneeId',colleague));perform pg_temp.directory_assert(out->>'code'='INVALID_INPUT','new case cannot be assigned to disabled staff');
 out:=public.lumo_admin_service('cases.update',base||jsonb_build_object('id',case_id,'status','resolved','resolution','Legacy assignment retained'));perform pg_temp.directory_assert(out->>'ok'='true' and out#>>'{data,record,status}'='resolved','legacy case can resolve while unchanged assignee is disabled');
 perform pg_temp.directory_assert(exists(select 1 from lumo_private.admin_audit where actor_id=support_id and action='staff.directory'),'directory access audited');
end $test$;
select current_setting('lumo.admin.directory_checks')::integer as admin_staff_directory_checks;
rollback;
