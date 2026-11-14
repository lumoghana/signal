begin;
select set_config('request.jwt.claim.sub','88888888-8888-4888-8888-888888888888',true);
select set_config('request.jwt.claims','{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}',true);
set local role authenticated;
do $$ declare i int; r jsonb; begin
  for i in 1..8 loop
    r := public.lumo_lux_reserve();
    if r->>'allowed' <> 'true' then raise exception 'Reservation % rejected: %',i,r; end if;
  end loop;
  r := public.lumo_lux_reserve();
  if r->>'allowed' <> 'false' or r->>'reason' <> 'AI_RATE_LIMITED' then raise exception 'Minute cap bypassed'; end if;
  begin perform count(*) from lumo_private.lux_inference_quota; raise exception 'Private counts were readable';
    exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare total int; begin
  select requests into total from lumo_private.lux_inference_quota where bucket='day:88888888-8888-4888-8888-888888888888';
  if total <> 8 then raise exception 'Rejected reservation consumed quota'; end if;
  update lumo_private.lux_inference_quota set requests=500 where bucket='global';
end $$;
set local role authenticated;
do $$ declare r jsonb; begin
  r := public.lumo_lux_reserve();
  if r->>'reason' <> 'AI_DAILY_CAP' then raise exception 'Global cap bypassed'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.lumo_lux_reserve(); raise exception 'Anonymous inference allowed';
    exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'Lux quota assertions passed; all synthetic quota changes rolled back.' as result;
rollback;
