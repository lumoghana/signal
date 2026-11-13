-- Inference counts only. No prompts, answers, tokens or financial data are stored.
create table lumo_private.lux_inference_quota (
  bucket text not null,
  window_start timestamptz not null,
  requests integer not null default 0 check (requests >= 0),
  primary key (bucket, window_start)
);
create index lux_inference_quota_expiry on lumo_private.lux_inference_quota(window_start);
alter table lumo_private.lux_inference_quota enable row level security;
revoke all on lumo_private.lux_inference_quota from public, anon, authenticated;

create function public.lumo_lux_reserve() returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  actor uuid := auth.uid();
  instant timestamptz := clock_timestamp();
  today timestamptz := date_trunc('day', instant at time zone 'UTC') at time zone 'UTC';
  minute timestamptz := date_trunc('minute', instant);
  global_count integer; daily_count integer; minute_count integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
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
revoke all on function public.lumo_lux_reserve() from public, anon;
grant execute on function public.lumo_lux_reserve() to authenticated;
comment on function public.lumo_lux_reserve() is 'Atomic Lux inference reservation: 8/minute and 30/day per authenticated user, 500/day for this pilot. No financial writes.';
