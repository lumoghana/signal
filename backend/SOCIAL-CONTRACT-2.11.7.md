# Private friend groups, Lumo 2.11.7

Endpoint: the existing authenticated `lumo-social` Edge Function. Notifications keep their 2.11.6 contract. These groups organize the owner's saved recipients only. They do not invite anyone, grant access to other accounts, or create a shared financial group.

## Protocol and owner boundary

Every new friends request contains `action: "friends"` and `schemaVersion: 2`. The server derives the owner and current session from the verified sign-in token. Client-supplied actor, session or owner fields are rejected. An omitted version marker uses the 2.11.6 protocol; an explicit version other than the number `2` is rejected. New clients must not fall back to the old protocol.

All replies retain `{ok: true, data: ...}` or `{ok: false, code, message}`. Every successful list response has this shape, including empty lists:

```json
{
  "schemaVersion": 2,
  "friends": [],
  "groups": [],
  "limit": 200,
  "groupLimit": 50
}
```

The friends and groups arrays are read from one database snapshot. A group is `{id, name, revision}`. Each friend keeps its stable `id`, `userId`, current `handle`, current `name`, `rail: "lumo"`, `available` and `revision`, and adds `groupId` and `listName`. An assigned friend has the group's UUID and its current name. An ungrouped friend has `groupId: null` and `listName: null`. Unavailable accounts retain a removable saved record with `name: "Unavailable Lumo account"`, `handle: ""` and `available: false`.

## Operations

All operations below also send `action: "friends", schemaVersion: 2`.

| Operation | Additional request fields | Successful data |
| --- | --- | --- |
| `list` | None | Complete friends and groups snapshot |
| `save` | `recipientId`, `groupId` as a UUID or explicit null, `requestId`; current friend `revision` for an existing friend | `{record: friend, duplicate: false}` |
| `remove` | `recipientId`, current friend `revision`, `requestId` | `{record: null, removed: true, duplicate: false}` |
| `createGroup` | `name`, `requestId` | `{record: group, duplicate: false}` |
| `renameGroup` | `groupId`, `name`, current group `revision`, `requestId` | `{record: group, duplicate: false}` |
| `deleteGroup` | `groupId`, current group `revision`, `requestId` | `{record: null, removed: true, duplicate: false}` |

`requestId` is a fresh UUID for a new mutation. Freeze it with the exact normalized payload when the outcome is unknown, and reuse it for a retry. Reusing the UUID for different details is rejected. Successful retries return the original acknowledgment with `duplicate: true`; that historical acknowledgment is not a current list snapshot. Refresh the complete list after success or replay. Refresh on revision conflicts, and fence late replies by signed-in owner and request generation.

Creating a new friend requires a currently available personal Lumo recipient. An already saved, active record can be reassigned or removed while its recipient is unavailable. A removed unavailable friend cannot be added again until its recipient is available. Selecting a friend for a payment still requires the existing authoritative recipient lookup and normal payment review and authorization.

Deleting a group detaches every associated saved friend, increments each affected friend revision, and retains the friend record. The group becomes a tombstone. Renaming preserves its ID and members and increments its own revision. A different group may later use the deleted name, but it receives a new ID.

## Group names

Normalize with ECMAScript `trim()` followed by Unicode NFC. Accept 1 through 40 Unicode code points after normalization; UTF-16 code units are not the length measure. Preserve interior spaces. Allow U+200C and U+200D joining characters for languages and emoji sequences. Reject all other characters in Unicode categories `Cc`, `Cf`, `Cs`, `Zl`, and `Zp` after trimming: controls, format controls including bidi and zero-width controls, unpaired surrogates, and embedded line/paragraph separators. A name must contain some text after removing U+200C/U+200D and trimming; whitespace/joiner-only names are invalid. Family and profession emoji sequences remain supported, and their joiners count toward the length limit.

Exact cross-platform trim points, forbidden ranges and example vectors live in `tests/fixtures/social-group-names.json`. The server checks case-insensitive uniqueness within the owner using the database's `lower(name)` comparison. Clients must treat its duplicate error as authoritative. Other owners may use the same name. There are at most 50 active groups and 200 active saved friends per owner.

## Compatibility with installed 2.11.6 clients

The additive migration creates only the distinct legacy labels currently assigned to active saved friends, and preserves those memberships. It creates no empty default groups. The old `list_name` field remains as a compatibility projection for installed apps that accept only Circle, Crew, Lumo Squad and Study Buddies. Dynamic group names are returned only to version 2 clients.

A version 1 edit with the same projected label preserves the current group ID, including an ungrouped state. An explicit old label change or a new old-client friend save resolves a permanent owner-plus-label binding. A never-used label can create one group on that user action, or bind an existing active group of the same name. Renaming keeps the binding pointed at the original ID. Deleting leaves the binding in place and future attempts to use that label return `GROUP_UNAVAILABLE`. A later group with the same name does not acquire the old binding. Version 2 create/rename operations also record a previously unused legacy label when the chosen name matches it, so deleting such a group cannot be undone by an old app's default selection.

Version 1 list labels can therefore be historical projections after custom grouping. Version 2 is the authoritative group display. Existing version 1 successful request IDs keep their original fingerprint and acknowledgment; retries cannot undo a later rename, deletion, reassignment or removal.

## Errors and security

Relevant stable errors are `GROUP_NAME_TAKEN`, `GROUP_NOT_FOUND`, `GROUP_LIMIT`, `GROUP_UNAVAILABLE` (legacy deleted binding), `REVISION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `FRIEND_LIMIT`, `RECIPIENT_NOT_FOUND`, and the existing authentication/rate/service errors. A missing, deleted or foreign group ID has the same `GROUP_NOT_FOUND` response.

Group tables and bindings are private, have RLS enabled, and have no direct client or service-role table grants. Internal helpers are not directly callable by client roles. Only the existing service-only RPC is exposed. It validates the live session and eligible personal owner independently of the Edge Function. Composite foreign keys bind every membership and legacy mapping to a group owned by the same account. Friend and group mutations use the same owner transaction lock, retry history and rate limit. No ledger, invitation, notification feed or financial posting behavior changes.
