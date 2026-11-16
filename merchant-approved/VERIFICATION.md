# Verification

Verified against the current shared-sandbox source on 12 November 2026.

## Automated coverage

All 380 checks pass with `npm test`. The suite includes actual app controllers connected to the real API handlers and disposable SQLite-backed D1, in addition to pure domain tests.

- Parallel payments retain both receipts and corresponding wallet debits.
- Concurrent overspending cannot create a negative student wallet.
- Payment/funding/refund retries reuse stable references, including committed-but-lost responses, DOM timeout errors, reloads, concurrent retries and payload mismatch rejection.
- Global account/shop identifiers remain unique and QR requests resolve from a separate client.
- Student debit, merchant credit and original-wallet refunds commit together.
- Signup displays the new shared account, preserves a zero starting balance and never persists a plaintext password. An uncertain signup resumes the same request; unique sample credentials avoid public account collisions.
- Fresh-browser sign-in opens login; cross-device invitations create only the assigned role and shops.
- Remote suspension and changed permissions invalidate the open staff view. Offline sign-out locks immediately, delayed responses cannot restore old access, and local-storage quota failures use a session fallback where available.
- Staff API snapshots exclude merchant settlement details and other shops; forged actor roles cannot widen access.
- Private recovery keys, replacement keys, password changes, username recovery and session revocation are checked.
- Settlement and destination changes require a one-use password proof.
- Receiving phone pairing, bound-session revocation, expiry, assignment checks, first-receipt delivery, one receiving tab, shared deduplication and post-refresh audio unlock are covered. Receipts announce once while profile, password and session pages remain open.
- Ghana trading-day cutoffs, automatic/manual/zero-sales closing, late confirmations and prior-period refund adjustments preserve merchant funds.
- Refund reports distinguish the performer, requester and original sale. Shift handovers reconcile after next-day owner approval and after repairing legacy owner-refund attribution.
- Reports, date/status/cashier/shift filters, pagination and CSV exports select the same records.
- Statement preview and saved comparisons share one matcher, deduplicate receipt aliases and expose all rows through pagination, filtering, reopening and export without changing funds.
- Shop handoffs preserve the selected shop. Muted, offline, revoked and audio-locked phones fail readiness; staff see privacy-safe shop-level readiness. Publication requires deliberate minimum setup, with the first receipt tracked separately.
- Opening and closing Campus Pay restores the page; uncertain payments cannot be abandoned into a second debit.

## Browser review

Desktop and a 390px phone iframe are used for navigation, activation, operations, reporting and the public student flow. Credential and money state transitions are also exercised by the actual-module/API tests; no user passwords or real accounts are used for QA.

## External dependencies

No real bank/OBVAM account provisioning, real student Lumo wallet, Ghana Card/liveness, SMS, external service desk or native push service is connected. Support records and statement comparisons are shared sandbox workflows. Actual receiving phones and the future APK require device tests before any real-money pilot.

## Stabilization checks

- Existing D1 data migrates transactionally to record shards and remains backed up behind a write fence.
- Two tenant histories exceeding the old combined capacity remain independently available; a failed commit guard rolls back atomically.
- A settlement request cannot override its saved destination.
- Suspended staff payment requests fail during quotation.
- Closed published shops remain searchable; incomplete unpublished shops are absent.
- A GH₵1,500 request pays from a GH₵2,000 sandbox wallet; funding has its separate GH₵1,000 per-request limit.
- Cursor-paged student activity reaches more than 100 entries, rejects another wallet’s cursor and announces newly arrived activity.
- Already shared businesses cannot enter legacy setup. Consented imports require the owner and current password, retain their local backup until success and resume without copying records twice.
- Assigned staff read business support responses. Reassigned staff cannot retrieve a former shop’s refund through an old retry reference.
- Retrying a payment against a different code or account is rejected instead of returning a receipt for the earlier recipient.
- Current reconciliation and closed-shift records survive the strict legacy-import schema.
- Expired rate-limit cleanup is bounded; recovery challenges retain the newest records per user rather than evicting other users’ valid challenges.
- Readiness timestamp-only polling does not redraw the page; real status changes still refresh it.

The deployed Worker is built after removing temporary QA pages. A disposable D1 check exercises its health, embedded app assets and absence of QA routes before packaging.

## Version 6 review regressions

The second review’s ten reproduced defects have dedicated checks:

1. Retesting a ready receiving phone retains its lease and can still announce new confirmed receipts. Test failure and mid-test revocation cannot leave a false Ready signal.
2. A paused shop or other definitive no-debit rejection releases the student’s saved purchase, allowing another merchant. Unknown, offline and processing outcomes retain their original reference.
3. Account receipts allocated before a shop cutoff close in the correct shop period. Late allocations become explicit adjustments, preserving the original confirmation timestamp, archived close and merchant funds.
4. Settlement creation and retry use one stable amount, destination and reference. Concurrent repeats and committed-but-lost responses reserve once. Changed destination/status cannot redirect the original payout; a new payout needs new owner authorization.
5. Public account lookup excludes unpublished shops, including selected sibling IDs, while exact shop QR dry-runs remain supported.
6. Fresh owner sign-in exposes explicit restore/replacement of a revoked phone, followed by sound testing. Stale sessions and ordinary staff cannot bypass revocation.
7. Interrupted invitation acceptance resumes the existing account without reissuing the private key. Matching sign-in/replay guides key replacement; revoked/reissued requests and corrected credentials remain recoverable. Failed replay attempts are rate limited.
8. Owner-operated and historical operators are selectable in reports before any refund exists.
9. New shifts retain operator-name snapshots after ownership handover. Legacy unknown names remain explicit and use same-shift evidence where available.
10. Invalid non-boolean user status changes are rejected atomically; the owner remains active.

The original review probes were rerun independently for payment/account scope, recovery and financial attribution. Actual app/API integration includes a committed-but-lost settlement response followed by original-outcome retrieval without a second password proof or reservation. Phone controls were also checked in a 390px browser fixture with simulated audio; physical phone audibility remains a device-test requirement.

## Version 7 review regressions

The five remaining review cases are corrected and exercised:

- Two settlement controllers sharing a browser store acquire one exclusive lock for each mutation. Cancellation before submission prevents that attempt from sending; cancellation after another tab submits preserves the shared reference and retrieves one GH₵20 payout. Concurrent begins, exact-reference completion, unsupported locking and unreadable storage are covered. App/API integration also proves a queued request cannot continue under a different signed-in owner.
- A late shop GPS success/error is ignored after a manual area selection, a newer capture, a different modal, dismissal or navigation. A valid new position requires location confirmation again.
- Per-wallet response revision and request ordering keep the latest balance/name/total while older activity pages append. Actual API funding and refund races retain the new balance and all unique activity rows.
- Owner signup, invitations and regenerated keys keep a server pending-save checkpoint until the exact displayed key generation is acknowledged. Refresh guides replacement rather than bypassing the save step. Failed/lost acknowledgements remain recoverable, stale acknowledgements cannot clear newer keys, and raw keys/passwords are not written to browser drafts.
- Domain and API reject non-boolean refund decisions without changing balances or the refund. The ordinary Decline and Approve flows remain valid.

The original five-case probes were rerun independently. No applied SQL migration changed. Browser settlement submission now requires Web Locks and durable intent storage; unsupported environments fail before sending a new payout. Target-phone audio and external provider integration limits remain unchanged.

## Version 8 review regressions

Tracked regressions cover all twelve reproduced review cases and the shared-write contention case. They include actual controllers against the API and disposable SQLite/D1, with denied/no-op storage, committed-but-lost responses, stale refund replies, late GPS callbacks, recovery navigation attempts, incoming receipt redraws and sign-out followed by stale storage events.

Receiving-phone checks inject an actual receipt synthesis error, verify local/server readiness becomes false, send a stale ready heartbeat and require a successful audible retest. Old receipts remain consumed and are not replayed as new payments.

Twenty independent merchant/wallet pairs fund and pay concurrently through the API with a 5 ms D1 query delay. All twenty complete without client retries, with unique response revisions. Same-merchant changes, revocation, inserted dependencies and concurrent username allocation remain guarded transactionally. No applied SQL migration changes. Read reconstruction, physical-phone audio and external bank/identity/SMS connections retain their stated sandbox limits.

## Version 9 review regressions

Each of the nine outstanding cases has regression coverage. Actual API/controller checks verify that a paid-but-unconfirmed purchase cannot debit a replacement wallet, returning to the original wallet retrieves one receipt, funding is bound to its original wallet, and a cookie change between preflight and mutation is rejected. Shared and checkout response guards prevent a late response from replacing a newer wallet context.

Audio checks hold an old retest at the browser lock and before/after the server commit. A newer receipt failure remains latched until fresh audio completes against that failure version. Old owner sessions cannot pair or enable a revoked phone; a new owner login can restore it muted.

Invitation tests exercise invalid first characters, impossible legacy markers, correction and genuinely uncertain valid requests. Import checks reject repeated IDs and financial orphans atomically, preserve distinct long identifiers sharing a prefix and refund both imported receipts independently. Invalid monetary JSON types do not change balances.

Operations tests delay CSV reads and saves through merchant/user/session/page changes, newer file selections and subsequent edits. Submitted forms clear only their own unchanged fields. The real app/API Add Shop journey retains entrance confirmation while QR readiness and publication remain false. No SQL migration changed.

## Dedicated mobile review corrections

- Static QR collections show the exact latest confirmed receipt above the QR. Fresh receipt batches are processed in confirmation order, with a persistent live announcement outside the redraw area. Fixed-amount payment confirmation focuses its receipt heading.
- Receiving readiness is visible beside the shop selector, including muted, offline and failed-speech states, with a path to retest sound. Readiness must belong to the selected shop.
- Waiting and processing requests use one queue, including a processing request whose original QR has expired. Completed and cancelled requests leave that queue.
- Refund exceptions open owner approvals directly. Manager auto-approval uses the cumulative returned and reserved total against one original payment; totals above GH₵100 require owner approval.
- Owners can start and end their own shifts. Static QR receipts remain explicitly shop-level and are never attributed to an invented cashier.
- Settlement attempts require exact persistence readback before submission, and verified deletion before cancellation. Denied, dropped, changed and unreadable storage fail safely.
- Unpublished shops require an authorised merchant session or a private, unguessable test link. Predictable codes, IDs and account lookups cannot expose them. Public discovery omits test keys. Cashier snapshots omit colleague phone numbers and authentication identities.
- Student wallet history includes its attempt and confirmed state. Legacy committed payments reconstruct those fields so a lost payment response can resolve to its original receipt.
- Page and modal navigation follows browser Back within the current workspace and authenticated context. Sample role changes reset that history. Incoming receipts preserve the focused form control and selection without retaining field contents in history.

Browser checks covered static receipts arriving from a second tab, exact matching receipt references, preserved opening-hours text and caret on receipt arrival, owner shift controls, Administration Back navigation and closing a QR with browser Back. Automated regressions cover the permission and interrupted-payment cases. Physical-phone scanning, audible speech, keyboard resizing, installation and background delivery still require target-device testing.

## Home and focused Collect

Home is the merchant entry page and holds shop selection, receiver status, request queue, collection totals and recent payments. Collect retains its amount keypad or Shop QR, selected-shop context, confirmed static receipt and shop availability safeguards. Administration remains the third primary section; its child pages keep the Administration tab active.

All 380 automated checks pass. Actual app integration verifies the three navigation entries, moved overview controls, focused Collect, retained QR recovery and role restrictions. Browser checks verify that choosing a shop on Home updates Collect and browser Back retains that shop. No financial or server API contracts changed.

The Home refinement keeps that net total distinct from an available merchant balance, places amount and static-QR shortcuts beneath it, and renders four compact recent receipts. The updated integration case exercises both shortcuts into the existing Collect modes for the selected shop, default-collapsed support panels and a single receiving surface. Browser checks confirm the static shortcut retains receipt visibility, the amount shortcut selects the keypad, and browser Back preserves shop selection. All 380 checks continue to pass.

## Collect height adjustment

Amount entry now expands its existing amount display and keypad into the space between the header and bottom tabs. The Generate action remains near the bottom; short screens compact the same controls and allow scrolling when required. Home and static QR use their existing layouts. The 26 actual app integration checks pass. Browser checks covered a tall preview, 390 × 720 and 360 × 640 with a nonzero amount and Clear, plus successful GH₵25 QR generation with a note in a reduced 460px view. This is a viewport check, not physical keyboard testing.
