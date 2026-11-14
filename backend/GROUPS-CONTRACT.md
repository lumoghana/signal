# Connected Groups API

All commands use `lumo_rpc` and authenticated shared identities. Mutations require an `attemptId`; monetary authorisation also requires the actor's `pin`. Amounts are integer pesewas. Group funds are a separate ledger account and never personal available money. Responses include the usual `ok/sandbox/currency/account` envelope supplied by the common dispatcher.

| Command | Payload | Response additions |
| --- | --- | --- |
| `group.list` | `{}` | `groups: Group[]` (active memberships and private invitation summaries) |
| `group.get` | `{groupId}` | `group: Group` (active member only; group messages, proposals and activity) |
| `group.create` | `{name,description?,target?,deadline?:ISO8601,approvalCount?:2,approvalThreshold?:10000}` | `groupId,group` |
| `group.invite` | `{groupId,handle}` | `groupId,group` (owner invites an existing exact handle) |
| `group.respond` | `{groupId,accept:boolean}` | `groupId,accepted,group?` (only invitee, explicit consent) |
| `group.join` | `{code}` | `groupId,group` (unguessable owner-shared join code, explicit user action) |
| `group.message` | `{groupId,text}` | `groupId,group` |
| `group.contribute` | `{groupId,amount,pin}` | `groupId,receipt,group` |
| `group.payout.request` | `{groupId,recipientHandle,amount,note?,pin}` | `groupId,proposalId,proposal,group` (no debit yet) |
| `group.payout.approve` | `{groupId,proposalId,pin}` | `groupId,proposalId,proposal,group,receipt?` (receipt only on final approval) |
| `group.payout.cancel` | `{groupId,proposalId}` | `groupId,proposalId,group` (requester or owner) |
| `group.member.remove` | `{groupId,handle}` | `groupId,group` (owner; cannot remove while a payout is pending) |
| `group.leave` | `{groupId}` | `groupId,left:true` (non-owner, no pending payout) |
| `group.cancel` | `{groupId,pin}` | `groupId,group,refunded,receipts: Receipt[]` (owner; atomically returns remaining funds pro-rata to original contributors, no pending payout) |
| `group.close` | `{groupId}` | `groupId,group` (owner, zero group balance, no pending payout) |

`Group = {id,name,description,target,deadline?,balance,accountId,status,ownerUserId,role,membershipStatus,approvalCount,approvalThreshold,joinCode?,memberCount,contributed,createdAt,members?,messages?,proposals?,activity?}`. `joinCode` is shown only to owner, never in pending invitation summaries. Detailed members are `{userId,handle,displayName,role,status}`. Messages are `{id,kind:'message'|'system',text,handle?,displayName?,createdAt}`. Proposal is `{id,recipientHandle,recipientName,amount,note,requestedBy,requesterHandle,status,requiredApprovals,approvals,approvedBy:string[],journalId?,createdAt}`.

A payout requires **one other member's approval** at or below `approvalThreshold`, otherwise `approvalCount` other members. The requester cannot approve their own request. Eligible voters are snapshotted at proposal creation; new members cannot approve an older request. The UI should show required approvals before request submission. A group needs at least two active members for any payout, and enough other eligible voters for the selected mandate. No approval-count or threshold changes are allowed after creation. Group wallet postings and system messages happen atomically. A pending proposal expires after 24 hours; expired proposals cannot be approved. Group balance is checked again on final approval. External bank/MoMo payouts are unavailable in this bank-free pilot.

A deadline is an optional future ISO8601 timestamp. Contributions are rejected after it passes; group history and mandate-governed payouts remain available. Owner cancellation returns the **remaining** balance in proportion to each original contributor’s historical contribution, including people who have left. Deterministic largest-remainder allocation preserves every pesewa. Cancellation posts immutable `group_refund` receipts atomically and changes status to `cancelled`. No request may be pending during cancellation. No editable recipient or arbitrary external refund is allowed. A cancelled/closed group retains history and cannot receive further contributions.

The threshold is cumulative per recipient over the past 24 hours, counting both paid and unexpired pending payout amounts from this group. Splitting a large payout into smaller requests therefore cannot avoid the higher approval count. The server returns `requiredApprovals` for the exact proposal; clients should display that authoritative value.
