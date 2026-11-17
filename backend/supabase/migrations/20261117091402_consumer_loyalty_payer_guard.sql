-- A consumer-created discounted request belongs to that authenticated purchaser.
-- Cashier-created requests retain their existing bearer-presented behaviour.
-- Repeat the gateway check at the canonical journal insert so direct legacy RPC
-- callers cannot consume another account's held reward.
create function lumo_private.guard_consumer_loyalty_payer() returns trigger
language plpgsql security invoker set search_path='' as $$
declare bound_user text;
begin
 if new.type='merchant_payment' and new.request_id is not null then
  select r.value->>'_consumerUserId' into bound_user
  from lumo_private.approved_merchant_network n
  join lumo_private.shops sh on sh.id=new.shop_id
  cross join lateral jsonb_array_elements(coalesce(n.document#>array['businesses',sh.merchant_id::text,'requests'],'[]'::jsonb)) r
  where r.value->>'id'=new.request_id::text limit 1;
  if bound_user is not null and new.actor_user_id::text is distinct from bound_user then
   raise exception using errcode='P0001',message='REQUEST_UNAVAILABLE';
  end if;
 end if;
 return new;
end $$;
revoke all on function lumo_private.guard_consumer_loyalty_payer() from public,anon,authenticated,service_role;
create trigger consumer_loyalty_payer_guard before insert on lumo_private.journals
for each row execute function lumo_private.guard_consumer_loyalty_payer();
