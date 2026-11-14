-- Public guest checkout is service mediated and explicitly uses simulated funds.
-- No guest account or wallet is created. All monetary values are integer pesewas.
create table lumo_private.merchant_payment_links (
 id uuid primary key default gen_random_uuid(),
 public_token text not null unique check(public_token ~ '^[a-f0-9]{64}$'),
 merchant_id uuid not null references lumo_private.merchants(id),
 shop_id uuid not null references lumo_private.shops(id),
 request_id uuid unique references lumo_private.payment_requests(id),
 description text not null default '' check(length(description)<=160),
 kind text not null check(kind in ('shop','request')),
 attribution text not null check(attribution in ('shop','request')),
 operator_id text not null,
 counter_id text,
 attempt_id text not null check(length(attempt_id) between 10 and 100),
 fingerprint text not null,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default clock_timestamp(),
 revoked_at timestamptz,
 unique(merchant_id,created_by,attempt_id),
 check((kind='request')=(request_id is not null))
);
create unique index lumo_guest_reusable_shop_link on lumo_private.merchant_payment_links(shop_id) where kind='shop' and revoked_at is null;
create index lumo_guest_links_merchant on lumo_private.merchant_payment_links(merchant_id,created_at desc);
create table lumo_private.guest_momo_attempts (
 id text primary key check(length(id) between 10 and 100),
 recovery_hash text not null check(recovery_hash ~ '^[a-f0-9]{64}$'),
 link_id uuid not null references lumo_private.merchant_payment_links(id),
 merchant_id uuid not null references lumo_private.merchants(id),
 shop_id uuid not null references lumo_private.shops(id),
 request_id uuid references lumo_private.payment_requests(id),
 amount bigint not null check(amount between 1 and 1000000),
 currency text not null default 'GHS' check(currency='GHS'),
 fee bigint not null default 0 check(fee=0),
 phone text not null check(phone ~ '^0[25][0-9]{8}$'),
 network text not null check(network in ('mtn','telecel','airteltigo')),
 status text not null default 'pending' check(status in ('pending','confirmed','declined','cancelled','reversed')),
 provider_mode text not null default 'sandbox' check(provider_mode='sandbox'),
 provider_status text not null default 'awaiting_approval' check(provider_status in ('awaiting_approval','approved','declined','cancelled','reversed')),
 provider_reference text not null unique default ('GM-'||replace(gen_random_uuid()::text,'-','')),
 journal_id uuid unique references lumo_private.journals(id),
 reversal_reference text,
 reversal_reason text,
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default (clock_timestamp()+interval '30 minutes'),
 confirmed_at timestamptz,
 resolved_at timestamptz,
 check((status='confirmed')=(journal_id is not null))
);
create unique index lumo_guest_pending_fixed_request on lumo_private.guest_momo_attempts(request_id) where request_id is not null and status='pending';
create index lumo_guest_attempts_link on lumo_private.guest_momo_attempts(link_id,created_at desc);
create index lumo_guest_attempts_merchant on lumo_private.guest_momo_attempts(merchant_id,created_at desc);
create table lumo_private.guest_momo_refunds (
 id uuid primary key default gen_random_uuid(),
 attempt_id text not null references lumo_private.guest_momo_attempts(id),
 journal_id uuid not null unique references lumo_private.journals(id),
 amount bigint not null check(amount between 1 and 1000000),
 currency text not null default 'GHS' check(currency='GHS'),
 provider_reference text not null unique default ('GMR-'||replace(gen_random_uuid()::text,'-','')),
 status text not null default 'sandbox-completed' check(status='sandbox-completed'),
 created_at timestamptz not null default clock_timestamp()
);
create index lumo_guest_refunds_attempt on lumo_private.guest_momo_refunds(attempt_id,created_at);
create table lumo_private.guest_checkout_rate_limits (
 key text primary key,window_start timestamptz not null,count integer not null check(count>0)
);
create index lumo_guest_rate_window on lumo_private.guest_checkout_rate_limits(window_start);
alter table lumo_private.merchant_payment_links enable row level security;
alter table lumo_private.guest_momo_attempts enable row level security;
alter table lumo_private.guest_momo_refunds enable row level security;
alter table lumo_private.guest_checkout_rate_limits enable row level security;
revoke all on lumo_private.merchant_payment_links,lumo_private.guest_momo_attempts,lumo_private.guest_momo_refunds,lumo_private.guest_checkout_rate_limits from public,anon,authenticated;

create or replace function lumo_private.guest_rate(p_key text,p_limit integer)
returns boolean language plpgsql set search_path='' as $$
declare result integer;
begin
 insert into lumo_private.guest_checkout_rate_limits(key,window_start,count) values(p_key,clock_timestamp(),1)
 on conflict(key) do update set window_start=case when lumo_private.guest_checkout_rate_limits.window_start<clock_timestamp()-interval '1 minute' then clock_timestamp() else lumo_private.guest_checkout_rate_limits.window_start end,
 count=case when lumo_private.guest_checkout_rate_limits.window_start<clock_timestamp()-interval '1 minute' then 1 else lumo_private.guest_checkout_rate_limits.count+1 end
 returning count into result;
 return result<=p_limit;
end $$;

create or replace function lumo_private.guest_link_json(p_id uuid)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',l.id,'publicToken',l.public_token,'url','https://lumo-connected-pilot.vercel.app/checkout.html?link='||l.public_token,
 'merchantId',m.id,'merchantName',m.name,'shopId',s.id,'shopName',s.name,'kind',l.kind,'requestId',l.request_id,'description',coalesce(nullif(l.description,''),r.note,''),
 'amount',r.amount,'expiresAt',r.expires_at,'createdAt',l.created_at,'channel','shared-link','attribution',l.attribution,
 'status',case when l.revoked_at is not null then 'cancelled' when r.status='paid' then 'paid' when r.status='cancelled' then 'cancelled' when r.expires_at<=clock_timestamp() then 'expired' else 'open' end)
 from lumo_private.merchant_payment_links l join lumo_private.merchants m on m.id=l.merchant_id join lumo_private.shops s on s.id=l.shop_id
 left join lumo_private.payment_requests r on r.id=l.request_id where l.id=p_id;
$$;

create or replace function lumo_private.guest_attempt_json(p_id text)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',a.id,'shopId',a.shop_id,'merchantId',a.merchant_id,'linkId',a.link_id,'requestId',a.request_id,'amount',a.amount,'currency',a.currency,'fee',a.fee,
 'reference',coalesce(j.reference,a.provider_reference),'providerReference',a.provider_reference,'status',a.status,'network',a.network,
 'phoneMasked','••••••'||right(a.phone,4),'createdAt',a.created_at,'expiresAt',a.expires_at,'confirmedAt',a.confirmed_at,'providerMode',a.provider_mode,
 'settlementStatus',case when a.status='confirmed' then 'sandbox-posted' else 'not-posted' end,
 'reversalReference',a.reversal_reference,
 'reversal',case when a.status='reversed' then jsonb_build_object('reference',a.reversal_reference,'providerReference',a.provider_reference,'amount',a.amount,'currency',a.currency,'status','completed','completedAt',a.resolved_at,'reason',a.reversal_reason) else null end,
 'receipt',case when a.status='confirmed' then jsonb_build_object('reference',j.reference,'amount',j.amount,'currency','GHS','shopId',s.id,'merchantId',m.id,'merchantName',m.name,'shopName',s.name,
 'confirmedAt',j.created_at,'providerReference',a.provider_reference,'network',a.network,'phoneMasked','••••••'||right(a.phone,4),'providerMode','sandbox','sandbox',true,
 'refunds',coalesce((select jsonb_agg(jsonb_build_object('reference',r.provider_reference,'amount',r.amount,'currency',r.currency,'status',r.status,'createdAt',r.created_at) order by r.created_at) from lumo_private.guest_momo_refunds r where r.attempt_id=a.id),'[]'::jsonb)) else null end)
 from lumo_private.guest_momo_attempts a join lumo_private.merchants m on m.id=a.merchant_id join lumo_private.shops s on s.id=a.shop_id left join lumo_private.journals j on j.id=a.journal_id where a.id=p_id;
$$;

create or replace function lumo_private.guest_merchant_actor(p_actor uuid,p_session uuid,p_token_hash text)
returns jsonb language plpgsql set search_path='' as $$
declare n jsonb;se jsonb;u jsonb;d jsonb;operator jsonb;b jsonb;
begin
 if (auth.jwt()->>'role') is distinct from 'service_role' or not lumo_private.approved_live(p_actor,p_session) then raise exception 'SESSION_REVOKED';end if;
 select document into n from lumo_private.approved_merchant_network where id;
 select value into se from jsonb_array_elements(n->'sessions') where value->>'tokenHash'=p_token_hash and value->>'revokedAt' is null and (value->>'expiresAt')::timestamptz>clock_timestamp();
 if se is null then raise exception 'SESSION_REVOKED';end if;
 select value into u from jsonb_array_elements(n->'users') where value->>'id'=se->>'userId' and value->>'active'='true' and value->>'_sharedUserId'=p_actor::text;
 if u is null then raise exception 'FORBIDDEN';end if;
 b:=n#>array['businesses',u->>'businessId'];
 if se->>'counterId' is not null then
  select value into d from jsonb_array_elements(coalesce(b->'counterDevices','[]'::jsonb)) where value->>'id'=se->>'counterId' and value->>'sessionId'=se->>'id' and value->>'authorizedBy'=u->>'id' and value->>'revokedAt' is null;
  if d is null or se->>'_counterSharedUserId' is distinct from p_actor::text or se->>'_counterSharedSessionId' is distinct from p_session::text then raise exception 'SESSION_REVOKED';end if;
  if u->>'role'<>'owner' and not (u->'shopIds'? (d->>'shopId')) then raise exception 'FORBIDDEN';end if;
  select value into operator from jsonb_array_elements(n->'users') where value->>'id'=se->>'counterUserId' and value->>'businessId'=u->>'businessId' and value->>'role'='cashier' and value->>'active'='true' and value->'shopIds'?(d->>'shopId');
  if operator is null or se->>'counterLockedAt' is not null or (se->>'counterUnlockedUntil')::timestamptz<=clock_timestamp() then return jsonb_build_object('locked',true,'businessId',u->>'businessId','role','cashier','counterId',d->>'id','shopIds',jsonb_build_array(d->>'shopId'));end if;
  return jsonb_build_object('locked',false,'businessId',u->>'businessId','role','cashier','operatorId',operator->>'id','sharedUserId',coalesce(operator->>'_sharedUserId',p_actor::text),'counterId',d->>'id','shopIds',jsonb_build_array(d->>'shopId'));
 end if;
 return jsonb_build_object('locked',false,'businessId',u->>'businessId','role',u->>'role','operatorId',u->>'id','sharedUserId',u->>'_sharedUserId','counterId',null,'shopIds',u->'shopIds');
end $$;

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
  select * into l from lumo_private.merchant_payment_links where merchant_payment_links.shop_id=sh.id and kind='shop' and revoked_at is null;
  if l.id is not null then return jsonb_build_object('ok',true,'link',lumo_private.guest_link_json(l.id),'replayed',true);end if;
  attribution:='shop';
 end if;
 insert into lumo_private.merchant_payment_links(public_token,merchant_id,shop_id,request_id,description,kind,attribution,operator_id,counter_id,attempt_id,fingerprint,created_by)
 values(encode(extensions.gen_random_bytes(32),'hex'),m.id,sh.id,request_id,description,case when request_id is null then 'shop' else 'request' end,attribution,c->>'operatorId',c->>'counterId',attempt,fingerprint,(c->>'sharedUserId')::uuid) returning id into link_id;
 return jsonb_build_object('ok',true,'link',lumo_private.guest_link_json(link_id));
exception when others then return jsonb_build_object('ok',false,'code',case when SQLERRM in ('SESSION_REVOKED','FORBIDDEN','COUNTER_LOCKED','COUNTER_OPERATOR_CHANGED','SHOP_UNAVAILABLE','LINK_UNAVAILABLE','REQUEST_PROCESSING','INVALID_INPUT','IDEMPOTENCY_CONFLICT') then SQLERRM else 'LINK_SERVICE_ERROR' end);
end $$;

-- This helper accepts authoritative provider results only. The public sandbox
-- dispatcher constructs every financial field from the stored attempt.
create or replace function lumo_private.guest_apply_result(p_attempt text,p_outcome text,p_amount bigint,p_currency text,p_merchant uuid,p_shop uuid,p_reference text)
returns void language plpgsql set search_path='' as $$
#variable_conflict use_variable
declare a lumo_private.guest_momo_attempts%rowtype;l lumo_private.merchant_payment_links%rowtype;r lumo_private.payment_requests%rowtype;
 m lumo_private.merchants%rowtype;source uuid;j uuid;reason text;
begin
 if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 select * into a from lumo_private.guest_momo_attempts where id=p_attempt;
 if a.id is null or a.provider_mode<>'sandbox' then raise exception 'PROVIDER_UNAVAILABLE';end if;
 if a.amount is distinct from p_amount or a.currency is distinct from p_currency or a.merchant_id is distinct from p_merchant or a.shop_id is distinct from p_shop or a.provider_reference is distinct from p_reference then raise exception 'PROVIDER_RESULT_MISMATCH';end if;
 select * into m from lumo_private.merchants where id=a.merchant_id;
 select id into source from lumo_private.accounts where kind='test_funding';
 -- Keep the existing global account lock order used by wallet payments/refunds.
 perform 1 from lumo_private.accounts where id in(source,m.account_id) order by id for update;
 select * into a from lumo_private.guest_momo_attempts where id=p_attempt for update;
 select * into m from lumo_private.merchants where id=a.merchant_id;
 if a.status<>'pending' then
  if p_outcome='delay' or p_outcome='approve' and a.status in('confirmed','reversed') or p_outcome='decline' and a.status='declined' or p_outcome='cancel' and a.status='cancelled' then return;end if;
  raise exception 'PAYMENT_FINAL';
 end if;
 if p_outcome='delay' then return;end if;
 if p_outcome in('decline','cancel') then
  -- In this labelled sandbox, these are explicit provider-confirmed outcomes,
  -- never a local timeout or a browser's unverified cancel signal.
  update lumo_private.guest_momo_attempts set status=case p_outcome when 'decline' then 'declined' else 'cancelled' end,
   provider_status=case p_outcome when 'decline' then 'declined' else 'cancelled' end,resolved_at=clock_timestamp() where id=a.id;return;
 end if;
 if p_outcome<>'approve' then raise exception 'INVALID_INPUT';end if;
 select * into l from lumo_private.merchant_payment_links where id=a.link_id for share;
 if a.request_id is not null then select * into r from lumo_private.payment_requests where id=a.request_id for update;end if;
 if l.revoked_at is not null then reason:='The merchant cancelled this link.';
 elsif m.status<>'active' or not exists(select 1 from lumo_private.shops s join lumo_private.shop_settings ss on ss.shop_id=s.id where s.id=a.shop_id and s.merchant_id=m.id and s.accepting and ss.published) then reason:='The shop is unavailable.';
 elsif a.request_id is not null and (r.id is null or r.status<>'open' or r.expires_at<=clock_timestamp() or r.amount<>a.amount) then reason:='The fixed request is no longer payable.';end if;
 if reason is null then
  update lumo_private.guest_momo_attempts set provider_status='approved' where id=a.id;
  begin
   perform set_config('lumo.guest.posting_attempt',a.id,true);
   j:=lumo_private.post_money(m.owner_user_id,'merchant_payment',a.amount,source,m.account_id,a.shop_id,a.request_id,null);
   update lumo_private.guest_momo_attempts set status='confirmed',provider_status='approved',journal_id=j,confirmed_at=clock_timestamp(),resolved_at=clock_timestamp() where id=a.id;
   if a.request_id is not null then update lumo_private.payment_requests set status='paid',paid_journal_id=j where id=a.request_id;end if;
  exception when others then
   reason:='The test provider reversed this payment because Lumo could not safely post the collection.';
  end;
  perform set_config('lumo.guest.posting_attempt','',true);
 end if;
 if reason is not null then
  -- A provider's approved charge is never relabelled as declined. The sandbox
  -- performs an explicit original-provider reversal without merchant credit.
  update lumo_private.guest_momo_attempts set status='reversed',provider_status='reversed',reversal_reference='GMRV-'||replace(gen_random_uuid()::text,'-',''),reversal_reason=reason,resolved_at=clock_timestamp() where id=a.id;
 end if;
end $$;

create or replace function public.lumo_guest_checkout(p_operation text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare l lumo_private.merchant_payment_links%rowtype;a lumo_private.guest_momo_attempts%rowtype;r lumo_private.payment_requests%rowtype;
 m lumo_private.merchants%rowtype;sh lumo_private.shops%rowtype;ss lumo_private.shop_settings%rowtype;
 amount bigint;token text;attempt text;recovery text;phone text;network text;rate text;source uuid;shop_record jsonb;
 provider jsonb:=jsonb_build_object('mode','sandbox','name','Lumo MoMo test provider','live',false);
begin
 if (auth.jwt()->>'role') is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN','noMutation',true);end if;
 if p_operation not in('quote','initiate','status','sandboxResult') or jsonb_typeof(p_payload)<>'object' then return jsonb_build_object('ok',false,'code','INVALID_INPUT','noMutation',true);end if;
 rate:=p_payload->>'rateKey';if rate is null or rate!~'^[a-f0-9]{64}$' then return jsonb_build_object('ok',false,'code','INVALID_INPUT','noMutation',true);end if;
 if not lumo_private.guest_rate('guest:'||p_operation||':'||rate,case p_operation when 'initiate' then 10 when 'quote' then 90 else 120 end) then return jsonb_build_object('ok',false,'code','RATE_LIMITED','noMutation',true);end if;
 begin
 if p_operation in('status','sandboxResult') then
  attempt:=p_payload->>'attemptId';recovery:=p_payload->>'recoveryHash';
  select * into a from lumo_private.guest_momo_attempts where id=attempt and recovery_hash=recovery;
  if a.id is null then raise exception 'RECOVERY_REQUIRED';end if;
  if p_operation='sandboxResult' then perform lumo_private.guest_apply_result(a.id,p_payload->>'outcome',a.amount,a.currency,a.merchant_id,a.shop_id,a.provider_reference);end if;
  return jsonb_build_object('ok',true,'sandbox',true,'provider',provider,'currency','GHS','fee',0,'attempt',lumo_private.guest_attempt_json(a.id));
 end if;
 token:=p_payload->>'link';if token is null or token!~'^[a-f0-9]{64}$' then raise exception 'INVALID_INPUT';end if;
 select * into l from lumo_private.merchant_payment_links where public_token=token;
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
   if a.link_id<>l.id or a.amount<>amount or a.phone<>phone or a.network<>network then raise exception 'IDEMPOTENCY_CONFLICT';end if;
   return jsonb_build_object('ok',true,'sandbox',true,'provider',provider,'currency','GHS','fee',0,'attempt',lumo_private.guest_attempt_json(a.id),'replayed',true);
  end if;
 end if;
 if m.status<>'active' or sh.merchant_id<>m.id or ss.published is distinct from true then raise exception 'LINK_UNAVAILABLE';end if;
 if not sh.accepting then raise exception 'SHOP_UNAVAILABLE';end if;
 if l.request_id is not null then select * into r from lumo_private.payment_requests where id=l.request_id;end if;
 if p_operation='quote' then
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
   if a.id is not null and a.link_id=l.id and a.amount=amount and a.phone=phone and a.network=network then return jsonb_build_object('ok',true,'sandbox',true,'provider',provider,'currency','GHS','fee',0,'attempt',lumo_private.guest_attempt_json(a.id),'replayed',true);end if;
   raise exception 'REQUEST_PROCESSING';
  end if;
 end if;
 insert into lumo_private.guest_momo_attempts(id,recovery_hash,link_id,merchant_id,shop_id,request_id,amount,phone,network)
 values(attempt,recovery,l.id,m.id,sh.id,l.request_id,amount,phone,network) on conflict(id) do nothing returning * into a;
 if a.id is null then
  select * into a from lumo_private.guest_momo_attempts where id=attempt;
  if a.recovery_hash<>recovery then raise exception 'RECOVERY_REQUIRED';end if;
  if a.link_id<>l.id or a.amount<>amount or a.phone<>phone or a.network<>network then raise exception 'IDEMPOTENCY_CONFLICT';end if;
 end if;
 return jsonb_build_object('ok',true,'sandbox',true,'provider',provider,'currency','GHS','fee',0,'attempt',lumo_private.guest_attempt_json(a.id));
exception when others then return jsonb_build_object('ok',false,'noMutation',true,'code',case when SQLERRM in('FORBIDDEN','INVALID_INPUT','LINK_UNAVAILABLE','SHOP_UNAVAILABLE','AMOUNT_CHANGED','IDEMPOTENCY_CONFLICT','RECOVERY_REQUIRED','REQUEST_PROCESSING','PAYMENT_FINAL','PROVIDER_RESULT_MISMATCH','PROVIDER_UNAVAILABLE') then SQLERRM else 'GUEST_SERVICE_ERROR' end);
end;
end $$;

-- Existing owner/manager refund approval posts to the original test-provider
-- funding account. Link every such refund to its original MoMo transaction.
create or replace function lumo_private.guest_refund_record()
returns trigger language plpgsql set search_path='' as $$
declare a lumo_private.guest_momo_attempts%rowtype;source uuid;
begin
 if new.type<>'refund' then return new;end if;
 select * into a from lumo_private.guest_momo_attempts where journal_id=new.original_payment_id and status='confirmed';
 if a.id is null then return new;end if;
 select id into source from lumo_private.accounts where kind='test_funding';
 if new.payee_account_id<>source or new.shop_id<>a.shop_id or new.amount>greatest(0,a.amount-coalesce((select sum(amount) from lumo_private.guest_momo_refunds where attempt_id=a.id),0)) then raise exception 'REFUND_DESTINATION_UNAVAILABLE';end if;
 insert into lumo_private.guest_momo_refunds(attempt_id,journal_id,amount) values(a.id,new.id,new.amount);
 return new;
end $$;
create trigger lumo_guest_refund_record after insert on lumo_private.journals for each row execute function lumo_private.guest_refund_record();

create or replace function lumo_private.approved_merchant_payment_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare shop jsonb;allowed_shop text;guest_id text;
begin
 if new.type<>'merchant_payment' then return new;end if;
 select item.value into shop from lumo_private.approved_merchant_network n cross join lateral jsonb_each(n.document->'businesses') business cross join lateral jsonb_array_elements(business.value->'shops') item where item.value->>'id'=new.shop_id::text;
 if shop is not null and shop->>'published' is distinct from 'true' then
  allowed_shop:=current_setting('lumo.approved.merchant_shop',true);
  if allowed_shop is distinct from new.shop_id::text then raise exception using errcode='P0001',message='SHOP_NOT_READY';end if;
  perform set_config('lumo.approved.merchant_shop','',true);
 end if;
 if new.request_id is not null and exists(select 1 from lumo_private.guest_momo_attempts g where g.request_id=new.request_id and g.status='pending') then
  guest_id:=current_setting('lumo.guest.posting_attempt',true);
  if (auth.jwt()->>'role') is distinct from 'service_role' or not exists(select 1 from lumo_private.guest_momo_attempts g join lumo_private.merchants m on m.id=g.merchant_id join lumo_private.accounts funding on funding.id=new.payer_account_id and funding.kind='test_funding'
   where g.id=guest_id and g.status='pending' and g.provider_status='approved' and g.provider_mode='sandbox' and g.request_id=new.request_id and g.shop_id=new.shop_id and g.amount=new.amount and m.account_id=new.payee_account_id and new.actor_user_id=m.owner_user_id)
  then raise exception using errcode='P0001',message='REQUEST_PROCESSING';end if;
 end if;
 return new;
end $$;

create or replace function lumo_private.balanced_journal()
returns trigger language plpgsql security definer set search_path='' as $$
declare n integer;total numeric;jid uuid;journal lumo_private.journals%rowtype;contexts jsonb;verified_session uuid;guest_posting boolean;
begin
 if tg_table_name='journals' then jid:=new.id;else jid:=new.journal_id;end if;
 select * into journal from lumo_private.journals where id=jid;
 if auth.uid() is null then
  if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'A shared-money posting requires an authenticated actor';end if;
  -- This narrow exception is backed by a stored, confirmed sandbox attempt and
  -- its exact canonical posting. A caller-supplied setting alone grants nothing.
  select exists(select 1 from lumo_private.guest_momo_attempts g join lumo_private.merchants m on m.id=g.merchant_id join lumo_private.accounts f on f.id=journal.payer_account_id and f.kind='test_funding'
   where journal.type='merchant_payment' and g.journal_id=journal.id and g.status='confirmed' and g.provider_status='approved' and g.provider_mode='sandbox' and g.amount=journal.amount and g.currency='GHS' and g.shop_id=journal.shop_id and g.request_id is not distinct from journal.request_id and m.account_id=journal.payee_account_id and m.owner_user_id=journal.actor_user_id) into guest_posting;
  if not guest_posting then
   contexts:=coalesce(nullif(current_setting('lumo.approved.actor_sessions',true),'')::jsonb,'{}'::jsonb);verified_session:=nullif(contexts->>journal.actor_user_id::text,'')::uuid;
   if verified_session is null or not lumo_private.approved_live(journal.actor_user_id,verified_session) then raise exception 'A service posting requires a verified live actor';end if;
  end if;
 end if;
 select count(*),coalesce(sum(amount),0) into n,total from lumo_private.entries where journal_id=jid;
 if n<>2 or total<>0 or not exists(select 1 from lumo_private.entries where journal_id=jid and account_id=journal.payer_account_id and amount=-journal.amount) or not exists(select 1 from lumo_private.entries where journal_id=jid and account_id=journal.payee_account_id and amount=journal.amount) then raise exception 'A journal must contain exactly two matching balanced postings';end if;
 return null;
end $$;

revoke execute on function public.lumo_guest_checkout(text,jsonb),public.lumo_guest_merchant(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.lumo_guest_checkout(text,jsonb),public.lumo_guest_merchant(uuid,uuid,text,text,jsonb) to service_role;
revoke execute on function lumo_private.guest_rate(text,integer),lumo_private.guest_link_json(uuid),lumo_private.guest_attempt_json(text),lumo_private.guest_merchant_actor(uuid,uuid,text),lumo_private.guest_apply_result(text,text,bigint,text,uuid,uuid,text),lumo_private.guest_refund_record() from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.lumo_approved_merchant_read(p_actor uuid DEFAULT NULL::uuid, p_session uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n lumo_private.approved_merchant_network%rowtype;
begin
 if p_actor is not null and not lumo_private.approved_live(p_actor,p_session) then return jsonb_build_object('ok',false,'code','SESSION_REVOKED');end if;
 select * into n from lumo_private.approved_merchant_network where id;
 return jsonb_build_object('ok',true,'revision',n.revision,'state',n.document,'ledgerStamp',lumo_private.approved_merchant_stamp(),
 'linkAttribution',coalesce((select jsonb_agg(jsonb_build_object('requestId',l.request_id,'linkId',l.id,'attribution',l.attribution)) from lumo_private.merchant_payment_links l where l.request_id is not null),'[]'::jsonb),
 'ledger',coalesce((select jsonb_agg(lumo_private.receipt_json(j.id)||jsonb_build_object('payerName',coalesce(case when ga.id is not null then 'MoMo guest · ••••••'||right(ga.phone,4) end,pp.display_name),'merchantId',m.id,'refundId',rf.refund_id,'guestCollectionId',ga.id,'guestLinkId',ga.link_id,'providerReference',ga.provider_reference,'providerMode',ga.provider_mode,'settlementStatus',case when ga.status='confirmed' then 'sandbox-posted' end,'requestAttribution',pl.attribution,'publicPaymentLinkId',pl.id) order by j.created_at,j.id)
 from lumo_private.journals j join lumo_private.merchants m on m.account_id in(j.payer_account_id,j.payee_account_id)
 left join lumo_private.accounts pa on pa.id=j.payer_account_id left join lumo_private.profiles pp on pp.user_id=pa.owner_user_id
 left join lumo_private.guest_momo_attempts ga on ga.journal_id=j.id
 left join lumo_private.merchant_payment_links pl on pl.request_id=j.request_id
 left join lumo_private.approved_merchant_refunds rf on rf.journal_id=j.id where j.type in('merchant_payment','refund')),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'shopId',r.shop_id,'amount',r.amount,'description',r.note,'status',r.status,'expiresAt',r.expires_at,'createdAt',r.created_at,'createdBySharedUserId',r.created_by,'attribution',pl.attribution,'publicPaymentLinkId',pl.id)) from lumo_private.payment_requests r left join lumo_private.merchant_payment_links pl on pl.request_id=r.id),'[]'::jsonb),
 'balances',coalesce((select jsonb_object_agg(m.id::text,jsonb_build_object('balance',a.balance,'accountId',a.id)) from lumo_private.merchants m join lumo_private.accounts a on a.id=m.account_id),'{}'::jsonb));
end $function$;
