# Lumo connected backend

Read [the current capability matrix](../READINESS.md) before changing or rebuilding the app. The 2.14.0 readiness candidate preserves simulated bank/MoMo/NIA/liveness boundaries; candidate implementation is not proof of publication or real-money acceptance.

## Current entry points

| Gateway | Authority |
| --- | --- |
| lumo-approved | Personal account snapshots, canonical test-money payments, groups/boxes/partners and shared merchant/loyalty services. |
| lumo-access | Consented encrypted saved-face capture/comparison and bounded credential recovery. Keyless recovery is restricted to the approved prototype; genuine liveness is not established. |
| lumo-admin | Invite-only staff roles, current-state/idempotent proposals, cases, financial review and governed recovery operations. MFA enforcement is deployment policy with an enrolment/readiness gate. |
| lumo-maintenance / lumo-social / lumo-business | Scoped record-maintenance, friends/group/inbox and merchant planning services. |
| lumo_rpc and guarded service RPCs | Canonical database operations and compatible legacy callers. They are not permission to trust client success flags or local wallet balances. |

The consumer website uses a same-origin HttpOnly session boundary in the candidate; native Android retains its platform-protected direct transport. The merchant/cashier application hydrates the same canonical journals and does not maintain a second money ledger. Native source and original-certificate APK are delivered separately.

Canonical amounts are integer pesewas. Expected IOUs, Money Boxes and group funds are distinct from personal available money. Successful and terminal declined request references retain their original financial outcome. PIN correction, transient conflicts and unknown responses have separate recovery rules. Fixed request expiry/amount/shop/payer checks apply at canonical write, including legacy routes.

## Database and tests

All deployed baseline migrations, including the five previously absent definitions, are restored in supabase/migrations with their recorded identities. New changes must use a new migration and preserve the old history. A clean bootstrap executes the complete chain, not a cherry-picked fixture subset.

```
npm ci --ignore-scripts
npm test
npm run check
cd ..
npm ci --ignore-scripts --prefix verification
node scripts/verify-clean-database.mjs
node scripts/verify-clean-database.mjs --fixtures
```

The verifier runs isolated PostgreSQL with synthetic Auth. It never reads a hosted credential/URL. Fixture setup uses current personal/merchant enrollment and required Auth fields; HTTP-context SQL chunks seed actual synthetic gateway/merchant flows instead of depending on a developer's private QA session. Native toolchain, face inference and browser checks are additional release evidence.

For hosted changes, read current project metadata and review migrations before applying them. Retain previous executable bundles, use additive compatible rollout, check exact imported source closure and verify the live schema/ledger afterward. Managed-Auth write fences require independent order/COMMIT and rollback review. Never silently target another project, edit balances or delete journal/audit records.

## Operating boundaries

No live bank, MoMo, NIA, SMS, external settlement or OS background push is implied. Foreground Money Box processing is separate from explicit stored transfer mandates. Simulated provider lookup is not customer verification. A programme budget is not a reserved merchant wallet balance.

Operational procedures, restore objectives, evidence requirements and acceptance journeys are in [the operating runbook](../docs/OPERATIONS-RUNBOOK.md). [The historical 2.6.0 notes](LEGACY-2.6.0-NOTES.md) remain available for context and must not override current contracts.
