-- Read/assert eligibility using the current live sessions; transactional changes roll back.
begin;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $identity_checks$
declare personal uuid;staff uuid;sid uuid;staff_sid uuid;r jsonb;bad boolean:=false;held bigint;source_id uuid;target_id uuid;previous_balance bigint;
begin
 select ap.user_id,s.id into personal,sid from lumo_private.approved_profiles ap join auth.sessions s on s.user_id=ap.user_id where ap.personal_account and lumo_private.approved_live(ap.user_id,s.id) and lumo_private.personal_recipient(ap.user_id) limit 1;
 select ap.user_id,s.id into staff,staff_sid from lumo_private.approved_profiles ap join auth.sessions s on s.user_id=ap.user_id where not ap.personal_account and lumo_private.approved_live(ap.user_id,s.id) limit 1;
 if personal is null or staff is null then raise exception 'Live consumer and merchant QA sessions required';end if;
 r:=lumo_private.approved_people_search(jsonb_build_object('actor',personal,'session',sid,'query',''));
 if r->>'ok'<>'true' then raise exception 'People search failed';end if;
 if exists(select 1 from jsonb_array_elements(r->'people') p where not lumo_private.personal_recipient((p->>'id')::uuid)) then raise exception 'Staff identity leaked into people search';end if;
 r:=lumo_private.approved_service('resolve',jsonb_build_object('actor',personal,'session',sid,'query',staff::text));
 if r->>'code'<>'RECIPIENT_NOT_FOUND' then raise exception 'Exact staff identity can still resolve';end if;
 r:=lumo_private.approved_service('load',jsonb_build_object('actor',staff,'session',staff_sid));
 if r->>'ok'<>'true' then raise exception 'Existing staff balance/history access was removed';end if;
 source_id:=lumo_private.approved_resolve_account(staff,'{"kind":"wallet"}');
 if source_id is null then raise exception 'Existing staff source wallet cannot recover outgoing funds';end if;
 select balance into held from lumo_private.accounts where id=source_id;
 select id into target_id from lumo_private.accounts where owner_user_id=staff and kind='consumer';
 begin
  perform lumo_private.post_money(personal,'transfer',1,(select id from lumo_private.accounts where owner_user_id=personal and kind='consumer'),target_id);
 exception when others then
  if sqlerrm='RECIPIENT_NOT_FOUND' then bad:=true;else raise;end if;
 end;
 if not bad then raise exception 'A raw stale recipient ID bypasses final posting checks';end if;
 if (select balance from lumo_private.accounts where id=source_id)<>held then raise exception 'Rejected payment changed staff balance';end if;
 -- Enrollment is independent from employment. A personal customer who also cashiers remains eligible.
 update lumo_private.approved_profiles set personal_account=true where user_id=staff;
 if not lumo_private.personal_recipient(staff) then raise exception 'Explicit dual-role personal enrollment was incorrectly excluded';end if;
 update lumo_private.approved_profiles set personal_account=false where user_id=staff;
 r:=lumo_private.pilot_bootstrap('register.reserve',jsonb_build_object('handle',(select handle from lumo_private.profiles where user_id=personal),'ipHash',repeat('c',64)));
 if r->>'code'<>'HANDLE_TAKEN' then raise exception 'Taken username was not rejected atomically: %',r->>'code';end if;
 if not exists(select 1 from pg_constraint where conrelid='lumo_private.profiles'::regclass and conname='profiles_handle_key' and contype='u') then raise exception 'Global username uniqueness constraint missing';end if;
end $identity_checks$;
rollback;
