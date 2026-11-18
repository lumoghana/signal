-- A final financial business decline owns the same actor/reference as a success.
-- Only the trusted gateway may provide the validated domain result. The database
-- rechecks the live session, original snapshot, wallet and PIN/device authority
-- under the same actor lock used by successful canonical commits.
do $migration$
declare definition text;needle text:=$needle$ if p_command<>'commit' then return jsonb_build_object('ok',false,'code','UNKNOWN_COMMAND');end if;$needle$;
 replacement text:=$branch$
 if p_command='decline' then
  if p_payload->>'attemptId' is null or p_payload->>'attemptId' !~ '^[A-Za-z0-9_.:-]{10,100}$'
   or p_payload->>'fingerprint' is null or p_payload->>'fingerprint' !~ '^[a-f0-9]{64}$'
   or p_payload->>'type' is null or p_payload->>'type' not in('payment','fund','contributeBox','withdrawBox','contributeGroup','requestPayout','approvePayout','executePayout','closeGroup','settleIOU','requestBoxProtection','completeBoxProtectionChange','accountClose','accountRemoveDevice')
   or p_payload->>'code' is distinct from 'DOMAIN_REJECTED'
   or jsonb_typeof(p_payload->'result') is distinct from 'object'
   or p_payload#>>'{result,ok}' is distinct from 'false'
   or length(coalesce(p_payload#>>'{result,message}','')) not between 1 and 1000
   or exists(select 1 from jsonb_object_keys(p_payload->'result') k where k not in('ok','message'))
   or jsonb_typeof(p_payload->'expectedRevision') is distinct from 'number'
   or jsonb_typeof(p_payload->'expectedWallet') is distinct from 'number'
   then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  select * into prior from lumo_private.approved_attempts where user_id=actor and attempt_id=p_payload->>'attemptId';
  if found then
   if prior.fingerprint<>p_payload->>'fingerprint' then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');end if;
   return jsonb_build_object('ok',true,'found',true,'replayed',true,'result',prior.result,'snapshot',lumo_private.approved_load(actor));
  end if;
  select * into snapshot from lumo_private.approved_states where user_id=actor for update;
  if coalesce(snapshot.revision,0)<>(p_payload->>'expectedRevision')::bigint then return jsonb_build_object('ok',false,'code','REVISION_CONFLICT');end if;
  select id,balance into own,v_balance from lumo_private.accounts where owner_user_id=actor and kind='consumer' and status='active' for update;
  if own is null then return jsonb_build_object('ok',false,'code','ACCOUNT_UNAVAILABLE');end if;
  if v_balance<>(p_payload->>'expectedWallet')::bigint then return jsonb_build_object('ok',false,'code','REVISION_CONFLICT');end if;
  if p_payload ? 'verifiedChallengeId' then
   update lumo_private.approved_challenges set consumed_at=clock_timestamp()
    where id=(p_payload->>'verifiedChallengeId')::uuid and user_id=actor and session_id=session
     and fingerprint=p_payload->>'fingerprint' and attempt_id=p_payload->>'attemptId'
     and expires_at>clock_timestamp() and consumed_at is null;
   if not found then return jsonb_build_object('ok',false,'code','DEVICE_PROOF_INVALID');end if;
  elsif not lumo_private.verify_pin(actor,p_payload->>'pin') then
   return jsonb_build_object('ok',false,'code','PIN_REQUIRED');
  end if;
  insert into lumo_private.approved_attempts(user_id,attempt_id,fingerprint,result)
   values(actor,p_payload->>'attemptId',p_payload->>'fingerprint',jsonb_build_object('ok',false,'code','DOMAIN_REJECTED',
    'message',p_payload#>>'{result,message}','terminal',true,'noMutation',true,'result',p_payload->'result','receipts','[]'::jsonb,'revision',coalesce(snapshot.revision,0)))
   returning * into prior;
  return jsonb_build_object('ok',true,'found',true,'replayed',false,'result',prior.result,'snapshot',lumo_private.approved_load(actor));
 end if;
$branch$;
begin
 definition:=pg_get_functiondef('lumo_private.approved_service(text,jsonb)'::regprocedure);
 if length(definition)-length(replace(definition,needle,''))<>length(needle) then raise exception 'TERMINAL_DECLINE_SERVICE_PATCH_MISMATCH';end if;
 execute replace(definition,needle,replacement||needle);
end $migration$;

comment on table lumo_private.approved_attempts is 'Actor-scoped immutable success or authenticated terminal financial decline. Retain original references and fingerprints; PIN/validation/transient failures are not terminal outcomes.';
