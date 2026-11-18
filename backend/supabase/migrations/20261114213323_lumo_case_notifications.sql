-- Transactional customer-visible case updates. Internal notes never enter this inbox.
alter table lumo_private.admin_cases add column customer_message text not null default '' check(length(customer_message)<=600);
create table lumo_private.case_notifications (
 id uuid primary key default gen_random_uuid(),case_id uuid not null references lumo_private.admin_cases(id),case_revision bigint not null,
 recipient_id uuid not null references auth.users(id),audience text not null check(audience in('consumer','merchant')),
 merchant_id uuid references lumo_private.merchants(id),shop_id uuid references lumo_private.shops(id),
 title text not null check(length(title)<=120),body text not null check(length(body) between 1 and 600),case_status text not null,
 created_at timestamptz not null default clock_timestamp(),read_at timestamptz,
 unique(case_id,case_revision,recipient_id,audience)
);
alter table lumo_private.case_notifications enable row level security;
revoke all on lumo_private.case_notifications from public,anon,authenticated,service_role;
create index case_notifications_recipient_time on lumo_private.case_notifications(recipient_id,audience,created_at desc,id);
create index case_notifications_unread on lumo_private.case_notifications(recipient_id,audience) where read_at is null;
create index case_notifications_case on lumo_private.case_notifications(case_id,recipient_id,created_at desc);
create function lumo_private.case_status_label(p_status text) returns text language sql immutable set search_path='' as $$
 select case p_status when 'open' then 'Received' when 'in_progress' then 'Being reviewed' when 'waiting_customer' then 'Needs your response' when 'waiting_provider' then 'Waiting for a partner' when 'escalated' then 'Escalated for review' when 'resolved' then 'Resolved' when 'closed' then 'Closed' else 'Updated' end;
$$;
create function lumo_private.case_notification_access(n lumo_private.case_notifications,p_actor uuid) returns boolean language sql stable set search_path='' as $$
 select n.recipient_id=p_actor and case when n.audience='consumer' then exists(select 1 from lumo_private.admin_cases c where c.id=n.case_id and c.customer_id=p_actor)
 else exists(select 1 from lumo_private.merchants m where m.id=n.merchant_id and (m.owner_user_id=p_actor or exists(select 1 from lumo_private.staff_memberships sm where sm.user_id=p_actor and sm.shop_id=n.shop_id and sm.status='active' and sm.role='manager'))) end;
$$;
create function lumo_private.case_notification_json(n lumo_private.case_notifications) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',n.id,'kind','support.case_updated','caseId',n.case_id,'reference',c.reference,'title',n.title,'body',n.body,'status',n.case_status,'statusLabel',lumo_private.case_status_label(n.case_status),'audience',n.audience,'createdAt',n.created_at,'readAt',n.read_at)
 from lumo_private.admin_cases c where c.id=n.case_id;
$$;
create function lumo_private.publish_case_update() returns trigger language plpgsql set search_path='' as $$
#variable_conflict use_variable
declare body text;label text;target_shop uuid;source_key text;st jsonb;net jsonb;items jsonb;source_status text;public_update jsonb;owner_id uuid;
begin
 if new.status is not distinct from old.status and (new.customer_message is not distinct from old.customer_message or trim(new.customer_message)='') then return new;end if;
 label:=lumo_private.case_status_label(new.status);
 body:=case when new.customer_message is distinct from old.customer_message and trim(new.customer_message)<>'' then trim(new.customer_message) else 'Case '||new.reference||': '||label||'. Open your case for the latest update.' end;
 public_update:=jsonb_build_object('id','case-update-'||new.id::text||'-'||new.revision::text,'at',new.updated_at,'kind','support','text',body);
 if new.source='merchant' or (new.source='admin' and new.customer_id is null and new.merchant_id is not null) then
  select m.owner_user_id into owner_id from lumo_private.merchants m where m.id=new.merchant_id;
  if owner_id is not null then
   if new.source_id like 'merchant:%' then
    source_key:=substr(new.source_id,length('merchant:'||new.merchant_id::text||':')+1);
    select document into net from lumo_private.approved_merchant_network where id for update;
    select sh.id into target_shop from jsonb_array_elements(lumo_private.admin_array(net#>array['businesses',new.merchant_id::text,'tickets'])) t join lumo_private.shops sh on sh.id::text=t.value->>'shopId' and sh.merchant_id=new.merchant_id where t.value->>'id'=source_key limit 1;
    source_status:=case when new.status in('resolved','closed') then 'resolved' when new.status='open' then 'open' else 'investigating' end;
    select coalesce(jsonb_agg(case when t.value->>'id'=source_key then t.value||jsonb_build_object('status',source_status,'updatedAt',new.updated_at,'resolvedAt',new.resolved_at,'responses',lumo_private.admin_array(t.value->'responses')||jsonb_build_array(jsonb_build_object('id',public_update->>'id','message',body,'status',source_status,'createdAt',new.updated_at))) else t.value end order by t.n),'[]'::jsonb) into items from jsonb_array_elements(lumo_private.admin_array(net#>array['businesses',new.merchant_id::text,'tickets'])) with ordinality t(value,n);
    if net is not null then update lumo_private.approved_merchant_network set document=jsonb_set(net,array['businesses',new.merchant_id::text,'tickets'],items),revision=revision+1 where id;end if;
   end if;
   insert into lumo_private.case_notifications(case_id,case_revision,recipient_id,audience,merchant_id,shop_id,title,body,case_status)
   select new.id,new.revision,recipient,'merchant',new.merchant_id,target_shop,'An update on your support case',body,new.status from (
    select owner_id recipient union select sm.user_id from lumo_private.staff_memberships sm where sm.shop_id=target_shop and sm.role='manager' and sm.status='active'
   ) recipients on conflict(case_id,case_revision,recipient_id,audience) do nothing;
  end if;
 elsif new.customer_id is not null then
  insert into lumo_private.case_notifications(case_id,case_revision,recipient_id,audience,title,body,case_status)
  values(new.id,new.revision,new.customer_id,'consumer','An update on your support case',body,new.status) on conflict(case_id,case_revision,recipient_id,audience) do nothing;
  if new.source_id like 'consumer:%' then
   source_key:=substr(new.source_id,length('consumer:'||new.customer_id::text||':')+1);
   select state into st from lumo_private.approved_states where user_id=new.customer_id for update;
   source_status:=case when new.status in('resolved','closed') then 'resolved' when new.status='open' then 'open' else 'reviewing' end;
   select coalesce(jsonb_agg(case when t.value->>'id'=source_key then t.value||jsonb_build_object('status',source_status,'updatedAt',new.updated_at,'updates',lumo_private.admin_array(t.value->'updates')||jsonb_build_array(public_update)) else t.value end order by t.n),'[]'::jsonb) into items from jsonb_array_elements(lumo_private.admin_array(st#>'{account,supportCases}')) with ordinality t(value,n);
   if st is not null then update lumo_private.approved_states set state=jsonb_set(st,'{account,supportCases}',items),revision=revision+1,updated_at=clock_timestamp() where user_id=new.customer_id;end if;
  elsif new.source_id like 'ticket:%' then
   update lumo_private.support_tickets set status=case when new.status in('resolved','closed') then 'resolved' else 'open' end where id::text=substr(new.source_id,8);
  end if;
 end if;
 return new;
end $$;
create trigger publish_customer_case_update after update of status,customer_message on lumo_private.admin_cases for each row execute function lumo_private.publish_case_update();

create function public.lumo_case_inbox(p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor uuid;sid uuid;audience text;op text;ident uuid;business uuid;pg integer;ps integer;rows jsonb;total bigint;unread bigint;c lumo_private.admin_cases%rowtype;
begin
 if (coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role') is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>4096 then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 actor:=(p_payload->>'actor')::uuid;sid:=(p_payload->>'session')::uuid;audience:=p_payload->>'audience';op:=coalesce(p_payload->>'operation','list');
 if actor is null or sid is null or not exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id where s.id=sid and s.user_id=actor and (s.not_after is null or s.not_after>now()) and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and not coalesce(u.is_anonymous,false)) then return jsonb_build_object('ok',false,'code','SESSION_REVOKED');end if;
 if audience is null or audience not in('consumer','merchant') or op not in('list','read','case') then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 business:=nullif(p_payload->>'merchantId','')::uuid;
 if audience='merchant' and business is null then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 if op='read' then
  ident:=(p_payload->>'notificationId')::uuid;
  update lumo_private.case_notifications n set read_at=coalesce(n.read_at,clock_timestamp()) where n.id=ident and n.audience=audience and(n.audience='consumer' or n.merchant_id=business) and lumo_private.case_notification_access(n,actor);
  if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND');end if;
  return jsonb_build_object('ok',true,'notificationId',ident,'read',true);
 elsif op='case' then
  ident:=(p_payload->>'caseId')::uuid;
  if not exists(select 1 from lumo_private.case_notifications n where n.case_id=ident and n.audience=audience and(n.audience='consumer' or n.merchant_id=business) and lumo_private.case_notification_access(n,actor)) then return jsonb_build_object('ok',false,'code','NOT_FOUND');end if;
  select * into c from lumo_private.admin_cases where id=ident;
  select coalesce(jsonb_agg(lumo_private.case_notification_json(x) order by x.created_at desc,x.id),'[]'::jsonb) into rows from(select n.* from lumo_private.case_notifications n where n.case_id=ident and n.audience=audience and(n.audience='consumer' or n.merchant_id=business) and lumo_private.case_notification_access(n,actor) order by n.created_at desc,n.id limit 100)x;
  return jsonb_build_object('ok',true,'case',jsonb_build_object('id',c.id,'reference',c.reference,'status',c.status,'statusLabel',lumo_private.case_status_label(c.status),'updatedAt',c.updated_at,'updates',rows));
 end if;
 pg:=greatest(1,least(coalesce((p_payload->>'page')::integer,1),10000));ps:=greatest(1,least(coalesce((p_payload->>'pageSize')::integer,30),50));
 select count(*),count(*) filter(where n.read_at is null) into total,unread from lumo_private.case_notifications n where n.audience=audience and(n.audience='consumer' or n.merchant_id=business) and lumo_private.case_notification_access(n,actor);
 select coalesce(jsonb_agg(lumo_private.case_notification_json(x) order by x.created_at desc,x.id),'[]'::jsonb) into rows from(select n.* from lumo_private.case_notifications n where n.audience=audience and(n.audience='consumer' or n.merchant_id=business) and lumo_private.case_notification_access(n,actor) order by n.created_at desc,n.id limit ps offset (pg-1)*ps)x;
 return jsonb_build_object('ok',true,'notifications',rows,'unreadCount',unread,'total',total,'page',pg,'pageSize',ps);
exception when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('ok',false,'code','INVALID_INPUT');
end $$;
revoke all on function lumo_private.case_status_label(text),lumo_private.case_notification_access(lumo_private.case_notifications,uuid),lumo_private.case_notification_json(lumo_private.case_notifications),lumo_private.publish_case_update(),public.lumo_case_inbox(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.lumo_case_inbox(jsonb) to service_role;

-- Extend the existing reviewed admin command; identity, roles and revision checks stay intact.
do $patch$
declare src text;old text;replacement text;
begin
 src:=pg_get_functiondef('public.lumo_admin_service(text,jsonb)'::regprocedure);
 old:='   old:=lumo_private.admin_case_json(uid);';
 replacement:=$text$   if p_payload?'customerUpdate' and (jsonb_typeof(p_payload->'customerUpdate') is distinct from 'string' or length(trim(p_payload->>'customerUpdate'))>600) then return jsonb_build_object('ok',false,'code','INVALID_INPUT','message','Write a customer update under 600 characters.');end if;
$text$||old;
 -- This seam occurs only in cases.update.
 if strpos(src,old)=0 or strpos(src,'perform lumo_private.admin_sync_source_case(uid);')=0 then raise exception 'Case publication seam changed; review before applying';end if;
 src:=replace(src,old,replacement);
 old:='   update lumo_private.admin_cases set subject=';
 if strpos(src,old)=0 then raise exception 'Case write seam changed';end if;
 src:=replace(src,old,'   update lumo_private.admin_cases set customer_message=case when p_payload?''customerUpdate'' then trim(p_payload->>''customerUpdate'') else customer_message end,subject=');
 src:=replace(src,'   perform lumo_private.admin_sync_source_case(uid);','   -- Customer-visible source updates and inbox entries are committed by the trigger.');
 src:=replace(src,'Customer updates are drafts; this portal does not send email or SMS.','Case status changes and published replies create in-app updates. Internal notes stay private. No email or SMS is sent.');
 execute src;
 src:=pg_get_functiondef('lumo_private.admin_case_json(uuid)'::regprocedure);
 old:='''subject'',c.subject';
 if strpos(src,old)=0 then raise exception 'Case projection seam changed';end if;
 execute replace(src,old,'''customerMessage'',c.customer_message,'||old);
end $patch$;

