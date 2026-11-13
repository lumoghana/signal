# Connected operations contract

All commands use the guarded `lumo_rpc` dispatcher. Mutations need durable `attemptId`; the server binds it to actor and payload. Money remains integer pesewas and test funds.

| Command | Payload | Response |
|---|---|---|
| `merchant.get` | `{}` | `merchants[]`: owners see aggregate balance and all shops; staff see only assigned shops, `role`, no aggregate balance. Each shop has role, netCollected, accepting, current shift. |
| `staff.list` | `{merchantId}` | Owner-only `staff[]` with id, shopId, handle, displayName, role, status; no contacts. |
| `staff.invite` | `{shopId,handle,role:'manager'|'cashier'}` | `membership` pending. Exact active Lumo handle; owner only. |
| `staff.invitations` | `{}` | `invitations[]` addressed to current user. |
| `staff.respond` | `{membershipId,accept:boolean}` | accepted active or declined membership. No access before consent. |
| `staff.remove` | `{membershipId}` | removed membership; owner only; active shifts ended. |
| `shift.start` | `{shopId}` | `shift` for current user; owner/assigned staff. |
| `shift.end` | `{shopId,note?}` | closed own `shift` and totals. |
| `shift.list` | `{shopId}` | Own shifts for cashier; shop shifts for owner/manager. |
| `merchant.settings` | `{shopId,name?,accepting?,location?,published?,latitude?,longitude?}` | Owner-only updated `shop`. |
| `merchant.search` | `{query?,latitude?,longitude?}` | `shops[]` restricted to published, active, accepting shops; optional `distanceMetres`. |
| `request.create` | `{shopId,amount,note?}` | Request for owner, manager or cashier in authorised shop. |
| `merchant.close` | `{shopId}` | Owner/manager closes day without removing money. |
| `payment.refund` | `{paymentId,amount,pin}` | Owner or authorised manager refunds original consumer. A manager's aggregate refunds on original payment above GH₵100 return `refundProposal` with `status:'pending'`, no receipt/debit. Cashiers cannot refund. |
| `refund.list` | `{merchantId}` | Owner/manager sees scoped pending/refunded/rejected proposals. |
| `refund.decide` | `{proposalId,approve:boolean,pin}` | Owner-only. Approval posts original-customer refund once; rejection posts no money. |
| `notification.list` | `{}` | Current user's `notifications[]` only, latest first. |
| `notification.read` | `{notificationId}` | Marks own notification read. |
| `profile.get` | `{}` | displayName, handle, preferences. |
| `profile.update` | `{displayName?,preferences?:{theme?,hideBalance?,sound?,reducedMotion?}}` | Current profile only. |
| `security.pin` | `{oldPin,newPin}` | Changes payment PIN after server verification and throttling; no credential returned. |
| `security.sessions` | `{}` | Current user active sessions: id, timestamps, current flag. No tokens/IP/contacts. |
| `security.session.revoke` | `{sessionId,pin}` | Removes own other session after payment PIN; current session uses Sign out. |
| `support.create` | `{subject,body,reference?}` | Private `ticket`. |
| `support.list` | `{}` | Current user's private `tickets[]`. No simulated staff response. |

`operations_command(command,payload)` returns null for unrelated commands. Root dispatch must route listed overrides here before legacy command, and verify PIN for `payment.refund` and `refund.decide` approving. Parent wrapper persists metadata outcomes including pending refund proposals, not just receipts. Request proposals can later be recovered via `attempt.lookup` without creating another proposal. Final money result receipt actor is approving user. Shop QR receipts remain shop-attributed unless tied to a fixed request created by an identified cashier.

Notifications use private server inbox; receiving while app is open can poll. No OS background delivery is claimed.
