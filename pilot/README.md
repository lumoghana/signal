# Lumo connected pilot

This is the bank-free, shared-account pilot. The consumer entry is `/` and the merchant entry is `/merchant.html`. Both use the same authenticated Supabase account and server ledger. The original consumer and merchant demos are preserved separately; their local balances are never imported as shared funds.

## Setup

Serve `dist/` as a static site. Use `pilot` as the Vercel project root and `dist` as the output directory. No install or build step is required. Keep the security headers in `vercel.json`: scripts and styles remain same-origin, Supabase is the only API origin, framing is blocked and camera access is limited to the same origin. The QR SVG generator uses ordinary SVG attributes and does not require inline scripts or inline styles.

The deployment supplies `dist/runtime-config.json` with:

```json
{
  "supabaseUrl": "https://iwutbrljiiodamtyoorg.supabase.co",
  "publishableKey": "<project publishable key>",
  "qrProtocol": "lumo:shared:v1:",
  "sandbox": true
}
```

Only a publishable key belongs in this file. Never add a secret/service-role key. Browser registration and login also require the exact deployed origin to be allowed by the `lumo-pilot-auth` Edge Function. Native clients do not supply a browser Origin.

For local development, run `npm run dev -- --port 4173`. The server serves `dist/` on port 4173. A browser preview must have its exact origin configured before testing registration/login; the auth service deliberately rejects unknown origins.

## Implemented journeys

- Shared handle/password account access and a separate server-checked payment PIN. Test registration does not verify contact information or identity.
- Consumer Home, server activity and receipts, explicit test funding, exact-handle recipient confirmation, consumer transfers, receiving QR and merchant Scan to Pay.
- Merchant Home, full-height amount keypad, fixed single-use request QR, reusable Shop QR, owner shop selection/creation, payments, original-customer refunds and trading close.
- Durable saved money requests, original-attempt lookup/retry, cross-window money locks and account-generation checks. No PIN or password is written to the pending journal.
- Camera scanning, local QR-photo decoding and a pasted-code fallback. Photos stay in the browser.

The QR format is `lumo:shared:v1:<base64url JSON>`. Person codes carry `{kind:"person",handle}`. Merchant codes carry `{kind:"merchant",shopId,requestId?}`. Amounts and recipient names come from the server. A missing or malformed fixed request never becomes an editable static payment.

## Checks and limits

Run `npm test` and `npm run check` from `pilot/`. The 24 tests cover integer money input, fixed/static quote binding, refund projection, escaping, account-generation races, strict QR parsing, QR rendering/decoding and camera cleanup. The shared API client has its own test suite under `backend/`.

Visual QA uses the real view renderers with temporary read-only records. Those fixture pages are removed before delivery. This does not replace a physical handset camera test or a fully interactive browser sign-in/payment journey.

This release covers the connected payment core. Cashier delegation, background push delivery, bank/MoMo/NIA connections, account recovery and the full demo's planning, Money Chat and group journeys are not implemented in this web pilot. Payment sound announces newly observed server confirmations only while the merchant page is open and sound is enabled. Test money has no real monetary value.
