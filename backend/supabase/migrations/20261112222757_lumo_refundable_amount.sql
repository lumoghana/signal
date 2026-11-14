-- Refund availability is computed from all original-payment refunds, independent of activity pagination.
create or replace function lumo_private.receipt_json(journal_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',j.id,'reference',j.reference,'type',j.type,'amount',j.amount,'currency','GHS','sandbox',true,'status','posted',
 'actorUserId',j.actor_user_id,'refundableAmount',case when j.type='merchant_payment' then greatest(j.amount-coalesce((select sum(r.amount) from lumo_private.journals r where r.original_payment_id=j.id),0),0) else null end,'payerAccountId',j.payer_account_id,'payeeAccountId',j.payee_account_id,'payerHandle',pp.handle,'payeeHandle',rp.handle,'recipientHandle',rp.handle,
 'shopId',j.shop_id,'requestId',j.request_id,'originalPaymentId',j.original_payment_id,'createdAt',j.created_at)
 from lumo_private.journals j
 join lumo_private.accounts pa on pa.id=j.payer_account_id join lumo_private.accounts ra on ra.id=j.payee_account_id
 left join lumo_private.profiles pp on pp.user_id=pa.owner_user_id and pa.kind='consumer'
 left join lumo_private.profiles rp on rp.user_id=ra.owner_user_id and ra.kind='consumer'
 where j.id=receipt_json.journal_id;
$$;
