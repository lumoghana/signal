# Lumo Admin contract

The admin portal is a separate staff application over the canonical Lumo backend. It does not create another ledger. Financial values are integer GHS pesewas and all current money is sandbox money.

## Trust and access

The Edge handler verifies the access token against Supabase Auth, binds actor and session from verified claims, and sends `actor`, `session`, and `aal` to the service-only `public.lumo_admin_service(p_command text, p_payload jsonb)` RPC. Client-supplied identity keys must never override these values.

The RPC independently checks the live `auth.sessions` record, user deletion/ban/anonymous status, active `admin_staff` membership, `aal2`, and a currently verified MFA factor. `session` allows `aal1` only to return staff enrolment state. Admin identities do not require and should not have consumer `lumo_pilot` metadata. Consumer signup never provisions staff.

All administrative tables are in the private schema with RLS and no client or service-role direct table grants. The public RPC is callable by service_role only. Sensitive reads and mutations are audited; audit records and internal case notes are append-only. No passwords, PINs, tokens, recovery codes, full identity documents, private chat bodies, or partner codes are returned.

Roles: support, supervisor, merchant_ops, finance, risk, technical, auditor, super_admin. Auditors cannot mutate. Only super_admin manages staff. Technical and merchant operations roles cannot access personal money plans. Financial reconciliation and approval decisions require designated financial/review roles. Operational controls require supervisor, technical, or super_admin. Permission checks are in the backend, not just the navigation.

## Envelope

Success: `{ "ok": true, "data": ... }`.

Failure: `{ "ok": false, "code": "MFA_REQUIRED", "message": "..." }`.

Lists accept `page` (default 1), `pageSize` (default 25, maximum 100), `q`, and applicable `status` filters. Lists return `data: { rows, total, page, pageSize }`. All row objects have an `id` and a useful `name` or `reference`; timestamps use `createdAt`.

Every `*.get` accepts `id` and includes `data.record` plus a typed alias such as `data.customer`, `data.transaction`, or `data.case`. Additional arrays provide related entities and a timeline of actual evidence. Missing telemetry is described explicitly, never reconstructed as a recorded event.

## Commands

| Command | Result and behaviour |
| --- | --- |
| session | `staff`, `requiresMfa`, `capabilities`, environment/currency |
| overview | `metrics`, `recentTransactions`, `attention`, `generatedAt`, limitations |
| search | `results` with type/id/title/subtitle/status, at least two query characters |
| customers.list/get | Masked identity, canonical balance, personal-account eligibility, account/device status, scoped product projection, related payments/cases/merchant roles |
| merchants.list/get | Owner, master balance, shops and totals since close, roles, shifts, counter metadata, links, closings, payments, cases, planning projection |
| transactions.list/get | Immutable ledger postings, balanced entries, original/refund relationship, payer/payee/shop, approved receipt attempts, generated inbox records |
| guest.list/get | Masked guest payment status, provider mode/reference, merchant/shop/request/link, original-source refunds; recovery secrets excluded |
| products.list/get | Whitelisted essentials, ledger-backed Money Boxes, IOUs, outside balances, Savings Hack history, group status/members, recovery and schedules |
| cases.list/get/create/update/note | Shared operations queue, internal notes, classification, priority, assignee, due date, linked customer/payment/merchant/guest/incident, resolution and reopen |
| incidents.list/get/create/update | Severity, owner, affected service, status, customer message, description and resolution; linked cases |
| reconciliation.list | Internal balance/entry mismatches, unbalanced postings, expired pending guest attempts, failed schedule occurrences |
| reports | Thirty-day ledger movements, type breakdown, support resolution metrics and recorded onboarding funnel |
| staff.directory | Minimal active colleague names/roles for case assignment; no email, tokens, or sessions. Available to all active MFA-verified staff through a separate service-only RPC |
| staff.list/invite/update | Invite-only enrolment, role/status, last-admin/self-change protections, disabled staff sessions revoked |
| audit.list | Append-only administrative reads and mutations with actor, entity, reason and before/after values |
| approvals.list/get/create/decide | Independent review for supported restrictions and financial review requests |
| services.list/update/schedule | Delegated to private availability service after staff and MFA checks |
| operations.list | Separate service-only event RPC, routed by the Edge handler after staff identity verification |

## Writes

`cases.create`: `subject`, `body`, `category`, `priority`, optional `customerId`, `merchantId`, `transactionId`, `guestId`, `incidentId`, `assigneeId`. Urgent/high/normal targets default to one/four/twenty-four hours. Categories: general/payment/account/merchant/refund/fraud/product/guest/technical.

`cases.update`: `id`, optional `revision`, `subject`, `status`, `priority`, `category`, `assigneeId`, `incidentId`, `resolution`, `reason`. Statuses: open/in_progress/waiting_customer/waiting_provider/escalated/resolved/closed. A resolution is mandatory before resolving or closing. Revision checks reject stale saves when supplied.

Case assignment accepts only active colleagues. A case already assigned to a colleague who later becomes disabled can still be resolved without changing that assignment. Reassigning requires an active colleague. The directory is separate from the super_admin-only staff-administration list.

`cases.note`: `id`, `body`, `kind` (internal/customer_update_draft/resolution). Draft updates are not emails or SMS; the portal does not send external messages.

Source reports are projected transactionally on writes from retained support_tickets, consumer account.supportCases, and merchant tickets. A one-time backfill handles existing reports. Admin reads do not scan every customer state or merchant document to import support data. Unrelated product saves skip the projection; repeated source updates cannot duplicate cases or overwrite an assigned administrative status. Portal status/resolution updates synchronise back to their source. Consumer and merchant aggregate updates take row locks and increment revisions, preserving concurrent-update protection. Private internal notes are not sent to source apps.

`incidents.create`: `name` or `title`, `description`, `severity`, optional `serviceId`, `customerMessage`, `ownerId`. `incidents.update`: `id`, optional `revision`, status/severity/description/customerMessage/ownerId/resolution. Resolution is mandatory for status resolved.

`approvals.create`: `action`, `entityId`, `caseId`, `reason`. Actions: account.suspend, account.restore, session.revoke, payment_link.disable, payment.refund.

`approvals.decide`: `id`, `decision` (approve/reject), `reason`. Requester and reviewer must differ. Account/session/link changes execute only through explicitly implemented server-side operations. Account suspension revokes Auth sessions and preserves balances/history. Counter capabilities are tied to live shared Auth sessions. Refund approval becomes `approved_pending_execution` and explicitly reports `moneyMoved:false`; it does not credit a wallet or claim a refund completed. Finance must use the original merchant refund workflow and retain confirmed evidence.

## Staff setup

Only hashes of high-entropy invitation tokens are stored. Initial bootstrap has no prebound email; it works only while no active super_admin exists. Subsequent invitations are bound to email, name, role and a 24-hour expiry.

`setup.reserve` accepts tokenHash/email/name and atomically binds the email. `setup.complete` additionally accepts userId and verifies that the confirmed Auth identity matches that email. The Edge handler must first authenticate that identity; email alone is not proof. Completion creates staff membership, consumes the token, and requires MFA enrolment. Replaying the same consumed token for the same user is idempotent; another identity is rejected.

`staff.invite` accepts tokenHash/email/name/role after super_admin authentication. The Edge handler returns the raw invitation link only to the requesting administrator; it is never written to audit or source code. No invitation email is automatically sent.

## Exact consumer summary

The service-only `public.lumo_admin_summary(p_payload jsonb)` validates the same live staff/session/MFA and personal-plan permissions as products.get, audits customer.summary, and returns `data.snapshot` from the existing read-only `lumo_private.approved_load(customerId)`. The Edge must consume this input internally using the same `buildState(snapshot)` and `getSummary(state)` functions as the consumer experience, then return an explicit numeric/date summary projection. The raw snapshot is never a browser response. Technical and merchant_ops roles are denied this server input. The summary does not run automatic savings or mutate money.

## Current evidence limits

No live bank, MoMo, NIA/SMS, external settlement, or statement feed is connected. Settlement and identity success must not be inferred from sandbox outcomes. Client app version, audio playback delivery, Pause triggers and Lux answer telemetry are not established by existing records. Internal balance reconciliation is real; external reconciliation is unavailable until provider integration exists. Product `availableMoney` equals canonical Everyday ledger balance, as in the consumer summary. `plannedRemaining` is the sum of unspent essentials only; the contract does not pretend that this alone is final left-after-plan, which also considers dated IOU obligations and the keep-back buffer.

## Verification

`backend/tests/admin-staff-directory.test.sql` passed eight hosted PostgreSQL assertions inside BEGIN/ROLLBACK: minimal directory visibility for support, MFA, RPC grants, active assignment, disabled-colleague filtering, rejection of new disabled assignments, legacy case resolution, and audit.

`backend/tests/admin-source-projection.test.sql` verifies immediate source projection, resolution synchronisation, no duplicates/recursive cases, malformed historical timestamp handling, absence of read-time scans, trusted summary access controls, and no money movement. This migration and test passed 21 hosted PostgreSQL assertions inside BEGIN/ROLLBACK.

`backend/tests/admin-core.test.sql` creates synthetic fixture identities inside BEGIN/ROLLBACK and covers role/MFA/session enforcement, every principal read model, source ticket import/status synchronisation, transaction-reference lookup, independent approvals, no fake refund execution, invitation reservation/idempotency, sensitive projections and append-only audit.
