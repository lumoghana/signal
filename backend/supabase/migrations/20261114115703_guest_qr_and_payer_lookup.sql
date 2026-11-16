-- Published QR pointers share the existing guest checkout ledger and recovery
-- flow. Links are provisioned only by this migration or private deferred hooks
-- after merchant publication/request writes, never by an anonymous visitor.
create or replace function lumo_private.ensure_guest_qr_links(p_shop uuid)
returns void language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare sh lumo_private.shops%rowtype;m lumo_private.merchants%rowtype;r lumo_private.payment_requests%rowtype;
 n jsonb;b jsonb;request_doc jsonb;operator jsonb;operator_id text;counter_id text;
begin
 select * into sh from lumo_private.shops where id=p_shop;
 select * into m from lumo_private.merchants where id=sh.merchant_id and status='active';
 if m.id is null or not exists(select 1 from lumo_private.shop_settings where shop_id=sh.id and published) then return;end if;
 select document into n from lumo_private.approved_merchant_network where id;
 b:=n#>array['businesses',m.id::text];
 select value into operator from jsonb_array_elements(coalesce(n->'users','[]'::jsonb))
  where value->>'businessId'=m.id::text and value->>'_sharedUserId'=m.owner_user_id::text and value->>'role'='owner' limit 1;
 -- A reusable shop QR is deliberately shop-attributed, with no cashier/counter.
 if not exists(select 1 from lumo_private.merchant_payment_links where shop_id=sh.id and kind='shop') then
  insert into lumo_private.merchant_payment_links(public_token,merchant_id,shop_id,description,kind,attribution,operator_id,counter_id,attempt_id,fingerprint,created_by)
  values(encode(extensions.gen_random_bytes(32),'hex'),m.id,sh.id,'','shop','shop',coalesce(operator->>'id','qr-shop-'||m.id::text),null,'qr-shop-'||sh.id::text,md5('qr-shop-v1:'||sh.id::text),m.owner_user_id)
  on conflict do nothing;
 end if;
 for r in select * from lumo_private.payment_requests pr where pr.shop_id=sh.id and pr.status='open' and pr.expires_at>clock_timestamp()
  and not exists(select 1 from lumo_private.merchant_payment_links q where q.request_id=pr.id)
 loop
  -- The durable server document contains the true operator even when a counter
  -- authenticates with the shop owner's shared Auth identity. Never infer a
  -- cashier from created_by or a browser-supplied field.
  select value into request_doc from jsonb_array_elements(coalesce(b->'requests','[]'::jsonb))
   where value->>'id'=r.id::text and value->>'shopId'=sh.id::text;
  operator_id:=case when request_doc->>'staffId' like 'access-%' then substr(request_doc->>'staffId',8)
                    when request_doc->>'staffId' like 'owner-%' then substr(request_doc->>'staffId',7)
                    else request_doc->>'createdByUserId' end;
  select value into operator from jsonb_array_elements(coalesce(n->'users','[]'::jsonb))
   where value->>'id'=operator_id and value->>'businessId'=m.id::text;
  if request_doc is null or operator is null then continue;end if;
  counter_id:=nullif(request_doc->>'counterId','');
  insert into lumo_private.merchant_payment_links(public_token,merchant_id,shop_id,request_id,description,kind,attribution,operator_id,counter_id,attempt_id,fingerprint,created_by)
  values(encode(extensions.gen_random_bytes(32),'hex'),m.id,sh.id,r.id,r.note,'request','request',operator_id,counter_id,'qr-request-'||r.id::text,md5('qr-request-v1:'||r.id::text),r.created_by)
  on conflict do nothing;
 end loop;
end $$;
revoke all on function lumo_private.ensure_guest_qr_links(uuid) from public,anon,authenticated,service_role;

create or replace function lumo_private.guest_qr_links_after_write()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='merchants' then
  perform lumo_private.ensure_guest_qr_links(s.id) from lumo_private.shops s where s.merchant_id=new.id;
 else
  perform lumo_private.ensure_guest_qr_links(new.shop_id);
 end if;
 return null;
end $$;
revoke all on function lumo_private.guest_qr_links_after_write() from public,anon,authenticated,service_role;
-- Deferred hooks observe the final canonical merchant document and let explicit
-- authenticated share-link creation retain its own attribution and revocations.
create constraint trigger lumo_guest_qr_after_publication after insert or update on lumo_private.shop_settings
 deferrable initially deferred for each row execute function lumo_private.guest_qr_links_after_write();
create constraint trigger lumo_guest_qr_after_request after insert or update on lumo_private.payment_requests
 deferrable initially deferred for each row execute function lumo_private.guest_qr_links_after_write();
create constraint trigger lumo_guest_qr_after_merchant after insert or update on lumo_private.merchants
 deferrable initially deferred for each row execute function lumo_private.guest_qr_links_after_write();
-- Cover already printed published QR codes without requiring a prior share.
select lumo_private.ensure_guest_qr_links(s.id) from lumo_private.shops s
 join lumo_private.shop_settings ss on ss.shop_id=s.id where ss.published;

CREATE OR REPLACE FUNCTION public.lumo_guest_checkout(p_operation text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_variable
declare l lumo_private.merchant_payment_links%rowtype;a lumo_private.guest_momo_attempts%rowtype;r lumo_private.payment_requests%rowtype;
 m lumo_private.merchants%rowtype;sh lumo_private.shops%rowtype;ss lumo_private.shop_settings%rowtype;
 amount bigint;token text;attempt text;recovery text;phone text;network text;rate text;source uuid;shop_record jsonb;
 provider jsonb:=jsonb_build_object('mode','sandbox','name','Lumo MoMo test provider','live',false);
begin
 if (auth.jwt()->>'role') is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN','noMutation',true);end if;
 if p_operation not in('resolve','quote','lookup','initiate','status','sandboxResult') or jsonb_typeof(p_payload)<>'object' then return jsonb_build_object('ok',false,'code','INVALID_INPUT','noMutation',true);end if;
 rate:=p_payload->>'rateKey';if rate is null or rate!~'^[a-f0-9]{64}$' then return jsonb_build_object('ok',false,'code','INVALID_INPUT','noMutation',true);end if;
 if not lumo_private.guest_rate('guest:'||p_operation||':'||rate,case p_operation when 'initiate' then 10 when 'lookup' then 30 when 'resolve' then 90 when 'quote' then 90 else 120 end) then return jsonb_build_object('ok',false,'code','RATE_LIMITED','noMutation',true);end if;
 begin
 if p_operation in('status','sandboxResult') then
  attempt:=p_payload->>'attemptId';recovery:=p_payload->>'recoveryHash';
  select * into a from lumo_private.guest_momo_attempts where id=attempt and recovery_hash=recovery;
  if a.id is null then raise exception 'RECOVERY_REQUIRED';end if;
  if p_operation='sandboxResult' then perform lumo_private.guest_apply_result(a.id,p_payload->>'outcome',a.amount,a.currency,a.merchant_id,a.shop_id,a.provider_reference);end if;
  return jsonb_build_object('ok',true,'sandbox',true,'provider',provider,'currency','GHS','fee',0,'attempt',lumo_private.guest_attempt_json(a.id));
 end if;
 if p_operation='resolve' then
  if coalesce(p_payload->>'shopId','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   or p_payload ? 'requestId' and coalesce(p_payload->>'requestId','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then raise exception 'INVALID_INPUT';end if;
  -- A QR is a pointer to an already provisioned public checkout. This read
  -- never creates a token, request, attempt, account or payment.
  select * into l from lumo_private.merchant_payment_links q
   where q.shop_id=(p_payload->>'shopId')::uuid and q.request_id is not distinct from nullif(p_payload->>'requestId','')::uuid
   order by q.created_at desc,q.id limit 1;
 else
  token:=p_payload->>'link';if token is null or token!~'^[a-f0-9]{64}$' then raise exception 'INVALID_INPUT';end if;
  select * into l from lumo_private.merchant_payment_links where public_token=token;
 end if;
 if l.id is null then raise exception 'LINK_UNAVAILABLE';end if;
 select * into m from lumo_private.merchants where id=l.merchant_id;
 select * into sh from lumo_private.shops where id=l.shop_id;
 select * into ss from lumo_private.shop_settings where shop_id=l.shop_id;
 if p_operation='initiate' then
  attempt:=p_payload->>'attemptId';recovery:=p_payload->>'recoveryHash';phone:=p_payload->>'phone';network:=p_payload->>'network';
  if attempt is null or attempt!~'^[A-Za-z0-9_.:-]{10,100}$' or recovery is null or recovery!~'^[a-f0-9]{64}$' or phone is null or phone!~'^0[25][0-9]{8}$' or network is null or network not in('mtn','telecel','airteltigo') or jsonb_typeof(p_payload->'amount')<>'number' or (p_payload->>'amount')!~'^[0-9]+$' then raise exception 'INVALID_INPUT';end if;
  amount:=(p_payload->>'amount')::bigint;if amount not between 1 and 1000000 then raise exception 'INVALID_INPUT';end if;
  select * into a from lumo_private.guest_momo_attempts where id=attempt;
  if a.id is not null then
   if a.recovery_hash<>recovery then raise exception 'RECOVERY_REQUIRED';end if;
   if a.link_id<>l.id or a.amount<>amount or a.phone<>phone then raise exception 'IDEMPOTENCY_CONFLICT';end if;
   return jsonb_build_object('ok',true,'sandbox',true,'provider',provider,'currency','GHS','fee',0,'attempt',lumo_private.guest_attempt_json(a.id),'replayed',true);
  end if;
 end if;
 if l.revoked_at is not null or m.status<>'active' or sh.merchant_id<>m.id or ss.published is distinct from true then raise exception 'LINK_UNAVAILABLE';end if;
 if not sh.accepting then raise exception 'SHOP_UNAVAILABLE';end if;
 if l.request_id is not null then
  select * into r from lumo_private.payment_requests where id=l.request_id and shop_id=l.shop_id;
  if r.id is null or r.status<>'open' or r.expires_at<=clock_timestamp() then raise exception 'LINK_UNAVAILABLE';end if;
 end if;
 if p_operation='lookup' then return jsonb_build_object('ok',true,'sandbox',true,'provider',provider,'currency','GHS','fee',0);end if;
 if p_operation in('quote','resolve') then
  select s.value into shop_record from lumo_private.approved_merchant_network n cross join lateral jsonb_each(n.document->'businesses') b cross join lateral jsonb_array_elements(b.value->'shops') s where s.value->>'id'=sh.id::text;
  return jsonb_build_object('ok',true,'sandbox',true,'provider',provider,'currency','GHS','fee',0,'networks',jsonb_build_array('mtn','telecel','airteltigo'),
   'merchant',jsonb_build_object('id',m.id,'name',m.name),'shop',jsonb_build_object('id',sh.id,'merchantId',m.id,'name',sh.name,'code',shop_record->>'code','area',ss.location,'landmark',shop_record->>'landmark','hours',shop_record->>'hours','accepting',sh.accepting,'published',ss.published),
   'request',case when r.id is null then null else jsonb_build_object('id',r.id,'amount',r.amount,'description',r.note,'status',r.status,'expiresAt',r.expires_at) end,'link',lumo_private.guest_link_json(l.id));
 end if;
 select id into source from lumo_private.accounts where kind='test_funding';
 perform 1 from lumo_private.accounts where id in(source,m.account_id) order by id for update;
 -- Recheck after acquiring the same lock as wallet payments: completed pauses,
 -- revocations and publication changes must win before provider initiation.
 select * into l from lumo_private.merchant_payment_links where id=l.id for share;
 select * into m from lumo_private.merchants where id=l.merchant_id;
 select * into sh from lumo_private.shops where id=l.shop_id;
 select * into ss from lumo_private.shop_settings where shop_id=l.shop_id;
 if l.revoked_at is not null or m.status<>'active' or ss.published is distinct from true then raise exception 'LINK_UNAVAILABLE';end if;
 if not sh.accepting then raise exception 'SHOP_UNAVAILABLE';end if;
 if l.request_id is not null then
  select * into r from lumo_private.payment_requests where id=l.request_id for update;
  if r.id is null or r.status<>'open' or r.expires_at<=clock_timestamp() then raise exception 'LINK_UNAVAILABLE';end if;
  if amount<>r.amount then raise exception 'AMOUNT_CHANGED';end if;
  if exists(select 1 from lumo_private.guest_momo_attempts where request_id=r.id and status='pending') then
   select * into a from lumo_private.guest_momo_attempts where id=attempt and recovery_hash=recovery;
   if a.id is not null and a.link_id=l.id and a.amount=amount and a.phone=phone then return jsonb_build_object('ok',true,'sandbox',true,'provider',provider,'currency','GHS','fee',0,'attempt',lumo_private.guest_attempt_json(a.id),'replayed',true);end if;
   raise exception 'REQUEST_PROCESSING';
  end if;
 end if;
 insert into lumo_private.guest_momo_attempts(id,recovery_hash,link_id,merchant_id,shop_id,request_id,amount,phone,network)
 values(attempt,recovery,l.id,m.id,sh.id,l.request_id,amount,phone,network) on conflict(id) do nothing returning * into a;
 if a.id is null then
  select * into a from lumo_private.guest_momo_attempts where id=attempt;
  if a.recovery_hash<>recovery then raise exception 'RECOVERY_REQUIRED';end if;
  if a.link_id<>l.id or a.amount<>amount or a.phone<>phone then raise exception 'IDEMPOTENCY_CONFLICT';end if;
 end if;
 return jsonb_build_object('ok',true,'sandbox',true,'provider',provider,'currency','GHS','fee',0,'attempt',lumo_private.guest_attempt_json(a.id));
exception when others then return jsonb_build_object('ok',false,'noMutation',true,'code',case when SQLERRM in('FORBIDDEN','INVALID_INPUT','LINK_UNAVAILABLE','SHOP_UNAVAILABLE','AMOUNT_CHANGED','IDEMPOTENCY_CONFLICT','RECOVERY_REQUIRED','REQUEST_PROCESSING','PAYMENT_FINAL','PROVIDER_RESULT_MISMATCH','PROVIDER_UNAVAILABLE') then SQLERRM else 'GUEST_SERVICE_ERROR' end);
end;
end $function$;


