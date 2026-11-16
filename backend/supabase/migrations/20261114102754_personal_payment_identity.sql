-- Personal payment enrollment is independent of merchant staff access.
-- Existing profiles, usernames, wallets and journals are retained.
alter table lumo_private.approved_profiles add column if not exists personal_account boolean not null default false;
update lumo_private.approved_profiles ap set personal_account=true
where exists(select 1 from lumo_private.profiles p where p.user_id=ap.user_id)
and (not exists(select 1 from lumo_private.approved_merchant_network n cross join lateral jsonb_array_elements(n.document->'users') u where u->>'_sharedUserId'=ap.user_id::text)
 or exists(select 1 from lumo_private.approved_states s where s.user_id=ap.user_id and jsonb_typeof(s.state->'activation')='object' and s.state#>>'{activation,step}' in ('account-created','fund','purpose','ready','complete','waiting')));
create or replace function lumo_private.personal_recipient(p_user uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from lumo_private.approved_profiles ap join lumo_private.profiles p on p.user_id=ap.user_id join lumo_private.accounts a on a.owner_user_id=p.user_id and a.kind='consumer' and a.status='active' join auth.users u on u.id=p.user_id
 where p.user_id=p_user and ap.personal_account and p.status='active' and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and not coalesce(u.is_anonymous,false) and u.raw_app_meta_data->'lumo_pilot'='true'::jsonb);
$$;
revoke all on function lumo_private.personal_recipient(uuid) from public,anon,authenticated;
grant execute on function lumo_private.personal_recipient(uuid) to service_role;

CREATE OR REPLACE FUNCTION lumo_private.approved_people_search(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid;session uuid;q text;exact_phone text;rows jsonb;
begin
 if (auth.jwt()->>'role') is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or jsonb_typeof(p_payload->'query') is distinct from 'string'
  or length(p_payload->>'query')>80 then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 begin actor:=(p_payload->>'actor')::uuid;session:=(p_payload->>'session')::uuid;
 exception when invalid_text_representation then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end;
 if actor is null or session is null or not lumo_private.approved_live(actor,session) then return jsonb_build_object('ok',false,'code','SESSION_REVOKED');end if;
 if not exists(select 1 from lumo_private.profiles p join lumo_private.accounts a on a.owner_user_id=p.user_id and a.kind='consumer' and a.status='active' where p.user_id=actor and p.status='active') then return jsonb_build_object('ok',false,'code','ACCOUNT_UNAVAILABLE');end if;
 q:=lower(trim(regexp_replace(trim(p_payload->>'query'),'^@','')));
 if q ~ '[[:cntrl:]]' then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 if length(q)=1 then return jsonb_build_object('ok',true,'people','[]'::jsonb,'hasMore',false);end if;
 exact_phone:=regexp_replace(q,'[\s()-]','','g');exact_phone:=regexp_replace(exact_phone,'^\+233','0');
 select coalesce(jsonb_agg(jsonb_build_object('id',x.user_id,'userId',x.user_id,'handle',x.handle,'name',x.display_name,'rail','lumo') order by x.rank,x.handle),'[]'::jsonb) into rows from (
  select p.user_id,p.handle,p.display_name,case when p.handle=q then 0 when starts_with(p.handle,q) then 1 else 2 end as rank
  from lumo_private.profiles p join lumo_private.accounts a on a.owner_user_id=p.user_id and a.kind='consumer' and a.status='active'
  join auth.users u on u.id=p.user_id
  where p.status='active' and lumo_private.personal_recipient(p.user_id) and p.user_id<>actor and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp())
   and not coalesce(u.is_anonymous,false) and u.raw_app_meta_data->'lumo_pilot'='true'::jsonb
   and (q='' or starts_with(p.handle,q) or strpos(lower(p.display_name),q)>0
    or exact_phone~'^0[0-9]{9}$' and exists(select 1 from lumo_private.approved_profiles ap where ap.user_id=p.user_id and ap.phone=exact_phone))
  order by rank,p.handle limit 21
 )x;
 return jsonb_build_object('ok',true,'people',(select coalesce(jsonb_agg(value),'[]'::jsonb) from jsonb_array_elements(rows) with ordinality e(value,n) where n<=20),'hasMore',jsonb_array_length(rows)>20);
end $function$;


CREATE OR REPLACE FUNCTION lumo_private.approved_service(p_command text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid;session uuid;v_handle text;v_phone text;v_pin text;v_profile lumo_private.profiles%rowtype;
 snapshot lumo_private.approved_states%rowtype;prior lumo_private.approved_attempts%rowtype;
 g jsonb;b jsonb;i jsonb;j uuid;source uuid;destination uuid;own uuid;v_id text;v_revision bigint;v_balance bigint;
 posted jsonb:='[]'::jsonb;refs uuid[]:='{}';intent_ids jsonb:='[]';v_state jsonb;challenge lumo_private.approved_challenges%rowtype;
begin
 if (auth.jwt()->>'role') is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 if jsonb_typeof(p_payload) is distinct from 'object' then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 actor:=(p_payload->>'actor')::uuid;session:=(p_payload->>'session')::uuid;
 if not lumo_private.approved_live(actor,session) then return jsonb_build_object('ok',false,'code','SESSION_REVOKED');end if; perform lumo_private.approved_actor_context(actor,session);
 perform pg_advisory_xact_lock(hashtextextended(actor::text,4271));
 if p_command='provision' then
  if coalesce(p_payload->>'mode','') not in ('consumer','merchant') then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  v_handle:=p_payload->>'handle';v_phone:=nullif(p_payload->>'phone','');v_pin:=p_payload->>'pin';
  if v_handle !~ '^[a-z0-9][a-z0-9._-]{2,29}$' or length(p_payload->>'displayName') not between 1 and 80
   or (v_phone is not null and v_phone !~ '^0[0-9]{9}$') or v_pin !~ '^[0-9]{4,6}$'
   or not exists(select 1 from auth.users where id=actor and email=v_handle||'@pilot.lumo.invalid') then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  select * into v_profile from lumo_private.profiles where user_id=actor;
  if not found then
   insert into lumo_private.profiles(user_id,handle,display_name,pin_hash) values(actor,v_handle,p_payload->>'displayName',extensions.crypt(v_pin,extensions.gen_salt('bf',10)));
   insert into lumo_private.accounts(owner_user_id,kind) values(actor,'consumer');
  elsif v_profile.handle<>v_handle then return jsonb_build_object('ok',false,'code','ACCOUNT_UNAVAILABLE');else return jsonb_build_object('ok',false,'code','EXISTING_ACCOUNT');end if;
  insert into lumo_private.approved_profiles(user_id,phone,personal_account) values(actor,v_phone,p_payload->>'mode'='consumer') on conflict(user_id) do nothing;
  return lumo_private.approved_load(actor);
 end if;
 select * into v_profile from lumo_private.profiles where user_id=actor and status='active';
 if not found then return jsonb_build_object('ok',false,'code','ACCOUNT_REQUIRED');end if;
 if not exists(select 1 from lumo_private.accounts where owner_user_id=actor and kind='consumer' and status in('active','closed')) then return jsonb_build_object('ok',false,'code','ACCOUNT_UNAVAILABLE');end if;
 if exists(select 1 from lumo_private.accounts where owner_user_id=actor and kind='consumer' and status='closed') and p_command not in('load','attempt') then return jsonb_build_object('ok',false,'code','ACCOUNT_CLOSED');end if;
 if p_command='load' then return lumo_private.approved_load(actor);end if;
 if p_command='resolve' then
  v_handle:=lower(regexp_replace(p_payload->>'query','^@',''));v_phone:=regexp_replace(p_payload->>'query','[\s()-]','','g');v_phone:=regexp_replace(v_phone,'^\+233','0');
  return coalesce((select jsonb_build_object('ok',true,'recipient',jsonb_build_object('id',p.user_id,'userId',p.user_id,'handle',p.handle,'name',p.display_name,'phone',a.phone,'rail','lumo')) from lumo_private.profiles p join lumo_private.accounts ca on ca.owner_user_id=p.user_id and ca.kind='consumer' and ca.status='active' left join lumo_private.approved_profiles a on a.user_id=p.user_id where p.status='active' and lumo_private.personal_recipient(p.user_id) and (p.handle=v_handle or a.phone=v_phone or p.user_id::text=v_handle) limit 1),jsonb_build_object('ok',false,'code','RECIPIENT_NOT_FOUND'));
 end if;
 if p_command='partner.read' then
  return coalesce((select jsonb_build_object('ok',true,'row',jsonb_build_object('id',r.id,'ownerUserId',r.owner_user_id,'partnerUserId',r.partner_user_id,'revision',r.revision,'kind',r.kind,'state',r.state),'ownerState',s.state,'partners',(lumo_private.approved_load(r.owner_user_id))->'partners') from lumo_private.approved_partners r join lumo_private.approved_states s on s.user_id=r.owner_user_id where r.id=p_payload->>'id' and actor in(r.owner_user_id,r.partner_user_id)),jsonb_build_object('ok',false,'code','PARTNER_UNAVAILABLE'));
 end if;
 if p_command='partner.respond' then
  select revision into v_revision from lumo_private.approved_partners where id=p_payload->>'id' and partner_user_id=actor for update;
  if not found then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
  if v_revision<>(p_payload->>'expectedRevision')::bigint then return jsonb_build_object('ok',false,'code','REVISION_CONFLICT');end if;
  update lumo_private.approved_partners set state=p_payload->'state',revision=revision+1,updated_at=now() where id=p_payload->>'id' and partner_user_id=actor;
  return (select jsonb_build_object('ok',true,'row',jsonb_build_object('id',r.id,'ownerUserId',r.owner_user_id,'partnerUserId',r.partner_user_id,'revision',r.revision,'kind',r.kind,'state',r.state)) from lumo_private.approved_partners r where r.id=p_payload->>'id');
 end if;
 if p_command='attempt' then
  select * into prior from lumo_private.approved_attempts where user_id=actor and attempt_id=p_payload->>'attemptId';
  if found and prior.fingerprint<>p_payload->>'fingerprint' then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');end if;
  return jsonb_build_object('ok',true,'found',prior.attempt_id is not null,'result',prior.result,'snapshot',case when prior.attempt_id is not null then lumo_private.approved_load(actor) else null end);
 end if;
 if p_command='pin.change' then
  if not lumo_private.verify_pin(actor,p_payload->>'oldPin') then return jsonb_build_object('ok',false,'code','PIN_REQUIRED');end if;
  v_pin:=p_payload->>'newPin';if v_pin is null or v_pin !~ '^[0-9]{4}$' then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  update lumo_private.profiles set pin_hash=extensions.crypt(v_pin,extensions.gen_salt('bf',10)),pin_failures=0,pin_locked_until=null where user_id=actor;
  return jsonb_build_object('ok',true);
 end if;
 if p_command='verifyPin' then return jsonb_build_object('ok',lumo_private.verify_pin(actor,p_payload->>'pin'),'code','PIN_REQUIRED');end if;
 if p_command='device.register' then
  if not lumo_private.verify_pin(actor,p_payload->>'pin') then return jsonb_build_object('ok',false,'code','PIN_REQUIRED');end if;
  if length(p_payload->>'deviceId') not between 10 and 100 or length(p_payload->>'publicKey') not between 60 and 4096 or p_payload->>'algorithm' not in('ES256','RS256') then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  insert into lumo_private.approved_devices(id,user_id,session_id,public_key,algorithm) values(p_payload->>'deviceId',actor,session,p_payload->>'publicKey',p_payload->>'algorithm')
  on conflict(user_id,id) do update set public_key=excluded.public_key,algorithm=excluded.algorithm,session_id=excluded.session_id,revoked_at=null;
  return jsonb_build_object('ok',true);
 end if;
 if p_command='device.challenge' then
  if not exists(select 1 from lumo_private.approved_devices where id=p_payload->>'deviceId' and user_id=actor and revoked_at is null) then return jsonb_build_object('ok',false,'code','DEVICE_REQUIRED');end if;
  delete from lumo_private.approved_challenges where user_id=actor and expires_at<now()-interval '1 day';
  insert into lumo_private.approved_challenges(user_id,session_id,device_id,challenge,fingerprint,attempt_id) values(actor,session,p_payload->>'deviceId',p_payload->>'challenge',p_payload->>'fingerprint',p_payload->>'attemptId') returning * into challenge;
  return jsonb_build_object('ok',true,'challengeId',challenge.id,'challenge',challenge.challenge,'expiresAt',challenge.expires_at);
 end if;
 if p_command='device.get' then
  return coalesce((select jsonb_build_object('ok',true,'publicKey',d.public_key,'algorithm',d.algorithm,'challenge',c.challenge,'fingerprint',c.fingerprint,'attemptId',c.attempt_id)
   from lumo_private.approved_challenges c join lumo_private.approved_devices d on d.user_id=c.user_id and d.id=c.device_id
   where c.id=(p_payload->>'challengeId')::uuid and c.user_id=actor and c.session_id=session and c.device_id=p_payload->>'deviceId' and c.expires_at>clock_timestamp() and c.consumed_at is null and d.revoked_at is null),jsonb_build_object('ok',false,'code','DEVICE_PROOF_INVALID'));
 end if;
 if p_command<>'commit' then return jsonb_build_object('ok',false,'code','UNKNOWN_COMMAND');end if;
 if p_payload->>'attemptId' !~ '^[A-Za-z0-9_.:-]{10,100}$' or length(p_payload->>'fingerprint')<>64 or jsonb_typeof(p_payload->'state')<>'object' then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 select * into prior from lumo_private.approved_attempts where user_id=actor and attempt_id=p_payload->>'attemptId';
 if found then
  if prior.fingerprint<>p_payload->>'fingerprint' then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');end if;
  return prior.result||jsonb_build_object('replayed',true,'snapshot',lumo_private.approved_load(actor));
 end if;
 select * into snapshot from lumo_private.approved_states where user_id=actor for update;
 if coalesce(snapshot.revision,0)<>(p_payload->>'expectedRevision')::bigint then return jsonb_build_object('ok',false,'code','REVISION_CONFLICT');end if;
 if p_payload#>>'{state,account,status}'='closed' then
  perform 1 from lumo_private.approved_groups ag
   where ag.state->>'status' is distinct from 'closed' and (
    ag.state->>'creatorId'=actor::text
    or exists(select 1 from jsonb_array_elements(ag.state->'members') m where m->>'id'=actor::text and m->>'status'='active')
    or exists(select 1 from jsonb_array_elements(coalesce(ag.state->'contributions','[]'::jsonb)) c where c->>'memberId'=actor::text and c->>'status'='success' and coalesce((c->>'amount')::bigint,0)>coalesce((c->>'refundedAmount')::bigint,0)))
   order by ag.id for update;
  if found then return jsonb_build_object('ok',false,'code','CLOSURE_BLOCKED');end if;
 end if;
  -- Check every shared-group revision before any mutation. An absent record is revision zero.
 for g in select value from jsonb_array_elements(p_payload->'groups') order by value->>'id' loop
  select revision into v_revision from lumo_private.approved_groups where id=g->>'id' for update;
  if coalesce(v_revision,0)<>(g->>'expectedRevision')::bigint then return jsonb_build_object('ok',false,'code','REVISION_CONFLICT');end if;
  if not exists(select 1 from jsonb_array_elements(g->'state'->'members')m where m->>'id'=actor::text and m->>'status' in('active','invited')) then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 end loop;
 for i in select value from jsonb_array_elements(coalesce(p_payload->'requests','[]'::jsonb)) order by value->>'id' loop
  select revision into v_revision from lumo_private.approved_requests where id=i->>'id' for update;
  if coalesce(v_revision,0)<>(i->>'expectedRevision')::bigint then return jsonb_build_object('ok',false,'code','REVISION_CONFLICT');end if;
  if actor::text not in(i->>'senderUserId',i->>'recipientUserId') then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 end loop;
 for i in select value from jsonb_array_elements(coalesce(p_payload->'partners','[]'::jsonb)) order by value->>'id' loop
  select revision into v_revision from lumo_private.approved_partners where id=i->>'id' for update;
  if coalesce(v_revision,0)<>(i->>'expectedRevision')::bigint then return jsonb_build_object('ok',false,'code','REVISION_CONFLICT');end if;
  if i->>'ownerUserId'<>actor::text then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 end loop;
 if coalesce((p_payload->>'requiresAuth')::boolean,false) and not (p_payload ? 'verifiedChallengeId') and not lumo_private.verify_pin(actor,p_payload->>'pin') then return jsonb_build_object('ok',false,'code','PIN_REQUIRED');end if;
 begin
 -- Account locks use the shared ledger's universal UUID order. This includes every incoming recipient.
 select id into own from lumo_private.accounts where owner_user_id=actor and kind='consumer';refs:=array_append(refs,own);
 for b in select value from jsonb_array_elements(p_payload->'boxes') loop
  if not exists(select 1 from lumo_private.approved_boxes where id=b->>'id') then
   insert into lumo_private.accounts(owner_user_id,kind) values(actor,'money_box') returning id into destination;
   insert into lumo_private.approved_boxes(id,user_id,account_id) values(b->>'id',actor,destination);
  end if;
 end loop;
 for g in select value from jsonb_array_elements(p_payload->'groups') loop
  if not exists(select 1 from lumo_private.approved_groups where id=g->>'id') then
   insert into lumo_private.accounts(owner_user_id,kind) values(actor,'group') returning id into destination;
   insert into lumo_private.approved_groups(id,account_id,state) values(g->>'id',destination,g->'state');
  end if;
 end loop;
 for i in select value from jsonb_array_elements(p_payload->'intents') loop
  source:=lumo_private.approved_resolve_account(actor,i->'source');destination:=lumo_private.approved_resolve_account(actor,i->'destination');
  refs:=array_append(array_append(refs,source),destination);intent_ids:=intent_ids||jsonb_build_array(i||jsonb_build_object('sourceId',source,'destinationId',destination));
 end loop;
 select array_agg(distinct x) into refs from unnest(refs) x;
 perform 1 from lumo_private.accounts where id=any(refs) order by id for update;
 select balance into v_balance from lumo_private.accounts where id=own;
 if v_balance<>(p_payload->>'expectedWallet')::bigint then raise exception using errcode='P0001',message='REVISION_CONFLICT';end if;
 for b in select value from jsonb_array_elements(p_payload->'boxes') loop
  if (select a.balance from lumo_private.approved_boxes ab join lumo_private.accounts a on a.id=ab.account_id where ab.id=b->>'id' and ab.user_id=actor)<>(b->>'before')::bigint then raise exception using errcode='P0001',message='REVISION_CONFLICT';end if;
 end loop;
 if coalesce((p_payload->>'requiresAuth')::boolean,false) then
  if p_payload ? 'verifiedChallengeId' then
   update lumo_private.approved_challenges set consumed_at=clock_timestamp() where id=(p_payload->>'verifiedChallengeId')::uuid and user_id=actor and session_id=session and fingerprint=p_payload->>'fingerprint' and attempt_id=p_payload->>'attemptId' and expires_at>clock_timestamp() and consumed_at is null;
   if not found then raise exception using errcode='P0001',message='DEVICE_PROOF_INVALID';end if;
  end if;
 end if;
 -- This block rolls back ALL account creation, ledger and state updates on any error.
  for i in select value from jsonb_array_elements(intent_ids) loop
   if i->>'kind'='merchant_payment' then
    perform 1 from lumo_private.shops sh join lumo_private.merchants mer on mer.id=sh.merchant_id where sh.id=(i->>'shopId')::uuid and sh.accepting and mer.status='active' and mer.owner_user_id<>actor for share of sh,mer;
    if not found then raise exception using errcode='P0001',message='REQUEST_UNAVAILABLE';end if;
    if i ? 'requestId' and i->>'requestId' is not null then
     perform 1 from lumo_private.payment_requests where id=(i->>'requestId')::uuid and shop_id=(i->>'shopId')::uuid and amount=(i->>'amount')::bigint and status='open' and expires_at>clock_timestamp() for update;
     if not found then raise exception using errcode='P0001',message='REQUEST_UNAVAILABLE';end if;
    end if;
   end if;
   if i->>'kind'='merchant_payment' and i#>>'{metadata,merchantAccessApproved}'='true' then perform set_config('lumo.approved.merchant_shop',i->>'shopId',true);end if; j:=lumo_private.post_money(actor,i->>'kind',(i->>'amount')::bigint,(i->>'sourceId')::uuid,(i->>'destinationId')::uuid,nullif(i->>'shopId','')::uuid,nullif(i->>'requestId','')::uuid,nullif(i->>'originalPaymentId','')::uuid);
   insert into lumo_private.approved_postings(journal_id,user_id,transaction_id,group_id,box_id,metadata) values(j,actor,i->>'transactionId',i->>'groupId',i->>'boxId',coalesce(i->'metadata','{}'::jsonb));
   posted:=posted||jsonb_build_array(lumo_private.receipt_json(j)||jsonb_build_object('transactionId',i->>'transactionId','approvedGroupId',i->>'groupId','approvedBoxId',i->>'boxId'));
   if i ? 'requestId' and i->>'requestId' is not null then
    update lumo_private.payment_requests set status='paid',paid_journal_id=j where id=(i->>'requestId')::uuid and status='open' and expires_at>clock_timestamp();
    if not found then raise exception using errcode='P0001',message='REQUEST_UNAVAILABLE';end if;
   end if;
  end loop;
  if (select balance from lumo_private.accounts where id=own)<>(p_payload->'state'->>'wallet')::bigint then raise exception using errcode='P0001',message='UNBACKED_STATE';end if;
  for b in select value from jsonb_array_elements(p_payload->'boxes') loop
   if (select a.balance from lumo_private.approved_boxes ab join lumo_private.accounts a on a.id=ab.account_id where ab.id=b->>'id' and ab.user_id=actor)<>(b->>'after')::bigint then raise exception using errcode='P0001',message='UNBACKED_STATE';end if;
  end loop;
  for g in select value from jsonb_array_elements(p_payload->'groups') loop
   if (select a.balance from lumo_private.approved_groups ag join lumo_private.accounts a on a.id=ag.account_id where ag.id=g->>'id')<>(g->'state'->>'balance')::bigint then raise exception using errcode='P0001',message='UNBACKED_STATE';end if;
   perform lumo_private.approved_archive_group_reports(g->>'id',g->'state');
   update lumo_private.approved_groups set state=case when jsonb_typeof(g#>'{state,chat}')='object' then jsonb_set(g->'state','{chat,reports}','[]'::jsonb) else g->'state' end,revision=(g->>'expectedRevision')::bigint+1,updated_at=now() where id=g->>'id';
  end loop;
  for i in select value from jsonb_array_elements(coalesce(p_payload->'requests','[]'::jsonb)) loop
   insert into lumo_private.approved_requests(id,sender_user_id,recipient_user_id,revision,state) values(i->>'id',(i->>'senderUserId')::uuid,(i->>'recipientUserId')::uuid,(i->>'expectedRevision')::bigint+1,i->'state')
   on conflict(id) do update set state=excluded.state,revision=excluded.revision;
  end loop;
  update lumo_private.approved_requests r set state=jsonb_set(r.state,'{ledgerJournalId}',to_jsonb(ap.journal_id::text)) from lumo_private.approved_postings ap where ap.user_id=actor and ap.metadata->>'personalRequestId'=r.id and ap.journal_id in(select (value->>'id')::uuid from jsonb_array_elements(posted));
  for i in select value from jsonb_array_elements(coalesce(p_payload->'partners','[]'::jsonb)) loop
   insert into lumo_private.approved_partners(id,owner_user_id,partner_user_id,revision,kind,state) values(i->>'id',(i->>'ownerUserId')::uuid,(i->>'partnerUserId')::uuid,(i->>'expectedRevision')::bigint+1,i->>'kind',i->'state')
   on conflict(id) do update set state=excluded.state,revision=excluded.revision,updated_at=now();
  end loop;
  if jsonb_typeof(p_payload->'profileChange')='object' then
   update lumo_private.profiles set display_name=p_payload->'profileChange'->>'name' where user_id=actor;
   insert into lumo_private.approved_profiles(user_id,phone) values(actor,nullif(p_payload->'profileChange'->>'phone','')) on conflict(user_id) do update set phone=excluded.phone;
  end if;
  v_state:=p_payload->'state';v_state:=jsonb_set(v_state,'{groups}','[]'::jsonb);v_state:=v_state#-'{settings,pin}';
  -- Closure and incoming postings serialize on the same ledger account row.
  -- A concurrent incoming posting changes expectedWallet and forces a fresh checklist.
  if v_state#>>'{account,status}'='closed' then
   if not coalesce((p_payload->>'requiresAuth')::boolean,false) then raise exception using errcode='P0001',message='PIN_REQUIRED';end if;
   if (select balance from lumo_private.accounts where id=own)<>0
     or exists(select 1 from lumo_private.approved_boxes ab join lumo_private.accounts ba on ba.id=ab.account_id where ab.user_id=actor and ba.balance<>0)
     or jsonb_array_length(coalesce(p_payload->'intents','[]'::jsonb))<>0 then raise exception using errcode='P0001',message='CLOSURE_BLOCKED';end if;
   update lumo_private.accounts set status='closed' where id=own and kind='consumer';
  end if;
  -- Report details never enter the shared group envelope or mutation result.
  for i in select value from jsonb_array_elements(coalesce(p_payload->'privateReports','[]'::jsonb)) loop
   if i->>'reporterId' is distinct from actor::text or length(i->>'reason') not between 1 and 500
    or not exists(select 1 from lumo_private.approved_groups ag where ag.id=i->>'groupId'
     and exists(select 1 from jsonb_array_elements(ag.state->'members') m where m->>'id'=actor::text and m->>'status'='active')
     and exists(select 1 from jsonb_array_elements(coalesce(ag.state#>'{chat,messages}','[]'::jsonb)) msg where msg->>'id'=i->>'messageId' and msg->>'senderId'<>actor::text and msg->>'status'='sent' and nullif(msg->>'deletedAt','') is null))
    then raise exception using errcode='P0001',message='REPORT_UNAVAILABLE';end if;
   insert into lumo_private.approved_group_reports(id,group_id,reporter_user_id,message_id,reason,created_at,payload)
    values(i->>'id',i->>'groupId',actor,i->>'messageId',i->>'reason',coalesce(nullif(i->>'at','')::timestamptz,now()),i)
    on conflict(group_id,reporter_user_id,message_id) do nothing;
  end loop;

  if p_payload->'pinChange' is not null and p_payload->'pinChange'<>'null'::jsonb then
   v_pin:=p_payload->>'pinChange';if v_pin !~ '^[0-9]{4,6}$' then raise exception using errcode='P0001',message='INVALID_INPUT';end if;
   update lumo_private.profiles set pin_hash=extensions.crypt(v_pin,extensions.gen_salt('bf',10)),pin_failures=0,pin_locked_until=null where user_id=actor;
  end if;
  insert into lumo_private.approved_states(user_id,revision,state) values(actor,coalesce(snapshot.revision,0)+1,v_state)
  on conflict(user_id) do update set revision=excluded.revision,state=excluded.state,updated_at=now();
  insert into lumo_private.approved_attempts(user_id,attempt_id,fingerprint,result) values(actor,p_payload->>'attemptId',p_payload->>'fingerprint',jsonb_build_object('ok',true,'result',p_payload->'result','receipts',posted,'revision',coalesce(snapshot.revision,0)+1));
 exception when others then
  return jsonb_build_object('ok',false,'code',case when sqlstate='P0001' then sqlerrm else 'COMMIT_FAILED' end);
 end;
 return jsonb_build_object('ok',true,'result',p_payload->'result','receipts',posted,'snapshot',lumo_private.approved_load(actor));
exception when unique_violation then return jsonb_build_object('ok',false,'code','ALIAS_UNAVAILABLE');
 when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('ok',false,'code','INVALID_INPUT');
end $function$;


CREATE OR REPLACE FUNCTION lumo_private.pilot_bootstrap(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_handle text; ip_hash text; handle_hash text; global_hash text:=encode(extensions.digest('lumo-pilot-auth-global','sha256'),'hex');
 registration lumo_private.pilot_registrations%rowtype; auth_user uuid; profile_user uuid; supplied_user uuid; supplied_registration uuid; mode text;
begin
 -- Bootstrap is deliberately a service operation, not a user command. Its trusted JWT role is
 -- checked in addition to SQL EXECUTE grants. User-editable metadata never grants this role.
 if (auth.jwt()->>'role') is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or jsonb_typeof(p_payload->'handle') is distinct from 'string' then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 v_handle:=p_payload->>'handle';if v_handle !~ '^[a-z0-9][a-z0-9._-]{2,29}$' then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 if p_action not in ('login.check','register.reserve','register.bind','register.complete','register.abort') or p_action is null then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 -- One short-lived global lock makes limit consumption and handle reservation atomic.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lumo-pilot-auth-bootstrap',7469));
 if p_action in ('login.check','register.reserve') then
  if jsonb_typeof(p_payload->'ipHash') is distinct from 'string' or (p_payload->>'ipHash') !~ '^[a-f0-9]{64}$' then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  ip_hash:=p_payload->>'ipHash';handle_hash:=encode(extensions.digest(v_handle,'sha256'),'hex');
  delete from lumo_private.pilot_auth_rates where window_start<clock_timestamp()-interval '2 days';
  -- The global ceiling remains authoritative even when a client IP cannot be reliably identified.
  if not lumo_private.pilot_rate_take('all.global',global_hash,900,2000) then return jsonb_build_object('ok',false,'code','RATE_LIMITED');end if;
  -- Registration resume also checks a password; both routes share this account quota.
  if not lumo_private.pilot_rate_take('credential.handle',handle_hash,900,15) then return jsonb_build_object('ok',false,'code','RATE_LIMITED');end if;
  if p_action='login.check' then
   if not lumo_private.pilot_rate_take('login.ip',ip_hash,900,60) then return jsonb_build_object('ok',false,'code','RATE_LIMITED');end if;
   return jsonb_build_object('ok',true);
  end if;
  if not lumo_private.pilot_rate_take('register.ip',ip_hash,3600,50) or not lumo_private.pilot_rate_take('register.global',global_hash,3600,500) then return jsonb_build_object('ok',false,'code','RATE_LIMITED');end if;
  select u.id into auth_user from auth.users u where u.email=v_handle||'@pilot.lumo.invalid' and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()) and not coalesce(u.is_anonymous,false);
  select p.user_id into profile_user from lumo_private.profiles p where p.handle=v_handle;
  if profile_user is not null and profile_user is distinct from auth_user then return jsonb_build_object('ok',false,'code','HANDLE_TAKEN');end if;
  if profile_user is not null then return jsonb_build_object('ok',false,'code','HANDLE_TAKEN');end if;
  select * into registration from lumo_private.pilot_registrations r where r.handle=v_handle for update;
  if auth_user is null and registration.handle is not null and registration.expires_at>clock_timestamp() then return jsonb_build_object('ok',false,'code','REGISTRATION_PENDING');end if;
  if auth_user is null and (select count(*) from lumo_private.pilot_registrations where state='complete' or expires_at>clock_timestamp())>=1000 then return jsonb_build_object('ok',false,'code','RATE_LIMITED');end if;
  mode:=case when auth_user is null then 'new' else 'resume' end;
  insert into lumo_private.pilot_registrations(handle,user_id,state) values(v_handle,auth_user,case when profile_user=auth_user then 'complete' when auth_user is not null then 'provisioned' else 'reserved' end)
  on conflict(handle) do update set registration_id=case when pilot_registrations.user_id=excluded.user_id and pilot_registrations.expires_at>clock_timestamp() then pilot_registrations.registration_id else gen_random_uuid() end,user_id=excluded.user_id,state=excluded.state,expires_at=clock_timestamp()+interval '5 minutes'
  returning * into registration;
  return jsonb_build_object('ok',true,'registrationId',registration.registration_id,'mode',mode);
 end if;
 begin
  if jsonb_typeof(p_payload->'registrationId') is distinct from 'string' then raise invalid_text_representation;end if;
  supplied_registration:=(p_payload->>'registrationId')::uuid;
  if p_action<>'register.abort' then
   if jsonb_typeof(p_payload->'userId') is distinct from 'string' then raise invalid_text_representation;end if;
   supplied_user:=(p_payload->>'userId')::uuid;
  end if;
 exception when invalid_text_representation then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end;
 select * into registration from lumo_private.pilot_registrations r where r.handle=v_handle and r.registration_id=supplied_registration for update;
 if not found then return jsonb_build_object('ok',false,'code','RESERVATION_CHANGED');end if;
 select u.id into auth_user from auth.users u where u.email=v_handle||'@pilot.lumo.invalid' and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()) and not coalesce(u.is_anonymous,false);
 if p_action='register.abort' then
  if auth_user is null and not exists(select 1 from lumo_private.profiles p where p.handle=v_handle) then delete from lumo_private.pilot_registrations where handle=v_handle;end if;
  return jsonb_build_object('ok',true,'identityPresent',auth_user is not null);
 end if;
 if auth_user is distinct from supplied_user or registration.user_id is not null and registration.user_id<>supplied_user then return jsonb_build_object('ok',false,'code','RESERVATION_CHANGED');end if;
 if p_action='register.bind' then
  if registration.expires_at<=clock_timestamp() then return jsonb_build_object('ok',false,'code','RESERVATION_EXPIRED');end if;
  update lumo_private.pilot_registrations set user_id=supplied_user,state=case when state='complete' then state else 'provisioned' end where handle=v_handle;
 elsif p_action='register.complete' then
  if not exists(select 1 from lumo_private.profiles p join lumo_private.accounts a on a.owner_user_id=p.user_id and a.kind='consumer' where p.user_id=supplied_user and p.handle=v_handle) then return jsonb_build_object('ok',false,'code','ACCOUNT_REQUIRED');end if;
  update lumo_private.pilot_registrations set user_id=supplied_user,state='complete' where handle=v_handle;
 end if;
 return jsonb_build_object('ok',true);
end $function$;



CREATE OR REPLACE FUNCTION lumo_private.post_money(actor uuid, kind text, amount bigint, source uuid, destination uuid, shop uuid DEFAULT NULL::uuid, request uuid DEFAULT NULL::uuid, original uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare j uuid; source_balance bigint; source_kind text; dest_balance bigint; closed_group jsonb;
begin
 -- Target-only eligibility for new personal payments. Existing source wallets,
 -- history, outgoing recovery and original refunds/returns remain unchanged.
 if kind in ('transfer','iou_payment','group_payout') and exists(
  select 1 from lumo_private.accounts a where a.id=destination and a.kind='consumer'
   and not lumo_private.personal_recipient(a.owner_user_id)
 ) then raise exception using errcode='P0001',message='RECIPIENT_NOT_FOUND';end if;
 -- Refunds to a closed collection are accepted only while a creator can return
 -- them to every original remaining source. Otherwise reject before debiting the merchant.
 if kind='refund' then
  select ag.state into closed_group from lumo_private.approved_groups ag where ag.account_id=destination and ag.state->>'status'='closed' for share;
  if found then
   if not exists(select 1 from jsonb_array_elements(closed_group->'members') member
     join lumo_private.accounts ca on ca.owner_user_id::text=member->>'id' and ca.kind='consumer' and ca.status='active'
     join lumo_private.profiles cp on cp.user_id=ca.owner_user_id and cp.status='active'
     where member->>'id'=closed_group->>'creatorId' and member->>'status'='active')
    or exists(select 1 from jsonb_array_elements(coalesce(closed_group->'contributions','[]'::jsonb)) c
     where c->>'status'='success' and coalesce((c->>'amount')::bigint,0)>coalesce((c->>'refundedAmount')::bigint,0)
     and not exists(select 1 from lumo_private.accounts ca join lumo_private.profiles cp on cp.user_id=ca.owner_user_id and cp.status='active'
      where ca.owner_user_id::text=c->>'memberId' and ca.kind='consumer' and ca.status='active'))
    or coalesce((select sum(greatest(0,coalesce((c->>'amount')::bigint,0)-coalesce((c->>'refundedAmount')::bigint,0)))
      from jsonb_array_elements(coalesce(closed_group->'contributions','[]'::jsonb)) c where c->>'status'='success'),0)<post_money.amount
   then raise exception using errcode='P0001',message='REFUND_DESTINATION_UNAVAILABLE';end if;
  end if;
 end if;
 -- Every caller takes the same account lock order, including opposite-direction transfers.
 perform 1 from lumo_private.accounts where id in (source,destination) order by id for update;
 if kind='merchant_payment' and request is not null and not exists (
  select 1 from lumo_private.payment_requests r where r.id=request and r.shop_id=shop and r.status='open' and r.expires_at>clock_timestamp() and r.amount=post_money.amount
 ) then raise exception using errcode='P0001',message='REQUEST_UNAVAILABLE';end if;
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
end $function$;


CREATE OR REPLACE FUNCTION lumo_private.approved_merchant_legacy_boundary(p_command text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target_shop uuid;account_check jsonb;target_user uuid;
begin
 if p_command in ('recipient.lookup','transfer') then
  account_check:=lumo_private.pilot_command('account.get','{}'::jsonb);
  if account_check->>'ok' is distinct from 'true' then return account_check;end if;
  select p.user_id into target_user from lumo_private.profiles p where p.handle=lower(trim(regexp_replace(coalesce(case when p_command='transfer' then p_payload->>'recipientHandle' else p_payload->>'handle' end,''),'^@',''))) and p.status='active';
  if target_user is not null and not lumo_private.personal_recipient(target_user) then return lumo_private.failure('RECIPIENT_NOT_FOUND','Choose a personal Lumo account. Merchant staff logins cannot receive personal payments.',false);end if;
  return null;
 end if;
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
end $function$;

