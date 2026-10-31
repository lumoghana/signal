# Lumo whole-product release review · 27 October 2026

Status: **Review complete; all checks passed.** Publication is a separate operation; this is source and review evidence, not a publication receipt.

## Implemented work

| Area | Finished behavior |
| --- | --- |
| Onboarding, account and support | Existing-account Welcome actions, in-place sign-in lock timer, one native submit path, precise invalid-field focus, authenticated exports, truthful report status and preserved sample warnings. Hibiscus retains its own Welcome scene. |
| Home, Story and Chat | Original saved answers reopen from history; timing fields follow their toggles; private updates retain neutral event types; aliases share learning; unavailable context has a working recovery. |
| Budget, Money Boxes and groups | Recoverable drafts, precise validation, role-aware empty states, compact Savings Hack facts, return to the edited box and correct native Back to Budget. |
| Payments, QR and cards | Guarded fresh retry, truthful pending/delivery states, two-step requests, complete scoped card history and explicit Keep/Replace after a scan. |
| Shared presentation | Accessible headings, artwork and subtitles retained; exact visible title echoes removed; permanent descriptions survive error correction; Home privacy geometry remains stable at 200% text. |

Edition identities, storage namespaces, fonts, illustrations, palettes and adapters remain separate. Financial engines, transaction authentication, timed Pause, card holds/settlement, Savings Hack safeguards and collection mandates remain authoritative.

## Functional results

| Final check | Result |
| --- | --- |
| Everyday complete approved regression list | **84 files, 88 Node checks passed**, zero failures. Exact command arguments and test hashes: `02-04-00-290Z-everyday-final-regression`. |
| `node scripts/check-edition-parity.cjs --regression --sequential --peer /workspace/sites/lumo-everyday-edition` in Minna | **9 contract checks + 84 files / 88 Node checks passed**, zero failures. `02-07-45-250Z-minna-final-gate-canonical`. |
| `node scripts/check-hibiscus-contract.cjs --regression --sequential --peer /workspace/sites/lumo-everyday-edition` in Hibiscus | **9 contract checks + 85 files / 96 Node checks passed**, zero failures. `02-19-18-324Z-hibiscus-final-gate-current-ui`. |
| `node tests/manual-layout/build-review-inventory.cjs` | **188 routes × 2 visits × 3 editions = 1,128 prepared fixtures**, zero fixture errors or unavailable populated contexts. Two valid shared review forwards per edition remain explicit. `02-25-09-108Z-final-valid-context-inventory`. |
| Final native Budget recovery | **6/6 browser proofs passed**, from Home and Plan in every edition; actual route and native history both Plan, no active task, unchanged funds and no errors. Final helper includes the maintainer comment. |

All three final full runs retained stable source and test-file hashes. Both peer gates preserve their original regression lists and append all five finishing suites. Exact commands, complete output and before/after pins are in [gate-summary.json](gate-summary.json) and [test-runs](test-runs/).

Earlier failures remain recorded. The original Ghana Card/PIN sample warning was restored. Approved retained assertions now use actual native form submission, the current pending-status flow, current sign-in/update labels, the actual Money Story category action and intended recovery destinations. Authentication, financial, identity, draft and parent-context assertions remain. A Minna metadata normalization error was corrected to its existing checker convention without changing app source or the checker assertion.

## Visual and layout results

| Sweep | Passed layouts |
| --- | ---: |
| 295 cases × 8 settings × 3 editions | 7,080 |
| Standard and long values at 200% text | 1,206 |
| Dedicated Home privacy, 10 settings per fixture | 180 |
| **Total** | **8,466** |

All nine reports have zero findings and setup errors; all **60/60 shown/hidden privacy pairs** are stable. Exact DOM evidence: [final-layout-evidence.json](final-layout-evidence.json). The earlier failed privacy evidence remains in [layout-evidence-before-privacy-fix.json](layout-evidence-before-privacy-fix.json).

These reports use the exact final product-finish JS/CSS and precede only the final action-only Budget recovery callback/comment. No rendered DOM or CSS changed after the reports. The final callback is separately verified by 10 focused checks, 18 retained history checks and six native browser proofs; full functional runs use the final source. The reports do not claim identical final index/cache bytes.

Every domain signed off its changed native contexts across all editions. The final six populated category-selection/saved-notice screens passed with no fallback, overflow or fixture error. Their honest missing-record recovery states remain separately classified in [inventory.md](inventory.md).

## Source and release boundary

[release-source-pins.json](release-source-pins.json) records final local source hashes and exact shipped order. [cleanup-verification.json](cleanup-verification.json) confirms all temporary QA files and mirrors were removed: no `dist` path begins with `__`, and no index references QA runtime assets. Source fingerprints were unchanged after cleanup. Retained QA source and evidence stay outside `dist`.

This is an interactive financial prototype. Money movements, approvals, identity, support delivery and provider outcomes are labelled samples. These checks do not establish a live bank backend, physical camera compatibility, real biometric security or production mandate enforcement.
