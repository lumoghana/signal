-- Refund review/execution is a separate queue and must expose its own bounds.
alter function public.lumo_admin_financial(text,jsonb) rename to lumo_admin_financial_before_refund_paging;
alter function public.lumo_admin_financial_before_refund_paging(text,jsonb) set schema lumo_private;
revoke all on function lumo_private.lumo_admin_financial_before_refund_paging(text,jsonb) from public,anon,authenticated,service_role;

create function public.lumo_admin_financial(p_command text,p_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare out jsonb;pg integer;ps integer;total bigint;rows jsonb;
begin
 if p_command='financial.exceptions.list' then
  pg:=coalesce((p_payload->>'refundPage')::integer,1);ps:=coalesce((p_payload->>'refundPageSize')::integer,25);
  if pg<1 or pg>100000 or ps<1 or ps>100 then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 end if;
 -- The original RPC remains authoritative for identity, live session, roles and MFA.
 out:=lumo_private.lumo_admin_financial_before_refund_paging(p_command,p_payload);
 if p_command<>'financial.exceptions.list' or out->>'ok' is distinct from 'true' then return out;end if;
 select count(*) into total from lumo_private.admin_approvals a join lumo_private.admin_refund_controls c on c.approval_id=a.id where a.status in('pending','approved_pending_execution');
 select coalesce(jsonb_agg(lumo_private.admin_financial_refund_json(x.id) order by x.created_at,x.id),'[]'::jsonb) into rows
  from(select a.id,a.created_at from lumo_private.admin_approvals a join lumo_private.admin_refund_controls c on c.approval_id=a.id
   where a.status in('pending','approved_pending_execution') order by a.created_at,a.id limit ps offset (pg-1)*ps)x;
 return jsonb_set(out,'{data}',(out->'data')||jsonb_build_object('refunds',rows,'refundTotal',total,'refundPage',pg,'refundPageSize',ps,'refundHasMore',total>pg::bigint*ps,'refundTruncated',false));
exception when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('ok',false,'code','INVALID_INPUT');
end $$;
revoke all on function public.lumo_admin_financial(text,jsonb) from public,anon,authenticated;
grant execute on function public.lumo_admin_financial(text,jsonb) to service_role;
