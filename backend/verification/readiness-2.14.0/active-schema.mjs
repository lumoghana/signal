import assert from 'node:assert/strict';

export const activeMigrationCount=59;
export const excludedPrivateFence='20261118050029_recovery_reconciliation_and_biometric_retention.sql';

/** Public release proof: bootstrap the complete active schema without private
 * unapplied Auth DDL. This is a read-only assertion after isolated bootstrap. */
export async function assertActiveSchema(db,applied){
 assert.equal(applied.length,activeMigrationCount,'Public source must rebuild all59 active migrations.');
 assert.equal(applied.includes(excludedPrivateFence),false,'Private unapplied Auth fence must not be installed.');
 const result=await db.query(`select
  exists(select 1 from information_schema.columns where table_schema='lumo_private' and table_name='access_prototype_reset_executions' and column_name='requires_auth_marker') as marker,
  exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='auth' and c.relname='users' and t.tgname='lumo_fence_reset_auth_write') as auth_trigger,
  to_regprocedure('lumo_private.fence_reset_auth_write()') is not null as fence_helper,
  to_regprocedure('lumo_private.access_reconcile_applied_reset(uuid,text)') is not null as reconcile_helper,
  to_regprocedure('lumo_private.access_cancel_pending_reset(uuid,text)') is not null as cancel_helper`);
 assert.deepEqual(result.rows[0],{marker:false,auth_trigger:false,fence_helper:false,reconcile_helper:false,cancel_helper:false},'Excluded Auth fence schema/helper unexpectedly present.');
 return {profile:'active59-public',migrations:applied.length,privateAuthFenceInstalled:false,legacyResetProtocol:true};
}
