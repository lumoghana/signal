# Lumo 2.12.5: recovery review fixes

Status: live on the consumer and merchant Vercel apps, the merchant Site and the pilot backend. Both Vercel APK downloads match the signed 2.12.5 release. The Android source package is delivered separately. Public release metadata, changed client files, APK checksums and private face-processor access controls are verified. Existing aliases and environment settings are preserved.

## Issues corrected

- Merchant owner signup and staff invitations still generated legacy recovery keys and could force a key-saving screen. The pilot service now issues no key, and existing pending-key checkpoints route to the central face-recovery settings.
- Personal cashier accounts could not reach face-recovery setup. Their menu now opens their own recovery settings. A dedicated counter phone directs staff to sign in to their own account before managing recovery.
- Merchant signup, invitation, phone and team guidance, consumer onboarding and Security & access, and Android recovery labels still described the old key requirement. They now describe the applicable saved-face flow and simulated liveness.
- A lost face-enrollment success response could make a retry report that setup was missing. An authenticated retry now acknowledges the same completed enrollment without replacing the face, creating a key or exposing its template.
- A missed browser storage event could allow an old recovery response after the same person signed in again. Recovery now checks the stored login generation before sending a request and accepting its response.
- Overlapping reset retries could start two password updates and let a delayed update overwrite a later password. A durable execution claim now permits only one writer. Once the password service confirms success, a retry can finish the receipt without updating the password again. An uncertain outcome remains guarded; persistent uncertainty requires support confirmation.
- Android signup retained captured frames after going into the background despite promising to clear them. It now recycles those frames, clears the pending signup password and invalidates the selfie proof. Returning requires fresh photos.
- Android Help displayed an old hardcoded app version. It now reads the installed package version.

## Scope and verification

These changes retain the explicitly scoped prototype mode. Fresh camera images and encrypted stored-face comparison remain actual operations. Liveness, NIA, bank and MoMo services remain simulated. Recovery does not request a private key or offer an SMS-only reset.

Regression checks cover the affected browser, merchant, backend and Android paths. Local face-processor checks include real model inference, request signatures, malformed-image rejection and all eight EXIF orientations, using licensed offline fixtures. No customer passwords or biometric records were changed during verification.

Passed: 1,822 consumer tests, 637 merchant tests, 371 backend tests, 72 protected SQL checks, 29 new SQL checks and 45 adversarial handler/PostgreSQL checks. Android passed 77 model suites, 390 framework cases and 48 layouts. Independent review confirmed the enrollment receipt and single-writer fixes. The original Android signing identity is retained.

The public asset manifest also contained stale digests for 20 files whose bytes already matched the prior committed source. Those digests are reconciled separately from the five asset entries actually changed by this release. No financial behavior was changed by that metadata correction.

Physical-phone recovery and acceptance using real user selfies remain unverified. Genuine liveness must be connected and tested before enabling a production recovery design.
