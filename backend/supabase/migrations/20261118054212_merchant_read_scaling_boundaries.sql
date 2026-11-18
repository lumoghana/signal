-- Read-path scaling without changing financial authority. The compatibility
-- network remains the metadata writer; these are transactionally maintained
-- public fields and display-only tenant projections. No history is truncated.
-- Do not remove the old network or lift loyalty lifetime safeguards in this
-- migration: normalised per-tenant writes and archival require separate proof.
create table lumo_private.approved_shop_directory (
 shop_id uuid primary key references lumo_private.shops(id) on delete cascade,
 merchant_id uuid not null references lumo_private.merchants(id) on delete cascade,
 public_fields jsonb not null,
 check(jsonb_typeof(public_fields)='object'),
 check(public_fields-array['id','businessId','businessName','name','area','category','code','accountNumber','lat','lng','hours','landmark','open','accepting','published','sandbox']::text[]='{}'::jsonb)
);
create index approved_shop_directory_merchant on lumo_private.approved_shop_directory(merchant_id,shop_id);
alter table lumo_private.approved_shop_directory enable row level security;
revoke all on lumo_private.approved_shop_directory from public,anon,authenticated,service_role;
create table lumo_private.approved_shop_access (
 shop_id uuid primary key references lumo_private.shops(id) on delete cascade,
 merchant_id uuid not null references lumo_private.merchants(id) on delete cascade,
 published boolean not null,test_key_hash text,
 check(test_key_hash is null or test_key_hash ~ '^[0-9a-f]{64}$')
);
create index approved_shop_access_merchant on lumo_private.approved_shop_access(merchant_id,shop_id);
create table lumo_private.approved_consumer_request_binding (
 request_id uuid primary key references lumo_private.payment_requests(id) on delete cascade,
 shop_id uuid not null references lumo_private.shops(id),consumer_user_id uuid not null
);
create index approved_consumer_request_binding_shop on lumo_private.approved_consumer_request_binding(shop_id,request_id);
create table lumo_private.approved_reward_request_context (
 request_id uuid primary key references lumo_private.payment_requests(id) on delete cascade,
 shop_id uuid not null references lumo_private.shops(id),member_consumer_user_id uuid,
 membership_id text not null,reward_id text,display_context jsonb not null,
 check(jsonb_typeof(display_context)='object'),
 check(display_context-array['grossAmount','discount','amount']::text[]='{}'::jsonb)
);
create index approved_reward_request_context_shop on lumo_private.approved_reward_request_context(shop_id,request_id);
alter table lumo_private.approved_shop_access enable row level security;
alter table lumo_private.approved_consumer_request_binding enable row level security;
alter table lumo_private.approved_reward_request_context enable row level security;
revoke all on lumo_private.approved_shop_access,lumo_private.approved_consumer_request_binding,lumo_private.approved_reward_request_context from public,anon,authenticated,service_role;

create function lumo_private.refresh_approved_shop_directory(p_document jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 -- Private point-lookup indexes preserve the exact publication and original
 -- purchaser checks at canonical posting without unpacking every business.
 insert into lumo_private.approved_shop_access(shop_id,merchant_id,published,test_key_hash)
 select sh.id,sh.merchant_id,coalesce(s.value->>'published','false')='true',case when length(s.value->>'testAcceptanceToken')=64 then encode(extensions.digest(s.value->>'testAcceptanceToken','sha256'),'hex') end
 from jsonb_each(coalesce(p_document->'businesses','{}'::jsonb)) b
 cross join lateral jsonb_array_elements(coalesce(b.value->'shops','[]'::jsonb)) s
 join lumo_private.shops sh on sh.id::text=s.value->>'id' and sh.merchant_id::text=b.key
 on conflict(shop_id) do update set merchant_id=excluded.merchant_id,published=excluded.published,test_key_hash=excluded.test_key_hash
 where (approved_shop_access.merchant_id,approved_shop_access.published,approved_shop_access.test_key_hash) is distinct from (excluded.merchant_id,excluded.published,excluded.test_key_hash);
 delete from lumo_private.approved_shop_access d where not exists(
  select 1 from jsonb_each(coalesce(p_document->'businesses','{}'::jsonb)) b cross join lateral jsonb_array_elements(coalesce(b.value->'shops','[]'::jsonb)) s
  where b.key=d.merchant_id::text and s.value->>'id'=d.shop_id::text);
 insert into lumo_private.approved_consumer_request_binding(request_id,shop_id,consumer_user_id)
 select pr.id,pr.shop_id,(r.value->>'_consumerUserId')::uuid
 from jsonb_each(coalesce(p_document->'businesses','{}'::jsonb)) b
 cross join lateral jsonb_array_elements(coalesce(b.value->'requests','[]'::jsonb)) r
 join lumo_private.payment_requests pr on pr.id::text=r.value->>'id' and pr.shop_id::text=r.value->>'shopId'
 join lumo_private.shops sh on sh.id=pr.shop_id and sh.merchant_id::text=b.key
 where r.value->>'_consumerUserId' is not null
 on conflict(request_id) do update set shop_id=excluded.shop_id,consumer_user_id=excluded.consumer_user_id
 where (approved_consumer_request_binding.shop_id,approved_consumer_request_binding.consumer_user_id) is distinct from (excluded.shop_id,excluded.consumer_user_id);
 delete from lumo_private.approved_consumer_request_binding d where not exists(
  select 1 from lumo_private.shops sh
  cross join lateral jsonb_array_elements(coalesce(p_document#>array['businesses',sh.merchant_id::text,'requests'],'[]'::jsonb)) r
  where sh.id=d.shop_id and r.value->>'id'=d.request_id::text and r.value->>'_consumerUserId' is not null);
 -- Keep the small reward quote context separate from private programme history.
 -- First collection wins, matching the compatibility adapter's Array.find.
 insert into lumo_private.approved_reward_request_context(request_id,shop_id,member_consumer_user_id,membership_id,reward_id,display_context)
 select distinct on (pr.id) pr.id,pr.shop_id,(m.value->>'_consumerUserId')::uuid,c.value->>'memberId',c.value->>'rewardId',
  jsonb_build_object('grossAmount',c.value->'grossAmount','discount',c.value->'discount','amount',c.value->'amount')
 from jsonb_each(coalesce(p_document->'businesses','{}'::jsonb)) b
 cross join lateral jsonb_array_elements(coalesce(b.value#>'{loyalty,collections}','[]'::jsonb)) with ordinality c(value,position)
 join lumo_private.payment_requests pr on pr.id::text=c.value->>'requestId'
 join lumo_private.shops sh on sh.id=pr.shop_id and sh.merchant_id::text=b.key
 left join lateral (select member.value from jsonb_array_elements(coalesce(b.value#>'{loyalty,members}','[]'::jsonb)) member where member.value->>'id'=c.value->>'memberId' limit 1) m on true
 order by pr.id,c.position
 on conflict(request_id) do update set shop_id=excluded.shop_id,member_consumer_user_id=excluded.member_consumer_user_id,membership_id=excluded.membership_id,reward_id=excluded.reward_id,display_context=excluded.display_context
 where (approved_reward_request_context.shop_id,approved_reward_request_context.member_consumer_user_id,approved_reward_request_context.membership_id,approved_reward_request_context.reward_id,approved_reward_request_context.display_context)
 is distinct from (excluded.shop_id,excluded.member_consumer_user_id,excluded.membership_id,excluded.reward_id,excluded.display_context);
 delete from lumo_private.approved_reward_request_context d where not exists(
  select 1 from lumo_private.shops sh cross join lateral jsonb_array_elements(coalesce(p_document#>array['businesses',sh.merchant_id::text,'loyalty','collections'],'[]'::jsonb)) c
  where sh.id=d.shop_id and c.value->>'requestId'=d.request_id::text);
 insert into lumo_private.approved_shop_directory(shop_id,merchant_id,public_fields)
 select sh.id,sh.merchant_id,jsonb_build_object(
  'id',sh.id,'businessId',sh.merchant_id,'businessName',b.value#>>'{business,name}',
  'name',s.value->>'name','area',s.value->>'area','category',s.value->>'category',
  'code',s.value->>'code','accountNumber',b.value#>>'{business,accountNumber}',
  'lat',s.value->'lat','lng',s.value->'lng','hours',coalesce(s.value->>'hours',''),
  'landmark',coalesce(s.value->>'landmark',''),'open',coalesce(s.value->>'open','true')<>'false',
  'accepting',coalesce(s.value->>'accepting','false')='true','published',true,'sandbox',true)
 from jsonb_each(coalesce(p_document->'businesses','{}'::jsonb)) b
 cross join lateral jsonb_array_elements(coalesce(b.value->'shops','[]'::jsonb)) s
 join lumo_private.shops sh on sh.id::text=s.value->>'id' and sh.merchant_id::text=b.key
 where s.value->>'published'='true'
 on conflict(shop_id) do update set merchant_id=excluded.merchant_id,public_fields=excluded.public_fields
 where approved_shop_directory.public_fields is distinct from excluded.public_fields
    or approved_shop_directory.merchant_id is distinct from excluded.merchant_id;
 delete from lumo_private.approved_shop_directory d where not exists(
  select 1 from jsonb_each(coalesce(p_document->'businesses','{}'::jsonb)) b
  cross join lateral jsonb_array_elements(coalesce(b.value->'shops','[]'::jsonb)) s
  where b.key=d.merchant_id::text and s.value->>'id'=d.shop_id::text and s.value->>'published'='true');
end $$;
revoke all on function lumo_private.refresh_approved_shop_directory(jsonb) from public,anon,authenticated,service_role;

create function lumo_private.sync_approved_shop_directory() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform lumo_private.refresh_approved_shop_directory(new.document);return new;end $$;
revoke all on function lumo_private.sync_approved_shop_directory() from public,anon,authenticated,service_role;
create trigger sync_approved_shop_directory after insert or update of document
on lumo_private.approved_merchant_network for each row execute function lumo_private.sync_approved_shop_directory();
select lumo_private.refresh_approved_shop_directory(document) from lumo_private.approved_merchant_network where id;

create or replace function public.lumo_approved_merchant_access(p_shop uuid,p_test_key text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare shop lumo_private.approved_shop_access%rowtype;
begin
 select * into shop from lumo_private.approved_shop_access where shop_id=p_shop;
 if not found then return jsonb_build_object('ok',true,'managed',false);end if;
 if shop.published or length(p_test_key)=64 and shop.test_key_hash=encode(extensions.digest(p_test_key,'sha256'),'hex') then
  return jsonb_build_object('ok',true,'managed',true,'published',shop.published);end if;
 return jsonb_build_object('ok',false,'code','SHOP_NOT_READY','message','This shop is not published yet. Scan its private test QR or ask the merchant to finish counter setup.');
end $$;
revoke all on function public.lumo_approved_merchant_access(uuid,text) from public,anon,authenticated;
grant execute on function public.lumo_approved_merchant_access(uuid,text) to service_role;

-- Change only the publication lookup in the current guard. In particular, keep
-- the later guest-checkout pending reservation and exact sandbox-posting checks.
-- A moved seam aborts this migration instead of replacing a newer money guard.
do $$
declare definition text;old_lookup text:=$lookup$select item.value into shop from lumo_private.approved_merchant_network n cross join lateral jsonb_each(n.document->'businesses') business cross join lateral jsonb_array_elements(business.value->'shops') item where item.value->>'id'=new.shop_id::text;$lookup$;
begin
 select pg_get_functiondef('lumo_private.approved_merchant_payment_guard()'::regprocedure) into definition;
 if strpos(definition,old_lookup)=0 or strpos(definition,'REQUEST_PROCESSING')=0 or strpos(definition,'lumo_private.guest_momo_attempts')=0 then
  raise exception 'Merchant publication guard changed: review the indexed lookup seam before migrating';
 end if;
 definition:=replace(definition,old_lookup,'select jsonb_build_object(''published'',a.published) into shop from lumo_private.approved_shop_access a where a.shop_id=new.shop_id;');
 execute definition;
end $$;
revoke all on function lumo_private.approved_merchant_payment_guard() from public,anon,authenticated,service_role;

create or replace function lumo_private.guard_consumer_loyalty_payer() returns trigger
language plpgsql security invoker set search_path='' as $$
declare bound_user uuid;
begin
 if new.type='merchant_payment' and new.request_id is not null then
  select consumer_user_id into bound_user from lumo_private.approved_consumer_request_binding where request_id=new.request_id and shop_id=new.shop_id;
  if bound_user is not null and new.actor_user_id is distinct from bound_user then raise exception using errcode='P0001',message='REQUEST_UNAVAILABLE';end if;
 end if;
 return new;
end $$;
revoke all on function lumo_private.guard_consumer_loyalty_payer() from public,anon,authenticated,service_role;

-- Fixed-request quotes need only this indexed context, not every merchant's
-- complete financial and programme history. The canonical payer trigger still
-- repeats the account binding when the journal is posted.
create function public.lumo_approved_reward_request_context(p_actor uuid,p_session uuid,p_request uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare bound_user uuid;context lumo_private.approved_reward_request_context%rowtype;details jsonb;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 if p_actor is null or p_session is null or not lumo_private.approved_live(p_actor,p_session) then return jsonb_build_object('ok',false,'code','SESSION_REVOKED');end if;
 select consumer_user_id into bound_user from lumo_private.approved_consumer_request_binding where request_id=p_request;
 if bound_user is not null and bound_user<>p_actor then return jsonb_build_object('ok',false,'code','REQUEST_UNAVAILABLE');end if;
 select * into context from lumo_private.approved_reward_request_context where request_id=p_request;
 if not found then return jsonb_build_object('ok',true,'loyalty',null);end if;
 details:=context.display_context;
 if context.member_consumer_user_id=p_actor then details:=details||jsonb_build_object('membershipId',context.membership_id,'rewardId',context.reward_id);end if;
 return jsonb_build_object('ok',true,'loyalty',details);
end $$;
revoke all on function public.lumo_approved_reward_request_context(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.lumo_approved_reward_request_context(uuid,uuid,uuid) to service_role;

-- Service-only even though the resulting allowlisted shop fields are public.
-- No journals, requests, balances, users, sessions, claim grants or keys read.
create function public.lumo_approved_public_directory() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 return jsonb_build_object('ok',true,'revision',(select revision from lumo_private.approved_merchant_network where id),
  'shops',coalesce((select jsonb_agg(d.public_fields||jsonb_build_object('accepting',
   d.public_fields->>'accepting'='true' and sh.accepting and m.status='active' and a.status='active'
    and coalesce(p.status='active',false)) order by d.public_fields->>'businessName',d.public_fields->>'name',d.shop_id)
   from lumo_private.approved_shop_directory d
   join lumo_private.shops sh on sh.id=d.shop_id
   join lumo_private.merchants m on m.id=d.merchant_id
   join lumo_private.accounts a on a.id=m.account_id
   left join lumo_private.profiles p on p.user_id=m.owner_user_id),'[]'::jsonb));
end $$;
revoke all on function public.lumo_approved_public_directory() from public,anon,authenticated;
grant execute on function public.lumo_approved_public_directory() to service_role;

-- GET-only tenant projection. Mutations keep using the complete compatibility
-- read/commit until every legacy metadata consumer has migrated safely.
create function public.lumo_approved_merchant_read_scoped(p_actor uuid default null,p_session uuid default null,p_token_hash text default '') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare n lumo_private.approved_merchant_network%rowtype;ids text[];merchant_ids uuid[];user_ids text[];scope jsonb;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 if p_actor is not null and not lumo_private.approved_live(p_actor,p_session) then return jsonb_build_object('ok',false,'code','SESSION_REVOKED');end if;
 select * into n from lumo_private.approved_merchant_network where id;
 if p_actor is not null then
  select coalesce(array_agg(distinct u->>'businessId'),'{}'::text[]) into ids from jsonb_array_elements(n.document->'users') u where u->>'_sharedUserId'=p_actor::text;
 else
  -- A paired counter is the only merchant-only capability accepted without an
  -- upstream bearer. Its original approving Auth session must still be live.
  select coalesce(array_agg(distinct s->>'businessId'),'{}'::text[]) into ids
  from jsonb_array_elements(n.document->'sessions') s
  where s->>'tokenHash'=p_token_hash and length(p_token_hash)=44 and nullif(s->>'counterId','') is not null
   and s->>'_counterSharedUserId' ~ '^[0-9a-fA-F-]{36}$' and s->>'_counterSharedSessionId' ~ '^[0-9a-fA-F-]{36}$'
   and lumo_private.approved_live((s->>'_counterSharedUserId')::uuid,(s->>'_counterSharedSessionId')::uuid);
 end if;
 select coalesce(array_agg(value::uuid),'{}'::uuid[]) into merchant_ids from unnest(ids) value
 where value ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
 select coalesce(array_agg(u->>'id'),'{}'::text[]) into user_ids from jsonb_array_elements(n.document->'users') u where u->>'businessId'=any(ids);
 scope:=jsonb_build_object('version',n.document->'version','counters',n.document->'counters',
  'businesses',coalesce((select jsonb_object_agg(b.key,b.value) from jsonb_each(n.document->'businesses') b where b.key=any(ids)),'{}'::jsonb),
  'users',coalesce((select jsonb_agg(u) from jsonb_array_elements(n.document->'users') u where u->>'businessId'=any(ids)),'[]'::jsonb),
  'sessions',coalesce((select jsonb_agg(s) from jsonb_array_elements(n.document->'sessions') s where s->>'businessId'=any(ids) or s->>'userId'=any(user_ids)),'[]'::jsonb),
  'invitations',coalesce((select jsonb_agg(s) from jsonb_array_elements(n.document->'invitations') s where s->>'businessId'=any(ids)),'[]'::jsonb),
  'recoveries','[]'::jsonb,'wallets','{}'::jsonb,'studentSessions','[]'::jsonb,
  'devices',coalesce((select jsonb_agg(s) from jsonb_array_elements(n.document->'devices') s where s->>'businessId'=any(ids)),'[]'::jsonb),
  'audit',coalesce((select jsonb_agg(s) from jsonb_array_elements(n.document->'audit') s where s->>'businessId'=any(ids)),'[]'::jsonb),
  'attempts','{}'::jsonb,'rateLimits','{}'::jsonb,'refundAttempts','{}'::jsonb,'settlementAttempts','{}'::jsonb,'signupAttempts','{}'::jsonb,'importAttempts','{}'::jsonb);
 return jsonb_build_object('ok',true,'readOnly',true,'revision',n.revision,'state',scope,'ledgerStamp',null,
 'linkAttribution',coalesce((select jsonb_agg(jsonb_build_object('requestId',l.request_id,'linkId',l.id,'attribution',l.attribution)) from lumo_private.merchant_payment_links l join lumo_private.shops sh on sh.id=l.shop_id where sh.merchant_id=any(merchant_ids) and l.request_id is not null),'[]'::jsonb),
 'ledger',coalesce((select jsonb_agg(lumo_private.receipt_json(j.id)||jsonb_build_object('payerName',coalesce(case when ga.id is not null then 'MoMo guest · ••••••'||right(ga.phone,4) end,pp.display_name),'merchantId',m.id,'refundId',rf.refund_id,'guestCollectionId',ga.id,'guestLinkId',ga.link_id,'providerReference',ga.provider_reference,'providerMode',ga.provider_mode,'settlementStatus',case when ga.status='confirmed' then 'sandbox-posted' end,'requestAttribution',pl.attribution,'publicPaymentLinkId',pl.id) order by j.created_at,j.id)
 from lumo_private.merchants m join lumo_private.journals j on(j.type='merchant_payment' and j.payee_account_id=m.account_id or j.type='refund' and j.payer_account_id=m.account_id)
 left join lumo_private.accounts pa on pa.id=j.payer_account_id left join lumo_private.profiles pp on pp.user_id=pa.owner_user_id
 left join lumo_private.guest_momo_attempts ga on ga.journal_id=j.id left join lumo_private.merchant_payment_links pl on pl.request_id=j.request_id
 left join lumo_private.approved_merchant_refunds rf on rf.journal_id=j.id where m.id=any(merchant_ids)),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'shopId',r.shop_id,'amount',r.amount,'description',r.note,'status',r.status,'expiresAt',r.expires_at,'createdAt',r.created_at,'createdBySharedUserId',r.created_by,'attribution',pl.attribution,'publicPaymentLinkId',pl.id)) from lumo_private.payment_requests r join lumo_private.shops sh on sh.id=r.shop_id left join lumo_private.merchant_payment_links pl on pl.request_id=r.id where sh.merchant_id=any(merchant_ids)),'[]'::jsonb),
 'balances',coalesce((select jsonb_object_agg(m.id::text,jsonb_build_object('balance',a.balance,'accountId',a.id)) from lumo_private.merchants m join lumo_private.accounts a on a.id=m.account_id where m.id=any(merchant_ids)),'{}'::jsonb));
end $$;
revoke all on function public.lumo_approved_merchant_read_scoped(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.lumo_approved_merchant_read_scoped(uuid,uuid,text) to service_role;

-- Narrow account locks to changed businesses and original refund destinations.
-- The compatibility row/global revision still serialises metadata commits;
-- this is deliberately a partial improvement, not a tenant-write migration.
create function lumo_private.merchant_projection_changed(p_before jsonb,p_after jsonb,p_merchant uuid) returns boolean
language sql immutable security invoker set search_path='' as $$
 select (p_before#>array['businesses',p_merchant::text]) is distinct from (p_after#>array['businesses',p_merchant::text])
 or (select coalesce(jsonb_agg(u order by u->>'id'),'[]'::jsonb) from jsonb_array_elements(coalesce(p_before->'users','[]'::jsonb)) u where u->>'businessId'=p_merchant::text)
 is distinct from (select coalesce(jsonb_agg(u order by u->>'id'),'[]'::jsonb) from jsonb_array_elements(coalesce(p_after->'users','[]'::jsonb)) u where u->>'businessId'=p_merchant::text)
$$;
revoke all on function lumo_private.merchant_projection_changed(jsonb,jsonb,uuid) from public,anon,authenticated,service_role;
do $migration$
declare definition text;needle text:='where exists(select 1 from lumo_private.merchants m where m.account_id=a.id)';replacement text;
 loop_seam text:='merchant_id:=(b#>>''{business,id}'')::uuid;old_b:=saved.document#>array[''businesses'',merchant_id::text];';
begin
 select pg_get_functiondef('public.lumo_approved_merchant_commit(uuid,uuid,bigint,text,jsonb,boolean)'::regprocedure) into definition;
 if position(needle in definition)=0 or position(loop_seam in definition)=0 then raise exception 'Merchant account-lock/projection seam changed; review before applying.';end if;
 replacement:='where exists(select 1 from lumo_private.merchants m where m.account_id=a.id and lumo_private.merchant_projection_changed(saved.document,p_state,m.id))';
 definition:=replace(definition,needle,replacement);
 definition:=replace(definition,loop_seam,loop_seam||' if not lumo_private.merchant_projection_changed(saved.document,p_state,merchant_id) then continue;end if;');
 execute definition;
end $migration$;
