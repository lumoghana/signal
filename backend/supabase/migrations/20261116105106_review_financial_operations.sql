-- Accountable sandbox operating loops. This migration does not add a money writer.
-- Refund completion observes an immutable original merchant refund journal.
-- Guest decisions reuse guest_apply_result with its original stored posting guards.
create table lumo_private.admin_refund_controls (
 approval_id uuid primary key references lumo_private.admin_approvals(id),
 original_payment_id uuid not null references lumo_private.journals(id),
 amount bigint not null check(amount>0),request_key uuid not null,
 requested_by uuid not null references lumo_private.admin_staff(user_id),
 confirmed_journal_id uuid unique references lumo_private.journals(id),
 completed_by uuid references lumo_private.admin_staff(user_id),completed_at timestamptz,
 completion_evidence text check(length(completion_evidence) between 3 and 2000),
 created_at timestamptz not null default clock_timestamp(),
 unique(requested_by,request_key),check((confirmed_journal_id is null)=(completed_at is null))
);
create index admin_refund_controls_payment on lumo_private.admin_refund_controls(original_payment_id);
create table lumo_private.admin_reconciliation_exceptions (
 id uuid primary key default gen_random_uuid(),request_key uuid not null,
 kind text not null check(kind in('ledger','provider_statement','guest_outcome','other')),
 reference text not null check(length(reference) between 1 and 160),
 summary text not null check(length(summary) between 3 and 600),
 case_id uuid not null references lumo_private.admin_cases(id),
 transaction_id uuid references lumo_private.journals(id),guest_id text references lumo_private.guest_momo_attempts(id),
 owner_id uuid not null references lumo_private.admin_staff(user_id),
 due_at timestamptz not null,status text not null default 'open' check(status in('open','investigating','waiting_provider','awaiting_review','resolved')),
 evidence text not null check(length(evidence) between 3 and 2000),
 resolution text not null default '' check(length(resolution)<=2000),
 proposal jsonb,reviewed_by uuid references lumo_private.admin_staff(user_id),
 created_by uuid not null references lumo_private.admin_staff(user_id),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 resolved_at timestamptz,revision bigint not null default 1,
 unique(created_by,request_key),check((status='resolved')=(resolved_at is not null)),
 check(kind<>'guest_outcome' or guest_id is not null)
);
create index admin_reconciliation_queue on lumo_private.admin_reconciliation_exceptions(status,due_at,id);
create index admin_reconciliation_case on lumo_private.admin_reconciliation_exceptions(case_id);
create unique index admin_reconciliation_open_guest on lumo_private.admin_reconciliation_exceptions(guest_id) where kind='guest_outcome' and status<>'resolved';
alter table lumo_private.admin_refund_controls enable row level security;
alter table lumo_private.admin_reconciliation_exceptions enable row level security;
revoke all on lumo_private.admin_refund_controls,lumo_private.admin_reconciliation_exceptions from public,anon,authenticated,service_role;

create function lumo_private.admin_financial_exception_json(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',e.id,'kind',e.kind,'reference',e.reference,'summary',e.summary,'caseId',e.case_id,'transactionId',e.transaction_id,'guestId',e.guest_id,
  'ownerId',e.owner_id,'owner',s.display_name,'dueAt',e.due_at,'status',e.status,'evidence',e.evidence,'resolution',e.resolution,'proposal',e.proposal,
  'createdBy',e.created_by,'reviewedBy',e.reviewed_by,'createdAt',e.created_at,'updatedAt',e.updated_at,'resolvedAt',e.resolved_at,'revision',e.revision,
  'overdue',e.status<>'resolved' and e.due_at<clock_timestamp(),'sandbox',true)
 from lumo_private.admin_reconciliation_exceptions e join lumo_private.admin_staff s on s.user_id=e.owner_id where e.id=p_id;
$$;
create function lumo_private.admin_financial_refund_json(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',a.id,'action',a.action,'entityId',a.entity_id,'caseId',a.case_id,'reason',a.reason,'status',a.status,'requestedBy',a.requested_by,
  'decidedBy',a.decided_by,'decisionReason',a.decision_reason,'createdAt',a.created_at,'decidedAt',a.decided_at,'amount',c.amount,'originalPaymentId',c.original_payment_id,
  'confirmedJournalId',c.confirmed_journal_id,'refundReference',j.reference,'completedAt',c.completed_at,'completionEvidence',c.completion_evidence,'bounded',true,
  'execution','original_merchant_refund_workflow','sandbox',true)
 from lumo_private.admin_refund_controls c join lumo_private.admin_approvals a on a.id=c.approval_id left join lumo_private.journals j on j.id=c.confirmed_journal_id where c.approval_id=p_id;
$$;

create function public.lumo_admin_financial(p_command text,p_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor uuid;staff_role text;session_result jsonb;ident uuid;request_key uuid;case_id uuid;owner_id uuid;amount bigint;reserved bigint;refunded bigint;
 payment lumo_private.journals%rowtype;refund lumo_private.journals%rowtype;approval lumo_private.admin_approvals%rowtype;control lumo_private.admin_refund_controls%rowtype;
 exception_row lumo_private.admin_reconciliation_exceptions%rowtype;guest lumo_private.guest_momo_attempts%rowtype;
 reason text;evidence text;kind text;ref text;summary text;status_value text;outcome text;due timestamptz;result jsonb;old jsonb;rows jsonb;total bigint;pg integer;ps integer;guest_was_pending boolean:=false;
begin
 if (auth.jwt()->>'role') is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 if p_command is null or p_command not in('financial.refund.create','financial.refund.get','financial.refund.decide','financial.refund.complete','financial.exceptions.list','financial.exceptions.create','financial.exceptions.update','financial.guest.propose','financial.guest.resolve') or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>16000 then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 session_result:=public.lumo_admin_service('session',p_payload);
 if session_result->>'ok' is distinct from 'true' then return session_result;end if;
 actor:=(p_payload->>'actor')::uuid;staff_role:=session_result#>>'{data,staff,role}';
 if lumo_private.admin_mfa_required() and (p_payload->>'aal' is distinct from 'aal2' or not exists(select 1 from auth.mfa_factors f where f.user_id=actor and f.factor_type='totp' and f.status='verified')) then return jsonb_build_object('ok',false,'code','MFA_REQUIRED');end if;
 if staff_role not in('super_admin','supervisor','finance','risk','auditor','support','merchant_ops') or staff_role='auditor' and p_command not in('financial.exceptions.list','financial.refund.get') then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 if p_command in('financial.refund.decide','financial.refund.complete','financial.guest.resolve','financial.exceptions.list','financial.exceptions.update','financial.exceptions.create') and staff_role not in('super_admin','supervisor','finance','risk','auditor') then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 reason:=trim(coalesce(p_payload->>'reason',''));evidence:=trim(coalesce(p_payload->>'evidence',''));
 if p_command not in('financial.exceptions.list','financial.refund.get') and length(reason) not between 3 and 2000 then return jsonb_build_object('ok',false,'code','REASON_REQUIRED');end if;

 if p_command='financial.refund.create' then
  if jsonb_typeof(p_payload->'amount') is distinct from 'number' or coalesce(p_payload->>'amount','')!~'^[0-9]+$' then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  amount:=(p_payload->>'amount')::bigint;ident:=(p_payload->>'entityId')::uuid;case_id:=(p_payload->>'caseId')::uuid;request_key:=(p_payload->>'requestId')::uuid;
  if amount<1 or case_id is null or request_key is null then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  select * into control from lumo_private.admin_refund_controls c where c.requested_by=actor and c.request_key=request_key;
  if control.approval_id is not null then
   select * into approval from lumo_private.admin_approvals where id=control.approval_id;
   if control.original_payment_id<>ident or control.amount<>amount or approval.case_id<>case_id or approval.reason<>reason then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');end if;
   return jsonb_build_object('ok',true,'data',jsonb_build_object('record',lumo_private.admin_financial_refund_json(control.approval_id),'replayed',true));
  end if;
  select * into payment from lumo_private.journals j where j.id=ident for update;
  if payment.id is null or payment.type<>'merchant_payment' or not exists(select 1 from lumo_private.admin_cases c where c.id=case_id and (c.transaction_id=payment.id or c.merchant_id in(select m.id from lumo_private.merchants m where m.account_id=payment.payee_account_id) or c.customer_id=payment.actor_user_id or c.guest_id in(select g.id from lumo_private.guest_momo_attempts g where g.journal_id=payment.id))) then return jsonb_build_object('ok',false,'code','INVALID_REFUND');end if;
  select coalesce(sum(j.amount),0) into refunded from lumo_private.journals j where j.type='refund' and j.original_payment_id=payment.id;
  select coalesce(sum(c.amount),0) into reserved from lumo_private.admin_refund_controls c join lumo_private.admin_approvals a on a.id=c.approval_id where c.original_payment_id=payment.id and a.status in('pending','approved_pending_execution');
  if amount>payment.amount-refunded-reserved then return jsonb_build_object('ok',false,'code','REFUND_EXCEEDS_PAYMENT');end if;
  insert into lumo_private.admin_approvals(action,entity_id,reason,case_id,requested_by) values('payment.refund',payment.id::text,reason,case_id,actor) returning id into ident;
  insert into lumo_private.admin_refund_controls(approval_id,original_payment_id,amount,request_key,requested_by) values(ident,payment.id,amount,request_key,actor);
  perform lumo_private.admin_log(actor,staff_role,p_command,'approval',ident::text,reason,case_id,null,jsonb_build_object('amount',amount,'originalPaymentId',payment.id,'moneyMoved',false));
  result:=jsonb_build_object('record',lumo_private.admin_financial_refund_json(ident),'moneyMoved',false);
 elsif p_command='financial.refund.get' then
  ident:=(p_payload->>'id')::uuid;result:=jsonb_build_object('record',lumo_private.admin_financial_refund_json(ident));
  if result->'record'='null'::jsonb then return jsonb_build_object('ok',false,'code','NOT_FOUND');end if;
 elsif p_command in('financial.refund.decide','financial.refund.complete') then
  ident:=(p_payload->>'id')::uuid;select * into approval from lumo_private.admin_approvals a where a.id=ident for update;
  select * into control from lumo_private.admin_refund_controls c where c.approval_id=ident for update;
  if approval.id is null or control.approval_id is null or approval.action<>'payment.refund' then return jsonb_build_object('ok',false,'code','NOT_FOUND');end if;
  if p_command='financial.refund.decide' then
   if approval.status<>'pending' then
    if approval.decided_by=actor and approval.decision_reason=reason and (p_payload->>'decision'='approve' and approval.status in('approved_pending_execution','executed') or p_payload->>'decision'='reject' and approval.status='rejected') then return jsonb_build_object('ok',true,'data',jsonb_build_object('record',lumo_private.admin_financial_refund_json(ident),'replayed',true,'moneyMoved',false));end if;
    return jsonb_build_object('ok',false,'code','ALREADY_DECIDED');
   end if;
   if approval.requested_by=actor then return jsonb_build_object('ok',false,'code','SELF_APPROVAL_FORBIDDEN');end if;
   if coalesce(p_payload->>'decision','') not in('approve','reject') then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
   status_value:=case when p_payload->>'decision'='approve' then 'approved_pending_execution' else 'rejected' end;
   update lumo_private.admin_approvals set status=status_value,decided_by=actor,decided_at=clock_timestamp(),decision_reason=reason,result=jsonb_build_object('amount',control.amount,'originalPaymentId',control.original_payment_id,'moneyMoved',false,'message','Execute the approved amount through the original merchant refund workflow, then verify its posted journal here.') where id=ident;
  else
   if length(evidence) not between 3 and 2000 then return jsonb_build_object('ok',false,'code','EVIDENCE_REQUIRED');end if;
   if approval.status='executed' then
    if control.confirmed_journal_id::text=p_payload->>'journalId' then return jsonb_build_object('ok',true,'data',jsonb_build_object('record',lumo_private.admin_financial_refund_json(ident),'replayed',true,'moneyMoved',false));end if;
    return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');
   end if;
   if approval.status<>'approved_pending_execution' or approval.decided_by is null or approval.decided_by=approval.requested_by then return jsonb_build_object('ok',false,'code','APPROVAL_REQUIRED');end if;
   select * into payment from lumo_private.journals j where j.id=control.original_payment_id;
   select * into refund from lumo_private.journals j where j.id=(p_payload->>'journalId')::uuid;
   if refund.id is null or refund.type<>'refund' or refund.original_payment_id is distinct from payment.id or refund.amount<>control.amount or refund.payer_account_id is distinct from payment.payee_account_id or refund.payee_account_id is distinct from payment.payer_account_id or refund.shop_id is distinct from payment.shop_id or refund.request_id is distinct from payment.request_id or refund.created_at<approval.decided_at or exists(select 1 from lumo_private.admin_refund_controls c where c.confirmed_journal_id=refund.id and c.approval_id<>ident) then return jsonb_build_object('ok',false,'code','REFUND_EVIDENCE_MISMATCH');end if;
   if (select coalesce(sum(j.amount),0) from lumo_private.journals j where j.type='refund' and j.original_payment_id=payment.id)>payment.amount then return jsonb_build_object('ok',false,'code','REFUND_EVIDENCE_MISMATCH');end if;
   update lumo_private.admin_refund_controls set confirmed_journal_id=refund.id,completed_by=actor,completed_at=clock_timestamp(),completion_evidence=evidence where approval_id=ident;
   update lumo_private.admin_approvals set status='executed',result=jsonb_build_object('amount',refund.amount,'journalId',refund.id,'reference',refund.reference,'originalPaymentId',payment.id,'verified',true,'moneyMoved',false,'message','Existing merchant refund verified. This check did not move money.') where id=ident;
   status_value:='executed';
  end if;
  perform lumo_private.admin_log(actor,staff_role,p_command,'approval',ident::text,reason,approval.case_id,jsonb_build_object('status',approval.status),jsonb_build_object('status',status_value,'amount',control.amount,'journalId',refund.id,'evidence',nullif(evidence,''),'moneyMoved',false));
  result:=jsonb_build_object('record',lumo_private.admin_financial_refund_json(ident),'moneyMoved',false);
 elsif p_command='financial.exceptions.list' then
  pg:=greatest(1,least(coalesce((p_payload->>'page')::integer,1),100000));ps:=greatest(1,least(coalesce((p_payload->>'pageSize')::integer,25),100));
  select count(*) into total from lumo_private.admin_reconciliation_exceptions e where (nullif(p_payload->>'status','') is null or e.status=p_payload->>'status');
  select coalesce(jsonb_agg(item order by due_at,id),'[]'::jsonb) into rows from (select e.id,e.due_at,lumo_private.admin_financial_exception_json(e.id) item from lumo_private.admin_reconciliation_exceptions e where(nullif(p_payload->>'status','') is null or e.status=p_payload->>'status') order by e.due_at,e.id limit ps offset (pg-1)*ps)x;
  result:=jsonb_build_object('rows',rows,'total',total,'page',pg,'pageSize',ps,'refunds',(select coalesce(jsonb_agg(lumo_private.admin_financial_refund_json(x.id) order by x.created_at),'[]'::jsonb) from (select a.id,a.created_at from lumo_private.admin_approvals a join lumo_private.admin_refund_controls c on c.approval_id=a.id where a.status in('pending','approved_pending_execution') order by a.created_at limit 100)x),'externalMatching','manual-evidence-only','sandbox',true);
 elsif p_command in('financial.exceptions.create','financial.guest.propose') then
  request_key:=(p_payload->>'requestId')::uuid;case_id:=(p_payload->>'caseId')::uuid;owner_id:=(p_payload->>'ownerId')::uuid;due:=(p_payload->>'dueAt')::timestamptz;
  kind:=case when p_command='financial.guest.propose' then 'guest_outcome' else p_payload->>'kind' end;
  ref:=trim(p_payload->>'reference');summary:=trim(p_payload->>'summary');
  if request_key is null or case_id is null or owner_id is null or due is null or due>clock_timestamp()+interval '1 year' or length(evidence) not between 3 and 2000 or not exists(select 1 from lumo_private.admin_staff s where s.user_id=owner_id and s.status='active' and s.role in('super_admin','supervisor','finance','risk')) then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  select * into exception_row from lumo_private.admin_reconciliation_exceptions e where e.created_by=actor and e.request_key=request_key;
  if exception_row.id is not null then
   if exception_row.case_id<>case_id or exception_row.owner_id<>owner_id or exception_row.due_at<>due or exception_row.evidence<>evidence or exception_row.kind<>kind or p_command='financial.guest.propose' and (exception_row.guest_id is distinct from p_payload->>'guestId' or exception_row.proposal->>'outcome' is distinct from p_payload->>'outcome') or p_command='financial.exceptions.create' and (exception_row.reference is distinct from ref or exception_row.summary is distinct from summary or exception_row.transaction_id is distinct from nullif(p_payload->>'transactionId','')::uuid or exception_row.guest_id is distinct from nullif(p_payload->>'guestId','')) then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');end if;
   return jsonb_build_object('ok',true,'data',jsonb_build_object('record',lumo_private.admin_financial_exception_json(exception_row.id),'replayed',true));
  end if;
  if p_command='financial.guest.propose' then
   outcome:=p_payload->>'outcome';select * into guest from lumo_private.guest_momo_attempts g where g.id=p_payload->>'guestId';
   if coalesce(outcome,'') not in('approve','decline','cancel') or p_payload->>'sandboxConfirmed' is distinct from 'true' or guest.id is null or guest.provider_mode<>'sandbox' or guest.status<>'pending' then return jsonb_build_object('ok',false,'code','INVALID_GUEST_OUTCOME');end if;
   if not exists(select 1 from lumo_private.admin_cases c where c.id=case_id and c.guest_id=guest.id) then return jsonb_build_object('ok',false,'code','CASE_LINK_REQUIRED');end if;
   ref:=guest.provider_reference;summary:='Review explicit sandbox outcome for original guest payment';status_value:='awaiting_review';
   result:=jsonb_build_object('outcome',outcome,'amount',guest.amount,'currency',guest.currency,'merchantId',guest.merchant_id,'shopId',guest.shop_id,'providerReference',guest.provider_reference,'providerMode','sandbox','proposedBy',actor);
   select * into exception_row from lumo_private.admin_reconciliation_exceptions e where e.guest_id=guest.id and e.kind='guest_outcome' and e.status<>'resolved' for update;
   if exception_row.id is not null then
    if p_payload->>'id' is distinct from exception_row.id::text or (p_payload->>'expectedRevision')::bigint is distinct from exception_row.revision or exception_row.status='awaiting_review' then return jsonb_build_object('ok',false,'code','CONFLICT');end if;
    old:=lumo_private.admin_financial_exception_json(exception_row.id);
    update lumo_private.admin_reconciliation_exceptions set owner_id=owner_id,due_at=due,evidence=evidence,proposal=result,status='awaiting_review',reviewed_by=null,resolution='',updated_at=clock_timestamp(),revision=revision+1 where id=exception_row.id;
    perform lumo_private.admin_log(actor,staff_role,p_command,'reconciliation_exception',exception_row.id::text,reason,case_id,old,lumo_private.admin_financial_exception_json(exception_row.id));
    return jsonb_build_object('ok',true,'data',jsonb_build_object('record',lumo_private.admin_financial_exception_json(exception_row.id),'moneyMoved',false));
   end if;
  else
   if kind not in('ledger','provider_statement','other') or length(coalesce(ref,'')) not between 1 and 160 or length(coalesce(summary,'')) not between 3 and 600 or not exists(select 1 from lumo_private.admin_cases c where c.id=case_id) then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
   status_value:='open';result:=null;
  end if;
  insert into lumo_private.admin_reconciliation_exceptions(request_key,kind,reference,summary,case_id,transaction_id,guest_id,owner_id,due_at,status,evidence,proposal,created_by)
  values(request_key,kind,ref,summary,case_id,nullif(p_payload->>'transactionId','')::uuid,case when kind='guest_outcome' then guest.id else nullif(p_payload->>'guestId','') end,owner_id,due,status_value,evidence,result,actor) returning id into ident;
  perform lumo_private.admin_log(actor,staff_role,p_command,'reconciliation_exception',ident::text,reason,case_id,null,lumo_private.admin_financial_exception_json(ident));
  result:=jsonb_build_object('record',lumo_private.admin_financial_exception_json(ident),'moneyMoved',false);
 elsif p_command in('financial.exceptions.update','financial.guest.resolve') then
  ident:=(p_payload->>'id')::uuid;select * into exception_row from lumo_private.admin_reconciliation_exceptions e where e.id=ident for update;
  if exception_row.id is null then return jsonb_build_object('ok',false,'code','NOT_FOUND');end if;
  if p_command='financial.guest.resolve' and exception_row.kind='guest_outcome' and exception_row.reviewed_by=actor and exception_row.evidence=evidence and (p_payload->>'expectedRevision')::bigint=exception_row.revision-1 and (p_payload->>'decision'='approve' and exception_row.status='resolved' or p_payload->>'decision'='reject' and exception_row.status='investigating') then
   return jsonb_build_object('ok',true,'data',jsonb_build_object('record',lumo_private.admin_financial_exception_json(ident),'replayed',true,'moneyMoved',false,'sandbox',true));
  end if;
  if (p_payload->>'expectedRevision')::bigint is distinct from exception_row.revision then return jsonb_build_object('ok',false,'code','REVISION_CONFLICT');end if;
  if length(evidence) not between 3 and 2000 then return jsonb_build_object('ok',false,'code','EVIDENCE_REQUIRED');end if;
  old:=lumo_private.admin_financial_exception_json(ident);
  if p_command='financial.guest.resolve' then
   if exception_row.kind<>'guest_outcome' or exception_row.status<>'awaiting_review' or exception_row.proposal is null or coalesce(p_payload->>'decision','') not in('approve','reject') then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
   if coalesce(exception_row.proposal->>'proposedBy',exception_row.created_by::text)=actor::text then return jsonb_build_object('ok',false,'code','SELF_APPROVAL_FORBIDDEN');end if;
   if p_payload->>'decision'='reject' then
    -- A rejected proposal cannot clear the unresolved original attempt.
    update lumo_private.admin_reconciliation_exceptions set status='investigating',reviewed_by=actor,evidence=evidence,resolution='Outcome proposal rejected; original guest payment remains unresolved.',updated_at=clock_timestamp(),revision=revision+1 where id=ident;
   else
    select * into guest from lumo_private.guest_momo_attempts g where g.id=exception_row.guest_id;
    if guest.id is null or guest.provider_mode<>'sandbox' or guest.amount::text is distinct from exception_row.proposal->>'amount' or guest.currency is distinct from exception_row.proposal->>'currency' or guest.provider_reference is distinct from exception_row.proposal->>'providerReference' or guest.merchant_id::text is distinct from exception_row.proposal->>'merchantId' or guest.shop_id::text is distinct from exception_row.proposal->>'shopId' then return jsonb_build_object('ok',false,'code','PROVIDER_RESULT_MISMATCH');end if;
    guest_was_pending:=guest.status='pending';
    perform lumo_private.guest_apply_result(guest.id,exception_row.proposal->>'outcome',guest.amount,guest.currency,guest.merchant_id,guest.shop_id,guest.provider_reference);
    select * into guest from lumo_private.guest_momo_attempts g where g.id=exception_row.guest_id;
    if guest.status='pending' then return jsonb_build_object('ok',false,'code','OUTCOME_UNCONFIRMED');end if;
    update lumo_private.admin_reconciliation_exceptions set status='resolved',reviewed_by=actor,evidence=evidence,resolution='Explicit sandbox result: '||guest.status||'. Original reference '||guest.provider_reference||'.',resolved_at=clock_timestamp(),updated_at=clock_timestamp(),revision=revision+1 where id=ident;
   end if;
  else
   if exception_row.status='resolved' then return jsonb_build_object('ok',false,'code','ALREADY_DECIDED');end if;
   status_value:=p_payload->>'status';owner_id:=(p_payload->>'ownerId')::uuid;due:=(p_payload->>'dueAt')::timestamptz;
   if status_value not in('open','investigating','waiting_provider','resolved') or owner_id is null or due is null or due>clock_timestamp()+interval '1 year' or not exists(select 1 from lumo_private.admin_staff s where s.user_id=owner_id and s.status='active' and s.role in('super_admin','supervisor','finance','risk')) then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
   if exception_row.kind='guest_outcome' and status_value='resolved' then return jsonb_build_object('ok',false,'code','OUTCOME_REVIEW_REQUIRED');end if;
   if status_value='resolved' and length(trim(coalesce(p_payload->>'resolution',''))) not between 3 and 2000 then return jsonb_build_object('ok',false,'code','RESOLUTION_REQUIRED');end if;
   update lumo_private.admin_reconciliation_exceptions set status=status_value,owner_id=owner_id,due_at=due,evidence=evidence,resolution=coalesce(p_payload->>'resolution',''),resolved_at=case when status_value='resolved' then clock_timestamp() else null end,updated_at=clock_timestamp(),revision=revision+1 where id=ident;
  end if;
  perform lumo_private.admin_log(actor,staff_role,p_command,'reconciliation_exception',ident::text,reason,exception_row.case_id,old,lumo_private.admin_financial_exception_json(ident));
  result:=jsonb_build_object('record',lumo_private.admin_financial_exception_json(ident),'moneyMoved',guest_was_pending and guest.status='confirmed','sandbox',true,'journalId',guest.journal_id);
 end if;
 return jsonb_build_object('ok',true,'data',result);
exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format then return jsonb_build_object('ok',false,'code','INVALID_INPUT');
 when unique_violation then return jsonb_build_object('ok',false,'code','CONFLICT');
 when foreign_key_violation or check_violation then return jsonb_build_object('ok',false,'code','INVALID_INPUT');
 when others then return jsonb_build_object('ok',false,'code',case when SQLERRM in('PAYMENT_FINAL','PROVIDER_RESULT_MISMATCH','PROVIDER_UNAVAILABLE','SERVICE_PAUSED') then SQLERRM else 'FINANCIAL_OPERATION_FAILED' end);
end $$;
revoke all on function lumo_private.admin_financial_exception_json(uuid),lumo_private.admin_financial_refund_json(uuid),public.lumo_admin_financial(text,jsonb) from public,anon,authenticated;
grant execute on function public.lumo_admin_financial(text,jsonb) to service_role;
