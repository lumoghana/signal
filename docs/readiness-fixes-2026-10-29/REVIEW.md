# Lumo review repairs · 29 October 2026

This release repairs the 19 reproduced defects in the Monochrome v8 review (opened source `90f44a942e5e865cdb2ebe823b4070c5ee08581e`). Shared functional fixes are synchronized to the independent Everyday and Hibiscus sites. Their storage keys, hosting identities, appearance and navigation remain separate. The supplied avatar and clean Monochrome Home are preserved.

## Defect resolution

| ID | Original failure | Implemented behavior | Regression evidence |
| --- | --- | --- | --- |
| R01 | Payment result preceded automatic saving | Payment, saving transfers, source attribution and final Budget snapshot commit together; historical results stay fixed | plan-savings-readiness; payment-budget-result |
| R02 | Natural runway question became spending history | Questions reach the supported daily Budget guide and state its limits | chat-readiness |
| R03 | Savings period/deadline lost its measure or scope | Confirmed additions, withdrawals and net change are separate; named boxes and exact periods retain scope; goals show required pace, not an invented forecast | chat-readiness |
| R04 | Old analytical answers looked current | Exact checked time/window and relevant-source freshness identify historical answers; refresh preserves the original answer and unsent question | chat-readiness |
| R05 | Collect and receipt made duplicate split records | One canonical split entry discovers both current and retained earlier records; stale review cannot duplicate a source | collection-readiness-fixes; shared-expenses |
| R06 | Refund wording denied actual own-source credit | Review and execution share proportional allocation; exact customer return is stated | collection-readiness-fixes |
| R07 | Incoming example taught earlier manual release | New examples use explicit sample organiser authorization and automatic submission at the accepted quorum; actual earlier records retain compatibility | collection-readiness-fixes; collection-payout-rails |
| R08 | New payment rail replaced a kept draft | Native keep/replace choice binds the exact account/draft and executes once across rails, requests, bills, QR and cards | payments-readiness |
| R09 | Switching pots replaced a contribution draft | Contribution, payout and retry entries share explicit keep/replace protection | collection-readiness-fixes |
| R10 | Signed-out saved support reports were exposed | Saved private reads and mutations require sign-in; public help creates only an exportable unsent note | account-readiness-fixes |
| R11 | Closed+locked navigation looped before sign-in | Authentication precedes retained-record routing; Back/Forward follows the same boundary | account-readiness-fixes |
| R12 | Editing reset PIN guesses | Personal, card, Money Box and group flows share five valid wrong attempts and a persisted 60-second cooldown | auth-policy; payments-readiness; money-box-protection-readiness; collection-payout-rails-engine |
| R13 | An older tab overwrote newer progress | Core revision checking rejects stale snapshots; supported browsers hold one conditional Web Lock writer; explicit recovery never silently reloads a draft | persistence-readiness |
| R14 | A failed save still produced payment success | Financial transactions stage the complete change, persist once and roll back on failure, including nested errors; retry requires explicit recovery and review | persistence-readiness; payments-readiness; collection-readiness-fixes; plan-savings-readiness |
| R15 | Future Budget started immediately | Future start is rejected again at confirmation and remains a draft; current/past start explicitly applies now | plan-savings-readiness |
| R16 | Completed Hack falsely said resumed | Target-complete instructions offer Edit target and report the returned final state | plan-savings-readiness |
| R17 | Chat included archived/deleted boxes | Active-count convention matches Home; completed active boxes remain included | chat-readiness |
| R18 | Fresh linked-identity recovery dead-ended | Honest external-account recovery example and downloadable summary provide a path without fabricating remote records | account-readiness-fixes |
| R19 | Closed account offered dead money actions | Explicit closed state exposes authenticated records, export, help and sign-out | account-readiness-fixes |

## Further fixes found while repairing the journeys

- Ordinary refunds, incoming bank/request credits, card lifecycle actions, pending settlement, proportional collection refunds and final approval/dispatch now commit their linked records together. Failed attempts retain the original reference and do not silently retry.
- Savings Hack rules, due checks, source-event consumption and goal/optional-hack/partner setup are transactional. Offline checks precede schedule consumption. Received refunds never silently move saved money back.
- Cards can return available money, close with a return, or be replaced by an empty card. Pending activity blocks closure. Historical records remain available; later refunds to a closed card return to Everyday money once.
- Shared exports include sanitized, owned Chat/group/savings/protection history and exclude PINs, codes, authentication data, draft identifiers and file bytes. Anonymous support handoff never claims delivery.
- Recovery dialogs preserve the unfinished task, own keyboard focus and avoid the earlier QR Escape conflict. Corrupt snapshots remain intact until an explicit reset.
- Optional named costs sit beneath simple Budget categories. Dated goals show honest required daily/weekly amounts. A secondary Savings Hacks overview keeps Home uncluttered.
- Chat history is bounded and searchable. Story questions return to the retained conversation with their original scope. A named-box period question cannot silently use all boxes.
- The setup Pause uses facts the shipping engine actually calculates: GH₵600 available, GH₵280 shoes and GH₵350 planned food leave a GH₵30 shortfall. It retains the supplied avatar, immediate setup choices and unchanged live Pause timing/authentication.
- Receipts can share through supported native share UI or download accessible printable HTML. QR keeps camera/file/manual-code entry and adds Find a Lumo person.
- Dark Home controls now have a visible inverse/lime keyboard focus outline.

## Platform and build boundary

Monochrome's 106 original JavaScript modules and 80 stylesheets are delivered as one ordered script and one ordered stylesheet. Original sources and hashes remain in the repository and public registry. Selective tests verify the registry before expanding sources; full-entry tests execute the actual generated bundle. `node scripts/build-release.cjs` rebuilds and pins final HTML; `--check` rejects stale generated artifacts.

The integrity-checked offline cache holds public app assets only, including each edition's actual referenced fonts. It never queues a payment or caches account/API responses. Reconnection must validate the app origin before clearing the cached-offline guard; it never repeats a financial action. Updates require an explicit reload and defer while unfinished work or persistence recovery is active.

The Web Lock protects writers where supported. The revision fallback rejects observed stale snapshots; it is not a cross-device transactional database. All sample state remains browser-local.

## Release verification

The required release commands are:

```text
node scripts/build-release.cjs --check
node scripts/check-edition-parity.cjs --regression --sequential
```

Everyday runs the complete shared required test list plus its own presentation and avatar tests against its actual bundle. Hibiscus runs its identity, source/parity, isolation, native navigation and financial contract plus its complete required regression list. Tests retain edition-specific assertions rather than copying Monochrome presentation expectations.

Browser verification includes registered pages, normal/enlarged and short/landscape layouts, first/returning use, actual financial entry points and explicit failed-save/stale-tab/recovery fixtures. These fixtures use isolated memory state, not a saved customer's records. Temporary `__*` browser assets are removed before publication. Exact final counts and publication provenance are recorded in `RELEASE-RESULTS.json`.

## Remaining production gates

This is a corrected sample product for facilitated student journeys. It does not establish live banking readiness. Real account custody and server-authoritative ledger/mandates, authenticated member decisions and QR directory, real payment/issuer callbacks and reconciliation, identity recovery, native biometric security, remote support/notifications and consent-aware operational monitoring still require connected services and operational ownership. Physical Android/iOS, camera permissions, assistive technology, constrained-network performance and background behavior require device testing. The app continues to disclose its sample boundaries.

No employment, bank security, predictive AI, live payment or support-delivery capability is promised by these repairs.
