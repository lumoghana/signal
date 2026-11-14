-- A reusable link keeps its public purpose. Distinct order references must
-- never silently resolve to the first shop description.
drop index lumo_private.lumo_guest_reusable_shop_link;
create unique index lumo_guest_reusable_shop_link on lumo_private.merchant_payment_links(shop_id,description) where kind='shop' and revoked_at is null;

create or replace function public.lumo_guest_merchant(p_actor uuid,p_session uuid,p_merchant_token_hash text,p_operation text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare c jsonb;n jsonb;b jsonb;shop_record jsonb;existing_request jsonb;shift_record jsonb;
 l lumo_private.merchant_payment_links%rowtype;r lumo_private.payment_requests%rowtype;sh lumo_private.shops%rowtype;m lumo_private.merchants%rowtype;
 link_id uuid;shop_id uuid;request_id uuid;amount bigint;expires timestamptz;description text;attempt text;fingerprint text;attribution text;links jsonb;collections jsonb;
begin
 c:=lumo_private.guest_merchant_actor(p_actor,p_session,p_merchant_token_hash);
 if c->>'locked'='true' then
  if p_operation in ('summary','list') then return jsonb_build_object('ok',true,'links','[]'::jsonb,'paymentLinks','[]'::jsonb,'guestCollections','[]'::jsonb);end if;
  raise exception 'COUNTER_LOCKED';
 end if;
 select document into n from lumo_private.approved_merchant_network where id;
 b:=n#>array['businesses',c->>'businessId'];
 if p_operation in ('summary','list') then
  select coalesce(jsonb_agg(lumo_private.guest_link_json(q.id)||jsonb_build_object(
   'requestPayment',(select jsonb_build_object('id',j.id,'requestId',j.request_id,'shopId',j.shop_id,'reference',j.reference,'amount',j.amount,'currency','GHS','status','posted','createdAt',j.created_at,'rail',case when exists(select 1 from lumo_private.guest_momo_attempts ga where ga.journal_id=j.id) then 'momo' else 'lumo' end) from lumo_private.payment_requests pr join lumo_private.journals j on j.id=pr.paid_journal_id join lumo_private.merchants pm on pm.account_id=j.payee_account_id where pr.id=q.request_id and j.request_id=pr.id and j.shop_id=q.shop_id and pm.id=q.merchant_id and j.amount=pr.amount and j.type='merchant_payment'),
   'confirmedCount',(select count(*) from lumo_private.journals j where j.type='merchant_payment' and exists(select 1 from lumo_private.guest_momo_attempts g where g.link_id=q.id and g.journal_id=j.id)),
   'confirmedAmount',(select coalesce(sum(j.amount),0) from lumo_private.journals j where j.type='merchant_payment' and exists(select 1 from lumo_private.guest_momo_attempts g where g.link_id=q.id and g.journal_id=j.id)),
   'guestConfirmedAmount',(select coalesce(sum(g.amount),0) from lumo_private.guest_momo_attempts g where g.link_id=q.id and g.status='confirmed'),
   'lumoConfirmedAmount',0,'coverage','Guest MoMo link payments; Lumo wallet source is not recorded',
   'pendingCount',(select count(*) from lumo_private.guest_momo_attempts g where g.link_id=q.id and g.status='pending'),
   'pendingAmount',(select coalesce(sum(g.amount),0) from lumo_private.guest_momo_attempts g where g.link_id=q.id and g.status='pending')) order by q.created_at desc),'[]'::jsonb) into links
  from (select * from lumo_private.merchant_payment_links q where q.merchant_id=(c->>'businessId')::uuid and (c->>'role'='owner' or c->'shopIds'?q.shop_id::text)
   and (c->>'role'<>'cashier' or q.kind='shop' or q.operator_id=c->>'operatorId' or c->>'counterId' is not null and q.counter_id=c->>'counterId') order by q.created_at desc limit 200) q;
  select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'shopId',g.shop_id,'linkId',g.link_id,'requestId',g.request_id,'providerReference',g.provider_reference,'reference',coalesce(j.reference,g.provider_reference),'status',g.status,'amount',g.amount,'currency',g.currency,'network',g.network,'phoneMasked','••••••'||right(g.phone,4),'createdAt',g.created_at,'confirmedAt',g.confirmed_at,'journalId',g.journal_id,'rail','momo','providerMode','sandbox','settlementStatus',case when g.status='confirmed' then 'sandbox-posted' else 'not-posted' end,'refundedAmount',coalesce((select sum(gr.amount) from lumo_private.guest_momo_refunds gr where gr.attempt_id=g.id),0)) order by g.created_at desc),'[]'::jsonb) into collections
  from lumo_private.guest_momo_attempts g join lumo_private.merchant_payment_links q on q.id=g.link_id left join lumo_private.journals j on j.id=g.journal_id
  where g.merchant_id=(c->>'businessId')::uuid and (c->>'role'='owner' or c->'shopIds'?g.shop_id::text)
  and (c->>'role'<>'cashier' or q.kind='shop' or q.operator_id=c->>'operatorId' or c->>'counterId' is not null and q.counter_id=c->>'counterId');
  if c->>'role'='cashier' then
   select coalesce(jsonb_agg(value-'confirmedCount'-'confirmedAmount'-'guestConfirmedAmount'-'lumoConfirmedAmount'-'pendingCount'-'pendingAmount'),'[]'::jsonb) into links from jsonb_array_elements(links);
   select coalesce(jsonb_agg(value order by value->>'createdAt' desc),'[]'::jsonb) into collections from (select value from jsonb_array_elements(collections) where (value->>'createdAt')::timestamptz>clock_timestamp()-interval '24 hours' order by value->>'createdAt' desc limit 100) recent;
  end if;
  return jsonb_build_object('ok',true,'links',links,'paymentLinks',links,'guestCollections',collections,'sandbox',true);
 end if;
 if p_operation not in ('create','cancel') then raise exception 'INVALID_INPUT';end if;
 if p_operation='cancel' then
  select * into l from lumo_private.merchant_payment_links where id=(p_payload->>'id')::uuid and merchant_id=(c->>'businessId')::uuid for update;
  if l.id is null or c->>'role'<>'owner' and not(c->'shopIds'?l.shop_id::text) or c->>'role'='cashier' and l.operator_id<>c->>'operatorId' and (c->>'counterId' is null or l.counter_id is distinct from c->>'counterId') then raise exception 'FORBIDDEN';end if;
  if exists(select 1 from lumo_private.guest_momo_attempts where link_id=l.id and status='pending') then raise exception 'REQUEST_PROCESSING';end if;
  if l.request_id is not null then update lumo_private.payment_requests set status='cancelled' where id=l.request_id and status='open';end if;
  update lumo_private.merchant_payment_links set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=l.id;
  return jsonb_build_object('ok',true,'link',lumo_private.guest_link_json(l.id));
 end if;
 shop_id:=(p_payload->>'shopId')::uuid;attempt:=p_payload->>'attemptId';
 if attempt is null or attempt!~'^[A-Za-z0-9_.:-]{10,100}$' then raise exception 'INVALID_INPUT';end if;
 if c->>'role'<>'owner' and not(c->'shopIds'?shop_id::text) then raise exception 'FORBIDDEN';end if;
 if c->>'counterId' is not null then
  select value into shift_record from jsonb_array_elements(coalesce(b->'shifts','[]'::jsonb)) where value->>'shopId'=shop_id::text and value->>'staffId'='access-'||(c->>'operatorId') and value->>'status'='open' limit 1;
  if p_payload->>'counterStaffId' is distinct from 'access-'||(c->>'operatorId') or p_payload->>'counterShiftId' is distinct from shift_record->>'id' then raise exception 'COUNTER_OPERATOR_CHANGED';end if;
 end if;
 select * into sh from lumo_private.shops where id=shop_id;
 select * into m from lumo_private.merchants where id=sh.merchant_id and status='active';
 if m.id is null or m.id::text<>c->>'businessId' then raise exception 'FORBIDDEN';end if;
 if not sh.accepting or not exists(select 1 from lumo_private.shop_settings where shop_settings.shop_id=sh.id and published) then raise exception 'SHOP_UNAVAILABLE';end if;
 description:=left(btrim(coalesce(p_payload->>'description','')),160);
 fingerprint:=md5(jsonb_build_object('shopId',shop_id,'requestId',p_payload->>'requestId','amount',p_payload->'amount','description',description,'validity',coalesce(p_payload->>'validity','7d'))::text);
 select * into l from lumo_private.merchant_payment_links where merchant_id=m.id and created_by=(c->>'sharedUserId')::uuid and attempt_id=attempt;
 if l.id is not null then if l.fingerprint<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT';end if;return jsonb_build_object('ok',true,'link',lumo_private.guest_link_json(l.id),'replayed',true);end if;
 if p_payload->>'requestId' is not null then
  request_id:=(p_payload->>'requestId')::uuid;
  select * into r from lumo_private.payment_requests where id=request_id and payment_requests.shop_id=sh.id;
  if r.id is null or r.status<>'open' or r.expires_at<=clock_timestamp() then raise exception 'LINK_UNAVAILABLE';end if;
  select value into existing_request from jsonb_array_elements(coalesce(b->'requests','[]'::jsonb)) where value->>'id'=request_id::text;
  if c->>'role'='cashier' and not coalesce((existing_request->>'staffId'='access-'||(c->>'operatorId') or c->>'counterId' is not null and existing_request->>'counterId'=c->>'counterId'),false) then raise exception 'FORBIDDEN';end if;
  select * into l from lumo_private.merchant_payment_links where merchant_payment_links.request_id=r.id;
  if l.id is not null then return jsonb_build_object('ok',true,'link',lumo_private.guest_link_json(l.id),'replayed',true);end if;
  attribution:='request';description:=coalesce(nullif(description,''),r.note);
 elsif p_payload->'amount' is not null and p_payload->'amount'<>'null'::jsonb then
  if jsonb_typeof(p_payload->'amount')<>'number' or (p_payload->>'amount')!~'^[0-9]+$' then raise exception 'INVALID_INPUT';end if;
  amount:=(p_payload->>'amount')::bigint;if amount not between 1 and 1000000 then raise exception 'INVALID_INPUT';end if;
  if coalesce(p_payload->>'validity','7d') not in ('24h','7d') then raise exception 'INVALID_INPUT';end if;
  expires:=clock_timestamp()+case when p_payload->>'validity'='24h' then interval '24 hours' else interval '7 days' end;
  insert into lumo_private.payment_requests(shop_id,amount,note,created_by,expires_at) values(sh.id,amount,description,(c->>'sharedUserId')::uuid,expires) returning id into request_id;
  attribution:='shop';
 else
  select q.* into l from lumo_private.merchant_payment_links q where q.shop_id=sh.id and q.kind='shop' and q.revoked_at is null and q.description=description;
  if l.id is not null then return jsonb_build_object('ok',true,'link',lumo_private.guest_link_json(l.id),'replayed',true);end if;
  attribution:='shop';
 end if;
 insert into lumo_private.merchant_payment_links(public_token,merchant_id,shop_id,request_id,description,kind,attribution,operator_id,counter_id,attempt_id,fingerprint,created_by)
 values(encode(extensions.gen_random_bytes(32),'hex'),m.id,sh.id,request_id,description,case when request_id is null then 'shop' else 'request' end,attribution,c->>'operatorId',c->>'counterId',attempt,fingerprint,(c->>'sharedUserId')::uuid) returning id into link_id;
 return jsonb_build_object('ok',true,'link',lumo_private.guest_link_json(link_id));
exception when others then return jsonb_build_object('ok',false,'code',case when SQLERRM in ('SESSION_REVOKED','FORBIDDEN','COUNTER_LOCKED','COUNTER_OPERATOR_CHANGED','SHOP_UNAVAILABLE','LINK_UNAVAILABLE','REQUEST_PROCESSING','INVALID_INPUT','IDEMPOTENCY_CONFLICT') then SQLERRM else 'LINK_SERVICE_ERROR' end);
end $$;
