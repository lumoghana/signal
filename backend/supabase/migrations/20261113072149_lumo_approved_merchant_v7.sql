-- Approved merchant v7 compatibility storage. The trusted v7 engine owns metadata;
-- canonical immutable shared journals own every payment and refund.
create table lumo_private.approved_merchant_network (
 id boolean primary key default true check(id),revision bigint not null default 0,
 document jsonb not null default '{"version":1,"counters":{"business":1000,"shop":100000,"account":100000},"businesses":{},"users":[],"sessions":[],"invitations":[],"recoveries":[],"wallets":{},"studentSessions":[],"devices":[],"audit":[],"attempts":{},"rateLimits":{},"refundAttempts":{},"settlementAttempts":{},"signupAttempts":{},"importAttempts":{}}'::jsonb
);
insert into lumo_private.approved_merchant_network(id) values(true);
create table lumo_private.approved_merchant_refunds(refund_id text primary key,journal_id uuid not null unique references lumo_private.journals(id));
alter table lumo_private.approved_merchant_network enable row level security;
alter table lumo_private.approved_merchant_refunds enable row level security;
revoke all on lumo_private.approved_merchant_network,lumo_private.approved_merchant_refunds from public,anon,authenticated,service_role;

create function lumo_private.approved_merchant_stamp() returns text language sql stable set search_path='' as $$
 select md5(coalesce(string_agg(j.id::text,',' order by j.id),'')) from lumo_private.journals j
 where exists(select 1 from lumo_private.merchants m where m.account_id in(j.payer_account_id,j.payee_account_id));
$$;
create function public.lumo_approved_merchant_read(p_actor uuid default null,p_session uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare n lumo_private.approved_merchant_network%rowtype;
begin
 if p_actor is not null and not lumo_private.approved_live(p_actor,p_session) then return jsonb_build_object('ok',false,'code','SESSION_REVOKED');end if;
 select * into n from lumo_private.approved_merchant_network where id;
 return jsonb_build_object('ok',true,'revision',n.revision,'state',n.document,'ledgerStamp',lumo_private.approved_merchant_stamp(),
 'ledger',coalesce((select jsonb_agg(lumo_private.receipt_json(j.id)||jsonb_build_object('payerName',pp.display_name,'merchantId',m.id,'refundId',rf.refund_id) order by j.created_at,j.id)
 from lumo_private.journals j join lumo_private.merchants m on m.account_id in(j.payer_account_id,j.payee_account_id)
 left join lumo_private.accounts pa on pa.id=j.payer_account_id left join lumo_private.profiles pp on pp.user_id=pa.owner_user_id
 left join lumo_private.approved_merchant_refunds rf on rf.journal_id=j.id where j.type in('merchant_payment','refund')),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'shopId',r.shop_id,'amount',r.amount,'description',r.note,'status',r.status,'expiresAt',r.expires_at,'createdAt',r.created_at,'createdBySharedUserId',r.created_by)) from lumo_private.payment_requests r),'[]'::jsonb),
 'balances',coalesce((select jsonb_object_agg(m.id::text,jsonb_build_object('balance',a.balance,'accountId',a.id)) from lumo_private.merchants m join lumo_private.accounts a on a.id=m.account_id),'{}'::jsonb));
end $$;

create function public.lumo_approved_merchant_commit(p_actor uuid,p_session uuid,p_revision bigint,p_ledger_stamp text,p_state jsonb,p_money_authorized boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare saved lumo_private.approved_merchant_network%rowtype;b jsonb;old_b jsonb;u jsonb;owner_u jsonb;s jsonb;r jsonb;old_r jsonb;
 merchant_id uuid;account_id uuid;shop_id uuid;owner_id uuid;user_id uuid;j uuid;original lumo_private.journals%rowtype;role text;already bigint;amount bigint;new_revision bigint;
begin
 if not lumo_private.approved_live(p_actor,p_session) then return jsonb_build_object('ok',false,'code','SESSION_REVOKED');end if;
 if jsonb_typeof(p_state) is distinct from 'object' or octet_length(p_state::text)>16000000 then return jsonb_build_object('ok',false,'code','INVALID_NETWORK');end if;
 select * into saved from lumo_private.approved_merchant_network where id for update;
 if saved.revision<>p_revision then return jsonb_build_object('ok',false,'code','CONCURRENT_UPDATE');end if;
 -- Shared payments and metadata mutations use the same canonical account locks.
 perform 1 from lumo_private.accounts a
 where exists(select 1 from lumo_private.merchants m where m.account_id=a.id)
 or exists(select 1 from jsonb_each(p_state->'businesses') business
   cross join lateral jsonb_array_elements(business.value->'refunds') refund
   join lumo_private.journals original_payment on original_payment.id=(refund.value->>'transactionId')::uuid
   where refund.value->>'status'='paid' and original_payment.payer_account_id=a.id)
 order by a.id for update;
 if lumo_private.approved_merchant_stamp() is distinct from p_ledger_stamp then return jsonb_build_object('ok',false,'code','CONCURRENT_UPDATE');end if;
 begin
 for b in select value from jsonb_each(p_state->'businesses') loop
  merchant_id:=(b#>>'{business,id}')::uuid;old_b:=saved.document#>array['businesses',merchant_id::text];
  select value into owner_u from jsonb_array_elements(p_state->'users') where value->>'businessId'=merchant_id::text and value->>'role'='owner' and value->>'active'='true' limit 1;
  owner_id:=(owner_u->>'_sharedUserId')::uuid;
  if owner_id is null then raise exception 'MERCHANT_IDENTITY_REQUIRED';end if;
  select m.account_id into account_id from lumo_private.merchants m where m.id=merchant_id;
  if account_id is null then
   if owner_id<>p_actor then raise exception 'FORBIDDEN';end if;
   insert into lumo_private.accounts(owner_user_id,kind) values(owner_id,'merchant') returning id into account_id;
   insert into lumo_private.merchants(id,owner_user_id,account_id,name) values(merchant_id,owner_id,account_id,b#>>'{business,name}');
  else
   if exists(select 1 from lumo_private.merchants m where m.id=merchant_id and m.owner_user_id<>owner_id) then raise exception 'OWNERSHIP_TRANSFER_UNAVAILABLE';end if;
  end if;
  update lumo_private.merchants set name=b#>>'{business,name}' where id=merchant_id;
  for s in select value from jsonb_array_elements(b->'shops') loop
   shop_id:=(s->>'id')::uuid;
   if exists(select 1 from lumo_private.shops sh where sh.id=shop_id and sh.merchant_id<>merchant_id) then raise exception 'SHOP_SCOPE_MISMATCH';end if;
   insert into lumo_private.shops(id,merchant_id,name,accepting) values(shop_id,merchant_id,s->>'name',coalesce((s->>'accepting')::boolean,true) and coalesce((s->>'open')::boolean,true))
   on conflict(id) do update set name=excluded.name,accepting=excluded.accepting;
   insert into lumo_private.shop_settings(shop_id,location,published,latitude,longitude) values(shop_id,coalesce(s->>'area',''),coalesce((s->>'published')::boolean,false),(s->>'lat')::numeric,(s->>'lng')::numeric)
   on conflict(shop_id) do update set location=excluded.location,published=excluded.published,latitude=excluded.latitude,longitude=excluded.longitude;
  end loop;
  for u in select value from jsonb_array_elements(p_state->'users') where value->>'businessId'=merchant_id::text and value->>'role'<>'owner' and value?'_sharedUserId' loop
   user_id:=(u->>'_sharedUserId')::uuid;
   for s in select value from jsonb_array_elements(u->'shopIds') loop
    shop_id:=trim(both '"' from s::text)::uuid;
    if not exists(select 1 from lumo_private.shops sh where sh.id=shop_id and sh.merchant_id=merchant_id) then raise exception 'SHOP_SCOPE_MISMATCH';end if;
    insert into lumo_private.staff_memberships(shop_id,user_id,role,status,invited_by) values(shop_id,user_id,u->>'role',case when u->>'active'='true' then 'active' else 'removed' end,owner_id)
    on conflict(shop_id,user_id) do update set role=excluded.role,status=excluded.status,updated_at=clock_timestamp();
   end loop;
   update lumo_private.staff_memberships sm set status='removed',updated_at=clock_timestamp() where sm.user_id=user_id and sm.shop_id in(select sh.id from lumo_private.shops sh where sh.merchant_id=merchant_id)
    and not exists(select 1 from jsonb_array_elements_text(u->'shopIds') assigned where assigned.value=sm.shop_id::text);
  end loop;
  for r in select value from jsonb_array_elements(b->'requests') loop
   shop_id:=(r->>'shopId')::uuid;
   select value into u from jsonb_array_elements(p_state->'users') where value->>'id'=r->>'createdByUserId';
   user_id:=coalesce((u->>'_sharedUserId')::uuid,owner_id);
   if not exists(select 1 from lumo_private.shops sh where sh.id=shop_id and sh.merchant_id=merchant_id) then raise exception 'SHOP_SCOPE_MISMATCH';end if;
   insert into lumo_private.payment_requests(id,shop_id,amount,note,created_by,status,expires_at,created_at)
   values((r->>'id')::uuid,shop_id,(r->>'amount')::bigint,coalesce(r->>'description',''),user_id,r->>'status',(r->>'expiresAt')::timestamptz,(r->>'createdAt')::timestamptz)
   on conflict(id) do update set status=case when lumo_private.payment_requests.status='paid' then 'paid' else excluded.status end;
  end loop;
  -- A close resets each shop's trading view while its merchant account keeps all funds.
  for r in select value from jsonb_array_elements(b->'closings') loop
   if not exists(select 1 from jsonb_array_elements(coalesce(old_b->'closings','[]'::jsonb)) prior_close where prior_close.value->>'id'=r->>'id') then
    update lumo_private.shops sh set trading_since=greatest(sh.trading_since,(r->>'createdAt')::timestamptz) where sh.id=(r->>'shopId')::uuid and sh.merchant_id=merchant_id;
   end if;
  end loop;
  for r in select value from jsonb_array_elements(b->'refunds') where value->>'status'='paid' loop
   if exists(select 1 from lumo_private.approved_merchant_refunds rf where rf.refund_id=r->>'id') then continue;end if;
   -- Existing canonical refunds are projected using their canonical journal id.
   if exists(select 1 from lumo_private.journals jn where jn.type='refund' and jn.id::text=r->>'id') then continue;end if;
   if not p_money_authorized then raise exception 'STEP_UP_REQUIRED';end if;
   select * into original from lumo_private.journals jn where jn.id=(r->>'transactionId')::uuid and jn.type='merchant_payment' and jn.payee_account_id=account_id for update;
   if original.id is null then raise exception 'INVALID_PAYMENT';end if;
   role:=lumo_private.staff_role(p_actor,original.shop_id);amount:=(r->>'amount')::bigint;
   select coalesce(sum(jn.amount),0) into already from lumo_private.journals jn where jn.original_payment_id=original.id and jn.type='refund';
   if role not in('owner','manager') or role is null then raise exception 'FORBIDDEN';end if;
   if amount<=0 or amount+already>original.amount then raise exception 'REFUND_EXCEEDS_PAYMENT';end if;
   if role='manager' and amount+already>10000 then raise exception 'OWNER_APPROVAL_REQUIRED';end if;
   j:=lumo_private.post_money(p_actor,'refund',amount,account_id,original.payer_account_id,original.shop_id,original.request_id,original.id);
   insert into lumo_private.approved_merchant_refunds(refund_id,journal_id) values(r->>'id',j);
  end loop;
 end loop;
 new_revision:=saved.revision+1;
 update lumo_private.approved_merchant_network set document=p_state,revision=new_revision where id;
 return jsonb_build_object('ok',true,'revision',new_revision);
 exception when others then
  return jsonb_build_object('ok',false,'code',case when SQLERRM in('FORBIDDEN','STEP_UP_REQUIRED','SHOP_SCOPE_MISMATCH','MERCHANT_IDENTITY_REQUIRED','OWNERSHIP_TRANSFER_UNAVAILABLE','INVALID_PAYMENT','REFUND_EXCEEDS_PAYMENT','OWNER_APPROVAL_REQUIRED','INSUFFICIENT_FUNDS') then SQLERRM else 'MERCHANT_COMMIT_FAILED' end);
 end;
end $$;
revoke all on function lumo_private.approved_merchant_stamp(),public.lumo_approved_merchant_read(uuid,uuid),public.lumo_approved_merchant_commit(uuid,uuid,bigint,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.lumo_approved_merchant_read(uuid,uuid),public.lumo_approved_merchant_commit(uuid,uuid,bigint,text,jsonb,boolean) to service_role;

-- Resolve the approved visible shop codes without exposing any business/session document.
create function public.lumo_approved_merchant_lookup(p_query text) returns jsonb language sql stable security definer set search_path='' as $$
 select case when count(*)=1 then jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','shopId',min(shop.value->>'id'),'merchantId',min(business.key),'code',min(shop.value->>'code'))
 else jsonb_build_object('ok',false,'code',case when count(*)=0 then 'SHOP_NOT_FOUND' else 'CHOOSE_SHOP' end,'message',case when count(*)=0 then 'No connected shop matches that code.' else 'Scan a shop QR to choose the receiving shop.' end) end
 from lumo_private.approved_merchant_network n cross join lateral jsonb_each(n.document->'businesses') business
 cross join lateral jsonb_array_elements(business.value->'shops') shop
 join lumo_private.shops canonical on canonical.id=(shop.value->>'id')::uuid
 where length(trim(p_query)) between 3 and 100 and canonical.accepting
 and (upper(shop.value->>'code')=upper(trim(p_query)) or business.value#>>'{business,accountNumber}'=regexp_replace(p_query,'\s','','g'));
$$;
revoke all on function public.lumo_approved_merchant_lookup(text) from public,anon,authenticated;
grant execute on function public.lumo_approved_merchant_lookup(text) to service_role;
