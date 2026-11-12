-- Local PL/pgSQL variables are explicitly named to avoid SQL table/column scope ambiguity.
create or replace function lumo_private.command(p_command text,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); session_id uuid; profile lumo_private.profiles%rowtype; own_account lumo_private.accounts%rowtype;
 target lumo_private.accounts%rowtype; recipient lumo_private.profiles%rowtype; merchant lumo_private.merchants%rowtype;
 shop lumo_private.shops%rowtype; request lumo_private.payment_requests%rowtype; payment lumo_private.journals%rowtype;
 attempt text; fingerprint text; prior lumo_private.attempts%rowtype; result jsonb; amount bigint; amount_numeric numeric;
 v_handle text; display_name text; pin text; j uuid; new_account uuid; new_merchant uuid; new_shop uuid; new_request uuid;
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
  v_handle:=lower(trim(p_payload->>'handle'));display_name:=trim(p_payload->>'displayName');pin:=p_payload->>'pin';
  if jsonb_typeof(p_payload->'handle') is distinct from 'string' or v_handle is null or v_handle !~ '^[a-z][a-z0-9_]{2,29}$' or jsonb_typeof(p_payload->'displayName') is distinct from 'string' or display_name is null or length(display_name) not between 1 and 80 or display_name~'[[:cntrl:]<>]' or jsonb_typeof(p_payload->'pin') is distinct from 'string' or pin is null or pin !~ '^[0-9]{4,6}$'
  then return lumo_private.failure('INVALID_ACCOUNT','Use a unique handle, display name and a 4–6 digit transaction PIN.'); end if;
  if exists(select 1 from lumo_private.profiles p where p.handle=v_handle) then return lumo_private.failure('HANDLE_TAKEN','That Lumo handle is already in use.'); end if;
  begin
   insert into lumo_private.profiles(user_id,handle,display_name,pin_hash) values(actor,v_handle,display_name,extensions.crypt(pin,extensions.gen_salt('bf',10)));
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
   if err in ('ACCOUNT_UNAVAILABLE','INSUFFICIENT_FUNDS','WALLET_LIMIT','REQUEST_UNAVAILABLE') then result:=lumo_private.failure(err,case err when 'INSUFFICIENT_FUNDS' then 'There is not enough available money for this payment.' when 'WALLET_LIMIT' then 'The receiving account has reached its test-wallet limit.' when 'REQUEST_UNAVAILABLE' then 'This fixed request expired before payment could post. Ask for a fresh QR.' else 'One of these accounts is unavailable.' end,true,attempt);else raise;end if;
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

