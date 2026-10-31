# Whole-product review inventory

Actual shipped script sequence, traced view registry assignments, isolated first/returning sample fixtures. DOM behavior only; no browser geometry claim.

## Registry coverage

- everyday: 188 registered routes; 186 prepared-view, 0 native-entry-redirect, 2 registered-renderer-forward, 0 prepared-unavailable-surface, 0 fixture-error
- minna: 188 registered routes; 186 prepared-view, 0 native-entry-redirect, 2 registered-renderer-forward, 0 prepared-unavailable-surface, 0 fixture-error
- hibiscus: 188 registered routes; 186 prepared-view, 0 native-entry-redirect, 2 registered-renderer-forward, 0 prepared-unavailable-surface, 0 fixture-error

Canonical gallery pagination assigns Onboarding 45, Payments 40, Planning 73 and Primary 30 routes. Domain review catalogues overlap these groups: Pay and Activity are primary pages reviewed with Payments, and Pause is a planning page also reviewed with Payments. These groups do not establish ownership of financial behavior.

Every route has an isolated first-entry and returning fixture in each edition. No fixture error or unavailable native first-entry surface remains in this baseline. A prepared fixture is evidence that a current renderer mounted, not a visual-quality pass. Returning sensitive tasks may correctly expire; see the boundaries below.

## Current, compatibility and sample surfaces

| Surface class | Routes per edition | Meaning |
| --- | ---: | --- |
| current-registered-view | 176 | Current runtime registry entry; contextual or dynamic navigation may apply. |
| shared-review-entry | 2 | Native Money Box review entry renders the current paymentReview surface. |
| compatibility-alias | 3 | Old saved campus route name rendering the current university/email form. |
| compatibility-bridge | 1 | Saved campus setup continuation with its own native return controls. |
| identity-alias | 1 | Same runtime function as story. |
| test-mode-utility | 5 | Explicitly guarded by test mode in core.js; not a normal production customer destination. |

The five test-mode utilities are testing, sampleConfirm, resetConfirm, pauseDemo and pauseLog. Old renderer definitions still present in shipped files are recorded in each definition chain; only the final registered writer and observed current renderer are used for page review. No route is labelled unreachable merely because static text search found no literal link.

## Page-by-page matrix

| Route | Domain | Class | First / returning | Everyday | Minna | Hibiscus |
| --- | --- | --- | --- | --- | --- | --- |
| accountInfo | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| accountReady | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| accountReview | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| accountTerms | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| actionConfirm | primary | current-registered-view | Prepared / protected return | prepared-view | prepared-view | prepared-view |
| activity | primary | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| addMoney | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| allocate | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| allocationReview | planning | shared-review-entry | Prepared / re-entry | registered-renderer-forward → paymentReview | registered-renderer-forward → paymentReview | registered-renderer-forward → paymentReview |
| allowance | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| ambassadorGuide | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| ambassadorReset | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| ambassadorSample | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| ambassadorWelcome | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| applicationCorrection | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| applicationStatus | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| authorize | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| balances | primary | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| bankAdd | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| bill | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| boxProtectionChange | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| boxProtectionInvite | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| boxProtectionSupport | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| budgetAfterFunding | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| budgetCategory | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| budgetCycle | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| budgetCycleReview | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| budgetDelete | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| budgetEstimate | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| budgetHistory | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| budgetPeriodReview | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| budgetReviewDates | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| budgetReviewNext | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| campus | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| campusInterest | onboarding | compatibility-alias | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| campusInterestSaved | onboarding | compatibility-bridge | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| campusPay | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| campusStatus | onboarding | compatibility-alias | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| cardsHome | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| caseDetail | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| categoryEdit | primary | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| categoryMatch | primary | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| categorySort | primary | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| changePin | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| chat | primary | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| chatBankingActions | primary | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| chatBankingChoice | primary | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| chatBankingReplace | primary | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| chatCalculation | primary | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| chatCalendarPayments | primary | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| chatExpectedDate | primary | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| closeAccount | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| confirmPin | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| dailyAccountNotice | primary | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| dailyMoneyStory | primary | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| dailyUpdatePrefs | primary | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| dataExport | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| devices | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| essentialEdit | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| essentials | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| everydayPayments | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| everydayRepeatChoice | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| feedback | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| firstBudgetExample | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| firstEssentials | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| firstGoal | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| firstPlanReview | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| goal | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| goalEdit | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| goals | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| groupMoneyApprovers | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| groupMoneyCollection | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| groupMoneyContacts | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| groupMoneyDetail | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| groupMoneyHome | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| groupMoneyInvitation | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| groupMoneyInvitationDecline | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| groupMoneyInvitationMandate | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| groupMoneyInvitations | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| groupMoneyList | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| groupMoneyMandate | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| groupMoneyMember | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| groupMoneyPayments | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| groupMoneyPeople | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| groupMoneyProposal | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| groupMoneyProposalDetail | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| groupMoneyProposalReview | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| groupMoneyRemoveGroup | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| groupMoneyReview | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| groupMoneyRules | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| groupMoneySample | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| groupMoneySampleInvitations | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| groupMoneySaveGroup | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| groupMoneySource | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| groupMoneySplit | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| help | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| hibiscusChatHistory | primary | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| home | primary | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| homeMoneyStory | primary | identity-alias | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| identity | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| identityResult | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| incomePlan | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| livecheck | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| makeRoom | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| merchant | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| merchantApply | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| merchantCollect | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| merchantCollection | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| merchantDestination | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| merchantPayer | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| merchantSales | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| missions | primary | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| momoAdd | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| moneyStoryHome | primary | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| more | primary | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| myQr | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| notificationPrefs | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| notifications | primary | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| otp | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| pause | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| pauseDemo | planning | test-mode-utility | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| pauseLog | planning | test-mode-utility | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| pay | primary | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| paymentCancel | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| paymentPlanLink | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| paymentRecovery | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| paymentResult | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| paymentReview | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| pending | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| phone | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| pilotUnavailable | onboarding | compatibility-alias | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| pin | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| plan | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| planBenefit | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| planDraftRestart | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| planEdit | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| planExplanation | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| planPeriod | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| planSetup | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| privacy | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| privacyNotice | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| profile | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| profileEdit | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| profilePhone | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| recovery | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| recoveryOwnership | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| recoveryReplacement | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| recoveryStatus | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| releaseGoal | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| releaseReview | planning | shared-review-entry | Prepared / re-entry | registered-renderer-forward → paymentReview | registered-renderer-forward → paymentReview | registered-renderer-forward → paymentReview |
| requestConfirm | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| requestCreate | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| requestDetail | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| requests | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| resetConfirm | primary | test-mode-utility | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| sampleConfirm | primary | test-mode-utility | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| samplePause | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| savingMilestones | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| savingRule | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| security | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| send | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| sendOptions | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| settlementDetail | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| settlements | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| setupChoice | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| setupProgress | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| sharedExpenses | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| sharedGroup | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| sharedReceive | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| sharedSplit | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| sharedSplitReview | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| signin | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| spendingOutlook | planning | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| statements | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| story | primary | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| storyTx | primary | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| supportCase | onboarding | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| testing | primary | test-mode-utility | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| txDetail | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| virtualCard | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| virtualCardAuthorize | payments | current-registered-view | Prepared / protected return | prepared-view | prepared-view | prepared-view |
| virtualCardCreate | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| virtualCardDemo | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| virtualCardDetails | payments | current-registered-view | Prepared / protected return | prepared-view | prepared-view | prepared-view |
| virtualCardManage | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| virtualCardStatus | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| virtualCards | payments | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |
| welcome | primary | current-registered-view | Prepared / re-entry | prepared-view | prepared-view | prepared-view |

## Compatibility and returning behavior

- campusInterest, campusStatus, pilotUnavailable → campus. Old saved route names intentionally render the current university/email form. Contextual illustration may differ; no obsolete campus gate is forced.
- homeMoneyStory → story. Strict runtime function identity in every edition.
- allocationReview, releaseReview → paymentReview. Runtime view-call trace shows these box-review routes forwarding to the current payment review renderer.

- virtualCardAuthorize returns Approval expired after leaving; a new action needs fresh approval.
- virtualCardDetails hides the demo details after leaving; reveal requires authentication again.
- actionConfirm clears the abandoned decision on leaving, then offers a safe return.

## Missing-context recovery

The standard matrix retains the honest missing-record states for categoryMatch and dailyAccountNotice. Deep first/returning fixtures additionally prepare valid saved records through the actual Chat category proposal and saved-notice APIs. These are gallery/inventory-only contexts, with no added matrix cases.

| Edition | Route | Classification | Observed recovery heading |
| --- | --- | --- | --- |
| everyday | categoryMatch | intentional-context-recovery | Those payments are no longer available. |
| everyday | dailyAccountNotice | intentional-context-recovery | Notice unavailable. |
| minna | categoryMatch | intentional-context-recovery | Those payments are no longer available. |
| minna | dailyAccountNotice | intentional-context-recovery | Notice unavailable. |
| hibiscus | categoryMatch | intentional-context-recovery | Those payments are no longer available. |
| hibiscus | dailyAccountNotice | intentional-context-recovery | Notice unavailable. |

## Interpretation

- The legacy app layer remains in source but runtime writer tracing identifies the actual final registered renderer.
- No customer profile, camera, live financial action, support transmission or external notification is used.
- Each edition preserves its namespace and uses its own scripts. Existing fixture base deliberately bypasses auth guards only to inspect otherwise contextual pages. Production guard reachability still requires domain audit.

Native redirects and shared-renderer forwards are real entry surfaces. They are not geometry passes for an older template. Unavailable headings and fixture errors remain explicit review gaps. The full per-edition JSON retains actual headings, task copy, controls, warnings, guidance state, source-definition chains, source hashes and first/returning comparisons. Programmatic label checks do not certify visible focus, screen-reader order, contrast or WCAG compliance.

## Browser review gallery

`node tests/manual-layout/prepare-overflow-audit.cjs --prepare` copies the source-only gallery to temporary preview assets. Use `/__deep-gallery.html` on the managed preview origin. Four 375 × 667 isolated screens appear per group, with edition, domain, first/returning and state controls. Requested and actual native routes are labelled. Inspect Top, Middle, Bottom and opened disclosures; wait for the current generation Ready label. Clean with the same helper `--clean` before packaging.

Run `node tests/manual-layout/build-review-inventory.cjs` again after app implementation. The recorded source hashes identify this baseline rather than claiming to describe later modified assets.
