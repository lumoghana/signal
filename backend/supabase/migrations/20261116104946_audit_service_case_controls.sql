-- Protect operator intent independently of health-probe counters.
alter table lumo_private.service_availability add column revision bigint not null default 1 check(revision>0);
do $patch$
declare definition text;before_text text;after_text text;
begin
 definition:=pg_get_functiondef('lumo_private.service_json(lumo_private.service_availability,boolean)'::regprocedure);
 before_text:='''healthExplanation'',';
 after_text:='''version'',s.revision,''publicMessage'',s.public_message,''healthExplanation'',';
 if strpos(definition,before_text)=0 then raise exception 'Reviewed service DTO seam changed';end if;
 execute replace(definition,before_text,after_text);
 definition:=pg_get_functiondef('lumo_private.admin_services(text,jsonb)'::regprocedure);
 before_text:=' before_value:=lumo_private.service_json(s,true);';
 after_text:=$body$ if not(p_payload ? 'expectedVersion') or jsonb_typeof(p_payload->'expectedVersion') is distinct from 'number' or (p_payload->>'expectedVersion') !~ '^[0-9]{1,16}$' then return jsonb_build_object('ok',false,'code','INVALID_INPUT','message','Refresh this service before saving.');end if;
 if (p_payload->>'expectedVersion')::bigint<>s.revision then return jsonb_build_object('ok',false,'code','REVISION_CONFLICT','message','Another operator changed this service. Refresh before saving.','data',lumo_private.service_json(s,true));end if;
 before_value:=lumo_private.service_json(s,true);$body$;
 if strpos(definition,before_text)=0 then raise exception 'Reviewed service intent seam changed';end if;
 definition:=replace(definition,before_text,after_text);
 before_text:='set mode=s.mode,public_message=s.public_message';after_text:='set revision=revision+1,mode=s.mode,public_message=s.public_message';
 if strpos(definition,before_text)=0 then raise exception 'Reviewed service revision seam changed';end if;
 execute replace(definition,before_text,after_text);
end $patch$;

-- A transaction complaint has one explicitly chosen audience, validated against the original posting.
create function lumo_private.admin_case_contact_valid(p_case lumo_private.admin_cases) returns boolean
language sql stable set search_path='' as $$
 select case when p_case.merchant_id is not null and (p_case.source='merchant' or p_case.customer_id is null) then
  exists(select 1 from lumo_private.merchants m where m.id=p_case.merchant_id and
   (p_case.transaction_id is null or exists(select 1 from lumo_private.journals j left join lumo_private.shops sh on sh.id=j.shop_id where j.id=p_case.transaction_id and (sh.merchant_id=m.id or m.account_id in(j.payer_account_id,j.payee_account_id)))))
 when p_case.customer_id is not null and (p_case.source='consumer' or p_case.merchant_id is null) then
  exists(select 1 from lumo_private.profiles p where p.user_id=p_case.customer_id and
   (p_case.transaction_id is null or exists(select 1 from lumo_private.journals j join lumo_private.accounts a on a.id in(j.payer_account_id,j.payee_account_id) where j.id=p_case.transaction_id and a.owner_user_id=p.user_id and a.kind='consumer')))
 else false end;
$$;
create function lumo_private.admin_case_contact_guard() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then
  if new.source='admin' and new.transaction_id is not null and not lumo_private.admin_case_contact_valid(new) then raise exception using errcode='23514',message='Choose a private case contact who belongs to the original payment.';end if;
 elsif (new.customer_id,new.merchant_id,new.transaction_id) is distinct from (old.customer_id,old.merchant_id,old.transaction_id) then
  if old.source<>'admin' or not lumo_private.admin_case_contact_valid(new) then raise exception using errcode='23514',message='Case contact does not belong to the original record.';end if;
 end if;
 if new.customer_message is not null and trim(new.customer_message)<>'' and (tg_op='INSERT' or new.customer_message is distinct from old.customer_message) and not lumo_private.admin_case_contact_valid(new) then
  raise exception using errcode='23514',message='Select a valid private recipient before publishing a case reply.';
 end if;
 return new;
end $$;
create trigger admin_case_validate_contact before insert or update of customer_id,merchant_id,transaction_id,customer_message on lumo_private.admin_cases for each row execute function lumo_private.admin_case_contact_guard();
revoke all on function lumo_private.admin_case_contact_valid(lumo_private.admin_cases),lumo_private.admin_case_contact_guard() from public,anon,authenticated,service_role;

create function lumo_private.admin_case_communication(p_case uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('canPublish',lumo_private.admin_case_contact_valid(c),
  'intendedAudience',case when c.merchant_id is not null and (c.source='merchant' or c.customer_id is null) then 'merchant' when c.customer_id is not null and (c.source='consumer' or c.merchant_id is null) then 'consumer' else 'none' end,
  'recipientId',case when c.merchant_id is not null and (c.source='merchant' or c.customer_id is null) then c.merchant_id else c.customer_id end,
  'channel','in_app','backgroundPush',false,
  'notifications',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'recipientId',n.recipient_id,'audience',n.audience,'revision',n.case_revision,'createdAt',n.created_at,'readAt',n.read_at,'status',case when n.read_at is null then 'unread' else 'read' end) order by n.created_at,n.id) from lumo_private.case_notifications n where n.case_id=c.id),'[]'::jsonb))
 from lumo_private.admin_cases c where c.id=p_case;
$$;
revoke all on function lumo_private.admin_case_communication(uuid) from public,anon,authenticated,service_role;

do $patch$
declare definition text;before_text text;after_text text;
begin
 definition:=pg_get_functiondef('public.lumo_admin_service(text,jsonb)'::regprocedure);
 before_text:='   update lumo_private.admin_cases set customer_message=';
 after_text:=$body$   if (p_payload ? 'customerId' or p_payload ? 'merchantId') and case_row.source<>'admin' then return jsonb_build_object('ok',false,'code','FORBIDDEN','message','The source account remains the case contact.');end if;
   update lumo_private.admin_cases set customer_id=case when p_payload ? 'customerId' then nullif(p_payload->>'customerId','')::uuid else customer_id end,merchant_id=case when p_payload ? 'merchantId' then nullif(p_payload->>'merchantId','')::uuid else merchant_id end,
   due_at=case when p_payload ? 'priority' and p_payload->>'priority' is distinct from priority then least(due_at,clock_timestamp()+case p_payload->>'priority' when 'urgent' then interval '1 hour' when 'high' then interval '4 hours' else interval '24 hours' end) else due_at end,customer_message=$body$;
 if strpos(definition,before_text)=0 then raise exception 'Reviewed case recipient update seam changed';end if;
 definition:=replace(definition,before_text,after_text);
 before_text:=' if not is_write then perform lumo_private.admin_log';
 after_text:=$body$ if p_command in('cases.get','cases.create','cases.update','cases.note') then result:=result||jsonb_build_object('communication',lumo_private.admin_case_communication(uid));end if;
 if not is_write then perform lumo_private.admin_log$body$;
 if strpos(definition,before_text)=0 then raise exception 'Reviewed case communication seam changed';end if;
 execute replace(definition,before_text,after_text);
end $patch$;
