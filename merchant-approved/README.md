# Approved merchant experience connected service

This directory preserves the final approved merchant Site version 7, commit `0e0ce95efc5d03719599fe3c745b7f1365e70c45`. Home, Collect, Administration, the seven signup stages, screen templates, CSS, assets and navigation remain the approved experience. `connected-service.js` supplies the shared backend transport.

The shared service stores original merchant metadata and roles, projects canonical consumer payments into the original receipt view, and posts approved refunds to the original payer. Fixed requests, staff invitations, receiver readiness, closing reports and related metadata synchronize across devices. All money is explicitly pilot test money.

Bank/MoMo settlement and SMS/NIA services are not connected. Shared credential changes/recovery and ownership handover remain unavailable until their two credential stores have a durable transition; existing credentials are kept. The earlier Site's D1 records are untouched and are not silently imported as shared money. Earlier registered merchant accounts need a new shared test account for this backend.

Build the static route with `node scripts/build-approved-merchant.mjs` from the repository root. The original Site deployment uses its separate retained checkout and Site identity. See `visual-parity.json` for the narrow transport/action changes and `backend/tests/approved-merchant-handler.test.mjs` plus `backend/tests/approved-merchant.test.sql` for verification.

---

# Lumo Merchant Mobile

A separate, phone-focused app for Legon merchants, their shops and student test payments. No real bank, mobile-money, identity or SMS integration is connected. Lumo Test 2.4.3 Scan to Pay connects to the shared merchant test wallet. Use sample business details and test passwords.

## Run and verify

- `npm run dev` through Sites managed preview: Node serves the app and a local SQLite-backed D1 substitute.
- `npm test`: domain, server, account UI, reports, device, payment and actual app integration tests.
- `npm run build`: creates a standalone Worker with all local assets. No package installation is required.
- Publish through Sites with D1 binding `DB`; deployment applies the schema-only migration in `drizzle/`.

The root `.openai/hosting.json` is the source deployment manifest. Static assets remain under `dist/`; `worker/index.js` and `server/` are authored server source. `scripts/build.mjs` generates `dist/server/index.js`. Generated Worker bundles, local database files and temporary QA pages must not enter authored source.

## Merchant journeys

- Merchant signup creates one shared sandbox account, one shop and an individual owner login atomically.
- Staff invitations work across devices; each person chooses a username/password. Roles and shop grants are enforced on the server.
- Interrupted staff acceptance resumes the same account and guides recovery-key replacement without storing passwords or reissuing old keys.
- Recovery-key saving has a durable server checkpoint. Refresh before acknowledgement guides password-authorized key replacement; the raw key is kept only in memory.
- Password changes, private recovery keys, forgotten usernames, phone changes, session revocation and ownership handover are implemented.
- Registered shop QRs, codes and account identifiers resolve centrally from another device. Nearby search spans all shared businesses; distance is calculated on the student device.
- A student demo wallet starts at zero. Explicit test funding enables payment review and confirmation. A committed payment debits the test wallet and credits the merchant once. Refunds return to the original test wallet.
- Owners see aggregate funds. Staff receive only assigned-shop records. Shop closing archives collections and resets that shop's figure without moving merchant funds.
- Shop readiness covers location, displayed QR, staff/owner-operated counter, a tested audible phone and a confirmed receipt. Deliberate publication requires the first four steps, so a first payment is never a circular prerequisite for discovery.
- Managers can pause/resume their shop, update hours/landmark, choose trading cutoffs and open/close shifts with handover notes.
- Settlement attempts keep their original amount, destination and retry reference. Cross-tab draft changes use exclusive browser locks; cancellation cannot erase another tab’s submitted request. A committed result is retrieved without another reservation; a new payout needs owner confirmation.
- Manual, automatic-cutoff and zero-sales closing preserve history. Earlier-period refunds are labelled adjustments.
- Allocating an account receipt uses the correct shop day. Late allocations become explicit current-period adjustments while original confirmation times, archived reports and aggregate merchant funds remain intact.
- Shop GPS captures are scoped to the current form and business. Manual area choices, newer captures and navigation supersede earlier callbacks. Student history pages preserve the latest wallet balance while appending older rows.
- Reports use confirmation/return times and shop trading days. Owner and historical operators remain selectable, and shift names are preserved. Filters, pagination and exports agree.
- Receiving phones have persistent IDs, session-bound server pairing, heartbeat, immediate revocation, explicit voice tests and one active receiving tab with shared receipt deduplication. Voice retesting preserves a working receiver. A fresh owner sign-in can explicitly restore or replace a revoked phone, followed by a new sound test. Refresh keeps the pairing but requires one tap to unlock browser audio.
- Owner Operations shows exceptions, statement comparisons, support case updates and business setup. CSV comparisons do not create money or imply a bank connection.

## Boundaries

This is a shared test-money prototype, not a production payment processor. D1 stores separate merchant, wallet, access and activity records. Merchant and wallet record guards commit related changes together in one transactional batch, with 16 bounded retries for changes in the same scope. Unrelated merchants no longer compete on one global write revision. A merchant history allowance affects that merchant, rather than the entire ecosystem. See `server/README.md` for security and API contracts. Production scale needs an indexed append-only financial ledger and provider reconciliation.

The isolated sample business still uses local browser records and review role switching. Eligible legacy browser-created businesses can be imported explicitly into their authenticated owner’s empty shared account, using the current password and consent. A resumable backup stays in the browser until success. Already shared businesses cannot be imported again as new businesses.

Registered financial records are shared. Device preferences and signup drafts remain local; passwords and private recovery keys are excluded from drafts. The public directory exposes merchant acceptance details and shop pins, not owner credentials, student locations or merchant balances.

Physical-phone camera, audible speech, browser background suspension and locked-screen behavior still need target-device testing. The web app clearly requires an open, connected tab and an explicit audio gesture. Reliable native background delivery belongs to the later Android application.

## Version 8 reliability

Refund intent changes now use exclusive browser locks and exact-reference completion. Student payments and test funding require verified reference persistence before submission, including when storage is denied or silently fails. Unresolved attempts survive closing and reopening checkout.

A failed spoken receipt withdraws receiving readiness immediately, latches the fault on the server against delayed heartbeats and leaves a persistent receipt warning. A successful sound retest restores readiness without replaying old payments.

The recovery-key checkpoint gates all merchant navigation. Sign-out, expiry and revocation clear the registered cache from browser storage and memory; delayed storage events cannot restore it. Explicit legacy-import backups and unresolved financial references remain separate.

Signup and shop operations use context-bound location captures. Custom campus areas survive shop editing. Case responses, handover notes and ownership-transfer drafts survive incoming receipts, with passwords held only in memory. Reports reset unavailable filters when accounts or workspaces change. Directory lookup awaits its initial load and resets categories that disappear. Shop status/readiness updates require actual JSON booleans.

## Collections app

The merchant app opens on **Home**, with the shop selector, receiving status, open requests, collection totals and recent payments. **Collect** focuses on an amount keypad and a reusable **Shop QR** tab, with a compact shop-name link back to Home. **Administration** keeps the existing business overview, shop controls, staff access, settlements, reports, receiving phones, reconciliation, support and account tools under their existing roles. All three sections are available in the bottom navigation.

Home leads with the selected shop's net collections since last close. Collect payment and Shop QR open the corresponding Collect mode directly. Recent payments use compact rows; requests and receiving setup expand in place. Open panels survive incoming-record redraws within the same account, page and shop.

Fixed-amount requests last 15 minutes and show live waiting, processing, expired, cancelled and confirmed states. A confirmed request offers a receipt and **Next customer**. New QR generation is guarded against rapid repeat taps and uses a stable attempt reference when retrieving a lost response. Closed or paused shops cannot create new requests. Static shop QRs keep the customer amount editable; request QRs bind the original amount.

Verification: 338 automated tests passed, including generation replay, payment state, role access and existing financial workflows. Browser QA covered a phone-sized 390 × 844 view, amount entry, static customer amount entry, Administration and a cross-tab customer confirmation that changed the merchant QR to Payment received with the matching reference. Physical-phone scanning, audio and background delivery retain the limitations described above.
## Version 9 correction coverage

Pending student payments and funding attempts retain the originating wallet identity. Every mutation checks the current wallet and sends its saved identity; replacement-wallet recovery is blocked while the original reference remains available for receipt checking. Legacy unbound unresolved attempts fail safely. Late responses cannot switch the active wallet back.

Receiving sound tests carry the failure version captured before audio plays. Local generations and server checks prevent older tests from clearing newer faults, including delayed locks, commits and responses. Restoration of a revoked phone requires a fresh owner sign-in on the server as well as in the interface.

Invitation validation matches the server. Invalid names are rejected before submission; impossible old retry markers are released for correction while genuinely uncertain valid attempts stay protected. Imported histories reject duplicate IDs and invalid financial references and remap full identifiers without truncation. Payment and funding amounts require numeric integer pesewas.

CSV reads are scoped to the current account, page and file selection. Independent shop-settings forms preserve each other’s unsaved fields. Adding or editing a shop retains its explicit entrance confirmation without claiming QR readiness or automatically publishing it.

## Dedicated mobile site

This source has a new Site identity and new D1 database. No merchant records, login accounts, receiving phones or live configuration were transferred from the other merchant site. The bundled sample business remains available for review.

The root page hosts the app at a phone width on desktop and edge to edge on phones. The inner `app.html` provides Home, Collect and Administration. QR and invitation links use the canonical root route and carry their parameters into the app. Editable controls use 16px type, touch controls are at least 44px, and the focused Collect layout keeps its keypad and Generate action visible on short screens. Home retains its totals at every screen height.

The installable web-app manifest includes 192px and 512px app icons. The service worker caches only a reconnect page; API responses, balances and payment outcomes are never cached. The offline retry preserves the original payment or invitation URL.

Validation: all 338 automated tests passed. Browser checks covered the full mobile collection app, 390 × 720 layout, canonical QR links entering the mobile frame, a GH₵42 customer payment updating the merchant confirmation with the same receipt, and Administration access. Physical-phone camera, sound, home-screen installation and keyboard behaviour remain target-device checks.

## Mobile review corrections

The current suite passes 380 checks. Collections now keeps static-QR receipts and receiving-phone status visible, preserves form focus during incoming receipts and supports browser Back through pages and overlays. Waiting and processing requests share one resumable queue. Owners can operate shifts and open refund approvals directly; the manager refund threshold is cumulative per original payment. Static receipts are labelled shop-level when no cashier is assigned.

Settlement intent writes and cancellations require verified persistence. Unpublished shops use private test links or authorised merchant sessions, cashier snapshots exclude unnecessary colleague details, and wallet history can resolve an interrupted response to its original confirmed receipt. See `VERIFICATION.md` for coverage and remaining physical-device checks.

## Lumo Test app pairing

Lumo Test 2.4.3 can scan registered merchant QRs on another phone. Fixed QRs bind the exact request, receiving shop and integer-pesewa amount; the customer sees a locked amount. Reusable Shop QRs keep amount entry available. Missing, mismatched, cancelled or expired requests cannot fall back to an editable static payment.

The native app uses a separate shared merchant test wallet, with explicit test funding, normal app authorisation and a server-confirmed receipt. Local Everyday demo funds remain separate. Test wallet payments credit the merchant only once; interrupted responses retain their original retry reference. No real money moves. Browser-local sample requests are intentionally unavailable on other phones: create a merchant account to run the paired test.
