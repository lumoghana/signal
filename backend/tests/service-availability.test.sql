begin;
set local request.jwt.claims='{"role":"service_role"}';
do $$
declare r jsonb;s text;blocked boolean:=false;i integer;
begin
 r:=public.lumo_service_status('{}');if r->>'ok'<>'true' or jsonb_array_length(r->'services')<6 then raise exception 'Missing shared service catalogue';end if;
 update lumo_private.service_availability set mode='manual_off',circuit='open',opened_at=now()-interval '1 minute',last_checked_at=now()-interval '1 minute' where id='momo_send';
 for i in 1..4 loop
  update lumo_private.service_availability set last_checked_at=now()-interval '1 minute' where id='momo_send';
  r:=public.lumo_service_status('{"probe":true,"probeServices":["momo_send"]}');
 end loop;
 select value->>'status' into s from jsonb_array_elements(r->'services') where value->>'serviceId'='momo_send';if s<>'manual_off' then raise exception 'Automatic probe overrode manual off';end if;
 begin perform lumo_private.require_service('momo_send');exception when raise_exception then if SQLERRM='SERVICE_PAUSED' then blocked:=true;else raise;end if;end;
 if not blocked then raise exception 'Manual-off service allowed new commit';end if;
 -- Recovery does not change mode. Releasing manual restriction returns control
 -- to the current automatic health result; it never blindly forces healthy.
 update lumo_private.service_availability set mode='automatic',circuit='open',recovery_successes=0,opened_at=now()-interval '1 minute',last_checked_at=now()-interval '1 minute' where id='momo_send';
 r:=public.lumo_service_status('{}');if (select circuit from lumo_private.service_availability where id='momo_send')<>'open' then raise exception 'Public read advanced recovery';end if;
 for i in 1..3 loop
  update lumo_private.service_availability set last_checked_at=now()-interval '1 minute' where id='momo_send';
  r:=public.lumo_service_status('{"probe":true,"probeServices":["momo_send"]}');
 end loop;
 if (select circuit from lumo_private.service_availability where id='momo_send')<>'healthy' then raise exception 'Sustained validated probe recovery failed';end if;
 update lumo_private.service_availability set observations=0,failures=0,window_started=now(),circuit='healthy' where id='bank_send';
 for i in 1..5 loop r:=public.lumo_service_observe(jsonb_build_object('serviceId','bank_send','outcome',case when i>2 then 'infrastructure_failure' else 'success' end));end loop;
 if (select circuit from lumo_private.service_availability where id='bank_send')<>'open' then raise exception 'Infrastructure failures did not trip circuit';end if;
 r:=public.lumo_service_observe('{"serviceId":"bank_send","outcome":"customer_decline"}');if r->>'ignored'<>'true' then raise exception 'Customer decline was counted as outage';end if;
 update lumo_private.service_availability set mode='automatic',circuit='healthy',scheduled_start=now()-interval '1 minute',scheduled_end=now()+interval '1 minute' where id='test_funding';
 r:=public.lumo_service_status('{}');select value->>'status' into s from jsonb_array_elements(r->'services') where value->>'serviceId'='test_funding';if s<>'maintenance' then raise exception 'Scheduled maintenance did not disable service';end if;
 if has_function_privilege('anon','public.lumo_service_status(jsonb)','EXECUTE') or has_function_privilege('authenticated','public.lumo_service_observe(jsonb)','EXECUTE') then raise exception 'Public clients can mutate or directly access private availability API';end if;
 if (select count(*) from pg_trigger where tgname in('service_new_guest_guard','service_new_journal_guard','service_new_posting_guard') and not tgisinternal)<>3 then raise exception 'Atomic ledger/guest guards missing';end if;
end $$;
rollback;
