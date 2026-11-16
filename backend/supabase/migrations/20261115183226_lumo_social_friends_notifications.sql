-- Private saved recipients and an in-app feed over authoritative existing records.
-- This migration never sends invitations, posts money, or changes payment state.
create table lumo_private.social_friends(
 owner_id uuid not null references auth.users(id), recipient_id uuid not null references auth.users(id),
 list_name text not null check(list_name in('Circle','Crew','Lumo Squad','Study Buddies')),
 revision bigint not null default 1 check(revision>0), removed boolean not null default false,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,recipient_id),check(owner_id<>recipient_id)
);
create table lumo_private.social_mutations(
 owner_id uuid not null references auth.users(id),request_id uuid not null,payload jsonb not null,response jsonb not null,
 created_at timestamptz not null default clock_timestamp(),primary key(owner_id,request_id)
);
create index social_mutations_owner_time on lumo_private.social_mutations(owner_id,created_at);
create table lumo_private.social_notification_reads(
 owner_id uuid not null references auth.users(id),notification_id text not null check(length(notification_id) between 1 and 240),
 read_at timestamptz not null default clock_timestamp(),primary key(owner_id,notification_id)
);
alter table lumo_private.social_friends enable row level security;
alter table lumo_private.social_mutations enable row level security;
alter table lumo_private.social_notification_reads enable row level security;
revoke all on lumo_private.social_friends,lumo_private.social_mutations,lumo_private.social_notification_reads from public,anon,authenticated,service_role;
comment on table lumo_private.social_friends is 'Owner-only saved recipient lists. No mutual friendship, invitations, presence or financial activity is published.';

create function lumo_private.social_friend_json(f lumo_private.social_friends) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',f.recipient_id,'userId',f.recipient_id,'handle',case when lumo_private.personal_recipient(f.recipient_id) then p.handle else '' end,
  'name',case when lumo_private.personal_recipient(f.recipient_id) then p.display_name else 'Unavailable Lumo account' end,'rail','lumo','listName',f.list_name,
  'available',lumo_private.personal_recipient(f.recipient_id),'revision',f.revision)
 from (values(1)) seed(n) left join lumo_private.profiles p on p.user_id=f.recipient_id
$$;

create function lumo_private.social_notification_feed(p_actor uuid) returns table(id text,kind text,title text,body text,created_at timestamptz,read_at timestamptz,target jsonb) language sql stable set search_path='' as $$
 with raw as(
  select 'payment:'||j.id::text id,'payment'::text kind,
   case when j.type='refund' then 'Refund recorded' when a.id=j.payee_account_id then 'Money received' else 'Payment recorded' end title,
   'Open your activity to see the receipt and details.'::text body,j.created_at,null::timestamptz source_read_at,
   jsonb_build_object('kind','activity','id',coalesce(ap.transaction_id,j.id::text),'reference',j.reference) target
  from lumo_private.accounts a join lumo_private.journals j on(j.payer_account_id=a.id or j.payee_account_id=a.id)
  left join lateral(select p.transaction_id from lumo_private.approved_postings p where p.journal_id=j.id and p.user_id=p_actor limit 1)ap on true
  where a.owner_user_id=p_actor and a.kind='consumer' and j.type in('transfer','merchant_payment','refund','test_funding')
  union all
  select 'partner:'||p.id||':'||p.revision::text,'partner',
   case when p.owner_user_id=p_actor then 'Accountability partner update' else 'Accountability request' end,
   case when p.owner_user_id=p_actor then 'Your Money Box partner request has an update. Open it to see the current status.' else 'Open this request to review the role or action before you respond.' end,
   p.updated_at,null::timestamptz,jsonb_build_object('kind','partner','id',p.id,'role',case when p.owner_user_id=p_actor then 'owner' else 'partner' end,'boxId',p.state->>'boxId')
  from lumo_private.approved_partners p where p_actor in(p.owner_user_id,p.partner_user_id)
  union all
  select 'support:'||n.id::text,'support',n.title,n.body,n.created_at,n.read_at,
   jsonb_build_object('kind','support','id',n.case_id,'reference',c.reference)
  from lumo_private.case_notifications n join lumo_private.admin_cases c on c.id=n.case_id
  where n.audience='consumer' and n.recipient_id=p_actor and lumo_private.case_notification_access(n,p_actor)
 )
 select r.id,r.kind,left(coalesce(nullif(r.title,''),'Lumo update'),120),left(coalesce(nullif(r.body,''),'Open this update for details.'),600),r.created_at,coalesce(r.source_read_at,s.read_at),jsonb_strip_nulls(r.target) from raw r
 left join lumo_private.social_notification_reads s on s.owner_id=p_actor and s.notification_id=r.id
$$;

create function public.lumo_social(p_command text,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;sid uuid;recipient uuid;req uuid;rev bigint;label text;f lumo_private.social_friends%rowtype;m lumo_private.social_mutations%rowtype;
 saved jsonb;canonical jsonb;items jsonb;pg integer;ps integer;total bigint;unread bigint;ident text;seen timestamptz;n record;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>4096 then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 actor:=(p_payload->>'actor')::uuid;sid:=(p_payload->>'session')::uuid;
 if actor is null or sid is null or not exists(select 1 from auth.sessions se join auth.users u on u.id=se.user_id where se.id=sid and se.user_id=actor and (se.not_after is null or se.not_after>clock_timestamp()) and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()) and not coalesce(u.is_anonymous,false)) then return jsonb_build_object('ok',false,'code','SESSION_REVOKED');end if;
 if not lumo_private.personal_recipient(actor) then return jsonb_build_object('ok',false,'code','ACCOUNT_REQUIRED');end if;
 if p_command='friends.list' then
  select coalesce(jsonb_agg(lumo_private.social_friend_json(x) order by x.list_name,x.updated_at desc,x.recipient_id),'[]'::jsonb) into items from lumo_private.social_friends x where x.owner_id=actor and not x.removed;
  return jsonb_build_object('ok',true,'data',jsonb_build_object('friends',items,'limit',200));
 end if;
 if p_command in('friends.save','friends.remove') then
  if exists(select 1 from jsonb_object_keys(p_payload) k where k not in('actor','session','recipientId','requestId','revision','listName')) then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  recipient:=(p_payload->>'recipientId')::uuid;req:=(p_payload->>'requestId')::uuid;rev:=(p_payload->>'revision')::bigint;label:=p_payload->>'listName';
  if recipient is null or req is null or (p_payload ? 'revision' and (rev is null or rev<1 or rev>9007199254740991)) or (p_command='friends.save' and (label is null or label not in('Circle','Crew','Lumo Squad','Study Buddies'))) or (p_command='friends.remove' and (rev is null or p_payload ? 'listName')) then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  if recipient=actor then return jsonb_build_object('ok',false,'code','SELF_FRIEND');end if;
  canonical:=(p_payload-'actor'-'session'-'requestId')||jsonb_build_object('command',p_command);
  perform pg_advisory_xact_lock(hashtextextended(actor::text,21106));
  select * into m from lumo_private.social_mutations where owner_id=actor and request_id=req;
  if found then
   if m.payload is distinct from canonical then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');end if;
   return jsonb_build_object('ok',true,'data',m.response||jsonb_build_object('duplicate',true));
  end if;
  if (select count(*) from lumo_private.social_mutations where owner_id=actor and created_at>clock_timestamp()-interval '1 hour')>=100 then return jsonb_build_object('ok',false,'code','RATE_LIMITED');end if;
  select * into f from lumo_private.social_friends where owner_id=actor and recipient_id=recipient for update;
  if p_command='friends.remove' then
   if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND');end if;
   if f.revision<>rev then return jsonb_build_object('ok',false,'code','REVISION_CONFLICT');end if;
   update lumo_private.social_friends set removed=true,revision=revision+1,updated_at=clock_timestamp() where owner_id=actor and recipient_id=recipient;
   saved:=jsonb_build_object('record',null,'removed',true,'duplicate',false);
  else
   if not lumo_private.personal_recipient(recipient) then return jsonb_build_object('ok',false,'code','RECIPIENT_NOT_FOUND');end if;
   if (f.recipient_id is null and rev is not null) or (f.recipient_id is not null and not f.removed and rev is distinct from f.revision) or (f.removed and rev is not null and rev<>f.revision) then return jsonb_build_object('ok',false,'code','REVISION_CONFLICT');end if;
   if (f.recipient_id is null or f.removed) and (select count(*) from lumo_private.social_friends where owner_id=actor and not removed)>=200 then return jsonb_build_object('ok',false,'code','FRIEND_LIMIT');end if;
   insert into lumo_private.social_friends(owner_id,recipient_id,list_name) values(actor,recipient,label)
    on conflict(owner_id,recipient_id) do update set list_name=excluded.list_name,removed=false,revision=social_friends.revision+1,updated_at=clock_timestamp()
    returning * into f;
   saved:=jsonb_build_object('record',lumo_private.social_friend_json(f),'duplicate',false);
  end if;
  insert into lumo_private.social_mutations(owner_id,request_id,payload,response) values(actor,req,canonical,saved);
  return jsonb_build_object('ok',true,'data',saved);
 end if;
 if p_command='notifications.list' then
  pg:=coalesce((p_payload->>'page')::integer,1);ps:=coalesce((p_payload->>'pageSize')::integer,30);
  if pg<1 or pg>10000 or ps<1 or ps>50 then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  with feed as materialized(select * from lumo_private.social_notification_feed(actor)),paged as(select * from feed order by created_at desc,id limit ps offset (pg-1)*ps)
  select (select count(*) from feed),(select count(*) from feed where read_at is null),(select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'title',title,'body',body,'createdAt',created_at,'readAt',read_at,'target',target) order by created_at desc,id),'[]'::jsonb) from paged) into total,unread,items;
  return jsonb_build_object('ok',true,'data',jsonb_build_object('notifications',items,'unreadCount',unread,'total',total,'page',pg,'pageSize',ps,'hasMore',total>pg::bigint*ps));
 end if;
 if p_command='notifications.read' then
  ident:=p_payload->>'notificationId';if ident is null or ident !~ '^(payment|partner|support):[A-Za-z0-9_.:-]{1,220}$' then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  select * into n from lumo_private.social_notification_feed(actor) where id=ident;
  if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND');end if;
  insert into lumo_private.social_notification_reads(owner_id,notification_id,read_at) values(actor,ident,coalesce(n.read_at,clock_timestamp())) on conflict(owner_id,notification_id) do nothing;
  select read_at into seen from lumo_private.social_notification_reads where owner_id=actor and notification_id=ident;
  if n.kind='support' then update lumo_private.case_notifications set read_at=coalesce(read_at,seen) where 'support:'||id::text=ident and audience='consumer' and recipient_id=actor;end if;
  return jsonb_build_object('ok',true,'data',jsonb_build_object('id',ident,'readAt',seen));
 end if;
 return jsonb_build_object('ok',false,'code','INVALID_INPUT');
exception when invalid_text_representation or numeric_value_out_of_range or not_null_violation or check_violation then
 return jsonb_build_object('ok',false,'code','INVALID_INPUT');
end $$;
revoke all on function lumo_private.social_friend_json(lumo_private.social_friends),lumo_private.social_notification_feed(uuid),public.lumo_social(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.lumo_social(text,jsonb) to service_role;

