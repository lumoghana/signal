-- Engineering retention defaults for the pilot, not a legal retention policy:
-- active consent must be renewed within a year; abandoned captures within a day.
-- No raw photos enter this schema. Financial/audit records are preserved.
alter table lumo_private.access_face_templates add column expires_at timestamptz not null default clock_timestamp()+interval '365 days';
create index access_face_retention on lumo_private.access_face_templates(expires_at,id) where state='active';
create index access_face_attempt_retention on lumo_private.access_face_attempts(expires_at,id) where frame_digests is not null or state in('processing','matched');
create index access_request_biometric_retention on lumo_private.access_requests(expires_at,id) where face_digests is not null and face_digests<>'[]'::jsonb;

create function lumo_private.access_erase_biometrics(p_user uuid,p_module text,p_reason text) returns jsonb
language plpgsql set search_path='' as $$
declare changed integer;
begin
 if p_module not in('consumer','merchant','admin') or p_user is null or p_reason not in('consent.withdrawn','account.closed','retention.expired','privacy.fulfilled') then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 perform pg_advisory_xact_lock(hashtextextended('lumo-access:'||p_user::text,0));
 if exists(select 1 from lumo_private.access_requests where user_id=p_user and state='applying') or exists(select 1 from lumo_private.access_credential_writes where user_id=p_user and state='applying') then return jsonb_build_object('ok',false,'code','RESET_IN_PROGRESS');end if;
 update lumo_private.access_face_templates set state='revoked',ciphertext=null,revoked_at=coalesce(revoked_at,clock_timestamp()) where user_id=p_user and module=p_module and (state<>'revoked' or ciphertext is not null);get diagnostics changed=row_count;
 update lumo_private.access_enrollments set revision=revision+1,face_digests='[]'::jsonb,updated_at=clock_timestamp() where user_id=p_user and module=p_module and (changed>0 or face_digests<>'[]'::jsonb);
 update lumo_private.access_requests set face_digests='[]'::jsonb where user_id=p_user and module=p_module and coalesce(face_digests,'[]'::jsonb)<>'[]'::jsonb;
 update lumo_private.access_face_attempts a set frame_digests=null,state=case when a.state in('processing','matched') then 'expired' else a.state end from lumo_private.access_requests r where a.request_id=r.id and r.user_id=p_user and r.module=p_module and (a.frame_digests is not null or a.state in('processing','matched'));
 if changed>0 then insert into lumo_private.access_audit(module,user_id,action) values(p_module,p_user,'face.erased.'||p_reason);end if;
 return jsonb_build_object('ok',true,'removed',true,'templatesErased',changed);
end $$;
revoke all on function lumo_private.access_erase_biometrics(uuid,text,text) from public,anon,authenticated,service_role;

-- Expired consent is rejected even if the scheduled sweep is delayed.
do $patch$
declare target text;definition text;needle text;
begin
 foreach target in array array['access_enrollment_json','access_prototype_enrollment_json'] loop
  definition:=pg_get_functiondef(('lumo_private.'||target||'(text,uuid)')::regprocedure);
  needle:='f.state=''active''';
  if strpos(definition,needle)=0 then raise exception 'Enrollment retention seam changed: %',target;end if;
  execute replace(definition,needle,needle||' and f.expires_at>statement_timestamp()');
 end loop;
 foreach target in array array['access_stored_face','access_prototype_stored_face'] loop
  definition:=pg_get_functiondef(('lumo_private.'||target||'(text,jsonb)')::regprocedure);
  needle:='state=''active'' for update';
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>2 then raise exception 'Face retention seam changed: %',target;end if;
  definition:=replace(definition,needle,'state=''active'' and expires_at>clock_timestamp() for update');
  needle:='return jsonb_build_object(''ok'',true,''removed'',true,''enrollment'',lumo_private.';
  if strpos(definition,needle)=0 then raise exception 'Face withdrawal seam changed: %',target;end if;
  definition:=replace(definition,needle,'perform lumo_private.access_erase_biometrics(actor,mod,''consent.withdrawn''); '||needle);
  execute definition;
 end loop;
end $patch$;

create function lumo_private.access_biometric_retention_sweep(p_limit integer default 100) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target record;changed integer:=0;removed integer;result jsonb;
begin
 for target in select distinct t.user_id,t.module from lumo_private.access_face_templates t
  where (t.state='active' and t.expires_at<=clock_timestamp()) or (t.state in('processing','ready') and t.created_at<clock_timestamp()-interval '1 day') or (t.state='revoked' and t.ciphertext is not null)
  order by t.user_id,t.module limit greatest(1,least(coalesce(p_limit,100),1000)) loop
  if not pg_try_advisory_xact_lock(hashtextextended('lumo-access:'||target.user_id::text,0)) then continue;end if;
  if exists(select 1 from lumo_private.access_requests where user_id=target.user_id and state='applying') or exists(select 1 from lumo_private.access_credential_writes where user_id=target.user_id and state='applying') then continue;end if;
  -- Expiry of an old staged capture must not remove a newer valid template.
  update lumo_private.access_face_templates set state='revoked',ciphertext=null,revoked_at=coalesce(revoked_at,clock_timestamp()) where user_id=target.user_id and module=target.module and ((state='active' and expires_at<=clock_timestamp()) or (state in('processing','ready') and created_at<clock_timestamp()-interval '1 day') or (state='revoked' and ciphertext is not null));get diagnostics removed=row_count;changed:=changed+removed;
  if not exists(select 1 from lumo_private.access_face_templates where user_id=target.user_id and module=target.module and state='active' and expires_at>clock_timestamp()) then
   update lumo_private.access_enrollments set revision=revision+1,face_digests='[]'::jsonb,updated_at=clock_timestamp() where user_id=target.user_id and module=target.module and face_digests<>'[]'::jsonb;
  end if;
  insert into lumo_private.access_audit(module,user_id,action) values(target.module,target.user_id,'face.retention.swept');
 end loop;
 -- Request and comparison hashes cannot reconstruct a photo, but are still
 -- biometric linkage data. Strip them after their short proof lifetime.
 update lumo_private.access_face_attempts set frame_digests=null,state=case when state in('processing','matched') then 'expired' else state end where id in(select id from lumo_private.access_face_attempts where expires_at<clock_timestamp() and (frame_digests is not null or state in('processing','matched')) order by expires_at,id limit greatest(1,least(coalesce(p_limit,100),1000))*10);
 update lumo_private.access_requests set face_digests='[]'::jsonb where id in(select id from lumo_private.access_requests where expires_at<clock_timestamp()-interval '1 day' and state<>'applying' and face_digests is not null and face_digests<>'[]'::jsonb order by expires_at,id limit greatest(1,least(coalesce(p_limit,100),1000))*10);
 return jsonb_build_object('ok',true,'templatesErased',changed);
end $$;
revoke all on function lumo_private.access_biometric_retention_sweep(integer) from public,anon,authenticated,service_role;

create function lumo_private.access_erase_on_account_close() returns trigger language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if new.kind='consumer' and new.status='closed' and old.status is distinct from new.status then
  result:=lumo_private.access_erase_biometrics(new.owner_user_id,'consumer','account.closed');
  if result->>'ok' is distinct from 'true' then raise exception 'RESET_IN_PROGRESS';end if;
 end if;return new;
end $$;
revoke all on function lumo_private.access_erase_on_account_close() from public,anon,authenticated,service_role;
create trigger access_biometric_account_close after update of status on lumo_private.accounts for each row execute function lumo_private.access_erase_on_account_close();

-- The local fixture runner has no scheduler. Hosted execution uses the managed
-- pg_cron extension when present; its job can call only this private fixed task.
do $schedule$
begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  execute 'select cron.schedule(''lumo-biometric-retention'',''17 * * * *'',''select lumo_private.access_biometric_retention_sweep(100)'')';
 end if;
end $schedule$;
