-- Shared merchant team, shifts, inbox and personal account operations. Test money only.
create table lumo_private.staff_memberships (
 id uuid primary key default gen_random_uuid(), shop_id uuid not null references lumo_private.shops(id),
 user_id uuid not null references lumo_private.profiles(user_id), role text not null check(role in ('cashier','manager')),
 status text not null default 'pending' check(status in ('pending','active','declined','removed')),
 invited_by uuid not null references lumo_private.profiles(user_id), created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(), unique(shop_id,user_id)
);
create index staff_memberships_user_scope on lumo_private.staff_memberships(user_id,status,shop_id);
create table lumo_private.shifts (
 id uuid primary key default gen_random_uuid(),shop_id uuid not null references lumo_private.shops(id),
 user_id uuid not null references lumo_private.profiles(user_id),started_at timestamptz not null default clock_timestamp(),
 ended_at timestamptz,note text not null default '' check(length(note)<=300),check(ended_at is null or ended_at>=started_at)
);
create unique index shifts_one_active on lumo_private.shifts(shop_id,user_id) where ended_at is null;
create index shifts_shop_time on lumo_private.shifts(shop_id,started_at desc);
create index shifts_user_time on lumo_private.shifts(user_id,started_at desc);
create table lumo_private.shop_settings (
 shop_id uuid primary key references lumo_private.shops(id),location text not null default '' check(length(location)<=160),
 published boolean not null default false,latitude numeric check(latitude between -90 and 90),longitude numeric check(longitude between -180 and 180),check((latitude is null)=(longitude is null))
);
create table lumo_private.user_preferences (
 user_id uuid primary key references lumo_private.profiles(user_id),preferences jsonb not null default '{}'::jsonb check(jsonb_typeof(preferences)='object')
);
create table lumo_private.inbox (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references lumo_private.profiles(user_id),kind text not null,
 title text not null check(length(title)<=120),body text not null check(length(body)<=600),entity_type text,entity_id uuid,
 created_at timestamptz not null default clock_timestamp(),read_at timestamptz
);
create index inbox_user_time on lumo_private.inbox(user_id,created_at desc,id);
create table lumo_private.support_tickets (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references lumo_private.profiles(user_id),
 subject text not null check(length(subject) between 1 and 100),body text not null check(length(body) between 1 and 2000),
 reference text not null default '' check(length(reference)<=100),status text not null default 'open' check(status in ('open','resolved')),
 created_at timestamptz not null default clock_timestamp()
);
create index support_tickets_user on lumo_private.support_tickets(user_id,created_at desc);
create table lumo_private.refund_proposals (
 id uuid primary key default gen_random_uuid(),payment_id uuid not null references lumo_private.journals(id),
 requested_by uuid not null references lumo_private.profiles(user_id),amount bigint not null check(amount between 1 and 1000000),
 status text not null default 'pending' check(status in ('pending','refunded','rejected')),decided_by uuid references lumo_private.profiles(user_id),
 journal_id uuid references lumo_private.journals(id),created_at timestamptz not null default clock_timestamp(),decided_at timestamptz,
 check((status='refunded')=(journal_id is not null))
);
create index refund_proposals_payment on lumo_private.refund_proposals(payment_id,status,created_at desc);
alter table lumo_private.staff_memberships enable row level security;
alter table lumo_private.shifts enable row level security;
alter table lumo_private.shop_settings enable row level security;
alter table lumo_private.user_preferences enable row level security;
alter table lumo_private.inbox enable row level security;
alter table lumo_private.support_tickets enable row level security;
alter table lumo_private.refund_proposals enable row level security;
revoke all on lumo_private.staff_memberships,lumo_private.shifts,lumo_private.shop_settings,lumo_private.user_preferences,lumo_private.inbox,lumo_private.support_tickets,lumo_private.refund_proposals from public,anon,authenticated,service_role;

create function lumo_private.notify_user(p_user uuid,p_kind text,p_title text,p_body text,p_entity_type text default null,p_entity_id uuid default null) returns void language sql security invoker set search_path='' as $$
 insert into lumo_private.inbox(user_id,kind,title,body,entity_type,entity_id)
 select p_user,left(p_kind,80),left(p_title,120),left(p_body,600),p_entity_type,p_entity_id
 where exists(select 1 from lumo_private.profiles p where p.user_id=p_user);
$$;
create function lumo_private.money_inbox() returns trigger language plpgsql security invoker set search_path='' as $$
declare j lumo_private.journals%rowtype;
begin
 select * into j from lumo_private.journals where id=new.journal_id;
 perform lumo_private.notify_user(new.user_id,'money.posted','Payment confirmed',
 'GH₵'||to_char(j.amount/100.0,'FM999999990.00')||' · '||j.reference,'journal',j.id);
 return new;
end $$;
create trigger lumo_money_inbox after insert on lumo_private.events for each row execute function lumo_private.money_inbox();

create function lumo_private.staff_role(p_actor uuid,p_shop uuid) returns text language sql stable security invoker set search_path='' as $$
 select case when m.owner_user_id=p_actor then 'owner' else sm.role end
 from lumo_private.shops s join lumo_private.merchants m on m.id=s.merchant_id
 left join lumo_private.staff_memberships sm on sm.shop_id=s.id and sm.user_id=p_actor and sm.status='active'
 where s.id=p_shop and m.status='active' and (m.owner_user_id=p_actor or sm.id is not null);
$$;
create function lumo_private.staff_permission(p_actor uuid,p_shop uuid,p_capability text) returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce(case lumo_private.staff_role(p_actor,p_shop)
 when 'owner' then true when 'manager' then p_capability in ('read','collect','close','refund','shift')
 when 'cashier' then p_capability in ('read','collect','shift') else false end,false);
$$;
create function lumo_private.staff_json(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',s.id,'shopId',s.shop_id,'userId',s.user_id,'handle',p.handle,'displayName',p.display_name,'role',s.role,'status',s.status,'createdAt',s.created_at)
 from lumo_private.staff_memberships s join lumo_private.profiles p on p.user_id=s.user_id where s.id=p_id;
$$;
create function lumo_private.shift_json(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',s.id,'shopId',s.shop_id,'userId',s.user_id,'handle',p.handle,'displayName',p.display_name,'startedAt',s.started_at,'endedAt',s.ended_at,'note',s.note,
 'collected',coalesce((select sum(j.amount) from lumo_private.journals j join lumo_private.payment_requests r on r.id=j.request_id
 where j.type='merchant_payment' and j.shop_id=s.shop_id and r.created_by=s.user_id and j.created_at>=s.started_at and (s.ended_at is null or j.created_at<=s.ended_at)),0),
 'attribution','Fixed requests created by this user; Shop QR payments belong to the shop')
 from lumo_private.shifts s join lumo_private.profiles p on p.user_id=s.user_id where s.id=p_id;
$$;
create function lumo_private.refund_proposal_json(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',r.id,'paymentId',r.payment_id,'requestedBy',r.requested_by,'requestedByHandle',p.handle,'amount',r.amount,'status',r.status,'decidedBy',r.decided_by,'journalId',r.journal_id,'shopId',j.shop_id,'createdAt',r.created_at,'decidedAt',r.decided_at)
 from lumo_private.refund_proposals r join lumo_private.journals j on j.id=r.payment_id join lumo_private.profiles p on p.user_id=r.requested_by where r.id=p_id;
$$;
create function lumo_private.operations_merchant_get() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','merchants',coalesce((
 select jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'accountId',case when m.owner_user_id=auth.uid() then m.account_id else null end,
 'balance',case when m.owner_user_id=auth.uid() then a.balance else null end,'role',case when m.owner_user_id=auth.uid() then 'owner' else 'staff' end,
 'shops',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'merchantId',m.id,'name',s.name,'accepting',s.accepting,'tradingSince',s.trading_since,'role',lumo_private.staff_role(auth.uid(),s.id),
 'location',coalesce(ss.location,''),'published',coalesce(ss.published,false),'latitude',ss.latitude,'longitude',ss.longitude,'currentShift',(select lumo_private.shift_json(sh.id) from lumo_private.shifts sh where sh.shop_id=s.id and sh.user_id=auth.uid() and sh.ended_at is null),
 'netCollected',coalesce((select sum(case when j.type='merchant_payment' then j.amount when j.type='refund' then -j.amount else 0 end) from lumo_private.journals j where j.shop_id=s.id and j.created_at>=s.trading_since),0)) order by s.created_at)
 from lumo_private.shops s left join lumo_private.shop_settings ss on ss.shop_id=s.id where s.merchant_id=m.id and lumo_private.staff_permission(auth.uid(),s.id,'read')),'[]'::jsonb),
 'activity',coalesce((select jsonb_agg(lumo_private.receipt_json(x.id) order by x.created_at desc,x.id) from (
 select j.id,j.created_at from lumo_private.journals j where (j.payer_account_id=m.account_id or j.payee_account_id=m.account_id)
 and (m.owner_user_id=auth.uid() or lumo_private.staff_permission(auth.uid(),j.shop_id,'read')) order by j.created_at desc,j.id limit 100)x),'[]'::jsonb)) order by m.created_at)
 from lumo_private.merchants m join lumo_private.accounts a on a.id=m.account_id where m.status='active' and
 (m.owner_user_id=auth.uid() or exists(select 1 from lumo_private.staff_memberships sm join lumo_private.shops s on s.id=sm.shop_id where s.merchant_id=m.id and sm.user_id=auth.uid() and sm.status='active'))),'[]'::jsonb));
$$;

create function lumo_private.operations_command(p_command text,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_actor uuid:=auth.uid();v_id uuid;v_shop_id uuid;v_merchant_id uuid;v_user uuid;v_journal uuid;v_amount bigint;v_refunded bigint;v_pending bigint;v_role text;v_name text;v_handle text;v_note text;v_new_pin text;v_lat numeric;v_lng numeric;
 v_shop lumo_private.shops%rowtype;v_merchant lumo_private.merchants%rowtype;v_member lumo_private.staff_memberships%rowtype;
 v_shift lumo_private.shifts%rowtype;v_payment lumo_private.journals%rowtype;v_proposal lumo_private.refund_proposals%rowtype;
 v_request lumo_private.payment_requests%rowtype;v_ticket lumo_private.support_tickets%rowtype;v_preferences jsonb;v_entry record;
begin
 if p_command='merchant.get' then return lumo_private.operations_merchant_get();
 elsif p_command='staff.invitations' then
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','invitations',coalesce((select jsonb_agg(lumo_private.staff_json(sm.id)||jsonb_build_object('shopName',s.name,'merchantName',m.name) order by sm.created_at desc)
  from lumo_private.staff_memberships sm join lumo_private.shops s on s.id=sm.shop_id join lumo_private.merchants m on m.id=s.merchant_id where sm.user_id=v_actor and sm.status='pending'),'[]'::jsonb));
 elsif p_command='staff.list' then
  v_merchant_id:=lumo_private.ext_uuid(p_payload,'merchantId');
  if not exists(select 1 from lumo_private.merchants m where m.id=v_merchant_id and m.owner_user_id=v_actor) then return lumo_private.failure('FORBIDDEN','Only the owner can manage the team.');end if;
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','staff',coalesce((select jsonb_agg(lumo_private.staff_json(sm.id) order by sm.created_at desc) from lumo_private.staff_memberships sm join lumo_private.shops s on s.id=sm.shop_id where s.merchant_id=v_merchant_id),'[]'::jsonb));
 elsif p_command='staff.invite' then
  v_shop_id:=lumo_private.ext_uuid(p_payload,'shopId');v_role:=p_payload->>'role';v_handle:=lower(trim(p_payload->>'handle'));
  if lumo_private.staff_role(v_actor,v_shop_id) is distinct from 'owner' then return lumo_private.failure('FORBIDDEN','Only the owner can invite staff.');end if;
  if jsonb_typeof(p_payload->'handle') is distinct from 'string' or v_handle is null or v_handle !~ '^[a-z][a-z0-9_]{2,29}$' or v_role is null or v_role not in ('cashier','manager') then return lumo_private.failure('INVALID_INPUT','Choose a valid Lumo handle and staff role.');end if;
  select p.user_id into v_user from lumo_private.profiles p where p.handle=v_handle and p.status='active';
  if v_user is null or v_user=v_actor then return lumo_private.failure('INVALID_STAFF','Choose another active Lumo user.');end if;
  if exists(select 1 from lumo_private.staff_memberships sm where sm.shop_id=v_shop_id and sm.user_id=v_user and sm.status in ('pending','active')) then return lumo_private.failure('STAFF_EXISTS','This person is already invited or active for the shop.');end if;
  if (select count(*) from lumo_private.staff_memberships sm where sm.shop_id=v_shop_id and sm.status in ('pending','active'))>=100 then return lumo_private.failure('STAFF_LIMIT','This shop has reached its staff limit.');end if;
  insert into lumo_private.staff_memberships(shop_id,user_id,role,invited_by) values(v_shop_id,v_user,v_role,v_actor)
  on conflict(shop_id,user_id) do update set role=excluded.role,status='pending',invited_by=excluded.invited_by,created_at=clock_timestamp(),updated_at=clock_timestamp() returning id into v_id;
  perform lumo_private.notify_user(v_user,'staff.invite','Shop invitation','You have been invited to work in a Lumo shop. Accept to gain access.','staff',v_id);
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','membership',lumo_private.staff_json(v_id));
 elsif p_command in ('staff.respond','staff.remove') then
  v_id:=lumo_private.ext_uuid(p_payload,'membershipId');select * into v_member from lumo_private.staff_memberships sm where sm.id=v_id for update;
  if v_member.id is null then return lumo_private.failure('NOT_FOUND','This staff invitation is unavailable.');end if;
  if p_command='staff.respond' then
   if v_member.user_id<>v_actor or v_member.status<>'pending' then return lumo_private.failure('FORBIDDEN','Only the invited person can answer this invitation.');end if;
   if jsonb_typeof(p_payload->'accept') is distinct from 'boolean' then return lumo_private.failure('INVALID_INPUT','Accept or decline the invitation.');end if;
   if not exists(select 1 from lumo_private.shops s join lumo_private.merchants m on m.id=s.merchant_id where s.id=v_member.shop_id and m.status='active') then return lumo_private.failure('SHOP_PAUSED','The business is not currently active.');end if;
   update lumo_private.staff_memberships set status=case when (p_payload->>'accept')::boolean then 'active' else 'declined' end,updated_at=clock_timestamp() where id=v_id;
   perform lumo_private.notify_user(v_member.invited_by,'staff.response','Team invitation answered','A staff invitation has been answered.','staff',v_id);
  else
   if lumo_private.staff_role(v_actor,v_member.shop_id) is distinct from 'owner' then return lumo_private.failure('FORBIDDEN','Only the owner can remove staff.');end if;
   update lumo_private.staff_memberships set status='removed',updated_at=clock_timestamp() where id=v_id;
   update lumo_private.shifts set ended_at=clock_timestamp(),note='Shop access removed' where shop_id=v_member.shop_id and user_id=v_member.user_id and ended_at is null;
   perform lumo_private.notify_user(v_member.user_id,'staff.removed','Shop access removed','Your access to this shop has ended.','staff',v_id);
  end if;
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','membership',lumo_private.staff_json(v_id));
 elsif p_command in ('shift.start','shift.end','shift.list') then
  v_shop_id:=lumo_private.ext_uuid(p_payload,'shopId');v_role:=lumo_private.staff_role(v_actor,v_shop_id);
  if v_role is null then return lumo_private.failure('FORBIDDEN','You do not have access to this shop.');end if;
  if p_command='shift.list' then return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','shifts',coalesce((select jsonb_agg(lumo_private.shift_json(x.id) order by x.started_at desc) from (select sh.id,sh.started_at from lumo_private.shifts sh where sh.shop_id=v_shop_id and (v_role in ('owner','manager') or sh.user_id=v_actor) order by sh.started_at desc limit 100)x),'[]'::jsonb));end if;
  select * into v_shift from lumo_private.shifts sh where sh.shop_id=v_shop_id and sh.user_id=v_actor and sh.ended_at is null for update;
  if p_command='shift.start' then
   if v_shift.id is null then insert into lumo_private.shifts(shop_id,user_id) values(v_shop_id,v_actor) returning * into v_shift;end if;
  else
   if v_shift.id is null then return lumo_private.failure('NO_ACTIVE_SHIFT','Start a shift before ending it.');end if;
   v_note:=coalesce(p_payload->>'note','');if (p_payload?'note' and jsonb_typeof(p_payload->'note') is distinct from 'string') or length(v_note)>300 or v_note~'[[:cntrl:]<>]' then return lumo_private.failure('INVALID_INPUT','Keep the handover note within 300 characters.');end if;
   update lumo_private.shifts set ended_at=clock_timestamp(),note=v_note where id=v_shift.id;
  end if;
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','shift',lumo_private.shift_json(v_shift.id));
 elsif p_command='merchant.settings' then
  v_shop_id:=lumo_private.ext_uuid(p_payload,'shopId');
  if lumo_private.staff_role(v_actor,v_shop_id) is distinct from 'owner' then return lumo_private.failure('FORBIDDEN','Only the owner can change shop settings.');end if;
  if p_payload?'name' then
   v_name:=trim(p_payload->>'name');if jsonb_typeof(p_payload->'name') is distinct from 'string' or v_name is null or length(v_name) not between 1 and 100 or v_name~'[[:cntrl:]<>]' then return lumo_private.failure('INVALID_INPUT','Enter a valid shop name.');end if;
   if exists(select 1 from lumo_private.shops s join lumo_private.shops current_shop on current_shop.id=v_shop_id where s.merchant_id=current_shop.merchant_id and s.id<>v_shop_id and lower(trim(s.name))=lower(v_name)) then return lumo_private.failure('SHOP_NAME_TAKEN','Another shop in this business has that name.');end if;
  end if;
  if p_payload?'accepting' and jsonb_typeof(p_payload->'accepting') is distinct from 'boolean' then return lumo_private.failure('INVALID_INPUT','Choose whether the shop accepts payments.');end if;
  if p_payload?'location' and (jsonb_typeof(p_payload->'location') is distinct from 'string' or length(p_payload->>'location')>160 or (p_payload->>'location')~'[[:cntrl:]<>]') then return lumo_private.failure('INVALID_INPUT','Use a location description within 160 characters.');end if;
  if p_payload?'published' and jsonb_typeof(p_payload->'published') is distinct from 'boolean' then return lumo_private.failure('INVALID_INPUT','Choose whether to publish the shop.');end if;
  if p_payload?'latitude' or p_payload?'longitude' then
   if jsonb_typeof(p_payload->'latitude') is distinct from 'number' or jsonb_typeof(p_payload->'longitude') is distinct from 'number' then return lumo_private.failure('INVALID_INPUT','Supply both location coordinates.');end if;
   v_lat:=(p_payload->>'latitude')::numeric;v_lng:=(p_payload->>'longitude')::numeric;
   if v_lat not between -90 and 90 or v_lng not between -180 and 180 then return lumo_private.failure('INVALID_INPUT','Supply valid location coordinates.');end if;
  end if;
  update lumo_private.shops set name=coalesce(v_name,name),accepting=case when p_payload?'accepting' then (p_payload->>'accepting')::boolean else accepting end where id=v_shop_id returning * into v_shop;
  insert into lumo_private.shop_settings(shop_id,location,published,latitude,longitude) values(v_shop_id,coalesce(p_payload->>'location',''),coalesce((p_payload->>'published')::boolean,false),v_lat,v_lng)
  on conflict(shop_id) do update set location=case when p_payload?'location' then excluded.location else lumo_private.shop_settings.location end,
  published=case when p_payload?'published' then excluded.published else lumo_private.shop_settings.published end,
  latitude=case when p_payload?'latitude' then excluded.latitude else lumo_private.shop_settings.latitude end,
  longitude=case when p_payload?'longitude' then excluded.longitude else lumo_private.shop_settings.longitude end;
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','shop',jsonb_build_object('id',v_shop.id,'name',v_shop.name,'accepting',v_shop.accepting));
 elsif p_command='merchant.search' then
  v_name:=coalesce(trim(p_payload->>'query'),'');
  if (p_payload?'query' and jsonb_typeof(p_payload->'query') is distinct from 'string') or length(v_name)>100 then return lumo_private.failure('INVALID_INPUT','Use a search within 100 characters.');end if;
  if p_payload?'latitude' or p_payload?'longitude' then
   if jsonb_typeof(p_payload->'latitude') is distinct from 'number' or jsonb_typeof(p_payload->'longitude') is distinct from 'number' then return lumo_private.failure('INVALID_INPUT','Supply both search coordinates.');end if;
   v_lat:=(p_payload->>'latitude')::numeric;v_lng:=(p_payload->>'longitude')::numeric;
   if v_lat not between -90 and 90 or v_lng not between -180 and 180 then return lumo_private.failure('INVALID_INPUT','Supply valid search coordinates.');end if;
  end if;
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','shops',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'merchantId',x.merchant_id,'merchantName',x.merchant_name,'location',x.location,'distanceMetres',x.distance_metres) order by x.distance_metres nulls last,x.name) from (
   select s.id,s.name,s.merchant_id,m.name as merchant_name,ss.location,
   case when v_lat is not null and ss.latitude is not null then round(6371000*2*asin(least(1,sqrt(power(sin(radians((ss.latitude-v_lat)::double precision)/2),2)+cos(radians(v_lat::double precision))*cos(radians(ss.latitude::double precision))*power(sin(radians((ss.longitude-v_lng)::double precision)/2),2)))))::bigint else null end as distance_metres
   from lumo_private.shops s join lumo_private.merchants m on m.id=s.merchant_id join lumo_private.shop_settings ss on ss.shop_id=s.id
   where ss.published and s.accepting and m.status='active' and (v_name='' or position(lower(v_name) in lower(s.name||' '||m.name||' '||ss.location))>0)
   order by distance_metres nulls last,s.name limit 50)x),'[]'::jsonb));
 elsif p_command='request.create' then
  v_shop_id:=lumo_private.ext_uuid(p_payload,'shopId');v_amount:=lumo_private.ext_amount(p_payload);
  if not lumo_private.staff_permission(v_actor,v_shop_id,'collect') then return lumo_private.failure('FORBIDDEN','You cannot collect for this shop.');end if;
  select * into v_shop from lumo_private.shops s where s.id=v_shop_id for update;
  if not v_shop.accepting then return lumo_private.failure('SHOP_PAUSED','This shop is not accepting payments.');end if;
  v_note:=coalesce(p_payload->>'note','');if (p_payload?'note' and jsonb_typeof(p_payload->'note') is distinct from 'string') or length(v_note)>160 then return lumo_private.failure('INVALID_NOTE','Keep the payment note within 160 characters.');end if;
  if (select count(*) from lumo_private.payment_requests r where r.shop_id=v_shop_id and r.status='open' and r.expires_at>clock_timestamp())>=100 then return lumo_private.failure('REQUEST_LIMIT','This shop has too many open requests. Reuse or wait for an existing QR to expire.');end if;
  insert into lumo_private.payment_requests(shop_id,amount,note,created_by) values(v_shop_id,v_amount,v_note,v_actor) returning * into v_request;
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','request',jsonb_build_object('id',v_request.id,'shopId',v_request.shop_id,'amount',v_request.amount,'note',v_request.note,'status',v_request.status,'expiresAt',v_request.expires_at));
 elsif p_command='merchant.close' then
  v_shop_id:=lumo_private.ext_uuid(p_payload,'shopId');
  if not lumo_private.staff_permission(v_actor,v_shop_id,'close') then return lumo_private.failure('FORBIDDEN','Only the owner or shop manager can close the trading day.');end if;
  select * into v_shop from lumo_private.shops s where s.id=v_shop_id for update;select * into v_merchant from lumo_private.merchants m where m.id=v_shop.merchant_id;
  perform 1 from lumo_private.accounts a where a.id=v_merchant.account_id for update;
  update lumo_private.shops set trading_since=clock_timestamp() where id=v_shop_id;
  update lumo_private.shifts set ended_at=clock_timestamp(),note=case when note='' then 'Trading day closed' else note end where shop_id=v_shop_id and ended_at is null;
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','shopId',v_shop_id,'closed',true,'balance',case when v_role='owner' or v_merchant.owner_user_id=v_actor then (select a.balance from lumo_private.accounts a where a.id=v_merchant.account_id) else null end);
 elsif p_command='payment.refund' then
  v_id:=lumo_private.ext_uuid(p_payload,'paymentId');v_amount:=lumo_private.ext_amount(p_payload);
  select * into v_payment from lumo_private.journals j where j.id=v_id for update;
  if v_payment.id is null or v_payment.type<>'merchant_payment' then return lumo_private.failure('INVALID_PAYMENT','Choose an original merchant payment.');end if;
  v_role:=lumo_private.staff_role(v_actor,v_payment.shop_id);
  if v_role is null or v_role not in ('owner','manager') then return lumo_private.failure('FORBIDDEN','Only the owner or authorised manager can refund this payment.');end if;
  select * into v_merchant from lumo_private.merchants m where m.account_id=v_payment.payee_account_id;
  select coalesce(sum(j.amount),0) into v_refunded from lumo_private.journals j where j.original_payment_id=v_payment.id;
  select coalesce(sum(p.amount),0) into v_pending from lumo_private.refund_proposals p where p.payment_id=v_payment.id and p.status='pending';
  if v_amount+v_refunded+v_pending>v_payment.amount then return lumo_private.failure('REFUND_EXCEEDS_PAYMENT','The amount exceeds the unrefunded payment after pending approvals.');end if;
  if v_role='manager' and v_amount+v_refunded+v_pending>10000 then
   insert into lumo_private.refund_proposals(payment_id,requested_by,amount) values(v_payment.id,v_actor,v_amount) returning id into v_id;
   perform lumo_private.notify_user(v_merchant.owner_user_id,'refund.approval','Refund needs approval','A shop manager requested a refund above the cumulative GH₵100 limit.','refund',v_id);
   return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','refundProposal',lumo_private.refund_proposal_json(v_id));
  end if;
  v_journal:=lumo_private.post_money(v_actor,'refund',v_amount,v_merchant.account_id,v_payment.payer_account_id,v_payment.shop_id,v_payment.request_id,v_payment.id);
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','receipt',lumo_private.receipt_json(v_journal));
 elsif p_command='refund.list' then
  v_merchant_id:=lumo_private.ext_uuid(p_payload,'merchantId');
  if not exists(select 1 from lumo_private.shops s where s.merchant_id=v_merchant_id and lumo_private.staff_permission(v_actor,s.id,'refund')) then return lumo_private.failure('FORBIDDEN','You cannot review refunds for this business.');end if;
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','refunds',coalesce((select jsonb_agg(lumo_private.refund_proposal_json(r.id) order by r.created_at desc) from lumo_private.refund_proposals r join lumo_private.journals j on j.id=r.payment_id join lumo_private.shops s on s.id=j.shop_id where s.merchant_id=v_merchant_id and lumo_private.staff_permission(v_actor,s.id,'refund')),'[]'::jsonb));
 elsif p_command='refund.decide' then
  v_id:=lumo_private.ext_uuid(p_payload,'proposalId');select * into v_proposal from lumo_private.refund_proposals p where p.id=v_id for update;
  if v_proposal.id is null then return lumo_private.failure('NOT_FOUND','This refund request is unavailable.');end if;
  select * into v_payment from lumo_private.journals j where j.id=v_proposal.payment_id for update;
  select * into v_merchant from lumo_private.merchants m where m.account_id=v_payment.payee_account_id and m.owner_user_id=v_actor;
  if v_merchant.id is null then return lumo_private.failure('FORBIDDEN','Only the receiving business owner can decide this refund.');end if;
  if v_proposal.status<>'pending' then return lumo_private.failure('ALREADY_DECIDED','This refund request has already been decided.');end if;
  if jsonb_typeof(p_payload->'approve') is distinct from 'boolean' then return lumo_private.failure('INVALID_INPUT','Approve or reject the refund.');end if;
  if (p_payload->>'approve')::boolean then
   select coalesce(sum(j.amount),0) into v_refunded from lumo_private.journals j where j.original_payment_id=v_payment.id;
   if v_proposal.amount+v_refunded>v_payment.amount then return lumo_private.failure('REFUND_EXCEEDS_PAYMENT','The original payment has insufficient refundable money.');end if;
   v_journal:=lumo_private.post_money(v_actor,'refund',v_proposal.amount,v_merchant.account_id,v_payment.payer_account_id,v_payment.shop_id,v_payment.request_id,v_payment.id);
   update lumo_private.refund_proposals set status='refunded',journal_id=v_journal,decided_by=v_actor,decided_at=clock_timestamp() where id=v_id;
  else update lumo_private.refund_proposals set status='rejected',decided_by=v_actor,decided_at=clock_timestamp() where id=v_id;end if;
  perform lumo_private.notify_user(v_proposal.requested_by,'refund.decided','Refund decision','The business owner has decided the refund request.','refund',v_id);
  return jsonb_strip_nulls(jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','refundProposal',lumo_private.refund_proposal_json(v_id),'receipt',case when v_journal is not null then lumo_private.receipt_json(v_journal) else null end));
 elsif p_command='notification.list' then
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','notifications',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'kind',x.kind,'title',x.title,'body',x.body,'entityType',x.entity_type,'entityId',x.entity_id,'createdAt',x.created_at,'readAt',x.read_at) order by x.created_at desc,x.id) from(select * from lumo_private.inbox i where i.user_id=v_actor order by i.created_at desc,i.id limit 100)x),'[]'::jsonb));
 elsif p_command='notification.read' then
  v_id:=lumo_private.ext_uuid(p_payload,'notificationId');update lumo_private.inbox set read_at=coalesce(read_at,clock_timestamp()) where id=v_id and user_id=v_actor;
  if not found then return lumo_private.failure('NOT_FOUND','This notification is unavailable.');end if;
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','notificationId',v_id,'read',true);
 elsif p_command='profile.get' then
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','profile',(select jsonb_build_object('displayName',p.display_name,'handle',p.handle,'preferences',coalesce(up.preferences,'{}'::jsonb)) from lumo_private.profiles p left join lumo_private.user_preferences up on up.user_id=p.user_id where p.user_id=v_actor));
 elsif p_command='profile.update' then
  if p_payload?'displayName' then
   v_name:=trim(p_payload->>'displayName');if jsonb_typeof(p_payload->'displayName') is distinct from 'string' or v_name is null or length(v_name) not between 1 and 80 or v_name~'[[:cntrl:]<>]' then return lumo_private.failure('INVALID_INPUT','Use a display name between 1 and 80 characters.');end if;
  end if;
  if p_payload?'preferences' then
   v_preferences:=p_payload->'preferences';if jsonb_typeof(v_preferences) is distinct from 'object' then return lumo_private.failure('INVALID_INPUT','Choose valid account preferences.');end if;
   for v_entry in select key,value from jsonb_each(v_preferences) loop
    if v_entry.key not in ('theme','hideBalance','sound','reducedMotion') or (v_entry.key='theme' and (jsonb_typeof(v_entry.value)<>'string' or (v_entry.value#>>'{}') not in ('light','dark','system'))) or (v_entry.key<>'theme' and jsonb_typeof(v_entry.value)<>'boolean') then return lumo_private.failure('INVALID_INPUT','Choose valid account preferences.');end if;
   end loop;
  end if;
  if v_name is not null then update lumo_private.profiles set display_name=v_name where user_id=v_actor;end if;
  if v_preferences is not null then insert into lumo_private.user_preferences(user_id,preferences) values(v_actor,v_preferences) on conflict(user_id) do update set preferences=lumo_private.user_preferences.preferences||excluded.preferences;end if;
  return lumo_private.operations_command('profile.get','{}'::jsonb);
 elsif p_command='security.pin' then
  v_new_pin:=p_payload->>'newPin';if jsonb_typeof(p_payload->'newPin') is distinct from 'string' or v_new_pin is null or v_new_pin !~ '^[0-9]{4,6}$' then return lumo_private.failure('INVALID_INPUT','Use a new 4–6 digit payment PIN.');end if;
  if not lumo_private.verify_pin(v_actor,case when jsonb_typeof(p_payload->'oldPin')='string' then p_payload->>'oldPin' else null end) then return lumo_private.failure('PIN_REQUIRED','Check your existing payment PIN. After five incorrect attempts wait one minute.',false);end if;
  update lumo_private.profiles set pin_hash=extensions.crypt(v_new_pin,extensions.gen_salt('bf',10)),pin_failures=0,pin_locked_until=null where user_id=v_actor;
  perform lumo_private.notify_user(v_actor,'security.pin','Payment PIN changed','Your Lumo payment PIN was changed.','profile',v_actor);
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','changed',true);
 elsif p_command='security.sessions' then
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'createdAt',s.created_at,'updatedAt',s.updated_at,'expiresAt',s.not_after,'current',s.id::text=auth.jwt()->>'session_id') order by s.created_at desc) from auth.sessions s where s.user_id=v_actor and (s.not_after is null or s.not_after>clock_timestamp())),'[]'::jsonb));
 elsif p_command='security.session.revoke' then
  v_id:=lumo_private.ext_uuid(p_payload,'sessionId');
  if v_id::text=auth.jwt()->>'session_id' then return lumo_private.failure('CURRENT_SESSION','Use Sign out to end this session.');end if;
  if not exists(select 1 from auth.sessions s where s.id=v_id and s.user_id=v_actor) then return lumo_private.failure('NOT_FOUND','This session is unavailable.');end if;
  if not lumo_private.verify_pin(v_actor,case when jsonb_typeof(p_payload->'pin')='string' then p_payload->>'pin' else null end) then return lumo_private.failure('PIN_REQUIRED','Enter your payment PIN before removing another session.',false);end if;
  delete from auth.sessions where id=v_id and user_id=v_actor;
  perform lumo_private.notify_user(v_actor,'security.session','Session removed','Another signed-in session was removed.','profile',v_actor);
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','sessionId',v_id,'revoked',true);
 elsif p_command='support.list' then
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','tickets',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'subject',t.subject,'body',t.body,'reference',t.reference,'status',t.status,'createdAt',t.created_at) order by t.created_at desc) from lumo_private.support_tickets t where t.user_id=v_actor),'[]'::jsonb));
 elsif p_command='support.create' then
  v_name:=trim(p_payload->>'subject');v_note:=trim(p_payload->>'body');v_handle:=coalesce(p_payload->>'reference','');
  if jsonb_typeof(p_payload->'subject') is distinct from 'string' or jsonb_typeof(p_payload->'body') is distinct from 'string' or v_name is null or v_note is null or length(v_name) not between 1 and 100 or length(v_note) not between 1 and 2000 or length(v_handle)>100 or (p_payload?'reference' and jsonb_typeof(p_payload->'reference') is distinct from 'string') then return lumo_private.failure('INVALID_INPUT','Enter a subject and message within the supported lengths.');end if;
  if (select count(*) from lumo_private.support_tickets t where t.user_id=v_actor and t.created_at>=clock_timestamp()-interval '1 day')>=20 then return lumo_private.failure('SUPPORT_LIMIT','You have reached the daily support request limit.');end if;
  insert into lumo_private.support_tickets(user_id,subject,body,reference) values(v_actor,v_name,v_note,v_handle) returning * into v_ticket;
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','ticket',jsonb_build_object('id',v_ticket.id,'subject',v_ticket.subject,'body',v_ticket.body,'reference',v_ticket.reference,'status',v_ticket.status,'createdAt',v_ticket.created_at));
 end if;
 return null;
end $$;
revoke all on function lumo_private.notify_user(uuid,text,text,text,text,uuid),lumo_private.money_inbox(),lumo_private.staff_role(uuid,uuid),lumo_private.staff_permission(uuid,uuid,text),lumo_private.staff_json(uuid),lumo_private.shift_json(uuid),lumo_private.refund_proposal_json(uuid),lumo_private.operations_merchant_get(),lumo_private.operations_command(text,jsonb) from public,anon,authenticated,service_role;
