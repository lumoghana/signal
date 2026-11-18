# Lumo capability and release authority

This is the current entry point for the connected prototype and its active 2.14 backend/public-source export. User approval was received for the reviewed publication, excluding managed Auth fencing. Gateways lumo-approved 25, lumo-access 8 and lumo-admin 8 are live and exact-source verified; the complete active migration chain is 59. The public export omits the private F05 migration and its stage-only SQL fixtures, and both recovery flags remain false. Consumer/merchant Vercel production and Merchant Site 41/Admin Site 13 are published and identified in source-provenance.json. Active-only public source is published at runtime commit ebd0f684c8381b6d8dba98caa0c7db68dab6b6cb; GitHub Actions run 44254857611 succeeded, including all 8 synthetic browser journeys. The public acceptance receipt is verification/readiness-2.14.0/published-acceptance.json. Local source checks do not establish a real-money score. The scoped report is [READINESS-2.14.0.md](READINESS-2.14.0.md); historical records retain their stated date/version.

The 18 November review set targets of 9/10 prototype quality and at least 8/10 real-money readiness. Scores must follow completed acceptance, not be changed to meet a target. The published release repairs reproduced defects and improves assurance. The independent engineering estimates are 8.8/10 prototype quality and 4.7/10 real-money readiness; provider, identity, operating and installed-device evidence remain separate launch dependencies.

## Authoritative surfaces

| Surface | Implementation / authority | Current capability boundary |
| --- | --- | --- |
| Consumer web | `dist/`, approved/access/social/maintenance gateways | Shared test-money accounts; reviews, conditional Pause, PIN/device approval and original-request recovery. |
| Native Android | Separately delivered native source and original-certificate APK | Same consumer rules; a matching version/signature is required for each consumer release. |
| Merchant and cashier | `merchant-approved/`, approved merchant gateway, canonical journals | One business account, scoped shop totals/staff/counters; no independent merchant money ledger. |
| Loyalty | Merchant rules and private consumer account binding | Explicit consent, private one-use linking, progress/rewards, immutable net requests and refunds. Programme budgets are not reserved wallet money. |
| Admin | `admin-portal/`, admin/security/financial gateways | Invite-only roles and audited maker/checker. Safe revision controls are active SQL; candidate portal/gateway acceptance remains pending. Pilot MFA is still false, with one active operator and zero verified TOTP factors. |
| Saved-face recovery | Access gateway and private Python matcher | Actual camera input and encrypted comparison. Keyless recovery is the approved sandbox policy. F05 reconciliation/fencing is staged and disabled. Liveness, SMS and NIA are simulated. |
| External rails | Disclosed sandbox adapters | No actual bank/MoMo/NIA collection, settlement, verification or production provider callback acceptance is established. |
| Notifications | Scoped inbox/read/unread and foreground refresh | Background OS push is not implemented. Closed-app delivery must not be promised. |
| Schedules | Explicit stored personal-transfer mandate; separate foreground savings rules | Database worker authority must be proved from the saved mandate. Foreground savings are not an unattended calendar job. |

## Verification and promotion

Run the three application suites, the complete clean database bootstrap and transactional SQL fixtures, synthetic browser acceptance, face protocol/inference tests, and the separately delivered native build/model/framework checks. `.github/workflows/readiness-checks.yml` records the pinned automatic checks. A CI workflow in source is not proof that a particular hosted run passed.

```
npm ci --ignore-scripts --prefix backend
npm ci --ignore-scripts --prefix verification
npm test
npm test --prefix merchant-approved
npm test --prefix backend
node scripts/verify-clean-database.mjs
node scripts/verify-clean-database.mjs --fixtures
```

The SQL runner uses isolated PostgreSQL/WASM, synthetic Auth and no hosted URL or service credential. HTTP-context fixtures now create their own synthetic merchant/customer setup. This is not a hosted backup-restore or real Auth/provider acceptance test.

Before promotion, regenerate the public offline shell, inspect the actual source delta, reconcile only authorised asset hashes, verify exact edge bundles and the signed APK/download hashes, then update release provenance. Never update historical baselines to conceal a source difference. Keep QA fixtures, keys and credentials out of Git and all public assets. Keep APK bytes out of Git; an explicitly verified signed APK may be served only from the approved public download paths.

For real money, run `node scripts/check-live-readiness.mjs --evidence /absolute/private/evidence.json`. It fails unless every named launch gate has current, reviewable evidence bound to the exact release, source commit, signed APK SHA-256 and deployed backend bundle SHA-256. Each report must repeat all four values from the index; replacing either artifact invalidates the old report set. The example under `verification/launch-evidence.example.json` intentionally fails. It is not a score calculator or compliance approval.

Operational procedures and required acceptance evidence are in `docs/OPERATIONS-RUNBOOK.md`. Do not enable live-fund capability by relabelling simulated responses or disabling a failed gate.
