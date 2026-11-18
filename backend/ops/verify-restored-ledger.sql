-- Read-only restore acceptance. Run against an explicitly selected isolated restore.
-- Aggregate outputs contain no customer identity or individual financial records.
begin read only;
set local statement_timeout='30s';
with totals as (select account_id,sum(amount) amount from lumo_private.entries group by account_id),
balanced as (select j.id,count(e.id) entries,coalesce(sum(e.amount),0) net from lumo_private.journals j left join lumo_private.entries e on e.journal_id=j.id group by j.id)
select (select count(*) from lumo_private.accounts) accounts,
 (select count(*) from lumo_private.journals) journals,
 (select count(*) from lumo_private.entries) entries,
 (select count(*) from lumo_private.accounts a left join totals t on t.account_id=a.id where a.balance<>coalesce(t.amount,0)) balance_mismatches,
 (select count(*) from balanced where entries<>2 or net<>0) unbalanced_journals,
 (select count(*) from lumo_private.accounts where kind<>'test_funding' and balance<0) negative_customer_or_merchant_accounts;
rollback;
