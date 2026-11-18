# Lumo Signal web export

This repository contains the accepted connected Lumo prototype and its reviewed release candidates. READINESS.md identifies current capability boundaries; dist/consumer-release.json and source-provenance.json identify the published release and matching APK. Earlier Signal/Monochrome implementations remain in Git history. Do not restore obsolete entry registries, bundlers, scripts or UI adapters.

## Target and scope

- This copy targets GitHub and Vercel only. Do not push it to a Sites source remote or deploy it through Sites. The live ChatGPT Site is a separate deployment.
- Serve `dist/`. Keep Vercel Root Directory at the repository root and output directory `dist`. The Vercel build command prepares approved public assets and the separately signed Android download, then runs `node scripts/build-offline-shell.mjs`; preserve vercel.json and the original artifact checks.
- Preserve the approved account-led Home, 2D Lumo mascot identity, light/dark themes, typography, navigation and existing journeys unless the user authorizes a change.
- Keep financial amounts in integer pesewas. Expected income, unpaid IOUs, savings and group funds must not silently become personal available money.
- Preserve payment review, conditional Pause, authentication, ledger idempotency, pending/failure/reversal handling, group mandates and partner-code safeguards. Presentation changes do not authorize changing financial rules.
- Keep privacy controls, accessible labels, actual camera permission/lifecycle handling, safe-area behavior and reduced-motion support. Long text and short/keyboard-height screens must remain reachable through natural scrolling.
- Clearly distinguish sample provider/member activity from live services. No live bank, MoMo or NIA connection is present.

## Consumer web and Android parity

Every consumer update must be applied to both the consumer website and the native Android APK. Both must carry the same user experience and financial behaviour. Keeping the native application source separately does not exempt either version from an update.

For each consumer release:

- Check the changed journeys on both the website and Android, including recipient selection, details, review and authorisation where affected.
- Publish the updated consumer site and deliver the matching signed APK. Record the web commit/deployment and APK version together in the release evidence.
- State precisely which versions were updated and checked. Do not describe a consumer update as complete or both versions as aligned when only one was updated; identify any remaining work directly.

## Checks and packaging

Run `npm test` for the current ES-module test suite. Regenerate the public offline shell with `node scripts/build-offline-shell.mjs` after shipped asset changes. Inspect relevant phone layouts in both themes when changing UI. Never replace behavior tests with generated hash baselines to hide a regression.

`dist-sha256.json` records the approved export. Update provenance and asset hashes only for an authorized later release after meaningful checks. Do not modify the manifest merely to conceal unexpected differences.

Remove temporary QA fixtures before committing or deploying. Never commit private browser records, uploads, credentials, environment files, Android signing material, APKs or local build/cache outputs. The native Android application is maintained and delivered separately.

Saved demo records belong to each browser and origin. Do not import older product namespaces or another user's records without explicit authorization.

Keep `dist/consumer-release.json` paired with the delivered APK version and checksum. Include the matching signed APK at `dist/downloads/Lumo-Test-Android.apk` in file-based Vercel deployments, retaining it outside Git. Verify the public download hash after deployment.
