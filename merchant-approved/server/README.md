# Shared Lumo Merchant sandbox

This Worker API connects merchant accounts, staff phones and a separate test student wallet through D1. All amounts are integer pesewas. Every response declares `sandbox: true`, `bankConnected: false` and `smsConnected: false`. The generated account numbers are test identifiers, not provisioned bank accounts.

## Storage and concurrency

`drizzle/0000_shared_sandbox.sql` remains unchanged. The append-only `0001_sharded_state.sql` adds per-record shards, a storage revision and a transient commit guard. Request handling never creates or alters tables. Existing global records are copied atomically and the old document is retained as a fenced backup, so an older writer cannot overwrite the migration.

Merchant histories, users, sessions, invitations, devices, wallet cores, wallet entries and retry records have separate storage allowances. Mutations guard the complete merchant/wallet record sets they change or include in a response, including session and access dependencies, exact retry IDs and newly inserted records. Changed records, wallet debits, merchant receipts and retry references commit in one D1 transactional batch. A competing writer within those scopes causes a bounded retry from a fresh snapshot; unrelated merchants can commit independently. Username allocation remains transactionally unique across businesses. An oversized merchant cannot consume the whole ecosystem’s history allowance or block an unrelated merchant’s writes.

The prototype still reconstructs a network snapshot for reads. Its global clock now numbers responses rather than rejecting unrelated writes. Production scale still needs indexed tenancy queries, an append-only financial ledger, wider load tests and provider reconciliation.

## Access and request contract

- Export: `handleAPI(request, env)` from `server/api.js`; returns `null` for non-API URLs.
- Binding: `env.DB` is the Sites-managed D1 database.
- POST requests require JSON, `X-Lumo-Request: 1`, and a matching Origin when an Origin is supplied.
- Merchant and student sessions use separate HttpOnly, Secure, SameSite=Lax cookies. Session tokens and recovery keys are stored as hashes. Password records use unique PBKDF2-SHA256 salts and 100,000 iterations.
- The server derives role and shop assignments from its authenticated directory. Client-supplied actors are ignored.
- Staff snapshots omit merchant settlement details, opening balance, unassigned shops and other users' invitations. Public directory and QR quote responses expose only merchant acceptance information.
- Password reset needs the private recovery key generated on signup/invitation acceptance. The public browser-demo code `123456` cannot reset shared accounts. Regenerating the key requires the current password and invalidates old keys and pending recovery requests.
- New settlement and settlement-destination changes require a single-use, three-minute current-password proof. Retrieving an existing settlement by its exact retry reference needs the authenticated owner and matching original amount/destination; it does not reserve funds again or consume another proof.

## Main routes

| Route | Purpose |
|---|---|
| GET `/api/health`, `/api/session`, `/api/business` | Storage availability, signed-in account and authorized merchant state |
| POST `/api/signup`, `/api/migrate` | Idempotent owner creation; consented, password-authorized import into that owner’s empty shared business |
| POST `/api/auth/login`, `/logout`, `/password` | Sign-in, sign-out and password change |
| POST `/api/auth/recovery/start`, `/recovery/complete`, `/recovery-key`, `/username`, `/phone`, `/step-up`, `/transfer` | Recovery, key regeneration, account continuity and owner controls |
| POST `/api/action` | Authorized business-domain actions |
| POST `/api/simulate` | Owner-only, clearly marked synthetic payment scenarios |
| GET `/api/directory`, `/api/payments/quote` | Campus-wide merchant discovery and cross-device QR/code/account lookup |
| GET `/api/student?cursor=…&limit=25` | Cursor-paged wallet activity |
| POST `/api/student/open`, `/api/student/fund`, `/api/payments` | Separate test wallet, explicit test funding and atomic merchant payment |
| POST `/api/invitations`, `/api/invitations/accept`, `/:id/resend`, `/:id/revoke` | Individual staff invitations |
| POST `/api/users/:id`, `/api/users/:id/reset`, `/api/sessions/:id/revoke` | Owner user management and session controls |
| GET/POST `/api/devices`, POST `/api/devices/:id` | Receiving phone pairing, heartbeat, testing, enable/disable and revocation |

`GET /api/invitations/:token` is the public invitation lookup. Recovery keys are returned once after creation/regeneration. New key issuance creates a durable pending-save checkpoint and an opaque generation reference. POST `/api/auth/recovery-key/ack` with that exact reference clears the checkpoint; retries are idempotent, while a stale generation is rejected. Existing v6 users without a checkpoint remain compatible. API consumers must display them without writing them into local drafts or logs.

Signup and history import require a stable `attemptId`. A repeated signup with matching credentials and payload resumes the same account; an existing private key is never reissued. History import additionally requires the signed-in owner, current password and `confirmImport: true`.

Test funding requires `confirmSandbox: true`. The Campus Pay client always sends a stable `attemptId` for safe retry. Payments always require an `attemptId`; retrying an ambiguous request with the same ID cannot debit twice. Student payment status is determined on the server. A processing request cannot create a second wallet debit.

Settlement creation requires a stable `attemptId`, amount and saved business destination. Concurrent retries return one original settlement, including its current processing, paid or failed outcome. The same reference cannot be redirected after a destination change. A new reference still needs a fresh proof.

Accepted invitations support replay with their token and the accepted account’s current matching credentials. Replay uses current shop assignments, rejects suspended accounts and returns a fresh session with `keyUnavailable: true`; it never returns the original private key. The client guides password-authorized key replacement and acknowledgement.

User `active` updates require a JSON boolean. The owner cannot be suspended through status coercion or a profile update.

Refund approval decisions require an actual JSON boolean. Missing values, strings, numbers, nulls and structured values are rejected before changing funds.

Refund requests require a stable `attemptId` and matching amount/reason on retry. They credit the original test student wallet in the same state update as the merchant debit. Settlements reserve or release simulated merchant funds only; no payout is submitted to a bank. Statement matching and support records belong to the merchant's shared sandbox workspace and do not contact a bank or external service desk.

## Verification

Run `node --test tests/server.test.mjs`. The tests use the project's Node SQLite D1 adapter and separate cookie clients to exercise cross-device identity and payments, concurrent credits/debits, insufficient-fund races, retry idempotency, recovery and ownership handover.

Public account-number shop choices also require publication, including explicitly selected sibling IDs. Exact shop QR testing remains available before publication.

Directory entries require deliberate shop publication after confirmed location, QR readiness, an authorized operator and a freshly tested audible receiving phone. Closed published shops remain discoverable with their closed status. Receiving phone revocation also revokes its bound login session. Staff receive a privacy-safe shop readiness summary rather than colleagues’ device identities.

Version 8 enforces JSON booleans for shop opening, acceptance, publication and activation. Receiving heartbeat `announcementFailed: true` latches a fault; later ready heartbeats cannot clear it. A successful explicit sound test clears the fault. Browser clients enforce pending recovery-key acknowledgement across all merchant navigation and clear the registered snapshot on sign-out or revocation.

## Version 9 request safeguards

- Student payment and funding `amount` must be a JSON number containing a positive safe integer in pesewas; strings, booleans, arrays, nulls and objects are rejected. The current client supplies `walletId`, which must match the authenticated student wallet or the API returns `409 WALLET_CHANGED` before mutation. Older clients remain compatible when no wallet identity is supplied. Current clients retain and enforce the identity for every unresolved attempt.
- Public receiving-device records expose `failureVersion`. A failure heartbeat advances it. A sound-test acknowledgement supplies `expectedFailureVersion` captured before the test audio; a mismatch returns `409 AUDIO_TEST_STALE`. Initial fault-free version-zero tests remain compatible with older clients.
- Revoked-device pairing or enabling requires an owner session created after the revocation. Restored devices remain muted until an explicit successful sound test.
- History imports reject duplicate record identifiers and invalid financial links before committing. Full source IDs are mapped to unique short IDs without truncating the source key; valid historical operator snapshots remain supported.
