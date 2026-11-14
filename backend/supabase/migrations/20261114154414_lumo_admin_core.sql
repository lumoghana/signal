-- Private Lumo operations. All amounts remain integer pesewas; no ledger rewriting.
create table lumo_private.admin_staff (
 user_id uuid primary key references auth.users(id),display_name text not null check(length(display_name) between 1 and 80),
 email text not null unique check(length(email) between 3 and 254),
 role text not null check(role in ('support','supervisor','merchant_ops','finance','risk','technical','auditor','super_admin')),
 status text not null default 'active' check(status in ('active','disabled')),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
create table lumo_private.admin_setup_tokens (
 id uuid primary key default gen_random_uuid(),token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 email text,display_name text,role text not null check(role in ('support','supervisor','merchant_ops','finance','risk','technical','auditor','super_admin')),
 expires_at timestamptz not null default clock_timestamp()+interval '24 hours',created_at timestamptz not null default clock_timestamp(),
 reserved_email text,consumed_at timestamptz,consumed_by uuid references auth.users(id),created_by uuid references lumo_private.admin_staff(user_id)
);
create table lumo_private.admin_incidents (
 id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 1 and 160),
 status text not null default 'investigating' check(status in ('investigating','identified','monitoring','resolved')),
 severity text not null default 'medium' check(severity in ('critical','high','medium','low')),
 service_id text,description text not null default '' check(length(description)<=10000),
 customer_message text not null default '' check(length(customer_message)<=600),resolution text not null default '' check(length(resolution)<=4000),
 owner_id uuid references lumo_private.admin_staff(user_id),created_by uuid not null references lumo_private.admin_staff(user_id),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),resolved_at timestamptz,revision bigint not null default 1
);
create table lumo_private.admin_cases (
 id uuid primary key default gen_random_uuid(),reference text not null unique default 'CS-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
 source text not null default 'admin' check(source in ('admin','consumer','merchant')),source_id text unique,
 subject text not null check(length(subject) between 1 and 160),body text not null default '' check(length(body)<=10000),
 category text not null default 'general' check(category in ('general','payment','account','merchant','refund','fraud','product','guest','technical')),
 priority text not null default 'normal' check(priority in ('urgent','high','normal','low')),
 status text not null default 'open' check(status in ('open','in_progress','waiting_customer','waiting_provider','escalated','resolved','closed')),
 customer_id uuid references auth.users(id),merchant_id uuid references lumo_private.merchants(id),transaction_id uuid references lumo_private.journals(id),
 guest_id text references lumo_private.guest_momo_attempts(id),incident_id uuid references lumo_private.admin_incidents(id),
 assignee_id uuid references lumo_private.admin_staff(user_id),created_by uuid references lumo_private.admin_staff(user_id),
 due_at timestamptz not null default clock_timestamp()+interval '24 hours',resolution text not null default '' check(length(resolution)<=4000),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),resolved_at timestamptz,revision bigint not null default 1
);
create index admin_cases_queue on lumo_private.admin_cases(status,priority,due_at);
create index admin_cases_customer on lumo_private.admin_cases(customer_id,created_at desc);
create index admin_cases_transaction on lumo_private.admin_cases(transaction_id) where transaction_id is not null;
create table lumo_private.admin_case_notes (
 id uuid primary key default gen_random_uuid(),case_id uuid not null references lumo_private.admin_cases(id),
 actor_id uuid not null references lumo_private.admin_staff(user_id),body text not null check(length(body) between 1 and 10000),
 kind text not null default 'internal' check(kind in ('internal','customer_update_draft','resolution')),
 created_at timestamptz not null default clock_timestamp()
);
create index admin_case_notes_case on lumo_private.admin_case_notes(case_id,created_at);
create table lumo_private.admin_audit (
 id uuid primary key default gen_random_uuid(),actor_id uuid references auth.users(id),actor_role text,
 action text not null check(length(action)<=100),entity_type text,entity_id text,
 reason text check(length(reason)<=2000),case_id uuid references lumo_private.admin_cases(id),
 before_value jsonb,after_value jsonb,created_at timestamptz not null default clock_timestamp()
);
create index admin_audit_time on lumo_private.admin_audit(created_at desc,id);
create index admin_audit_entity on lumo_private.admin_audit(entity_type,entity_id,created_at desc);
create table lumo_private.admin_approvals (
 id uuid primary key default gen_random_uuid(),action text not null check(action in ('account.suspend','account.restore','payment.refund','session.revoke','payment_link.disable')),
 entity_id text not null,reason text not null check(length(reason) between 3 and 2000),case_id uuid not null references lumo_private.admin_cases(id),
 requested_by uuid not null references lumo_private.admin_staff(user_id),decided_by uuid references lumo_private.admin_staff(user_id),
 status text not null default 'pending' check(status in ('pending','rejected','executed','approved_pending_execution')),
 decision_reason text check(length(decision_reason)<=2000),result jsonb,created_at timestamptz not null default clock_timestamp(),decided_at timestamptz,
 check(decided_by is null or decided_by<>requested_by)
);
create index admin_approvals_queue on lumo_private.admin_approvals(status,created_at);
do $lock$ declare tab text;begin
 foreach tab in array array['admin_staff','admin_setup_tokens','admin_incidents','admin_cases','admin_case_notes','admin_audit','admin_approvals'] loop
  execute format('alter table lumo_private.%I enable row level security',tab);
  execute format('revoke all on lumo_private.%I from public,anon,authenticated,service_role',tab);
 end loop;
end $lock$;
create trigger admin_audit_immutable before update or delete on lumo_private.admin_audit for each row execute function lumo_private.immutable_posting();
create trigger admin_notes_immutable before update or delete on lumo_private.admin_case_notes for each row execute function lumo_private.immutable_posting();

create function lumo_private.admin_pick(p_value jsonb,p_keys text[]) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(case when jsonb_typeof(p_value)='object' then p_value else '{}'::jsonb end) where key=any(p_keys);
$$;
create function lumo_private.admin_array(p_value jsonb) returns jsonb language sql immutable set search_path='' as $$select case when jsonb_typeof(p_value)='array' then p_value else '[]'::jsonb end$$;
create function lumo_private.admin_log(p_actor uuid,p_role text,p_action text,p_type text default null,p_id text default null,p_reason text default null,p_case uuid default null,p_before jsonb default null,p_after jsonb default null) returns void language sql set search_path='' as $$
 insert into lumo_private.admin_audit(actor_id,actor_role,action,entity_type,entity_id,reason,case_id,before_value,after_value) values(p_actor,p_role,p_action,p_type,p_id,p_reason,p_case,p_before,p_after);
$$;
create function lumo_private.admin_staff_json(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',user_id,'userId',user_id,'name',display_name,'displayName',display_name,'email',email,'role',role,'status',status,'createdAt',created_at,'updatedAt',updated_at) from lumo_private.admin_staff where user_id=p_id;
$$;
create function lumo_private.admin_case_json(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',c.id,'reference',c.reference,'name',c.subject,'subject',c.subject,'body',c.body,'source',c.source,'sourceId',c.source_id,'category',c.category,'priority',c.priority,'status',c.status,'customerId',c.customer_id,'customerName',p.display_name,'merchantId',c.merchant_id,'merchantName',m.name,'transactionId',c.transaction_id,'guestId',c.guest_id,'incidentId',c.incident_id,'assigneeId',c.assignee_id,'assignee',s.display_name,'dueAt',c.due_at,'overdue',c.due_at<clock_timestamp() and c.status not in ('resolved','closed'),'resolution',c.resolution,'createdAt',c.created_at,'updatedAt',c.updated_at,'resolvedAt',c.resolved_at,'revision',c.revision)
 from lumo_private.admin_cases c left join lumo_private.profiles p on p.user_id=c.customer_id left join lumo_private.merchants m on m.id=c.merchant_id left join lumo_private.admin_staff s on s.user_id=c.assignee_id where c.id=p_id;
$$;
create function lumo_private.admin_incident_json(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',i.id,'name',i.name,'status',i.status,'severity',i.severity,'serviceId',i.service_id,'description',i.description,'customerMessage',i.customer_message,'resolution',i.resolution,'ownerId',i.owner_id,'owner',s.display_name,'createdBy',i.created_by,'createdAt',i.created_at,'updatedAt',i.updated_at,'resolvedAt',i.resolved_at,'revision',i.revision,'linkedCases',(select count(*) from lumo_private.admin_cases c where c.incident_id=i.id)) from lumo_private.admin_incidents i left join lumo_private.admin_staff s on s.user_id=i.owner_id where i.id=p_id;
$$;
create function lumo_private.admin_transaction_json(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',j.id,'name',j.reference,'reference',j.reference,'type',j.type,'amount',j.amount,'currency','GHS','status','posted','mode','sandbox','createdAt',j.created_at,
 'payerAccountId',j.payer_account_id,'payeeAccountId',j.payee_account_id,'payerId',pa.owner_user_id,'payeeId',ra.owner_user_id,'payerName',coalesce(pp.display_name,pm.name,case when pa.kind='test_funding' then 'Test funding source' else pa.kind end),'payeeName',coalesce(rp.display_name,rm.name,case when ra.kind='test_funding' then 'Test funding source' else ra.kind end),
 'actorId',j.actor_user_id,'shopId',j.shop_id,'shopName',sh.name,'merchantId',coalesce(pm.id,rm.id),'merchantName',coalesce(pm.name,rm.name),'requestId',j.request_id,'originalPaymentId',j.original_payment_id,
 'groupId',ap.group_id,'boxId',ap.box_id,'transactionId',ap.transaction_id,'rail',case when j.type='external_simulation' then ap.metadata->>'rail' when j.type='guest_momo' then 'momo' else 'lumo' end,
 'note',ap.metadata->>'note','principalAmount',ap.metadata->'principalAmount','fee',ap.metadata->'simulationFee','externalRecipient',lumo_private.admin_pick(ap.metadata->'recipient',array['name','rail','network','bank']),
 'settlementStatus','Not externally settled: test money','refundedAmount',(select coalesce(sum(r.amount),0) from lumo_private.journals r where r.original_payment_id=j.id))
 from lumo_private.journals j join lumo_private.accounts pa on pa.id=j.payer_account_id join lumo_private.accounts ra on ra.id=j.payee_account_id
 left join lumo_private.profiles pp on pp.user_id=pa.owner_user_id and pa.kind='consumer' left join lumo_private.profiles rp on rp.user_id=ra.owner_user_id and ra.kind='consumer'
 left join lumo_private.merchants pm on pm.account_id=pa.id left join lumo_private.merchants rm on rm.account_id=ra.id left join lumo_private.shops sh on sh.id=j.shop_id left join lumo_private.approved_postings ap on ap.journal_id=j.id where j.id=p_id;
$$;
create function lumo_private.admin_customer_json(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',p.user_id,'name',p.display_name,'displayName',p.display_name,'handle',p.handle,'phone',case when ap.phone is null then null else '••••••'||right(ap.phone,4) end,'status',p.status,
 'personalAccount',coalesce(ap.personal_account,false),'balance',coalesce(a.balance,0),'currency','GHS','mode','sandbox','createdAt',p.created_at,'lastSyncedAt',s.updated_at,'stateRevision',s.revision,
 'onboardingDone',coalesce((s.state->>'onboardingDone')::boolean,false),'contactVerified',coalesce(ap.contact_verified,false),'identityVerification','Simulated; not verified by NIA',
 'accountStatus',a.status,'accountId',a.id,'pinLockedUntil',p.pin_locked_until,'consumerEligible',coalesce(ap.personal_account,false) and p.status='active' and a.status='active',
 'openCases',(select count(*) from lumo_private.admin_cases c where c.customer_id=p.user_id and c.status not in ('resolved','closed')),
 'activeDevices',(select count(*) from lumo_private.approved_devices d where d.user_id=p.user_id and d.revoked_at is null))
 from lumo_private.profiles p left join lumo_private.approved_profiles ap on ap.user_id=p.user_id left join lumo_private.accounts a on a.owner_user_id=p.user_id and a.kind='consumer' left join lumo_private.approved_states s on s.user_id=p.user_id where p.user_id=p_id;
$$;
create function lumo_private.admin_product_json(p_id uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare st jsonb;result jsonb;items jsonb;boxes jsonb;planned numeric:=0;balance bigint;
begin
 select state into st from lumo_private.approved_states where user_id=p_id;
 select a.balance into balance from lumo_private.accounts a where a.owner_user_id=p_id and a.kind='consumer';
 if st is null then return jsonb_build_object('customerId',p_id,'ledgerBalance',coalesce(balance,0),'availableMoney',coalesce(balance,0),'stateAvailable',false,'message','No saved product state yet.');end if;
 select coalesce(jsonb_agg(lumo_private.admin_pick(value,array['id','name','amount','spent','due'])),'[]'::jsonb),coalesce(sum(greatest(coalesce((value->>'amount')::numeric,0)-coalesce((value->>'spent')::numeric,0),0)),0) into items,planned from jsonb_array_elements(lumo_private.admin_array(st#>'{budget,items}'));
 select coalesce(jsonb_agg(lumo_private.admin_pick(b.value,array['id','name','target','date','status','archived','createdAt','targetDate'])||jsonb_build_object('balance',coalesce(a.balance,0),'accountId',ab.account_id,'hack',lumo_private.admin_pick(b.value->'hack',array['type','amount','percent','percentage','roundTo','enabled','paused','cap','floor','frequency','nextRun','lastRun']))),'[]'::jsonb) into boxes
 from jsonb_array_elements(lumo_private.admin_array(st->'boxes')) b left join lumo_private.approved_boxes ab on ab.id=b.value->>'id' and ab.user_id=p_id left join lumo_private.accounts a on a.id=ab.account_id;
 result:=jsonb_build_object('customerId',p_id,'ledgerBalance',coalesce(balance,0),'availableMoney',coalesce(balance,0),'stateAvailable',true,'plannedRemaining',planned,'buffer',st->'buffer','budgetItems',items,'boxes',boxes,
 'calculationNote','Everyday balance is ledger authority. Essentials reserve spending guidance without moving money. Boxes hold separate ledger funds. Expected IOUs and manually recorded outside balances cannot fund payments. Use the consumer domain summary for final left-after-plan including holds.',
 'ious',(select coalesce(jsonb_agg(lumo_private.admin_pick(value,array['id','name','person','type','amount','paid','status','due','dueDate','createdAt'])),'[]'::jsonb) from jsonb_array_elements(lumo_private.admin_array(st->'ious'))),
 'outsideBalances',(select coalesce(jsonb_agg(lumo_private.admin_pick(value,array['id','name','type','amount','balance','updatedAt','lastUpdated'])),'[]'::jsonb) from jsonb_array_elements(lumo_private.admin_array(st->'externalBalances'))),
 'savingsHistory',(select coalesce(jsonb_agg(lumo_private.admin_pick(value,array['id','boxId','at','status','amount','reason'])),'[]'::jsonb) from (select value from jsonb_array_elements(lumo_private.admin_array(st->'savingsHistory')) limit 100)x),
 'recovery',lumo_private.admin_pick(st->'recovery',array['active','checkInDate','nextDate','dailyLimit','pauseSavings','startedAt']),
 'learning',lumo_private.admin_pick(st->'learning',array['progress','completed','currentLesson','score','updatedAt']),
 'groups',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.state->>'name','status',g.state->>'status','balance',a.balance,'target',g.state->'target','revision',g.revision,'mandate',lumo_private.admin_pick(g.state->'mandate',array['type','threshold','requiredApprovals']),
 'members',(select coalesce(jsonb_agg(lumo_private.admin_pick(m.value,array['id','name','role','status'])),'[]'::jsonb) from jsonb_array_elements(lumo_private.admin_array(g.state->'members')) m),'updatedAt',g.updated_at)),'[]'::jsonb) from lumo_private.approved_groups g join lumo_private.accounts a on a.id=g.account_id where exists(select 1 from jsonb_array_elements(lumo_private.admin_array(g.state->'members')) m where m.value->>'id'=p_id::text)),
 'schedules',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'amount',t.amount,'status',t.status,'nextDue',t.next_due,'frequency',t.frequency,'lastFailure',t.last_failure)),'[]'::jsonb) from lumo_private.transfer_schedules t where t.owner_user_id=p_id),
 'limitations',jsonb_build_array('Private chats and partner codes are not exposed.','Pause trigger and Lux answer telemetry are not recorded by the current backend.'));
 return result;
end $$;
create function lumo_private.admin_merchant_json(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',m.id,'name',m.name,'status',m.status,'ownerId',m.owner_user_id,'ownerName',p.display_name,'balance',a.balance,'accountId',a.id,'currency','GHS','mode','sandbox','createdAt',m.created_at,'shops',(select count(*) from lumo_private.shops sh where sh.merchant_id=m.id),'acceptingShops',(select count(*) from lumo_private.shops sh where sh.merchant_id=m.id and sh.accepting),
 'settlementStatus','Live bank/MoMo payouts are not connected','collectionsToday',(select coalesce(sum(j.amount),0) from lumo_private.journals j where j.payee_account_id=m.account_id and j.type in ('merchant_payment','guest_momo') and j.created_at>=date_trunc('day',clock_timestamp())))
 from lumo_private.merchants m join lumo_private.accounts a on a.id=m.account_id left join lumo_private.profiles p on p.user_id=m.owner_user_id where m.id=p_id;
$$;


create function lumo_private.admin_sync_source_case(p_id uuid) returns void language plpgsql set search_path='' as $$
declare c lumo_private.admin_cases%rowtype;st jsonb;net jsonb;items jsonb;source_key text;source_status text;
begin
 select * into c from lumo_private.admin_cases where id=p_id;
 if c.source_id like 'ticket:%' then
  update lumo_private.support_tickets set status=case when c.status in ('resolved','closed') then 'resolved' else 'open' end where id::text=substr(c.source_id,8);
 elsif c.source_id like 'consumer:%' then
  source_key:=substr(c.source_id,length('consumer:'||c.customer_id::text||':')+1);
  select state into st from lumo_private.approved_states where user_id=c.customer_id for update;
  if st is null then return;end if;
  source_status:=case when c.status in ('resolved','closed') then 'resolved' when c.status='open' then 'open' else 'reviewing' end;
  select coalesce(jsonb_agg(case when v.value->>'id'=source_key then v.value||jsonb_build_object('status',source_status,'updatedAt',clock_timestamp(),'updates',lumo_private.admin_array(v.value->'updates')||jsonb_build_array(jsonb_build_object('id','support-'||gen_random_uuid()::text,'at',clock_timestamp(),'kind','support','text',case when source_status='resolved' then 'Support resolved this case: '||c.resolution else 'Support updated this case to '||source_status||'.' end))) else v.value end order by v.n),'[]'::jsonb) into items from jsonb_array_elements(lumo_private.admin_array(st#>'{account,supportCases}')) with ordinality v(value,n);
  update lumo_private.approved_states set state=jsonb_set(st,'{account,supportCases}',items),revision=revision+1,updated_at=clock_timestamp() where user_id=c.customer_id;
 elsif c.source_id like 'merchant:%' then
  source_key:=substr(c.source_id,length('merchant:'||c.merchant_id::text||':')+1);
  select document into net from lumo_private.approved_merchant_network where id for update;
  source_status:=case when c.status in ('resolved','closed') then 'resolved' when c.status='open' then 'open' else 'investigating' end;
  select coalesce(jsonb_agg(case when v.value->>'id'=source_key then v.value||jsonb_build_object('status',source_status,'updatedAt',clock_timestamp(),'resolvedAt',c.resolved_at,'responses',lumo_private.admin_array(v.value->'responses')||jsonb_build_array(jsonb_build_object('id','support-'||gen_random_uuid()::text,'createdAt',clock_timestamp(),'by','Lumo Support','status',source_status,'message',case when source_status='resolved' then c.resolution else 'Support updated this case to '||source_status||'.' end))) else v.value end order by v.n),'[]'::jsonb) into items from jsonb_array_elements(lumo_private.admin_array(net#>array['businesses',c.merchant_id::text,'tickets'])) with ordinality v(value,n);
  update lumo_private.approved_merchant_network set document=jsonb_set(net,array['businesses',c.merchant_id::text,'tickets'],items),revision=revision+1 where id;
 end if;
end $$;

create function public.lumo_admin_service(p_command text,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $admin$
#variable_conflict use_variable
declare actor uuid;sid uuid;staff lumo_private.admin_staff%rowtype;token lumo_private.admin_setup_tokens%rowtype;
 pg integer:=1;ps integer:=25;off integer;q text:='';filter_status text;ident text;uid uuid;cid uuid;entity jsonb;result jsonb;rows jsonb;total bigint;old jsonb;new_value jsonb;
 email text;name text;role_value text;status_value text;reason text;case_row lumo_private.admin_cases%rowtype;incident_row lumo_private.admin_incidents%rowtype;approval lumo_private.admin_approvals%rowtype;
 is_write boolean:=false;data_state jsonb;tmp jsonb;v_case uuid;action_value text;at_time timestamptz;
begin
 if (coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role') is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN','message','Administrative access is required.');end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or p_command is null or length(p_command)>80 or octet_length(p_payload::text)>100000 then return jsonb_build_object('ok',false,'code','INVALID_INPUT','message','Check the request details.');end if;
 if p_command in ('setup.reserve','setup.complete') then
  email:=lower(trim(p_payload->>'email'));name:=trim(p_payload->>'name');
  if coalesce(p_payload->>'tokenHash','') !~ '^[a-f0-9]{64}$' or email is null or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(email)>254 or email like '%@pilot.lumo.invalid' then return jsonb_build_object('ok',false,'code','SETUP_INVALID','message','This setup invitation could not be verified.');end if;
  select * into token from lumo_private.admin_setup_tokens t where t.token_hash=p_payload->>'tokenHash' for update;
  if not found or token.expires_at<=clock_timestamp() or (token.email is not null and lower(token.email)<>email) or (token.reserved_email is not null and token.reserved_email<>email) then return jsonb_build_object('ok',false,'code','SETUP_INVALID','message','This setup invitation is invalid, expired, or already used.');end if;
  if token.consumed_at is not null then
   if token.reserved_email=email and (p_command='setup.reserve' or token.consumed_by=nullif(p_payload->>'userId','')::uuid) then
    return jsonb_build_object('ok',true,'data',jsonb_build_object('completed',true,'email',email,'staff',case when p_command='setup.complete' then lumo_private.admin_staff_json(token.consumed_by) else null end,'requiresMfa',true));
   end if;
   return jsonb_build_object('ok',false,'code','SETUP_INVALID','message','This invitation has already been used.');
  end if;
  if token.email is null and exists(select 1 from lumo_private.admin_staff where role='super_admin' and status='active') then return jsonb_build_object('ok',false,'code','SETUP_INVALID','message','Initial setup is already complete.');end if;
  if p_command='setup.reserve' then
   update lumo_private.admin_setup_tokens set reserved_email=email where id=token.id;
   return jsonb_build_object('ok',true,'data',jsonb_build_object('invitationId',token.id,'email',email,'role',token.role,'name',token.display_name));
  end if;
  uid:=(p_payload->>'userId')::uuid;
  if token.reserved_email is distinct from email or not exists(select 1 from auth.users u where u.id=uid and lower(u.email)=email and u.deleted_at is null and u.email_confirmed_at is not null) then return jsonb_build_object('ok',false,'code','SETUP_INVALID','message','The staff identity could not be verified.');end if;
  if length(coalesce(nullif(name,''),token.display_name,'')) not between 1 and 80 or exists(select 1 from lumo_private.admin_staff s where s.user_id=uid or lower(s.email)=email) then return jsonb_build_object('ok',false,'code','SETUP_INVALID','message','This staff identity is already enrolled or its name is missing.');end if;
  insert into lumo_private.admin_staff(user_id,display_name,email,role) values(uid,coalesce(nullif(name,''),token.display_name),email,token.role);
  update lumo_private.admin_setup_tokens set consumed_at=clock_timestamp(),consumed_by=uid where id=token.id;
  perform lumo_private.admin_log(uid,token.role,'staff.enrolled','staff',uid::text,'Invitation accepted');
  return jsonb_build_object('ok',true,'data',jsonb_build_object('staff',lumo_private.admin_staff_json(uid),'requiresMfa',true));
 end if;
 begin actor:=(p_payload->>'actor')::uuid;sid:=(p_payload->>'session')::uuid;exception when invalid_text_representation then return jsonb_build_object('ok',false,'code','AUTH_REQUIRED','message','Sign in to your staff account.');end;
 if actor is null or sid is null or not exists(select 1 from auth.sessions se join auth.users u on u.id=se.user_id where se.id=sid and se.user_id=actor and (se.not_after is null or se.not_after>clock_timestamp()) and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()) and coalesce(u.is_anonymous,false)=false) then return jsonb_build_object('ok',false,'code','SESSION_REVOKED','message','Your staff session has ended. Sign in again.');end if;
 select * into staff from lumo_private.admin_staff where user_id=actor and status='active';
 if not found then return jsonb_build_object('ok',false,'code','STAFF_REQUIRED','message','This account does not have active staff access.');end if;
 if p_command='session' then return jsonb_build_object('ok',true,'data',jsonb_build_object('staff',lumo_private.admin_staff_json(actor),'requiresMfa',p_payload->>'aal' is distinct from 'aal2','capabilities',jsonb_build_object('casesWrite',staff.role<>'auditor','servicesWrite',staff.role in ('super_admin','supervisor','technical'),'incidentsWrite',staff.role in ('super_admin','supervisor','technical'),'staffWrite',staff.role='super_admin','approvalsDecide',staff.role in ('super_admin','supervisor','finance','risk'),'reconciliationRead',staff.role in ('super_admin','supervisor','finance','risk','auditor'),'auditRead',staff.role in ('super_admin','supervisor','risk','auditor','technical')),'environment','sandbox','currency','GHS'));end if;
 if p_payload->>'aal' is distinct from 'aal2' or not exists(select 1 from auth.mfa_factors f where f.user_id=actor and f.status='verified') then return jsonb_build_object('ok',false,'code','MFA_REQUIRED','message','Verify your authenticator code to continue.');end if;
 is_write:=p_command in ('cases.create','cases.update','cases.note','incidents.create','incidents.update','staff.update','staff.invite','approvals.create','approvals.decide','services.update','services.schedule');
 if staff.role='auditor' and is_write then return jsonb_build_object('ok',false,'code','FORBIDDEN','message','Your role has read-only access.');end if;
 if p_command like 'products.%' and staff.role in ('technical','merchant_ops') then return jsonb_build_object('ok',false,'code','FORBIDDEN','message','Personal money planning requires a customer support or financial review role.');end if;
 if p_command like 'staff.%' and staff.role<>'super_admin' then return jsonb_build_object('ok',false,'code','FORBIDDEN','message','Only an access administrator can manage staff.');end if;
 if p_command in ('incidents.create','incidents.update','services.update','services.schedule') and staff.role not in ('super_admin','supervisor','technical') then return jsonb_build_object('ok',false,'code','FORBIDDEN','message','Your role cannot change operational controls.');end if;
 if p_command in ('reconciliation.list','approvals.decide') and staff.role not in ('super_admin','supervisor','finance','risk','auditor') then return jsonb_build_object('ok',false,'code','FORBIDDEN','message','Your role does not have access to this action.');end if;
 if p_command='audit.list' and staff.role not in ('super_admin','supervisor','risk','auditor','technical') then return jsonb_build_object('ok',false,'code','FORBIDDEN','message','Audit access requires a designated review role.');end if;
 begin pg:=greatest(1,least(coalesce((p_payload->>'page')::integer,1),100000));ps:=greatest(1,least(coalesce((p_payload->>'pageSize')::integer,25),100));exception when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('ok',false,'code','INVALID_INPUT','message','Check pagination.');end;
 off:=(pg-1)*ps;q:=left(trim(coalesce(p_payload->>'q',p_payload->>'query','')),120);filter_status:=nullif(p_payload->>'status','');ident:=nullif(p_payload->>'id','');reason:=left(trim(p_payload->>'reason'),2000);
 -- Import existing source tickets once, preserving the source and its identity.
 if p_command like 'cases.%' or p_command='overview' then
  insert into lumo_private.admin_cases(source,source_id,subject,body,status,customer_id,created_at,updated_at,due_at)
  select 'consumer','ticket:'||t.id::text,t.subject,t.body,case when t.status='resolved' then 'resolved' else 'open' end,t.user_id,t.created_at,t.created_at,t.created_at+interval '24 hours' from lumo_private.support_tickets t on conflict(source_id) do nothing;

  insert into lumo_private.admin_cases(source,source_id,subject,body,category,status,customer_id,transaction_id,created_at,updated_at,due_at)
  select 'consumer','consumer:'||st.user_id::text||':'||(c.value->>'id'),left(coalesce(nullif(c.value->>'title',''),'Consumer support request'),160),left(coalesce(c.value->>'body',''),10000),case when c.value->>'category'='payment' then 'payment' when c.value->>'category'='bug' then 'technical' else 'general' end,case when c.value->>'status'='resolved' then 'resolved' when c.value->>'status'='reviewing' then 'in_progress' else 'open' end,st.user_id,(select ap.journal_id from lumo_private.approved_postings ap where ap.user_id=st.user_id and ap.transaction_id=c.value->>'transactionId' limit 1),coalesce(nullif(c.value->>'createdAt','')::timestamptz,st.updated_at),st.updated_at,coalesce(nullif(c.value->>'createdAt','')::timestamptz,st.updated_at)+interval '24 hours'
  from lumo_private.approved_states st cross join lateral jsonb_array_elements(lumo_private.admin_array(st.state#>'{account,supportCases}')) c where nullif(c.value->>'id','') is not null on conflict(source_id) do nothing;
  insert into lumo_private.admin_cases(source,source_id,subject,body,category,status,customer_id,merchant_id,transaction_id,created_at,updated_at,due_at)
  select 'merchant','merchant:'||m.id::text||':'||(t.value->>'id'),left(coalesce(nullif(t.value->>'subject',''),'Merchant support request'),160),left(coalesce(t.value->>'message',''),10000),'merchant',case when t.value->>'status'='resolved' then 'resolved' when t.value->>'status'='investigating' then 'in_progress' else 'open' end,m.owner_user_id,m.id,(select j.id from lumo_private.journals j where j.id::text=t.value->>'transactionId' or j.reference=coalesce(t.value->>'paymentReference',t.value->>'transactionId') limit 1),coalesce(nullif(t.value->>'createdAt','')::timestamptz,m.created_at),coalesce(nullif(t.value->>'updatedAt','')::timestamptz,m.created_at),coalesce(nullif(t.value->>'createdAt','')::timestamptz,m.created_at)+interval '24 hours'
  from lumo_private.approved_merchant_network n cross join lateral jsonb_each(n.document->'businesses') b join lumo_private.merchants m on m.id::text=b.key cross join lateral jsonb_array_elements(lumo_private.admin_array(b.value->'tickets')) t where n.id and nullif(t.value->>'id','') is not null on conflict(source_id) do nothing;
 end if;
 if p_command like 'services.%' then
  return lumo_private.admin_services(p_command,p_payload);
 elsif p_command='overview' then
  result:=jsonb_build_object('metrics',jsonb_build_object('customers',(select count(*) from lumo_private.approved_profiles where personal_account),'merchants',(select count(*) from lumo_private.merchants),'shops',(select count(*) from lumo_private.shops),'paymentsToday',(select count(*) from lumo_private.journals where created_at>=date_trunc('day',clock_timestamp())),'valueToday',(select coalesce(sum(amount),0) from lumo_private.journals where created_at>=date_trunc('day',clock_timestamp())),'pendingGuest',(select count(*) from lumo_private.guest_momo_attempts where status='pending'),'openCases',(select count(*) from lumo_private.admin_cases where status not in ('resolved','closed')),'openIncidents',(select count(*) from lumo_private.admin_incidents where status<>'resolved'),'pendingApprovals',(select count(*) from lumo_private.admin_approvals where status='pending')),
  'recentTransactions',(select coalesce(jsonb_agg(lumo_private.admin_transaction_json(j.id) order by j.created_at desc),'[]'::jsonb) from (select id,created_at from lumo_private.journals order by created_at desc limit 10)j),
  'attention',(select coalesce(jsonb_agg(x.item),'[]'::jsonb) from (select jsonb_build_object('type','case','id',c.id,'title',c.subject,'detail',c.reference||' · overdue','severity',case when c.priority='urgent' then 'critical' else 'high' end) item from lumo_private.admin_cases c where c.status not in ('resolved','closed') and c.due_at<clock_timestamp() union all select jsonb_build_object('type','incident','id',i.id,'title',i.name,'detail',i.status,'severity',i.severity) from lumo_private.admin_incidents i where i.status<>'resolved' union all select jsonb_build_object('type','guest','id',g.id,'title','Guest payment awaiting confirmation','detail',g.provider_reference,'severity','medium') from lumo_private.guest_momo_attempts g where g.status='pending' and g.created_at<clock_timestamp()-interval '5 minutes' limit 20)x),
  'environment','sandbox','generatedAt',clock_timestamp(),'limitations',jsonb_build_array('External bank, MoMo and identity providers are not live.','Payment counts include ledger movements; collection revenue is reported separately.'));
 elsif p_command='search' then
  if length(q)<2 then return jsonb_build_object('ok',true,'data',jsonb_build_object('results','[]'::jsonb,'message','Enter at least two characters.'));end if;
  select coalesce(jsonb_agg(x.item),'[]'::jsonb) into rows from (
   select jsonb_build_object('type','customer','id',p.user_id,'title',p.display_name,'subtitle','@'||p.handle,'status',p.status) item from lumo_private.profiles p left join lumo_private.approved_profiles a on a.user_id=p.user_id where p.display_name ilike '%'||q||'%' or p.handle ilike '%'||ltrim(q,'@')||'%' or p.user_id::text=q or a.phone=regexp_replace(q,'\s','','g')
   union all select jsonb_build_object('type','merchant','id',m.id,'title',m.name,'subtitle','Merchant','status',m.status) from lumo_private.merchants m where m.name ilike '%'||q||'%' or m.id::text=q
   union all select jsonb_build_object('type','merchant','id',m.id,'title',sh.name,'subtitle',m.name||' · shop','shopId',sh.id) from lumo_private.shops sh join lumo_private.merchants m on m.id=sh.merchant_id where sh.name ilike '%'||q||'%' or sh.id::text=q
   union all select jsonb_build_object('type','transaction','id',j.id,'title',j.reference,'subtitle',j.type,'status','posted') from lumo_private.journals j where j.reference ilike '%'||q||'%' or j.id::text=q
   union all select jsonb_build_object('type','guest','id',g.id,'title',g.provider_reference,'subtitle','Guest MoMo · '||g.network,'status',g.status) from lumo_private.guest_momo_attempts g where g.provider_reference ilike '%'||q||'%' or g.id=q or g.phone=regexp_replace(q,'\s','','g')
   union all select jsonb_build_object('type','case','id',c.id,'title',c.subject,'subtitle',c.reference,'status',c.status) from lumo_private.admin_cases c where c.reference ilike '%'||q||'%' or c.subject ilike '%'||q||'%' or c.id::text=q
   union all select jsonb_build_object('type','guest_link','id',l.id,'title',coalesce(nullif(l.description,''),'Merchant payment link'),'subtitle',m.name,'merchantId',m.id) from lumo_private.merchant_payment_links l join lumo_private.merchants m on m.id=l.merchant_id where l.id::text=q or l.public_token=q
   limit 40)x;
  result:=jsonb_build_object('results',rows,'q',q);
 elsif p_command in ('customers.list','products.list') then
  select count(*) into total from lumo_private.profiles p left join lumo_private.approved_profiles a on a.user_id=p.user_id where (filter_status is null or p.status=filter_status) and (q='' or p.display_name ilike '%'||q||'%' or p.handle ilike '%'||ltrim(q,'@')||'%' or p.user_id::text=q or a.phone=regexp_replace(q,'\s','','g'));
  select coalesce(jsonb_agg(lumo_private.admin_customer_json(x.user_id) order by x.created_at desc),'[]'::jsonb) into rows from(select p.user_id,p.created_at from lumo_private.profiles p left join lumo_private.approved_profiles a on a.user_id=p.user_id where (filter_status is null or p.status=filter_status) and (q='' or p.display_name ilike '%'||q||'%' or p.handle ilike '%'||ltrim(q,'@')||'%' or p.user_id::text=q or a.phone=regexp_replace(q,'\s','','g')) order by p.created_at desc,p.user_id limit ps offset off)x;
  result:=jsonb_build_object('rows',rows,'total',total,'page',pg,'pageSize',ps);
 elsif p_command in ('customers.get','products.get') then
  uid:=ident::uuid;entity:=lumo_private.admin_customer_json(uid);if entity is null then return jsonb_build_object('ok',false,'code','NOT_FOUND','message','Customer not found.');end if;
  result:=jsonb_build_object('record',entity,'customer',entity,'products',case when staff.role in ('technical','merchant_ops') then null else lumo_private.admin_product_json(uid) end,
   'transactions',(select coalesce(jsonb_agg(lumo_private.admin_transaction_json(x.id) order by x.created_at desc),'[]'::jsonb) from (select distinct j.id,j.created_at from lumo_private.journals j join lumo_private.accounts a on a.id in(j.payer_account_id,j.payee_account_id) where a.owner_user_id=uid order by j.created_at desc limit 50)x),
   'cases',(select coalesce(jsonb_agg(lumo_private.admin_case_json(c.id) order by c.created_at desc),'[]'::jsonb) from lumo_private.admin_cases c where c.customer_id=uid),
   'devices',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'createdAt',d.created_at,'revokedAt',d.revoked_at,'status',case when d.revoked_at is null then 'registered' else 'revoked' end)),'[]'::jsonb) from lumo_private.approved_devices d where d.user_id=uid),
   'sessions',(select coalesce(jsonb_agg(jsonb_build_object('createdAt',se.created_at,'refreshedAt',se.refreshed_at,'notAfter',se.not_after,'status',case when se.not_after is null or se.not_after>clock_timestamp() then 'active' else 'expired' end)),'[]'::jsonb) from auth.sessions se where se.user_id=uid),
   'merchantRoles',(select coalesce(jsonb_agg(jsonb_build_object('merchantId',sh.merchant_id,'shopId',sm.shop_id,'shopName',sh.name,'role',sm.role,'status',sm.status)),'[]'::jsonb) from lumo_private.staff_memberships sm join lumo_private.shops sh on sh.id=sm.shop_id where sm.user_id=uid),
   'timeline',jsonb_build_array(jsonb_build_object('at',entity->'createdAt','event','Account registered','detail','Shared backend profile created.','source','profiles','status','recorded'),jsonb_build_object('at',entity->'lastSyncedAt','event','Last product state saved','detail','This is a server save timestamp, not proof that the device is currently online.','source','approved_states','status','recorded')));
 elsif p_command='merchants.list' then
  select count(*) into total from lumo_private.merchants m where (filter_status is null or m.status=filter_status) and (q='' or m.name ilike '%'||q||'%' or m.id::text=q);
  select coalesce(jsonb_agg(lumo_private.admin_merchant_json(x.id) order by x.created_at desc),'[]'::jsonb) into rows from(select m.id,m.created_at from lumo_private.merchants m where (filter_status is null or m.status=filter_status) and (q='' or m.name ilike '%'||q||'%' or m.id::text=q) order by m.created_at desc,m.id limit ps offset off)x;
  result:=jsonb_build_object('rows',rows,'total',total,'page',pg,'pageSize',ps);
 elsif p_command='merchants.get' then
  uid:=ident::uuid;entity:=lumo_private.admin_merchant_json(uid);if entity is null then return jsonb_build_object('ok',false,'code','NOT_FOUND','message','Merchant not found.');end if;
  select n.document#>array['businesses',uid::text] into data_state from lumo_private.approved_merchant_network n where n.id;
  result:=jsonb_build_object('record',entity,'merchant',entity,
   'shops',(select coalesce(jsonb_agg(jsonb_build_object('id',sh.id,'name',sh.name,'accepting',sh.accepting,'published',ss.published,'location',ss.location,'tradingSince',sh.trading_since,'createdAt',sh.created_at,'collectionsSinceClose',(select coalesce(sum(j.amount),0) from lumo_private.journals j where j.shop_id=sh.id and j.created_at>=sh.trading_since and j.type in ('merchant_payment','guest_momo')))),'[]'::jsonb) from lumo_private.shops sh left join lumo_private.shop_settings ss on ss.shop_id=sh.id where sh.merchant_id=uid),
   'staff',(select coalesce(jsonb_agg(jsonb_build_object('id',sm.id,'userId',sm.user_id,'name',p.display_name,'role',sm.role,'status',sm.status,'shopId',sm.shop_id,'shopName',sh.name,'updatedAt',sm.updated_at)),'[]'::jsonb) from lumo_private.staff_memberships sm join lumo_private.shops sh on sh.id=sm.shop_id left join lumo_private.profiles p on p.user_id=sm.user_id where sh.merchant_id=uid),
   'shifts',(select coalesce(jsonb_agg(jsonb_build_object('id',si.id,'userId',si.user_id,'shopId',si.shop_id,'startedAt',si.started_at,'endedAt',si.ended_at)),'[]'::jsonb) from lumo_private.shifts si join lumo_private.shops sh on sh.id=si.shop_id where sh.merchant_id=uid),
   'counterDevices',(select coalesce(jsonb_agg(lumo_private.admin_pick(value,array['id','name','shopId','authorizedBy','revokedAt','createdAt','lastSeenAt'])),'[]'::jsonb) from jsonb_array_elements(lumo_private.admin_array(data_state->'counterDevices'))),
   'closings',(select coalesce(jsonb_agg(lumo_private.admin_pick(value,array['id','shopId','createdAt','total','amount','transactionCount','closedBy'])),'[]'::jsonb) from (select value from jsonb_array_elements(lumo_private.admin_array(data_state->'closings')) limit 100)x),
   'transactions',(select coalesce(jsonb_agg(lumo_private.admin_transaction_json(x.id) order by x.created_at desc),'[]'::jsonb) from(select j.id,j.created_at from lumo_private.journals j where j.payer_account_id=(entity->>'accountId')::uuid or j.payee_account_id=(entity->>'accountId')::uuid order by j.created_at desc limit 50)x),
   'paymentLinks',(select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.description,'shopId',l.shop_id,'kind',l.kind,'requestId',l.request_id,'createdAt',l.created_at,'status',case when l.revoked_at is null then 'active' else 'revoked' end)),'[]'::jsonb) from lumo_private.merchant_payment_links l where l.merchant_id=uid),
   'cases',(select coalesce(jsonb_agg(lumo_private.admin_case_json(c.id)),'[]'::jsonb) from lumo_private.admin_cases c where c.merchant_id=uid),
   'planning',lumo_private.admin_pick(data_state->'planning',array['stockReserve','expenses','updatedAt']),
   'timeline',jsonb_build_array(jsonb_build_object('at',entity->'createdAt','event','Merchant registered','source','merchants','status','recorded')),
   'limitations',jsonb_build_array('Shop totals reset at close; merchant funds remain in the master ledger account.','Audio readiness is device-side; confirmed playback is not recorded centrally.'));
 elsif p_command='transactions.list' then
  select count(*) into total from lumo_private.journals j where (filter_status is null or filter_status='posted') and (q='' or j.reference ilike '%'||q||'%' or j.id::text=q or j.type=q or j.actor_user_id::text=q) and (nullif(p_payload->>'type','') is null or j.type=p_payload->>'type');
  select coalesce(jsonb_agg(lumo_private.admin_transaction_json(x.id) order by x.created_at desc),'[]'::jsonb) into rows from(select j.id,j.created_at from lumo_private.journals j where (filter_status is null or filter_status='posted') and (q='' or j.reference ilike '%'||q||'%' or j.id::text=q or j.type=q or j.actor_user_id::text=q) and (nullif(p_payload->>'type','') is null or j.type=p_payload->>'type') order by j.created_at desc,j.id limit ps offset off)x;
  result:=jsonb_build_object('rows',rows,'total',total,'page',pg,'pageSize',ps,'note','Confirmed immutable ledger postings. Unconfirmed guest payments are in Guest checkout.');
 elsif p_command='transactions.get' then
  select j.id into uid from lumo_private.journals j where j.id::text=ident or j.reference=ident limit 1;entity:=lumo_private.admin_transaction_json(uid);if entity is null then return jsonb_build_object('ok',false,'code','NOT_FOUND','message','Transaction not found.');end if;
  result:=jsonb_build_object('record',entity,'transaction',entity,
   'entries',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'accountId',e.account_id,'amount',e.amount,'createdAt',e.created_at)),'[]'::jsonb) from lumo_private.entries e where e.journal_id=uid),
   'refunds',(select coalesce(jsonb_agg(lumo_private.admin_transaction_json(j.id)),'[]'::jsonb) from lumo_private.journals j where j.original_payment_id=uid),
   'cases',(select coalesce(jsonb_agg(lumo_private.admin_case_json(c.id)),'[]'::jsonb) from lumo_private.admin_cases c where c.transaction_id=uid),
   'guest',(select lumo_private.guest_attempt_json(g.id) from lumo_private.guest_momo_attempts g where g.journal_id=uid limit 1),
   'attempts',(select coalesce(jsonb_agg(jsonb_build_object('id',a.attempt_id,'userId',a.user_id,'createdAt',a.created_at,'status','recorded','note','Stored idempotent result exists; secrets and full snapshots are omitted.')),'[]'::jsonb) from lumo_private.approved_attempts a where a.user_id=(entity->>'actorId')::uuid and a.created_at between (entity->>'createdAt')::timestamptz-interval '1 minute' and (entity->>'createdAt')::timestamptz+interval '1 minute' and exists(select 1 from jsonb_array_elements(lumo_private.admin_array(a.result->'receipts')) r where r.value->>'id'=uid::text)),
   'timeline',jsonb_build_array(jsonb_build_object('at',entity->'createdAt','event','Payment committed','detail','Debit and credit committed together in PostgreSQL.','source','journals','status','confirmed'),jsonb_build_object('at',entity->'createdAt','event','Receipt available','detail',entity->>'reference','source','ledger','status','confirmed'))||
    coalesce((select jsonb_agg(jsonb_build_object('at',i.created_at,'event','In-app notification created','detail',i.title,'source','inbox','status','created')) from lumo_private.inbox i where i.entity_id=uid),'[]'::jsonb),
   'evidence',jsonb_build_object('ledgerConfirmed',true,'externalSettlement','Not applicable: sandbox funds','deviceReceiptDelivery','Not recorded','approvalEvent','Separate authorisation event not retained; a committed journal alone is not a detailed approval log'));
 elsif p_command='guest.list' then
  select count(*) into total from lumo_private.guest_momo_attempts g where (filter_status is null or g.status=filter_status) and (q='' or g.provider_reference ilike '%'||q||'%' or g.id=q or g.phone=regexp_replace(q,'\s','','g'));
  select coalesce(jsonb_agg(lumo_private.guest_attempt_json(x.id)||jsonb_build_object('name',x.provider_reference) order by x.created_at desc),'[]'::jsonb) into rows from(select g.id,g.created_at,g.provider_reference from lumo_private.guest_momo_attempts g where (filter_status is null or g.status=filter_status) and (q='' or g.provider_reference ilike '%'||q||'%' or g.id=q or g.phone=regexp_replace(q,'\s','','g')) order by g.created_at desc,g.id limit ps offset off)x;
  result:=jsonb_build_object('rows',rows,'total',total,'page',pg,'pageSize',ps);
 elsif p_command='guest.get' then
  select lumo_private.guest_attempt_json(g.id) into entity from lumo_private.guest_momo_attempts g where g.id=ident or g.provider_reference=ident limit 1;
  if entity is null then return jsonb_build_object('ok',false,'code','NOT_FOUND','message','Guest payment not found.');end if;
  result:=jsonb_build_object('record',entity,'guest',entity,'merchant',lumo_private.admin_merchant_json((entity->>'merchantId')::uuid),'timeline',jsonb_build_array(jsonb_build_object('at',entity->'createdAt','event','Guest payment initiated','detail','Sandbox MoMo adapter.','source','guest_momo_attempts','status','recorded'))||case when entity->>'confirmedAt' is not null then jsonb_build_array(jsonb_build_object('at',entity->'confirmedAt','event','Payment confirmed','detail','Sandbox ledger credit recorded.','source','guest_momo_attempts','status','confirmed')) else '[]'::jsonb end,'cases',(select coalesce(jsonb_agg(lumo_private.admin_case_json(c.id)),'[]'::jsonb) from lumo_private.admin_cases c where c.guest_id=entity->>'id'));
 elsif p_command='cases.list' then
  select count(*) into total from lumo_private.admin_cases c where (filter_status is null or c.status=filter_status) and (q='' or c.subject ilike '%'||q||'%' or c.reference ilike '%'||q||'%' or c.id::text=q) and (nullif(p_payload->>'priority','') is null or c.priority=p_payload->>'priority');
  select coalesce(jsonb_agg(lumo_private.admin_case_json(x.id) order by x.created_at desc),'[]'::jsonb) into rows from(select c.id,c.created_at from lumo_private.admin_cases c where (filter_status is null or c.status=filter_status) and (q='' or c.subject ilike '%'||q||'%' or c.reference ilike '%'||q||'%' or c.id::text=q) and (nullif(p_payload->>'priority','') is null or c.priority=p_payload->>'priority') order by c.created_at desc,c.id limit ps offset off)x;
  result:=jsonb_build_object('rows',rows,'total',total,'page',pg,'pageSize',ps);
 elsif p_command='cases.get' then
  uid:=ident::uuid;entity:=lumo_private.admin_case_json(uid);if entity is null then return jsonb_build_object('ok',false,'code','NOT_FOUND','message','Case not found.');end if;
  result:=jsonb_build_object('record',entity,'case',entity,'notes',(select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'body',n.body,'kind',n.kind,'actorId',n.actor_id,'actorName',s.display_name,'createdAt',n.created_at) order by n.created_at),'[]'::jsonb) from lumo_private.admin_case_notes n join lumo_private.admin_staff s on s.user_id=n.actor_id where n.case_id=uid),'timeline',(select coalesce(jsonb_agg(jsonb_build_object('at',a.created_at,'event',a.action,'detail',a.reason,'source','admin_audit','status','recorded') order by a.created_at),'[]'::jsonb) from lumo_private.admin_audit a where a.case_id=uid or a.entity_type='case' and a.entity_id=uid::text),'communicationNote','Customer updates are drafts; this portal does not send email or SMS.');
 elsif p_command='cases.create' then
  if length(trim(coalesce(p_payload->>'subject',''))) not between 1 and 160 or length(coalesce(p_payload->>'body',''))>10000 then return jsonb_build_object('ok',false,'code','INVALID_INPUT','message','Provide a subject and a description under 10,000 characters.');end if;
  insert into lumo_private.admin_cases(subject,body,category,priority,customer_id,merchant_id,transaction_id,guest_id,incident_id,assignee_id,created_by,due_at)
  values(trim(p_payload->>'subject'),coalesce(p_payload->>'body',''),coalesce(nullif(p_payload->>'category',''),'general'),coalesce(nullif(p_payload->>'priority',''),'normal'),nullif(p_payload->>'customerId','')::uuid,nullif(p_payload->>'merchantId','')::uuid,nullif(p_payload->>'transactionId','')::uuid,nullif(p_payload->>'guestId',''),nullif(p_payload->>'incidentId','')::uuid,nullif(p_payload->>'assigneeId','')::uuid,actor,case when p_payload->>'priority'='urgent' then clock_timestamp()+interval '1 hour' when p_payload->>'priority'='high' then clock_timestamp()+interval '4 hours' else clock_timestamp()+interval '24 hours' end) returning id into uid;
  new_value:=lumo_private.admin_case_json(uid);perform lumo_private.admin_log(actor,staff.role,p_command,'case',uid::text,'Case created',uid,null,new_value);result:=jsonb_build_object('record',new_value,'case',new_value);
 elsif p_command in ('cases.update','cases.note') then
  uid:=ident::uuid;select * into case_row from lumo_private.admin_cases where id=uid for update;if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND','message','Case not found.');end if;
  if p_command='cases.note' then
   if length(trim(coalesce(p_payload->>'body',''))) not between 1 and 10000 then return jsonb_build_object('ok',false,'code','INVALID_INPUT','message','Enter a note under 10,000 characters.');end if;
   insert into lumo_private.admin_case_notes(case_id,actor_id,body,kind) values(uid,actor,trim(p_payload->>'body'),coalesce(p_payload->>'kind','internal')) returning id into cid;
   update lumo_private.admin_cases set updated_at=clock_timestamp(),revision=revision+1 where id=uid;
   perform lumo_private.admin_log(actor,staff.role,p_command,'case',uid::text,'Case note added',uid,null,jsonb_build_object('noteId',cid,'kind',coalesce(p_payload->>'kind','internal')));
  else
   if p_payload?'revision' and (p_payload->>'revision')::bigint<>case_row.revision then return jsonb_build_object('ok',false,'code','REVISION_CONFLICT','message','This case changed. Refresh before saving.');end if;
   if coalesce(p_payload->>'status',case_row.status) in ('resolved','closed') and length(trim(coalesce(p_payload->>'resolution',case_row.resolution)))<3 then return jsonb_build_object('ok',false,'code','RESOLUTION_REQUIRED','message','Record the resolution before closing this case.');end if;
   old:=lumo_private.admin_case_json(uid);
   update lumo_private.admin_cases set subject=coalesce(nullif(trim(p_payload->>'subject'),''),subject),status=coalesce(p_payload->>'status',status),priority=coalesce(p_payload->>'priority',priority),category=coalesce(p_payload->>'category',category),assignee_id=case when p_payload?'assigneeId' then nullif(p_payload->>'assigneeId','')::uuid else assignee_id end,incident_id=case when p_payload?'incidentId' then nullif(p_payload->>'incidentId','')::uuid else incident_id end,resolution=coalesce(p_payload->>'resolution',resolution),resolved_at=case when coalesce(p_payload->>'status',status) in ('resolved','closed') then coalesce(resolved_at,clock_timestamp()) else null end,updated_at=clock_timestamp(),revision=revision+1 where id=uid;
   perform lumo_private.admin_sync_source_case(uid);
   perform lumo_private.admin_log(actor,staff.role,p_command,'case',uid::text,coalesce(reason,'Case updated'),uid,old,lumo_private.admin_case_json(uid));
  end if;
  result:=jsonb_build_object('record',lumo_private.admin_case_json(uid),'case',lumo_private.admin_case_json(uid));
 elsif p_command='incidents.list' then
  select count(*) into total from lumo_private.admin_incidents i where (filter_status is null or i.status=filter_status) and(q='' or i.name ilike '%'||q||'%');
  select coalesce(jsonb_agg(lumo_private.admin_incident_json(x.id) order by x.created_at desc),'[]'::jsonb) into rows from(select i.id,i.created_at from lumo_private.admin_incidents i where(filter_status is null or i.status=filter_status) and(q='' or i.name ilike '%'||q||'%') order by i.created_at desc limit ps offset off)x;
  result:=jsonb_build_object('rows',rows,'total',total,'page',pg,'pageSize',ps);
 elsif p_command='incidents.get' then
  uid:=ident::uuid;entity:=lumo_private.admin_incident_json(uid);if entity is null then return jsonb_build_object('ok',false,'code','NOT_FOUND','message','Incident not found.');end if;
  result:=jsonb_build_object('record',entity,'incident',entity,'cases',(select coalesce(jsonb_agg(lumo_private.admin_case_json(c.id)),'[]'::jsonb) from lumo_private.admin_cases c where c.incident_id=uid),'timeline',(select coalesce(jsonb_agg(jsonb_build_object('at',a.created_at,'event',a.action,'detail',a.reason,'source','admin_audit','status','recorded') order by a.created_at),'[]'::jsonb) from lumo_private.admin_audit a where a.entity_type='incident' and a.entity_id=uid::text));
 elsif p_command='incidents.create' then
  if length(trim(coalesce(p_payload->>'name',p_payload->>'title',''))) not between 1 and 160 then return jsonb_build_object('ok',false,'code','INVALID_INPUT','message','Provide an incident name.');end if;
  insert into lumo_private.admin_incidents(name,severity,service_id,description,customer_message,owner_id,created_by) values(trim(coalesce(p_payload->>'name',p_payload->>'title')),coalesce(p_payload->>'severity','medium'),nullif(p_payload->>'serviceId',''),coalesce(p_payload->>'description',''),coalesce(p_payload->>'customerMessage',''),coalesce(nullif(p_payload->>'ownerId','')::uuid,actor),actor) returning id into uid;
  new_value:=lumo_private.admin_incident_json(uid);perform lumo_private.admin_log(actor,staff.role,p_command,'incident',uid::text,'Incident created',null,null,new_value);result:=jsonb_build_object('record',new_value,'incident',new_value);
 elsif p_command='incidents.update' then
  uid:=ident::uuid;select * into incident_row from lumo_private.admin_incidents where id=uid for update;if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND','message','Incident not found.');end if;
  if p_payload?'revision' and (p_payload->>'revision')::bigint<>incident_row.revision then return jsonb_build_object('ok',false,'code','REVISION_CONFLICT','message','This incident changed. Refresh before saving.');end if;
  if coalesce(p_payload->>'status',incident_row.status)='resolved' and length(trim(coalesce(p_payload->>'resolution',incident_row.resolution)))<3 then return jsonb_build_object('ok',false,'code','RESOLUTION_REQUIRED','message','Record the incident resolution.');end if;
  old:=lumo_private.admin_incident_json(uid);update lumo_private.admin_incidents set status=coalesce(p_payload->>'status',status),severity=coalesce(p_payload->>'severity',severity),description=coalesce(p_payload->>'description',description),customer_message=coalesce(p_payload->>'customerMessage',customer_message),resolution=coalesce(p_payload->>'resolution',resolution),owner_id=case when p_payload?'ownerId' then nullif(p_payload->>'ownerId','')::uuid else owner_id end,updated_at=clock_timestamp(),resolved_at=case when coalesce(p_payload->>'status',status)='resolved' then coalesce(resolved_at,clock_timestamp()) else null end,revision=revision+1 where id=uid;
  new_value:=lumo_private.admin_incident_json(uid);perform lumo_private.admin_log(actor,staff.role,p_command,'incident',uid::text,coalesce(reason,'Incident updated'),null,old,new_value);result:=jsonb_build_object('record',new_value,'incident',new_value);
 elsif p_command='reconciliation.list' then
  select coalesce(jsonb_agg(x.item),'[]'::jsonb),count(*) into rows,total from (
   select jsonb_build_object('id',a.id,'name','Account balance mismatch','type','balance_mismatch','status','investigate','severity','critical','accountId',a.id,'ownerId',a.owner_user_id,'balance',a.balance,'entryTotal',coalesce(sum(e.amount),0),'difference',a.balance-coalesce(sum(e.amount),0),'createdAt',a.created_at) item from lumo_private.accounts a left join lumo_private.entries e on e.account_id=a.id group by a.id having a.balance<>coalesce(sum(e.amount),0)
   union all select jsonb_build_object('id',j.id,'name','Unbalanced journal','type','unbalanced_journal','status','investigate','severity','critical','reference',j.reference,'createdAt',j.created_at) from lumo_private.journals j left join lumo_private.entries e on e.journal_id=j.id group by j.id having count(e.id)<>2 or coalesce(sum(e.amount),0)<>0
   union all select jsonb_build_object('id',g.id,'name','Guest confirmation overdue','type','pending_guest','status','pending','severity','medium','reference',g.provider_reference,'amount',g.amount,'createdAt',g.created_at) from lumo_private.guest_momo_attempts g where g.status='pending' and g.expires_at<clock_timestamp()
   union all select jsonb_build_object('id',o.id,'name','Scheduled payment failed','type','schedule_failure','status','failed','severity','medium','reference',o.schedule_id,'failureCode',o.failure_code,'createdAt',o.created_at) from lumo_private.schedule_occurrences o where o.status='failed' and o.created_at>=clock_timestamp()-interval '7 days'
  )x;
  result:=jsonb_build_object('rows',coalesce((select jsonb_agg(value) from jsonb_array_elements(rows) with ordinality v(value,n) where n>off and n<=off+ps),'[]'::jsonb),'total',total,'page',pg,'pageSize',ps,'externalReconciliation','Unavailable: live bank and MoMo statement feeds are not connected.','checkedAt',clock_timestamp());
 elsif p_command='reports' then
  result:=jsonb_build_object('daily',(select coalesce(jsonb_agg(x.day_row order by x.report_day),'[]'::jsonb) from(select date_trunc('day',j.created_at) report_day,jsonb_build_object('date',date_trunc('day',j.created_at),'transactions',count(*),'value',sum(j.amount),'merchantCollections',coalesce(sum(j.amount) filter(where j.type in ('merchant_payment','guest_momo')),0),'refunds',coalesce(sum(j.amount) filter(where j.type='refund'),0),'newFunding',coalesce(sum(j.amount) filter(where j.type='test_funding'),0)) day_row from lumo_private.journals j where j.created_at>=clock_timestamp()-interval '30 days' group by 1)x),
   'byType',(select coalesce(jsonb_agg(jsonb_build_object('type',j.type,'count',j.n,'value',j.value)),'[]'::jsonb) from(select type,count(*) n,sum(amount) value from lumo_private.journals group by type)j),
   'support',jsonb_build_object('open',(select count(*) from lumo_private.admin_cases where status not in('resolved','closed')),'resolved',(select count(*) from lumo_private.admin_cases where status in('resolved','closed')),'overdue',(select count(*) from lumo_private.admin_cases where status not in('resolved','closed') and due_at<clock_timestamp()),'averageResolutionHours',(select round(avg(extract(epoch from(resolved_at-created_at))/3600)::numeric,2) from lumo_private.admin_cases where resolved_at is not null)),
   'onboarding',jsonb_build_object('personalAccounts',(select count(*) from lumo_private.approved_profiles where personal_account),'savedProductStates',(select count(*) from lumo_private.approved_states),'customersWithFirstFunding',(select count(distinct a.owner_user_id) from lumo_private.journals j join lumo_private.accounts a on a.id=j.payee_account_id where j.type='test_funding' and a.kind='consumer'),'customersWithMerchantPayment',(select count(distinct actor_user_id) from lumo_private.journals where type='merchant_payment')),
   'generatedAt',clock_timestamp(),'definitions',jsonb_build_array('Amounts are integer GHS pesewas.','Value is total ledger movement, including internal transfers; it is not revenue or profit.','Only recorded outcomes are counted. Client abandonments and Lux satisfaction are not yet instrumented.'));
 elsif p_command='staff.list' then
  select count(*) into total from lumo_private.admin_staff;select coalesce(jsonb_agg(lumo_private.admin_staff_json(x.user_id) order by x.created_at),'[]'::jsonb) into rows from(select user_id,created_at from lumo_private.admin_staff order by created_at limit ps offset off)x;
  result:=jsonb_build_object('rows',rows,'total',total,'page',pg,'pageSize',ps,'pendingInvitations',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'email',t.email,'name',t.display_name,'role',t.role,'expiresAt',t.expires_at,'status',case when t.consumed_at is not null then 'accepted' when t.expires_at<clock_timestamp() then 'expired' else 'pending' end)),'[]'::jsonb) from lumo_private.admin_setup_tokens t where t.created_by is not null and t.consumed_at is null));
 elsif p_command='staff.invite' then
  email:=lower(trim(p_payload->>'email'));name:=trim(p_payload->>'name');role_value:=p_payload->>'role';
  if email is null or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(email)>254 or email like '%@pilot.lumo.invalid' or length(coalesce(name,'')) not between 1 and 80 or coalesce(p_payload->>'tokenHash','') !~ '^[a-f0-9]{64}$' or role_value not in ('support','supervisor','merchant_ops','finance','risk','technical','auditor','super_admin') then return jsonb_build_object('ok',false,'code','INVALID_INPUT','message','Check the staff invitation details.');end if;
  if exists(select 1 from lumo_private.admin_staff s where lower(s.email)=email) then return jsonb_build_object('ok',false,'code','ALREADY_ENROLLED','message','This staff member is already enrolled.');end if;
  insert into lumo_private.admin_setup_tokens(token_hash,email,display_name,role,created_by) values(p_payload->>'tokenHash',email,name,role_value,actor) returning id,expires_at into uid,at_time;
  perform lumo_private.admin_log(actor,staff.role,p_command,'staff_invitation',uid::text,'Staff invitation created',null,null,jsonb_build_object('email',email,'role',role_value));result:=jsonb_build_object('invitationId',uid,'email',email,'role',role_value,'expiresAt',at_time);
 elsif p_command='staff.update' then
  uid:=ident::uuid;perform pg_advisory_xact_lock(518285832);select lumo_private.admin_staff_json(uid) into old;
  if old is null then return jsonb_build_object('ok',false,'code','NOT_FOUND','message','Staff member not found.');end if;
  if uid=actor then return jsonb_build_object('ok',false,'code','SELF_CHANGE_FORBIDDEN','message','Another access administrator must change your access.');end if;
  role_value:=coalesce(p_payload->>'role',old->>'role');status_value:=coalesce(p_payload->>'status',old->>'status');
  if length(coalesce(reason,''))<3 then return jsonb_build_object('ok',false,'code','REASON_REQUIRED','message','Record the reason for this access change.');end if;
  if old->>'role'='super_admin' and old->>'status'='active' and (role_value<>'super_admin' or status_value<>'active') and (select count(*) from lumo_private.admin_staff where role='super_admin' and status='active')<=1 then return jsonb_build_object('ok',false,'code','LAST_ADMIN','message','Keep at least one active access administrator.');end if;
  update lumo_private.admin_staff set role=role_value,status=status_value,updated_at=clock_timestamp() where user_id=uid;
  if status_value='disabled' then delete from auth.sessions where user_id=uid;end if;
  new_value:=lumo_private.admin_staff_json(uid);perform lumo_private.admin_log(actor,staff.role,p_command,'staff',uid::text,reason,null,old,new_value);result:=jsonb_build_object('record',new_value,'staff',new_value);
 elsif p_command='audit.list' then
  select count(*) into total from lumo_private.admin_audit a where(q='' or a.action ilike '%'||q||'%' or a.entity_id=q or a.actor_id::text=q);
  select coalesce(jsonb_agg(x.item order by x.at desc),'[]'::jsonb) into rows from(select a.created_at at,jsonb_build_object('id',a.id,'name',a.action,'action',a.action,'actorId',a.actor_id,'actorName',s.display_name,'actorRole',a.actor_role,'entityType',a.entity_type,'entityId',a.entity_id,'reason',a.reason,'caseId',a.case_id,'before',a.before_value,'after',a.after_value,'createdAt',a.created_at) item from lumo_private.admin_audit a left join lumo_private.admin_staff s on s.user_id=a.actor_id where(q='' or a.action ilike '%'||q||'%' or a.entity_id=q or a.actor_id::text=q) order by a.created_at desc,a.id limit ps offset off)x;
  result:=jsonb_build_object('rows',rows,'total',total,'page',pg,'pageSize',ps);
 elsif p_command='approvals.list' then
  select count(*) into total from lumo_private.admin_approvals a where(filter_status is null or a.status=filter_status);
  select coalesce(jsonb_agg(x.item order by x.at desc),'[]'::jsonb) into rows from(select a.created_at at,jsonb_build_object('id',a.id,'name',a.action,'action',a.action,'entityId',a.entity_id,'reason',a.reason,'caseId',a.case_id,'requestedBy',a.requested_by,'requesterName',s.display_name,'decidedBy',a.decided_by,'status',a.status,'decisionReason',a.decision_reason,'result',a.result,'createdAt',a.created_at,'decidedAt',a.decided_at) item from lumo_private.admin_approvals a join lumo_private.admin_staff s on s.user_id=a.requested_by where(filter_status is null or a.status=filter_status) order by a.created_at desc,a.id limit ps offset off)x;
  result:=jsonb_build_object('rows',rows,'total',total,'page',pg,'pageSize',ps);
 elsif p_command='approvals.get' then
  uid:=ident::uuid;select * into approval from lumo_private.admin_approvals where id=uid;
  if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND','message','Approval request not found.');end if;
  entity:=jsonb_build_object('id',approval.id,'name',approval.action,'action',approval.action,'entityId',approval.entity_id,'reason',approval.reason,'caseId',approval.case_id,'requestedBy',approval.requested_by,'requesterName',(select s.display_name from lumo_private.admin_staff s where s.user_id=approval.requested_by),'decidedBy',approval.decided_by,'status',approval.status,'decisionReason',approval.decision_reason,'result',approval.result,'createdAt',approval.created_at,'decidedAt',approval.decided_at);
  result:=jsonb_build_object('record',entity,'approval',entity,'case',lumo_private.admin_case_json(approval.case_id),'timeline',(select coalesce(jsonb_agg(jsonb_build_object('at',a.created_at,'event',a.action,'detail',a.reason,'source','admin_audit','status','recorded') order by a.created_at),'[]'::jsonb) from lumo_private.admin_audit a where a.entity_type='approval' and a.entity_id=uid::text));
 elsif p_command='approvals.create' then
  action_value:=p_payload->>'action';ident:=coalesce(nullif(p_payload->>'entityId',''),ident);v_case:=nullif(p_payload->>'caseId','')::uuid;
  if length(coalesce(reason,''))<3 or v_case is null or not exists(select 1 from lumo_private.admin_cases where id=v_case) or ident is null or action_value not in ('account.suspend','account.restore','payment.refund','session.revoke','payment_link.disable') then return jsonb_build_object('ok',false,'code','INVALID_INPUT','message','Choose an action, affected record, case, and reason.');end if;
  if action_value in ('account.suspend','account.restore','session.revoke') and not exists(select 1 from lumo_private.profiles where user_id::text=ident) or action_value='payment.refund' and not exists(select 1 from lumo_private.journals where id::text=ident) or action_value='payment_link.disable' and not exists(select 1 from lumo_private.merchant_payment_links where id::text=ident) then return jsonb_build_object('ok',false,'code','NOT_FOUND','message','Affected record not found.');end if;
  insert into lumo_private.admin_approvals(action,entity_id,reason,case_id,requested_by) values(action_value,ident,reason,v_case,actor) returning id into uid;
  perform lumo_private.admin_log(actor,staff.role,p_command,'approval',uid::text,reason,v_case,null,jsonb_build_object('action',action_value,'entityId',ident));result:=jsonb_build_object('id',uid,'status','pending','message','Submitted for independent approval.');
 elsif p_command='approvals.decide' then
  uid:=ident::uuid;select * into approval from lumo_private.admin_approvals where id=uid for update;
  if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND','message','Approval request not found.');end if;
  if approval.status<>'pending' then return jsonb_build_object('ok',false,'code','ALREADY_DECIDED','message','This request has already been decided.');end if;
  if approval.requested_by=actor then return jsonb_build_object('ok',false,'code','SELF_APPROVAL_FORBIDDEN','message','A different authorised colleague must review your request.');end if;
  if staff.role='auditor' then return jsonb_build_object('ok',false,'code','FORBIDDEN','message','Your role has read-only access.');end if;
  if p_payload->>'decision' not in ('approve','reject') or length(coalesce(reason,''))<3 then return jsonb_build_object('ok',false,'code','INVALID_INPUT','message','Choose approve or reject and record your reason.');end if;
  if p_payload->>'decision'='reject' then status_value:='rejected';tmp:=jsonb_build_object('message','Request rejected. No customer records changed.');
  else
   if approval.action in ('account.suspend','account.restore') then
    if staff.role not in ('super_admin','risk','supervisor') then return jsonb_build_object('ok',false,'code','FORBIDDEN','message','Account restrictions require a risk or supervisor reviewer.');end if;
    status_value:='executed';update lumo_private.profiles set status=case when approval.action='account.suspend' then 'suspended' else 'active' end where user_id::text=approval.entity_id;
    if approval.action='account.suspend' then delete from auth.sessions where user_id::text=approval.entity_id;end if;
    tmp:=jsonb_build_object('message','Account access restriction updated. Ledger history and funds are unchanged.');
   elsif approval.action='session.revoke' then
    if staff.role not in ('super_admin','risk','supervisor') then return jsonb_build_object('ok',false,'code','FORBIDDEN','message','Session revocation requires a risk or supervisor reviewer.');end if;
    delete from auth.sessions where user_id::text=approval.entity_id;update lumo_private.approved_devices set revoked_at=clock_timestamp() where user_id::text=approval.entity_id and revoked_at is null;status_value:='executed';tmp:=jsonb_build_object('message','Customer sessions and registered device proofs revoked.');
   elsif approval.action='payment_link.disable' then
    if staff.role not in ('super_admin','risk','supervisor') then return jsonb_build_object('ok',false,'code','FORBIDDEN','message','Link restrictions require a risk or supervisor reviewer.');end if;
    update lumo_private.merchant_payment_links set revoked_at=coalesce(revoked_at,clock_timestamp()) where id::text=approval.entity_id;status_value:='executed';tmp:=jsonb_build_object('message','Payment link disabled. Existing payment outcomes remain available.');
   else
    status_value:='approved_pending_execution';tmp:=jsonb_build_object('message','Refund authorised for finance review. No money moved. Execute only through the original merchant refund workflow and attach its confirmed reference.','moneyMoved',false);
   end if;
  end if;
  update lumo_private.admin_approvals set status=status_value,decided_by=actor,decision_reason=reason,decided_at=clock_timestamp(),result=tmp where id=uid;
  perform lumo_private.admin_log(actor,staff.role,p_command,'approval',uid::text,reason,approval.case_id,jsonb_build_object('status','pending'),jsonb_build_object('status',status_value,'action',approval.action,'entityId',approval.entity_id));result:=jsonb_build_object('id',uid,'status',status_value,'result',tmp);
 else return jsonb_build_object('ok',false,'code','UNKNOWN_COMMAND','message','This administrative action is not supported.');
 end if;
 if not is_write then perform lumo_private.admin_log(actor,staff.role,p_command,split_part(p_command,'.',1),ident,null,null,null,null);end if;
 return jsonb_build_object('ok',true,'data',result);
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation or foreign_key_violation then
 return jsonb_build_object('ok',false,'code','INVALID_INPUT','message','Check the supplied record, status, role, and field values.');
when unique_violation then return jsonb_build_object('ok',false,'code','CONFLICT','message','A matching record already exists. Refresh and try again.');
end $admin$;
revoke all on function lumo_private.admin_sync_source_case(uuid),lumo_private.admin_pick(jsonb,text[]),lumo_private.admin_array(jsonb),lumo_private.admin_log(uuid,text,text,text,text,text,uuid,jsonb,jsonb),lumo_private.admin_staff_json(uuid),lumo_private.admin_case_json(uuid),lumo_private.admin_incident_json(uuid),lumo_private.admin_transaction_json(uuid),lumo_private.admin_customer_json(uuid),lumo_private.admin_product_json(uuid),lumo_private.admin_merchant_json(uuid),public.lumo_admin_service(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.lumo_admin_service(text,jsonb) to service_role;
