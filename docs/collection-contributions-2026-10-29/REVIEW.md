# Own-account collection contributions

Contribute uses the existing personal payment review, Pause, PIN and biometric demonstration. Confirmed Everyday debit and pot credit commit together once; pending reserves personal funds and target capacity, failed adds no group money. Exact member, collection account, amount, mandate and funds bind authorisation. Refunds follow accepted group rules and exact original-account linkage; arbitrary personal refund controls cannot mint money. Existing opt-in Savings Hacks retain their normal confirmed external-payment behavior.

Historical sample receipts stay unchanged. Organisers may separately record explicit other-member examples, which do not debit the local account. No real bank payment, cross-device invitation or biometric capture is transmitted. Bank-enforced settlement/mandates and closed-account refund routing remain production integration work.

## Verification

- Monochrome required edition parity/regression gate: 303/303 Node tests passed, exit 0.
- Hibiscus required contract/regression gate: 166/166 Node tests passed, exit 0; 9 contract checks passed.
- Everyday focused integration, account, Chat, Savings Hacks and collection suites: 79/79 Node tests passed, exit 0.
- Shared focused tests include 13 contribution-engine and 12 mounted contribution-UI checks. The shared UI acceptance runs in every edition and asserts the action comes before the mandate and, when present, Monochrome’s context panel.
- Nine independent mounted financial probes passed: full native Pause/hold/PIN and delayed settlement, biometric single-use approval, pending target capacity, cross-pot refund source binding, opted-in Savings Hack once, atomic rollback on quota failure, stale-review PIN clearing, proportional refund receipt and missing-collection recovery.
- Browser layout: 16 contribution states ×7 viewport/type configurations ×3 editions =336 checks. All passed without clipping, horizontal overflow, unreachable controls or setup errors. Pure-neutral/lime palette checked for Monochrome. Coverage includes role-ready/waiting states, entry, insufficient funds, long collection names, review, Pause, PIN, biometric demo, confirmed/pending/failed results and receipts; sizes include 320×568,375×667,390×844,390×480,568×320 and200% type at two phone widths.
- JavaScript syntax and git diff checks passed; frozen shared runtime hashes match across all three editions. Temporary dist/__ QA assets removed before packaging.

Commands:

```sh
# Monochrome
node scripts/check-edition-parity.cjs --regression --sequential --peer /workspace/sites/lumo-everyday-edition
# Hibiscus
node scripts/check-hibiscus-contract.cjs --regression --sequential --peer /workspace/sites/lumo-everyday-edition
# Shared focused flows
node --test --test-concurrency=1 tests/collection-contributions-engine.test.cjs tests/collection-contributions-ui.test.cjs
```

The original self-receipt fixture was replaced with native authenticated own contribution acceptance; isolated other-member fixtures preserve prior personal-ledger invariants and exact refund rounding. The review caught and corrected pending capacity, cross-pot refund linkage, a native Review-OR-Pause capture gap, duplicate entry projections and an edition-specific test assumption. No financial safeguard was removed. All example money and provider events remain local simulations.
