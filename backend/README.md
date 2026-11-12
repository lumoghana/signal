# Lumo shared test-money backend

One authenticated account and ledger for the consumer and merchant channels. This is a bank-free pilot: balances represent test funds and no bank, MoMo, NIA or cash-out service is connected.

The hosted target is Supabase project `iwutbrljiiodamtyoorg` (`Lumo`). The API base is `https://iwutbrljiiodamtyoorg.supabase.co`. The only application Data API entry point is `POST /rest/v1/rpc/lumo_rpc` with `{ "p_command": "account.get", "p_payload": {} }`. Requests require a publishable API key and a valid user access token. Private ledger tables have no client read/write grants. Money is stored in integer pesewas in GHS.

## Scope

The first migration provides account setup, exact-handle recipient lookup, explicit test funding, consumer transfers, merchant/shop creation, fixed payment requests, static shop quotes/payments, partial or full merchant refunds, owner reporting and shop trading-day close. Payments create paired, immutable ledger entries and receipts. A close resets the shop's trading view without removing money from the merchant account.

All commands validate a live Supabase Auth session. Money moves verify the server-held transaction PIN and apply PIN throttling. The backend binds retry references to the signed-in user, command and original payload. `attempt.lookup` recovers committed or definitively rejected operations without storing a PIN on the device.

This package is a backend foundation, not an automatic replacement for the existing apps' local ledgers. Consumer Android/web and merchant releases must explicitly adopt this client/contract. Existing local demo balances must not be imported as shared funding. Staff delegation, Money Boxes, budgets, groups, IOUs, push delivery, account recovery and operations screens need their own integration work before full feature parity is claimed.

## Client

`src/client.mjs` has no runtime dependency. Host applications inject `fetch`, durable pending-reference storage and a secure session persistence callback. The client never persists a PIN or password. Host apps must provide payment review and explicit authorisation UI. Native Android requires an equivalent implementation of this HTTP contract; this JavaScript client is for web clients and API integration tests.

Use only the project's publishable key in public apps. A secret/service-role key must never be bundled into a browser or APK. Do not log access tokens, refresh tokens, passwords or transaction PINs.

## Verification

Run `npm ci --ignore-scripts`, `npm test` and `npm run check` from this directory. `tests/shared-ledger.test.sql` contains hosted database checks that run inside an explicit transaction and roll back their users, sessions and financial records. They simulate authenticated database requests; they do not replace real Auth HTTP or handset tests. See `verification/` for the exact checks completed against the hosted project.

The Supabase CLI is pinned in the lockfile. Discover commands with `npm run supabase -- --help`; v3 defaults to the local stack. Hosted migrations must be applied deliberately against the recorded project. This source must not silently modify another project.

## Release sequence

1. Install the shared schema and verify accounting, access boundaries and replay behaviour.
2. Connect consumer account identity, balance, transfer and payment screens to this API.
3. Connect merchant sign-in, shops, requests, receipts and refunds to the same accounts.
4. Verify the cross-device transfer → merchant payment → refund journey, including interrupted connections and simultaneous spending.
5. Integrate the remaining product journeys and operational controls against shared state.

Use controlled tester identities initially. Enabling email/SMS invitations or changing authentication settings is a separate explicit setup step. Bank integration remains outside this pilot.
