-- Preserve approved v7 private test-QR access and publication readiness.
create function public.lumo_approved_merchant_access(p_shop uuid,p_test_key text default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare shop jsonb;
begin
 select item.value into shop from lumo_private.approved_merchant_network n
 cross join lateral jsonb_each(n.document->'businesses') business
 cross join lateral jsonb_array_elements(business.value->'shops') item where item.value->>'id'=p_shop::text;
 if shop is null then return jsonb_build_object('ok',true,'managed',false);end if;
 if shop->>'published'='true' or length(p_test_key)=64 and shop->>'testAcceptanceToken'=p_test_key then return jsonb_build_object('ok',true,'managed',true,'published',shop->>'published'='true');end if;
 return jsonb_build_object('ok',false,'code','SHOP_NOT_READY','message','This shop is not published yet. Scan its private test QR or ask the merchant to finish counter setup.');
end $$;
revoke all on function public.lumo_approved_merchant_access(uuid,text) from public,anon,authenticated;
grant execute on function public.lumo_approved_merchant_access(uuid,text) to service_role;

create function lumo_private.approved_merchant_payment_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare shop jsonb;allowed_shop text;
begin
 if new.type<>'merchant_payment' then return new;end if;
 select item.value into shop from lumo_private.approved_merchant_network n
 cross join lateral jsonb_each(n.document->'businesses') business
 cross join lateral jsonb_array_elements(business.value->'shops') item where item.value->>'id'=new.shop_id::text;
 if shop is not null and shop->>'published' is distinct from 'true' then
  allowed_shop:=current_setting('lumo.approved.merchant_shop',true);
  -- A one-posting permission is installed only after the trusted engine validates
  -- the private QR token. Direct legacy payment.pay cannot bypass publication.
  if allowed_shop is distinct from new.shop_id::text then raise exception using errcode='P0001',message='SHOP_NOT_READY';end if;
  perform set_config('lumo.approved.merchant_shop','',true);
 end if;
 return new;
end $$;
revoke all on function lumo_private.approved_merchant_payment_guard() from public,anon,authenticated,service_role;
create trigger lumo_approved_merchant_payment_guard before insert on lumo_private.journals for each row execute function lumo_private.approved_merchant_payment_guard();

-- Retain the reviewed core function verbatim apart from the scoped permission
-- around its canonical posting call. Fail installation if its expected seam moved.
do $migration$
declare definition text;needle text:='j:=lumo_private.post_money(actor,i->>''kind''';replacement text;
begin
 select pg_get_functiondef('lumo_private.approved_service(text,jsonb)'::regprocedure) into definition;
 if position(needle in definition)=0 then raise exception 'Approved merchant posting seam changed; review before applying.';end if;
 replacement:='if i->>''kind''=''merchant_payment'' and i#>>''{metadata,merchantAccessApproved}''=''true'' then perform set_config(''lumo.approved.merchant_shop'',i->>''shopId'',true);end if; '||needle;
 definition:=replace(definition,needle,replacement);
 execute definition;
end $migration$;
