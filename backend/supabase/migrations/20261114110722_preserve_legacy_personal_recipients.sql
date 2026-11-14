-- Preserve the eligibility of existing legacy personal profiles that predate approved_profiles.
-- No wallet, balance, username, staff membership or journal is changed.
insert into lumo_private.approved_profiles(user_id,phone,personal_account)
select p.user_id,null,
 (not exists(select 1 from lumo_private.approved_merchant_network n cross join lateral jsonb_array_elements(n.document->'users') u where u->>'_sharedUserId'=p.user_id::text)
 or exists(select 1 from lumo_private.approved_states s where s.user_id=p.user_id and jsonb_typeof(s.state->'activation')='object' and s.state#>>'{activation,step}' in ('account-created','fund','purpose','ready','complete','waiting')))
from lumo_private.profiles p
where not exists(select 1 from lumo_private.approved_profiles ap where ap.user_id=p.user_id)
on conflict(user_id) do nothing;

