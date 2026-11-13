# Connected experience extras

Private handler `lumo_private.experience_command(p_command,p_payload)` is called after common live-session/active-account/idempotency guard. Mutations require durable `attemptId`. Only `person.request.pay` additionally requires `pin`; it is a real consumer transfer and must use the monetary pending journal. Metadata outcomes use root command+attempt+account envelope.

| Command | Payload | Result additions |
|---|---|---|
| `merchant.discover` | `{query?,code?,latitude?,longitude?}` | `shops:[{id,shopId,merchantId,name,businessName,code,location,campus,category,latitude,longitude,distanceKm}]`; only explicitly published active accepting shops. Coords optional, no location guessing. |
| `shop.discovery` | `{shopId,published,latitude?,longitude?,campus?,category?}` | Owner only `{shopId,discovery:{shopId,code,published,latitude,longitude,campus,category}}`. Omitting coords preserves them; sending both null clears them. Publication default is false. |
| `shop.discovery.get` | `{shopId}` | Owner only same discovery metadata; creates nothing. Unpublished shops are never discoverable by guessed shop code. |
| `favourite.list` | `{}` | `favourites:[{id,handle,displayName,label,createdAt}]` current owner only. |
| `favourite.save` | `{handle,label?}` | `favourite` exact active other handle, max 50, update existing rather than duplicate. |
| `favourite.delete` | `{favouriteId}` | `favouriteId,deleted:true`, owner only. |
| `person.request.list` | `{}` | `paymentRequests:[{id,requesterUserId,payerUserId,requesterHandle,payerHandle,requesterName,payerName,amount,note,status,expiresAt,journalId,createdAt}]`, both parties only. |
| `person.request.create` | `{payerHandle,amount,note?,expiresAt?}` | `requestId,paymentRequest`; current user requests exact amount from another Lumo handle. Default expiry 24h, max 7 days. No debit. |
| `person.request.pay` | `{requestId,amount,pin,budgetCategoryId?}` | `requestId,paymentRequest,receipt`; only nominated payer, exact amount locked, single use, actual transfer to requester. Receipt type `transfer`; enrichment `personalRequestId`. Root should call normal planning payment hook for actual source/hacks. |
| `person.request.cancel` | `{requestId}` | `requestId,paymentRequest`; requester or nominated payer can cancel unpaid request. |
| `learning.get` | `{}` | `progress:[{moduleId,completed,score,revision,updatedAt}]`. User learning records only; never modifies money/eligibility. |
| `learning.save` | `{moduleId,completed:boolean,score:0..100,revision}` | `progress` record; optimistic concurrency, module `[a-z0-9-]{1,60}`, no earned cash. |
| `chat.history` | `{}` | `messages:[{id,question,answer,createdAt}]` current user only, latest 100 chronological. |
| `chat.clear` | `{}` | `cleared:true`. Explicit clear by current user only. |

`experience_chat_record(actor,question,answer)` helper appends actual grounded `money.chat` answers. Parent calls it on successful grounded answer, never any fabricated conversation. No extra client POST required. Private `person_request_postings(journal_id,request_id)` provides receipt enrichment. All other new tables use private RLS/revokes.

Internal scheduled transfers remain unavailable until a safe server executor and PIN-authorised recurring mandate are implemented. No synthetic scheduled-success records are created.

## Resumable authored learning

`learning.save` may include `state` with only `{questionIndex?,correct?,path?,phase?}`. Indices/correct values are integers 0–100; `path` has at most 100 integer choices 0–2; phase is `choice`, `consequence`, `completed` or `lesson`. State JSON is bounded to 2,000 bytes. A completed phase requires `completed:true`. `learning.get/save` returns each record's `state`. Omitting state on an update preserves the prior position; revision checks prevent another device's progress being overwritten.

Native lessons use `{questionIndex:0..2,correct:0..2,phase:'lesson'|'completed'}`. Campus stories use `{path:[0..2],phase:'choice'|'consequence'|'completed'}` with three actual choices. Scores/progress never create rewards, test funding or payment authority.
