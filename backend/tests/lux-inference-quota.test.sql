-- All synthetic users, sessions and counters roll back. No inference is performed.
begin;
do $test$
declare actor uuid:=gen_random_uuid();sid uuid:=gen_random_uuid();r jsonb;i integer;before_count integer;begin
 insert into auth.users(id,aud,role,email,raw_app_meta_data,email_confirmed_at,created_at,updated_at)
 values(actor,'authenticated','authenticated','lux-audit-'||actor||'@pilot.lumo.invalid','{"lumo_pilot":true}',now(),now(),now());
 insert into auth.sessions(id,user_id,created_at,updated_at) values(sid,actor,now(),now());
 if has_function_privilege('authenticated','public.lumo_lux_reserve()','execute') or has_function_privilege('authenticated','public.lumo_lux_reserve_server(jsonb)','execute') then raise exception 'Customer can reserve inference directly';end if;
 if has_function_privilege('anon','public.lumo_lux_reserve_server(jsonb)','execute') then raise exception 'Anonymous can reserve inference';end if;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 -- Existing unrelated global capacity is retained. Use a local fixture value
 -- inside this transaction so the cap assertions do not depend on pilot use.
 update lumo_private.lux_inference_quota set requests=0 where bucket='global';
 for i in 1..8 loop
  r:=public.lumo_lux_reserve_server(jsonb_build_object('actor',actor,'session',sid));
  if r->>'allowed' is distinct from 'true' then raise exception 'Reservation % rejected: %',i,r;end if;
 end loop;
 r:=public.lumo_lux_reserve_server(jsonb_build_object('actor',actor,'session',sid));
 if r->>'reason' is distinct from 'AI_RATE_LIMITED' then raise exception 'Minute cap bypassed';end if;
 select requests into before_count from lumo_private.lux_inference_quota where bucket='day:'||actor;
 if before_count<>8 then raise exception 'Rejected reservation consumed capacity';end if;
 update lumo_private.lux_inference_quota set requests=0 where bucket='minute:'||actor;
 update lumo_private.lux_inference_quota set requests=30 where bucket='day:'||actor;
 r:=public.lumo_lux_reserve_server(jsonb_build_object('actor',actor,'session',sid));
 if r->>'reason' is distinct from 'AI_RATE_LIMITED' then raise exception 'Daily personal cap bypassed';end if;
 update lumo_private.lux_inference_quota set requests=500 where bucket='global';
 r:=public.lumo_lux_reserve_server(jsonb_build_object('actor',actor,'session',sid));
 if r->>'reason' is distinct from 'AI_DAILY_CAP' then raise exception 'Global cap bypassed';end if;
 delete from auth.sessions where id=sid;
 r:=public.lumo_lux_reserve_server(jsonb_build_object('actor',actor,'session',sid));
 if r->>'reason' is distinct from 'SESSION_REVOKED' then raise exception 'Revoked session reserved capacity';end if;
 perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
 r:=public.lumo_lux_reserve_server(jsonb_build_object('actor',actor,'session',sid));
 if r->>'reason' is distinct from 'FORBIDDEN' then raise exception 'Untrusted role reached reservation';end if;
end $test$;
select 'Server-only Lux quota checks passed; all fixtures rolled back.' as result;
rollback;
