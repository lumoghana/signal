-- Read-only aggregate checks immediately after migration and before v2 clients ship.
-- Expected from the preflight on 2026-11-15: active_friends=2, removed_friends=0,
-- active_revision_sum=2, active_groups=2, and every violation counter below is zero.
select
 (select count(*) from lumo_private.social_friends where not removed) as active_friends,
 (select count(*) from lumo_private.social_friends where removed) as removed_friends,
 (select coalesce(sum(revision),0) from lumo_private.social_friends where not removed) as active_revision_sum,
 (select count(*) from lumo_private.social_friend_groups where not deleted) as active_groups,
 (select count(*) from lumo_private.social_friends f left join lumo_private.social_friend_groups g on g.owner_id=f.owner_id and g.id=f.group_id
  where not f.removed and (g.id is null or g.deleted or g.name<>f.list_name)) as unmapped_or_changed_assignments,
 (select count(*) from lumo_private.social_friend_groups g where not g.deleted and not exists(select 1 from lumo_private.social_friends f where f.owner_id=g.owner_id and f.group_id=g.id and not f.removed)) as unused_backfilled_groups,
 (select count(*) from lumo_private.social_friend_groups g left join lumo_private.social_legacy_group_labels ll on ll.owner_id=g.owner_id and ll.group_id=g.id and ll.label=g.name where not g.deleted and ll.group_id is null) as missing_original_legacy_bindings;
