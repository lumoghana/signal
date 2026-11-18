# Lumo Admin

Staff operations frontend: https://lumo-admin-operations.oness15.chatgpt.site

Start with [READINESS.md](../READINESS.md) for the current 2.14.0 readiness candidate, its capability limits and promotion checks. Prepared source and passing tests do not mean a candidate has been published. The canonical portal retains its custom hosting audience and reads the shared Lumo backend. It has no separate wallet, local financial store, demo dataset or public staff registration.

## Access and current MFA policy

The 18 November 2026 review found one active staff account, no verified TOTP authenticators and database MFA enforcement disabled in the current pilot. The initial-owner invitation is not pending. Password-only access is therefore an existing pilot exception; the presence of authenticator controls does not prove that operational requests universally require MFA.

Every operational request revalidates the Auth user, current session and active staff membership. The database and Edge gateway enforce roles and the current MFA policy. Staff invitations are email-bound, random, hashed, expiring and single-use. Staff sessions stay in memory, and the workspace locks after inactivity.

Enrol and verify staff authenticators before enabling enforcement. The candidate checks actual enrolment and policy revision before allowing a rollout. Production policy requires MFA and two verified access administrators, with a governed lost-factor procedure. The existing pilot exception must not be described as production readiness.

Hosting access and application staff permissions are separate controls. Invite named colleagues to both where required; a staff invitation does not make hosting public. Keep the canonical custom audience. Do not create a public bootstrap endpoint or weaken authentication to simplify access.

## Operations and staged recovery

Customer, merchant, guest and payment investigations link to cases, incidents and independently approved actions. Money explanations use approved consumer calculations. Plans, Money Boxes, group funds, expected IOUs and outside-money balances retain their distinct accounting.

Manual off takes priority over automatic recovery. Scheduled maintenance and network-specific controls stop new attempts in the database as well as the apps. Pending outcomes, original-reference payment recovery, reversals and refunds retain their original request identity. Current automatic checks cover shared test services; provider-specific health monitoring still needs connected MoMo/bank adapters.

The F05 Auth-write fence and original-reset resolution queue are excluded from this release. The gateway defaults recovery-resolution controls to unavailable, and the portal shows that staged state. Staff must keep the original reset reference and use the existing support process. The portal does not promise automated resolution, cancellation of an uncertain Auth write or a replacement password write. This queue is separate from normal account recovery and payment-outcome recovery.

The portal never edits balances or deletes ledger entries. Refund authorisation records an approval pending execution through the original merchant workflow; it does not claim that money moved. Private chats, PINs, passwords, session credentials, partner codes and identity documents are not exposed.

## Source and verification

The standalone frontend has its own Sites source repository. This directory mirrors reviewed application files for repository handover and does not carry the Site's deployment identity. Keep the Site manifest and custom audience in its canonical checkout. Backend contracts are in [ADMIN-CONTRACT.md](../backend/ADMIN-CONTRACT.md); migrations and tests are under `backend/`. Current procedures and acceptance gates are in [OPERATIONS-RUNBOOK.md](../docs/OPERATIONS-RUNBOOK.md).

Current candidate evidence includes focused approval, financial, security and shared recovery-policy tests. Source tests and synthetic fixtures do not establish signed-in hosted MFA acceptance, installed-device behavior or live provider acceptance. Follow the current readiness evidence and exact release provenance rather than historical totals.

### Historical 2.11.0 verification only

The 2.11.0 handover preserved consumer 2.10.6 payment journeys and recorded 1,611 consumer tests, 233 backend tests, 611 merchant tests, 89 named PostgreSQL assertions plus the availability transaction suite, 63 native Java suites and 172 Android framework cases. Those counts describe that historical release only. Its PostgreSQL fixtures rolled back and its browser checks used an isolated synthetic fixture; they did not establish current hosted MFA or live payment-provider acceptance.
