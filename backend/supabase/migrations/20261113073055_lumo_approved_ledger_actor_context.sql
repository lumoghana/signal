-- The immutable ledger's deferred constraint must recognize the verified Edge actor.
-- An Edge service JWT intentionally has no user sub; authority comes from a live
-- user session verified by the gateway and checked again in these service RPCs.
create function lumo_private.approved_actor_context(p_actor uuid,p_session uuid) returns void language plpgsql set search_path='' as $$
declare contexts jsonb;
begin
 if (auth.jwt()->>'role') is distinct from 'service_role' or not lumo_private.approved_live(p_actor,p_session) then raise exception 'UNVERIFIED_SERVICE_ACTOR';end if;
 contexts:=coalesce(nullif(current_setting('lumo.approved.actor_sessions',true),'')::jsonb,'{}'::jsonb);
 perform set_config('lumo.approved.actor_sessions',(contexts||jsonb_build_object(p_actor::text,p_session::text))::text,true);
end $$;
revoke all on function lumo_private.approved_actor_context(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function lumo_private.balanced_journal() returns trigger language plpgsql security definer set search_path='' as $$
declare n integer;total numeric;jid uuid;journal lumo_private.journals%rowtype;contexts jsonb;verified_session uuid;
begin
 if tg_table_name='journals' then jid:=new.id;else jid:=new.journal_id;end if;
 select * into journal from lumo_private.journals where id=jid;
 if auth.uid() is null then
  if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'A shared-money posting requires an authenticated actor';end if;
  contexts:=coalesce(nullif(current_setting('lumo.approved.actor_sessions',true),'')::jsonb,'{}'::jsonb);
  verified_session:=nullif(contexts->>journal.actor_user_id::text,'')::uuid;
  if verified_session is null or not lumo_private.approved_live(journal.actor_user_id,verified_session) then raise exception 'A service posting requires a verified live actor';end if;
 end if;
 select count(*),coalesce(sum(amount),0) into n,total from lumo_private.entries where journal_id=jid;
 if n<>2 or total<>0
 or not exists(select 1 from lumo_private.entries where journal_id=jid and account_id=journal.payer_account_id and amount=-journal.amount)
 or not exists(select 1 from lumo_private.entries where journal_id=jid and account_id=journal.payee_account_id and amount=journal.amount)
 then raise exception 'A journal must contain exactly two matching balanced postings';end if;
 return null;
end $$;
revoke all on function lumo_private.balanced_journal() from public,anon,authenticated,service_role;

do $patch$
declare definition text;needle text;
begin
 definition:=pg_get_functiondef('lumo_private.approved_service(text,jsonb)'::regprocedure);
 needle:='if not lumo_private.approved_live(actor,session) then return jsonb_build_object(''ok'',false,''code'',''SESSION_REVOKED'');end if;';
 if position(needle in definition)=0 then raise exception 'Approved service live-session seam changed';end if;
 execute replace(definition,needle,needle||' perform lumo_private.approved_actor_context(actor,session);');
 definition:=pg_get_functiondef('public.lumo_approved_merchant_commit(uuid,uuid,bigint,text,jsonb,boolean)'::regprocedure);
 needle:='if not lumo_private.approved_live(p_actor,p_session) then return jsonb_build_object(''ok'',false,''code'',''SESSION_REVOKED'');end if;';
 if position(needle in definition)=0 then raise exception 'Approved merchant live-session seam changed';end if;
 execute replace(definition,needle,needle||' perform lumo_private.approved_actor_context(p_actor,p_session);');
end $patch$;
