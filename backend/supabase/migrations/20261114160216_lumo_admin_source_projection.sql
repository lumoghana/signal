-- Project support sources on writes, not by globally scanning customer state on every admin read.
-- Existing case statuses/assignments and internal notes stay authoritative and unchanged.
create function lumo_private.admin_source_time(p_text text,p_fallback timestamptz) returns timestamptz language plpgsql stable set search_path='' as $$
begin return coalesce(nullif(p_text,'')::timestamptz,p_fallback,clock_timestamp());
exception when invalid_datetime_format or datetime_field_overflow then return coalesce(p_fallback,clock_timestamp());end $$;
create function lumo_private.admin_project_consumer_cases(p_user uuid,p_state jsonb,p_updated timestamptz) returns void language sql set search_path='' as $$
 insert into lumo_private.admin_cases(source,source_id,subject,body,category,status,customer_id,transaction_id,created_at,updated_at,due_at)
 select 'consumer','consumer:'||p_user::text||':'||(c.value->>'id'),left(coalesce(nullif(c.value->>'title',''),'Consumer support request'),160),left(coalesce(c.value->>'body',''),10000),
 case when c.value->>'category'='payment' then 'payment' when c.value->>'category'='bug' then 'technical' else 'general' end,
 case when c.value->>'status'='resolved' then 'resolved' when c.value->>'status'='reviewing' then 'in_progress' else 'open' end,p_user,
 (select ap.journal_id from lumo_private.approved_postings ap where ap.user_id=p_user and ap.transaction_id=c.value->>'transactionId' limit 1),
 lumo_private.admin_source_time(c.value->>'createdAt',p_updated),coalesce(p_updated,clock_timestamp()),lumo_private.admin_source_time(c.value->>'createdAt',p_updated)+interval '24 hours'
 from jsonb_array_elements(lumo_private.admin_array(p_state#>'{account,supportCases}')) c where nullif(c.value->>'id','') is not null
 on conflict(source_id) do nothing;
$$;
create function lumo_private.admin_project_merchant_cases(p_merchant uuid,p_owner uuid,p_created timestamptz,p_business jsonb) returns void language sql set search_path='' as $$
 insert into lumo_private.admin_cases(source,source_id,subject,body,category,status,customer_id,merchant_id,transaction_id,created_at,updated_at,due_at)
 select 'merchant','merchant:'||p_merchant::text||':'||(t.value->>'id'),left(coalesce(nullif(t.value->>'subject',''),'Merchant support request'),160),left(coalesce(t.value->>'message',''),10000),'merchant',
 case when t.value->>'status'='resolved' then 'resolved' when t.value->>'status'='investigating' then 'in_progress' else 'open' end,p_owner,p_merchant,
 (select j.id from lumo_private.journals j where j.id::text=t.value->>'transactionId' or j.reference=coalesce(t.value->>'paymentReference',t.value->>'transactionId') limit 1),
 lumo_private.admin_source_time(t.value->>'createdAt',p_created),lumo_private.admin_source_time(t.value->>'updatedAt',p_created),lumo_private.admin_source_time(t.value->>'createdAt',p_created)+interval '24 hours'
 from jsonb_array_elements(lumo_private.admin_array(p_business->'tickets')) t where nullif(t.value->>'id','') is not null
 on conflict(source_id) do nothing;
$$;
create function lumo_private.admin_source_consumer_trigger() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then if old.state#>'{account,supportCases}' is not distinct from new.state#>'{account,supportCases}' then return new;end if;end if;
 perform lumo_private.admin_project_consumer_cases(new.user_id,new.state,new.updated_at);return new;
end $$;
create function lumo_private.admin_source_merchant_trigger() returns trigger language plpgsql set search_path='' as $$
declare business record;m lumo_private.merchants%rowtype;
begin
 for business in select key,value from jsonb_each(coalesce(new.document->'businesses','{}'::jsonb)) loop
  if tg_op='UPDATE' then if business.value->'tickets' is not distinct from old.document#>array['businesses',business.key,'tickets'] then continue;end if;end if;
  select * into m from lumo_private.merchants where id::text=business.key;
  if found then perform lumo_private.admin_project_merchant_cases(m.id,m.owner_user_id,m.created_at,business.value);end if;
 end loop;return new;
end $$;
create function lumo_private.admin_source_ticket_trigger() returns trigger language plpgsql set search_path='' as $$
begin
 insert into lumo_private.admin_cases(source,source_id,subject,body,status,customer_id,created_at,updated_at,due_at)
 values('consumer','ticket:'||new.id::text,new.subject,new.body,case when new.status='resolved' then 'resolved' else 'open' end,new.user_id,new.created_at,new.created_at,new.created_at+interval '24 hours') on conflict(source_id) do nothing;
 return new;
end $$;
create index if not exists approved_postings_product_reference on lumo_private.approved_postings(user_id,transaction_id) where transaction_id is not null;
create trigger admin_project_consumer_support after insert or update of state on lumo_private.approved_states for each row execute function lumo_private.admin_source_consumer_trigger();
create trigger admin_project_merchant_support after insert or update of document on lumo_private.approved_merchant_network for each row execute function lumo_private.admin_source_merchant_trigger();
create trigger admin_project_retained_support after insert or update on lumo_private.support_tickets for each row execute function lumo_private.admin_source_ticket_trigger();

-- Remove the old read-time import seam without replacing or weakening the reviewed access logic.
do $patch$
declare definition text;start_at integer;end_at integer;
begin
 definition:=pg_get_functiondef('public.lumo_admin_service(text,jsonb)'::regprocedure);
 start_at:=strpos(definition,' -- Import existing source tickets once, preserving the source and its identity.');
 end_at:=strpos(definition,' if p_command like ''services.%'' then');
 if start_at=0 or end_at<=start_at then raise exception 'Admin source projection seam changed; review before applying';end if;
 execute substr(definition,1,start_at-1)||substr(definition,end_at);
end $patch$;

-- One-time backfill. Every later case is projected transactionally with its source write.
do $backfill$
declare st record;business record;
begin
 insert into lumo_private.admin_cases(source,source_id,subject,body,status,customer_id,created_at,updated_at,due_at)
 select 'consumer','ticket:'||t.id::text,t.subject,t.body,case when t.status='resolved' then 'resolved' else 'open' end,t.user_id,t.created_at,t.created_at,t.created_at+interval '24 hours' from lumo_private.support_tickets t on conflict(source_id) do nothing;
 for st in select user_id,state,updated_at from lumo_private.approved_states where jsonb_array_length(lumo_private.admin_array(state#>'{account,supportCases}'))>0 loop
  perform lumo_private.admin_project_consumer_cases(st.user_id,st.state,st.updated_at);
 end loop;
 for business in select m.id,m.owner_user_id,m.created_at,b.value from lumo_private.approved_merchant_network n cross join lateral jsonb_each(n.document->'businesses') b join lumo_private.merchants m on m.id::text=b.key where n.id loop
  perform lumo_private.admin_project_merchant_cases(business.id,business.owner_user_id,business.created_at,business.value);
 end loop;
end $backfill$;

-- A trusted server-only input for the SAME consumer buildState/getSummary calculations.
-- The Edge must never pass this snapshot through to the browser.
create function public.lumo_admin_summary(p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;sid uuid;target uuid;staff lumo_private.admin_staff%rowtype;snapshot jsonb;
begin
 if (coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role') is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN','message','Administrative access is required.');end if;
 if jsonb_typeof(p_payload) is distinct from 'object' then return jsonb_build_object('ok',false,'code','INVALID_INPUT','message','Check the summary request.');end if;
 begin actor:=(p_payload->>'actor')::uuid;sid:=(p_payload->>'session')::uuid;target:=coalesce(nullif(p_payload->>'id',''),nullif(p_payload->>'customerId',''))::uuid;
 exception when invalid_text_representation then return jsonb_build_object('ok',false,'code','INVALID_INPUT','message','Check the staff session and customer reference.');end;
 if actor is null or sid is null or not exists(select 1 from auth.sessions se join auth.users u on u.id=se.user_id where se.id=sid and se.user_id=actor and (se.not_after is null or se.not_after>clock_timestamp()) and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()) and not coalesce(u.is_anonymous,false)) then return jsonb_build_object('ok',false,'code','SESSION_REVOKED','message','Your staff session has ended.');end if;
 select * into staff from lumo_private.admin_staff where user_id=actor and status='active';
 if not found then return jsonb_build_object('ok',false,'code','STAFF_REQUIRED','message','Active staff access is required.');end if;
 if p_payload->>'aal' is distinct from 'aal2' or not exists(select 1 from auth.mfa_factors where user_id=actor and status='verified') then return jsonb_build_object('ok',false,'code','MFA_REQUIRED','message','Verify your authenticator code.');end if;
 if staff.role in ('technical','merchant_ops') then return jsonb_build_object('ok',false,'code','FORBIDDEN','message','Personal money planning requires a support or financial review role.');end if;
 if target is null or not exists(select 1 from lumo_private.profiles p join lumo_private.accounts a on a.owner_user_id=p.user_id and a.kind='consumer' where p.user_id=target) then return jsonb_build_object('ok',false,'code','NOT_FOUND','message','Customer not found.');end if;
 snapshot:=lumo_private.approved_load(target);
 perform lumo_private.admin_log(actor,staff.role,'customer.summary','customer',target::text);
 return jsonb_build_object('ok',true,'data',jsonb_build_object('snapshot',snapshot));
end $$;
revoke all on function lumo_private.admin_source_time(text,timestamptz),lumo_private.admin_project_consumer_cases(uuid,jsonb,timestamptz),lumo_private.admin_project_merchant_cases(uuid,uuid,timestamptz,jsonb),lumo_private.admin_source_consumer_trigger(),lumo_private.admin_source_merchant_trigger(),lumo_private.admin_source_ticket_trigger(),public.lumo_admin_summary(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.lumo_admin_summary(jsonb) to service_role;
