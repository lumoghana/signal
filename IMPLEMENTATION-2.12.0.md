# Lumo 2.12.0: prepared money upkeep improvements

Status: consumer web 2.12.0 is published at https://lumo-connected-pilot.vercel.app/ and the isolated metadata service is ACTIVE at version 1. The signed native APK 2.12.0 is ready with the original signing identity. The paired consumer download update is prepared for publication.

## Implemented experience

1. Reuse explicitly recurring essentials, review amounts and dates, preserve the previous period's duration, and leave one-off additions out by default. Outstanding excluded costs are shown before confirmation.
2. Record outside money received or spent, or confirm an absolute balance. Changes are guarded against stale records and duplicate requests. An explicitly selected outside expense can satisfy the corresponding essential once, without changing Lumo funds.
3. Offer familiar categories from the student's explicit remembered choices, with correction available.
4. Turn supported Lux messages into editable, dated commitment drafts. Only confirmation saves; the conversation then acknowledges the edited saved record.
5. Offer a short, optional money check and an optional chosen check day when opening the app.
6. Show confirmation age, retain stale warnings after partial movements, and label stale combined totals as recorded estimates.
7. Offer a simpler starting view, with other tools still discoverable. Existing users keep the full experience unless they choose otherwise.

## Release boundary

The existing `lumo-approved` source matches all 38 files captured from live version 18. It is not replaced by this release. The separate `lumo-maintenance` function has 31 files and accepts only seven metadata actions plus read-only recovery of those same requests. Current Auth user/session checks, revision checks and idempotent attempts remain required. Payment, authentication, merchant and unrelated routes are rejected by the new endpoint.

No schema changes, new secrets, provider connections or background push were added. Outside balances remain student-confirmed records. Expected income and unpaid IOUs remain outside available money.

## Verification

- Web: 1,773 tests passed, with zero failures or skips.
- Focused backend engine, HTTP, endpoint gate and provenance checks: 34 passed.
- Existing hosted persistence primitive: 18 assertions passed in a transaction that rolled back all synthetic fixtures; zero ledger journals created.
- Full backend: 306 passed, with the same 10 pre-existing behavioural failures reproduced on unchanged live-18 source. These cover previously unpublished partner/merchant changes and were not hidden or weakened.
- Native Android: 74 Java suites and 322 framework cases passed, with zero failures, errors or skips; 36 phone/compact layouts checked across light and dark themes.
- Local browser: verified outside balance confirmation, outside cash expense against an essential, unchanged Lumo wallet, Lux commitment review/edit/save, saved acknowledgement, recurring selection, plan review, optional mode, chosen-day check and light-theme presentation using synthetic records.
- Current publication: Vercel production deployment `dpl_FYCb8E4fbiQUvHMBKksEGB8sPxzg` is READY. All 22 changed public static assets match that tested source. This earlier publication serves signed APK 2.11.7; its historical evidence is retained. The prepared follow-up includes the signed 2.12.0 APK and updated download metadata. Public verification of the new download follows publication.
- Signed APK 2.12.0: version code 21200, 4,613,071 bytes, SHA-256 `dec3630f43a0a766016cc5643abd62595968d49bb12cb42df1dc3581b17ca2f9`. Signature schemes v2/v3 and 16KB alignment passed. The certificate matches the previous release: `64f2301aa4b55db94c2748d67bf66b56bda7569f528455969c575b8603338a6c`.
- Live metadata service: 16 unauthenticated access/CORS boundary checks passed; `lumo-approved` remains ACTIVE v18 with its original hash.
- Published welcome and public introduction were verified in the browser. Physical handset and live authenticated customer journeys remain unverified.

## Publication status

The user explicitly approved deployment of the isolated `lumo-maintenance` service and consumer web 2.12.0 on 16 November 2026. The service is now ACTIVE at version 1. The shared `lumo-approved` payment/authentication service remains version 18 with its original bundle hash. Web deployment and public checksum evidence are recorded in `verification/maintenance-2.12.0/published-release.json`.

Native source 2.12.0 is complete and the signed APK uses the original test signing identity and application ID. The prepared web download and delivered APK describe the same 2.12.0 experience. Physical handset upgrade and ART execution remain unverified. The consumer download publication is pending; the historical published-release record continues to describe the earlier 2.11.7 public APK.

## Prepared source

- Consumer: `dist/`, `api/` and current build scripts.
- Isolated backend: `backend/supabase/functions/lumo-maintenance/`.
- Backend source boundaries and hashes: `backend/verification/maintenance-2.12.0/`.
- Native source is maintained separately, with `verification/2.12.0-connected-experience-review.json` and its source package.
