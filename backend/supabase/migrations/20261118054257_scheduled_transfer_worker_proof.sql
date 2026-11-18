-- A scheduled posting is authorised by its saved, PIN-approved mandate and
-- immutable occurrence, not a fabricated request JWT or caller-set flag.
create function lumo_private.scheduled_journal_authorized(p_journal uuid)
 returns boolean language sql stable security invoker set search_path='' as $$
 select exists(
  select 1 from lumo_private.journals j
  join lumo_private.schedule_occurrences o on o.journal_id=j.id and o.status='posted'
  join lumo_private.transfer_schedules s on s.id=o.schedule_id
  join lumo_private.accounts source on source.id=j.payer_account_id and source.owner_user_id=s.owner_user_id and source.kind='consumer' and source.status='active'
  join lumo_private.accounts target on target.id=j.payee_account_id and target.owner_user_id=s.recipient_user_id and target.kind='consumer' and target.status='active'
  join lumo_private.profiles owner_profile on owner_profile.user_id=s.owner_user_id and owner_profile.status='active'
  join lumo_private.profiles target_profile on target_profile.user_id=s.recipient_user_id and target_profile.status='active'
  join auth.users owner_identity on owner_identity.id=s.owner_user_id and owner_identity.deleted_at is null
   and (owner_identity.banned_until is null or owner_identity.banned_until<=clock_timestamp()) and not coalesce(owner_identity.is_anonymous,false)
   and owner_identity.raw_app_meta_data->'lumo_pilot'='true'::jsonb
  join auth.users target_identity on target_identity.id=s.recipient_user_id and target_identity.deleted_at is null
   and (target_identity.banned_until is null or target_identity.banned_until<=clock_timestamp()) and not coalesce(target_identity.is_anonymous,false)
  where j.id=p_journal and j.type='transfer' and j.actor_user_id=s.owner_user_id
   and j.amount=s.amount and j.payee_account_id=s.recipient_account_id
   and j.shop_id is null and j.request_id is null and j.original_payment_id is null
   and s.status in('active','completed') and s.cancelled_at is null
   and s.completed_occurrences between 1 and s.max_occurrences
   and o.scheduled_due>=s.first_due and o.scheduled_due<=clock_timestamp()
   and (s.end_at is null or o.scheduled_due<=s.end_at)
 );
$$;
revoke all on function lumo_private.scheduled_journal_authorized(uuid) from public,anon,authenticated,service_role;

do $migration$
declare definition text;needle text:=' if auth.uid() is null then';
begin
 definition:=pg_get_functiondef('lumo_private.balanced_journal()'::regprocedure);
 if length(definition)-length(replace(definition,needle,''))<>length(needle) then raise exception 'SCHEDULED_POSTING_GUARD_PATCH_MISMATCH';end if;
 execute replace(definition,needle,' if auth.uid() is null and not lumo_private.scheduled_journal_authorized(jid) then');
end $migration$;

comment on function lumo_private.scheduled_journal_authorized(uuid) is 'Internal deferred-commit proof for the database-owner worker. Exact immutable occurrence and saved mandate only; no public or service-role execution grant.';
