# Legacy test-account PIN repair

Earlier registration could resume an existing account, accept a newly chosen PIN in the form, and leave its previous server PIN unchanged. Repeating completed registration now returns `EXISTING_ACCOUNT` and directs the person to sign in. Fresh account setup accepts and preserves the chosen four-digit PIN, including a leading zero.

An authenticated earlier test account can check `pinRepairStatus` and, if eligible, submit `repairTestPin` with its current sign-in password and a new four-digit PIN. This is a one-time test-account migration, not production PIN recovery. Accounts created by the approved gateway and closed or restricted accounts are ineligible.

The gateway verifies the current password for the trusted signed-in account. A service-only database operation checks the live original session, a fresh same-owner password session, a two-minute bound attempt, and an account rate limit of five attempts per fifteen minutes. The atomic commit replaces the PIN hash, records its one-time marker and notification, and revokes previous device approval keys and outstanding challenges. The temporary password session is signed out afterward. Ordinary PIN changes continue to require the current PIN.

The existing Security and PIN sheets expose repair only after an owner-bound eligibility response. Password and PIN values remain transient and never enter the financial request journal. Opening repair cancels the original transaction; successful repair cannot authorize it. A lost response is checked through repair status and the same newly chosen PIN rather than a blind reset retry.

The applied migration is `20261113093402_lumo_legacy_test_pin_repair.sql`. The public `lumo_approved_pin_repair` RPC is executable only by the server-held service role. Anonymous and authenticated clients cannot call it directly or supply another account or proof session.

Release checks: 1,355 consumer web tests, 98 backend tests, and 38 rollback database checks. The database checks use synthetic records and force deferred constraints before rollback. Actual HTTP verification is recorded separately in `verification/approved-pin-repair-live.json`. No existing user's PIN is changed by deployment; the person must submit their own repair form.
