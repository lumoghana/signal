# Lumo Signal web export

This repository contains the user-approved Lumo live build, version 66, exported into the Signal repository root. Earlier Signal/Monochrome implementations remain in Git history. Do not restore their obsolete entry registry, bundler, scripts or UI adapters into the current app.

## Target and scope

- This copy targets GitHub and Vercel only. Do not push it to a Sites source remote or deploy it through Sites. The live ChatGPT Site is a separate deployment.
- Serve `dist/`. Keep Vercel Root Directory at the repository root and output directory `dist`. The current build command is `node scripts/build-offline-shell.mjs`.
- Preserve the approved account-led Home, 2D Lux identity, light/dark themes, typography, navigation and existing journeys unless the user authorizes a change.
- Keep financial amounts in integer pesewas. Expected income, unpaid IOUs, savings and group funds must not silently become personal available money.
- Preserve payment review, conditional Pause, authentication, ledger idempotency, pending/failure/reversal handling, group mandates and partner-code safeguards. Presentation changes do not authorize changing financial rules.
- Keep privacy controls, accessible labels, actual camera permission/lifecycle handling, safe-area behavior and reduced-motion support. Long text and short/keyboard-height screens must remain reachable through natural scrolling.
- Clearly distinguish sample provider/member activity from live services. No live bank, MoMo or NIA connection is present.

## Checks and packaging

Run `npm test` for the current ES-module test suite. Regenerate the public offline shell with `node scripts/build-offline-shell.mjs` after shipped asset changes. Inspect relevant phone layouts in both themes when changing UI. Never replace behavior tests with generated hash baselines to hide a regression.

`dist-sha256.json` records the approved export. Update provenance and asset hashes only for an authorized later release after meaningful checks. Do not modify the manifest merely to conceal unexpected differences.

Remove temporary QA fixtures before committing or deploying. Never commit private browser records, uploads, credentials, environment files, Android signing material, APKs or local build/cache outputs. The native Android application is maintained and delivered separately.

Saved demo records belong to each browser and origin. Do not import older product namespaces or another user's records without explicit authorization.
