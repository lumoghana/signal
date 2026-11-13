-- Approved merchant and consumer engines share account-first locking. Prevent an
-- older mutation path from taking request/journal locks in the opposite order.
create function lumo_private.approved_merchant_legacy_boundary(p_command text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare target_shop uuid;account_check jsonb;
begin
 if p_command not in('payment.pay','payment.refund','refund.decide') then return null;end if;
 account_check:=lumo_private.pilot_command('account.get','{}'::jsonb);
 if account_check->>'ok' is distinct from 'true' then return account_check;end if;
 begin
  if p_command='payment.pay' then target_shop:=(p_payload->>'shopId')::uuid;
  elsif p_command='payment.refund' then select j.shop_id into target_shop from lumo_private.journals j where j.id=(p_payload->>'paymentId')::uuid;
  else select j.shop_id into target_shop from lumo_private.refund_proposals r join lumo_private.journals j on j.id=r.payment_id where r.id=(p_payload->>'proposalId')::uuid;
  end if;
 exception when invalid_text_representation then return null;end;
 if target_shop is not null and exists(select 1 from lumo_private.approved_merchant_network n
  cross join lateral jsonb_each(n.document->'businesses') business
  cross join lateral jsonb_array_elements(business.value->'shops') shop where shop.value->>'id'=target_shop::text) then
  return lumo_private.failure('APPROVED_MERCHANT_REQUIRED','Open the approved Lumo experience to complete this merchant payment or refund.',false);
 end if;
 return null;
end $$;
revoke all on function lumo_private.approved_merchant_legacy_boundary(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function lumo_private.approved_merchant_legacy_boundary(text,jsonb) to authenticated;
create or replace function public.lumo_rpc(p_command text,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare blocked jsonb;
begin
 blocked:=lumo_private.approved_merchant_legacy_boundary(p_command,p_payload);
 if blocked is not null then return blocked;end if;
 return lumo_private.connected_command(p_command,p_payload);
end $$;
