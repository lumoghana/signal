begin;
create function pg_temp.check_signup(value boolean,label text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'Signup receipt assertion: %',label;end if;perform set_config('lumo.review.signup_checks',(coalesce(nullif(current_setting('lumo.review.signup_checks',true),''),'0')::int+1)::text,true);end$$;
do $test$
declare actor uuid:=gen_random_uuid();sid uuid:=gen_random_uuid();invalid_actor uuid:=gen_random_uuid();invalid_sid uuid:=gen_random_uuid();metadata jsonb;payload jsonb;result jsonb;rejected boolean:=false;received_at timestamptz;
begin
 perform set_config('lumo.review.signup_checks','0',true);perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 insert into auth.users(id,email) values(actor,'signup.receipt@pilot.lumo.invalid'),(invalid_actor,'signup.bad@pilot.lumo.invalid');
 insert into auth.sessions(id,user_id) values(sid,actor),(invalid_sid,invalid_actor);
 metadata:=jsonb_build_object('termsAcceptance',jsonb_build_object('version','2026-11-08.1','acceptedAt',clock_timestamp()-interval '2 days'),
  'verification',jsonb_build_object('mode','simulation','capture','live-camera','status','complete','method','ghana-card-number','liveness','guided-camera','sampleIdentity',true,'detailsConfirmed',true,'completedAt',clock_timestamp()));
 payload:=jsonb_build_object('actor',actor,'session',sid,'handle','signup.receipt','phone','0241000001','displayName','Signup fixture','pin','1234','mode','consumer','onboarding',metadata);
 result:=lumo_private.approved_service('provision',payload);
 perform pg_temp.check_signup(result->>'ok'='true','valid signup provisions');
 perform pg_temp.check_signup(result#>>'{onboarding,termsAcceptance,version}'='2026-11-08.1','accepted current version retained');
 perform pg_temp.check_signup(result#>>'{onboarding,verification,mode}'='simulation' and result#>>'{onboarding,verification,sampleIdentity}'='true','real camera does not become real identity assurance');
 received_at:=(result#>>'{onboarding,receivedAt}')::timestamptz;
 perform pg_temp.check_signup(received_at between statement_timestamp()-interval '1 second' and clock_timestamp(),'receipt time is server-issued');
 result:=lumo_private.approved_service('load',jsonb_build_object('actor',actor,'session',sid));
 perform pg_temp.check_signup(result#>>'{onboarding,termsAcceptance,version}'='2026-11-08.1' and result#>>'{onboarding,verification,detailsConfirmed}'='true','receipt survives independent reload');
 perform pg_temp.check_signup(not(result->'onboarding' ? 'photos') and not(result->'onboarding' ? 'legalName'),'no private evidence in account receipt');
 begin
  result:=lumo_private.approved_service('provision',payload||jsonb_build_object('actor',invalid_actor,'session',invalid_sid,'handle','signup.bad','onboarding',metadata||jsonb_build_object('photos',jsonb_build_array('private'))));
 exception when others then rejected:=true;end;
 perform pg_temp.check_signup(rejected,'server rejects media even behind HTTP allowlist');
 perform pg_temp.check_signup(not exists(select 1 from lumo_private.profiles where user_id=invalid_actor) and not exists(select 1 from lumo_private.accounts where owner_user_id=invalid_actor),'failed receipt rolls back profile and account provisioning together');
 begin
  perform lumo_private.checked_onboarding_receipt(jsonb_set(metadata,'{verification,mode}','"live"'));rejected:=false;
 exception when others then rejected:=true;end;
 perform pg_temp.check_signup(rejected,'cannot submit live verification claim');
 begin
  perform lumo_private.checked_onboarding_receipt(jsonb_set(metadata,'{termsAcceptance,version}','"old"'));rejected:=false;
 exception when others then rejected:=true;end;
 perform pg_temp.check_signup(rejected,'unknown terms version rejected');
end $test$;
select current_setting('lumo.review.signup_checks')::int checks;
rollback;
