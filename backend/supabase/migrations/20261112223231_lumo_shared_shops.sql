-- An owner adds receiving shops beneath the existing merchant account. No new money account is created.
create function lumo_private.shop_create(p_payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 actor uuid:=auth.uid(); attempt text; body_hash text; prior lumo_private.attempts%rowtype;
 target_id uuid; target lumo_private.merchants%rowtype; label text; created lumo_private.shops%rowtype; result jsonb;
begin
 -- Called only by the guarded pilot dispatcher, which first verifies the live session and active account.
 if actor is null then return lumo_private.failure('AUTH_REQUIRED','Sign in to Lumo before continuing.',false);end if;
 if jsonb_typeof(p_payload) is distinct from 'object' then return lumo_private.failure('INVALID_SHOP','Enter the receiving shop details.',false);end if;
 attempt:=p_payload->>'attemptId';
 if jsonb_typeof(p_payload->'attemptId') is distinct from 'string' or attempt is null or attempt !~ '^[A-Za-z0-9_.:-]{10,100}$' then
  return lumo_private.failure('INVALID_ATTEMPT','Save a unique shop reference before continuing.',false);
 end if;
 body_hash:=encode(extensions.digest('shop.create:'||(p_payload-'pin')::text,'sha256'),'hex');
 select * into prior from lumo_private.attempts where user_id=actor and attempt_id=attempt;
 if found then
  if prior.command<>'shop.create' or prior.fingerprint<>body_hash then return lumo_private.failure('IDEMPOTENCY_MISMATCH','This reference belongs to different details. Check the original action.',false,attempt);end if;
  return prior.result||jsonb_build_object('replayed',true,'account',lumo_private.account_json(actor));
 end if;
 if jsonb_typeof(p_payload->'merchantId') is distinct from 'string' then result:=lumo_private.failure('INVALID_MERCHANT','Choose one of your merchant businesses.',true,attempt);
 else
  begin target_id:=(p_payload->>'merchantId')::uuid;
  exception when invalid_text_representation then result:=lumo_private.failure('INVALID_MERCHANT','Choose one of your merchant businesses.',true,attempt);end;
 end if;
 label:=trim(p_payload->>'name');
 if result is null and (jsonb_typeof(p_payload->'name') is distinct from 'string' or label is null or length(label) not between 1 and 100 or label~'[[:cntrl:]<>]') then
  result:=lumo_private.failure('INVALID_SHOP','Use a shop name between 1 and 100 characters.',true,attempt);
 end if;
 if result is null then
  select * into target from lumo_private.merchants where id=target_id and owner_user_id=actor for update;
  if not found then result:=lumo_private.failure('FORBIDDEN','Only the merchant owner can add a receiving shop.',true,attempt);
  elsif target.status<>'active' then result:=lumo_private.failure('SHOP_PAUSED','This merchant business is paused.',true,attempt);
  elsif (select count(*) from lumo_private.shops where merchant_id=target.id)>=20 then result:=lumo_private.failure('SHOP_LIMIT','This pilot business already has twenty shops.',true,attempt);
  elsif exists(select 1 from lumo_private.shops s where s.merchant_id=target.id and lower(trim(s.name))=lower(label)) then result:=lumo_private.failure('SHOP_NAME_TAKEN','A shop with that name already belongs to this business.',true,attempt);
  else
   insert into lumo_private.shops(merchant_id,name) values(target.id,label) returning * into created;
   result:=jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','attemptId',attempt,'merchantId',target.id,'selectedShopId',created.id,
    'shop',jsonb_build_object('id',created.id,'merchantId',target.id,'name',created.name,'accepting',created.accepting,'tradingSince',created.trading_since,'netCollected',0));
  end if;
 end if;
 result:=result||jsonb_build_object('attemptId',attempt,'replayed',false,'account',lumo_private.account_json(actor));
 insert into lumo_private.attempts(user_id,attempt_id,command,fingerprint,result) values(actor,attempt,'shop.create',body_hash,result);
 return result;
end $$;
revoke all on function lumo_private.shop_create(jsonb) from public,anon,authenticated,service_role;

create or replace function lumo_private.pilot_command(p_command text,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); account_check jsonb;
begin
 if actor is null then return lumo_private.failure('AUTH_REQUIRED','Sign in to Lumo before continuing.',false);end if;
 if not exists(select 1 from auth.users u where u.id=actor and u.raw_app_meta_data->'lumo_pilot'='true'::jsonb) then
  return lumo_private.failure('PILOT_REQUIRED','Create your test account through the connected Lumo pilot.',false);
 end if;
 if p_command='shop.create' then
  -- account.get verifies live auth.sessions, user restrictions, profile/account status and takes the actor advisory lock.
  account_check:=lumo_private.command('account.get','{}'::jsonb);
  if account_check->>'ok' is distinct from 'true' then return account_check;end if;
  return lumo_private.shop_create(p_payload);
 end if;
 return lumo_private.command(p_command,p_payload);
end $$;
revoke all on function lumo_private.pilot_command(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function lumo_private.pilot_command(text,jsonb) to authenticated;
