# Onboarding and account optical review

Reviewed on 27 October 2026 against the new monochrome brief. Runtime source was not edited by this reviewer.

## Result

All 45 registered onboarding, account and support pages have now been optically reviewed at 375 × 667 using complete, matching gallery generations. No blocking visual issue remains in this reviewed set. The two concrete findings from the initial pass were corrected and visually rechecked.

## Evidence and limits

- Inspected all 12 final stable viewport captures, `onboarding-stable-0.jpg` through `onboarding-stable-11.jpg`, in `/workspace/scratch/mono-optics`.
- Inspected the complete initial 1,128-layout route sweep JSON. The 45 onboarding/account/support routes have no reported geometry failure at 320 × 568, 390 × 844 or 320 × 568 with 200% text, for first and returning visits.
- Initial and first follow-up captures contained mixed gallery generations because raster capture ran in the same tool invocation as navigation. Those captures are superseded by the stable set. The stable set used a separate invocation for capture and matches each page's ready generation across all frames.
- This is a visual and source review of the prototype. Final enlarged-text/first-returning geometry and palette results are recorded separately by the product owner. No live identity, camera or banking compatibility is claimed here.

| Capture | Pages reviewed |
| --- | --- |
| 0 | accountInfo, accountReady, accountReview, accountTerms |
| 1 | ambassadorGuide, ambassadorReset, ambassadorSample, ambassadorWelcome |
| 2 | applicationCorrection, applicationStatus, campus, campusInterest |
| 3 | campusInterestSaved, campusStatus, caseDetail, changePin |
| 4 | closeAccount, confirmPin, dataExport, devices |
| 5 | feedback, help, identity, identityResult |
| 6 | livecheck, notificationPrefs, otp, phone |
| 7 | pilotUnavailable, pin, privacy, privacyNotice |
| 8 | profile, profileEdit, profilePhone, recovery |
| 9 | recoveryOwnership, recoveryReplacement, recoveryStatus, security |
| 10 | setupChoice, setupProgress, signin, statements |
| 11 | supportCase |

## Findings sent to the product owner

1. **Fixed: pure monochrome palette in ambassador screens.** The initial computed palette sweep found `.ambassador-boundary` at `rgb(237,242,229)`, `.ambassador-intro` at `rgb(99,113,86)`, and `.test-step::before` at `rgb(125,135,111)`. The owner added neutral overrides. Stable capture 1 confirms guide, reset, sample and welcome now use neutral surfaces and text. This was the only palette problem in the initial onboarding/account/support route set. Confirm the final palette sweep separately.
2. **Fixed: onboarding notice surfaces follow the new system.** Legacy selectors outranked the initial generic surface rules, leaving OTP, identity and recovery notices square. The owner added a sufficiently specific edition-only surface rule. Stable captures 2, 3, 5, 6, 7 and 9 confirm the new neutral rounded system. Warning text and consent controls remain present.
3. **Optional finishing detail for account-ready.** The created-account page is clear and its actions are obvious, but it has a large empty lower field. A small restrained check/aperture mark above the heading would give completion a deliberate visual moment. This is not a functional blocker and should not introduce decorative weight to every form.

## Positive observations

- Account details and statement/export pages have clear labels, strong values and consistent primary actions.
- The phone, PIN and recovery forms keep the next step obvious, with supporting actions secondary.
- Profile and support details read cleanly without decorative illustration gaps.
- First-use education stays available through disclosures; the safety information remains visible.

No financial, authentication, consent, saved-state or navigation rules were changed as part of this review.
