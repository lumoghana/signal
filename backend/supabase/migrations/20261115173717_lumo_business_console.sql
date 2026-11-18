-- Additive operational reporting. No payment, recovery, identity or ledger routine is replaced.
create table lumo_private.business_pilot (
 id uuid primary key default gen_random_uuid(), singleton boolean not null default true unique check(singleton),
 start_at timestamptz, budget_pesewas bigint check(budget_pesewas between 0 and 1000000000000),
 environment text not null default 'sandbox' check(environment='sandbox'), timezone text not null default 'Africa/Accra' check(timezone='Africa/Accra'),
 support_hours jsonb, targets jsonb not null default '{"onboarding":80,"activation":60,"returning":40,"active_shops":8,"payment_completion":98,"merchant_confirmation":95,"money_integrity":0,"support":90,"clarity":75,"clarityMinimumResponses":30,"pilotShops":10}',
 revision bigint not null default 1, created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp()
);
insert into lumo_private.business_pilot(singleton) values(true);
create table lumo_private.business_participants (
 pilot_id uuid not null references lumo_private.business_pilot(id), user_id uuid not null references auth.users(id),
 classification text not null check(classification in('pilot','test','excluded')), campus text not null default '' check(length(campus)<=100), channel text not null default '' check(length(channel)<=100),
 revision bigint not null default 1, created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(), primary key(pilot_id,user_id)
);
create table lumo_private.business_shops (
 pilot_id uuid not null references lumo_private.business_pilot(id), shop_id uuid not null references lumo_private.shops(id),
 classification text not null check(classification in('pilot','test','excluded')), campus text not null default '' check(length(campus)<=100),
 revision bigint not null default 1, created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(), primary key(pilot_id,shop_id)
);
create table lumo_private.business_actions (
 id uuid primary key, pilot_id uuid not null references lumo_private.business_pilot(id), title text not null check(length(title) between 3 and 160),
 workstream text not null check(workstream in('growth','merchant','finance','support','risk','product','technical','partner')),
 owner_id uuid references lumo_private.admin_staff(user_id), due_at timestamptz,
 status text not null check(status in('open','in_progress','blocked','resolved','cancelled')),
 notes text not null default '' check(length(notes)<=2000), evidence text not null default '' check(length(evidence)<=2000), resolution text not null default '' check(length(resolution)<=2000),
 created_by uuid not null references auth.users(id), revision bigint not null default 1,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 check(status<>'resolved' or length(trim(resolution))>=3 and length(trim(evidence))>=3)
);
create table lumo_private.business_expenses (
 id uuid primary key, pilot_id uuid not null references lumo_private.business_pilot(id), description text not null check(length(description) between 3 and 160),
 category text not null check(category in('marketing','merchant','technology','support','operations','fees','other')),
 amount_pesewas bigint not null check(amount_pesewas between 0 and 1000000000000), incurred_at timestamptz not null,
 status text not null check(status in('paid','committed','voided')), evidence text not null check(length(trim(evidence)) between 3 and 2000),
 created_by uuid not null references auth.users(id), revision bigint not null default 1, created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp()
);
create table lumo_private.business_reviews (
 id uuid primary key, pilot_id uuid not null references lumo_private.business_pilot(id), kind text not null check(kind in('ledger_integrity','external_reconciliation','settlement','access','service','other')),
 result text not null check(result in('pass','attention','unavailable')), observed_at timestamptz not null,
 summary text not null check(length(trim(summary)) between 3 and 500), evidence text not null check(length(trim(evidence)) between 3 and 2000), action_id uuid references lumo_private.business_actions(id),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default clock_timestamp()
);
create table lumo_private.business_events (
 pilot_id uuid not null references lumo_private.business_pilot(id), actor_id uuid not null references auth.users(id), id uuid not null,
 type text not null check(type in('onboarding_started','onboarding_completed','merchant_receipt_displayed','feature_used')),
 platform text not null check(platform in('web','android','merchant')), occurred_at timestamptz not null,
 reference text check(length(reference)<=160), feature text check(feature in('essentials','money_box','money_chat','pause')),
 created_at timestamptz not null default clock_timestamp(), primary key(pilot_id,actor_id,id)
);
create table lumo_private.business_surveys (
 pilot_id uuid not null references lumo_private.business_pilot(id), actor_id uuid not null references auth.users(id), id uuid not null,
 rating integer not null check(rating between 1 and 5), comment text not null default '' check(length(comment)<=500), platform text not null check(platform in('web','android')),
 created_at timestamptz not null default clock_timestamp(), primary key(pilot_id,actor_id), unique(pilot_id,id)
);
create table lumo_private.business_support_replies (
 case_id uuid not null references lumo_private.admin_cases(id), case_revision bigint not null,
 replied_at timestamptz not null default clock_timestamp(), primary key(case_id,case_revision)
);
create index business_events_actor_time on lumo_private.business_events(actor_id,created_at desc);
create index business_events_pilot_type_time on lumo_private.business_events(pilot_id,type,created_at);
create index business_actions_pilot_status_due on lumo_private.business_actions(pilot_id,status,due_at);
create index business_expenses_pilot_date on lumo_private.business_expenses(pilot_id,incurred_at);
create index business_reviews_pilot_time on lumo_private.business_reviews(pilot_id,observed_at desc);
create index business_participants_class on lumo_private.business_participants(pilot_id,classification,user_id);
create index business_shops_class on lumo_private.business_shops(pilot_id,classification,shop_id);
do $$ declare t text; begin
 foreach t in array array['business_pilot','business_participants','business_shops','business_actions','business_expenses','business_reviews','business_events','business_surveys','business_support_replies'] loop
  execute format('alter table lumo_private.%I enable row level security',t);
  execute format('revoke all on lumo_private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;

-- This records explicit public staff replies only, never their content or automatic status messages.
create function lumo_private.business_record_support_reply() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.customer_message is distinct from old.customer_message and length(trim(coalesce(new.customer_message,'')))>=3 then
  insert into lumo_private.business_support_replies(case_id,case_revision) values(new.id,new.revision) on conflict do nothing;
 end if;
 return new;
end $$;
create trigger business_support_reply after update of customer_message on lumo_private.admin_cases for each row execute function lumo_private.business_record_support_reply();

create function lumo_private.business_staffed_seconds(p_start timestamptz,p_end timestamptz,p_hours jsonb) returns numeric language sql stable set search_path='' as $$
 select case when p_hours is null or p_end<p_start then null else coalesce(sum(greatest(0,extract(epoch from least(p_end,((d::date+(p_hours->>'end')::time) at time zone 'Africa/Accra'))-greatest(p_start,((d::date+(p_hours->>'start')::time) at time zone 'Africa/Accra'))))),0) end
 from generate_series(date_trunc('day',p_start at time zone 'Africa/Accra'),date_trunc('day',p_end at time zone 'Africa/Accra'),interval '1 day') d
 where p_hours->'days' @> jsonb_build_array(extract(isodow from d)::integer)
$$;

create function lumo_private.business_snapshot(p_pilot uuid,p_expenses boolean) returns jsonb language plpgsql stable set search_path='' as $$
declare p lumo_private.business_pilot%rowtype; at_time timestamptz:=statement_timestamp(); stop_at timestamptz; weeks integer; week_end timestamptz; facts jsonb; result jsonb; participants jsonb; shops jsonb;
begin
 select * into p from lumo_private.business_pilot where id=p_pilot;
 stop_at:=least(at_time,p.start_at+interval '30 days');weeks:=greatest(0,floor(extract(epoch from stop_at-p.start_at)/604800)::integer);week_end:=p.start_at+weeks*interval '7 days';
 with cohort as(select user_id from lumo_private.business_participants where pilot_id=p.id and classification='pilot'),
 pay as(select j.* from lumo_private.journals j join cohort c on c.user_id=j.actor_user_id where j.type='merchant_payment' and j.created_at>=p.start_at and j.created_at<stop_at),
 starts as(select e.actor_id,min(e.created_at) started_at from lumo_private.business_events e join cohort c on c.user_id=e.actor_id where e.pilot_id=p.id and e.type='onboarding_started' and e.created_at>=p.start_at and e.created_at<stop_at group by e.actor_id),
 onboard as(select s.*,exists(select 1 from lumo_private.business_events e where e.pilot_id=p.id and e.actor_id=s.actor_id and e.type='onboarding_completed' and e.created_at>=s.started_at and e.created_at<=s.started_at+interval '24 hours') completed from starts s where s.started_at<=stop_at-interval '24 hours'),
 activation as(select pr.user_id,pr.created_at,exists(select 1 from pay j where j.actor_user_id=pr.user_id and j.created_at>=pr.created_at and j.created_at<=pr.created_at+interval '7 days') activated from lumo_private.profiles pr join cohort c on c.user_id=pr.user_id where pr.created_at>=p.start_at and pr.created_at<=stop_at-interval '7 days'),
 previous as(select distinct actor_user_id from pay where created_at>=week_end-interval '14 days' and created_at<week_end-interval '7 days'),
 current_week as(select distinct actor_user_id from pay where created_at>=week_end-interval '7 days' and created_at<week_end),
 shop_activity as(select sh.shop_id,count(distinct j.actor_user_id) customers,count(distinct (j.created_at at time zone 'Africa/Accra')::date) days from lumo_private.business_shops sh left join pay j on j.shop_id=sh.shop_id and j.created_at>=week_end-interval '7 days' and j.created_at<week_end where sh.pilot_id=p.id and sh.classification='pilot' group by sh.shop_id),
 ledger as(select j.id,j.created_at,j.amount,count(e.id) entry_count,coalesce(sum(e.amount),0) total,coalesce(sum(e.amount) filter(where e.account_id=j.payer_account_id),0) debit,coalesce(sum(e.amount) filter(where e.account_id=j.payee_account_id),0) credit from pay j left join lumo_private.entries e on e.journal_id=j.id group by j.id,j.created_at,j.amount,j.payer_account_id,j.payee_account_id),
 broken as(select * from ledger where entry_count<>2 or total<>0 or debit<>-amount or credit<>amount),
 cases as(select c.*,(select min(r.replied_at) from lumo_private.business_support_replies r where r.case_id=c.id and r.replied_at<=stop_at) reply_at from lumo_private.admin_cases c where c.created_at>=greatest(p.start_at,p.created_at) and c.created_at<stop_at and(c.customer_id in(select user_id from cohort) or c.merchant_id in(select s.merchant_id from lumo_private.shops s join lumo_private.business_shops bs on bs.shop_id=s.id where bs.pilot_id=p.id and bs.classification='pilot'))),
 support as(select *,lumo_private.business_staffed_seconds(created_at,coalesce(reply_at,stop_at),p.support_hours) staffed_seconds from cases),
 survey as(select s.* from lumo_private.business_surveys s join cohort c on c.user_id=s.actor_id where s.pilot_id=p.id and s.created_at>=p.start_at and s.created_at<stop_at)
 select jsonb_build_object('windowEnd',stop_at,'onboarding',jsonb_build_object('started',(select count(*) from starts),'eligible',(select count(*) from onboard),'completed',(select count(*) from onboard where completed)),
 'activation',jsonb_build_object('eligible',(select count(*) from activation),'activated',(select count(*) from activation where activated)),
 'returning',jsonb_build_object('completeWeeks',weeks,'previous',(select count(*) from previous),'returning',(select count(*) from previous v join current_week c using(actor_user_id)),'previousStart',week_end-interval '14 days','currentStart',week_end-interval '7 days','end',week_end),
 'activeShops',jsonb_build_object('completeWeeks',weeks,'enrolled',(select count(*) from shop_activity),'active',(select count(*) from shop_activity where customers>=3 and days>=2),'start',week_end-interval '7 days','end',week_end),
 'payments',jsonb_build_object('count',(select count(*) from pay),'amountPesewas',(select coalesce(sum(amount),0) from pay)),
 'integrity',jsonb_build_object('exceptions',(select count(*) from broken),'absoluteImbalancePesewas',(select coalesce(sum(abs(total)),0) from broken),'affectedPaymentPesewas',(select coalesce(sum(amount),0) from broken),'oldestAt',(select min(created_at) from broken),'checkedAt',at_time,'externalReconciliation','unavailable'),
 'receiptObservations',(select count(*) from lumo_private.business_events e where e.pilot_id=p.id and e.type='merchant_receipt_displayed' and e.created_at>=p.start_at and e.created_at<stop_at and exists(select 1 from lumo_private.business_shops bs join lumo_private.journals j on j.shop_id=bs.shop_id left join lumo_private.approved_postings ap on ap.journal_id=j.id where bs.pilot_id=p.id and bs.classification='pilot' and e.reference in(j.id::text,j.reference,ap.transaction_id))),
 'support',jsonb_build_object('eligible',(select count(*) from support where reply_at is not null or staffed_seconds>=3600),'withinHour',(select count(*) from support where reply_at is not null and staffed_seconds<=3600),'openMoneyCases',(select count(*) from cases where status not in('resolved','closed') and category in('payment','refund','fraud','guest')),'oldestOpenMoneyCaseAt',(select min(created_at) from cases where status not in('resolved','closed') and category in('payment','refund','fraud','guest')),'unassigned',(select count(*) from cases where status not in('resolved','closed') and assignee_id is null),'overdue',(select count(*) from cases where status not in('resolved','closed') and due_at<at_time),'instrumentedFrom',p.created_at),
 'clarity',jsonb_build_object('responses',(select count(*) from survey),'positive',(select count(*) from survey where rating>=4)),
 'costs',case when p_expenses then(select jsonb_build_object('paidPesewas',coalesce(sum(amount_pesewas) filter(where status='paid'),0),'paidCount',count(*) filter(where status='paid'),'perActivatedPesewas',case when (select count(*) from activation where activated)>0 and count(*) filter(where status='paid')>0 then round(sum(amount_pesewas) filter(where status='paid')/(select count(*) from activation where activated)) else null end,'perReturningPesewas',case when weeks>=2 and (select count(*) from previous v join current_week c using(actor_user_id))>0 and count(*) filter(where status='paid')>0 then round(sum(amount_pesewas) filter(where status='paid')/(select count(*) from previous v join current_week c using(actor_user_id))) else null end,'committedPesewas',coalesce(sum(amount_pesewas) filter(where status='committed'),0),'voidedCount',count(*) filter(where status='voided')) from lumo_private.business_expenses where pilot_id=p.id and incurred_at>=p.start_at and incurred_at<stop_at) else null end) into facts;
 select coalesce(jsonb_agg(x.item order by x.name),'[]'::jsonb) into participants from(select pr.display_name name,jsonb_build_object('userId',b.user_id,'name',pr.display_name,'classification',b.classification,'campus',b.campus,'channel',b.channel,'registeredAt',pr.created_at,'revision',b.revision,'createdAt',b.created_at,'updatedAt',b.updated_at) item from lumo_private.business_participants b join lumo_private.profiles pr on pr.user_id=b.user_id where b.pilot_id=p.id order by pr.display_name,b.user_id limit 500)x;
 select coalesce(jsonb_agg(x.item order by x.name),'[]'::jsonb) into shops from(select s.name,jsonb_build_object('shopId',b.shop_id,'name',s.name,'merchantName',m.name,'classification',b.classification,'campus',b.campus,'revision',b.revision,'createdAt',b.created_at,'updatedAt',b.updated_at,'customersLastCompleteWeek',(select count(distinct j.actor_user_id) from lumo_private.journals j join lumo_private.business_participants bp on bp.user_id=j.actor_user_id and bp.pilot_id=p.id and bp.classification='pilot' where j.shop_id=s.id and j.type='merchant_payment' and j.created_at>=week_end-interval '7 days' and j.created_at<week_end),'tradingDaysLastCompleteWeek',(select count(distinct (j.created_at at time zone 'Africa/Accra')::date) from lumo_private.journals j join lumo_private.business_participants bp on bp.user_id=j.actor_user_id and bp.pilot_id=p.id and bp.classification='pilot' where j.shop_id=s.id and j.type='merchant_payment' and j.created_at>=week_end-interval '7 days' and j.created_at<week_end)) item from lumo_private.business_shops b join lumo_private.shops s on s.id=b.shop_id join lumo_private.merchants m on m.id=s.merchant_id where b.pilot_id=p.id order by s.name,b.shop_id limit 500)x;
 result:=jsonb_build_object('generatedAt',at_time,'settings',jsonb_build_object('id',p.id,'startAt',p.start_at,'budgetPesewas',case when p_expenses then p.budget_pesewas else null end,'environment',p.environment,'timezone',p.timezone,'supportHours',p.support_hours,'targets',p.targets,'revision',p.revision,'createdAt',p.created_at,'updatedAt',p.updated_at),'facts',facts,'participants',participants,'shops',shops,
 'actions',(select coalesce(jsonb_agg(x.item order by x.updated_at desc),'[]'::jsonb) from(select a.updated_at,jsonb_build_object('id',a.id,'title',a.title,'workstream',a.workstream,'ownerId',a.owner_id,'ownerName',s.display_name,'dueAt',a.due_at,'status',a.status,'notes',a.notes,'evidence',a.evidence,'resolution',a.resolution,'revision',a.revision,'createdAt',a.created_at,'updatedAt',a.updated_at) item from lumo_private.business_actions a left join lumo_private.admin_staff s on s.user_id=a.owner_id where a.pilot_id=p.id order by a.updated_at desc,a.id limit 500)x),
 'expenses',case when p_expenses then(select coalesce(jsonb_agg(x.item order by x.incurred_at desc),'[]'::jsonb) from(select e.incurred_at,jsonb_build_object('id',e.id,'description',e.description,'category',e.category,'amountPesewas',e.amount_pesewas,'incurredAt',e.incurred_at,'status',e.status,'evidence',e.evidence,'revision',e.revision,'createdAt',e.created_at,'updatedAt',e.updated_at,'createdByName',s.display_name) item from lumo_private.business_expenses e join lumo_private.admin_staff s on s.user_id=e.created_by where e.pilot_id=p.id order by e.incurred_at desc,e.id limit 500)x) else '[]'::jsonb end,
 'reviews',(select coalesce(jsonb_agg(x.item order by x.observed_at desc),'[]'::jsonb) from(select r.observed_at,jsonb_build_object('id',r.id,'kind',r.kind,'result',r.result,'observedAt',r.observed_at,'summary',r.summary,'evidence',r.evidence,'actionId',r.action_id,'createdAt',r.created_at,'createdByName',s.display_name) item from lumo_private.business_reviews r join lumo_private.admin_staff s on s.user_id=r.created_by where r.pilot_id=p.id order by r.observed_at desc,r.id limit 500)x),
 'staffDirectory',(select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'name',display_name,'role',role) order by display_name),'[]'::jsonb) from lumo_private.admin_staff where status='active'),
 'sources',jsonb_build_array(jsonb_build_object('id','ledger','label','Shared simulated ledger','observedAt',at_time,'status','queried','note','Read from committed PostgreSQL journals. No live bank or MoMo provider.'),jsonb_build_object('id','experience','label','Experience observations','observedAt',(select max(created_at) from lumo_private.business_events where pilot_id=p.id),'status','collecting','instrumentedFrom',p.created_at,'note','Authenticated events only; earlier client events cannot be reconstructed.'),jsonb_build_object('id','external','label','External reconciliation','observedAt',null,'status','unavailable','note','No external bank or MoMo statement feed is connected.')),
 'diagnostics',jsonb_build_object('participantCounts',(select jsonb_build_object('pilot',count(*) filter(where classification='pilot'),'test',count(*) filter(where classification='test'),'excluded',count(*) filter(where classification='excluded')) from lumo_private.business_participants where pilot_id=p.id),'unclassifiedPersonalAccounts',(select count(*) from lumo_private.profiles pr join lumo_private.approved_profiles ap on ap.user_id=pr.user_id where ap.personal_account and not exists(select 1 from lumo_private.business_participants b where b.user_id=pr.user_id and b.pilot_id=p.id)),'shopCounts',(select jsonb_build_object('pilot',count(*) filter(where classification='pilot'),'test',count(*) filter(where classification='test'),'excluded',count(*) filter(where classification='excluded')) from lumo_private.business_shops where pilot_id=p.id),'unclassifiedShops',(select count(*) from lumo_private.shops s where not exists(select 1 from lumo_private.business_shops b where b.shop_id=s.id and b.pilot_id=p.id)),'features',(select coalesce(jsonb_agg(t.item),'[]'::jsonb) from(select jsonb_build_object('feature',e.feature,'observations',count(*),'participants',count(distinct e.actor_id)) item from lumo_private.business_events e join lumo_private.business_participants b on b.pilot_id=e.pilot_id and b.user_id=e.actor_id and b.classification='pilot' where e.pilot_id=p.id and e.type='feature_used' and e.created_at>=p.start_at and e.created_at<stop_at group by e.feature)t),'feedback',(select coalesce(jsonb_agg(t.item order by t.created_at desc),'[]'::jsonb) from(select s.created_at,jsonb_build_object('rating',s.rating,'comment',s.comment,'createdAt',s.created_at) item from lumo_private.business_surveys s join lumo_private.business_participants b on b.pilot_id=s.pilot_id and b.user_id=s.actor_id and b.classification='pilot' where s.pilot_id=p.id and s.created_at>=p.start_at and s.created_at<stop_at order by s.created_at desc limit 100)t),'paymentActivity',facts->'payments','support',facts->'support','costs',facts->'costs'),
 'truncated',jsonb_build_object('participants',(select count(*)>500 from lumo_private.business_participants where pilot_id=p.id),'shops',(select count(*)>500 from lumo_private.business_shops where pilot_id=p.id),'actions',(select count(*)>500 from lumo_private.business_actions where pilot_id=p.id),'expenses',(select count(*)>500 from lumo_private.business_expenses where pilot_id=p.id),'reviews',(select count(*)>500 from lumo_private.business_reviews where pilot_id=p.id)));
 return result;
end $$;

create function public.lumo_business(p_command text,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; sid uuid; staff lumo_private.admin_staff%rowtype; pilot lumo_private.business_pilot%rowtype; prior jsonb; saved jsonb; item jsonb; ident uuid; target uuid; rev bigint; reason text; start_value timestamptz; budget bigint; hrs jsonb; result jsonb; context jsonb; is_personal boolean; is_merchant boolean; active boolean; eligible boolean; expenses_read boolean; n integer; old_event lumo_private.business_events%rowtype; old_survey lumo_private.business_surveys%rowtype;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>16384 then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 actor:=(p_payload->>'actor')::uuid;sid:=(p_payload->>'session')::uuid;
 if actor is null or sid is null or not exists(select 1 from auth.sessions se join auth.users u on u.id=se.user_id where se.id=sid and se.user_id=actor and (se.not_after is null or se.not_after>clock_timestamp()) and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()) and not coalesce(u.is_anonymous,false)) then return jsonb_build_object('ok',false,'code','SESSION_REVOKED');end if;
 select * into pilot from lumo_private.business_pilot where singleton;
 if p_command like 'business.%' then
  result:=public.lumo_admin_service('session',p_payload);
  if result->>'ok' is distinct from 'true' then return result;end if;
  if coalesce((result#>>'{data,requiresMfa}')::boolean,false) then return jsonb_build_object('ok',false,'code','MFA_REQUIRED');end if;
  select * into staff from lumo_private.admin_staff where user_id=actor and status='active';
  if not found then return jsonb_build_object('ok',false,'code','STAFF_REQUIRED');end if;
  expenses_read:=staff.role in('super_admin','supervisor','finance','auditor');
  if p_command='business.overview' then
   result:=lumo_private.business_snapshot(pilot.id,expenses_read)||jsonb_build_object('capabilities',jsonb_build_object('settingsWrite',staff.role in('super_admin','supervisor'),'actionsWrite',staff.role<>'auditor','expensesRead',expenses_read,'expensesWrite',staff.role in('super_admin','supervisor','finance'),'reviewsWrite',staff.role in('super_admin','supervisor','finance','risk','technical'),'cohortWrite',staff.role in('super_admin','supervisor','merchant_ops')));
   perform lumo_private.admin_log(actor,staff.role,p_command,'business_pilot',pilot.id::text,null,null,null,null);
   return jsonb_build_object('ok',true,'data',result);
  end if;
  if staff.role='auditor' then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
  reason:=trim(p_payload->>'reason');if reason is null or length(reason) not between 3 and 1000 then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  if p_command='business.settings.update' then
   if staff.role not in('super_admin','supervisor') then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
   select * into pilot from lumo_private.business_pilot where singleton for update;
   if (p_payload->>'revision')::bigint is distinct from pilot.revision then return jsonb_build_object('ok',false,'code','REVISION_CONFLICT');end if;
   start_value:=case when p_payload?'startAt' then(p_payload->>'startAt')::timestamptz else pilot.start_at end;
   budget:=case when p_payload?'budgetPesewas' then(p_payload->>'budgetPesewas')::bigint else pilot.budget_pesewas end;
   hrs:=case when p_payload?'supportHours' then nullif(p_payload->'supportHours','null'::jsonb) else pilot.support_hours end;
   if hrs is not null then
    if jsonb_typeof(hrs) is distinct from 'object' or jsonb_typeof(hrs->'days') is distinct from 'array' or jsonb_typeof(hrs->'start') is distinct from 'string' or jsonb_typeof(hrs->'end') is distinct from 'string' then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
    if (select count(*) from jsonb_object_keys(hrs))<>3 or jsonb_array_length(hrs->'days') not between 1 and 7 or (hrs->>'start')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or (hrs->>'end')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or (hrs->>'start')>=(hrs->>'end') or exists(select 1 from jsonb_array_elements(hrs->'days') d where d::text!~'^[1-7]$') or (select count(distinct d) from jsonb_array_elements(hrs->'days')d)<>jsonb_array_length(hrs->'days') then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
   end if;
   prior:=to_jsonb(pilot);update lumo_private.business_pilot set start_at=start_value,budget_pesewas=budget,support_hours=hrs,revision=revision+1,updated_at=clock_timestamp() where id=pilot.id returning to_jsonb(business_pilot.*) into saved;
  elsif p_command in('business.participants.save','business.shops.save') then
   if staff.role not in('super_admin','supervisor','merchant_ops') then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
   if p_payload->>'classification' not in('pilot','test','excluded') or length(coalesce(p_payload->>'campus',''))>100 or length(coalesce(p_payload->>'channel',''))>100 then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
   if p_command='business.participants.save' then
    target:=(p_payload->>'userId')::uuid;
    if not exists(select 1 from lumo_private.approved_profiles ap join lumo_private.profiles pr on pr.user_id=ap.user_id where ap.user_id=target and ap.personal_account and pr.status='active') then return jsonb_build_object('ok',false,'code','NOT_FOUND');end if;
    perform pg_advisory_xact_lock(hashtextextended('business-participant-'||target::text,0));
    select to_jsonb(b.*) into prior from lumo_private.business_participants b where pilot_id=pilot.id and user_id=target for update;
    if prior is not null and (p_payload->>'revision')::bigint is distinct from(prior->>'revision')::bigint then return jsonb_build_object('ok',false,'code','REVISION_CONFLICT');end if;
    insert into lumo_private.business_participants(pilot_id,user_id,classification,campus,channel) values(pilot.id,target,p_payload->>'classification',coalesce(p_payload->>'campus',''),coalesce(p_payload->>'channel','')) on conflict(pilot_id,user_id) do update set classification=excluded.classification,campus=excluded.campus,channel=excluded.channel,revision=business_participants.revision+1,updated_at=clock_timestamp() returning to_jsonb(business_participants.*) into saved;
   else
    target:=(p_payload->>'shopId')::uuid;if not exists(select 1 from lumo_private.shops where id=target) then return jsonb_build_object('ok',false,'code','NOT_FOUND');end if;
    perform pg_advisory_xact_lock(hashtextextended('business-shop-'||target::text,0));
    select to_jsonb(b.*) into prior from lumo_private.business_shops b where pilot_id=pilot.id and shop_id=target for update;
    if prior is not null and (p_payload->>'revision')::bigint is distinct from(prior->>'revision')::bigint then return jsonb_build_object('ok',false,'code','REVISION_CONFLICT');end if;
    insert into lumo_private.business_shops(pilot_id,shop_id,classification,campus) values(pilot.id,target,p_payload->>'classification',coalesce(p_payload->>'campus','')) on conflict(pilot_id,shop_id) do update set classification=excluded.classification,campus=excluded.campus,revision=business_shops.revision+1,updated_at=clock_timestamp() returning to_jsonb(business_shops.*) into saved;
   end if;ident:=target;
  elsif p_command in('business.actions.save','business.expenses.save','business.reviews.save') then
   ident:=(p_payload->>'id')::uuid;if ident is null then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
   perform pg_advisory_xact_lock(hashtextextended('business-record-'||ident::text,0));
   if p_command='business.actions.save' then
    target:=nullif(p_payload->>'ownerId','')::uuid;
    if target is not null and not exists(select 1 from lumo_private.admin_staff where user_id=target and status='active') then return jsonb_build_object('ok',false,'code','NOT_FOUND');end if;
    select to_jsonb(a.*) into prior from lumo_private.business_actions a where id=ident and pilot_id=pilot.id for update;
    if prior is not null and not(p_payload?'revision') then
     if prior->>'title'=trim(p_payload->>'title') and prior->>'workstream'=p_payload->>'workstream' and (prior->>'owner_id')::uuid is not distinct from target and (prior->>'due_at')::timestamptz is not distinct from(p_payload->>'dueAt')::timestamptz and prior->>'status'=p_payload->>'status' and prior->>'notes'=coalesce(p_payload->>'notes','') and prior->>'evidence'=coalesce(p_payload->>'evidence','') and prior->>'resolution'=coalesce(p_payload->>'resolution','') and prior->>'created_by'=actor::text then return jsonb_build_object('ok',true,'data',jsonb_build_object('record',prior,'duplicate',true));end if;
     return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');
    end if;
    if prior is not null and (p_payload->>'revision')::bigint is distinct from(prior->>'revision')::bigint or prior is null and p_payload?'revision' then return jsonb_build_object('ok',false,'code','REVISION_CONFLICT');end if;
    insert into lumo_private.business_actions(id,pilot_id,title,workstream,owner_id,due_at,status,notes,evidence,resolution,created_by) values(ident,pilot.id,trim(p_payload->>'title'),p_payload->>'workstream',target,(p_payload->>'dueAt')::timestamptz,p_payload->>'status',coalesce(p_payload->>'notes',''),coalesce(p_payload->>'evidence',''),coalesce(p_payload->>'resolution',''),actor) on conflict(id) do update set title=excluded.title,workstream=excluded.workstream,owner_id=excluded.owner_id,due_at=excluded.due_at,status=excluded.status,notes=excluded.notes,evidence=excluded.evidence,resolution=excluded.resolution,revision=business_actions.revision+1,updated_at=clock_timestamp() returning to_jsonb(business_actions.*) into saved;
   elsif p_command='business.expenses.save' then
    if staff.role not in('super_admin','supervisor','finance') then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
    select to_jsonb(e.*) into prior from lumo_private.business_expenses e where id=ident and pilot_id=pilot.id for update;
    if prior is not null and not(p_payload?'revision') then
     if prior->>'description'=trim(p_payload->>'description') and prior->>'category'=p_payload->>'category' and (prior->>'amount_pesewas')::bigint=(p_payload->>'amountPesewas')::bigint and (prior->>'incurred_at')::timestamptz=(p_payload->>'incurredAt')::timestamptz and prior->>'status'=p_payload->>'status' and prior->>'evidence'=p_payload->>'evidence' and prior->>'created_by'=actor::text then return jsonb_build_object('ok',true,'data',jsonb_build_object('record',prior,'duplicate',true));end if;
     return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');
    end if;
    if prior is not null and (p_payload->>'revision')::bigint is distinct from(prior->>'revision')::bigint or prior is null and p_payload?'revision' then return jsonb_build_object('ok',false,'code','REVISION_CONFLICT');end if;
    insert into lumo_private.business_expenses(id,pilot_id,description,category,amount_pesewas,incurred_at,status,evidence,created_by) values(ident,pilot.id,trim(p_payload->>'description'),p_payload->>'category',(p_payload->>'amountPesewas')::bigint,(p_payload->>'incurredAt')::timestamptz,p_payload->>'status',p_payload->>'evidence',actor) on conflict(id) do update set description=excluded.description,category=excluded.category,amount_pesewas=excluded.amount_pesewas,incurred_at=excluded.incurred_at,status=excluded.status,evidence=excluded.evidence,revision=business_expenses.revision+1,updated_at=clock_timestamp() returning to_jsonb(business_expenses.*) into saved;
   else
    if staff.role not in('super_admin','supervisor','finance','risk','technical') then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
    if (p_payload->>'observedAt')::timestamptz>clock_timestamp()+interval '5 minutes' then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
    select to_jsonb(r.*) into prior from lumo_private.business_reviews r where id=ident;
    if prior is not null then
     if prior->>'kind'=p_payload->>'kind' and prior->>'result'=p_payload->>'result' and (prior->>'observed_at')::timestamptz=(p_payload->>'observedAt')::timestamptz and prior->>'summary'=trim(p_payload->>'summary') and prior->>'evidence'=p_payload->>'evidence' and (prior->>'action_id')::uuid is not distinct from nullif(p_payload->>'actionId','')::uuid and prior->>'created_by'=actor::text then return jsonb_build_object('ok',true,'data',jsonb_build_object('record',prior,'duplicate',true));end if;
     return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');
    end if;
    insert into lumo_private.business_reviews(id,pilot_id,kind,result,observed_at,summary,evidence,action_id,created_by) values(ident,pilot.id,p_payload->>'kind',p_payload->>'result',(p_payload->>'observedAt')::timestamptz,trim(p_payload->>'summary'),p_payload->>'evidence',nullif(p_payload->>'actionId','')::uuid,actor) returning to_jsonb(business_reviews.*) into saved;
   end if;
  else return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  perform lumo_private.admin_log(actor,staff.role,p_command,'business_pilot',coalesce(ident,pilot.id)::text,reason,null,prior,saved);
  return jsonb_build_object('ok',true,'data',jsonb_build_object('record',saved));
 end if;
 select exists(select 1 from lumo_private.profiles pr join lumo_private.approved_profiles ap on ap.user_id=pr.user_id where pr.user_id=actor and pr.status='active' and ap.personal_account) into is_personal;
 select exists(select 1 from lumo_private.merchants where owner_user_id=actor and status='active') or exists(select 1 from lumo_private.staff_memberships where user_id=actor and status='active') into is_merchant;
 if not is_personal and not is_merchant then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 active:=pilot.start_at is not null and clock_timestamp()>=pilot.start_at and clock_timestamp()<pilot.start_at+interval '30 days';
 eligible:=active and is_personal and exists(select 1 from lumo_private.business_participants where pilot_id=pilot.id and user_id=actor and classification='pilot') and exists(select 1 from lumo_private.journals where actor_user_id=actor and type='merchant_payment' and created_at>=pilot.start_at and created_at<pilot.start_at+interval '30 days');
 if p_command='context' then return jsonb_build_object('ok',true,'data',jsonb_build_object('pilotId',pilot.id,'configured',pilot.start_at is not null,'telemetryEnabled',active,'surveyEligible',eligible and not exists(select 1 from lumo_private.business_surveys where pilot_id=pilot.id and actor_id=actor),'surveyAnswered',exists(select 1 from lumo_private.business_surveys where pilot_id=pilot.id and actor_id=actor),'environment','sandbox'));end if;
 if not active then return jsonb_build_object('ok',false,'code','PILOT_INACTIVE');end if;
 ident:=(p_payload->>'id')::uuid;if ident is null then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 perform pg_advisory_xact_lock(hashtextextended('business-events-'||actor::text,0));
 if p_command='experience' then
  select * into old_event from lumo_private.business_events where pilot_id=pilot.id and actor_id=actor and id=ident;
  if found then
   if old_event.type is distinct from p_payload->>'type' or old_event.platform is distinct from p_payload->>'platform' or old_event.occurred_at is distinct from(p_payload->>'occurredAt')::timestamptz or old_event.reference is distinct from p_payload->>'reference' or old_event.feature is distinct from p_payload->>'feature' then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');end if;
   return jsonb_build_object('ok',true,'data',jsonb_build_object('recorded',true,'duplicate',true));
  end if;
  if (select count(*) from lumo_private.business_events where actor_id=actor and created_at>clock_timestamp()-interval '1 hour')>=120 then return jsonb_build_object('ok',false,'code','RATE_LIMITED');end if;
  if abs(extract(epoch from clock_timestamp()-(p_payload->>'occurredAt')::timestamptz))>86400 then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  if p_payload->>'type'='merchant_receipt_displayed' then
   if not is_merchant or p_payload->>'platform'<>'merchant' or not exists(select 1 from lumo_private.journals j join lumo_private.merchants m on m.account_id=j.payee_account_id left join lumo_private.approved_postings ap on ap.journal_id=j.id where j.type='merchant_payment' and p_payload->>'reference' in(j.id::text,j.reference,ap.transaction_id) and (m.owner_user_id=actor or exists(select 1 from lumo_private.staff_memberships sm where sm.shop_id=j.shop_id and sm.user_id=actor and sm.status='active'))) then return jsonb_build_object('ok',false,'code','NOT_FOUND');end if;
   -- Re-rendering the same paid receipt cannot inflate observation coverage.
   if exists(select 1 from lumo_private.business_events where pilot_id=pilot.id and actor_id=actor and type='merchant_receipt_displayed' and reference=p_payload->>'reference') then return jsonb_build_object('ok',true,'data',jsonb_build_object('recorded',true,'duplicate',true));end if;
  elsif not is_personal then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
  if p_payload->>'type'='feature_used' and p_payload->>'feature' is null then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  insert into lumo_private.business_events(pilot_id,actor_id,id,type,platform,occurred_at,reference,feature) values(pilot.id,actor,ident,p_payload->>'type',p_payload->>'platform',(p_payload->>'occurredAt')::timestamptz,p_payload->>'reference',p_payload->>'feature');
 elsif p_command='survey' then
  if not eligible then return jsonb_build_object('ok',false,'code','SURVEY_INELIGIBLE');end if;
  select * into old_survey from lumo_private.business_surveys where pilot_id=pilot.id and actor_id=actor;
  if found then
   if old_survey.id=ident and old_survey.rating=(p_payload->>'rating')::integer and old_survey.comment=coalesce(p_payload->>'comment','') and old_survey.platform=p_payload->>'platform' then return jsonb_build_object('ok',true,'data',jsonb_build_object('recorded',true,'duplicate',true));end if;
   return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');
  end if;
  insert into lumo_private.business_surveys(pilot_id,actor_id,id,rating,comment,platform) values(pilot.id,actor,ident,(p_payload->>'rating')::integer,coalesce(p_payload->>'comment',''),p_payload->>'platform');
 else return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 return jsonb_build_object('ok',true,'data',jsonb_build_object('recorded',true,'duplicate',false));
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range or check_violation or not_null_violation or foreign_key_violation then return jsonb_build_object('ok',false,'code','INVALID_INPUT');
end $$;
revoke all on function lumo_private.business_record_support_reply(),lumo_private.business_staffed_seconds(timestamptz,timestamptz,jsonb),lumo_private.business_snapshot(uuid,boolean),public.lumo_business(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.lumo_business(text,jsonb) to service_role;

