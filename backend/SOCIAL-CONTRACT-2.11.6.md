# Lumo friends and in-app notifications, 2.11.6

POST `https://iwutbrljiiodamtyoorg.supabase.co/functions/v1/lumo-social` with the existing public `apikey`, `Content-Type: application/json`, and the signed-in consumer's Supabase `Authorization: Bearer` session. The server derives the owner and validates the live Auth session. This endpoint never transfers money or sends a message to another person.

Every reply is `{ok:true,data:{...}}` or `{ok:false,code,message}`. The client must discard late replies after account/session changes. Data is private to the signed-in personal account. No balances, spending, savings, online status or phone numbers appear on friend cards.

## Friends

`{action:'friends',operation:'list'}` returns `{friends:[{id,userId,handle,name,rail:'lumo',listName,available,revision}],limit:200}`. Both `id` and `userId` are the stable recipient UUID. Labels are exactly `Circle`, `Crew`, `Lumo Squad`, `Study Buddies`. A friend is a privately saved recipient, not a mutually accepted relationship or a financial group. An unavailable or closed account remains removable with `available:false`, a generic name and an empty handle.

Search uses the existing approved recipient resolver. Recheck that stable UUID through the resolver before entering payment review. Do not silently substitute a changed username or another account when a saved recipient is unavailable.

Save: `{action:'friends',operation:'save',recipientId:UUID,listName,requestId:UUID,revision?:integer}`.

Remove: `{action:'friends',operation:'remove',recipientId:UUID,requestId:UUID,revision:integer}`.

New saves omit `revision`. Updating or removing an existing friend uses its most recently loaded revision. A fresh save may re-add a previously removed recipient. The server keeps revision tombstones to reject stale updates/removals. Every mutation uses a new request UUID, reused unchanged on uncertain retry. A repeat UUID with different details is rejected. A completed retry returns the original saved result with `duplicate:true`; refresh the list after success so later changes are not replaced by a replayed snapshot.

Save returns `{record:friend,duplicate:boolean}`; remove returns `{record:null,removed:true,duplicate:boolean}`. Errors include `REVISION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `RECIPIENT_NOT_FOUND`, `SELF_FRIEND`, `FRIEND_LIMIT` and `RATE_LIMITED`. At most 200 active friends and 100 distinct successful changes per account per hour are allowed. Idempotent retries do not consume another change.

## Notifications

List: `{action:'notifications',operation:'list',page?:1,pageSize?:30}`. Page size is 1–50 and page is 1–10000. Response:

```json
{"notifications":[{"id":"opaque-source-reference","kind":"payment|partner|support","title":"Title","body":"Text","createdAt":"ISO","readAt":null,"target":{"kind":"activity|partner|support","id":"source-reference","reference":"optional receipt/case reference","role":"owner|partner","boxId":"optional box reference"}}],"unreadCount":1,"total":1,"page":1,"pageSize":30,"hasMore":false}
```

`target.role` and `boxId` apply only to partner events. Owner-side initial invitations may not yet have a `boxId`; reopen the preserved Money Box setup or current setup status. `target.id` for activity is the current user's approved transaction ID when available, otherwise the journal UUID. The receipt `reference` is also supplied. Clients should route to current activity/support/partner details rather than treating a notification as an authorization or proof that a pending action succeeded.

Read: `{action:'notifications',operation:'read',notificationId:string}` returns `{id,readAt}`. Repeated reads keep the original timestamp. Server-side read state is shared between devices. Support reads synchronize with the existing Support updates inbox. A no-longer-current partner revision returns `NOT_FOUND`; refresh the feed.

The feed uses committed transfers, merchant payments, refunds, test funding, current accountability partner revisions, and existing consumer support updates. A partner revision creates a new opaque ID; the feed represents the current request, not an immutable chat history. It never includes partner approval codes, balances, unrelated goals or another user's records. It does not infer pending/failed outcomes from missing payments. Existing activity remains the detailed source of truth. In-app polling and focus refresh are supported; OS push and background delivery are not implied.

## Server boundaries

`lumo_social` is a service-only RPC. The Edge Function validates the JWT with Auth `/user` before using its verified `sub` and `session_id`. SQL also checks the active session, banned/deleted/anonymous status, and active personal-account eligibility. All three private tables have RLS and deny direct anon/authenticated/service-role access. Friend writes serialize by owner and compare revision. Feed selection and read acknowledgement are always scoped to the authenticated owner. No public activity badges or unsolicited social notifications are generated.
