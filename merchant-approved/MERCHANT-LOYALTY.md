# Merchant-owned loyalty 1.1.0

This release adds Customers & loyalty to the merchant app. One business owns one programme, its branding, selected shops, earning rules, rewards and budget. The paired consumer web and Android experience is 2.13.0. Customers can join, link existing memberships, track progress and use rewards in Your rewards. No new bank, MoMo or messaging provider is introduced.

## Merchant tasks

1. **Create a programme.** Open Administration → Customers & loyalty. Choose a name and colour, qualifying visits or cumulative spending, a minimum purchase, a reward threshold, participating shops and a reward budget. Review the complete terms before publishing.
2. **Choose the reward.** Offer a fixed discount on a later purchase or a free item handed over by staff. A discount must leave a positive amount to collect and have a minimum purchase greater than the discount. Item rewards are standalone handovers, with an owner-entered fulfilment cost estimate; the app does not inspect a product basket or stock.
3. **Register a member.** Record their name, optional phone and explicit agreement to join. Marketing permission is a separate optional choice. The app creates an opaque member card code and printable/shareable QR. A payer display name or masked phone is never used to merge customers.
4. **Collect from a member.** Find their exact card code, optionally scan their membership QR, and create a member-linked payment request. An available discount is reserved for that specific net-amount request. Show the normal collection QR. Confirmed payment consumes the reserved reward; pending or failed payments earn nothing.
5. **Link an existing sale.** Attach an eligible open payment request or confirmed receipt to the member. A request may have been created before signup, but its confirmed payment must occur after membership begins. A sale can belong to only one membership. Credits come from server-side receipt/refund records, once per source.
6. **Fulfil an item reward.** Select the available reward and confirm that the item was handed over. This records fulfilment and staff attribution without moving money. Item-specific earning such as “buy five coffees” is not automatic because collections do not contain basket items.
7. **Record an outside sale or return.** The owner, or a manager explicitly enabled for that shop, can attest a cash or external MoMo sale with its method and unique reference. Confirm that the sale was verified before recording it. These records affect loyalty reporting and earning, but never create a connected receipt, change a wallet or confirm provider settlement. Record an external return only after it has actually been made.
8. **Review the programme.** See members, repeat members, linked sales, rewards used, outstanding reward cost and activity. The report covers all recorded time. Recorded member sales and averages include attested external sales; the external-sales figure is an included breakdown, not an additional amount to add again. These totals do not establish incremental revenue or profit.
9. **Correct a record.** Owners and delegated managers can enter a reasoned progress adjustment in their authorised shop. Customer returns adjust loyalty eligibility. If an already-used reward loses its supporting purchase, a review is raised; no customer wallet is debited. A returned discounted sale keeps its voucher consumed and raises a review rather than paying its face value or automatically replacing it.
10. **Share or export.** Print or share the merchant’s programme terms or a member’s card. Owner CSV exports contain the matching authorised members and escape spreadsheet formulas. Sharing opens the device’s share controls or copies text; the app does not send bulk marketing messages.

## Roles and shops

| Role | Access |
| --- | --- |
| Owner | Configure, publish, pause, set budget, manage members, delegate shop adjustments, view reports and export. |
| Manager | Work within assigned shops; manual corrections and external-sale attestations require the owner to enable that shop. |
| Cashier | Find a member by exact card code, enrol a member with consent, link eligible collections and redeem valid rewards. No programme editor, bulk directory, reward budget or owner financial report. |
| Paired counter | Loyalty operations are bound to the unlocked cashier, shop and current shift. Locked counters cannot access member records. |

Programme progress can span the participating shops selected in the member’s rule version. Closing a shop day does not clear memberships, progress or rewards. Contact details and records from other merchant businesses remain outside the programme.

## Rules that preserve earned benefits

- Programme edits create a new rule version. Existing members keep the terms they joined under; new members join the latest version. The owner is shown this distinction before publishing an edit.
- Pausing stops new membership and new earning, while valid earned rewards remain redeemable. Payment time determines whether a sale occurred before or during a pause. Sales observed as paused or budget-blocked are not silently backfilled later; an authorised correction is explicit and audited.
- The budget covers redeemed reward cost plus currently available or reserved reward commitments. Unused expired or revoked rewards free that allocation. It is a cost control, not escrow or a bank balance. An item’s cost is the owner’s estimate.
- Reward purchases earn no new progress. Optional one-visit-per-day limits apply across the programme’s participating shops. Spending rewards preserve qualifying remainders and can issue multiple funded rewards.
- Partial refunds recalculate earning from the amount still paid. Full refunds revoke unsupported unused rewards once. Used rewards are retained in history and routed for review when needed.
- A reward reserved against a discounted payment request stays reserved while that request can still be paid. Cancelling, expiry and failed-payment reconciliation must invalidate the old collection before the reward becomes available again. A repeated confirmation cannot redeem it twice.

## Retry, storage and capacity

Every mutation carries an original request ID, actor/session scope and expected programme revision. If its response is interrupted, the interface keeps the original reference and checks or retries it. It does not silently create a second member, collection or redemption. Sensitive enrolment details stay in memory; a restored request can check the server receipt before asking for those details again.

Loyalty is stored inside the trusted merchant business document, separately from canonical money journals. The service derives earning and refund changes from confirmed records, uses the existing merchant revision and ledger-stamp guards, and projects only authorised fields. Browser-supplied progress, payment totals or role flags are not authority.

This prototype supports 500 members, 6,000 loyalty events, 3,000 rewards, 3,000 collection records and 6,000 mutation receipts per programme. It pauses new earning/setup proactively near history limits, around 450 KB of loyalty data or 1.1 MB for the business document, leaving space for outstanding reward redemptions, cancellations and refund adjustments. It does not prune history or idempotency receipts to make space. Export the records and contact support for a capacity migration.

Before publishing, remove every temporary `dist/__loyalty-qa*` file and rebuild the Worker so synthetic QA data cannot remain in its bundled assets. Preserve the existing consumer release manifests, APK checksum, merchant audience, Vercel aliases and environment settings.

## Connected consumer membership

Customers can join from a published shop in Campus Pay. To connect an existing membership, find the member and choose **Link customer’s Lumo app**. Confirm the customer is present and agrees, then let them scan the private one-time linking QR in Lumo. They review their original terms before linking. The code expires after ten minutes, is used once and clears from the merchant screen on leaving or changing operators. A printed membership card is not an account-linking credential.

After linking, confirmed Lumo purchases by that authenticated customer update this same membership automatically. Guest or external payments are not matched by phone or name. Consumer-created discounted payment requests belong to that purchaser; cashier-prepared QRs keep their existing presentation rules. The normal payment and refund safeguards remain in place. Customers show their card for item rewards, which staff still fulfil.
