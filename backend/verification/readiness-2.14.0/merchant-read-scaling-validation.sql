-- Read-only, one-snapshot compatibility/cache reconciliation after migration.
-- Execute as the migration owner in an isolated acceptance database first.
-- Returns only mismatch counts, never customer records, tokens or claim codes.
with businesses as (
 select b.key,b.value from lumo_private.approved_merchant_network n
 cross join lateral jsonb_each(coalesce(n.document->'businesses','{}'::jsonb)) b where n.id
), shops as (
 select b.key,b.value as business,s.value,sh.id,sh.merchant_id
 from businesses b cross join lateral jsonb_array_elements(coalesce(b.value->'shops','[]'::jsonb)) s
 join lumo_private.shops sh on sh.id::text=s.value->>'id' and sh.merchant_id::text=b.key
), expected_access as (
 select id as shop_id,merchant_id,coalesce(value->>'published','false')='true' as published,
 case when length(value->>'testAcceptanceToken')=64 then encode(extensions.digest(value->>'testAcceptanceToken','sha256'),'hex') end as test_key_hash from shops
), expected_directory as (
 select id as shop_id,merchant_id,jsonb_build_object(
 'id',id,'businessId',merchant_id,'businessName',business#>>'{business,name}',
 'name',value->>'name','area',value->>'area','category',value->>'category',
 'code',value->>'code','accountNumber',business#>>'{business,accountNumber}',
 'lat',value->'lat','lng',value->'lng','hours',coalesce(value->>'hours',''),
 'landmark',coalesce(value->>'landmark',''),'open',coalesce(value->>'open','true')<>'false',
 'accepting',coalesce(value->>'accepting','false')='true','published',true,'sandbox',true) as public_fields
 from shops where value->>'published'='true'
), expected_binding as (
 select pr.id as request_id,pr.shop_id,(r.value->>'_consumerUserId')::uuid as consumer_user_id
 from businesses b cross join lateral jsonb_array_elements(coalesce(b.value->'requests','[]'::jsonb)) r
 join lumo_private.payment_requests pr on pr.id::text=r.value->>'id' and pr.shop_id::text=r.value->>'shopId'
 join lumo_private.shops sh on sh.id=pr.shop_id and sh.merchant_id::text=b.key
 where r.value->>'_consumerUserId' is not null
), expected_context as (
 select distinct on(pr.id) pr.id as request_id,pr.shop_id,(m.value->>'_consumerUserId')::uuid as member_consumer_user_id,
 c.value->>'memberId' as membership_id,c.value->>'rewardId' as reward_id,
 jsonb_build_object('grossAmount',c.value->'grossAmount','discount',c.value->'discount','amount',c.value->'amount') as display_context
 from businesses b cross join lateral jsonb_array_elements(coalesce(b.value#>'{loyalty,collections}','[]'::jsonb)) with ordinality c(value,position)
 join lumo_private.payment_requests pr on pr.id::text=c.value->>'requestId'
 join lumo_private.shops sh on sh.id=pr.shop_id and sh.merchant_id::text=b.key
 left join lateral (select member.value from jsonb_array_elements(coalesce(b.value#>'{loyalty,members}','[]'::jsonb)) member where member.value->>'id'=c.value->>'memberId' limit 1) m on true
 order by pr.id,c.position
), differences as (
 select 'shop_access' as projection,count(*) as mismatches from (
  (select * from expected_access except select * from lumo_private.approved_shop_access)
  union all (select * from lumo_private.approved_shop_access except select * from expected_access)) d
 union all select 'public_directory',count(*) from (
  (select * from expected_directory except select * from lumo_private.approved_shop_directory)
  union all (select * from lumo_private.approved_shop_directory except select * from expected_directory)) d
 union all select 'consumer_binding',count(*) from (
  (select * from expected_binding except select * from lumo_private.approved_consumer_request_binding)
  union all (select * from lumo_private.approved_consumer_request_binding except select * from expected_binding)) d
 union all select 'reward_context',count(*) from (
  (select * from expected_context except select * from lumo_private.approved_reward_request_context)
  union all (select * from lumo_private.approved_reward_request_context except select * from expected_context)) d
)
select bool_and(mismatches=0) as validation_passed,jsonb_object_agg(projection,mismatches) as mismatch_counts from differences;
