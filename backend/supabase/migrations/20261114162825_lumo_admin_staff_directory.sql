-- Minimal active-colleague directory for case assignment, separate from access administration.
-- No user creation, new grants to client roles, contact details, or Auth session material.
create function public.lumo_admin_staff_directory(p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare checked jsonb;actor uuid;role_value text;rows jsonb;q text;pg integer;ps integer;total bigint;
begin
 -- Reuse the reviewed service-only/live-session/active-staff boundary.
 checked:=public.lumo_admin_service('session',p_payload);
 if checked->>'ok' is distinct from 'true' then return checked;end if;
 actor:=(checked#>>'{data,staff,userId}')::uuid;role_value:=checked#>>'{data,staff,role}';
 if p_payload->>'aal' is distinct from 'aal2' or not exists(select 1 from auth.mfa_factors f where f.user_id=actor and f.status='verified') then return jsonb_build_object('ok',false,'code','MFA_REQUIRED','message','Verify your authenticator code to choose a colleague.');end if;
 q:=left(trim(coalesce(p_payload->>'q','')),80);
 begin pg:=greatest(1,least(coalesce((p_payload->>'page')::integer,1),100000));ps:=greatest(1,least(coalesce((p_payload->>'pageSize')::integer,200),500));
 exception when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('ok',false,'code','INVALID_INPUT','message','Check directory pagination.');end;
 select count(*) into total from lumo_private.admin_staff s where s.status='active' and (q='' or s.display_name ilike '%'||q||'%');
 select coalesce(jsonb_agg(x.item order by x.display_name,x.user_id),'[]'::jsonb) into rows from (
  select s.user_id,s.display_name,jsonb_build_object('id',s.user_id,'userId',s.user_id,'name',s.display_name,'displayName',s.display_name,'role',s.role) item
  from lumo_private.admin_staff s where s.status='active' and(q='' or s.display_name ilike '%'||q||'%') order by s.display_name,s.user_id limit ps offset (pg-1)*ps
 )x;
 perform lumo_private.admin_log(actor,role_value,'staff.directory','staff');
 return jsonb_build_object('ok',true,'data',jsonb_build_object('rows',rows,'total',total,'page',pg,'pageSize',ps));
end $$;
revoke all on function public.lumo_admin_staff_directory(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.lumo_admin_staff_directory(jsonb) to service_role;

create function lumo_private.admin_case_assignee_active() returns trigger language plpgsql set search_path='' as $$
begin
 if new.assignee_id is null then return new;end if;
 if tg_op='UPDATE' then if new.assignee_id is not distinct from old.assignee_id then return new;end if;end if;
 if not exists(select 1 from lumo_private.admin_staff s where s.user_id=new.assignee_id and s.status='active') then raise exception using errcode='23514',message='Assign the case to an active colleague.';end if;
 return new;
end $$;
revoke all on function lumo_private.admin_case_assignee_active() from public,anon,authenticated,service_role;
create trigger admin_case_active_assignment before insert or update of assignee_id on lumo_private.admin_cases for each row execute function lumo_private.admin_case_assignee_active();
