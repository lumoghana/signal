# Approved experience shared service contract

The service runs the unchanged approved v66 JavaScript domain engine. The client renders the existing screens and installs each returned snapshot. It never imports local demo money or sends a replacement state. All amounts are integer pesewas and all posted funds are explicitly pilot test money.

## Transport and session

POST `https://iwutbrljiiodamtyoorg.supabase.co/functions/v1/lumo-approved` with JSON and the existing public publishable `apikey`. Authenticated calls also send `Authorization: Bearer <access_token>`.

* `{action:"register", handle, displayName, phone, password, pin}` creates an account. Approved handles support letters, numbers, underscore, dot and hyphen, 3–30 characters, starting with a letter or number. Phone is a unique Ghana pilot alias, not verified identity.
* `{action:"login", handle, password}` signs in. Registration/login return `session` with Supabase `access_token`, `refresh_token`, expiry and `user`, plus the snapshot envelope below. Raw password and PIN are transient and must not enter model persistence, logs or action payloads.
* Refresh sessions through the existing Supabase `/auth/v1/token?grant_type=refresh_token` endpoint.
* `{action:"recover",type,payload,attemptId}` reads the original attempt without PIN. It returns the snapshot envelope plus `found`. An absent attempt is not evidence that an in-flight request cannot still commit; retain the same reference.
* `{action:"snapshot"}` reads current private personal state, visible group invitations/memberships and authoritative ledger balances/activity.
* `{action:"resolve", query}` resolves an exact handle or registered phone alias. Returns `{ok:true,recipient:{id,userId,handle,name,phone,rail:"lumo"}}`. Never turn typed names or sample contacts into actual recipients.
* `{action:"action", type, payload, attemptId, pin?}` applies one original `applyAction` action. Keep a stable 10–100 character attempt ID across network retries. `payload.idempotencyKey` is optional; service uses `attemptId` as its authoritative idempotency reference. `pin` is top level only. Do not send actor/participant overrides or client settlement outcomes.

Every successful snapshot/action response is `{ok:true,sandbox:true,currency:"GHS",state,result,account,revision,receipts}`. `state` follows approved web v66 `createEmptyState`/`migrateState`, including original group, planning, learning and IOU fields. The current actor is rendered as `"me"` in group records; others use their authenticated user UUIDs. Group `localSimulation:false` disables participant/outcome controls. `account` is `{id,userId,handle,displayName,balance,currency,sandbox:true}`. `receipts` contains canonical shared-ledger receipts. `result` is the original engine result, augmented with posted receipts when relevant.

An authoritative action failure is `{ok:false,code,message,result:{ok:false,message},state?,account?,revision?}`. Keep the existing review/form open and show its error. Network/timeouts are unknown outcomes: retain attempt ID and fetch/retry; never show local success or debit optimistically. Conflict retries are handled server-side. Only navigate to success after `ok:true` and `result.ok:true`.

## Approved action mappings

Pass original action names and payloads unchanged except these identity/rail bindings:

* Personal `payment` must use `rail:"lumo"` and `recipient` from `resolve`, or `rail:"merchant"` with a real shared `shopId`/`requestId`. Other banks/MoMo/bills stay unavailable. The service supplies success settlement only after ledger posting.
* `fund` is explicit test funding. It never represents real bank or mobile money funding.
* `createGroup.members` accepts original `{id,name,phone,role}` records. The local creator is `id:"me"`. Other members must include a resolvable phone or handle. `inviteGroupMember`/`addGroupMember` resolves `phone` or `handle`; client-provided UUID alone does not grant membership. Original mandate approver selections are remapped to real identities.
* `acceptGroupInvite`, `acceptGroupMandate`, review, approval, execution, evidence, role changes and chat use original payloads. Invitations expose membership/mandate details, while chat and contribution history require acceptance. Approval does not execute; `executePayout` is separate. Payout `rail:"lumo"` resolves `destination` as handle/phone; unconnected rails fail without moving money.
* Box actions retain `boxId` strings; backend maps them to real ledger accounts. IOU and external cash records remain personal metadata unless an original payment action posts an actual internal transfer.
* Simulation-only actions (`setGroupParticipant`, demo seed, client settlement/reversal outcomes) are rejected. Do not call them from connected screens. No success receipt is fabricated for unavailable providers.

`createMoneyRequest` resolves the original name/handle/phone to a real recipient and mirrors the request into that account. Snapshot request records include `senderHandle`/`recipientHandle`. Paying an incoming request binds its original sender and fixed amount; only an actual ledger posting marks it paid for both people. Expense splits create similarly bound requests for the other registered members; canonical paid shares update the original split. `settleSplitShare` with `method:"lumo"` requires a confirmed `receiptTransactionId` and allocates that existing incoming receipt without another credit; IOUs and splits share the same unmatched-receipt capacity.

`updateCardSettings {cardId,name,limit}` validates both original rename/limit actions in one commit. `setExpectedIncome` accepts an optional `buffer` and applies the original settings validator atomically. Card issuance/purchases/refunds stay explicitly unconnected.

The backend owns full personal metadata persistence and all shared group canonical records. Clients should refresh after foreground/resume and poll while group conversation/payment status is visible. Install `state` atomically before rendering the existing screen again.

## Actual accountability partners

Snapshots return a separate redacted `partnerInbox` for records addressed to the authenticated partner. `{action:"partnerInbox"}` refreshes that scoped list. `{action:"partnerRespond",id,decision:"accepted"|"declined"}` runs the original partner transition under the bound partner identity and canonical CAS revision. The owner cannot impersonate a partner. Initial confirmation codes are visible only after that partner accepts; fresh withdrawal codes belong only to the bound partner and exact original box/request/amount. The owner's snapshots/results never include code secrets. Owner forms keep original `sendBoxPartnerInvitation`, `verifyBoxPartnerInvitation`, `requestBoxRelease`, `verifyBoxPartnerCode` and `completeBoxProtectionChange` actions. Unconnected verified-support simulator decisions remain unavailable.

Original scheduled rules run with server dates and saved plan, floor, cap, pause and recovery checks. Snapshot/foreground processing applies due rules and original income savings rules to actual new incoming ledger receipts once. It does not require a new PIN for each saved rule occurrence. Bank/MoMo automation and provider settlement cannot be simulated.

## Device proof

Snapshots advertise `capabilities.deviceProof:true`. PIN remains the fallback. A local biometric pass alone is never a server payment authorization.

* `{action:"registerDevice",deviceId,publicKey,algorithm:"ES256",pin}` validates the base64url SPKI P-256 public key and registers it after PIN step-up. No private key or biometric template reaches the service.
* `{action:"challenge",deviceId,type,payload,attemptId}` returns `{ok,challengeId,challenge,expiresAt}`. Decode `challenge` from base64url and sign those exact bytes using Android `SHA256withECDSA`.
* Submit the unchanged original action/attempt with `deviceProof:{deviceId,challengeId,signature}`; `signature` is base64url DER. Server verifies SHA-256/ECDSA, user, live session, device, original payload fingerprint, attempt and 60 second expiry. Atomic commit consumes it once. The same committed attempt may recover/replay its prior receipt without using the proof again.
* `{action:"verifyPin",pin}` checks the server PIN without storing a reusable authorization token; the mutation still sends the transient PIN or its bound device proof.
* `{action:"changePin",currentPin,pin}` updates the server PIN. Shared username/password changes and demo recovery codes remain unavailable, with an explicit existing-form error and existing credentials unchanged.

## Deployment

New SQL and function are staged for review only. Existing frozen migrations and original UI are not replaced. Do not point release clients at the endpoint until migrations, function deployment, cross-identity ledger checks and device installation checks pass.
