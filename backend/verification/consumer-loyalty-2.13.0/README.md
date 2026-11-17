# Consumer loyalty: isolated financial verification

`database-check.mjs` runs the actual merchant, consumer loyalty and approved payment handlers against a fresh local PostgreSQL runtime. No hosted project, account, photograph or money record is used.

The optional verifier uses the already installed PGlite package and its real pgcrypto extension. It is not an application or deployment dependency. Set `LUMO_PGLITE_MODULE` to the package's installed `dist/index.js`, then run from the repository root:

```sh
node backend/verification/consumer-loyalty-2.13.0/database-check.mjs
```

The bootstrap executes the 34 committed financial/gateway/merchant/guest migrations through 14 November and the additive consumer payer guard. Auth identities, sessions and JWT claims are synthetic. Only pg_cron extension registration and its scheduling call are omitted because this runtime has no scheduler process; the scheduled application function itself remains unchanged. Later unrelated social/support/access migrations are outside this verifier's scope.

The checks include merchant setup and readiness, a private hash-only linking grant, existing pinned terms after a programme edit, explicit consumer linking, canonical funding and purchases, automatic earning, a consumer-bound net payment request, wrong-payer rejection, ordinary bearer requests, refunds, double-entry balance and a real canonical payment winning the merchant cancellation compare-and-swap. A payment injected immediately before metadata commit changes the actual canonical ledger stamp; cancellation retries and preserves the paid request and consumed reward.

`database-result.json` records the run. The regular dependency-free adversarial tests live in `backend/tests/consumer-loyalty-adversarial.test.mjs` and use the separately labelled metadata/journal fixture. Those tests also exercise expiry, capacity, account changes, unknown outcomes and recovery without requiring PGlite.
