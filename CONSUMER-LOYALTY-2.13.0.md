# Your rewards: Lumo 2.13.0

## Shop payment correction, 17 November 2026

The consumer website's **Pay this shop** button now passes the selected shop's explicit identity to the authenticated payment quote. Previously the internal ID was interpreted as an entered shop code, causing an existing published shop to report “shop not found.” Entered shop codes, QR codes, reward payments and payment approval continue through their existing quote checks. The web suite passes 1,877 tests, including the actual directory-button-to-payment handoff. Android 2.13.0 already uses the explicit identity correctly; 38 native framework cases confirm the directory button opens the amount screen without moving money or requesting approval. Its signed APK is unchanged.

Customers can track the merchant programmes they join through Pay → Campus Pay → Your rewards. A shop’s Campus Pay details also open its programme. Each card shows the merchant’s branding, progress, earned rewards, expiry dates, participating shops and the member’s original terms. The merchant owns and controls the programme.

## Joining and linking

A signed-in personal Lumo account can review a published shop’s programme and explicitly join. Membership consent is required. Marketing permission is a separate, optional choice. Joining shares the customer’s Lumo display name with that merchant, without sharing balances, budgets or other merchants’ memberships.

An existing member keeps their original progress, rewards and rule version. In the merchant app, the shop team finds the member, chooses **Link customer’s Lumo app**, confirms the customer is present and agrees, then creates a private one-time QR. The customer scans it in Lumo, reviews the existing terms and confirms the link. The code expires after ten minutes and can be used once. Its raw value stays in memory; the merchant service stores a hash. A public membership card or QR cannot claim a membership.

The consumer and merchant views refer to the same membership. Names and phone numbers do not automatically merge customers, and a customer’s account cannot silently take over another membership.

## Purchases and rewards

Qualifying, confirmed Lumo merchant payments made after linking update the authenticated purchaser’s membership automatically. A group-funded payment belongs to the authenticated purchaser for loyalty purposes, rather than being awarded to the group wallet’s owner. Guest mobile money and external sale records have no verified personal Lumo identity; the shop team can associate eligible records explicitly.

For a discount, the customer chooses a participating shop and purchase amount. The service reserves the reward and creates an immutable request for the amount after discount. The normal quote, review, conditional Pause and payment approval still apply. The review shows the purchase amount, discount and amount to pay. Progress and reward value are never added to available money.

An existing fixed cashier QR retains its original amount. Another discount cannot be layered onto it in the consumer app. The shop team can prepare a correctly discounted collection, or the customer can start an eligible fresh shop payment. Consumer-created reward requests are bound to that purchaser at the canonical payment journal, including direct legacy payment calls.

Item rewards are handed over by the shop team. Customers show their membership card; staff confirm fulfilment. The consumer app does not mark goods as handed over or inspect stock.

## Interrupted requests and returns

An interrupted preparation or payment keeps its original reference. Both apps check or recover that original outcome instead of silently generating another collection. A valid earned reward remains reserved while its original discounted request can still be paid. Confirmed cancellation or expiry invalidates the old request before releasing the reward. If payment wins a cancellation race, the reward remains used.

Refunds recalculate qualifying progress from the amount still paid. Unsupported unused rewards can be revoked. A reward already used remains in history and can require merchant review. Returning a discounted purchase does not pay out the coupon’s face value or automatically replace it.

Private views and linking codes clear on account changes, sign-out and counter handover. Customers see their own memberships, while shop staff retain their existing role and shop boundaries.

## Prototype scope

The programme’s funding limit tracks reward cost and outstanding commitments; it does not reserve or debit merchant money. The existing prototype member cap is 500 per merchant business, with proactive history limits that preserve terminal adjustments and existing earned benefits. Automatic marketing and item stock integration are not connected.

Bank, MoMo and NIA services remain simulated. Existing camera capture and stored-face matching are separate from deliberately simulated liveness. This release does not establish production provider or physical handset assurance. Web, Android artifact and deployment evidence are recorded together in source provenance when publication completes.
