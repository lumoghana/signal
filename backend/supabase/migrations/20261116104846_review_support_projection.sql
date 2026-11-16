-- Source replies and privacy requests enter the same permissioned support queue.
-- No financial history is changed and no deletion/erasure is performed here.
alter table lumo_private.admin_cases add column source_reference text;
alter table lumo_private.admin_cases add column source_context jsonb not null default '{}'::jsonb;
create index admin_cases_source_reference on lumo_private.admin_cases(source_reference) where source_reference is not null;
create table lumo_private.admin_case_messages(
 id uuid primary key default gen_random_uuid(),case_id uuid not null references lumo_private.admin_cases(id),
 source_message_id text not null check(length(source_message_id) between 1 and 300),
 author_kind text not null check(author_kind in('consumer','merchant','support','system')),
 actor_id uuid references auth.users(id),body text not null check(length(body) between 1 and 10000),
 source_at timestamptz not null,recorded_at timestamptz not null default clock_timestamp(),
 unique(case_id,source_message_id)
);
create index admin_case_messages_case on lumo_private.admin_case_messages(case_id,source_at,id);
alter table lumo_private.admin_case_messages enable row level security;
revoke all on lumo_private.admin_case_messages from public,anon,authenticated,service_role;
create trigger admin_case_messages_immutable before update or delete on lumo_private.admin_case_messages for each row execute function lumo_private.immutable_posting();

create function lumo_private.admin_ingest_case_message(p_case uuid,p_key text,p_kind text,p_body text,p_at timestamptz,p_actor uuid default null) returns boolean language plpgsql set search_path='' as $$
declare added integer;
begin
 if nullif(trim(p_body),'') is null then return false;end if;
 insert into lumo_private.admin_case_messages(case_id,source_message_id,author_kind,actor_id,body,source_at)
 values(p_case,left(p_key,300),p_kind,p_actor,left(p_body,10000),coalesce(p_at,clock_timestamp())) on conflict(case_id,source_message_id) do nothing;
 get diagnostics added=row_count;return added=1;
end $$;

create function lumo_private.admin_reopen_source_case(p_case uuid,p_actor uuid,p_kind text) returns void language plpgsql set search_path='' as $$
declare previous text;before_status text;
begin
 if current_setting('lumo.source_backfill',true)='on' then return;end if;
 select status into before_status from lumo_private.admin_cases where id=p_case for update;
 previous:=current_setting('lumo.source_case_reply',true);perform set_config('lumo.source_case_reply','on',true);
 update lumo_private.admin_cases set status=case when status in('resolved','closed') then 'open' when status='waiting_customer' then 'in_progress' else status end,
 resolved_at=case when status in('resolved','closed') then null else resolved_at end,updated_at=clock_timestamp(),revision=revision+1,
 due_at=case when status in('resolved','closed') then clock_timestamp()+interval '24 hours' else due_at end
 where id=p_case;
 perform set_config('lumo.source_case_reply',coalesce(previous,''),true);
 perform lumo_private.admin_log(p_actor,p_kind,'source.reply','case',p_case::text,'A new customer reply is available',p_case,jsonb_build_object('status',before_status),null);
end $$;

create or replace function lumo_private.admin_project_consumer_cases(p_user uuid,p_state jsonb,p_updated timestamptz) returns void language plpgsql set search_path='' as $$
declare c jsonb;u jsonb;cid uuid;added boolean;is_new boolean;kind text;key text;body text;
begin
 for c in select value from jsonb_array_elements(lumo_private.admin_array(p_state#>'{account,supportCases}')) where nullif(value->>'id','') is not null loop
  cid:=null;
  insert into lumo_private.admin_cases(source,source_id,source_reference,subject,body,category,status,customer_id,transaction_id,created_at,updated_at,due_at)
  values('consumer','consumer:'||p_user::text||':'||(c->>'id'),left(nullif(c->>'reference',''),120),left(coalesce(nullif(c->>'title',''),'Consumer support request'),160),left(coalesce(c->>'body',''),10000),
   case when c->>'category'='payment' then 'payment' when c->>'category'='bug' then 'technical' when c->>'category'='privacy' then 'account' else 'general' end,
   case when c->>'status'='resolved' then 'resolved' when c->>'status'='reviewing' then 'in_progress' else 'open' end,p_user,
   (select ap.journal_id from lumo_private.approved_postings ap where ap.user_id=p_user and ap.transaction_id=c->>'transactionId' limit 1),
   lumo_private.admin_source_time(c->>'createdAt',p_updated),coalesce(p_updated,clock_timestamp()),lumo_private.admin_source_time(c->>'createdAt',p_updated)+interval '24 hours')
  on conflict(source_id) do nothing returning id into cid;
  is_new:=cid is not null;
  if cid is null then select id into cid from lumo_private.admin_cases where source_id='consumer:'||p_user::text||':'||(c->>'id');end if;
  update lumo_private.admin_cases set source_reference=coalesce(source_reference,left(nullif(c->>'reference',''),120)) where id=cid;
  perform lumo_private.admin_ingest_case_message(cid,'initial','consumer',c->>'body',lumo_private.admin_source_time(c->>'createdAt',p_updated),p_user);
  for u in select value from jsonb_array_elements(lumo_private.admin_array(c->'updates')) where value->>'kind' in('you','support') loop
   kind:=case when u->>'kind'='you' then 'consumer' else 'support' end;
   key:=case when kind='support' then 'outbound:' else 'consumer:' end||coalesce(nullif(u->>'id',''),md5(coalesce(u->>'at','')||coalesce(u->>'text','')));
   added:=lumo_private.admin_ingest_case_message(cid,key,kind,u->>'text',lumo_private.admin_source_time(u->>'at',p_updated),case when kind='consumer' then p_user else null end);
   if added and not is_new and kind='consumer' then perform lumo_private.admin_reopen_source_case(cid,p_user,'consumer');end if;
  end loop;
 end loop;
end $$;

create or replace function lumo_private.admin_project_merchant_cases(p_merchant uuid,p_owner uuid,p_created timestamptz,p_business jsonb) returns void language plpgsql set search_path='' as $$
declare t jsonb;u jsonb;cid uuid;is_new boolean;added boolean;kind text;context jsonb;
begin
 for t in select value from jsonb_array_elements(lumo_private.admin_array(p_business->'tickets')) where nullif(value->>'id','') is not null loop
  context:=lumo_private.admin_pick(t,array['createdByUserId','createdByStaffId','createdByName','createdByRole','counterId','shiftId','shopId']);cid:=null;
  insert into lumo_private.admin_cases(source,source_id,source_reference,source_context,subject,body,category,status,customer_id,merchant_id,transaction_id,created_at,updated_at,due_at)
  values('merchant','merchant:'||p_merchant::text||':'||(t->>'id'),left(coalesce(nullif(t->>'reference',''),t->>'id'),120),context,left(coalesce(nullif(t->>'subject',''),'Merchant support request'),160),left(coalesce(t->>'message',''),10000),'merchant',
   case when t->>'status'='resolved' then 'resolved' when t->>'status'='investigating' then 'in_progress' else 'open' end,p_owner,p_merchant,
   (select j.id from lumo_private.journals j where j.id::text=t->>'transactionId' or j.reference=coalesce(t->>'paymentReference',t->>'transactionId') limit 1),
   lumo_private.admin_source_time(t->>'createdAt',p_created),lumo_private.admin_source_time(t->>'updatedAt',p_created),lumo_private.admin_source_time(t->>'createdAt',p_created)+interval '24 hours')
  on conflict(source_id) do nothing returning id into cid;
  is_new:=cid is not null;
  if cid is null then select id into cid from lumo_private.admin_cases where source_id='merchant:'||p_merchant::text||':'||(t->>'id');end if;
  update lumo_private.admin_cases set source_reference=coalesce(source_reference,left(coalesce(nullif(t->>'reference',''),t->>'id'),120)),source_context=case when source_context='{}'::jsonb then context else source_context end where id=cid;
  perform lumo_private.admin_ingest_case_message(cid,'initial','merchant',t->>'message',lumo_private.admin_source_time(t->>'createdAt',p_created),p_owner);
  for u in select value from jsonb_array_elements(lumo_private.admin_array(t->'responses')) loop
   kind:=case when u->>'id' like 'case-update-%' or u->>'id' like 'support-%' or u->>'by'='Lumo Support' then 'support' else 'merchant' end;
   added:=lumo_private.admin_ingest_case_message(cid,case when kind='support' then 'outbound:' else 'merchant:' end||coalesce(nullif(u->>'id',''),md5(coalesce(u->>'createdAt','')||coalesce(u->>'message',''))),kind,u->>'message',lumo_private.admin_source_time(u->>'createdAt',p_created),case when kind='merchant' then p_owner else null end);
   if added and not is_new and kind='merchant' then perform lumo_private.admin_reopen_source_case(cid,p_owner,'merchant');end if;
  end loop;
 end loop;
end $$;

create function lumo_private.admin_project_privacy_requests(p_user uuid,p_state jsonb,p_updated timestamptz) returns void language plpgsql set search_path='' as $$
declare r jsonb;cid uuid;previous text;
begin
 for r in select value from jsonb_array_elements(lumo_private.admin_array(p_state#>'{account,requests}')) where value->>'type'='deletion' and nullif(value->>'id','') is not null loop
  insert into lumo_private.admin_cases(source,source_id,source_reference,subject,body,category,status,customer_id,created_at,updated_at,due_at,resolution,resolved_at)
  values('consumer','privacy:'||p_user::text||':'||(r->>'id'),left(r->>'id',120),'Privacy deletion review','Review the customer deletion request, verify authority, and record the retention decision and fulfilment evidence. Recording or resolving this case does not erase financial records.','account',case when r->>'status'='cancelled' then 'closed' else 'open' end,p_user,lumo_private.admin_source_time(r->>'at',p_updated),coalesce(p_updated,clock_timestamp()),lumo_private.admin_source_time(r->>'at',p_updated)+interval '24 hours',case when r->>'status'='cancelled' then 'Customer cancelled the deletion request. No deletion was performed.' else '' end,case when r->>'status'='cancelled' then lumo_private.admin_source_time(r->>'updatedAt',p_updated) else null end)
  on conflict(source_id) do nothing;
  select id into cid from lumo_private.admin_cases where source_id='privacy:'||p_user::text||':'||(r->>'id');
  perform lumo_private.admin_ingest_case_message(cid,'privacy-request','consumer','Customer requested a privacy deletion review.',lumo_private.admin_source_time(r->>'at',p_updated),p_user);
  if r->>'status'='cancelled' and lumo_private.admin_ingest_case_message(cid,'privacy-cancelled','consumer','Customer cancelled the deletion request.',lumo_private.admin_source_time(r->>'updatedAt',p_updated),p_user) then
   previous:=current_setting('lumo.source_case_reply',true);perform set_config('lumo.source_case_reply','on',true);
   update lumo_private.admin_cases set status='closed',resolution='Customer cancelled the deletion request. No deletion was performed.',resolved_at=clock_timestamp(),updated_at=clock_timestamp(),revision=revision+1 where id=cid and status not in('resolved','closed');
   perform set_config('lumo.source_case_reply',coalesce(previous,''),true);
   perform lumo_private.admin_log(p_user,'consumer','privacy.cancelled','case',cid::text,'Customer cancelled the request',cid);
  end if;
 end loop;
end $$;

create or replace function lumo_private.admin_source_consumer_trigger() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' or old.state#>'{account,supportCases}' is distinct from new.state#>'{account,supportCases}' then perform lumo_private.admin_project_consumer_cases(new.user_id,new.state,new.updated_at);end if;
 if tg_op='INSERT' or old.state#>'{account,requests}' is distinct from new.state#>'{account,requests}' then perform lumo_private.admin_project_privacy_requests(new.user_id,new.state,new.updated_at);end if;
 return new;
end $$;

-- Intercept the existing outbound trigger only for source replies. A customer reply is
-- not a new support reply and must not generate a recursive source write/notification.
do $patch$
declare definition text;needle text:=E'begin\n if new.status is not distinct from old.status';
begin
 definition:=pg_get_functiondef('lumo_private.publish_case_update()'::regprocedure);
 if strpos(definition,needle)=0 then raise exception 'Case outbound seam changed; review before applying';end if;
 definition:=replace(definition,needle,E'begin\n if current_setting(''lumo.source_case_reply'',true)=''on'' then return new;end if;\n if new.status is not distinct from old.status');execute definition;
end $patch$;

create function lumo_private.admin_record_public_case_message() returns trigger language plpgsql set search_path='' as $$
declare body text;st jsonb;items jsonb;key text;
begin
 if current_setting('lumo.source_case_reply',true)='on' then return new;end if;
 if new.status is not distinct from old.status and (new.customer_message is not distinct from old.customer_message or trim(new.customer_message)='') then return new;end if;
 body:=case when new.customer_message is distinct from old.customer_message and trim(new.customer_message)<>'' then trim(new.customer_message) else 'Case '||new.reference||': '||lumo_private.case_status_label(new.status)||'. Open your case for the latest update.' end;
 perform lumo_private.admin_ingest_case_message(new.id,'outbound:case-update-'||new.id::text||'-'||new.revision::text,'support',body,new.updated_at,null);
 if new.source_id like 'privacy:'||new.customer_id::text||':%' then
  key:=substr(new.source_id,length('privacy:'||new.customer_id::text||':')+1);
  select state into st from lumo_private.approved_states where user_id=new.customer_id for update;
  select coalesce(jsonb_agg(case when v.value->>'id'=key then v.value||jsonb_build_object('status',case when v.value->>'status'='cancelled' then 'cancelled' when new.status in('resolved','closed') then 'reviewed' else 'requested' end,'caseReference',new.reference,'reviewStatus',new.status,'reviewResolution',new.resolution,'reviewedAt',case when new.status in('resolved','closed') then new.updated_at else null end,'erasureExecuted',false) else v.value end order by v.n),'[]'::jsonb) into items from jsonb_array_elements(lumo_private.admin_array(st#>'{account,requests}')) with ordinality v(value,n);
  if st is not null then update lumo_private.approved_states set state=jsonb_set(st,'{account,requests}',items),revision=revision+1,updated_at=clock_timestamp() where user_id=new.customer_id;end if;
 end if;
 return new;
end $$;
create trigger admin_record_public_message after update on lumo_private.admin_cases for each row execute function lumo_private.admin_record_public_case_message();

-- Source writes already hold their account/network row before projecting a case.
-- Staff writes use that same order so a simultaneous reply and update cannot invert it.
create function lumo_private.admin_lock_case_source(p_case uuid) returns void language plpgsql set search_path='' as $$
declare c lumo_private.admin_cases%rowtype;
begin
 select * into c from lumo_private.admin_cases where id=p_case;
 if c.source_id like 'merchant:%' then perform 1 from lumo_private.approved_merchant_network where id for update;
 elsif c.source_id like 'consumer:%' or c.source_id like 'privacy:%' then perform 1 from lumo_private.approved_states where user_id=c.customer_id for update;
 end if;
end $$;

-- Preserve all deployed access rules and notification patches, changing only reviewed DTO seams.
do $patch$
declare definition text;needle text;
begin
 definition:=pg_get_functiondef('lumo_private.admin_case_json(uuid)'::regprocedure);needle:='''sourceId'',c.source_id';
 if strpos(definition,needle)=0 then raise exception 'Case DTO seam changed';end if;
 execute replace(definition,needle,needle||',''sourceReference'',c.source_reference,''creatorContext'',c.source_context,''privacyReview'',c.source_id like ''privacy:%''');
 definition:=pg_get_functiondef('public.lumo_admin_service(text,jsonb)'::regprocedure);
 needle:='''notes'',(select coalesce(jsonb_agg';
 if strpos(definition,needle)=0 then raise exception 'Case detail seam changed';end if;
 definition:=replace(definition,needle,'''messages'',(select coalesce(jsonb_agg(jsonb_build_object(''id'',m.id,''body'',m.body,''authorKind'',m.author_kind,''createdAt'',m.source_at) order by m.source_at,m.id),''[]''::jsonb) from lumo_private.admin_case_messages m where m.case_id=uid),'||needle);
 needle:='uid:=ident::uuid;select * into case_row from lumo_private.admin_cases where id=uid for update;';
 if strpos(definition,needle)=0 then raise exception 'Case locking seam changed';end if;
 definition:=replace(definition,needle,'uid:=ident::uuid;perform lumo_private.admin_lock_case_source(uid);select * into case_row from lumo_private.admin_cases where id=uid for update;');
 needle:='c.reference ilike ''%''||q||''%''';
 if strpos(definition,needle)=0 then raise exception 'Case search seam changed';end if;
 definition:=replace(definition,needle,'('||needle||' or c.source_reference ilike ''%''||q||''%'')');execute definition;
end $patch$;

do $patch$
declare definition text;needle text:='''updatedAt'',c.updated_at,''updates'',rows';
begin
 definition:=pg_get_functiondef('public.lumo_case_inbox(jsonb)'::regprocedure);
 if strpos(definition,needle)=0 then raise exception 'Case inbox source seam changed';end if;
 execute replace(definition,needle,needle||',''source'',case when audience=''consumer'' and c.customer_id=actor and c.source_id like ''consumer:''||actor::text||'':%'' then jsonb_build_object(''type'',''consumer_support'',''id'',substr(c.source_id,length(''consumer:''||actor::text||'':'')+1)) when audience=''merchant'' and c.merchant_id=business and c.source_id like ''merchant:''||business::text||'':%'' then jsonb_build_object(''type'',''merchant_ticket'',''id'',substr(c.source_id,length(''merchant:''||business::text||'':'')+1)) else null end');
end $patch$;

revoke all on function lumo_private.admin_ingest_case_message(uuid,text,text,text,timestamptz,uuid),lumo_private.admin_reopen_source_case(uuid,uuid,text),lumo_private.admin_project_privacy_requests(uuid,jsonb,timestamptz),lumo_private.admin_record_public_case_message(),lumo_private.admin_lock_case_source(uuid) from public,anon,authenticated,service_role;

-- Import historical public messages without treating old messages as new replies.
do $backfill$
declare st record;b record;previous text;
begin
 previous:=current_setting('lumo.source_backfill',true);perform set_config('lumo.source_backfill','on',true);
 for st in select user_id,state,updated_at from lumo_private.approved_states loop
  perform lumo_private.admin_project_consumer_cases(st.user_id,st.state,st.updated_at);
  perform lumo_private.admin_project_privacy_requests(st.user_id,st.state,st.updated_at);
 end loop;
 for b in select m.id,m.owner_user_id,m.created_at,x.value from lumo_private.approved_merchant_network n cross join lateral jsonb_each(n.document->'businesses') x join lumo_private.merchants m on m.id::text=x.key where n.id loop
  perform lumo_private.admin_project_merchant_cases(b.id,b.owner_user_id,b.created_at,b.value);
 end loop;
 perform set_config('lumo.source_backfill',coalesce(previous,''),true);
end $backfill$;
