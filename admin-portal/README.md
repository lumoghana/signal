# Lumo Admin

Staff operations frontend: https://lumo-admin-operations.oness15.chatgpt.site

This application reads the canonical shared Lumo backend. It has no separate wallet, local financial store, demo dataset, or public staff registration. The deployed portal is private. Its initial owner invitation is pending explicit authorisation; no live test administrator was created.

## Access

Staff invitations are email-bound, random, hashed, expiring and single-use. Account setup requires the holder's own password and authenticator enrolment. Every operational request revalidates the Auth user, current session, active staff membership and MFA. Roles are enforced in the database and Edge gateway. Staff sessions stay in memory and the workspace locks after inactivity.

The private hosting audience and application staff permissions are separate controls. Invite named colleagues to both where required; a staff invitation does not make the hosting public. Do not disable MFA or create a public bootstrap endpoint to simplify access.

## Operations

Customer, merchant, guest and payment investigations link to cases, incidents and independently approved actions. Money explanations use the approved consumer domain calculations. Plans, Money Boxes, group funds, expected IOUs and outside balances retain their distinct accounting.

Manual off takes priority over automatic recovery. Scheduled maintenance and network-specific controls stop new attempts in the database as well as the apps. Pending outcomes, original-reference recovery, reversals and refunds remain reachable. Current automatic checks cover the shared test gateway/persistence; real provider-specific health monitoring awaits connected MoMo/bank adapters.

The portal never edits balances or deletes ledger entries. Refund authorisation records an approval pending execution through the original merchant refund workflow; it does not claim that money moved. Private chats, PINs, passwords, session credentials, partner codes and identity documents are not exposed.

## Source and verification

The standalone frontend has its own Sites source repository. This directory mirrors its application files for Signal handover; it does not carry the Site's deployment identity. Backend contracts are in `backend/ADMIN-CONTRACT.md`; migrations and tests are under `backend/`.

Release 2.11.0 preserves consumer 2.10.6 payment journeys. Validation: 1,611 consumer tests, 233 backend tests, 611 merchant tests, 89 named PostgreSQL assertions plus the availability transaction suite, 63 native Java suites and 172 Android framework cases. PostgreSQL fixtures roll back. Browser workflow checks used an isolated synthetic fixture without production credentials or staff grants. Signed-in live MFA verification awaits the authorised first account. Physical Android hardware and live payment-provider acceptance remain unverified.
