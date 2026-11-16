-- Only the authenticated Edge gateway may search payment identities. The client
-- receives names and handles, never account balances or a phone directory.
create function lumo_private.approved_people_search(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid;session uuid;q text;exact_phone text;rows jsonb;
begin
 if (auth.jwt()->>'role') is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or jsonb_typeof(p_payload->'query') is distinct from 'string'
  or length(p_payload->>'query')>80 then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 begin actor:=(p_payload->>'actor')::uuid;session:=(p_payload->>'session')::uuid;
 exception when invalid_text_representation then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end;
 if actor is null or session is null or not lumo_private.approved_live(actor,session) then return jsonb_build_object('ok',false,'code','SESSION_REVOKED');end if;
 if not exists(select 1 from lumo_private.profiles p join lumo_private.accounts a on a.owner_user_id=p.user_id and a.kind='consumer' and a.status='active' where p.user_id=actor and p.status='active') then return jsonb_build_object('ok',false,'code','ACCOUNT_UNAVAILABLE');end if;
 q:=lower(trim(regexp_replace(trim(p_payload->>'query'),'^@','')));
 if q ~ '[[:cntrl:]]' then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 if length(q)=1 then return jsonb_build_object('ok',true,'people','[]'::jsonb,'hasMore',false);end if;
 exact_phone:=regexp_replace(q,'[\s()-]','','g');exact_phone:=regexp_replace(exact_phone,'^\+233','0');
 select coalesce(jsonb_agg(jsonb_build_object('id',x.user_id,'userId',x.user_id,'handle',x.handle,'name',x.display_name,'rail','lumo') order by x.rank,x.handle),'[]'::jsonb) into rows from (
  select p.user_id,p.handle,p.display_name,case when p.handle=q then 0 when starts_with(p.handle,q) then 1 else 2 end as rank
  from lumo_private.profiles p join lumo_private.accounts a on a.owner_user_id=p.user_id and a.kind='consumer' and a.status='active'
  join auth.users u on u.id=p.user_id
  where p.status='active' and p.user_id<>actor and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp())
   and not coalesce(u.is_anonymous,false) and u.raw_app_meta_data->'lumo_pilot'='true'::jsonb
   and (q='' or starts_with(p.handle,q) or strpos(lower(p.display_name),q)>0
    or exact_phone~'^0[0-9]{9}$' and exists(select 1 from lumo_private.approved_profiles ap where ap.user_id=p.user_id and ap.phone=exact_phone))
  order by rank,p.handle limit 21
 )x;
 return jsonb_build_object('ok',true,'people',(select coalesce(jsonb_agg(value),'[]'::jsonb) from jsonb_array_elements(rows) with ordinality e(value,n) where n<=20),'hasMore',jsonb_array_length(rows)>20);
end $$;
revoke all on function lumo_private.approved_people_search(jsonb) from public,anon,authenticated,service_role;
create function public.lumo_approved_people_search(p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$
 select lumo_private.approved_people_search(p_payload);
$$;
revoke all on function public.lumo_approved_people_search(jsonb) from public,anon,authenticated;
grant execute on function lumo_private.approved_people_search(jsonb) to service_role;
grant execute on function public.lumo_approved_people_search(jsonb) to service_role;
comment on function public.lumo_approved_people_search(jsonb) is 'Service-only, live-session-bound payment identity search. Active consumers only, self excluded, at most 20 names/handles; no balances or phone directory.';
