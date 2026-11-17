# Lumo 2.12.4: prototype face recovery

Status: built and tested; coordinated activation is pending. Installing the APK alone does not activate the new server mode.

## What changes

- Consumer, merchant and admin recovery use a username or admin email, fresh camera selfies, comparison with the saved encrypted face profile, and a new password.
- Prototype recovery does not request a private recovery key or offer an SMS-only reset.
- Face setup creates no recovery key and has no key-saving or acknowledgement screen. The existing displayed test-code step remains part of authenticated setup.
- A saved face remains usable after a password reset. Existing reusable face profiles do not need replacement just because their old key was consumed.
- The interface labels liveness as simulated. Camera capture and saved-template comparison remain actual operations. Ghana Card verification remains simulated.

## Controls retained

The server enables this mode only on the existing sandbox pilot project. Another project or a non-sandbox configuration cannot enable it by sending client flags. The existing protected recovery service remains separate.

A real face-match result is still necessary. Unmatched faces, missing templates, unavailable processing, expired or reused reset proofs, cross-module requests and excessive attempts cannot approve recovery. Password resets end existing sessions. Saving, replacing or removing a face requires the current password and the existing storage consent.

## Verification

- Consumer: 1,819 tests.
- Merchant: 632 tests, including shared-controller and HTTP-transport boundaries.
- Backend: 361 tests and 72 protected SQL checks.
- Actual handler and PostgreSQL checks cover all three modules, two resets with the same saved template, absent key hashes, session revocation, reset retries, attempt limits and face removal. Auth and face-processing responses are synthetic in this integration harness.
- Android: 77 model suites, 386 framework cases and 48 recovery layouts in light/dark and compact phone sizes.
- Web recovery and settings were inspected at a compact phone width in both themes.

Physical-phone recovery and acceptance using real user selfies remain unverified. Genuine liveness must be connected and tested before a production recovery design is enabled.

## Activation

Publish the paired frontend and signed APK, apply the additive prototype recovery migration, then activate the matching access service. Verify all three modules and public download checksums together. Earlier automatic approval review blocked the Vercel/GitHub source uploads; those uploads still need explicit authorization before the coordinated rollout.
