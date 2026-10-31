# Two Lumo editions, one feature contract

| Edition | Project | URL | Demo storage |
|---|---|---|---|
| Everyday | `appgprj_6ad67bef448c8191a629d9168df0c804` | https://lumo-everyday-edition.oness15.chatgpt.site | `lumo-everyday-edition-v1` |
| Minna | `appgprj_6adb132dc840819199654cb9e526ecd4` | https://lumo-minna-edition.oness15.chatgpt.site | `lumo-minna-edition-v1` |

Minna was created through the new-project workflow from Everyday version 19, source `b951f6d15263042d63dd7efcbd2d307cccee4868`. Everyday remains a separate project. Its original published source is the approved initial feature baseline. Minna was created private; both sites are currently public according to the Sites access read on 23 October 2026. Preserve the current settings returned for each project at publication.

## Boundaries

The 43 original scripts and the appended shared chat-banking.js module carry the shared feature behavior in both editions. Only the storage-key literal in `core.js` differs between copies. The Minna presentation adapter loads last; edition CSS may differ. The manifest in `config/editions.json` records project identities, baseline SHA-256 values, route inventory and the allowed presentation adapter.

The shared engine remains authoritative for actual funds, pending holds, budget fulfilment, projections and Chat. Some original modules mix rendering and behavior; preserving every original module avoids losing less visible functionality while changing the presentation. Keep any future logic shared or explicitly ported and tested in both independent checkouts.

Browser data is independent. Each edition starts with its own fresh state and offers its own bundled sample. Neither edition reads historical keys or copies another edition's records. The schema migration operates only on the state loaded from its own key. Do not add cross-edition fallback keys, storage events that synchronize balances, or automatic migration from Everyday into Minna.

The complete feature contract includes onboarding and identity review; demo Mobile Money and GIP funding; operational and savings accounts; Budget setup and edits; source-of-funds linking and optional categorisation; Money Boxes and optional partner protection/support recovery; transfers and requests; Campus Pay with QR camera/photo decoding and manual code fallback; bills and top-ups with network lookup; Pause and separate authorisation; PIN and simulated biometrics; Chat and calculations; activity, receipts, help, profile, merchant simulation and pending/failure/recovery states. No edition has live banking, verification or payment connections.

## Small workflow for future features

1. Record the requested behavior and acceptance examples once. Decide whether it changes shared behavior or only one edition's presentation.
2. For a shared feature, make a checkpoint in each checkout. Implement the same behavior in both; keep their presentation adapters separate. Explicitly select the correct project before any publication.
3. Run both editions' existing behavior suites plus the edition parity check. Compare the shared scripts and numerical snapshots with `--peer` when both checkouts are available. Investigate differences before updating the manifest.
4. For an approved shared change, update the manifest's feature baseline and hashes after both copies pass. Preserve each storage namespace. Commit and publish each project independently; record both published versions. A parity manifest cannot automatically deploy or maintain another project.

For a visual-only change, the pinned shared hashes should remain unchanged. The checker intentionally does not pin CSS counts, screen markup or illustration placement.

## Current financial fixture

The current product has **two funded accounts**, unlike the older virtual goal-allocation model. The fixture is GH₵500 operational, GH₵100 savings, GH₵350 remaining Budget, and GH₵150 left after Budget. The combined account total is GH₵600. Savings has already left the operational account and must not be deducted a second time.

| Scenario | Operational after | Savings | Budget remaining | Left after Budget | Budget gap |
|---|---:|---:|---:|---:|---:|
| Extra GH₵80 | GH₵420 | GH₵100 | GH₵350 | GH₵70 | GH₵0 |
| Extra GH₵140 | GH₵360 | GH₵100 | GH₵350 | GH₵10 | GH₵0 |
| Extra GH₵280 | GH₵220 | GH₵100 | GH₵350 | GH₵0 | GH₵130 |
| GH₵80 linked to Food | GH₵420 | GH₵100 | GH₵270 | GH₵150 | GH₵0 |

The existing Pause policy interrupts the GH₵280 fixture; the other three continue through review without inventing a new warning threshold. Preview, Chat and confirmed ledger must agree. A scan never pays. A projection never mutates actual balances. Pending and failed outcomes must remain distinct. Partner approval and customer authentication remain separate.

## Checks and their limits

`node scripts/check-edition-parity.cjs --regression` runs the nine edition contract checks plus the current feature regression files recorded in the manifest. `node --test tests/edition-parity.test.cjs` runs the contract alone. These check the manifest, actual shipped scripts and views, storage isolation, financial scenarios, separate authorisation, duplicate prevention, pending/failure handling, QR and protected Money Box withdrawal. Add `--peer /path/to/lumo-everyday-edition` to compare the peer against the same pinned baseline and the resulting numerical snapshots. Without a peer checkout, the baseline and local expected results are still checked, and the peer comparison is explicitly reported as skipped.

The verified focused run passes **299 named checks in 23 current regression files, plus nine edition contract checks**. The new Chat banking checks cover the intentional full-screen exception: all five navigation destinations remain available elsewhere; Chat uses its own Home/Actions header and hides the bottom menu. Older navigation palette and always-visible-menu snapshots are historical. The historical blanket glob has 13 failures even on the unchanged Everyday source, involving older route counts, wording or presentation snapshots; it is not the current acceptance command. The approved Chat feature change updates the current route/navigation contract explicitly; older visual snapshots remain historical.

The small DOM harness loads the real index script order. It is a behavioral check rather than a browser layout engine. Phone geometry, focus visibility, virtual keyboards, font rendering, camera permissions on a real device, reduced-motion presentation and touch quality require browser/device verification. Demo biometric approval is a prototype interaction, not native biometric authentication.
