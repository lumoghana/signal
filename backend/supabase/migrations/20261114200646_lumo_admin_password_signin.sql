-- Owner-requested temporary password-only staff sign-in.
-- Staff membership, live Auth sessions, role checks and invite-only setup remain enforced.
-- Re-enable centrally by replacing only this private function body with select true.
create function lumo_private.admin_mfa_required() returns boolean
language sql stable set search_path='' as $$ select false $$;
revoke all on function lumo_private.admin_mfa_required() from public,anon,authenticated,service_role;
comment on function lumo_private.admin_mfa_required() is 'Private staff-authentication policy. Temporarily false by owner request; never controlled by browser payloads.';

do $policy$
declare patch record;definition text;matches integer;
begin
 for patch in select * from (values
 ('public.lumo_admin_service(text,jsonb)', $old$'requiresMfa',true$old$, $new$'requiresMfa',lumo_private.admin_mfa_required()$new$, 2),
 ('public.lumo_admin_service(text,jsonb)', $old$'requiresMfa',p_payload->>'aal' is distinct from 'aal2'$old$, $new$'mfaEnforced',lumo_private.admin_mfa_required(),'requiresMfa',lumo_private.admin_mfa_required() and (p_payload->>'aal' is distinct from 'aal2' or not exists(select 1 from auth.mfa_factors f where f.user_id=actor and f.factor_type='totp' and f.status='verified'))$new$, 1),
 ('public.lumo_admin_service(text,jsonb)', $old$if p_payload->>'aal' is distinct from 'aal2' or not exists(select 1 from auth.mfa_factors f where f.user_id=actor and f.status='verified') then$old$, $new$if lumo_private.admin_mfa_required() and (p_payload->>'aal' is distinct from 'aal2' or not exists(select 1 from auth.mfa_factors f where f.user_id=actor and f.factor_type='totp' and f.status='verified')) then$new$, 1),
 ('public.lumo_admin_staff_directory(jsonb)', $old$if p_payload->>'aal' is distinct from 'aal2' or not exists(select 1 from auth.mfa_factors f where f.user_id=actor and f.status='verified') then$old$, $new$if lumo_private.admin_mfa_required() and (p_payload->>'aal' is distinct from 'aal2' or not exists(select 1 from auth.mfa_factors f where f.user_id=actor and f.factor_type='totp' and f.status='verified')) then$new$, 1),
 ('public.lumo_admin_summary(jsonb)', $old$if p_payload->>'aal' is distinct from 'aal2' or not exists(select 1 from auth.mfa_factors where user_id=actor and status='verified') then$old$, $new$if lumo_private.admin_mfa_required() and (p_payload->>'aal' is distinct from 'aal2' or not exists(select 1 from auth.mfa_factors f where f.user_id=actor and f.factor_type='totp' and f.status='verified')) then$new$, 1),
 ('public.lumo_admin_events(jsonb)', $old$if p_payload->>'aal' is distinct from 'aal2' or not exists(select 1 from auth.mfa_factors where user_id=actor and factor_type='totp' and status='verified') then$old$, $new$if lumo_private.admin_mfa_required() and (p_payload->>'aal' is distinct from 'aal2' or not exists(select 1 from auth.mfa_factors f where f.user_id=actor and f.factor_type='totp' and f.status='verified')) then$new$, 1),
 ('lumo_private.admin_services(text,jsonb)', $old$or p_payload->>'aal'<>'aal2' then$old$, $new$or (lumo_private.admin_mfa_required() and (p_payload->>'aal' is distinct from 'aal2' or not exists(select 1 from auth.mfa_factors f where f.user_id=actor and f.factor_type='totp' and f.status='verified'))) then$new$, 1)
 ) as changes(signature,old_fragment,new_fragment,expected_matches) loop
  definition:=pg_get_functiondef(patch.signature::regprocedure);
  matches:=(length(definition)-length(replace(definition,patch.old_fragment,'')))/length(patch.old_fragment);
  if matches<>patch.expected_matches then raise exception 'Admin authentication seam changed for %; review before applying',patch.signature;end if;
  execute replace(definition,patch.old_fragment,patch.new_fragment);
 end loop;
 perform lumo_private.admin_log(null,'system','admin.auth_policy_updated','admin_auth_policy','staff','Owner requested temporary password-only admin sign-in.',null,'{"mfaEnforced":true}'::jsonb,'{"mfaEnforced":false}'::jsonb);
end $policy$;

