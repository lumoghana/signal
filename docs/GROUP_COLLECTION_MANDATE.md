# Group collection mandate

The collection is a distinct account view under its organiser, separate from Everyday money and personal Money Boxes. Every member sees the same mandate and accepts it before the collection opens for contributions. A saved reusable group is only a list of people; it carries no mandate or spending authority into a new collection.

## Agreed rules in the prototype

- Membership and roles are fixed for this collection. Each named approver has one vote. Contributors can add money and follow the shared records without payment approval authority.
- The organiser can keep majority approval, require everyone, or name specific approvers and a required approval count. Named mandates require at least two different approvers and at least two approvals. The organiser only has a vote if selected. A majority is more than half of the full agreed membership, never a majority of people who happen to respond.
- The organiser accepts when creating the collection. Other members' acceptance is demonstrated only through an explicitly labelled member simulation. Creating a record never asserts that an invitation was delivered or another person agreed.
- Every member must accept the mandate before contributions or payment proposals open.
- Each payment proposal specifies its recipient, amount, fee and purpose. Approvals bind to those details, the membership and the mandate version. A changed proposal requires fresh approval.
- Proposals reserve collection funds and expire after 48 hours. Silence is never approval. Only an authorised, sufficiently funded proposal can record a sample payment, once.
- Reaching the target or deadline stops contributions. It does not prevent agreed spending of the existing collection balance.
- The organiser may cancel under the agreed mandate. Pending proposals are cancelled, and unspent funds may be returned to the original contribution sources in proportion to their contributions. Completed spending cannot be refunded from money that is no longer in the collection.
- Contributions, acceptance, approval, sample spending and refunds retain their records. Earlier collections without a mandate keep their history; new acceptance is never invented for them.

## Invited customer journeys

An invitation identifies the organiser, pot, target, deadline, member's role, named approvers and exact required count. The complete mandate is available before acceptance. An approver agrees to contribute and approve payments; a contributor agrees to contribute and follow the pot. Acceptance joins the pot under the customer's own profile. Declining does not remove a member or weaken the mandate. Expired, closed or changed invitations cannot be accepted.

Joined members see contributions, target progress, collection balance, spending, pending reservations, proposals and activity. Approvers may approve only as themselves. Contributors have no approval action or authority. The organiser alone proposes and executes payments or cancels the collection in this version. Invited customers cannot switch into another member's identity or use organiser controls.

The prototype has explicit sample invitation scenarios for each role. Joining these examples populates predefined sample group activity so users can explore a funded pot and a payment awaiting approval. This does not deliver a real invitation, imply another customer's consent, create a bank account or debit the customer's personal funds. The existing one-device and bank-integration limits below still apply.

## Live product boundary

This static prototype stores records on one device. Its collection references, contributions, member actions and disbursements are samples. It creates no bank account, sends no real invitation or payable link, verifies no remote member and moves no real funds. Personal account balances and payment authorisation remain governed by the existing financial engines.

For a live product, the partner bank must recognise the mandate and enforce it across all withdrawal routes, account closure and mandate changes. The custody contract must establish legal ownership, contributor rights, refunds and treatment of the organiser's liabilities. Approval evidence, identity checks, server authorisation, idempotency and bank reconciliation must be enforced by trusted services. A client-side approval record alone cannot protect bank funds.
