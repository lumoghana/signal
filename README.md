# Lumo · Signal

The approved Lumo student prototype, exported from live version **53**. This replaces the older Signal application in this repository. The shipped `dist/` files match the approved live build byte for byte.

## Run and test

Serve `dist/` from an HTTP server for local development. Use HTTPS for a deployed app so camera and supported device authentication can work. App navigation remains at the root URL; no catch-all rewrite is needed.

With a recent Node.js LTS release:

```sh
npm test
node scripts/build-offline-shell.mjs
```

This is a buildless ES-module app. No dependency installation, server or environment variables are required. The offline-shell command updates only the public service-worker cache map. Saved customer records are never packaged or cached as public assets.

## Deploy to Vercel

Import this repository and keep Root Directory at the repository root. `vercel.json` selects the Other preset, skips dependency installation, runs `node scripts/build-offline-shell.mjs`, and publishes `dist/`. Versionless assets are revalidated so new deployments do not retain stale screens.

## Included experience

- Light and dark appearances, account-led Home and swipe-to-reveal activity.
- Guided signup with real camera capture and simulated Ghana Card verification.
- Lumo, MoMo, bank and campus payment journeys, top-ups, campus bills and Pause.
- Dated budgets, Money Boxes, Savings Hacks and partner-protected boxes.
- Group collections and local group-chat simulation with contribution and payout states.
- IOUs, outside-money records, recovery, Insights, Ask Lux and Money IQ.

## Prototype scope

Money, identity verification, SMS, bank/MoMo lookups and remote member communication are simulated. No real money moves and no bank, MoMo or NIA service is connected. Camera and supported device-authentication features use the browser's actual permission and capability checks.

Demo progress is stored in each browser and origin. Existing records on the ChatGPT Site, or in the older Signal storage namespace, are not migrated into this build. Use demo credentials only. Never commit signing keys, private exports, credentials or customer records.

## Provenance and verification

`source-provenance.json` identifies the approved live version and source commit. `dist-sha256.json` lists the exact shipped asset hashes. The native Android application is delivered separately and is not part of this web repository.

This is the GitHub/Vercel export. Do not push it to a Sites source remote or publish it through Sites.
