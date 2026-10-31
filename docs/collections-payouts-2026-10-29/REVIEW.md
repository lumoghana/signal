# Collection payouts

Collection payouts: Request, Approve, Release. Exact mandate-bound decisions, any-N-of-M declines, separate scoped PIN release, stable payout reference and per-attempt settlement, processing reservations, failed retry, immutable receipts, optional bounded local proof, and account-closure obligations. All activity and other member actions remain same-device samples; no bank payout or remote invitation is sent.

## Scope

- Request/review shows recipient, purpose, amount, fee, total, balance after payment, supporting proof and the accepted approval threshold. Typed recipient details are unverified sample data.
- Approvers see exact details and Approve/Decline. Contributors can follow the request, decisions, payment states and receipt.
- The organiser releases an approved request with a separately entered PIN. Back, backgrounding, stale details, account changes, expired reviews and changed funds invalidate release authority. Five incorrect PINs lock the account.
- Processing reserves funds until a result is known. Failed payouts show no paid debit; retries retain the visible reference and require new review/PIN. Each submission has a distinct attempt ID.
- Paid receipts preserve original amounts, decisions, evidence and confirmed remaining balance. The group ledger stays separate from Everyday money and Money Boxes.
- Supporting files are optional JPEG/PNG/PDF, up to 200 KiB and subject to the device preview storage budget. No external upload is sent.
- Organiser closure checklists include processing payouts and unspent group balances; invited members do not inherit organiser liabilities.

## Verification

- Monochrome required edition parity/regression gate: 278/278 Node tests passed, exit 0.
- Hibiscus required contract/regression gate: 141/141 Node tests passed, exit 0; 9 contract checks passed.
- Everyday focused shipped integration suite: 52/52 Node tests passed, exit 0.
- Each edition includes 23 payout-engine, 13 mounted payout-UI and 9 local-evidence tests. Additional existing mandate, role, split, account, Chat, planning and edition checks remain enabled.
- Browser layout: 19 payout cases across eight viewport/type configurations per edition (152 each; 456 total). No setup errors, horizontal overflow, clipping or unreachable/end-occluded controls were found. Configurations include 320×568, 375×667, 390×844, reduced keyboard height, 568×320 landscape, desktop shell and 200% text at two phone widths. Palette checks apply only to Monochrome.
- Native browser: optional 718-byte PDF selection preserved request fields; a 68-byte PNG proof downloaded with its correct signature. The organiser PIN/release, Processing, explicit sample-status check and Paid receipt journey were exercised with isolated sample data. Account closure, stale attempts, background recovery and no-group navigation are covered by mounted/engine regressions.
- Independent final review: no material unresolved findings. Corrections include immutable attempt matching, compact exact proof binding, closure obligations, read-only navigation and cleared PIN recovery after backgrounding.
- Syntax/diff checks passed. Shared runtime hashes match across all three editions. Source project IDs, saved namespaces, Home design, exact avatar and existing audiences were preserved.

Commands:

```sh
# Monochrome
node scripts/check-edition-parity.cjs --regression --sequential --peer /workspace/sites/lumo-everyday-edition
# Hibiscus
node scripts/check-hibiscus-contract.cjs --regression --sequential --peer /workspace/sites/lumo-everyday-edition
# Everyday
node --test --test-concurrency=1 tests/collection-payouts-engine.test.cjs tests/collection-payouts-ui.test.cjs tests/collection-evidence.test.cjs tests/collection-mandate.test.cjs tests/collection-roles.test.cjs tests/group-money.test.cjs tests/planning-finish.test.cjs tests/product-accounts.test.cjs tests/account-onboarding.test.cjs tests/chat-banking.test.cjs
```

The local layout harness is source-owned under Monochrome tests/manual-layout. Temporary dist/__ QA routes and the standalone rehearsal were removed before packaging. The historical group hero text assertion now matches the current account-balance label; Everyday Budget checks now assert labelled values instead of an obsolete figure order. No financial assertion was weakened.

## Limits

This is an interactive static prototype. Member decisions, group funding, recipient payout and provider results are explicit same-device simulations. No GCB or payment-provider integration is present. Real cross-device notifications, bank-enforced mandates, real biometrics, mobile Safari/Android downloads and live settlement require production implementation and device testing.
