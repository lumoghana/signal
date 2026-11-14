-- Component: 20261113050620_lumo_connected_planning.sql
-- Shared planning, genuine savings accounts and two-party IOUs. Test GHS only.
-- Entry is the parent guarded dispatcher; private functions cannot be called by clients.
create table lumo_private.plans (
 owner_user_id uuid primary key references auth.users(id), revision integer not null default 1 check(revision>0),
 period_start date not null, period_end date not null, allowance_date date, keep_back bigint not null default 0 check(keep_back between 0 and 10000000), expected_allowance bigint not null default 0 check(expected_allowance between 0 and 10000000),
 updated_at timestamptz not null default now(), check(period_end>=period_start and period_end<=period_start+370)
);
create table lumo_private.budget_categories (
 id uuid primary key default gen_random_uuid(),owner_user_id uuid not null references auth.users(id),
 period_start date not null,period_end date not null,name text not null check(length(name) between 1 and 60),amount bigint not null check(amount between 0 and 10000000),
 active boolean not null default true,position integer not null default 0,created_at timestamptz not null default now()
);
create index lumo_budget_owner_period on lumo_private.budget_categories(owner_user_id,period_start,period_end) where active;
create table lumo_private.budget_spending (
 journal_id uuid primary key references lumo_private.journals(id),category_id uuid not null references lumo_private.budget_categories(id),
 amount bigint not null check(amount between -1000000 and 1000000 and amount<>0),created_at timestamptz not null default now()
);
create index lumo_budget_spend_category on lumo_private.budget_spending(category_id);
create table lumo_private.box_partner_invitations (
 id uuid primary key default gen_random_uuid(),owner_user_id uuid not null references auth.users(id),partner_user_id uuid not null references auth.users(id),
 status text not null default 'pending' check(status in('pending','accepted','declined','consumed','cancelled')),
 code_hash text,code_failures integer not null default 0 check(code_failures>=0),expires_at timestamptz not null default(now()+interval '1 day'),created_at timestamptz not null default now(),check(owner_user_id<>partner_user_id)
);
create index lumo_box_invitation_owner on lumo_private.box_partner_invitations(owner_user_id,created_at desc);
create index lumo_box_invitation_partner on lumo_private.box_partner_invitations(partner_user_id,created_at desc);
create table lumo_private.money_boxes (
 id uuid primary key default gen_random_uuid(),owner_user_id uuid not null references auth.users(id),account_id uuid not null unique references lumo_private.accounts(id),
 name text not null check(length(name) between 1 and 80),goal bigint not null check(goal between 1 and 10000000),target_date date,
 partner_user_id uuid references auth.users(id),invitation_id uuid unique references lumo_private.box_partner_invitations(id),
 status text not null default 'active' check(status in('active','archived')),created_at timestamptz not null default now(),
 check((partner_user_id is null)=(invitation_id is null)),check(partner_user_id is null or partner_user_id<>owner_user_id)
);
create index lumo_boxes_owner on lumo_private.money_boxes(owner_user_id,created_at desc);
create index lumo_boxes_partner on lumo_private.money_boxes(partner_user_id) where partner_user_id is not null;
create table lumo_private.box_release_requests (
 id uuid primary key default gen_random_uuid(),box_id uuid not null references lumo_private.money_boxes(id),amount bigint not null check(amount between 1 and 1000000),
 status text not null default 'pending' check(status in('pending','approved','declined','cancelled','consumed','locked')),
 code_hash text,code_failures integer not null default 0,expires_at timestamptz not null default(now()+interval '15 minutes'),journal_id uuid unique references lumo_private.journals(id),created_at timestamptz not null default now()
);
create index lumo_box_release_box on lumo_private.box_release_requests(box_id,created_at desc);
create table lumo_private.savings_hacks (
 id uuid primary key default gen_random_uuid(),box_id uuid not null unique references lumo_private.money_boxes(id),owner_user_id uuid not null references auth.users(id),
 rule text not null check(rule in('roundup','percent','fixed')),value bigint not null check(value between 1 and 100000),enabled boolean not null default true,
 created_at timestamptz not null default now(),check(rule<>'percent' or value<=100)
);
create index lumo_hacks_owner on lumo_private.savings_hacks(owner_user_id) where enabled;
create table lumo_private.ious (
 id uuid primary key default gen_random_uuid(),created_by uuid not null references auth.users(id),creditor_user_id uuid not null references auth.users(id),debtor_user_id uuid not null references auth.users(id),
 amount bigint not null check(amount between 1 and 1000000),paid bigint not null default 0 check(paid>=0),due_date date not null,note text not null default '' check(length(note)<=160),
 status text not null default 'pending' check(status in('pending','active','paid','declined','cancelled','forgiven')),
 reminded_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(creditor_user_id<>debtor_user_id),check(created_by in(creditor_user_id,debtor_user_id)),check(paid<=amount),check(status<>'paid' or paid=amount)
);
create index lumo_iou_creditor on lumo_private.ious(creditor_user_id,created_at desc);
create index lumo_iou_debtor on lumo_private.ious(debtor_user_id,created_at desc);
create table lumo_private.planning_postings (
 journal_id uuid primary key references lumo_private.journals(id),box_id uuid references lumo_private.money_boxes(id),iou_id uuid references lumo_private.ious(id),rule_id uuid references lumo_private.savings_hacks(id),
 check((box_id is not null)::integer+(iou_id is not null)::integer=1)
);
create index lumo_planning_post_box on lumo_private.planning_postings(box_id) where box_id is not null;
create index lumo_planning_post_iou on lumo_private.planning_postings(iou_id) where iou_id is not null;

-- Append-only budget allocations prevent rewriting prior spend history.
create trigger lumo_budget_spending_immutable before update or delete on lumo_private.budget_spending for each row execute function lumo_private.immutable_posting();
create trigger lumo_planning_postings_immutable before update or delete on lumo_private.planning_postings for each row execute function lumo_private.immutable_posting();

do $$declare item text;begin foreach item in array array['plans','budget_categories','budget_spending','box_partner_invitations','money_boxes','box_release_requests','savings_hacks','ious','planning_postings'] loop
 execute format('alter table lumo_private.%I enable row level security',item);
 execute format('revoke all on table lumo_private.%I from public,anon,authenticated,service_role',item);
end loop;end $$;

create function lumo_private.planning_uuid(p jsonb,k text) returns uuid language plpgsql immutable set search_path='' as $$
begin if jsonb_typeof(p->k) is distinct from 'string' or p->>k is null then raise exception 'INVALID_INPUT';end if;return(p->>k)::uuid;
exception when invalid_text_representation then raise exception 'INVALID_INPUT';end $$;
create function lumo_private.planning_amount(p jsonb,k text default 'amount',max_value bigint default 1000000,allow_zero boolean default false) returns bigint language plpgsql immutable set search_path='' as $$
declare n numeric;begin
 if jsonb_typeof(p->k) is distinct from 'number' then raise exception 'INVALID_INPUT';end if;n:=(p->>k)::numeric;
 if n<>trunc(n) or n<(case when allow_zero then 0 else 1 end) or n>max_value then raise exception 'INVALID_INPUT';end if;return n::bigint;
end $$;
create function lumo_private.planning_date(p jsonb,k text,required boolean default false) returns date language plpgsql immutable set search_path='' as $$
begin
 if not(p?k) or p->k='null'::jsonb or p->>k='' then if required then raise exception 'INVALID_INPUT';end if;return null;end if;
 if jsonb_typeof(p->k) is distinct from 'string' or p->>k !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INVALID_INPUT';end if;return(p->>k)::date;
exception when datetime_field_overflow or invalid_datetime_format then raise exception 'INVALID_INPUT';end $$;
create function lumo_private.planning_label(p jsonb,k text,lim integer,required boolean default true) returns text language plpgsql immutable set search_path='' as $$
declare v text;begin
 if not(p?k) and not required then return '';end if;
 if jsonb_typeof(p->k) is distinct from 'string' then raise exception 'INVALID_INPUT';end if;v:=trim(p->>k);
 if length(v)>lim or(required and length(v)=0) or v~'[[:cntrl:]<>]' then raise exception 'INVALID_INPUT';end if;return v;
end $$;
create function lumo_private.planning_code() returns text language sql volatile set search_path='' as $$
 select lpad((('x'||encode(extensions.gen_random_bytes(4),'hex'))::bit(32)::bigint%1000000)::text,6,'0');
$$;
create function lumo_private.planning_code_hash(code text,entity uuid) returns text language sql immutable set search_path='' as $$
 select encode(extensions.digest(entity::text||':'||coalesce(code,''),'sha256'),'hex');
$$;
create function lumo_private.box_json(box_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',b.id,'ownerUserId',b.owner_user_id,'name',b.name,'goal',b.goal,'balance',a.balance,'accountId',a.id,'targetDate',b.target_date,'status',b.status,
 'partnerHandle',p.handle,'partnerUserId',b.partner_user_id,'protected',b.partner_user_id is not null,'createdAt',b.created_at,
 'hack',(select jsonb_build_object('id',h.id,'boxId',h.box_id,'rule',h.rule,'value',h.value,'enabled',h.enabled) from lumo_private.savings_hacks h where h.box_id=b.id))
 from lumo_private.money_boxes b join lumo_private.accounts a on a.id=b.account_id left join lumo_private.profiles p on p.user_id=b.partner_user_id where b.id=box_json.box_id;
$$;
create function lumo_private.box_invitation_json(invitation_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',i.id,'ownerUserId',i.owner_user_id,'partnerUserId',i.partner_user_id,'ownerHandle',o.handle,'partnerHandle',p.handle,
 'status',case when i.expires_at<now() and i.status in('pending','accepted') then 'expired' else i.status end,'expiresAt',i.expires_at,'createdAt',i.created_at)
 from lumo_private.box_partner_invitations i join lumo_private.profiles o on o.user_id=i.owner_user_id join lumo_private.profiles p on p.user_id=i.partner_user_id where i.id=box_invitation_json.invitation_id;
$$;
create function lumo_private.box_release_json(release_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'boxId',b.id,'boxName',b.name,'ownerUserId',b.owner_user_id,'partnerUserId',b.partner_user_id,'ownerHandle',o.handle,'partnerHandle',p.handle,
 'amount',r.amount,'status',case when r.expires_at<now() and r.status in('pending','approved') then 'expired' else r.status end,'expiresAt',r.expires_at,'receiptId',r.journal_id,'createdAt',r.created_at)
 from lumo_private.box_release_requests r join lumo_private.money_boxes b on b.id=r.box_id join lumo_private.profiles o on o.user_id=b.owner_user_id join lumo_private.profiles p on p.user_id=b.partner_user_id where r.id=box_release_json.release_id;
$$;
create function lumo_private.iou_json(iou_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',i.id,'createdBy',i.created_by,'creditorUserId',i.creditor_user_id,'debtorUserId',i.debtor_user_id,'creditorHandle',c.handle,'debtorHandle',d.handle,
 'creditorName',c.display_name,'debtorName',d.display_name,'amount',i.amount,'paid',i.paid,'remaining',i.amount-i.paid,'dueDate',i.due_date,'note',i.note,'status',i.status,'remindedAt',i.reminded_at,'createdAt',i.created_at)
 from lumo_private.ious i join lumo_private.profiles c on c.user_id=i.creditor_user_id join lumo_private.profiles d on d.user_id=i.debtor_user_id where i.id=iou_json.iou_id;
$$;
create function lumo_private.plan_json(actor uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare p lumo_private.plans%rowtype;cat jsonb;remaining bigint;bal bigint;begin
 select * into p from lumo_private.plans where owner_user_id=actor;
 select balance into bal from lumo_private.accounts where owner_user_id=actor and kind='consumer';
 if p.owner_user_id is null then return jsonb_build_object('userId',actor,'revision',0,'periodStart',null,'periodEnd',null,'allowanceDate',null,'expectedAllowance',0,'categories','[]'::jsonb,'keepBack',0,'plannedRemaining',0,'leftAfterPlan',coalesce(bal,0));end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'amount',c.amount,'spent',coalesce(s.spent,0),'remaining',greatest(c.amount-coalesce(s.spent,0),0)) order by c.position,c.id),'[]'::jsonb),
 coalesce(sum(greatest(c.amount-coalesce(s.spent,0),0)),0) into cat,remaining
 from lumo_private.budget_categories c left join lateral(select sum(bs.amount) spent from lumo_private.budget_spending bs where bs.category_id=c.id)s on true
 where c.owner_user_id=actor and c.active and c.period_start=p.period_start and c.period_end=p.period_end;
 remaining:=remaining+p.keep_back;if p.period_end<current_date then remaining:=0;end if;
 return jsonb_build_object('userId',actor,'revision',p.revision,'periodStart',p.period_start,'periodEnd',p.period_end,'allowanceDate',p.allowance_date,'expectedAllowance',p.expected_allowance,'categories',cat,'keepBack',p.keep_back,'plannedRemaining',remaining,'leftAfterPlan',greatest(coalesce(bal,0)-remaining,0));
end $$;
create function lumo_private.planning_insights(actor uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare p jsonb:=lumo_private.plan_json(actor);bal bigint;savings bigint;owed bigint;owe bigint;spent bigint;days integer;burn bigint;runway bigint;period_start date;period_end date;begin
 select balance into bal from lumo_private.accounts where owner_user_id=actor and kind='consumer';
 select coalesce(sum(a.balance),0) into savings from lumo_private.money_boxes b join lumo_private.accounts a on a.id=b.account_id where b.owner_user_id=actor;
 select coalesce(sum(amount-paid) filter(where creditor_user_id=actor),0),coalesce(sum(amount-paid) filter(where debtor_user_id=actor),0) into owed,owe from lumo_private.ious where status='active' and actor in(creditor_user_id,debtor_user_id);
 period_start:=coalesce((p->>'periodStart')::date,current_date-29);period_end:=coalesce((p->>'periodEnd')::date,current_date);
 select coalesce(sum(j.amount-coalesce((select sum(refund.amount)from lumo_private.journals refund where refund.original_payment_id=j.id and refund.type='refund'),0)),0) into spent from lumo_private.journals j join lumo_private.accounts a on a.id=j.payer_account_id where a.owner_user_id=actor and a.kind='consumer' and j.type in('transfer','merchant_payment','iou_payment') and j.created_at>=period_start::timestamptz and j.created_at<(period_end+1)::timestamptz;
 days:=greatest(1,least(current_date,period_end)-period_start+1);burn:=ceil(spent::numeric/days);runway:=case when burn>0 then floor(coalesce(bal,0)::numeric/burn)::bigint else null end;
 return jsonb_build_object('available',coalesce(bal,0),'protectedSavings',savings,'plannedRemaining',(p->>'plannedRemaining')::bigint,'leftAfterPlan',(p->>'leftAfterPlan')::bigint,
 'owedToYou',owed,'youOwe',owe,'periodSpent',spent,'dailyBurn',burn,'runwayDays',runway,'nextAllowanceDate',p->'allowanceDate','expectedAllowance',p->'expectedAllowance',
 'lateAllowance',(p->>'allowanceDate')::date<current_date and (p->>'expectedAllowance')::bigint>0,
 'recentSpending',coalesce((select jsonb_agg(lumo_private.receipt_json(x.id) order by x.created_at desc) from(select j.id,j.created_at from lumo_private.journals j join lumo_private.accounts a on a.id=j.payer_account_id where a.owner_user_id=actor and a.kind='consumer' and j.type in('transfer','merchant_payment','iou_payment') order by j.created_at desc limit 5)x),'[]'::jsonb));
end $$;

create table lumo_private.recovery_plans (
 id uuid primary key default gen_random_uuid(),owner_user_id uuid not null references auth.users(id),status text not null default 'active' check(status in('active','completed')),
 check_in_date date not null,daily_limit bigint not null check(daily_limit between 1 and 1000000),protected_category_ids uuid[] not null default '{}',adjustments jsonb not null default '[]',
 created_at timestamptz not null default now(),completed_at timestamptz
);
create unique index lumo_one_active_recovery on lumo_private.recovery_plans(owner_user_id) where status='active';
create index lumo_recovery_owner on lumo_private.recovery_plans(owner_user_id,created_at desc);
create table lumo_private.external_money_records (
 id uuid primary key default gen_random_uuid(),owner_user_id uuid not null references auth.users(id),name text not null check(length(name) between 1 and 80),
 kind text not null check(kind in('cash','bank','momo')),balance bigint not null check(balance between 0 and 1000000000),status text not null default 'active' check(status in('active','archived')),
 updated_at timestamptz not null default now(),created_at timestamptz not null default now()
);
create index lumo_external_records_owner on lumo_private.external_money_records(owner_user_id,updated_at desc);
create table lumo_private.external_money_history (
 id uuid primary key default gen_random_uuid(),record_id uuid not null references lumo_private.external_money_records(id),balance bigint not null check(balance between 0 and 1000000000),
 note text not null default '' check(length(note)<=160),recorded_at timestamptz not null default now()
);
create index lumo_external_history_record on lumo_private.external_money_history(record_id,recorded_at desc);
create trigger lumo_external_history_immutable before update or delete on lumo_private.external_money_history for each row execute function lumo_private.immutable_posting();
do $$declare item text;begin foreach item in array array['recovery_plans','external_money_records','external_money_history'] loop
 execute format('alter table lumo_private.%I enable row level security',item);
 execute format('revoke all on table lumo_private.%I from public,anon,authenticated,service_role',item);
end loop;end $$;
create function lumo_private.recovery_json(recovery_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'userId',r.owner_user_id,'status',r.status,'checkInDate',r.check_in_date,'dailyLimit',r.daily_limit,
 'protectedCategoryIds',r.protected_category_ids,'adjustments',r.adjustments,'createdAt',r.created_at,'completedAt',r.completed_at) from lumo_private.recovery_plans r where r.id=recovery_json.recovery_id;
$$;
create function lumo_private.external_record_json(record_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'userId',r.owner_user_id,'name',r.name,'kind',r.kind,'balance',r.balance,'status',r.status,'updatedAt',r.updated_at,'informational',true) from lumo_private.external_money_records r where r.id=external_record_json.record_id;
$$;

create function lumo_private.planning_command(p_command text,p_payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor uuid:=auth.uid();own_account uuid;other_account uuid;other_user uuid;entity uuid;journal uuid;new_account uuid;
 p lumo_private.plans%rowtype;c lumo_private.budget_categories%rowtype;b lumo_private.money_boxes%rowtype;inv lumo_private.box_partner_invitations%rowtype;
 rel lumo_private.box_release_requests%rowtype;io lumo_private.ious%rowtype;h lumo_private.savings_hacks%rowtype;r lumo_private.recovery_plans%rowtype;ext lumo_private.external_money_records%rowtype;
 item jsonb;plan_data jsonb;ins jsonb;response jsonb;items jsonb;label text;note text;v_kind text;v_handle text;code text;question text;answer text;
 n bigint;v bigint;spent bigint;total bigint;expected bigint;keep bigint;revision bigint;start_date date;end_date date;due date;allowance date;
 normalized_items jsonb:='[]'::jsonb;category_ids uuid[]:='{}';protected_ids uuid[]:='{}';same_period boolean;accept boolean;valid boolean;
begin
 if actor is null or jsonb_typeof(p_payload) is distinct from 'object' then return lumo_private.failure('AUTH_REQUIRED','Sign in to Lumo before continuing.',false);end if;
 select id into own_account from lumo_private.accounts where owner_user_id=actor and kind='consumer' and status='active';
 if own_account is null then return lumo_private.failure('ACCOUNT_REQUIRED','Open your Lumo account first.',false);end if;
 if p_command='plan.get' then
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','plan',lumo_private.plan_json(actor),
   'boxes',coalesce((select jsonb_agg(lumo_private.box_json(x.id) order by x.created_at) from lumo_private.money_boxes x where x.owner_user_id=actor and x.status='active'),'[]'::jsonb),
   'ious',coalesce((select jsonb_agg(lumo_private.iou_json(x.id) order by x.created_at desc) from lumo_private.ious x where actor in(x.creditor_user_id,x.debtor_user_id)),'[]'::jsonb));
 elsif p_command='plan.save' then
  start_date:=lumo_private.planning_date(p_payload,'periodStart',true);end_date:=lumo_private.planning_date(p_payload,'periodEnd',true);allowance:=lumo_private.planning_date(p_payload,'allowanceDate');
  if end_date<start_date or end_date>start_date+370 or start_date<current_date-370 or start_date>current_date+370 then raise exception 'INVALID_INPUT';end if;
  revision:=lumo_private.planning_amount(p_payload,'revision',2147483646,true);expected:=case when p_payload?'expectedAllowance' then lumo_private.planning_amount(p_payload,'expectedAllowance',10000000,true) else 0 end;
  keep:=case when p_payload?'keepBack' then lumo_private.planning_amount(p_payload,'keepBack',10000000,true) else 0 end;
  if jsonb_typeof(p_payload->'categories') is distinct from 'array' or jsonb_array_length(p_payload->'categories') not between 1 and 20 then raise exception 'INVALID_INPUT';end if;
  select * into p from lumo_private.plans where owner_user_id=actor for update;
  if coalesce(p.revision,0)<>revision then return lumo_private.failure('PLAN_CHANGED','Your plan changed on another device. Refresh it before saving.');end if;
  same_period:=p.owner_user_id is not null and p.period_start=start_date and p.period_end=end_date;
  if not same_period and p.owner_user_id is not null and start_date<=p.period_end and exists(select 1 from lumo_private.budget_spending bs join lumo_private.budget_categories bc on bc.id=bs.category_id where bc.owner_user_id=actor and bc.period_start=p.period_start and bc.period_end=p.period_end) then
   return lumo_private.failure('PLAN_PERIOD_LOCKED','Keep this plan period after spending. Start your next plan after the current period ends.');
  end if;
  if(select count(*) from(select lower(trim(x->>'name')) from jsonb_array_elements(p_payload->'categories')x group by lower(trim(x->>'name')))y)<>jsonb_array_length(p_payload->'categories') then raise exception 'INVALID_INPUT';end if;
  total:=keep;
  for item in select value from jsonb_array_elements(p_payload->'categories') loop
   label:=lumo_private.planning_label(item,'name',60);n:=lumo_private.planning_amount(item,'amount',10000000,true);total:=total+n;
   if total>10000000 then raise exception 'INVALID_INPUT';end if;
   entity:=null;
   if item?'id' and item->'id'<>'null'::jsonb then
    entity:=lumo_private.planning_uuid(item,'id');select * into c from lumo_private.budget_categories where id=entity and owner_user_id=actor and active;
    if not found then return lumo_private.failure('BUDGET_CATEGORY_UNAVAILABLE','Refresh this plan before editing its categories.');end if;
    if entity=any(category_ids) then raise exception 'INVALID_INPUT';end if;
    if not same_period then entity:=null;end if;
   end if;
   if entity is not null then
    select coalesce(sum(bs.amount),0) into spent from lumo_private.budget_spending bs where bs.category_id=entity;
    if n<spent then return lumo_private.failure('BUDGET_BELOW_SPENT','A budget cannot be reduced below money already spent.');end if;
   else entity:=gen_random_uuid();end if;
   category_ids:=array_append(category_ids,entity);
   normalized_items:=normalized_items||jsonb_build_array(jsonb_build_object('id',entity,'name',label,'amount',n,'position',cardinality(category_ids)-1));
  end loop;
  if same_period and exists(select 1 from lumo_private.budget_categories bc where bc.owner_user_id=actor and bc.active and bc.period_start=start_date and bc.period_end=end_date and not(bc.id=any(category_ids)) and exists(select 1 from lumo_private.budget_spending bs where bs.category_id=bc.id)) then
   return lumo_private.failure('BUDGET_HAS_SPENDING','Keep categories with recorded spending in this plan.');
  end if;
  for item in select value from jsonb_array_elements(normalized_items) loop
   insert into lumo_private.budget_categories(id,owner_user_id,period_start,period_end,name,amount,position)
   values((item->>'id')::uuid,actor,start_date,end_date,item->>'name',(item->>'amount')::bigint,(item->>'position')::integer)
   on conflict(id) do update set name=excluded.name,amount=excluded.amount,position=excluded.position;
  end loop;
  update lumo_private.budget_categories set active=false where owner_user_id=actor and active and not(id=any(category_ids));
  insert into lumo_private.plans(owner_user_id,revision,period_start,period_end,allowance_date,expected_allowance,keep_back)values(actor,revision+1,start_date,end_date,allowance,expected,keep)
  on conflict(owner_user_id)do update set revision=excluded.revision,period_start=excluded.period_start,period_end=excluded.period_end,allowance_date=excluded.allowance_date,expected_allowance=excluded.expected_allowance,keep_back=excluded.keep_back,updated_at=clock_timestamp();
  response:=jsonb_build_object('plan',lumo_private.plan_json(actor));
 elsif p_command='box.list' then
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS',
   'boxes',coalesce((select jsonb_agg(lumo_private.box_json(x.id) order by x.created_at) from lumo_private.money_boxes x where x.owner_user_id=actor and x.status='active'),'[]'::jsonb),
   'partnerInvitations',coalesce((select jsonb_agg(lumo_private.box_invitation_json(x.id) order by x.created_at desc) from(select * from lumo_private.box_partner_invitations where actor in(owner_user_id,partner_user_id) order by created_at desc limit 100)x),'[]'::jsonb),
   'releaseRequests',coalesce((select jsonb_agg(lumo_private.box_release_json(x.id) order by x.created_at desc) from(select rr.* from lumo_private.box_release_requests rr join lumo_private.money_boxes bb on bb.id=rr.box_id where actor in(bb.owner_user_id,bb.partner_user_id) order by rr.created_at desc limit 100)x),'[]'::jsonb));
 elsif p_command='box.partner.invite' then
  v_handle:=lower(lumo_private.planning_label(p_payload,'partnerHandle',30));select user_id into other_user from lumo_private.profiles where profiles.handle=v_handle and status='active';
  if other_user is null or other_user=actor then return lumo_private.failure('INVALID_PARTNER','Choose another active Lumo handle as your partner.');end if;
  if(select count(*) from lumo_private.box_partner_invitations where owner_user_id=actor and status in('pending','accepted') and expires_at>now())>=20 then return lumo_private.failure('INVITATION_LIMIT','Finish an existing partner invitation before creating another.');end if;
  insert into lumo_private.box_partner_invitations(owner_user_id,partner_user_id)values(actor,other_user)returning * into inv;
  perform lumo_private.notify_user(other_user,'box.partner.invited','Accountability invitation','An account has invited you to protect a Money Box. Review it before accepting.','box_partner_invitation',inv.id);
  response:=jsonb_build_object('invitation',lumo_private.box_invitation_json(inv.id));
 elsif p_command='box.partner.respond' then
  entity:=lumo_private.planning_uuid(p_payload,'invitationId');if jsonb_typeof(p_payload->'accept') is distinct from 'boolean' then raise exception 'INVALID_INPUT';end if;accept:=(p_payload->>'accept')::boolean;
  select * into inv from lumo_private.box_partner_invitations where id=entity for update;
  if not found or inv.partner_user_id<>actor then return lumo_private.failure('FORBIDDEN','Only the invited partner can answer this invitation.');end if;
  if inv.status<>'pending' or inv.expires_at<=clock_timestamp() then return lumo_private.failure('INVITATION_UNAVAILABLE','This invitation is no longer waiting.');end if;
  if accept then code:=lumo_private.planning_code();end if;
  update lumo_private.box_partner_invitations set status=case when accept then 'accepted' else 'declined' end,code_hash=case when accept then lumo_private.planning_code_hash(code,entity) else null end where id=entity;
  perform lumo_private.notify_user(inv.owner_user_id,'box.partner.responded','Partner invitation updated',case when accept then 'Your partner accepted. Ask them for the code to finish creating your protected Money Box.' else 'Your partner declined the invitation.' end,'box_partner_invitation',entity);
  response:=jsonb_strip_nulls(jsonb_build_object('invitation',lumo_private.box_invitation_json(entity),'partnerCode',code));
 elsif p_command='box.create' then
  label:=lumo_private.planning_label(p_payload,'name',80);n:=lumo_private.planning_amount(p_payload,'goal',10000000);due:=lumo_private.planning_date(p_payload,'targetDate');
  if(select count(*) from lumo_private.money_boxes where owner_user_id=actor and status='active')>=50 then return lumo_private.failure('BOX_LIMIT','Archive an empty Money Box before adding another.');end if;
  if p_payload?'partnerInvitationId' and p_payload->'partnerInvitationId'<>'null'::jsonb then
   entity:=lumo_private.planning_uuid(p_payload,'partnerInvitationId');select * into inv from lumo_private.box_partner_invitations where id=entity for update;
   if not found or inv.owner_user_id<>actor or inv.status<>'accepted' or inv.expires_at<=clock_timestamp() or inv.code_failures>=5 then return lumo_private.failure('PARTNER_APPROVAL_REQUIRED','Your partner must accept and share a fresh creation code first.');end if;
   if not(p_payload?'partnerCode') or p_payload->>'partnerCode'='' then return lumo_private.failure('SECRET_REQUIRED','Enter the fresh creation code from your accepted partner.',false);end if;
   if jsonb_typeof(p_payload->'partnerCode') is distinct from 'string' or coalesce(p_payload->>'partnerCode','')!~'^[0-9]{6}$' or lumo_private.planning_code_hash(p_payload->>'partnerCode',entity)<>inv.code_hash then
    update lumo_private.box_partner_invitations set code_failures=code_failures+1,status=case when code_failures>=4 then 'cancelled' else status end where id=entity;
    return lumo_private.failure('PARTNER_CODE_INVALID','That partner code does not match. Ask your partner for the correct creation code.',false);
   end if;
   other_user:=inv.partner_user_id;
  elsif p_payload?'partnerCode' then return lumo_private.failure('PARTNER_APPROVAL_REQUIRED','Choose the accepted partner invitation for this code.');
  end if;
  insert into lumo_private.accounts(owner_user_id,kind)values(actor,'money_box')returning id into new_account;
  insert into lumo_private.money_boxes(owner_user_id,account_id,name,goal,target_date,partner_user_id,invitation_id)values(actor,new_account,label,n,due,other_user,entity)returning * into b;
  if entity is not null then update lumo_private.box_partner_invitations set status='consumed',code_hash=null where id=entity;end if;
  response:=jsonb_build_object('box',lumo_private.box_json(b.id));
 elsif p_command in('box.update','box.archive','box.save','box.withdraw','box.release.request','hack.save','hack.delete') then
  entity:=lumo_private.planning_uuid(p_payload,'boxId');select * into b from lumo_private.money_boxes where id=entity for update;
  if not found or b.owner_user_id<>actor then return lumo_private.failure('FORBIDDEN','Only the Money Box owner can do that.');end if;
  if b.status<>'active' then return lumo_private.failure('BOX_UNAVAILABLE','This Money Box is archived.');end if;
  if p_command='box.update' then
   if p_payload?'partnerUserId' or p_payload?'partnerHandle' or p_payload?'protected' or p_payload?'partnerInvitationId' then return lumo_private.failure('PARTNER_APPROVAL_REQUIRED','Partner protection cannot be removed by editing a Money Box.');end if;
   label:=case when p_payload?'name' then lumo_private.planning_label(p_payload,'name',80) else b.name end;n:=case when p_payload?'goal' then lumo_private.planning_amount(p_payload,'goal',10000000) else b.goal end;due:=case when p_payload?'targetDate' then lumo_private.planning_date(p_payload,'targetDate') else b.target_date end;
   update lumo_private.money_boxes set name=label,goal=n,target_date=due where id=entity;response:=jsonb_build_object('box',lumo_private.box_json(entity));
  elsif p_command='box.archive' then
   perform 1 from lumo_private.accounts where id=b.account_id for update;
   if(select balance from lumo_private.accounts where id=b.account_id)<>0 or exists(select 1 from lumo_private.savings_hacks where box_id=b.id and enabled) then return lumo_private.failure('BOX_NOT_EMPTY','Move the balance back and pause its savings hack before archiving.');end if;
   update lumo_private.money_boxes set status='archived' where id=entity;response:=jsonb_build_object('box',lumo_private.box_json(entity));
  elsif p_command in('box.save','box.withdraw') then
   n:=lumo_private.planning_amount(p_payload);
   if p_command='box.withdraw' and b.partner_user_id is not null then
    entity:=lumo_private.planning_uuid(p_payload,'releaseId');select * into rel from lumo_private.box_release_requests where id=entity and box_id=b.id for update;
    if not found or rel.status<>'approved' or rel.expires_at<=clock_timestamp() or rel.amount<>n or rel.code_failures>=5 then return lumo_private.failure('PARTNER_APPROVAL_REQUIRED','Get a fresh partner approval for this exact withdrawal amount.');end if;
    if not(p_payload?'partnerCode') or p_payload->>'partnerCode'='' then return lumo_private.failure('SECRET_REQUIRED','Enter the fresh code for this approved withdrawal.',false);end if;
    if jsonb_typeof(p_payload->'partnerCode') is distinct from 'string' or coalesce(p_payload->>'partnerCode','')!~'^[0-9]{6}$' or lumo_private.planning_code_hash(p_payload->>'partnerCode',rel.id)<>rel.code_hash then
     update lumo_private.box_release_requests set code_failures=code_failures+1,status=case when code_failures>=4 then 'locked' else status end where id=rel.id;
     return lumo_private.failure('PARTNER_CODE_INVALID','The withdrawal code does not match. Check with your partner.',false);
    end if;
   end if;
   journal:=lumo_private.post_money(actor,case when p_command='box.save' then 'box_save' else 'box_withdraw' end,n,case when p_command='box.save' then own_account else b.account_id end,case when p_command='box.save' then b.account_id else own_account end);
   insert into lumo_private.planning_postings(journal_id,box_id)values(journal,b.id);
   if rel.id is not null then update lumo_private.box_release_requests set status='consumed',journal_id=journal,code_hash=null where id=rel.id;end if;
   response:=jsonb_build_object('box',lumo_private.box_json(b.id),'receipt',lumo_private.receipt_json(journal)||jsonb_build_object('boxId',b.id));
  elsif p_command='box.release.request' then
   n:=lumo_private.planning_amount(p_payload);if b.partner_user_id is null then return lumo_private.failure('PARTNER_NOT_REQUIRED','This Money Box does not need partner approval.');end if;
   if n>(select balance from lumo_private.accounts where id=b.account_id)then return lumo_private.failure('INSUFFICIENT_FUNDS','Choose an amount within this Money Box balance.');end if;
   update lumo_private.box_release_requests set status='cancelled',code_hash=null where box_id=b.id and status in('pending','approved');
   insert into lumo_private.box_release_requests(box_id,amount)values(b.id,n)returning * into rel;
   perform lumo_private.notify_user(b.partner_user_id,'box.release.requested','Money Box approval requested','Review the exact amount before sharing a withdrawal code.','box_release',rel.id);
   response:=jsonb_build_object('release',lumo_private.box_release_json(rel.id));
  elsif p_command='hack.save' then
   v_kind:=lumo_private.planning_label(p_payload,'rule',10);n:=lumo_private.planning_amount(p_payload,'value',100000);
   if v_kind not in('roundup','percent','fixed') or(v_kind='percent' and n>100)or jsonb_typeof(p_payload->'enabled') is distinct from 'boolean' then raise exception 'INVALID_INPUT';end if;
   insert into lumo_private.savings_hacks(box_id,owner_user_id,rule,value,enabled)values(b.id,actor,v_kind,n,(p_payload->>'enabled')::boolean)
   on conflict(box_id)do update set rule=excluded.rule,value=excluded.value,enabled=excluded.enabled returning * into h;
   response:=jsonb_build_object('hack',jsonb_build_object('id',h.id,'boxId',b.id,'rule',h.rule,'value',h.value,'enabled',h.enabled));
  else
   select * into h from lumo_private.savings_hacks where box_id=b.id;
   update lumo_private.savings_hacks set enabled=false where box_id=b.id;
   response:=jsonb_build_object('hack',jsonb_build_object('id',h.id,'boxId',b.id,'enabled',false,'deleted',true));
  end if;
 elsif p_command in('box.release.decide','box.release.cancel') then
  entity:=lumo_private.planning_uuid(p_payload,'releaseId');
  -- Lock the box before its approval to match the owner withdrawal lock order.
  select bb.* into b from lumo_private.money_boxes bb join lumo_private.box_release_requests rr on rr.box_id=bb.id where rr.id=entity for update of bb;
  select * into rel from lumo_private.box_release_requests where id=entity for update;
  if not found or b.id is null or actor not in(b.owner_user_id,b.partner_user_id)then return lumo_private.failure('FORBIDDEN','This approval is private to the owner and partner.');end if;
  if rel.status not in('pending','approved') or rel.expires_at<=clock_timestamp()then return lumo_private.failure('RELEASE_UNAVAILABLE','This withdrawal request is no longer waiting.');end if;
  if p_command='box.release.cancel' then
   if b.owner_user_id<>actor then return lumo_private.failure('FORBIDDEN','Only the owner can cancel their withdrawal request.');end if;
   update lumo_private.box_release_requests set status='cancelled',code_hash=null where id=entity;
  else
   if b.partner_user_id<>actor then return lumo_private.failure('FORBIDDEN','Only the accepted partner can decide this withdrawal.');end if;
   if rel.status<>'pending' then return lumo_private.failure('RELEASE_UNAVAILABLE','This withdrawal already has a decision.');end if;
   if jsonb_typeof(p_payload->'approve') is distinct from 'boolean'then raise exception 'INVALID_INPUT';end if;accept:=(p_payload->>'approve')::boolean;
   if accept then code:=lumo_private.planning_code();end if;
   update lumo_private.box_release_requests set status=case when accept then 'approved' else 'declined'end,code_hash=case when accept then lumo_private.planning_code_hash(code,entity)else null end where id=entity;
   perform lumo_private.notify_user(b.owner_user_id,'box.release.decided','Withdrawal approval updated',case when accept then 'Your partner approved the amount. Ask them for the fresh code, then confirm with your own PIN.'else 'Your partner declined this withdrawal.'end,'box_release',entity);
  end if;
  response:=jsonb_strip_nulls(jsonb_build_object('release',lumo_private.box_release_json(entity),'partnerCode',code));
 elsif p_command='iou.list' then
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','ious',coalesce((select jsonb_agg(lumo_private.iou_json(x.id)order by x.created_at desc)from(select * from lumo_private.ious where actor in(creditor_user_id,debtor_user_id)order by created_at desc limit 200)x),'[]'::jsonb));
 elsif p_command='iou.create' then
  v_handle:=lower(lumo_private.planning_label(p_payload,'counterpartyHandle',30));v_kind:=lumo_private.planning_label(p_payload,'direction',8);n:=lumo_private.planning_amount(p_payload);due:=lumo_private.planning_date(p_payload,'dueDate',true);note:=lumo_private.planning_label(p_payload,'note',160,false);
  if v_kind not in('borrow','lend') or due<current_date-370 or due>current_date+3650 then raise exception 'INVALID_INPUT';end if;
  select user_id into other_user from lumo_private.profiles where profiles.handle=v_handle and status='active';
  if other_user is null or other_user=actor then return lumo_private.failure('RECIPIENT_NOT_FOUND','Choose another active Lumo account for this IOU.');end if;
  if(select count(*)from lumo_private.ious where created_by=actor and status in('pending','active'))>=100 then return lumo_private.failure('IOU_LIMIT','Close existing IOUs before adding more.');end if;
  insert into lumo_private.ious(created_by,creditor_user_id,debtor_user_id,amount,due_date,note)values(actor,case when v_kind='lend'then actor else other_user end,case when v_kind='borrow'then actor else other_user end,n,due,note)returning * into io;
  perform lumo_private.notify_user(other_user,'iou.invited','IOU needs your confirmation','Review who owes whom, the amount and due date before accepting.','iou',io.id);
  response:=jsonb_build_object('iou',lumo_private.iou_json(io.id));
 elsif p_command in('iou.respond','iou.remind','iou.pay','iou.cancel') then
  entity:=lumo_private.planning_uuid(p_payload,'iouId');select * into io from lumo_private.ious where id=entity for update;
  if not found or actor not in(io.creditor_user_id,io.debtor_user_id)then return lumo_private.failure('FORBIDDEN','This IOU is private to its two people.');end if;
  if p_command='iou.respond' then
   if actor=io.created_by or io.status<>'pending'then return lumo_private.failure('IOU_UNAVAILABLE','Only the other person can confirm a waiting IOU.');end if;
   if jsonb_typeof(p_payload->'accept')is distinct from 'boolean'then raise exception 'INVALID_INPUT';end if;accept:=(p_payload->>'accept')::boolean;
   update lumo_private.ious set status=case when accept then 'active'else 'declined'end,updated_at=clock_timestamp()where id=entity;
   perform lumo_private.notify_user(io.created_by,'iou.responded','IOU confirmation updated',case when accept then 'The other person accepted this IOU. This is expected money, not available funds.'else 'The other person declined this IOU.'end,'iou',entity);
  elsif p_command='iou.remind' then
   if actor<>io.creditor_user_id or io.status<>'active'then return lumo_private.failure('IOU_UNAVAILABLE','Only the person owed can remind an accepted unpaid IOU.');end if;
   if io.reminded_at>clock_timestamp()-interval '1 day'then return lumo_private.failure('REMINDER_LIMIT','This person was reminded today. Give them time to respond.');end if;
   update lumo_private.ious set reminded_at=clock_timestamp(),updated_at=clock_timestamp()where id=entity;
   perform lumo_private.notify_user(io.debtor_user_id,'iou.reminder','IOU reminder','An accepted IOU still has an outstanding balance. Open it to check the amount and due date.','iou',entity);
  elsif p_command='iou.cancel' then
   if not(io.status='pending'and actor=io.created_by)and not(io.status='active'and actor=io.creditor_user_id)then return lumo_private.failure('IOU_UNAVAILABLE','Only a pending creator or the person owed can close this IOU.');end if;
   update lumo_private.ious set status=case when io.status='active'then 'forgiven'else 'cancelled'end,updated_at=clock_timestamp()where id=entity;
   perform lumo_private.notify_user(case when actor=io.creditor_user_id then io.debtor_user_id else io.creditor_user_id end,'iou.closed','IOU closed','This IOU was closed without moving any money.','iou',entity);
  else
   if actor<>io.debtor_user_id or io.status<>'active'then return lumo_private.failure('IOU_UNAVAILABLE','Only the person who owes can pay an accepted IOU.');end if;
   n:=lumo_private.planning_amount(p_payload);if n>io.amount-io.paid then return lumo_private.failure('IOU_OVERPAYMENT','Choose an amount within the outstanding IOU balance.');end if;
   select id into other_account from lumo_private.accounts where owner_user_id=io.creditor_user_id and kind='consumer';
   journal:=lumo_private.post_money(actor,'iou_payment',n,own_account,other_account);
   insert into lumo_private.planning_postings(journal_id,iou_id)values(journal,io.id);
   update lumo_private.ious set paid=paid+n,status=case when paid+n=amount then 'paid'else 'active'end,updated_at=clock_timestamp()where id=io.id;
   perform lumo_private.notify_user(io.creditor_user_id,'iou.paid','IOU payment received','The shared Lumo ledger confirms a payment against your IOU.','iou',entity);
  end if;
  response:=jsonb_build_object('iou',lumo_private.iou_json(entity));
  if journal is not null then response:=response||jsonb_build_object('receipt',lumo_private.receipt_json(journal)||jsonb_build_object('iouId',entity));end if;
 elsif p_command='insight.get' then response:=jsonb_build_object('insights',lumo_private.planning_insights(actor));
 elsif p_command='money.chat' then
  question:=lower(lumo_private.planning_label(p_payload,'question',500));ins:=lumo_private.planning_insights(actor);
  if question~'(how long|last|runway|burn)'then
   answer:=case when ins->>'runwayDays'is null then 'There is not enough spending history to estimate your runway yet. Your available shared balance is GH₵'||to_char((ins->>'available')::numeric/100,'FM999999990.00')||'.'else 'At your recorded daily spending of GH₵'||to_char((ins->>'dailyBurn')::numeric/100,'FM999999990.00')||', your actual Everyday balance would last about '||(ins->>'runwayDays')||' days. This is an estimate based on posted spending, not a promise.'end;
  elsif question~'(owe|owed|debt|iou)'then answer:='Accepted IOUs show GH₵'||to_char((ins->>'owedToYou')::numeric/100,'FM999999990.00')||' owed to you and GH₵'||to_char((ins->>'youOwe')::numeric/100,'FM999999990.00')||' you owe. Money owed to you is expected money and is excluded from your available balance.';
  elsif question~'(save|saving|box|goal)'then answer:='Your Money Boxes hold GH₵'||to_char((ins->>'protectedSavings')::numeric/100,'FM999999990.00')||' in separate shared accounts. That money is excluded from Everyday. Open a box to see its goal, hack and any partner protection.';
  elsif question~'(allowance|late|recover)'then answer:=case when coalesce((ins->>'lateAllowance')::boolean,false)then 'Your saved allowance date has passed. Until the money actually arrives, plan using the GH₵'||to_char((ins->>'available')::numeric/100,'FM999999990.00')||' currently in Everyday. Start a recovery plan to protect essentials and pause automatic savings.'else 'Your expected allowance is a plan, not available money. Only a posted credit increases your shared balance. Your current Everyday balance is GH₵'||to_char((ins->>'available')::numeric/100,'FM999999990.00')||'.'end;
  elsif question~'(spend|spent|where|going)'then answer:='Recorded spending in this plan period is GH₵'||to_char((ins->>'periodSpent')::numeric/100,'FM999999990.00')||'. This includes posted consumer transfers, merchant payments and IOU repayments; it excludes moving money into your own boxes. Open Activity for the receipts.';
  elsif question~'(budget|plan|left|afford|available|balance|money)'then answer:='Everyday contains GH₵'||to_char((ins->>'available')::numeric/100,'FM999999990.00')||'. After the remaining Essentials and keep-back in your plan, GH₵'||to_char((ins->>'leftAfterPlan')::numeric/100,'FM999999990.00')||' is left unplanned. Savings, group funds and expected IOUs are kept separate.';
  else answer:='I can calculate your available money, money left after your plan, spending, runway, Money Boxes and accepted IOUs from shared Lumo records. Ask about one of these. I cannot see unrecorded cash or external bank/MoMo activity.';end if;
  response:=jsonb_build_object('answer',answer,'grounded',true,'engine','ledger-calculations','insights',ins);
 elsif p_command='recovery.plan' then
  ins:=lumo_private.planning_insights(actor);select * into r from lumo_private.recovery_plans where owner_user_id=actor and status='active';
  response:=jsonb_build_object('recovery',jsonb_build_object('id',r.id,'available',ins->'available','plannedRemaining',ins->'plannedRemaining','leftAfterPlan',ins->'leftAfterPlan','dailyEssential',ins->'dailyBurn','runwayDays',ins->'runwayDays','allowanceLate',coalesce(ins->'lateAllowance','false'::jsonb),
  'steps',jsonb_build_array('Use only the balance already in Everyday.','Protect essentials and reduce flexible categories.','Pause savings hacks while the recovery plan is active.','Set a check-in date and review actual incoming payments.')));
 elsif p_command='recovery.get' then
  select * into r from lumo_private.recovery_plans where owner_user_id=actor order by(status='active')desc,created_at desc limit 1;
  response:=jsonb_build_object('recovery',case when r.id is null then null else lumo_private.recovery_json(r.id)end);
 elsif p_command='recovery.save' then
  due:=lumo_private.planning_date(p_payload,'checkInDate',true);n:=lumo_private.planning_amount(p_payload,'dailyLimit');if due<current_date or due>current_date+90 then raise exception 'INVALID_INPUT';end if;
  if(p_payload?'protectedCategoryIds'and jsonb_typeof(p_payload->'protectedCategoryIds')is distinct from 'array')or(p_payload?'adjustments'and jsonb_typeof(p_payload->'adjustments')is distinct from 'array')then raise exception 'INVALID_INPUT';end if;
  if jsonb_array_length(coalesce(p_payload->'protectedCategoryIds','[]'::jsonb))>20 or jsonb_array_length(coalesce(p_payload->'adjustments','[]'::jsonb))>20 then raise exception 'INVALID_INPUT';end if;
  select * into p from lumo_private.plans where owner_user_id=actor for update;
  for item in select value from jsonb_array_elements(coalesce(p_payload->'protectedCategoryIds','[]'::jsonb))loop
   entity:=lumo_private.planning_uuid(jsonb_build_object('id',item),'id');select * into c from lumo_private.budget_categories where id=entity and owner_user_id=actor and active;
   if not found then return lumo_private.failure('BUDGET_CATEGORY_UNAVAILABLE','Choose protected categories from your current Essentials.');end if;protected_ids:=array_append(protected_ids,entity);
  end loop;
  -- Validate the entire proposed change before writing any category.
  category_ids:='{}';
  for item in select value from jsonb_array_elements(coalesce(p_payload->'adjustments','[]'::jsonb))loop
   entity:=lumo_private.planning_uuid(item,'categoryId');v:=lumo_private.planning_amount(item,'amount',10000000,true);
   select * into c from lumo_private.budget_categories where id=entity and owner_user_id=actor and active;
   if not found or entity=any(category_ids)then return lumo_private.failure('BUDGET_CATEGORY_UNAVAILABLE','Choose each current category once.');end if;category_ids:=array_append(category_ids,entity);
   select coalesce(sum(bs.amount),0)into spent from lumo_private.budget_spending bs where bs.category_id=entity;
   if v<spent or v>c.amount or(entity=any(protected_ids)and v<c.amount)then return lumo_private.failure('INVALID_RECOVERY_REDUCTION','Keep protected categories unchanged and never reduce below money already spent.');end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(p_payload->'adjustments','[]'::jsonb))loop update lumo_private.budget_categories set amount=(item->>'amount')::bigint where id=(item->>'categoryId')::uuid;end loop;
  if p.owner_user_id is not null then update lumo_private.plans set revision=plans.revision+1,updated_at=clock_timestamp()where owner_user_id=actor;end if;
  select * into r from lumo_private.recovery_plans where owner_user_id=actor and status='active'for update;
  if r.id is null then insert into lumo_private.recovery_plans(owner_user_id,check_in_date,daily_limit,protected_category_ids,adjustments)values(actor,due,n,protected_ids,coalesce(p_payload->'adjustments','[]'::jsonb))returning * into r;
  else update lumo_private.recovery_plans set check_in_date=due,daily_limit=n,protected_category_ids=protected_ids,adjustments=coalesce(p_payload->'adjustments','[]'::jsonb)where id=r.id;end if;
  response:=jsonb_build_object('recovery',lumo_private.recovery_json(r.id),'plan',lumo_private.plan_json(actor));
 elsif p_command='recovery.finish' then
  entity:=lumo_private.planning_uuid(p_payload,'recoveryId');select * into r from lumo_private.recovery_plans where id=entity and owner_user_id=actor for update;
  if not found or r.status<>'active'then return lumo_private.failure('RECOVERY_UNAVAILABLE','This recovery plan is no longer active.');end if;
  update lumo_private.recovery_plans set status='completed',completed_at=clock_timestamp()where id=entity;response:=jsonb_build_object('recovery',lumo_private.recovery_json(entity));
 elsif p_command='money.overview' then
  select coalesce(sum(a.balance),0)into n from lumo_private.money_boxes bb join lumo_private.accounts a on a.id=bb.account_id where bb.owner_user_id=actor;
  select coalesce(sum(balance),0)into v from lumo_private.external_money_records where owner_user_id=actor and status='active';
  select balance into total from lumo_private.accounts where id=own_account;
  response:=jsonb_build_object('overview',jsonb_build_object('everyday',total,'savings',n,'external',v,'totalTracked',total+n+v,'expectedIous',coalesce((select sum(amount-paid)from lumo_private.ious where creditor_user_id=actor and status='active'),0),
   'accounts',coalesce((select jsonb_agg(lumo_private.external_record_json(x.id)order by x.updated_at desc)from lumo_private.external_money_records x where x.owner_user_id=actor and x.status='active'),'[]'::jsonb),'externalInformational',true));
 elsif p_command='money.record' then
  label:=lumo_private.planning_label(p_payload,'name',80);v_kind:=lumo_private.planning_label(p_payload,'kind',4);n:=lumo_private.planning_amount(p_payload,'balance',1000000000,true);note:=lumo_private.planning_label(p_payload,'note',160,false);
  if v_kind not in('cash','bank','momo')then raise exception 'INVALID_INPUT';end if;
  if p_payload?'recordId'then
   entity:=lumo_private.planning_uuid(p_payload,'recordId');select * into ext from lumo_private.external_money_records where id=entity and owner_user_id=actor for update;
   if not found or ext.status<>'active'then return lumo_private.failure('FORBIDDEN','Choose one of your own active money records.');end if;
   update lumo_private.external_money_records set name=label,kind=v_kind,balance=n,updated_at=clock_timestamp()where id=entity;
  else
   if(select count(*)from lumo_private.external_money_records where owner_user_id=actor and status='active')>=30 then return lumo_private.failure('RECORD_LIMIT','Archive an old external record before adding another.');end if;
   insert into lumo_private.external_money_records(owner_user_id,name,kind,balance)values(actor,label,v_kind,n)returning id into entity;
  end if;
  insert into lumo_private.external_money_history(record_id,balance,note)values(entity,n,note);response:=jsonb_build_object('record',lumo_private.external_record_json(entity));
 elsif p_command in('money.history','money.archive')then
  entity:=lumo_private.planning_uuid(p_payload,'recordId');select * into ext from lumo_private.external_money_records where id=entity and owner_user_id=actor for update;
  if not found then return lumo_private.failure('FORBIDDEN','This money record is private to its owner.');end if;
  if p_command='money.archive'then update lumo_private.external_money_records set status='archived',updated_at=clock_timestamp()where id=entity;response:=jsonb_build_object('record',lumo_private.external_record_json(entity));
  else response:=jsonb_build_object('history',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'balance',x.balance,'note',x.note,'recordedAt',x.recorded_at)order by x.recorded_at desc)from(select * from lumo_private.external_money_history where record_id=entity order by recorded_at desc limit 200)x),'[]'::jsonb));end if;
 else return null;
 end if;
 return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS')||response;
end $$;

-- Runs inside the same guarded transaction after a consumer payment, before its attempt is stored.
-- Raising here rolls back the parent posting as well; no budget state is updated independently.
create function lumo_private.planning_after_payment(actor uuid,journal uuid,p_payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare posted lumo_private.journals%rowtype;category lumo_private.budget_categories%rowtype;budget lumo_private.plans%rowtype;
 rule_record record;source_account uuid;category_id uuid;saving_journal uuid;spent bigint;save_amount bigint;available bigint;left_unplanned bigint;box_balance bigint;
 automatic jsonb:='[]'::jsonb;planning jsonb;
begin
 -- A refund restores the original category, including a partial refund and an older plan period.
 -- The original immutable allocation determines the recipient category; callers cannot redirect it.
 select j.* into posted from lumo_private.journals j where j.id=journal and j.actor_user_id=actor and j.type='refund';
 if found then
  select bs.category_id into category_id from lumo_private.budget_spending bs where bs.journal_id=posted.original_payment_id and bs.amount>0;
  if category_id is not null then insert into lumo_private.budget_spending(journal_id,category_id,amount)values(journal,category_id,-posted.amount);end if;
  return jsonb_build_object('budgetCategoryId',category_id,'savingsHacks','[]'::jsonb,'refundRestored',category_id is not null);
 end if;
 select j.* into posted from lumo_private.journals j join lumo_private.accounts a on a.id=j.payer_account_id
 where j.id=journal and j.actor_user_id=actor and a.owner_user_id=actor and a.kind='consumer'and j.type in('transfer','merchant_payment','iou_payment');
 if not found then return jsonb_build_object('savingsHacks','[]'::jsonb);end if;source_account:=posted.payer_account_id;
 if p_payload?'budgetCategoryId'and p_payload->'budgetCategoryId'<>'null'::jsonb then
  category_id:=lumo_private.planning_uuid(p_payload,'budgetCategoryId');
  select * into budget from lumo_private.plans where owner_user_id=actor;
  select * into category from lumo_private.budget_categories c where c.id=category_id and c.owner_user_id=actor and c.active for update;
  if not found or budget.owner_user_id is null or category.period_start<>budget.period_start or category.period_end<>budget.period_end or current_date<budget.period_start or current_date>budget.period_end then raise exception 'INVALID_BUDGET_SOURCE';end if;
  select coalesce(sum(bs.amount),0)into spent from lumo_private.budget_spending bs where bs.category_id=category_id;
  if spent+posted.amount>category.amount then raise exception 'BUDGET_EXCEEDED';end if;
  insert into lumo_private.budget_spending(journal_id,category_id,amount)values(journal,category_id,posted.amount);
 end if;
 if exists(select 1 from lumo_private.recovery_plans where owner_user_id=actor and status='active')then return jsonb_build_object('budgetCategoryId',category_id,'savingsHacks',automatic,'hacksPausedForRecovery',true);end if;
 for rule_record in
  select h.*,b.account_id,b.goal from lumo_private.savings_hacks h join lumo_private.money_boxes b on b.id=h.box_id where h.owner_user_id=actor and h.enabled and b.owner_user_id=actor and b.status='active'order by h.created_at,h.id for update of h,b
 loop
  save_amount:=case rule_record.rule when 'roundup'then(rule_record.value-(posted.amount%rule_record.value))%rule_record.value when 'percent'then floor(posted.amount::numeric*rule_record.value/100)::bigint else rule_record.value end;
  select balance into box_balance from lumo_private.accounts where id=rule_record.account_id;
  save_amount:=least(save_amount,greatest(rule_record.goal-box_balance,0));
  if save_amount<=0 then continue;end if;
  select balance into available from lumo_private.accounts where id=source_account;
  planning:=lumo_private.plan_json(actor);left_unplanned:=(planning->>'leftAfterPlan')::bigint;
  if available<save_amount or left_unplanned<save_amount or box_balance+save_amount>10000000 then
   automatic:=automatic||jsonb_build_array(jsonb_build_object('boxId',rule_record.box_id,'amount',0,'skipped',true,'reason','PROTECT_AVAILABLE_FUNDS'));continue;
  end if;
  saving_journal:=lumo_private.post_money(actor,'box_save',save_amount,source_account,rule_record.account_id);
  insert into lumo_private.planning_postings(journal_id,box_id,rule_id)values(saving_journal,rule_record.box_id,rule_record.id);
  automatic:=automatic||jsonb_build_array(jsonb_build_object('boxId',rule_record.box_id,'amount',save_amount,'receiptId',saving_journal));
 end loop;
 return jsonb_build_object('budgetCategoryId',category_id,'savingsHacks',automatic,'hacksPausedForRecovery',false);
end $$;

-- No table/function is a direct API: only the guarded public dispatcher is executable.
do $$declare proc record;begin
 for proc in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='lumo_private'and p.proname in
 ('planning_uuid','planning_amount','planning_date','planning_label','planning_code','planning_code_hash','box_json','box_invitation_json','box_release_json','iou_json','plan_json','planning_insights','recovery_json','external_record_json','planning_command','planning_after_payment')loop
 execute 'revoke all on function '||proc.signature||' from public,anon,authenticated,service_role';
 end loop;
end $$;


-- Component: 20261113051113_lumo_connected_experience.sql
-- Shared discovery, personal requests, saved recipients, learning and grounded chat history.
-- Every public call enters the common authenticated dispatcher; these helpers expose no direct table access.
create table lumo_private.shop_directory (
 shop_id uuid primary key references lumo_private.shops(id),
 code text not null unique default ('LM-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
 campus text not null default '' check(length(campus)<=100),
 category text not null default '' check(length(category)<=60),
 updated_at timestamptz not null default clock_timestamp(),
 check(code ~ '^LM-[A-F0-9]{12}$')
);
insert into lumo_private.shop_directory(shop_id) select id from lumo_private.shops;
create function lumo_private.new_shop_directory() returns trigger language plpgsql security invoker set search_path='' as $$
begin insert into lumo_private.shop_directory(shop_id) values(new.id);return new;end $$;
create trigger lumo_shop_directory after insert on lumo_private.shops for each row execute function lumo_private.new_shop_directory();
create table lumo_private.favourites (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 recipient_user_id uuid not null references auth.users(id),
 label text not null default '' check(length(label)<=60),
 created_at timestamptz not null default clock_timestamp(),
 unique(user_id,recipient_user_id),
 check(user_id<>recipient_user_id)
);
create index lumo_favourites_recipient on lumo_private.favourites(recipient_user_id);
create table lumo_private.person_requests (
 id uuid primary key default gen_random_uuid(),
 requester_user_id uuid not null references auth.users(id),
 payer_user_id uuid not null references auth.users(id),
 amount bigint not null check(amount between 1 and 1000000),
 note text not null default '' check(length(note)<=160),
 status text not null default 'open' check(status in('open','paid','cancelled')),
 journal_id uuid unique references lumo_private.journals(id),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default(clock_timestamp()+interval '24 hours'),
 check(requester_user_id<>payer_user_id),
 check(expires_at>created_at),
 check((status='paid')=(journal_id is not null))
);
create index lumo_person_requests_requester on lumo_private.person_requests(requester_user_id,created_at desc,id);
create index lumo_person_requests_payer on lumo_private.person_requests(payer_user_id,created_at desc,id);
create table lumo_private.person_request_postings (
 journal_id uuid primary key references lumo_private.journals(id),
 request_id uuid not null unique references lumo_private.person_requests(id)
);
create table lumo_private.learning_progress (
 user_id uuid not null references auth.users(id),
 module_id text not null check(module_id ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
 completed boolean not null,
 score integer not null check(score between 0 and 100),
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default clock_timestamp(),
 primary key(user_id,module_id)
);
create table lumo_private.chat_history (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 question text not null check(length(question) between 1 and 500),
 answer text not null check(length(answer) between 1 and 6000),
 created_at timestamptz not null default clock_timestamp()
);
create index lumo_chat_history_user on lumo_private.chat_history(user_id,created_at desc,id);
alter table lumo_private.shop_directory enable row level security;
alter table lumo_private.favourites enable row level security;
alter table lumo_private.person_requests enable row level security;
alter table lumo_private.person_request_postings enable row level security;
alter table lumo_private.learning_progress enable row level security;
alter table lumo_private.chat_history enable row level security;
revoke all on lumo_private.shop_directory,lumo_private.favourites,lumo_private.person_requests,lumo_private.person_request_postings,lumo_private.learning_progress,lumo_private.chat_history from public,anon,authenticated,service_role;

create function lumo_private.person_request_json(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',r.id,'requesterUserId',r.requester_user_id,'payerUserId',r.payer_user_id,
 'requesterHandle',rp.handle,'payerHandle',pp.handle,'requesterName',rp.display_name,'payerName',pp.display_name,
 'amount',r.amount,'note',r.note,'status',case when r.status='open' and r.expires_at<=clock_timestamp() then 'expired' else r.status end,
 'expiresAt',r.expires_at,'journalId',r.journal_id,'createdAt',r.created_at)
 from lumo_private.person_requests r join lumo_private.profiles rp on rp.user_id=r.requester_user_id join lumo_private.profiles pp on pp.user_id=r.payer_user_id where r.id=p_id;
$$;
create function lumo_private.discovery_json(p_shop uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('shopId',d.shop_id,'code',d.code,'published',coalesce(ss.published,false),'latitude',ss.latitude,'longitude',ss.longitude,'campus',d.campus,'category',d.category)
 from lumo_private.shop_directory d left join lumo_private.shop_settings ss on ss.shop_id=d.shop_id where d.shop_id=p_shop;
$$;
create function lumo_private.favourite_json(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',f.id,'handle',p.handle,'displayName',p.display_name,'label',f.label,'createdAt',f.created_at)
 from lumo_private.favourites f join lumo_private.profiles p on p.user_id=f.recipient_user_id where f.id=p_id;
$$;
create function lumo_private.experience_chat_record(p_user uuid,p_question text,p_answer text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_user is distinct from auth.uid() or length(trim(p_question)) not between 1 and 500 or length(trim(p_answer)) not between 1 and 6000 then return;end if;
 insert into lumo_private.chat_history(user_id,question,answer) values(p_user,trim(p_question),trim(p_answer));
 delete from lumo_private.chat_history where user_id=p_user and id not in(select id from lumo_private.chat_history where user_id=p_user order by created_at desc,id limit 100);
end $$;

create function lumo_private.experience_command(p_command text,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
#variable_conflict use_variable
declare
 actor uuid:=auth.uid();target lumo_private.profiles%rowtype;request lumo_private.person_requests%rowtype;
 shop_id uuid;id uuid;journal_id uuid;source_id uuid;destination_id uuid;amount bigint;
 query_text text;code_text text;label text;note text;module_id text;revision integer;score integer;
 latitude numeric;longitude numeric;expires timestamptz;has_coords boolean:=false;v_result jsonb;
begin
 if actor is null then return lumo_private.failure('AUTH_REQUIRED','Sign in before continuing.',false);end if;
 if p_command='merchant.discover' then
  if p_payload?'query' and (jsonb_typeof(p_payload->'query') is distinct from 'string' or length(p_payload->>'query')>80) or p_payload?'code' and (jsonb_typeof(p_payload->'code') is distinct from 'string' or length(p_payload->>'code')>32) then return lumo_private.failure('INVALID_INPUT','Use a shop name, campus or merchant code.');end if;
  query_text:=lower(trim(coalesce(p_payload->>'query','')));code_text:=upper(trim(coalesce(p_payload->>'code','')));
  if (p_payload?'latitude')<>(p_payload?'longitude') then return lumo_private.failure('INVALID_INPUT','Send both location coordinates or neither.');end if;
  if p_payload?'latitude' then
   if jsonb_typeof(p_payload->'latitude') is distinct from 'number' or jsonb_typeof(p_payload->'longitude') is distinct from 'number' then return lumo_private.failure('INVALID_INPUT','Use valid numeric coordinates.');end if;
   latitude:=(p_payload->>'latitude')::numeric;longitude:=(p_payload->>'longitude')::numeric;
   if latitude not between -90 and 90 or longitude not between -180 and 180 then return lumo_private.failure('INVALID_INPUT','Use valid location coordinates.');end if;has_coords:=true;
  end if;
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','shops',coalesce((select jsonb_agg(x.data order by x.distance nulls last,x.business_name,x.shop_name,x.shop_id) from(
   select s.id shop_id,m.name business_name,s.name shop_name,
    case when has_coords and ss.latitude is not null then 6371*acos(least(1::double precision,greatest(-1::double precision,sin(radians(latitude::double precision))*sin(radians(ss.latitude::double precision))+cos(radians(latitude::double precision))*cos(radians(ss.latitude::double precision))*cos(radians((ss.longitude-longitude)::double precision))))) else null end distance,
    jsonb_build_object('id',s.id,'shopId',s.id,'merchantId',m.id,'name',s.name,'businessName',m.name,'code',d.code,'location',coalesce(ss.location,''),'campus',d.campus,'category',d.category,'latitude',ss.latitude,'longitude',ss.longitude,
    'distanceKm',case when has_coords and ss.latitude is not null then round((6371*acos(least(1::double precision,greatest(-1::double precision,sin(radians(latitude::double precision))*sin(radians(ss.latitude::double precision))+cos(radians(latitude::double precision))*cos(radians(ss.latitude::double precision))*cos(radians((ss.longitude-longitude)::double precision))))))::numeric,2) else null end) data
   from lumo_private.shop_directory d join lumo_private.shops s on s.id=d.shop_id join lumo_private.merchants m on m.id=s.merchant_id join lumo_private.accounts a on a.id=m.account_id
   left join lumo_private.shop_settings ss on ss.shop_id=s.id
   where ss.published and s.accepting and m.status='active' and a.status='active' and (code_text='' or d.code=code_text) and (query_text='' or position(query_text in lower(m.name||' '||s.name||' '||d.campus||' '||d.category||' '||coalesce(ss.location,'')))>0)
   order by distance nulls last,m.name,s.name,s.id limit 50)x),'[]'::jsonb));
 elsif p_command in('shop.discovery','shop.discovery.get') then
  shop_id:=lumo_private.ext_uuid(p_payload,'shopId');
  if not exists(select 1 from lumo_private.shops s join lumo_private.merchants m on m.id=s.merchant_id where s.id=shop_id and m.owner_user_id=actor) then return lumo_private.failure('FORBIDDEN','Only the business owner can manage discovery.');end if;
  if p_command='shop.discovery' then
   if jsonb_typeof(p_payload->'published') is distinct from 'boolean' then return lumo_private.failure('INVALID_INPUT','Choose whether customers can discover this shop.');end if;
   if (p_payload?'latitude')<>(p_payload?'longitude') then return lumo_private.failure('INVALID_INPUT','Send both location coordinates or neither.');end if;
   if p_payload?'latitude' and (jsonb_typeof(p_payload->'latitude')<>'null' or jsonb_typeof(p_payload->'longitude')<>'null') then
    if jsonb_typeof(p_payload->'latitude') is distinct from 'number' or jsonb_typeof(p_payload->'longitude') is distinct from 'number' then return lumo_private.failure('INVALID_INPUT','Use valid coordinates or clear both.');end if;
    latitude:=(p_payload->>'latitude')::numeric;longitude:=(p_payload->>'longitude')::numeric;
    if latitude not between -90 and 90 or longitude not between -180 and 180 then return lumo_private.failure('INVALID_INPUT','Use valid location coordinates.');end if;
   end if;
   if p_payload?'campus' and (jsonb_typeof(p_payload->'campus') is distinct from 'string' or length(p_payload->>'campus')>100 or (p_payload->>'campus')~'[[:cntrl:]<>]') or p_payload?'category' and (jsonb_typeof(p_payload->'category') is distinct from 'string' or length(p_payload->>'category')>60 or (p_payload->>'category')~'[[:cntrl:]<>]') then return lumo_private.failure('INVALID_INPUT','Keep campus and category names short.');end if;
   insert into lumo_private.shop_settings(shop_id,published,latitude,longitude) values(shop_id,(p_payload->>'published')::boolean,latitude,longitude)
   on conflict on constraint shop_settings_pkey do update set published=excluded.published,latitude=case when p_payload?'latitude' then excluded.latitude else shop_settings.latitude end,longitude=case when p_payload?'longitude' then excluded.longitude else shop_settings.longitude end;
   update lumo_private.shop_directory d set campus=case when p_payload?'campus' then trim(p_payload->>'campus') else d.campus end,category=case when p_payload?'category' then trim(p_payload->>'category') else d.category end,updated_at=clock_timestamp() where d.shop_id=experience_command.shop_id;
  end if;
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','shopId',shop_id,'discovery',lumo_private.discovery_json(shop_id));
 elsif p_command='favourite.list' then
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','favourites',coalesce((select jsonb_agg(lumo_private.favourite_json(f.id) order by f.created_at desc,f.id) from lumo_private.favourites f where f.user_id=actor),'[]'::jsonb));
 elsif p_command='favourite.save' then
  if jsonb_typeof(p_payload->'handle') is distinct from 'string' or lower(trim(p_payload->>'handle')) !~ '^[a-z][a-z0-9_]{2,29}$' then return lumo_private.failure('INVALID_INPUT','Enter an exact Lumo handle.');end if;
  select * into target from lumo_private.profiles p where p.handle=lower(trim(p_payload->>'handle')) and p.status='active';
  if not found or target.user_id=actor then return lumo_private.failure('RECIPIENT_NOT_FOUND','Choose another active Lumo account.');end if;
  label:=trim(coalesce(p_payload->>'label',''));
  if p_payload?'label' and (jsonb_typeof(p_payload->'label') is distinct from 'string' or length(label)>60 or label~'[[:cntrl:]<>]') then return lumo_private.failure('INVALID_INPUT','Keep the saved name within 60 characters.');end if;
  if (select count(*) from lumo_private.favourites f where f.user_id=actor)>=50 and not exists(select 1 from lumo_private.favourites f where f.user_id=actor and f.recipient_user_id=target.user_id) then return lumo_private.failure('FAVOURITE_LIMIT','Remove a saved person before adding another.');end if;
  insert into lumo_private.favourites(user_id,recipient_user_id,label) values(actor,target.user_id,label) on conflict(user_id,recipient_user_id) do update set label=excluded.label returning favourites.id into id;
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','favourite',lumo_private.favourite_json(id));
 elsif p_command='favourite.delete' then
  id:=lumo_private.ext_uuid(p_payload,'favouriteId');delete from lumo_private.favourites f where f.id=id and f.user_id=actor;
  if not found then return lumo_private.failure('FORBIDDEN','This saved person does not belong to you.');end if;
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','favouriteId',id,'deleted',true);
 elsif p_command='person.request.list' then
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','paymentRequests',coalesce((select jsonb_agg(lumo_private.person_request_json(x.id) order by x.created_at desc,x.id) from(select r.id,r.created_at from lumo_private.person_requests r where actor in(r.requester_user_id,r.payer_user_id) order by r.created_at desc,r.id limit 100)x),'[]'::jsonb));
 elsif p_command='person.request.create' then
  amount:=lumo_private.ext_amount(p_payload);
  if jsonb_typeof(p_payload->'payerHandle') is distinct from 'string' or lower(trim(p_payload->>'payerHandle')) !~ '^[a-z][a-z0-9_]{2,29}$' then return lumo_private.failure('INVALID_INPUT','Enter the person’s exact Lumo handle.');end if;
  select * into target from lumo_private.profiles p where p.handle=lower(trim(p_payload->>'payerHandle')) and p.status='active';
  if not found or target.user_id=actor then return lumo_private.failure('RECIPIENT_NOT_FOUND','Choose another active Lumo account.');end if;
  note:=trim(coalesce(p_payload->>'note',''));
  if p_payload?'note' and (jsonb_typeof(p_payload->'note') is distinct from 'string' or length(note)>160 or note~'[[:cntrl:]<>]') then return lumo_private.failure('INVALID_INPUT','Keep the request note within 160 characters.');end if;
  expires:=clock_timestamp()+interval '24 hours';
  if p_payload?'expiresAt' then
   if jsonb_typeof(p_payload->'expiresAt') is distinct from 'string' then return lumo_private.failure('INVALID_INPUT','Use a valid future expiry date.');end if;
   begin expires:=(p_payload->>'expiresAt')::timestamptz;exception when invalid_datetime_format or datetime_field_overflow then return lumo_private.failure('INVALID_INPUT','Use a valid future expiry date.');end;
  end if;
  if expires<=clock_timestamp()+interval '1 minute' or expires>clock_timestamp()+interval '7 days' then return lumo_private.failure('INVALID_INPUT','Request expiry must be between one minute and seven days.');end if;
  if(select count(*) from lumo_private.person_requests r where r.requester_user_id=actor and r.status='open' and r.expires_at>clock_timestamp())>=20 then return lumo_private.failure('REQUEST_LIMIT','Finish or cancel an open request before adding another.');end if;
  insert into lumo_private.person_requests(requester_user_id,payer_user_id,amount,note,expires_at) values(actor,target.user_id,amount,note,expires) returning person_requests.id into id;
  perform lumo_private.notify_user(target.user_id,'person.request','Payment request','A Lumo contact has requested money. Review it before deciding.','person.request',id);
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','requestId',id,'paymentRequest',lumo_private.person_request_json(id));
 elsif p_command in('person.request.pay','person.request.cancel') then
  id:=lumo_private.ext_uuid(p_payload,'requestId');
  select * into request from lumo_private.person_requests r where r.id=id and actor in(r.requester_user_id,r.payer_user_id) for update;
  if not found then return lumo_private.failure('FORBIDDEN','This payment request is unavailable to this account.');end if;
  if request.status<>'open' or request.expires_at<=clock_timestamp() then return lumo_private.failure('REQUEST_UNAVAILABLE','This payment request is already complete, cancelled or expired.');end if;
  if p_command='person.request.cancel' then
   update lumo_private.person_requests set status='cancelled' where person_requests.id=id;
   perform lumo_private.notify_user(case when actor=request.requester_user_id then request.payer_user_id else request.requester_user_id end,'person.request.cancelled','Payment request cancelled','A shared payment request was cancelled.','person.request',id);
   return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','requestId',id,'paymentRequest',lumo_private.person_request_json(id));
  end if;
  if actor<>request.payer_user_id then return lumo_private.failure('FORBIDDEN','Only the person asked to pay can authorise this request.');end if;
  amount:=lumo_private.ext_amount(p_payload);
  if amount<>request.amount then return lumo_private.failure('AMOUNT_LOCKED','The requester’s amount is locked. Ask for a fresh request to change it.');end if;
  if not exists(select 1 from lumo_private.profiles p where p.user_id=request.requester_user_id and p.status='active') then return lumo_private.failure('RECIPIENT_NOT_FOUND','The receiving account is unavailable.');end if;
  select a.id into source_id from lumo_private.accounts a where a.owner_user_id=actor and a.kind='consumer';
  select a.id into destination_id from lumo_private.accounts a where a.owner_user_id=request.requester_user_id and a.kind='consumer';
  journal_id:=lumo_private.post_money(actor,'transfer',amount,source_id,destination_id);
  insert into lumo_private.person_request_postings(journal_id,request_id) values(journal_id,id);
  update lumo_private.person_requests set status='paid',journal_id=experience_command.journal_id where person_requests.id=id;
  perform lumo_private.planning_after_payment(actor,journal_id,p_payload);
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','requestId',id,'paymentRequest',lumo_private.person_request_json(id),'receipt',lumo_private.receipt_json(journal_id));
 elsif p_command='learning.get' then
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','progress',coalesce((select jsonb_agg(jsonb_build_object('moduleId',p.module_id,'completed',p.completed,'score',p.score,'revision',p.revision,'updatedAt',p.updated_at) order by p.updated_at desc,p.module_id) from lumo_private.learning_progress p where p.user_id=actor),'[]'::jsonb));
 elsif p_command='learning.save' then
  module_id:=p_payload->>'moduleId';
  if jsonb_typeof(p_payload->'moduleId') is distinct from 'string' or module_id !~ '^[a-z0-9][a-z0-9-]{0,59}$' or jsonb_typeof(p_payload->'completed') is distinct from 'boolean' or jsonb_typeof(p_payload->'score') is distinct from 'number' or jsonb_typeof(p_payload->'revision') is distinct from 'number' then return lumo_private.failure('INVALID_INPUT','Save a valid learning result.');end if;
  if (p_payload->>'score')::numeric<>trunc((p_payload->>'score')::numeric) or (p_payload->>'score')::numeric not between 0 and 100 or (p_payload->>'revision')::numeric<>trunc((p_payload->>'revision')::numeric) or (p_payload->>'revision')::numeric not between 0 and 2147483646 then return lumo_private.failure('INVALID_INPUT','Save a whole score and current learning revision.');end if;
  revision:=(p_payload->>'revision')::integer;score:=(p_payload->>'score')::integer;
  if revision=0 then
   insert into lumo_private.learning_progress(user_id,module_id,completed,score) values(actor,module_id,(p_payload->>'completed')::boolean,score) on conflict on constraint learning_progress_pkey do nothing;
   if not found then return lumo_private.failure('REVISION_CONFLICT','Learning changed on another device. Reload before saving.');end if;
  else
   update lumo_private.learning_progress p set completed=(p_payload->>'completed')::boolean,score=experience_command.score,revision=p.revision+1,updated_at=clock_timestamp() where p.user_id=actor and p.module_id=experience_command.module_id and p.revision=experience_command.revision;
   if not found then return lumo_private.failure('REVISION_CONFLICT','Learning changed on another device. Reload before saving.');end if;
  end if;
  select jsonb_build_object('moduleId',p.module_id,'completed',p.completed,'score',p.score,'revision',p.revision,'updatedAt',p.updated_at) into v_result from lumo_private.learning_progress p where p.user_id=actor and p.module_id=experience_command.module_id;
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','progress',v_result);
 elsif p_command='chat.history' then
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','messages',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'question',x.question,'answer',x.answer,'createdAt',x.created_at) order by x.created_at,x.id) from(select * from lumo_private.chat_history h where h.user_id=actor order by h.created_at desc,h.id limit 100)x),'[]'::jsonb));
 elsif p_command='chat.clear' then
  delete from lumo_private.chat_history h where h.user_id=actor;
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','cleared',true);
 end if;
 return null;
end $$;
revoke all on function lumo_private.new_shop_directory(),lumo_private.person_request_json(uuid),lumo_private.discovery_json(uuid),lumo_private.favourite_json(uuid),lumo_private.experience_chat_record(uuid,text,text),lumo_private.experience_command(text,jsonb) from public,anon,authenticated,service_role;


-- Component: 20261113051514_lumo_connected_schedules.sql
-- Explicit shared internal transfer mandates. Test funds only; no external payment rail.
create table lumo_private.transfer_schedules (
 id uuid primary key default gen_random_uuid(),owner_user_id uuid not null references lumo_private.profiles(user_id),
 recipient_user_id uuid not null references lumo_private.profiles(user_id),recipient_account_id uuid not null references lumo_private.accounts(id),
 amount bigint not null check(amount between 1 and 1000000),frequency text not null check(frequency in ('once','daily','weekly','monthly')),
 first_due timestamptz not null,next_due timestamptz,end_at timestamptz,max_occurrences integer not null check(max_occurrences between 1 and 366),
 completed_occurrences integer not null default 0 check(completed_occurrences between 0 and 366),anchor_day integer not null check(anchor_day between 1 and 31),
 status text not null default 'active' check(status in ('active','completed','cancelled','failed')),last_failure text,
 created_at timestamptz not null default clock_timestamp(),cancelled_at timestamptz,
 check(owner_user_id<>recipient_user_id),check(end_at is null or end_at>=first_due),check((status='active')=(next_due is not null)),
 check(frequency<>'once' or max_occurrences=1)
);
create index transfer_schedules_due on lumo_private.transfer_schedules(next_due,id) where status='active';
create index transfer_schedules_owner on lumo_private.transfer_schedules(owner_user_id,created_at desc);
create index transfer_schedules_recipient on lumo_private.transfer_schedules(recipient_user_id);
create table lumo_private.schedule_occurrences (
 id uuid primary key default gen_random_uuid(),schedule_id uuid not null references lumo_private.transfer_schedules(id),scheduled_due timestamptz not null,
 status text not null check(status in ('posted','failed')),journal_id uuid unique references lumo_private.journals(id),failure_code text,
 created_at timestamptz not null default clock_timestamp(),unique(schedule_id,scheduled_due),
 check((status='posted')=(journal_id is not null)),check((status='failed')=(failure_code is not null))
);
create index schedule_occurrences_history on lumo_private.schedule_occurrences(schedule_id,scheduled_due desc);
alter table lumo_private.transfer_schedules enable row level security;
alter table lumo_private.schedule_occurrences enable row level security;
revoke all on lumo_private.transfer_schedules,lumo_private.schedule_occurrences from public,anon,authenticated,service_role;
create trigger lumo_schedule_occurrence_immutable before update or delete on lumo_private.schedule_occurrences for each row execute function lumo_private.immutable_posting();

create function lumo_private.schedule_json(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',s.id,'recipientHandle',p.handle,'recipientName',p.display_name,'amount',s.amount,'frequency',s.frequency,
 'firstDue',s.first_due,'nextDue',s.next_due,'endAt',s.end_at,'maxOccurrences',s.max_occurrences,'completedOccurrences',s.completed_occurrences,
 'status',s.status,'lastFailure',s.last_failure,'createdAt',s.created_at,'cancelledAt',s.cancelled_at,
 'occurrences',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',x.id,'scheduledDue',x.scheduled_due,'status',x.status,'failureCode',x.failure_code,
 'reference',(select j.reference from lumo_private.journals j where j.id=x.journal_id),'receipt',case when x.journal_id is not null then lumo_private.receipt_json(x.journal_id)||jsonb_build_object('scheduleId',s.id) else null end,'createdAt',x.created_at)) order by x.scheduled_due desc) from(select * from lumo_private.schedule_occurrences o where o.schedule_id=s.id order by o.scheduled_due desc limit 100)x),'[]'::jsonb))
 from lumo_private.transfer_schedules s join lumo_private.profiles p on p.user_id=s.recipient_user_id where s.id=p_id;
$$;
create function lumo_private.schedule_next_due(p_due timestamptz,p_frequency text,p_anchor integer) returns timestamptz language plpgsql immutable security invoker set search_path='' as $$
declare v_local timestamp:=p_due at time zone 'UTC';v_first date;v_last date;v_day date;
begin
 if p_frequency='daily' then return (v_local+interval '1 day') at time zone 'UTC';
 elsif p_frequency='weekly' then return (v_local+interval '7 days') at time zone 'UTC';
 elsif p_frequency='monthly' then
  v_first:=(date_trunc('month',v_local)+interval '1 month')::date;v_last:=(v_first+interval '1 month'-interval '1 day')::date;
  v_day:=v_first+(least(p_anchor,extract(day from v_last)::integer)-1);
  return (v_day+v_local::time) at time zone 'UTC';
 end if;return null;
end $$;
create function lumo_private.schedule_command(p_command text,p_payload jsonb default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_actor uuid:=auth.uid();v_id uuid;v_recipient uuid;v_account uuid;v_handle text;v_frequency text;v_due timestamptz;v_end timestamptz;v_amount bigint;v_count integer;v_num numeric;v_schedule lumo_private.transfer_schedules%rowtype;
begin
 if p_command='schedule.list' then
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','schedules',coalesce((select jsonb_agg(lumo_private.schedule_json(x.id) order by x.created_at desc) from(select * from lumo_private.transfer_schedules s where s.owner_user_id=v_actor order by s.created_at desc limit 100)x),'[]'::jsonb));
 elsif p_command='schedule.create' then
  v_handle:=lower(trim(p_payload->>'recipientHandle'));v_frequency:=p_payload->>'frequency';v_amount:=lumo_private.ext_amount(p_payload);
  if jsonb_typeof(p_payload->'recipientHandle') is distinct from 'string' or v_handle is null or v_handle!~'^[a-z][a-z0-9_]{2,29}$' or v_frequency is null or v_frequency not in ('once','daily','weekly','monthly') then return lumo_private.failure('INVALID_INPUT','Choose an existing Lumo handle and supported frequency.');end if;
  if jsonb_typeof(p_payload->'firstDue') is distinct from 'string' or (p_payload->>'firstDue')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*(Z|[+]00:00)$' then return lumo_private.failure('INVALID_INPUT','Choose a future UTC date and time.');end if;
  v_due:=(p_payload->>'firstDue')::timestamptz;
  if v_due<=clock_timestamp() or v_due>clock_timestamp()+interval '366 days' then return lumo_private.failure('INVALID_INPUT','Schedule the first payment within the next year.');end if;
  if p_payload?'endAt' and p_payload->'endAt'<>'null'::jsonb then
   if jsonb_typeof(p_payload->'endAt') is distinct from 'string' or (p_payload->>'endAt')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*(Z|[+]00:00)$' then return lumo_private.failure('INVALID_INPUT','Choose a UTC end date and time.');end if;
   v_end:=(p_payload->>'endAt')::timestamptz;
   if v_end<v_due or v_end>v_due+interval '366 days' then return lumo_private.failure('INVALID_INPUT','The end date must follow the first payment and be within one year.');end if;
  end if;
  if p_payload?'maxOccurrences' then
   if jsonb_typeof(p_payload->'maxOccurrences') is distinct from 'number' then return lumo_private.failure('INVALID_INPUT','Choose a whole number of payments from one to 366.');end if;
   v_num:=(p_payload->>'maxOccurrences')::numeric;if v_num<>trunc(v_num) or v_num<1 or v_num>366 then return lumo_private.failure('INVALID_INPUT','Choose a whole number of payments from one to 366.');end if;v_count:=v_num::integer;
  elsif v_frequency='once' then v_count:=1;
  elsif v_end is not null then v_count:=366;
  else return lumo_private.failure('END_CONDITION_REQUIRED','Choose an end date or number of payments before authorising a recurring transfer.');end if;
  if v_frequency='once' and v_count<>1 then return lumo_private.failure('INVALID_INPUT','A one-off schedule has exactly one payment.');end if;
  select p.user_id,a.id into v_recipient,v_account from lumo_private.profiles p join lumo_private.accounts a on a.owner_user_id=p.user_id and a.kind='consumer' and a.status='active' where p.handle=v_handle and p.status='active';
  if v_recipient is null or v_recipient=v_actor then return lumo_private.failure('RECIPIENT_NOT_FOUND','Choose another active Lumo account.');end if;
  if (select count(*) from lumo_private.transfer_schedules s where s.owner_user_id=v_actor and s.status='active')>=30 then return lumo_private.failure('SCHEDULE_LIMIT','Cancel an existing schedule before adding another.');end if;
  insert into lumo_private.transfer_schedules(owner_user_id,recipient_user_id,recipient_account_id,amount,frequency,first_due,next_due,end_at,max_occurrences,anchor_day)
  values(v_actor,v_recipient,v_account,v_amount,v_frequency,v_due,v_due,v_end,v_count,extract(day from v_due at time zone 'UTC')::integer) returning id into v_id;
  perform lumo_private.notify_user(v_actor,'schedule.created','Transfer scheduled','Your authorised Lumo transfer mandate is saved. No funds move until its due time.','schedule',v_id);
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','schedule',lumo_private.schedule_json(v_id));
 elsif p_command='schedule.cancel' then
  v_id:=lumo_private.ext_uuid(p_payload,'scheduleId');select * into v_schedule from lumo_private.transfer_schedules s where s.id=v_id and s.owner_user_id=v_actor for update;
  if not found then return lumo_private.failure('FORBIDDEN','Only the payer can cancel this schedule.');end if;
  if v_schedule.status<>'active' then return lumo_private.failure('SCHEDULE_INACTIVE','This schedule has already stopped. Its history remains available.');end if;
  update lumo_private.transfer_schedules set status='cancelled',next_due=null,cancelled_at=clock_timestamp() where id=v_id;
  perform lumo_private.notify_user(v_actor,'schedule.cancelled','Transfer schedule cancelled','Future payments under this mandate have stopped. Posted receipts remain in Activity.','schedule',v_id);
  return jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','schedule',lumo_private.schedule_json(v_id));
 end if;return null;
end $$;

create function lumo_private.run_schedules(p_limit integer default 100) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_candidate record;v_schedule lumo_private.transfer_schedules%rowtype;v_source uuid;v_journal uuid;v_due timestamptz;v_next timestamptz;v_error text;v_posted integer:=0;v_failed integer:=0;v_hook jsonb;
begin
 if p_limit is null or p_limit not between 1 and 1000 then raise exception 'INVALID_INPUT';end if;
 for v_candidate in select s.id,s.owner_user_id from lumo_private.transfer_schedules s where s.status='active' and s.next_due<=clock_timestamp() order by s.next_due,s.id limit p_limit loop
  -- Match interactive actor-lock -> mandate-row -> sorted money-account ordering.
  -- Non-blocking actor acquisition avoids a worker holding one mandate while waiting on its owner.
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(v_candidate.owner_user_id::text,4271)) then continue;end if;
  select * into v_schedule from lumo_private.transfer_schedules s where s.id=v_candidate.id and s.status='active' and s.next_due<=clock_timestamp() for update skip locked;
  if not found then continue;end if;
  v_due:=v_schedule.next_due;v_journal:=null;v_error:=null;
  if exists(select 1 from lumo_private.schedule_occurrences o where o.schedule_id=v_schedule.id and o.scheduled_due=v_due) then
   raise exception 'SCHEDULE_ACCOUNTING';
  end if;
  begin
   if not exists(select 1 from lumo_private.profiles p join auth.users u on u.id=p.user_id where p.user_id=v_schedule.owner_user_id and p.status='active' and u.deleted_at is null and coalesce(u.is_anonymous,false)=false and (u.banned_until is null or u.banned_until<=clock_timestamp()) and u.raw_app_meta_data->'lumo_pilot'='true'::jsonb) then raise exception 'ACCOUNT_UNAVAILABLE';end if;
   if not exists(select 1 from lumo_private.profiles p join auth.users u on u.id=p.user_id where p.user_id=v_schedule.recipient_user_id and p.status='active' and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp())) then raise exception 'ACCOUNT_UNAVAILABLE';end if;
   select a.id into v_source from lumo_private.accounts a where a.owner_user_id=v_schedule.owner_user_id and a.kind='consumer' and a.status='active';
   if v_source is null then raise exception 'ACCOUNT_UNAVAILABLE';end if;
   v_journal:=lumo_private.post_money(v_schedule.owner_user_id,'transfer',v_schedule.amount,v_source,v_schedule.recipient_account_id);
   v_hook:=lumo_private.planning_after_payment(v_schedule.owner_user_id,v_journal,'{}'::jsonb);
   insert into lumo_private.schedule_occurrences(schedule_id,scheduled_due,status,journal_id) values(v_schedule.id,v_due,'posted',v_journal);
  exception when raise_exception then
   v_error:=sqlerrm;if v_error !~ '^[A-Z][A-Z0-9_]{2,70}$' then raise;end if;v_journal:=null;
  end;
  if v_error is not null then
   insert into lumo_private.schedule_occurrences(schedule_id,scheduled_due,status,failure_code) values(v_schedule.id,v_due,'failed',v_error);
   update lumo_private.transfer_schedules set status='failed',next_due=null,last_failure=v_error where id=v_schedule.id;
   perform lumo_private.notify_user(v_schedule.owner_user_id,'schedule.failed','Scheduled transfer stopped','The scheduled transfer could not complete ('||v_error||'). No money moved for this occurrence. Review your balance and create a new mandate if needed.','schedule',v_schedule.id);v_failed:=v_failed+1;
  else
   v_next:=lumo_private.schedule_next_due(v_due,v_schedule.frequency,v_schedule.anchor_day);
   if v_schedule.completed_occurrences+1>=v_schedule.max_occurrences or v_next is null or (v_schedule.end_at is not null and v_next>v_schedule.end_at) then
    update lumo_private.transfer_schedules set completed_occurrences=completed_occurrences+1,status='completed',next_due=null where id=v_schedule.id;
   else update lumo_private.transfer_schedules set completed_occurrences=completed_occurrences+1,next_due=v_next where id=v_schedule.id;end if;
   perform lumo_private.notify_user(v_schedule.owner_user_id,'schedule.posted','Scheduled transfer completed','The shared ledger confirms your scheduled Lumo transfer.','schedule',v_schedule.id);v_posted:=v_posted+1;
  end if;
 end loop;
 return jsonb_build_object('posted',v_posted,'failed',v_failed,'sandbox',true);
end $$;
revoke all on function lumo_private.schedule_json(uuid),lumo_private.schedule_next_due(timestamptz,text,integer),lumo_private.schedule_command(text,jsonb),lumo_private.run_schedules(integer) from public,anon,authenticated,service_role;
-- Executes as database owner, never with a client-supplied identity or stored payment PIN.
create extension if not exists pg_cron;
select cron.schedule('lumo-connected-test-money-schedules','* * * * *','select lumo_private.run_schedules(100);');


-- Component: 20261113052343_lumo_operations_scope_lock_fix.sql
-- Assigned staff can bind incoming receipts to their merchant account ID.
-- Aggregate balance stays owner-only; shops and activity remain explicitly scoped.
create or replace function lumo_private.operations_merchant_get() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('ok',true,'sandbox',true,'currency','GHS','merchants',coalesce((
 select jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'accountId',m.account_id,
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
revoke all on function lumo_private.operations_merchant_get() from public,anon,authenticated,service_role;


-- Component: 20261113050907_lumo_connected_dispatch.sql
-- Connected test-money product dispatcher. Private handlers remain inaccessible to clients.
alter table lumo_private.accounts drop constraint accounts_kind_check;
alter table lumo_private.accounts add constraint accounts_kind_check check(kind in ('consumer','merchant','test_funding','group','money_box'));
alter table lumo_private.journals drop constraint journals_type_check;
alter table lumo_private.journals add constraint journals_type_check check(type in ('test_funding','transfer','merchant_payment','refund','group_contribution','group_payout','group_refund','box_save','box_withdraw','iou_payment'));

create function lumo_private.ext_uuid(payload jsonb,key text) returns uuid language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(payload->key) is distinct from 'string' then raise exception using errcode='P0001',message='INVALID_INPUT';end if;
 return (payload->>key)::uuid;
exception when invalid_text_representation then raise exception using errcode='P0001',message='INVALID_INPUT';
end $$;
create function lumo_private.ext_amount(payload jsonb,key text default 'amount') returns bigint language plpgsql immutable set search_path='' as $$
declare amount numeric;
begin
 if jsonb_typeof(payload->key) is distinct from 'number' then raise exception using errcode='P0001',message='INVALID_AMOUNT';end if;
 amount:=(payload->>key)::numeric;
 if amount<>trunc(amount) or amount<1 or amount>1000000 then raise exception using errcode='P0001',message='INVALID_AMOUNT';end if;
 return amount::bigint;
end $$;

-- PIN updates never change a profile key. NO KEY UPDATE preserves throttling while
-- allowing the other payer's notification FK to acquire its KEY SHARE row lock.
create or replace function lumo_private.verify_pin(user_id uuid,pin text) returns boolean language plpgsql set search_path='' as $$
declare p lumo_private.profiles%rowtype;
begin
 select * into p from lumo_private.profiles where profiles.user_id=verify_pin.user_id for no key update;
 if not found or p.pin_locked_until>clock_timestamp() then return false;end if;
 if pin is null or pin !~ '^[0-9]{4,6}$' or extensions.crypt(pin,p.pin_hash)<>p.pin_hash then
  update lumo_private.profiles set pin_failures=case when p.pin_locked_until is not null and p.pin_locked_until<=clock_timestamp() then 1 else pin_failures+1 end,
  pin_locked_until=case when (case when p.pin_locked_until is not null and p.pin_locked_until<=clock_timestamp() then 1 else pin_failures+1 end)>=5 then clock_timestamp()+interval '1 minute' else null end where profiles.user_id=verify_pin.user_id;
  return false;
 end if;
 update lumo_private.profiles set pin_failures=0,pin_locked_until=null where profiles.user_id=verify_pin.user_id;
 return true;
end $$;

create or replace function lumo_private.receipt_json(journal_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',j.id,'reference',j.reference,'type',j.type,'amount',j.amount,'currency','GHS','sandbox',true,'status','posted',
 'actorUserId',j.actor_user_id,'payerAccountId',j.payer_account_id,'payeeAccountId',j.payee_account_id,'payerHandle',pp.handle,'payeeHandle',rp.handle,'recipientHandle',rp.handle,
 'shopId',j.shop_id,'requestId',j.request_id,'originalPaymentId',j.original_payment_id,'createdAt',j.created_at)
 ||jsonb_strip_nulls(jsonb_build_object('groupId',gp.group_id,'proposalId',gp.proposal_id,'boxId',pl.box_id,'iouId',pl.iou_id,'personalRequestId',pr.request_id,'scheduleId',sc.schedule_id))
 from lumo_private.journals j
 join lumo_private.accounts pa on pa.id=j.payer_account_id join lumo_private.accounts ra on ra.id=j.payee_account_id
 left join lumo_private.profiles pp on pp.user_id=pa.owner_user_id and pa.kind='consumer'
 left join lumo_private.profiles rp on rp.user_id=ra.owner_user_id and ra.kind='consumer'
 left join lumo_private.group_postings gp on gp.journal_id=j.id
 left join lumo_private.planning_postings pl on pl.journal_id=j.id
 left join lumo_private.person_request_postings pr on pr.journal_id=j.id
 left join lumo_private.schedule_occurrences sc on sc.journal_id=j.id
 where j.id=receipt_json.journal_id;
$$;

create function lumo_private.connected_command(p_command text,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); guard jsonb; response jsonb; prior lumo_private.attempts%rowtype;
 attempt text; body_hash text; mutating boolean; extended boolean; err text; hook jsonb;
begin
 if p_command='account.open' then return lumo_private.pilot_command(p_command,p_payload);end if;
 if actor is null or jsonb_typeof(p_payload) is distinct from 'object' then return lumo_private.failure('AUTH_REQUIRED','Sign in before continuing.',false);end if;
 if p_command is null or length(p_command)>60 or octet_length(p_payload::text)>30000 then return lumo_private.failure('INVALID_INPUT','Check the request details.',false);end if;
 guard:=lumo_private.pilot_command('account.get','{}'::jsonb);
 if guard->>'ok' is distinct from 'true' then return guard;end if;
 -- The existing actor advisory lock stays held until the transaction commits.
 extended:=p_command ~ '^(group[.]|plan[.]|box[.]|hack[.]|iou[.]|insight[.]|money[.]|recovery[.]|staff[.]|shift[.]|refund[.]|notification[.]|profile[.]|security[.]|support[.]|favourite[.]|learning[.]|person[.]|schedule[.]|chat[.])'
   or p_command in ('merchant.get','merchant.settings','merchant.search','merchant.discover','merchant.close','request.create','payment.refund','merchant.create','shop.create','shop.discovery','shop.discovery.get');
 mutating:=extended and not (p_command in ('group.list','group.get','plan.get','box.list','iou.list','insight.get','money.chat','money.overview','money.history','recovery.get','recovery.plan',
 'staff.list','staff.invitations','shift.list','refund.list','notification.list','profile.get','support.list','security.sessions','merchant.get','merchant.search','merchant.discover','shop.discovery.get','favourite.list','learning.get','person.request.list','schedule.list','money.chat.history','chat.history'));
 if mutating then
  attempt:=p_payload->>'attemptId';
  if jsonb_typeof(p_payload->'attemptId') is distinct from 'string' or attempt is null or attempt !~ '^[A-Za-z0-9_.:-]{10,100}$' then return lumo_private.failure('INVALID_ATTEMPT','Save the original request before continuing.',false);end if;
  body_hash:=encode(extensions.digest(p_command||':'||(p_payload-'pin'-'partnerCode'-'oldPin'-'newPin')::text,'sha256'),'hex');
  select * into prior from lumo_private.attempts where user_id=actor and attempt_id=attempt;
  if found then
   if prior.command<>p_command or prior.fingerprint<>body_hash then return lumo_private.failure('IDEMPOTENCY_MISMATCH','The saved reference belongs to different details.',false,attempt);end if;
   return prior.result||jsonb_build_object('replayed',true,'account',lumo_private.account_json(actor));
  end if;
  if p_command in ('group.contribute','group.payout.request','group.payout.approve','group.cancel','box.save','box.withdraw','iou.pay','box.partner.respond','box.release.decide','payment.refund','refund.decide','person.request.pay','schedule.create','schedule.cancel')
     and not lumo_private.verify_pin(actor,case when jsonb_typeof(p_payload->'pin')='string' then p_payload->>'pin' else null end) then
   return lumo_private.failure('PIN_REQUIRED','Check your payment PIN. After five incorrect attempts, wait one minute.',false,attempt);
  end if;
 end if;
 begin
  if extended then
   if p_command like 'group.%' then response:=lumo_private.groups_command(p_command,p_payload);end if;
   if response is null then response:=lumo_private.planning_command(p_command,p_payload);end if;
   if response is null then response:=lumo_private.operations_command(p_command,p_payload);end if;
   if response is null and to_regprocedure('lumo_private.experience_command(text,jsonb)') is not null then
    execute 'select lumo_private.experience_command($1,$2)' into response using p_command,p_payload;
   end if;
   if response is null and p_command like 'schedule.%' then response:=lumo_private.schedule_command(p_command,p_payload);end if;
   if response is null and p_command in ('merchant.create','shop.create') then response:=lumo_private.pilot_command(p_command,p_payload);end if;
   if response is null then response:=lumo_private.failure('UNKNOWN_COMMAND','Choose a supported action.',true,attempt);end if;
   if p_command='money.chat' and response->>'ok'='true' then
    perform lumo_private.experience_chat_record(actor,p_payload->>'question',response->>'answer');
   end if;
   if p_command in ('iou.pay','payment.refund','refund.decide') and response->>'ok'='true' and response ? 'receipt' then
    hook:=lumo_private.planning_after_payment(actor,(response#>>'{receipt,id}')::uuid,p_payload);
    response:=response||jsonb_build_object('planning',hook,'account',lumo_private.account_json(actor));
   end if;
  else
   response:=lumo_private.pilot_command(p_command,p_payload);
   if p_command in ('transfer','payment.pay') and response->>'ok'='true' and response->>'replayed' is distinct from 'true' then
    hook:=lumo_private.planning_after_payment(actor,(response#>>'{receipt,id}')::uuid,p_payload);
    response:=response||jsonb_build_object('planning',hook,'account',lumo_private.account_json(actor));
    update lumo_private.attempts set result=response where user_id=actor and attempt_id=p_payload->>'attemptId';
   end if;
  end if;
 exception
  when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format or datetime_field_overflow or not_null_violation or check_violation then
   response:=lumo_private.failure('INVALID_INPUT','Check the request details.',true,attempt);
  when raise_exception then
   err:=sqlerrm;
   if err ~ '^[A-Z][A-Z0-9_]{2,70}$' then response:=lumo_private.failure(err,case err when 'INSUFFICIENT_FUNDS' then 'There is not enough available money.' when 'WALLET_LIMIT' then 'The receiving account has reached its test limit.' when 'INVALID_BUDGET_SOURCE' then 'Choose a budget category in your current plan with enough remaining money.' else 'This action is unavailable. Refresh the shared details and try again.' end,true,coalesce(attempt,p_payload->>'attemptId'));else raise;end if;
 end;
 if response is null then response:=lumo_private.failure('UNKNOWN_RESULT','Keep the saved request and check its result.',false,attempt);end if;
 if extended then
  response:=response||jsonb_build_object('command',p_command,'account',lumo_private.account_json(actor));
  if mutating then
   response:=response||jsonb_build_object('attemptId',attempt,'replayed',false,'bindings',p_payload-'pin'-'partnerCode'-'oldPin'-'newPin');
   if response->>'ok'='true' or response->>'definitive'='true' then
    insert into lumo_private.attempts(user_id,attempt_id,command,fingerprint,result) values(actor,attempt,p_command,body_hash,response)
     on conflict(user_id,attempt_id) do update set result=excluded.result;
   end if;
  end if;
 elsif p_command in ('transfer','payment.pay') and response->>'ok'='false' and response->>'definitive'='true' and p_payload->>'attemptId' is not null then
  -- A source/hack validation failure rolled back the original posting and its attempt.
  insert into lumo_private.attempts(user_id,attempt_id,command,fingerprint,result)
   values(actor,p_payload->>'attemptId',p_command,encode(extensions.digest(p_command||':'||(p_payload-'pin')::text,'sha256'),'hex'),response)
   on conflict(user_id,attempt_id) do nothing;
 end if;
 return response;
end $$;
revoke all on function lumo_private.ext_uuid(jsonb,text),lumo_private.ext_amount(jsonb,text),lumo_private.connected_command(text,jsonb) from public,anon,authenticated,service_role;
revoke execute on function lumo_private.pilot_command(text,jsonb) from authenticated;
grant execute on function lumo_private.connected_command(text,jsonb) to authenticated;
create or replace function public.lumo_rpc(p_command text,p_payload jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$
 select lumo_private.connected_command(p_command,p_payload);
$$;
revoke all on function public.lumo_rpc(text,jsonb) from public,anon;
grant execute on function public.lumo_rpc(text,jsonb) to authenticated;
