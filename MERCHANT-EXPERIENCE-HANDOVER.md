# Lumo merchant experience handover

This release extends the approved consumer and merchant experiences around three jobs: reach paying customers, collect with confidence, and see what remains after a business plan. All connected money in this release is **test money**.

## Applications and source

- Consumer: <https://lumo-connected-pilot.vercel.app/>
- Merchant: <https://lumo-merchant-mobile.oness15.chatgpt.site/>
- Merchant mirror: <https://lumo-connected-pilot.vercel.app/merchant/>
- Guest checkout entry: `https://lumo-connected-pilot.vercel.app/checkout.html?link=<public-link-token>`
- Repository: `lumoghana/signal`, branch `feat/shared-test-money`.

`dist/` is the connected consumer release and contains the public checkout and merchant mirror. `merchant-approved/` maintains the merchant source. The separate merchant Site is published through its existing source and version workflow. `backend/supabase/functions/lumo-approved/` and `backend/supabase/migrations/` maintain the shared service. Android source and signed APKs are delivered separately and are not repository binaries.

The existing consumer design, payment review, conditional Pause, transaction authentication and canonical ledger remain in use. Do not substitute an older export from the repository's main branch.

## Implemented journeys

| Journey | Behaviour and limits |
| --- | --- |
| Campus merchant discovery | Published shared shops replace illustrative connected listings. Search covers shop identity, category, area, landmark and code. Location is optional; manual areas remain available. A fresh authoritative quote checks the shop before payment. |
| Favourites and Pay again | Favourites belong to the signed-in consumer. Returning to a merchant uses fresh details and normal review/PIN approval. It does not replay an old fixed request, payment approval or transaction reference. |
| Public payment links | Reusable shop links and one-off amount links use server records. An existing counter request keeps its original amount and expiry. New online orders have an explicit validity period. Public links require an intentionally published, accepting shop. |
| Guest MoMo checkout | A customer can open a link without an account, enter their own number/network, review and use the clearly labelled sandbox provider controls. No consumer or hidden guest wallet is created. Lumo never asks for the customer's MoMo PIN. |
| Merchant sharing | Prepare a link, edit its message, then choose native Share, WhatsApp, email, copy or a payment card. Opening another app does not count as sending. Cancelling leaves the payment link intact. Instagram availability depends on the device's share targets; copy or the saved card provides a fallback. |
| Cashier collection | Dedicated/shared phones retain individual cashier identity. Pending requests survive handover with their original cashier/shift attribution. Shop-attributed QR and online-link receipts remain separate from the current request. Receiving readiness still requires the existing sound checks. |
| Business planning | Owner-led stock reserves, planned/recorded expenses and optional manager grants use a shared deterministic calculation. Money after the plan is an estimate after authoritative available funds and ledger holds. Plans do not post payments or move money. Ledger-linked and externally paid expenses are identified to prevent double counting. |
| Merchant Lux | Existing collections, refunds, trends and closing answers remain. Stock, expenses, funds after the plan, link status and pending collections use the same scoped calculations as the screens. Actions open the normal review routes. |

Guest collection is not merchant payout. Bank/MoMo withdrawals, supplier payments and live provider settlement are not enabled by this work. Closing a shop day resets its collection view while preserving merchant funds.

## Attribution and receipt coverage

- A fixed counter request can retain its recorded cashier, counter and shift. A remote online order and a reusable shop link are shop-attributed unless there is reliable operator evidence.
- A payment for another request, a shop QR or an online link cannot complete the cashier's current fixed request merely because the amounts match.
- Guest MoMo collections carry their verified link, provider reference and sandbox posting status. Refunds remain attached to the original guest transaction and return through the original sandbox source, never into an unregistered customer's Lumo wallet.
- The shared-link revenue summary explicitly covers guest MoMo link payments. Lumo-wallet receipts can be confirmed at the selected shop/request without proving which shared link or social application introduced the payer. The application does not invent that attribution, infer profit or treat a share-sheet completion as a sale.
- Public receipts expose a masked phone number. The guest's recovery capability stays in their browser or private receipt link. It is not put into the merchant's public share URL or preview.

## Live MoMo prerequisites

**No live MoMo provider is connected.** The current adapter and database intentionally accept sandbox provider mode only. This is not a production feature flag that can safely be switched on.

Before a live release, supply and verify all of the following:

1. A contracted provider's collection, transaction-status and original-transaction refund APIs, supported networks, fees, limits, approval flow, timeout semantics and settlement/reconciliation specifications.
2. Server-only credentials, approved callback destinations and a provider adapter. Confirm the merchant/shop destination independently of browser input. Never place provider secrets or a customer's MoMo PIN in the client.
3. Signed callback verification over the provider's required raw payload, replay protection and authoritative status checks. Match provider reference, integer-pesewa amount, GHS currency, merchant, shop and provider mode before crediting exactly once. Client-side success messages cannot authorize ledger credits.
4. A production clearing/settlement ledger path, including fees, holds, reversals and unresolved outcomes. The sandbox test-funding source must not become a live collection source. Repeated taps, callbacks, refreshes and retries must retain the original reference.
5. A supported refund adapter tied to the original provider transaction, with existing approval limits, remaining-refundable checks, pending/failure recovery and confirmed provider outcomes. Do not redirect guest refunds to a Lumo wallet.
6. Provider sandbox certification, reconciliation and operational controls, phone-data retention/access rules, and acceptance testing on real supported phones and networks. Confirm the absence of duplicate provider charges and duplicate merchant credits under interrupted responses and delayed callbacks.

## Checks and platform coverage

Automated suites cover public-link validation, fixed amounts, idempotency, callback/result matching, role boundaries, handover, receipt separation, expense calculations and sharing fallbacks. Separate app-level tests exercise the existing merchant entry points rather than only individual renderers. Transactional SQL fixtures require an isolated authenticated test context and must finish with `ROLLBACK`; they are not production setup scripts.

Native Android **2.10.0** keeps package `com.lumo.nativeapp.test`, version code `21000`, and the 2.9.1 signing certificate. Its maintained source adds connected merchant discovery, favourites, fresh-quote Pay again and public checkout handoff without replacing the approved native screens. All 273 assets and 54 resource files match the previous release. Verified checks include 59 pure-Java suite executables, 110 Robolectric framework cases on API 28/35, compilation, APK integrity, alignment, permissions and v2/v3 signatures.

These checks do **not** verify APK execution on ART, installation on a physical phone, camera or biometric hardware, permission-dialog behaviour, OS App Link routing, installed social-app targets, PNG saving, real MoMo approval, sound in the background or keyboard behaviour across devices. Guest checkout and merchant sharing are browser journeys; the merchant application has not become a separately verified native APK. The public website must serve the matching `assetlinks.json` for Android verified links.

## Repeatable commands

Run from the connected repository root:

```sh
npm test
(cd merchant-approved && npm test)
node --test backend/tests/guest-checkout.test.mjs backend/tests/guest-merchant-wrapper.test.mjs backend/tests/approved-cashier-boundary.test.mjs
node scripts/build-approved-merchant.mjs
node scripts/prepare-approved-public-assets.mjs
node scripts/build-offline-shell.mjs
```

After checks, regenerate `dist-sha256.json` and update `source-provenance.json` for the actual release. Publish the merchant Site through its existing source workflow, deploy `dist/` and the existing API routes to the current Vercel project, deploy the reviewed shared function/migrations, and sync the same source to the connected branch. Verify the canonical URLs after publication; a local build alone is not publication.

Inside the separately delivered Android source, use Java 17, Android Platform 36, Build Tools 36.0.0 and ECJ 3.46.100:

```sh
python3 scripts/test-models.py
python3 scripts/build-apk.py --output output/Lumo-Test-2.10.0.apk
python3 scripts/package-source.py
```

Signing credentials must be supplied separately through the documented environment/file configuration. Do not commit signing material, QA accounts, private browser records, tokens or build logs into this repository.
