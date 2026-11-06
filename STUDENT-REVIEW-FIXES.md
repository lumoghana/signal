# Student product review follow-up

This update preserves the current Lumo prototype and its design system. It addresses the product/code review of 5 November 2026; no live bank, identity, SMS or multi-device messaging service is introduced.

## Financial trust

- Chat preserves pesewa units, refuses ambiguous/corrected recipients and combined/rate commands, and filters spending by category or merchant within the requested dates. Prepared actions still require review and PIN.
- Incoming IOUs match an existing confirmed Lumo income receipt, or explicitly record an external cash/MoMo/bank repayment. Matching never credits money again. Outside records are labelled separately in history and excluded from Home's Lumo moves and income totals.
- Budget-linked transactions retain their originating period. Failure, reversal and card refunds adjust that period, including migrated legacy records, without clearing a new period's spending.
- Budget horizon, item deadlines, expected income and recovery check-in dates stay independent. Equivalent new budget categories are rejected; older saved allocations and IDs are retained.
- Pending payment, card, internal-transfer and personal group-contribution holds are unavailable to spend and included once in recorded-money totals.
- Pause alternatives are re-evaluated against the complete impact. Repeated-payment and daily-flex triggers are explained. Personal group contributions, card funding and outgoing IOUs use the shared plan-impact review before existing PIN authorisation.
- Card funding remains a transfer; confirmed purchases count spending once, with original-period decline/refund correction. Service payment status is distinct from airtime/data/bill fulfilment.

## Groups and savings

- Contributor invitations do not freeze active members. Approver mandate changes require explicit acceptance and invalidate stale reviews/approvals. Processing payouts cannot have their mandate changed.
- Membership uses stable IDs and normalized contacts. People can share a name; removed members can rejoin without losing financial history. Invitation versions prevent stale acceptance replay.
- Existing-box partner invitations do not activate protection before acceptance. Pending invitations can be cancelled. Accepted protection remains active during a replacement invitation, and new-box first-code acceptance is retained.
- Group funds, messages, personal accounts and private assistant responses remain separate. Sample chat no longer promises unsupported PDF attachment sharing.

## Student experience

- Verified students can choose to wait for money without inventing a balance. Home keeps funding prominent; confirmed funding and a first budget advance setup progress.
- First planning offers an optional keep-back. Several essentials can be entered through a compact starter, followed by the existing editable review. Detailed and conversational planning remain available.
- The amount page keeps category/budget/note details optional. Favourites reuse account lookup and explicit registered-name confirmation.
- Critical supporting text and group controls are larger; small screens scroll instead of hiding content. The menu has a 44px target.
- Money IQ is the shared learning front door. Rotating student examples, verified personal rounds and a brief practical takeaway preserve the existing reward limits. Legacy games/stories remain secondary.
- Privacy wording scopes personalised learning accurately. Offline status stays visible and explains that only device-local demo changes can be saved.

## Verification

Run `npm test` for the full suite. Focused regressions include `chat-interpretation-safety`, `review-planning-regressions`, `payment-review-regressions`, `group-membership-review`, `offline-shell` and `student-review-integration`.

Regenerate the public offline shell after changing `dist/`:

```sh
node scripts/build-offline-shell.mjs
```

Browser QA uses an isolated, disposable copy and fictional records at 320x568, 360x780 and 390x844. This does not establish physical-phone accessibility, real soft-keyboard behaviour, low-cost-device performance or live integration reliability.

## Work outside this prototype

The proposed student research round still needs real participants. Live-money readiness requires authoritative bank/MoMo/provider services, secure server-backed identity/access, durable records, reconciliation, real notification/scheduling, support and operational ownership. A passing prototype test suite does not establish those capabilities. The external GitHub mirror and Android APK/source package are unchanged by this update.

## Live website follow-up, 6 November 2026

This change applies to the existing hosted web prototype only. The Android APK and native source are unchanged.

- Savings Hack setup/edit validates the entire rule before mutating a setup draft, preserves paused rules, and rejects invalid percentages, precision and limits. The web ledger already validated whole-rule updates atomically; the native partial-save defect was not copied into the web model.
- A Box's personal goal lock is independent of accountability partner protection. The authenticated Lock/Unlock control remains available; withdrawals and retries respect that lock and still require the fresh partner release and owner PIN. Unlocking preserves the mandate, audit history and expiry of existing approvals.
- IOU repayments can prepare a Lumo or MoMo payment through recipient confirmation, existing review/Pause, authorisation and the selected simulated outcome. Pending payments reserve the outstanding debt without pretending it is paid; confirmation, failure and reversal reconcile the debt once. Amount edits, closure and manual repayments cannot consume another pending reservation. Manual cash/MoMo/bank repayments are explicit records of money already paid outside Lumo, do not move Lumo/outside balance snapshots, and are excluded from Lumo spending and Home account moves.
- Failed transfer retries restore recorded destination fields, preserve relevant debt context, recheck the recipient and use a fresh intent key. Web retries already avoided the native note-as-number error; explicit legacy-field fallback and regression coverage were added.
- Home keeps its existing quiet account layout. Following the next visual review, the date/daily-guide line is removed and the balance eye sits immediately beside the Everyday/Savings account selector, with a clear Show/Hide label and a 44px touch target. Expected income is never counted as available money.
- Insights separates selected-month confirmed spending from current-plan usage/holds. Detailed plan arithmetic is behind a disclosure. Selected months, privacy and return navigation are retained.
- Top-ups offer My number, reuse only delivered top-ups, and direct unfinished purchases to Check last top-up. Every shortcut prepares a draft; review and authorisation remain required.
- Money IQ's existing speech tail is retained and its Lux speaker cue is clearer. Campus Run teaches dragging Lux once, with a brief finite arrow cue and tap/keyboard alternatives. No choice is made automatically.
- Browser-native statement downloads already avoided Android's Activity-local picker defect. Navigation now safely rebases copied/orphan tab histories, and Login details returns to Security. Payout attachment selection preserves typed fields, reports when a file needs choosing again, ignores late reads and copies committed evidence before editing it.
- Browser verification distinguishes a saved credential from proof that it is currently usable, and offers password-protected reactivation with fresh WebAuthn verification. Cancellation is distinct from a credential that needs setup again.

Validation: `npm test` passed 1,105 tests with zero failures. New/extended regressions cover protected lock/retry grants, invalid rule saves and paused edits, IOU outcomes/holds/reversals/manual records, real bound payment/form handlers, recipient retries, top-up shortcuts, Home privacy/horizon, Insights scopes, attachment recovery/evidence isolation, browser credential recovery and orphan-history navigation. The public offline-shell cache was regenerated after production edits.

Browser checks in the isolated preview verified Home context; monthly/current-plan Insights and hidden amounts; Data bundle My number followed by review; IOU method selection followed by the normal MoMo lookup; the Money IQ speech layout; and actual Lux drag-to-choice with story-money feedback. These checks do not establish physical-phone keyboard/biometric performance or live banking/provider integration. All money and provider/member data remain local simulations.
