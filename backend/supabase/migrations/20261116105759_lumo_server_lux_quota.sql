-- Same atomic 8/minute, 30/day and shared 500/day budget; only verified
-- production workloads can reserve it through the private service-role RPC.
create function public.lumo_lux_reserve_server(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  actor uuid := (p_payload->>'actor')::uuid;
  session_id uuid := (p_payload->>'session')::uuid;
  instant timestamptz := clock_timestamp();
  today timestamptz := date_trunc('day', instant at time zone 'UTC') at time zone 'UTC';
  minute timestamptz := date_trunc('minute', instant);
  global_count integer; daily_count integer; minute_count integer;
begin
  if auth.jwt()->>'role' is distinct from 'service_role' then return jsonb_build_object('allowed',false,'reason','FORBIDDEN');end if;
  if actor is null or session_id is null or not exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id where s.id=session_id and s.user_id=actor and (s.not_after is null or s.not_after>clock_timestamp()) and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()) and coalesce(u.is_anonymous,false)=false and u.raw_app_meta_data->>'lumo_pilot'='true') then return jsonb_build_object('allowed',false,'reason','SESSION_REVOKED');end if;
  -- Always lock in global -> personal day -> personal minute order across instances.
  insert into lumo_private.lux_inference_quota(bucket,window_start)
    values ('global',today),('day:'||actor::text,today),('minute:'||actor::text,minute)
    on conflict do nothing;
  select requests into global_count from lumo_private.lux_inference_quota where bucket='global' and window_start=today for update;
  select requests into daily_count from lumo_private.lux_inference_quota where bucket='day:'||actor::text and window_start=today for update;
  select requests into minute_count from lumo_private.lux_inference_quota where bucket='minute:'||actor::text and window_start=minute for update;
  if global_count >= 500 then return jsonb_build_object('allowed',false,'reason','AI_DAILY_CAP'); end if;
  if daily_count >= 30 or minute_count >= 8 then return jsonb_build_object('allowed',false,'reason','AI_RATE_LIMITED'); end if;
  update lumo_private.lux_inference_quota set requests=requests+1
    where (bucket='global' and window_start=today)
       or (bucket='day:'||actor::text and window_start=today)
       or (bucket='minute:'||actor::text and window_start=minute);
  delete from lumo_private.lux_inference_quota where window_start < today - interval '2 days';
  return jsonb_build_object('allowed',true);
end;
$$;

revoke all on function public.lumo_lux_reserve_server(jsonb) from public,anon,authenticated;
grant execute on function public.lumo_lux_reserve_server(jsonb) to service_role;
-- Cut over only after the server workload verifier is deployed and checked.
revoke all on function public.lumo_lux_reserve() from public,anon,authenticated;

