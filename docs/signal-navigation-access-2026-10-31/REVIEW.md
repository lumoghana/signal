# Signal navigation access · 31 October 2026

All Your Money and other deep pages had only Back navigation. The full-page presentation retained an older controller rule that hid global navigation during tasks and on native pages outside the seven primary roots. The user asked to make navigation accessible throughout the solution.

## Result

Eligible signed-in pages now show one **Main navigation** footer with **Home, Ask Lumo and Menu**. Home is a direct destination rather than a sequence of Back clicks. The task-page footer sits inside its active page and focus boundary, below the content scroller. The original primary controls remain retained, hidden for a full task page and inert behind modal contexts, then restore through the native controller.

Ordinary non-root pages such as Activity, saved records and merchant pages restore the cached three native controls. A cold restoration also receives the correct labels, icons, styles and ARIA. Public parent registration is limited to genuine native full pages; restored task routes are not promoted into primary parents. Explicit destination parameters, such as a card's filtered Activity, survive the native closing queue, while Back/Close restores the original scope. Menu's expanded state and controls reference are normalized on open and close.

The31 setup, sign-in, recovery and sample-account funnels do not expose account navigation. Genuine choice sheets and Menu keep their modal behavior. Locked, signed-out and closed accounts retain native access rules. Contextual Chat and an active Budget guide retain their task return controls. The global Ask Lumo entry has a Back to Home return, independent of an older Chat origin.

Standalone Close/Done buttons that called an inactive task controller now have a working native Back fallback. Buttons labelled Back to conversation open Chat. This is a view-scoped repair; the shared task-close API is unchanged.

## Guarded navigation

Home, Chat and Menu leave an owned payment through its existing cancellation decision. A pending destination belongs to the current account, draft and task and completes only after explicit successful Keep/Discard. A restored standalone financial page uses the same native cancellation choices without changing task ownership. A changed draft, account or blocked persistence state cancels the pending destination. Specialized collection contribution and payout leave handlers remain authoritative, including the frozen payout API. Nested funding returns to payment review and then passes through the payment guard. Secret input fields are cleared on explicit global exits; native confirmation screens retain their own short-lived secret lifecycle.

Menu opened from an active journey first exits through that journey's original primary root and opens the native drawer there. Closing that drawer returns to the root, not the former deep page. Menu opened on a supported ordinary native page retains that page for return; a standalone task page uses Home as its Menu origin. Native Back, browser history, focus restoration and closed-task Forward behavior remain owned by the existing controller.

The implementation is confined to the Signal navigation adapter, existing page chrome, entry/verification declarations and source-owned tests. No shared financial, authentication, Pause timing, QR, persistence or baseline source is changed. Home's approved design and Monochrome remain unchanged.

## Verification

The starting inventory contained217 views,163 task registrations and54 native pages. The navigation policy is based on actual account state and surface, not a hardcoded expectation that every fixture has a footer.

The final manifest regression gate passed **572/572 tests**, including all **29 new navigation tests**, with zero failures or skipped test cases. The existing Budget-save, account-closure authentication and scoped-card-Activity assertions remain unchanged and pass. The Menu compatibility test now verifies authorized Signal Menu access while retaining other editions' original behavior and the existing contextual Chat, Budget guide and account guards. Native persistence release, stale-writer and save-failure blocking, PIN clearing, account replacement and both specialized collection leave paths are covered.

The managed browser covered **219 prepared layouts across all217 registered views**, with zero navigation, geometry, actual font-family, font-loading, solid-text contrast or setup findings. It recorded150 task-page footers,25 ordinary primary footers and44 access/modal contexts. These are prepared layouts, including utility variants, rather than unique route categories. Additional checks covered All Your Money at375 × 667 and320 × 568 with200% text, authorisation at390 × 480 keyboard height and Profile in the1100 × 900 desktop frame. Enlarged footer labels wrap, remain fully visible and retain usable tap areas. Manual checks verified a nested recorded balance → Home, page → Menu → Activity, Activity → Menu → close, and payment → Home request → Return / Keep.

Evidence: [route audit](route-audit.json), [size checks](size-checks.json), [full regression log](regression.log) and [All Your Money browser capture](all-money-browser.jpg). Final deterministic build verification passed after fixture cleanup.

The Signal staging helper records navigation facts in every visual test: actual route, page/sheet/drawer surface, account state, policy eligibility, navigation count, labels, hidden/inert ancestors and location inside the active task page. Navigation failures join the existing consistency findings and affect the sweep's pass/fail result. Existing geometry, font and solid-text contrast checks remain in place. These are diagnostic checks, not WCAG certification or proof of live provider behavior.

Final candidate bundles: `lumo-runtime.fdb965750ba3.js` and `lumo-ui.0c5992654a8c.css`.

Run `node scripts/build-release.cjs --check` and `node scripts/check-edition-parity.cjs --regression`. Stage `node tests/manual-layout/signal-experience-stage.cjs` for isolated browser review, change viewport and fixture controls sequentially, and clean with the same helper plus `--clean` before packaging.
