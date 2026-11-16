-- Correct runtime SQL name binding in shared budget/hack/refund hooks. No data rewritten.
create or replace function lumo_private.planning_after_payment(actor uuid,journal uuid,p_payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_posted lumo_private.journals%rowtype;v_category lumo_private.budget_categories%rowtype;v_budget lumo_private.plans%rowtype;
 v_rule_record record;v_source_account uuid;v_category_id uuid;v_saving_journal uuid;v_spent bigint;v_save_amount bigint;v_available bigint;v_left_unplanned bigint;v_box_balance bigint;
 v_automatic jsonb:='[]'::jsonb;v_planning jsonb;
begin
 -- A refund restores the original v_category, including a partial refund and an older plan period.
 -- The original immutable allocation determines the recipient v_category; callers cannot redirect it.
 select j.* into v_posted from lumo_private.journals j where j.id=journal and j.actor_user_id=actor and j.type='refund';
 if found then
  select bs.category_id into v_category_id from lumo_private.budget_spending bs where bs.journal_id=v_posted.original_payment_id and bs.amount>0;
  if v_category_id is not null then insert into lumo_private.budget_spending(journal_id,category_id,amount)values(journal,v_category_id,-v_posted.amount);end if;
  return jsonb_build_object('budgetCategoryId',v_category_id,'savingsHacks','[]'::jsonb,'refundRestored',v_category_id is not null);
 end if;
 select j.* into v_posted from lumo_private.journals j join lumo_private.accounts a on a.id=j.payer_account_id
 where j.id=journal and j.actor_user_id=actor and a.owner_user_id=actor and a.kind='consumer'and j.type in('transfer','merchant_payment','iou_payment');
 if not found then return jsonb_build_object('savingsHacks','[]'::jsonb);end if;v_source_account:=v_posted.payer_account_id;
 if p_payload?'budgetCategoryId'and p_payload->'budgetCategoryId'<>'null'::jsonb then
  v_category_id:=lumo_private.planning_uuid(p_payload,'budgetCategoryId');
  select * into v_budget from lumo_private.plans where owner_user_id=actor;
  select * into v_category from lumo_private.budget_categories c where c.id=v_category_id and c.owner_user_id=actor and c.active for update;
  if not found or v_budget.owner_user_id is null or v_category.period_start<>v_budget.period_start or v_category.period_end<>v_budget.period_end or current_date<v_budget.period_start or current_date>v_budget.period_end then raise exception 'INVALID_BUDGET_SOURCE';end if;
  select coalesce(sum(bs.amount),0)into v_spent from lumo_private.budget_spending bs where bs.category_id=v_category_id;
  if v_spent+v_posted.amount>v_category.amount then raise exception 'BUDGET_EXCEEDED';end if;
  insert into lumo_private.budget_spending(journal_id,category_id,amount)values(journal,v_category_id,v_posted.amount);
 end if;
 if exists(select 1 from lumo_private.recovery_plans where owner_user_id=actor and status='active')then return jsonb_build_object('budgetCategoryId',v_category_id,'savingsHacks',v_automatic,'hacksPausedForRecovery',true);end if;
 for v_rule_record in
  select h.*,b.account_id,b.goal from lumo_private.savings_hacks h join lumo_private.money_boxes b on b.id=h.box_id where h.owner_user_id=actor and h.enabled and b.owner_user_id=actor and b.status='active'order by h.created_at,h.id for update of h,b
 loop
  v_save_amount:=case v_rule_record.rule when 'roundup'then(v_rule_record.value-(v_posted.amount%v_rule_record.value))%v_rule_record.value when 'percent'then floor(v_posted.amount::numeric*v_rule_record.value/100)::bigint else v_rule_record.value end;
  select balance into v_box_balance from lumo_private.accounts where id=v_rule_record.account_id;
  v_save_amount:=least(v_save_amount,greatest(v_rule_record.goal-v_box_balance,0));
  if v_save_amount<=0 then continue;end if;
  select balance into v_available from lumo_private.accounts where id=v_source_account;
  v_planning:=lumo_private.plan_json(actor);v_left_unplanned:=(v_planning->>'leftAfterPlan')::bigint;
  if v_available<v_save_amount or v_left_unplanned<v_save_amount or v_box_balance+v_save_amount>10000000 then
   v_automatic:=v_automatic||jsonb_build_array(jsonb_build_object('boxId',v_rule_record.box_id,'amount',0,'skipped',true,'reason','PROTECT_AVAILABLE_FUNDS'));continue;
  end if;
  v_saving_journal:=lumo_private.post_money(actor,'box_save',v_save_amount,v_source_account,v_rule_record.account_id);
  insert into lumo_private.planning_postings(journal_id,box_id,rule_id)values(v_saving_journal,v_rule_record.box_id,v_rule_record.id);
  v_automatic:=v_automatic||jsonb_build_array(jsonb_build_object('boxId',v_rule_record.box_id,'amount',v_save_amount,'receiptId',v_saving_journal));
 end loop;
 return jsonb_build_object('budgetCategoryId',v_category_id,'savingsHacks',v_automatic,'hacksPausedForRecovery',false);
end $$;
revoke all on function lumo_private.planning_after_payment(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
