-- Explicit personal sandbox MoMo/bank transfers debit the consumer's virtual
-- amount plus the fixed test fee into the existing test_funding account.
-- No provider, account kind, RLS policy, RPC grant or outcome control is added.
alter table lumo_private.journals drop constraint journals_type_check;
alter table lumo_private.journals add constraint journals_type_check check (
 type in ('test_funding','transfer','merchant_payment','refund','group_contribution',
          'group_payout','group_refund','box_save','box_withdraw','iou_payment','external_simulation')
);
