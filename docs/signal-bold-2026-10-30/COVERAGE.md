# Signal bold redesign coverage

This is a source-owned ownership and acceptance map, not a claim that every route/state has passed browser review. The final release review must link rendered evidence separately.

## Runtime inventory

- Captured on 30 October 2026 from the actual scripts referenced by `dist/index.html`, through the existing DOM harness.
- 217 live `Object.keys(L.views)` routes, 163 native task registrations and 7 retained parent roots.
- Native base registrations come from `L.taskSheet.coverage`; successful later registration calls were observed in memory immediately before the existing register implementation updates its maps. No product files, route logic or registration results were changed by this observation.
- Native default treatment is shown below. `send`, `bill`, `momoAdd` and `requestCreate` can change treatment by native state. Parameters and record existence also change the rendered view.
- Older `docs/CURRENT-SCREEN-INVENTORY.json` is incomplete for the present feature suite and must not be the release coverage denominator.
- Complete machine-readable capture: [route-coverage.json](route-coverage.json). Capture bundle: `lumo-runtime.59741250d3af.js`. Harness errors: 0.

## Shared visual acceptance

1. Every route uses Signal ink, ivory and acid lime, the exact selected Lux and wordmark, a deliberate heading/amount hierarchy, and substantial controls. Root financial numbers should carry the reference’s poster-like weight rather than a thin default account font.
2. At 390×844, ordinary Home aims to retain the full reference hierarchy in one viewport. At 375×667 and with long values, alerts or enlarged text, content may scroll naturally to preserve bold legible type. Long records, disclosures and legal content remain naturally reachable. Never reduce important copy into tiny text or clip an action to manufacture fit.
3. Main root headings target roughly 34–42px and lead money roughly 56–72px at normal phone width where the content permits; field/action labels remain readable, touch controls at least 44px. Wide amounts and 200% text must wrap/reflow. Actual font metrics and browser evidence, not these indicative numbers alone, determine acceptance.
4. Financial/privacy hooks and geometry, native keyboard/focus/history, field hints, error text, status symbols, sample disclosures and explicit consent remain authoritative. Distinctive art cannot cover controls, replace status icons or invent financial certainty.
5. Root hubs, editors, reviews, receipts, empty states and recovery states need different purposeful structures within one visual system. Recolouring every inherited card or adding a mascot above every form is insufficient.

## Coverage summary

| Visual family | Routes | Owner |
|---|---:|---|
| Home and navigation | 3 | Root: signal-home + signal-system; account agent: Menu |
| Welcome, setup and account access | 25 | signal-account.js / signal-account.css |
| Payments and payment decisions | 12 | signal-payments.js / signal-payments.css |
| Add money and funding outcomes | 4 | signal-payments.js / signal-payments.css; planning styles for post-funding Budget |
| Pause and Pause records | 4 | Root Signal Pause; payment records fallback for pauseLog |
| Plan, Budget, outlook and planning guides | 27 | signal-planning.js / signal-planning.css |
| Money Boxes, savings instructions and protection | 13 | signal-planning.js / signal-planning.css |
| Money Story, categories and daily insights | 8 | signal-planning.js / signal-planning.css |
| Complete IOU lifecycle | 12 | signal-planning.js / signal-planning.css |
| All Your Money, account calculations and external records | 5 | signal-planning.js / signal-planning.css; root generic for native balances fallback |
| Late-allowance recovery | 5 | signal-planning.js / signal-planning.css |
| Collections, splits, invitations, mandates and payouts | 36 | signal-payments.js / signal-payments.css |
| Cards and card lifecycle | 9 | signal-payments.js / signal-payments.css |
| Scan and personal QR | 2 | signal-payments.js / signal-payments.css |
| Activity, pending payments and money requests | 7 | signal-payments.js / signal-payments.css |
| Ask Lumo and contextual Chat tasks | 8 | signal-account.js / signal-account.css; root generic contextual-task fallback |
| Profile, account, security, privacy and preferences | 16 | signal-account.js / signal-account.css |
| Help, reports, feedback and confirmations | 5 | signal-account.js / signal-account.css; root shared confirmation controls |
| Merchant preview and settlement records | 9 | signal-payments.js / signal-payments.css; root generic fallback |
| Ambassador, testing and sample/reset utilities | 7 | signal-account.js / signal-account.css; root generic fallback |

## Home and navigation

Reference-led scale: oversized money, prominent Lux, three large actions, substantial useful conversation, paired destinations. No stranded blank lower third at 390×844. Menu uses a distinct brand masthead and tall destination rows.

| Route | Native placement | Native default treatment |
|---|---|---|
| `home` | Retained parent root | Page-owned |
| `monoMenu` | Task / records | selection |
| `more` | Retained parent root | Page-owned |

## Welcome, setup and account access

Welcome is a bold brand composition. Setup/access steps use a clear progress label, strong task title, readable inputs and one dominant next action. Identity consent remains visible. Error, pending and recovery screens keep their actual meaning.

| Route | Native placement | Native default treatment |
|---|---|---|
| `accountReady` | Dedicated or compatibility page | Page-owned |
| `accountReview` | Dedicated or compatibility page | Page-owned |
| `applicationCorrection` | Dedicated or compatibility page | Page-owned |
| `applicationStatus` | Dedicated or compatibility page | Page-owned |
| `campus` | Dedicated or compatibility page | Page-owned |
| `campusInterest` | Dedicated or compatibility page | Page-owned |
| `campusInterestSaved` | Dedicated or compatibility page | Page-owned |
| `campusStatus` | Dedicated or compatibility page | Page-owned |
| `confirmPin` | Dedicated or compatibility page | Page-owned |
| `identity` | Dedicated or compatibility page | Page-owned |
| `identityResult` | Dedicated or compatibility page | Page-owned |
| `livecheck` | Dedicated or compatibility page | Page-owned |
| `otp` | Dedicated or compatibility page | Page-owned |
| `phone` | Dedicated or compatibility page | Page-owned |
| `pilotUnavailable` | Dedicated or compatibility page | Page-owned |
| `pin` | Dedicated or compatibility page | Page-owned |
| `privacyNotice` | Dedicated or compatibility page | Page-owned |
| `recovery` | Dedicated or compatibility page | Page-owned |
| `recoveryOwnership` | Dedicated or compatibility page | Page-owned |
| `recoveryReplacement` | Dedicated or compatibility page | Page-owned |
| `recoveryStatus` | Dedicated or compatibility page | Page-owned |
| `setupChoice` | Dedicated or compatibility page | Page-owned |
| `setupProgress` | Dedicated or compatibility page | Page-owned |
| `signin` | Dedicated or compatibility page | Page-owned |
| `welcome` | Dedicated or compatibility page | Page-owned |

## Payments and payment decisions

Payment hub has assertive service choices; amount entry prioritises the real amount and checked recipient; review reads as a deliberate receipt; PIN/auth is visually focused. Pending, failed, reversed and confirmed outcomes remain explicitly distinct.

| Route | Native placement | Native default treatment |
|---|---|---|
| `authorize` | Task / payment | confirmation |
| `bill` | Task / payment | edit |
| `everydayPayments` | Task / payment | selection |
| `everydayRepeatChoice` | Task / payment | confirmation |
| `pay` | Retained parent root | Page-owned |
| `paymentCancel` | Task / payment | confirmation |
| `paymentPlanLink` | Task / payment | form |
| `paymentRecovery` | Task / records | detail |
| `paymentResult` | Task / payment | confirmation |
| `paymentReview` | Task / payment | confirmation |
| `send` | Task / payment | edit |
| `sendOptions` | Task / payment | selection |

## Add money and funding outcomes

Source/destination and amount remain clear. Mobile money entry, review and outcome are visibly related. Bank instructions are scannable with prominent copy controls. A displayed success requires a confirmed native outcome.

| Route | Native placement | Native default treatment |
|---|---|---|
| `addMoney` | Task / funding | selection |
| `bankAdd` | Task / funding | detail |
| `budgetAfterFunding` | Task / funding | detail |
| `momoAdd` | Task / funding | form |

## Pause and Pause records

Large raised-palm Lux, one factual consequence and clear edit/continue choices on ink. Preserve cancellation and reading/hold phases. Sample examples remain labelled. The avatar never substitutes for a settlement/status symbol.

| Route | Native placement | Native default treatment |
|---|---|---|
| `pause` | Task / payment | pause |
| `pauseDemo` | Dedicated or compatibility page | Page-owned |
| `pauseLog` | Dedicated or compatibility page | Page-owned |
| `samplePause` | Dedicated or compatibility page | Page-owned |

## Plan, Budget, outlook and planning guides

Plan opens with a strong financial board and explicit costs/date context; editors have generous field and amount hierarchy; reviews have a definite conclusion; history and date review remain readable. Expected allowance never becomes money in hand.

| Route | Native placement | Native default treatment |
|---|---|---|
| `allowance` | Task / plan | edit |
| `budgetCategory` | Task / plan | detail |
| `budgetCycle` | Task / plan | edit |
| `budgetCycleReview` | Task / plan | confirmation |
| `budgetDelete` | Task / plan | confirmation |
| `budgetEstimate` | Task / plan | edit |
| `budgetHistory` | Task / plan | edit |
| `budgetPeriodReview` | Task / plan | detail |
| `budgetReviewDates` | Task / plan | edit |
| `budgetReviewNext` | Task / plan | edit |
| `essentialEdit` | Task / plan | edit |
| `essentials` | Task / plan | selection |
| `firstBudgetExample` | Task / plan | detail |
| `firstEssentials` | Task / plan | form |
| `firstGoal` | Task / plan | form |
| `firstPlanReview` | Task / plan | confirmation |
| `incomePlan` | Task / funding | confirmation |
| `makeRoom` | Task / plan | selection |
| `missions` | Task / plan | detail |
| `plan` | Retained parent root | Page-owned |
| `planBenefit` | Task / plan | detail |
| `planDraftRestart` | Dedicated or compatibility page | Page-owned |
| `planEdit` | Task / plan | selection |
| `planExplanation` | Task / records | detail |
| `planPeriod` | Task / plan | edit |
| `planSetup` | Task / plan | form |
| `spendingOutlook` | Task / records | detail |

## Money Boxes, savings instructions and protection

Boxes list and detail have authored saved-money/progress composition. Funding, return and Savings Hack actions are easy to distinguish. Target/progress are factual. Consent, restrictions and partner protection retain visibility and native controls.

| Route | Native placement | Native default treatment |
|---|---|---|
| `allocate` | Task / plan | edit |
| `allocationReview` | Task / plan | confirmation |
| `boxProtectionChange` | Task / plan | confirmation |
| `boxProtectionInvite` | Task / plan | confirmation |
| `boxProtectionSupport` | Task / plan | form |
| `goal` | Task / plan | detail |
| `goalEdit` | Task / plan | edit |
| `goals` | Task / plan | selection |
| `releaseGoal` | Task / plan | edit |
| `releaseReview` | Task / plan | confirmation |
| `savingMilestones` | Task / plan | detail |
| `savingRule` | Task / plan | edit |
| `savingsHackOverview` | Task / plan | detail |

## Money Story, categories and daily insights

Large real spending headline, legible periods/categories and an intentional chart/insight composition. Empty activity gets a designed explanation. Category editors and record details inherit the same typography and control rhythm.

| Route | Native placement | Native default treatment |
|---|---|---|
| `categoryEdit` | Task / records | edit |
| `categoryMatch` | Task / records | edit |
| `categorySort` | Task / records | edit |
| `dailyMoneyStory` | Task / records | detail |
| `homeMoneyStory` | Task / records | detail |
| `moneyStoryHome` | Retained parent root | Page-owned |
| `story` | Dedicated or compatibility page | Page-owned |
| `storyTx` | Task / records | edit |

## Complete IOU lifecycle

You owe and owed to you are visually unambiguous. Receivable summaries never resemble available cash. Forms, reviews, repayment recording/correction, receipt linking and closure use the same family language.

| Route | Native placement | Native default treatment |
|---|---|---|
| `iouClose` | Task / records | form |
| `iouCorrect` | Task / records | form |
| `iouDetail` | Task / records | detail |
| `iouForm` | Task / records | form |
| `iouHome` | Task / records | selection |
| `iouPayment` | Task / records | selection |
| `iouReceipt` | Task / records | selection |
| `iouReceiptReview` | Task / records | confirmation |
| `iouRecord` | Task / records | form |
| `iouRecordReview` | Task / records | confirmation |
| `iouRequestReview` | Task / records | confirmation |
| `iouReview` | Task / records | confirmation |

## All Your Money, account calculations and external records

One clear holdings board, with separate Lumo, savings and manual external records. Dates/manual nature are readable. Expected receipts and group pots are excluded; no visual treatment implies an external bank connection.

| Route | Native placement | Native default treatment |
|---|---|---|
| `allMoney` | Task / records | detail |
| `balances` | Task / records | detail |
| `moneySource` | Task / records | form |
| `moneySourceRemove` | Task / records | confirmation |
| `moneySourceReview` | Task / records | confirmation |

## Late-allowance recovery

A reassuring protective-checklist composition, clear current money and visible shortfall. Check-in date, protected costs and optional savings pause are legible. Partial/covered/reopened outcomes retain exact native meaning.

| Route | Native placement | Native default treatment |
|---|---|---|
| `recoveryAdjust` | Task / plan | form |
| `recoveryComplete` | Task / plan | selection |
| `recoveryPlan` | Task / plan | detail |
| `recoveryReview` | Task / plan | confirmation |
| `recoveryStart` | Task / plan | form |

## Collections, splits, invitations, mandates and payouts

Collect hub has bold choices; pot detail has a strong shared-money board; membership/mandate/approvals have readable role hierarchy. Setup, invitations, contribution, proposal, decline/withdrawal and payout review inherit intentional step layouts. Shared money never reads as personal spending money.

| Route | Native placement | Native default treatment |
|---|---|---|
| `collectionPayoutRail` | Task / records | selection |
| `groupMoneyApprovers` | Task / records | edit |
| `groupMoneyCollection` | Task / records | form |
| `groupMoneyContacts` | Task / records | selection |
| `groupMoneyDetail` | Task / records | detail |
| `groupMoneyHome` | Task / records | selection |
| `groupMoneyInvitation` | Task / records | confirmation |
| `groupMoneyInvitationDecline` | Task / records | confirmation |
| `groupMoneyInvitationMandate` | Task / records | detail |
| `groupMoneyInvitations` | Task / records | selection |
| `groupMoneyLifecycle` | Task / records | detail |
| `groupMoneyList` | Task / records | selection |
| `groupMoneyMandate` | Task / records | detail |
| `groupMoneyMember` | Task / records | confirmation |
| `groupMoneyPayments` | Task / records | selection |
| `groupMoneyPayoutRelease` | Task / records | form |
| `groupMoneyPayoutWithdraw` | Task / records | confirmation |
| `groupMoneyPeople` | Task / records | edit |
| `groupMoneyProposal` | Task / records | form |
| `groupMoneyProposalDecline` | Task / records | confirmation |
| `groupMoneyProposalDetail` | Task / records | confirmation |
| `groupMoneyProposalReview` | Task / records | confirmation |
| `groupMoneyRemoveGroup` | Task / records | confirmation |
| `groupMoneyReview` | Task / records | confirmation |
| `groupMoneyRules` | Task / records | detail |
| `groupMoneySample` | Task / records | edit |
| `groupMoneySampleInvitations` | Task / records | selection |
| `groupMoneySaveGroup` | Task / records | form |
| `groupMoneySource` | Task / records | selection |
| `groupMoneySplit` | Task / records | form |
| `monoGroupDraftReplace` | Task / records | confirmation |
| `sharedExpenses` | Task / records | selection |
| `sharedGroup` | Task / records | detail |
| `sharedReceive` | Task / records | edit |
| `sharedSplit` | Task / records | edit |
| `sharedSplitReview` | Task / records | confirmation |

## Cards and card lifecycle

Card face and fund/control surfaces have a distinctive Signal composition. Create/authorise/status/details/manage/checkout demo remain readable and cohesive. Sensitive card details keep their existing reveal/security treatment.

| Route | Native placement | Native default treatment |
|---|---|---|
| `cardsHome` | Retained parent root | Page-owned |
| `virtualCard` | Task / records | detail |
| `virtualCardAuthorize` | Task / records | confirmation |
| `virtualCardCreate` | Task / records | edit |
| `virtualCardDemo` | Task / records | form |
| `virtualCardDetails` | Task / records | detail |
| `virtualCardManage` | Task / records | edit |
| `virtualCardStatus` | Task / records | confirmation |
| `virtualCards` | Task / records | selection |

## Scan and personal QR

Scan/My code switching remains prominent. QR retains a quiet zone and adequate black-white contrast; Lux/branding stay outside the code. Camera/capture area and manual-upload controls remain usable.

| Route | Native placement | Native default treatment |
|---|---|---|
| `campusPay` | Task / payment | selection |
| `myQr` | Task / records | detail |

## Activity, pending payments and money requests

Readable record rows with strong amount/status alignment. Receipt details have their own visual hierarchy. Requests distinguish sent/received and waiting/processing/paid/declined/cancelled without relying on colour alone.

| Route | Native placement | Native default treatment |
|---|---|---|
| `activity` | Dedicated or compatibility page | Page-owned |
| `pending` | Task / records | selection |
| `requestConfirm` | Task / records | confirmation |
| `requestCreate` | Task / records | form |
| `requestDetail` | Task / records | detail |
| `requests` | Task / records | selection |
| `txDetail` | Task / records | detail |

## Ask Lumo and contextual Chat tasks

Lux-led opening with substantial question choices, clear attributed replies and readable human bubbles. Composer has visual authority and remains usable with keyboard. Calculations and bank-action sheets retain their original context.

| Route | Native placement | Native default treatment |
|---|---|---|
| `chat` | Retained parent root | Page-owned |
| `chatBankingActions` | Task / records | selection |
| `chatBankingChoice` | Task / records | selection |
| `chatBankingReplace` | Task / records | confirmation |
| `chatCalculation` | Task / records | detail |
| `chatCalendarPayments` | Task / records | detail |
| `chatExpectedDate` | Task / plan | edit |
| `hibiscusChatHistory` | Task / records | detail |

## Profile, account, security, privacy and preferences

Profile has an identity masthead; account records and settings use confident rows/cards; security/exports/statements/closure are deliberate task compositions. Labels, field help, toggles, destructive confirmations and sample disclosure remain clear.

| Route | Native placement | Native default treatment |
|---|---|---|
| `accountInfo` | Task / account | detail |
| `accountTerms` | Task / account | detail |
| `changePin` | Task / account | form |
| `closeAccount` | Task / account | form |
| `dailyAccountNotice` | Task / account | detail |
| `dailyUpdatePrefs` | Task / account | edit |
| `dataExport` | Task / account | form |
| `devices` | Task / account | form |
| `notificationPrefs` | Task / account | edit |
| `notifications` | Task / account | detail |
| `privacy` | Task / account | edit |
| `profile` | Task / account | detail |
| `profileEdit` | Task / account | edit |
| `profilePhone` | Task / account | form |
| `security` | Task / account | form |
| `statements` | Task / account | form |

## Help, reports, feedback and confirmations

Help has a proper heading/choice hierarchy; reports and feedback use generous fields; saved/missing/closed report states remain distinct. Confirmations present consequences and a clear cancel choice.

| Route | Native placement | Native default treatment |
|---|---|---|
| `actionConfirm` | Task / support | confirmation |
| `caseDetail` | Task / support | form |
| `feedback` | Task / support | form |
| `help` | Task / support | selection |
| `supportCase` | Task / support | form |

## Merchant preview and settlement records

Merchant choices, collection forms, sales lists and settlement detail inherit the bold Signal type/buttons/rows and readable data tables. Merchant and sample boundaries remain explicit. No legacy colour/card typography leaks through.

| Route | Native placement | Native default treatment |
|---|---|---|
| `merchant` | Dedicated or compatibility page | Page-owned |
| `merchantApply` | Dedicated or compatibility page | Page-owned |
| `merchantCollect` | Dedicated or compatibility page | Page-owned |
| `merchantCollection` | Dedicated or compatibility page | Page-owned |
| `merchantDestination` | Dedicated or compatibility page | Page-owned |
| `merchantPayer` | Dedicated or compatibility page | Page-owned |
| `merchantSales` | Dedicated or compatibility page | Page-owned |
| `settlementDetail` | Dedicated or compatibility page | Page-owned |
| `settlements` | Dedicated or compatibility page | Page-owned |

## Ambassador, testing and sample/reset utilities

Guides and sample/reset choices receive the same strong headings and readable action hierarchy. Preview-only tools and destructive sample replacement/reset stay explicit, reachable and visually distinct.

| Route | Native placement | Native default treatment |
|---|---|---|
| `ambassadorGuide` | Dedicated or compatibility page | Page-owned |
| `ambassadorReset` | Dedicated or compatibility page | Page-owned |
| `ambassadorSample` | Dedicated or compatibility page | Page-owned |
| `ambassadorWelcome` | Dedicated or compatibility page | Page-owned |
| `resetConfirm` | Dedicated or compatibility page | Page-owned |
| `sampleConfirm` | Dedicated or compatibility page | Page-owned |
| `testing` | Dedicated or compatibility page | Page-owned |

## Adapter coverage audit

The three family agents have now landed their new source files. Source adapters were evaluated against the 217 live view keys without altering product files.

- `signal-planning.js` classifies 71 live routes; zero unknown route names. This includes the initially omitted allowance, missions, savings reviews/milestones, category editors and native balances calculation.
- `signal-payments.js` classifies 79 live routes through exact maps and collection/card/merchant prefixes. This includes legacy split/request records, invitations, payout rails, card subflows, QR and merchant/settlement pages.
- The sole planning/payment overlap is `budgetAfterFunding`: native funding outcome styling and planning typography are both intentional; no new controller or financial state is added.
- `signal-account.js/css` covers Welcome, all `.onboarding-page` access/setup aliases, Chat and contextual controls/history, profile/account/privacy/security/preferences, Help/report/feedback, Menu and ambassador/sample/reset utilities. These rely on actual component/route selectors rather than one exhaustive route array.
- The root Signal system owns common headings, fields, rows, controls, task chrome, empty states and Pause presentation, so a compatibility or rarely used route still receives the same base visual language.

The integrated shipped bundle now loads all three new family adapters. A targeted decorator comparison across 24 representative sample/default branches found unchanged control text, handlers, IDs, field constraints and ARIA for buttons, inputs, forms, links and summaries, with zero harness errors. Evidence: [decorator-control-audit.json](decorator-control-audit.json). This does not cover every branch or establish browser geometry.

These are ownership/source checks. Final bundled browser evidence remains required below.

## Release evidence still required

- Visual representatives from each family, including empty/populated, wide values, hidden/revealed money and relevant failure/pending states.
- Real entry journeys through Welcome, Home Pay, Collect, Menu, Plan, Boxes, Money Story, IOUs, All Your Money, late-allowance recovery, account settings and QR.
- Browser checks for horizontal overflow, overlap, tap reachability, keyboard layout and enlarged text. Runtime/source coverage does not prove browser layout.
- The required full edition regression and deterministic build checks remain owned by the release reviewer.
