-- Private, owner-named recipient groups. No financial/shared-group behavior changes.
-- Existing list_name values remain only as the installed 2.11.6 wire projection.
create function lumo_private.social_group_name(p_name text) returns text
language plpgsql immutable strict set search_path='' as $$
declare name text;point integer;position integer;
 trim_chars constant text:=U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
begin
 name:=pg_catalog.normalize(btrim(p_name,trim_chars),'NFC');
 if char_length(name) not between 1 and 40 or btrim(translate(name,U&'\200C\200D',''),trim_chars)='' then return null;end if;
 -- Unicode Cc/Cf/Cs/Zl/Zp except language/emoji joiners U+200C/U+200D.
 for position in 1..char_length(name) loop
  point:=ascii(substr(name,position,1));
  if point between 0 and 31 or point between 127 and 159 or point=173
   or point between 1536 and 1541 or point in(1564,1757,1807,2274,6158)
   or point between 2192 and 2193 or point=8203 or point between 8206 and 8207
   or point between 8232 and 8238 or point between 8288 and 8292 or point between 8294 and 8303
   or point between 55296 and 57343 or point=65279 or point between 65529 and 65531
   or point in(69821,69837) or point between 78896 and 78911 or point between 113824 and 113827
   or point between 119155 and 119162 or point=917505 or point between 917536 and 917631
  then return null;end if;
 end loop;
 return name;
end $$;

create table lumo_private.social_friend_groups(
 owner_id uuid not null references auth.users(id),id uuid not null default gen_random_uuid(),
 name text not null check(lumo_private.social_group_name(name) is not null and name=lumo_private.social_group_name(name)),
 revision bigint not null default 1 check(revision between 1 and 9007199254740991),
 deleted boolean not null default false,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,id)
);
create unique index social_friend_groups_active_name on lumo_private.social_friend_groups(owner_id,lower(name)) where not deleted;
create table lumo_private.social_legacy_group_labels(
 owner_id uuid not null,label text not null check(label in('Circle','Crew','Lumo Squad','Study Buddies')),group_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),primary key(owner_id,label),
 foreign key(owner_id,group_id) references lumo_private.social_friend_groups(owner_id,id)
);
create index social_legacy_group_labels_group on lumo_private.social_legacy_group_labels(owner_id,group_id);
alter table lumo_private.social_friends add column group_id uuid;
alter table lumo_private.social_friends add constraint social_friends_owned_group foreign key(owner_id,group_id) references lumo_private.social_friend_groups(owner_id,id);
create index social_friends_owner_group on lumo_private.social_friends(owner_id,group_id) where group_id is not null;
alter table lumo_private.social_friend_groups enable row level security;
alter table lumo_private.social_legacy_group_labels enable row level security;
revoke all on lumo_private.social_friend_groups,lumo_private.social_legacy_group_labels from public,anon,authenticated,service_role;

-- Backfill only used labels, preserving active saved friends and their revisions.
insert into lumo_private.social_friend_groups(owner_id,name)
 select distinct owner_id,list_name from lumo_private.social_friends where not removed;
insert into lumo_private.social_legacy_group_labels(owner_id,label,group_id)
 select owner_id,name,id from lumo_private.social_friend_groups;
update lumo_private.social_friends f set group_id=g.id
 from lumo_private.social_friend_groups g where g.owner_id=f.owner_id and g.name=f.list_name and not f.removed;
comment on table lumo_private.social_friend_groups is 'Private saved-recipient groups belonging to one consumer. Deletes retain tombstones and detach friends. Not shared financial groups.';
comment on table lumo_private.social_legacy_group_labels is 'Permanent v1 label-to-group bindings, retained after rename/deletion so installed apps cannot resurrect deleted groups.';
comment on column lumo_private.social_friends.list_name is 'Historical fixed-label projection for 2.11.6 clients only. Current custom membership uses group_id.';

create function lumo_private.social_friend_json_v2(f lumo_private.social_friends) returns jsonb
language sql stable set search_path='' as $$
 select lumo_private.social_friend_json(f)||jsonb_build_object('groupId',g.id,'listName',g.name)
 from (values(1)) seed(n) left join lumo_private.social_friend_groups g on g.owner_id=f.owner_id and g.id=f.group_id and not g.deleted
$$;

create or replace function public.lumo_social(p_command text,p_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid;sid uuid;recipient uuid;req uuid;rev bigint;legacy_label text;gid uuid;new_name text;v2 boolean;
 f lumo_private.social_friends%rowtype;m lumo_private.social_mutations%rowtype;g lumo_private.social_friend_groups%rowtype;
 saved jsonb;canonical jsonb;items jsonb;group_items jsonb;pg integer;ps integer;total bigint;unread bigint;ident text;seen timestamptz;n record;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>4096 then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 actor:=(p_payload->>'actor')::uuid;sid:=(p_payload->>'session')::uuid;
 if actor is null or sid is null or not exists(select 1 from auth.sessions se join auth.users u on u.id=se.user_id where se.id=sid and se.user_id=actor and (se.not_after is null or se.not_after>clock_timestamp()) and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()) and not coalesce(u.is_anonymous,false)) then return jsonb_build_object('ok',false,'code','SESSION_REVOKED');end if;
 if not lumo_private.personal_recipient(actor) then return jsonb_build_object('ok',false,'code','ACCOUNT_REQUIRED');end if;
 v2:=coalesce(p_payload->'schemaVersion'='2'::jsonb,false);
 if p_payload ? 'schemaVersion' and (not v2 or p_command not like 'friends.%') then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;

 if p_command='friends.list' then
  if exists(select 1 from jsonb_object_keys(p_payload) k where k not in('actor','session','schemaVersion')) then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  if v2 then
   -- Both arrays use one statement snapshot, including current names and membership.
   select
    (select coalesce(jsonb_agg(lumo_private.social_friend_json_v2(x) order by coalesce(gr.name,''),x.updated_at desc,x.recipient_id),'[]'::jsonb)
     from lumo_private.social_friends x left join lumo_private.social_friend_groups gr on gr.owner_id=x.owner_id and gr.id=x.group_id and not gr.deleted where x.owner_id=actor and not x.removed),
    (select coalesce(jsonb_agg(jsonb_build_object('id',gr.id,'name',gr.name,'revision',gr.revision) order by lower(gr.name),gr.id),'[]'::jsonb) from lumo_private.social_friend_groups gr where gr.owner_id=actor and not gr.deleted)
   into items,group_items;
   return jsonb_build_object('ok',true,'data',jsonb_build_object('schemaVersion',2,'friends',items,'groups',group_items,'limit',200,'groupLimit',50));
  end if;
  select coalesce(jsonb_agg(lumo_private.social_friend_json(x) order by x.list_name,x.updated_at desc,x.recipient_id),'[]'::jsonb) into items from lumo_private.social_friends x where x.owner_id=actor and not x.removed;
  return jsonb_build_object('ok',true,'data',jsonb_build_object('friends',items,'limit',200));
 end if;

 if p_command in('friends.createGroup','friends.renameGroup','friends.deleteGroup') then
  if not v2 or exists(select 1 from jsonb_object_keys(p_payload) k where k not in('actor','session','schemaVersion','requestId','groupId','revision','name')) then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  req:=(p_payload->>'requestId')::uuid;gid:=(p_payload->>'groupId')::uuid;rev:=(p_payload->>'revision')::bigint;
  if req is null or (p_command='friends.createGroup' and (p_payload ? 'groupId' or p_payload ? 'revision'))
   or (p_command<>'friends.createGroup' and (gid is null or rev is null or jsonb_typeof(p_payload->'revision') is distinct from 'number' or rev<1 or rev>9007199254740991))
   or (p_command='friends.deleteGroup' and p_payload ? 'name')
  then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  if p_command<>'friends.deleteGroup' then
   if jsonb_typeof(p_payload->'name') is distinct from 'string' then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
   new_name:=lumo_private.social_group_name(p_payload->>'name');if new_name is null then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  end if;
  canonical:=(p_payload-'actor'-'session'-'requestId')||jsonb_build_object('command',p_command);
  if p_command<>'friends.deleteGroup' then canonical:=canonical||jsonb_build_object('name',new_name);end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,21106));
  select * into m from lumo_private.social_mutations where owner_id=actor and request_id=req;
  if found then
   if m.payload is distinct from canonical then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');end if;
   return jsonb_build_object('ok',true,'data',m.response||jsonb_build_object('duplicate',true));
  end if;
  if (select count(*) from lumo_private.social_mutations where owner_id=actor and created_at>clock_timestamp()-interval '1 hour')>=100 then return jsonb_build_object('ok',false,'code','RATE_LIMITED');end if;
  if p_command<>'friends.createGroup' then
   select * into g from lumo_private.social_friend_groups where owner_id=actor and id=gid and not deleted for update;
   if not found then return jsonb_build_object('ok',false,'code','GROUP_NOT_FOUND');end if;
   if g.revision<>rev then return jsonb_build_object('ok',false,'code','REVISION_CONFLICT');end if;
  end if;
  if p_command='friends.deleteGroup' then
   update lumo_private.social_friend_groups set deleted=true,revision=revision+1,updated_at=clock_timestamp() where owner_id=actor and id=gid;
   update lumo_private.social_friends set group_id=null,revision=revision+1,updated_at=clock_timestamp() where owner_id=actor and group_id=gid;
   saved:=jsonb_build_object('record',null,'removed',true,'duplicate',false);
  else
   if exists(select 1 from lumo_private.social_friend_groups where owner_id=actor and not deleted and lower(social_friend_groups.name)=lower(new_name) and (gid is null or id<>gid)) then return jsonb_build_object('ok',false,'code','GROUP_NAME_TAKEN');end if;
   if p_command='friends.createGroup' then
    if (select count(*) from lumo_private.social_friend_groups where owner_id=actor and not deleted)>=50 then return jsonb_build_object('ok',false,'code','GROUP_LIMIT');end if;
    insert into lumo_private.social_friend_groups(owner_id,name) values(actor,new_name) returning * into g;
   else
    update lumo_private.social_friend_groups set name=new_name,revision=revision+1,updated_at=clock_timestamp() where owner_id=actor and id=gid returning * into g;
   end if;
   -- Record each legacy label only once, including explicit v2 names. Never rebind.
   insert into lumo_private.social_legacy_group_labels(owner_id,label,group_id)
    select actor,legacy,g.id from unnest(array['Circle','Crew','Lumo Squad','Study Buddies']) legacy where lower(legacy)=lower(g.name)
    on conflict(owner_id,label) do nothing;
   saved:=jsonb_build_object('record',jsonb_build_object('id',g.id,'name',g.name,'revision',g.revision),'duplicate',false);
  end if;
  insert into lumo_private.social_mutations(owner_id,request_id,payload,response) values(actor,req,canonical,saved);
  return jsonb_build_object('ok',true,'data',saved);
 end if;

 if p_command in('friends.save','friends.remove') then
  if exists(select 1 from jsonb_object_keys(p_payload) k where k not in('actor','session','recipientId','requestId','revision','listName','schemaVersion','groupId')) then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  recipient:=(p_payload->>'recipientId')::uuid;req:=(p_payload->>'requestId')::uuid;rev:=(p_payload->>'revision')::bigint;legacy_label:=p_payload->>'listName';
  if recipient is null or req is null or (p_payload ? 'revision' and (rev is null or jsonb_typeof(p_payload->'revision') is distinct from 'number' or rev<1 or rev>9007199254740991))
   or (v2 and p_payload ? 'listName') or (not v2 and p_payload ? 'groupId')
   or (p_command='friends.save' and not v2 and (legacy_label is null or legacy_label not in('Circle','Crew','Lumo Squad','Study Buddies')))
   or (p_command='friends.save' and v2 and (not(p_payload ? 'groupId') or jsonb_typeof(p_payload->'groupId') not in('string','null')))
   or (p_command='friends.remove' and (rev is null or p_payload ? 'listName' or p_payload ? 'groupId'))
  then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  if v2 and p_command='friends.save' then gid:=(p_payload->>'groupId')::uuid;end if;
  if recipient=actor then return jsonb_build_object('ok',false,'code','SELF_FRIEND');end if;
  -- Preserve the original v1 fingerprint so already successful requests still replay.
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
   if not lumo_private.personal_recipient(recipient) and (not v2 or f.recipient_id is null or f.removed) then return jsonb_build_object('ok',false,'code','RECIPIENT_NOT_FOUND');end if;
   if (f.recipient_id is null and rev is not null) or (f.recipient_id is not null and not f.removed and rev is distinct from f.revision) or (f.removed and rev is not null and rev<>f.revision) then return jsonb_build_object('ok',false,'code','REVISION_CONFLICT');end if;
   if (f.recipient_id is null or f.removed) and (select count(*) from lumo_private.social_friends where owner_id=actor and not removed)>=200 then return jsonb_build_object('ok',false,'code','FRIEND_LIMIT');end if;
   if v2 then
    if gid is not null and not exists(select 1 from lumo_private.social_friend_groups where owner_id=actor and id=gid and not deleted) then return jsonb_build_object('ok',false,'code','GROUP_NOT_FOUND');end if;
    select coalesce(f.list_name,(select ll.label from lumo_private.social_legacy_group_labels ll where ll.owner_id=actor and ll.group_id=gid order by ll.label limit 1),'Circle') into legacy_label;
   elsif f.recipient_id is not null and not f.removed and legacy_label=f.list_name then
    -- An unchanged old projection must not overwrite a newer custom/ungrouped choice.
    gid:=f.group_id;
   else
    select ll.group_id into gid from lumo_private.social_legacy_group_labels ll where ll.owner_id=actor and ll.label=legacy_label;
    if found then
     if not exists(select 1 from lumo_private.social_friend_groups where owner_id=actor and id=gid and not deleted) then return jsonb_build_object('ok',false,'code','GROUP_UNAVAILABLE');end if;
    else
     select id into gid from lumo_private.social_friend_groups where owner_id=actor and not deleted and lower(social_friend_groups.name)=lower(legacy_label);
     if not found then
      if (select count(*) from lumo_private.social_friend_groups where owner_id=actor and not deleted)>=50 then return jsonb_build_object('ok',false,'code','GROUP_LIMIT');end if;
      insert into lumo_private.social_friend_groups(owner_id,name) values(actor,legacy_label) returning id into gid;
     end if;
     insert into lumo_private.social_legacy_group_labels(owner_id,label,group_id) values(actor,legacy_label,gid);
    end if;
   end if;
   insert into lumo_private.social_friends(owner_id,recipient_id,list_name,group_id) values(actor,recipient,legacy_label,gid)
    on conflict(owner_id,recipient_id) do update set list_name=excluded.list_name,group_id=excluded.group_id,removed=false,revision=social_friends.revision+1,updated_at=clock_timestamp()
    returning * into f;
   saved:=jsonb_build_object('record',case when v2 then lumo_private.social_friend_json_v2(f) else lumo_private.social_friend_json(f) end,'duplicate',false);
  end if;
  insert into lumo_private.social_mutations(owner_id,request_id,payload,response) values(actor,req,canonical,saved);
  return jsonb_build_object('ok',true,'data',saved);
 end if;

 -- Notification behavior is unchanged from social v1.
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
revoke all on function lumo_private.social_group_name(text),lumo_private.social_friend_json_v2(lumo_private.social_friends),public.lumo_social(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.lumo_social(text,jsonb) to service_role;
