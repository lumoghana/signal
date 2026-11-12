-- Lumo shared pilot ledger. Test money only. No bank, MoMo or identity-provider integration.
-- All application tables live in a non-exposed schema. Clients can execute only lumo_rpc.
create schema if not exists lumo_private;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
revoke all on schema lumo_private from public, anon, authenticated;
grant usage on schema lumo_private to authenticated;
alter default privileges in schema lumo_private revoke all on tables from public, anon, authenticated;
alter default privileges in schema lumo_private revoke execute on functions from public, anon, authenticated;

create table lumo_private.profiles (
 user_id uuid primary key references auth.users(id),
 handle text not null unique check (handle ~ '^[a-z][a-z0-9_]{2,29}$'),
 display_name text not null check (length(display_name) between 1 and 80),
 pin_hash text not null,
 pin_failures integer not null default 0 check (pin_failures >= 0),
 pin_locked_until timestamptz,
 status text not null default 'active' check (status in ('active','suspended')),
 created_at timestamptz not null default now()
);
create table lumo_private.accounts (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid references auth.users(id),
 kind text not null check (kind in ('consumer','merchant','test_funding')),
 currency text not null default 'GHS' check (currency='GHS'),
 balance bigint not null default 0,
 status text not null default 'active' check (status in ('active','suspended')),
 created_at timestamptz not null default now(),
 check ((kind='test_funding' and owner_user_id is null) or (kind<>'test_funding' and owner_user_id is not null)),
 check (kind='test_funding' or balance between 0 and 10000000)
);
create unique index lumo_one_consumer_account on lumo_private.accounts(owner_user_id) where kind='consumer';
create unique index lumo_one_test_funding_account on lumo_private.accounts(kind) where kind='test_funding';
create index lumo_accounts_owner on lumo_private.accounts(owner_user_id);
create table lumo_private.merchants (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null references auth.users(id),
 account_id uuid not null unique references lumo_private.accounts(id),
 name text not null check (length(name) between 1 and 100),
 status text not null default 'active' check (status in ('active','paused')),
 created_at timestamptz not null default now()
);
create index lumo_merchants_owner on lumo_private.merchants(owner_user_id);
create table lumo_private.shops (
 id uuid primary key default gen_random_uuid(),
 merchant_id uuid not null references lumo_private.merchants(id),
 name text not null check (length(name) between 1 and 100),
 accepting boolean not null default true,
 trading_since timestamptz not null default now(),
 created_at timestamptz not null default now()
);
create index lumo_shops_merchant on lumo_private.shops(merchant_id);
create table lumo_private.payment_requests (
 id uuid primary key default gen_random_uuid(),
 shop_id uuid not null references lumo_private.shops(id),
 amount bigint not null check (amount between 1 and 1000000),
 note text not null default '' check (length(note)<=160),
 status text not null default 'open' check (status in ('open','paid','cancelled')),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '15 minutes'),
 paid_journal_id uuid,
 check (expires_at>created_at)
);
create index lumo_requests_shop on lumo_private.payment_requests(shop_id,created_at desc);
create table lumo_private.journals (
 id uuid primary key default gen_random_uuid(),
 reference text not null unique default ('LM-'||replace(gen_random_uuid()::text,'-','')),
 type text not null check (type in ('test_funding','transfer','merchant_payment','refund')),
 amount bigint not null check (amount between 1 and 1000000),
 payer_account_id uuid not null references lumo_private.accounts(id),
 payee_account_id uuid not null references lumo_private.accounts(id),
 actor_user_id uuid not null references auth.users(id),
 shop_id uuid references lumo_private.shops(id),
 request_id uuid references lumo_private.payment_requests(id),
 original_payment_id uuid references lumo_private.journals(id),
 created_at timestamptz not null default clock_timestamp(),
 check (payer_account_id<>payee_account_id),
 check ((type='refund')=(original_payment_id is not null)),
 check (type in ('merchant_payment','refund') or (shop_id is null and request_id is null))
);
alter table lumo_private.payment_requests add constraint lumo_request_journal_fk foreign key (paid_journal_id) references lumo_private.journals(id);
create index lumo_journals_payer on lumo_private.journals(payer_account_id,created_at desc,id);
create index lumo_journals_payee on lumo_private.journals(payee_account_id,created_at desc,id);
create index lumo_journals_shop on lumo_private.journals(shop_id,created_at desc);
create index lumo_journals_original on lumo_private.journals(original_payment_id) where original_payment_id is not null;
create table lumo_private.entries (
 id uuid primary key default gen_random_uuid(),
 journal_id uuid not null references lumo_private.journals(id),
 account_id uuid not null references lumo_private.accounts(id),
 amount bigint not null check (amount<>0),
 created_at timestamptz not null default now(),
 unique(journal_id,account_id)
);
create index lumo_entries_account on lumo_private.entries(account_id,created_at desc);
create table lumo_private.attempts (
 user_id uuid not null references auth.users(id),
 attempt_id text not null check (attempt_id ~ '^[A-Za-z0-9_.:-]{10,100}$'),
 command text not null,
 fingerprint text not null,
 result jsonb not null,
 created_at timestamptz not null default now(),
 primary key(user_id,attempt_id)
);
create table lumo_private.events (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 journal_id uuid not null references lumo_private.journals(id),
 type text not null default 'money.posted',
 created_at timestamptz not null default now(),
 unique(user_id,journal_id)
);
create index lumo_events_user on lumo_private.events(user_id,created_at desc);

alter table lumo_private.profiles enable row level security;
alter table lumo_private.accounts enable row level security;
alter table lumo_private.merchants enable row level security;
alter table lumo_private.shops enable row level security;
alter table lumo_private.payment_requests enable row level security;
alter table lumo_private.journals enable row level security;
alter table lumo_private.entries enable row level security;
alter table lumo_private.attempts enable row level security;
alter table lumo_private.events enable row level security;
revoke all on all tables in schema lumo_private from public,anon,authenticated;

create function lumo_private.immutable_posting() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Posted ledger records are immutable'; end $$;
create trigger lumo_journal_immutable before update or delete on lumo_private.journals for each row execute function lumo_private.immutable_posting();
create trigger lumo_entry_immutable before update or delete on lumo_private.entries for each row execute function lumo_private.immutable_posting();
create function lumo_private.balanced_journal() returns trigger language plpgsql set search_path='' as $$
declare n integer; total numeric; jid uuid; journal lumo_private.journals%rowtype;
begin
 if tg_table_name='journals' then jid:=new.id;else jid:=new.journal_id;end if;
 select * into journal from lumo_private.journals where id=jid;
 select count(*),coalesce(sum(amount),0) into n,total from lumo_private.entries where journal_id=jid;
 if n<>2 or total<>0
 or not exists(select 1 from lumo_private.entries where journal_id=jid and account_id=journal.payer_account_id and amount=-journal.amount)
 or not exists(select 1 from lumo_private.entries where journal_id=jid and account_id=journal.payee_account_id and amount=journal.amount)
 then raise exception 'A journal must contain exactly two matching balanced postings'; end if;
 return null;
end $$;
create constraint trigger lumo_balanced_entries after insert on lumo_private.entries deferrable initially deferred for each row execute function lumo_private.balanced_journal();
create constraint trigger lumo_balanced_journal after insert on lumo_private.journals deferrable initially deferred for each row execute function lumo_private.balanced_journal();

create function lumo_private.failure(code text,message text,definitive boolean default true,attempt text default null) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_strip_nulls(jsonb_build_object('ok',false,'sandbox',true,'currency','GHS','code',code,'message',message,'definitive',definitive,'attemptId',attempt));
$$;
create function lumo_private.account_json(user_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',a.id,'handle',p.handle,'displayName',p.display_name,'userId',p.user_id,'balance',a.balance,'currency',a.currency,'sandbox',true)
 from lumo_private.profiles p join lumo_private.accounts a on a.owner_user_id=p.user_id and a.kind='consumer' where p.user_id=account_json.user_id;
$$;
create function lumo_private.receipt_json(journal_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',j.id,'reference',j.reference,'type',j.type,'amount',j.amount,'currency','GHS','sandbox',true,'status','posted',
 'actorUserId',j.actor_user_id,'payerAccountId',j.payer_account_id,'payeeAccountId',j.payee_account_id,'payerHandle',pp.handle,'payeeHandle',rp.handle,'recipientHandle',rp.handle,
 'shopId',j.shop_id,'requestId',j.request_id,'originalPaymentId',j.original_payment_id,'createdAt',j.created_at)
 from lumo_private.journals j
 join lumo_private.accounts pa on pa.id=j.payer_account_id join lumo_private.accounts ra on ra.id=j.payee_account_id
 left join lumo_private.profiles pp on pp.user_id=pa.owner_user_id and pa.kind='consumer'
 left join lumo_private.profiles rp on rp.user_id=ra.owner_user_id and ra.kind='consumer'
 where j.id=receipt_json.journal_id;
$$;
create function lumo_private.verify_pin(user_id uuid,pin text) returns boolean language plpgsql set search_path='' as $$
declare p lumo_private.profiles%rowtype;
begin
 select * into p from lumo_private.profiles where profiles.user_id=verify_pin.user_id for update;
 if not found or p.pin_locked_until>clock_timestamp() then return false; end if;
 if pin is null or pin !~ '^[0-9]{4,6}$' or extensions.crypt(pin,p.pin_hash)<>p.pin_hash then
  update lumo_private.profiles set pin_failures=case when p.pin_locked_until is not null and p.pin_locked_until<=clock_timestamp() then 1 else pin_failures+1 end,
  pin_locked_until=case when (case when p.pin_locked_until is not null and p.pin_locked_until<=clock_timestamp() then 1 else pin_failures+1 end)>=5 then clock_timestamp()+interval '1 minute' else null end where profiles.user_id=verify_pin.user_id;
  return false;
 end if;
 update lumo_private.profiles set pin_failures=0,pin_locked_until=null where profiles.user_id=verify_pin.user_id;
 return true;
end $$;
create function lumo_private.post_money(actor uuid,kind text,amount bigint,source uuid,destination uuid,shop uuid default null,request uuid default null,original uuid default null) returns uuid language plpgsql set search_path='' as $$
declare j uuid; source_balance bigint; source_kind text; dest_balance bigint;
begin
 -- Every caller takes the same account lock order, including opposite-direction transfers.
 perform 1 from lumo_private.accounts where id in (source,destination) order by id for update;
 select balance,accounts.kind into source_balance,source_kind from lumo_private.accounts where id=source and status='active';
 select balance into dest_balance from lumo_private.accounts where id=destination and status='active';
 if source_balance is null or dest_balance is null then raise exception using errcode='P0001',message='ACCOUNT_UNAVAILABLE'; end if;
 if source_kind<>'test_funding' and source_balance<amount then raise exception using errcode='P0001',message='INSUFFICIENT_FUNDS'; end if;
 if dest_balance+amount>10000000 then raise exception using errcode='P0001',message='WALLET_LIMIT'; end if;
 insert into lumo_private.journals(type,amount,payer_account_id,payee_account_id,actor_user_id,shop_id,request_id,original_payment_id)
 values(kind,amount,source,destination,actor,shop,request,original) returning id into j;
 insert into lumo_private.entries(journal_id,account_id,amount) values(j,source,-amount),(j,destination,amount);
 update lumo_private.accounts set balance=balance-amount where id=source;
 update lumo_private.accounts set balance=balance+amount where id=destination;
 insert into lumo_private.events(user_id,journal_id)
 select distinct owner_user_id,j from lumo_private.accounts where id in (source,destination) and owner_user_id is not null;
 return j;
end $$;

create function lumo_private.command(p_command text,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); session_id uuid; profile lumo_private.profiles%rowtype; own_account lumo_private.accounts%rowtype;
 target lumo_private.accounts%rowtype; recipient lumo_private.profiles%rowtype; merchant lumo_private.merchants%rowtype;
 shop lumo_private.shops%rowtype; request lumo_private.payment_requests%rowtype; payment lumo_private.journals%rowtype;
 attempt text; fingerprint text; prior lumo_private.attempts%rowtype; result jsonb; amount bigint; amount_numeric numeric;
 handle text; display_name text; pin text; j uuid; new_account uuid; new_merchant uuid; new_shop uuid; new_request uuid;
 shop_id uuid; request_id uuid; payment_id uuid; already_refunded bigint; day_funding bigint; total_funding bigint;
 err text; mutating boolean:=p_command in ('wallet.fund','transfer','merchant.create','request.create','payment.pay','payment.refund','merchant.close');
begin
 if actor is null or jsonb_typeof(p_payload) is distinct from 'object' then return lumo_private.failure('AUTH_REQUIRED','Sign in to Lumo before continuing.',false); end if;
 begin session_id:=nullif(auth.jwt()->>'session_id','')::uuid; exception when invalid_text_representation then session_id:=null; end;
 if session_id is null or not exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id where s.id=session_id and s.user_id=actor
 and (s.not_after is null or s.not_after>clock_timestamp()) and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()) and coalesce(u.is_anonymous,false)=false)
 then return lumo_private.failure('SESSION_REVOKED','Sign in again to use your shared Lumo account.',false); end if;
 if p_command is null or length(p_command)>60 then return lumo_private.failure('UNKNOWN_COMMAND','Choose a supported Lumo action.'); end if;
 -- Serializes same-user command attempts and PIN failure counters without global locks.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,4271));
 if p_command='account.open' then
  select * into profile from lumo_private.profiles where user_id=actor;
  if found then return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','existing',true,'account',lumo_private.account_json(actor)); end if;
  handle:=lower(trim(p_payload->>'handle'));display_name:=trim(p_payload->>'displayName');pin:=p_payload->>'pin';
  if jsonb_typeof(p_payload->'handle') is distinct from 'string' or handle is null or handle !~ '^[a-z][a-z0-9_]{2,29}$' or jsonb_typeof(p_payload->'displayName') is distinct from 'string' or display_name is null or length(display_name) not between 1 and 80 or display_name~'[[:cntrl:]<>]' or jsonb_typeof(p_payload->'pin') is distinct from 'string' or pin is null or pin !~ '^[0-9]{4,6}$'
  then return lumo_private.failure('INVALID_ACCOUNT','Use a unique handle, display name and a 4–6 digit transaction PIN.'); end if;
  if exists(select 1 from lumo_private.profiles p where p.handle=command.handle) then return lumo_private.failure('HANDLE_TAKEN','That Lumo handle is already in use.'); end if;
  begin
   insert into lumo_private.profiles(user_id,handle,display_name,pin_hash) values(actor,handle,display_name,extensions.crypt(pin,extensions.gen_salt('bf',10)));
   insert into lumo_private.accounts(owner_user_id,kind) values(actor,'consumer');
  exception when unique_violation then return lumo_private.failure('HANDLE_TAKEN','That Lumo handle is already in use.'); end;
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','existing',false,'account',lumo_private.account_json(actor));
 end if;
 select * into profile from lumo_private.profiles where user_id=actor;
 if not found then return lumo_private.failure('ACCOUNT_REQUIRED','Open your shared Lumo account first.',false); end if;
 if profile.status<>'active' then return lumo_private.failure('ACCOUNT_SUSPENDED','This account is restricted. Contact Lumo support.',false); end if;
 select * into own_account from lumo_private.accounts where owner_user_id=actor and kind='consumer';
 if own_account.status<>'active' then return lumo_private.failure('ACCOUNT_SUSPENDED','This account is restricted. Contact Lumo support.',false); end if;
 if p_command='account.get' then
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','account',lumo_private.account_json(actor),'activity',coalesce((select jsonb_agg(lumo_private.receipt_json(x.id) order by x.created_at desc,x.id) from (select id,created_at from lumo_private.journals where payer_account_id=own_account.id or payee_account_id=own_account.id order by created_at desc,id limit 100)x),'[]'::jsonb));
 elsif p_command='recipient.lookup' then
  select * into recipient from lumo_private.profiles p where p.handle=lower(trim(p_payload->>'handle')) and p.status='active';
  if not found then return lumo_private.failure('RECIPIENT_NOT_FOUND','No active Lumo account matches that handle.'); end if;
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','recipient',jsonb_build_object('id',recipient.user_id,'handle',recipient.handle,'displayName',recipient.display_name));
 elsif p_command='attempt.lookup' then
  attempt:=p_payload->>'attemptId';
  if attempt is null or attempt !~ '^[A-Za-z0-9_.:-]{10,100}$' then return lumo_private.failure('INVALID_ATTEMPT','Use the original saved payment reference.',false); end if;
  select * into prior from lumo_private.attempts where user_id=actor and attempt_id=attempt;
  if not found then return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','found',false,'attemptId',attempt); end if;
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','found',true,'attemptId',attempt,'result',prior.result,'account',lumo_private.account_json(actor));
 end if;
 if mutating then
  attempt:=p_payload->>'attemptId';
  if jsonb_typeof(p_payload->'attemptId') is distinct from 'string' or attempt is null or attempt !~ '^[A-Za-z0-9_.:-]{10,100}$' then return lumo_private.failure('INVALID_ATTEMPT','Save a unique payment reference before continuing.',false); end if;
  fingerprint:=encode(extensions.digest(p_command||':'||(p_payload-'pin')::text,'sha256'),'hex');
  select * into prior from lumo_private.attempts where user_id=actor and attempt_id=attempt;
  if found then
   if prior.command<>p_command or prior.fingerprint<>fingerprint then return lumo_private.failure('IDEMPOTENCY_MISMATCH','This reference belongs to different payment details. Check the original payment.',false,attempt); end if;
   return prior.result||jsonb_build_object('replayed',true,'account',lumo_private.account_json(actor));
  end if;
 end if;
 if p_command in ('wallet.fund','transfer','request.create','payment.pay','payment.refund') then
  if jsonb_typeof(p_payload->'amount') is distinct from 'number' then result:=lumo_private.failure('INVALID_AMOUNT','Enter a whole number of pesewas between 1 and 1,000,000.',true,attempt);
  else
   amount_numeric:=(p_payload->>'amount')::numeric;
   if amount_numeric<>trunc(amount_numeric) or amount_numeric<1 or amount_numeric>1000000 then result:=lumo_private.failure('INVALID_AMOUNT','Enter a whole number of pesewas between 1 and 1,000,000.',true,attempt);
   else amount:=amount_numeric::bigint; end if;
  end if;
 end if;
 if result is null and p_command in ('transfer','payment.pay','payment.refund') and not lumo_private.verify_pin(actor,case when jsonb_typeof(p_payload->'pin')='string' then p_payload->>'pin' else null end) then
  return lumo_private.failure('PIN_REQUIRED','Check your transaction PIN. After five incorrect attempts, wait one minute.',false,attempt);
 end if;
 -- Expected monetary failures are stored with their attempt. A retry can never transform a rejected operation into a later debit.
 if result is null then
 begin
  if p_command='wallet.fund' then
   if p_payload->'confirmSandbox'<>'true'::jsonb or not (p_payload?'confirmSandbox') then result:=lumo_private.failure('TEST_CONFIRMATION_REQUIRED','Confirm these test funds have no real monetary value.',true,attempt);
   elsif amount>100000 then result:=lumo_private.failure('FUNDING_LIMIT','Add at most GH₵1,000 of test funds at a time.',true,attempt);
   else
    select coalesce(sum(journals.amount),0),coalesce(sum(journals.amount) filter(where created_at>=date_trunc('day',now())),0) into total_funding,day_funding from lumo_private.journals where actor_user_id=actor and type='test_funding';
    if total_funding+amount>1000000 or day_funding+amount>1000000 then result:=lumo_private.failure('FUNDING_LIMIT','This account has reached its GH₵10,000 test-funding allowance.',true,attempt);
    else
     select * into target from lumo_private.accounts where kind='test_funding';
     j:=lumo_private.post_money(actor,'test_funding',amount,target.id,own_account.id);
    end if;
   end if;
  elsif p_command='transfer' then
   select * into recipient from lumo_private.profiles p where p.handle=lower(trim(p_payload->>'recipientHandle')) and p.status='active';
   if not found then result:=lumo_private.failure('RECIPIENT_NOT_FOUND','No active Lumo account matches that handle.',true,attempt);
   elsif recipient.user_id=actor then result:=lumo_private.failure('SAME_ACCOUNT','Choose another Lumo account.',true,attempt);
   else
    select * into target from lumo_private.accounts where owner_user_id=recipient.user_id and kind='consumer';
    j:=lumo_private.post_money(actor,'transfer',amount,own_account.id,target.id);
   end if;
  elsif p_command='merchant.create' then
   if jsonb_typeof(p_payload->'businessName') is distinct from 'string' or jsonb_typeof(p_payload->'shopName') is distinct from 'string' or coalesce(length(trim(p_payload->>'businessName')),0) not between 1 and 100 or coalesce(length(trim(p_payload->>'shopName')),0) not between 1 and 100 or (p_payload->>'businessName')~'[[:cntrl:]<>]' or (p_payload->>'shopName')~'[[:cntrl:]<>]' then result:=lumo_private.failure('INVALID_MERCHANT','Enter a business name and receiving shop name.',true,attempt);
   elsif (select count(*) from lumo_private.merchants where owner_user_id=actor)>=10 then result:=lumo_private.failure('MERCHANT_LIMIT','This test account already has ten merchant businesses.',true,attempt);
   else
    insert into lumo_private.accounts(owner_user_id,kind) values(actor,'merchant') returning id into new_account;
    insert into lumo_private.merchants(owner_user_id,account_id,name) values(actor,new_account,trim(p_payload->>'businessName')) returning id into new_merchant;
    insert into lumo_private.shops(merchant_id,name) values(new_merchant,trim(p_payload->>'shopName')) returning id into new_shop;
    result:=jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','attemptId',attempt,'merchant',jsonb_build_object('id',new_merchant,'name',trim(p_payload->>'businessName'),'accountId',new_account,'balance',0),'shop',jsonb_build_object('id',new_shop,'name',trim(p_payload->>'shopName'),'merchantId',new_merchant));
   end if;
  elsif p_command='merchant.get' then
   return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','merchants',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'accountId',m.account_id,'balance',a.balance,'shops',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'accepting',s.accepting,'tradingSince',s.trading_since,'netCollected',coalesce((select sum(case when j2.type='merchant_payment' then j2.amount when j2.type='refund' then -j2.amount else 0 end) from lumo_private.journals j2 where j2.shop_id=s.id and j2.created_at>=s.trading_since),0)) order by s.created_at) from lumo_private.shops s where s.merchant_id=m.id),'[]'::jsonb),'activity',coalesce((select jsonb_agg(lumo_private.receipt_json(x.id) order by x.created_at desc,x.id) from (select id,created_at from lumo_private.journals where payer_account_id=m.account_id or payee_account_id=m.account_id order by created_at desc,id limit 100)x),'[]'::jsonb))) from lumo_private.merchants m join lumo_private.accounts a on a.id=m.account_id where m.owner_user_id=actor),'[]'::jsonb));
  elsif p_command in ('request.create','payment.quote','payment.pay','merchant.close') then
   begin
    if jsonb_typeof(p_payload->'shopId') is distinct from 'string' or (p_payload?'requestId' and (jsonb_typeof(p_payload->'requestId') is distinct from 'string' or p_payload->>'requestId'='')) then raise invalid_text_representation; end if;
    shop_id:=(p_payload->>'shopId')::uuid;request_id:=(p_payload->>'requestId')::uuid;
   exception when invalid_text_representation then result:=lumo_private.failure('INVALID_QR','Scan a valid Lumo merchant QR.',true,attempt);end;
   if result is null then
    select * into shop from lumo_private.shops s where s.id=shop_id;
    select * into merchant from lumo_private.merchants m where m.id=shop.merchant_id;
    if shop.id is null or merchant.id is null then result:=lumo_private.failure('SHOP_NOT_FOUND','This receiving shop is unavailable.',true,attempt);
    elsif p_command in ('request.create','merchant.close') and merchant.owner_user_id<>actor then result:=lumo_private.failure('FORBIDDEN','Only the owner can manage this shop.',true,attempt);
    elsif merchant.status<>'active' or not shop.accepting then result:=lumo_private.failure('SHOP_PAUSED','This shop is not accepting payments.',true,attempt);
    elsif p_command='request.create' then
     if (p_payload?'note' and jsonb_typeof(p_payload->'note') is distinct from 'string') or coalesce(length(p_payload->>'note'),0)>160 then result:=lumo_private.failure('INVALID_NOTE','Keep the payment note within 160 characters.',true,attempt);
     else
      insert into lumo_private.payment_requests(shop_id,amount,note,created_by) values(shop.id,amount,coalesce(p_payload->>'note',''),actor) returning id into new_request;
      select * into request from lumo_private.payment_requests where id=new_request;
      result:=jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','attemptId',attempt,'request',jsonb_build_object('id',request.id,'shopId',request.shop_id,'amount',request.amount,'note',request.note,'status',request.status,'expiresAt',request.expires_at));
     end if;
    elsif p_command='merchant.close' then
     -- The trading view resets; no ledger entry or underlying merchant money is removed.
     perform 1 from lumo_private.accounts where id=merchant.account_id for update;
     update lumo_private.shops set trading_since=clock_timestamp() where id=shop.id;
     result:=jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','attemptId',attempt,'shopId',shop.id,'closed',true,'balance',(select balance from lumo_private.accounts where id=merchant.account_id));
    else
     if request_id is not null then
      select * into request from lumo_private.payment_requests r where r.id=request_id for update;
      if request.id is null or request.shop_id<>shop.id or request.status<>'open' or request.expires_at<=clock_timestamp() then result:=lumo_private.failure('REQUEST_UNAVAILABLE','This fixed request is unavailable. Ask the merchant for a fresh QR.',true,attempt);end if;
     end if;
     if result is null and p_command='payment.quote' then
      return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','merchant',jsonb_build_object('id',merchant.id,'name',merchant.name),'shop',jsonb_build_object('id',shop.id,'name',shop.name,'merchantId',merchant.id,'accepting',true),'request',case when request.id is null then null else jsonb_build_object('id',request.id,'shopId',request.shop_id,'amount',request.amount,'note',request.note,'status',request.status,'expiresAt',request.expires_at)end);
     elsif result is null then
      if merchant.owner_user_id=actor then result:=lumo_private.failure('SAME_ACCOUNT','Use another consumer account to test paying this merchant.',true,attempt);
      elsif request.id is not null and request.amount<>amount then result:=lumo_private.failure('AMOUNT_LOCKED','Pay the exact amount requested by the merchant.',true,attempt);
      else
       j:=lumo_private.post_money(actor,'merchant_payment',amount,own_account.id,merchant.account_id,shop.id,request.id);
       if request.id is not null then update lumo_private.payment_requests set status='paid',paid_journal_id=j where id=request.id; end if;
      end if;
     end if;
    end if;
   end if;
  elsif p_command='payment.refund' then
   begin if jsonb_typeof(p_payload->'paymentId') is distinct from 'string' then raise invalid_text_representation;end if;payment_id:=(p_payload->>'paymentId')::uuid;exception when invalid_text_representation then result:=lumo_private.failure('INVALID_PAYMENT','Choose an original merchant payment.',true,attempt);end;
   if result is null then
    select * into payment from lumo_private.journals where id=payment_id for update;
    select * into merchant from lumo_private.merchants where account_id=payment.payee_account_id and owner_user_id=actor;
    if payment.id is null or payment.type<>'merchant_payment' or merchant.id is null then result:=lumo_private.failure('FORBIDDEN','Only the receiving merchant owner can refund this payment.',true,attempt);
    else
     select coalesce(sum(journals.amount),0) into already_refunded from lumo_private.journals where original_payment_id=payment.id;
     if amount+already_refunded>payment.amount then result:=lumo_private.failure('REFUND_EXCEEDS_PAYMENT','The refund exceeds the remaining original payment.',true,attempt);
     else j:=lumo_private.post_money(actor,'refund',amount,merchant.account_id,payment.payer_account_id,payment.shop_id,payment.request_id,payment.id);end if;
    end if;
   end if;
  else result:=lumo_private.failure('UNKNOWN_COMMAND','Choose a supported Lumo action.');
  end if;
 exception
  when raise_exception then
   err:=sqlerrm;
   if err in ('ACCOUNT_UNAVAILABLE','INSUFFICIENT_FUNDS','WALLET_LIMIT') then result:=lumo_private.failure(err,case err when 'INSUFFICIENT_FUNDS' then 'There is not enough available money for this payment.' when 'WALLET_LIMIT' then 'The receiving account has reached its test-wallet limit.' else 'One of these accounts is unavailable.' end,true,attempt);else raise;end if;
 end;
 end if;
 if j is not null then result:=jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','attemptId',attempt,'receipt',lumo_private.receipt_json(j));end if;
 if result is null then return lumo_private.failure('UNKNOWN_RESULT','Keep the original reference and check its result.',false,attempt);end if;
 if mutating then
  result:=result||jsonb_build_object('attemptId',attempt,'replayed',false,'account',lumo_private.account_json(actor));
  insert into lumo_private.attempts(user_id,attempt_id,command,fingerprint,result) values(actor,attempt,p_command,fingerprint,result);
 end if;
 return result;
end $$;

revoke all on all functions in schema lumo_private from public,anon,authenticated;
grant execute on function lumo_private.command(text,jsonb) to authenticated;
create function public.lumo_rpc(p_command text,p_payload jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$
 select lumo_private.command(p_command,p_payload);
$$;
revoke all on function public.lumo_rpc(text,jsonb) from public,anon;
grant execute on function public.lumo_rpc(text,jsonb) to authenticated;
insert into lumo_private.accounts(kind) values('test_funding');
comment on function public.lumo_rpc(text,jsonb) is 'Authenticated shared Lumo pilot commands. GHS test money only. Requires live Supabase Auth session.';
