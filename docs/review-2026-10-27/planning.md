# Planning, savings and shared-money review

Review date: 27 October 2026. Phases 1 and 2 complete before implementation; bounded Phase 3 authorised by parent.

## Scope and evidence

This audit covers **82 actual route IDs and contextual branches** in the shipped Everyday script stack. The common product modules are shared with Minna and Hibiscus. Source inspection covers each route below and its available, empty, draft, stale, pending and closed branches. An isolated mounted harness loaded the actual `dist/index.html` module order and retained `tests/manual-layout/overflow-seed.js` fixtures for 24 representative routes. It confirmed current text, action hierarchy and redirects; `/tmp/lumo-planning-mounted.json` is the working capture. That is functional/source evidence, not a visual assessment of every edition. Root owns browser review and geometry.

Latest decisions are constraints: menu **Plan**; Home's Budget-details action opens the details directly; separate Everyday and savings accounts; Savings hack controls remain with Fund/Transfer back; explanatory guidance remains below and collapses on return; approved two-week Pause story stays; group mandates, approver roles and invitation rules remain intact. Group workflow redesign was paused by the user, so proposed shared-money work is presentation and recovery only.

## Iteration 1 hypotheses and iteration 2 challenge

The first pass looked for too many competing actions, unclear account boundaries, generic recovery messages and repeated education. The second pass mounted the final script order, checked downstream decorators and rejected proposals already addressed:

- **Rejected: simplify Plan's competing creation CTAs.** Raw `budget-overview.js` has two, but final `experience-clarity.js:50–65` replaces these with one Create/Update action. `planBenefit` already distinguishes “Build it with Lumo” from “Enter it myself.” Preserve this.
- **Rejected: add “paid / left” semantics to every Budget row.** `budget-readability.js:32–45` already renders those facts, pending amounts and covered-elsewhere meaning.
- **Rejected: move the whole Savings hack card up.** Latest user explicitly asked to raise controls while keeping explanations down. `savings-hacks-ui.js:110–122` now does this. Improve only current-state recognition if visual review warrants it.
- **Rejected: shorten or collapse proposal/mandate acceptance details as general guidance.** These communicate role, exact scope and the rules controlling money; they are not repeated marketing text.
- **Rejected: change the Pause story.** It is an approved, deliberately deferred concept. Review presentation/accessibility while preserving the story and timing.

## Confirmed findings and proposed implementation

### P1 — No-draft Budget suggestion has a dead primary action

`budget-history.js:115–119` renders “Your suggestion is in a draft” whenever `budgetHistoryDraft` is absent. Its Continue Budget draft action calls `resume()` (`:58`), which acts only when an actual setup/cycle blocker exists. When there is no draft at all, it returns false. The retained standard fixture reproduces this state: the page says a draft exists and its primary action does nothing.

Use a truthful no-suggestion state. Continue an existing setup/cycle if one exists; otherwise offer a fresh suggestion through the existing `open()` or a clear return to Budget. Do not generate or save a Budget while merely displaying a recovery page. Verify stale/back/bookmark entry after a suggestion has already been used and saved.

### P1 — Group payment empty state asks members to perform unavailable actions

`group-money-ui.js:303–307` always says “Propose a payment for the group to approve” when there are no proposals. The correct button guards omit Propose for contributors/approvers, organisers without available money, and incomplete mandate acceptance. The instruction and available action therefore disagree.

Keep the guards. Make the empty-state explanation match the current role and state: members await an organiser's proposal; an organiser awaiting acceptance sees that requirement; an accepted empty pot needs contributions before proposals. Reuse the existing Back to collection action. This is copy/state presentation, not a mandate change.

### P1 — Multi-row validation focuses an unrelated field

`budget-everyday.js:137` sends every cycle-validation error to `cycle-end`, including bad category amounts. `budget-history.js:83–84` sends any invalid selected row to `history-amount-0`, which may be valid or unselected. The error announcement can therefore point at the wrong control.

Keep existing validators and limits. Identify the first actual invalid selected row/date and use its real input ID for `L.error`. Preserve typed values and consent. Verify a bad second/last selected row, an unchecked first row, invalid dates and a stale/pending blocker; do not mark a valid date field invalid for a row-amount error.

### P2 — Successful hack editing loses the selected-box context

`money-boxes.js:43` always finishes a successful metadata/hack save at `goals`; `savingsHackUI.cancel()` already returns an existing edit to its selected `goal`. A customer editing automation must reopen the box to confirm its new status.

Return successful updates to the edited box. Keep creation at the existing new-box funding success/banner flow. Partner invitation/change branches remain authoritative and may take precedence. Verify edit, unchanged metadata, paused rule, changed consent, protected-box changes and creation separately.

### P2 — Collection mandate selection precedes its member dependency

`group-money-ui.js:201–207` puts approval modes before the member inputs. Choosing named approvers calls `openApprovers()` (`:88`), which first validates completed member names. The first visible choice can therefore produce an error about fields below it.

Cycle-2 decision: **defer this reorder**. It is friction rather than a demonstrated blocker, and the user paused the group-flow redesign. Keep the existing order for this finish pass unless visual review identifies a blocking defect. Validation and exact threshold communication remain essential.

### P2 — Manual first-Budget setup exposes too many assistance controls at once

The mounted `firstEssentials` includes Continue in Chat, existing-item Edit links, Suggest from my spending, category, full global-period controls, Help me estimate, Review, Add another item and Finish later (`plan-setup.js:217–228`, `budget-guide-ui.js:18–24`, `budget-estimate.js:55–57`). These are valid tools; the hierarchy makes the basic two-field task harder to see.

Keep category and total prominent, including the essential “one total through DATE, not per day” hint. Show the already selected global period as a compact editable summary, retaining the same fields within a disclosure. Group optional Chat/history/arithmetic assistance lower down. Review and Add another stay clear; do not remove capabilities or introduce extra required steps. Browser review should determine whether the compact period alone solves enough clutter before adding another disclosure.

### P2 — Comparison-date field name implies changing the saved Budget

`budget-period-review.js:117` correctly says these dates apply only to the review, but labels the end field “Budget through” beside “Review from.” Rename the end label to “Review through”; the chosen dates and saved Budget must remain unchanged in behavior. Keep actual Budget-period editing at `planPeriod`.

### P2/P3 — Contextual polish after the above

- `groupMoneyList` (`group-money-ui.js:178–182`) uses the same “Nothing here yet / Create a split or join a collection” empty state for All, Splits and Collections. Use a filter-specific title and next-step copy; avoid sending a Splits-only customer toward an invitation that will not appear in that filter.
- `groupMoneyInvitations` (`:331–336`) always makes Try an invitation the primary footer action, even with real saved sample invitations present. Keep the demonstration reachable, but make existing invitations and collections the hierarchy when records exist.
- An active hack's compact upper block says On/Paused but not which method (`savings-hacks-ui.js:110–115`). A short method/rate caption could improve recurring recognition; the full explanation and limits must stay below. This needs visual judgment because the user explicitly requested less text.
- Archive is always offered on a funded Money Box and then refused by toast (`money-boxes.js:49–54`). Prefer a quiet inline prerequisite or lower management affordance; do not change the requirement to transfer money back first.

## Screen-by-screen catalogue

“Keep” means its current structure or rule is appropriate; it is still included in first-time and returning review. State notes distinguish missing context/compatibility routes from ordinary product screens.

### Budget and planning — 27 routes

| Route | Source evidence | First-time / recurring assessment and state decision |
| --- | --- | --- |
| `plan` | `plan-hub.js:8`, `budget-overview.js:36`, `experience-clarity.js:50` | One create/update CTA, Budget meaning and separate Money Boxes are clear. Keep direct Home-details behavior; empty, dated, ended, paid and shortfall facts must remain accurate. |
| `planBenefit` | `plan-benefit.js:32`, `budget-guide-ui.js:10`, `hibiscus-budget-clarity.js:16` | A deliberate first-use explanation with explicit chat/manual choices. Keep; returning customers already reach management directly. |
| `planExplanation` | `plan-benefit.js:66` | Intentional calculation task; keep scope qualifier, expected-money exclusion and separate savings facts even for experienced users. |
| `planEdit` | `budget-overview.js:48`, `budget-readability.js:65` | Actual costs and one assistance entry; guide is now lower. Keep category editing and visible total/period; empty creates rather than edits. |
| `essentials` | `budget-overview.js:49` | Alias of management with “Your Budget items”; keep behavior aligned with `planEdit`, including seven-category limit and pending/external coverage. |
| `essentialEdit` | `app.js:17`, `budget-categories.js:76`, `budget-overview.js:102` | Category plus total semantics are essential, not disposable tutorial. Preserve pending/missing-item recovery and no-money-save meaning. |
| `budgetCategory` | `budget-overview.js:54`, `budget-readability.js:69` | Category total and paid/left progress are helpful to both. Keep legacy duplicate originals and payment history; deleted/missing item has an actionable return. |
| `budgetDelete` | `budget-overview.js:72` | Explicit consequence/Keep choice is appropriate. Keep draft-clearing disclosure, pending guard and stale-signature error. |
| `allowance` | `app.js:13`, `page-guidance.js` | Optional expectation is distinct from received money; repeated intro now collapses. Keep date/source fields and current expected-income labels. |
| `planPeriod` | `plan-setup.js:177` | Dedicated global-period editor; keep optional/unspecified and allowance-date semantics. Cancel must retain the saved period. |
| `planSetup` | `plan-setup.js:187` | Optional expected-money branch, not a required first-Budget step. Keep Continue/Not sure, draft retention and no received-money implication. |
| `firstEssentials` | `plan-setup.js:217`, `budget-guide-ui.js:19` | Category/amount goal is sound; assistance and period compete with it. P2 hierarchy proposal above; preserve draft and exact period-total hint. |
| `firstGoal` | `plan-setup.js:267` | Compatibility route delegates version-2 accounts to separate Money Box setup. Keep; do not revive obsolete goal-as-budget allocation. |
| `firstPlanReview` | `plan-setup.js:290`, `budget-guide-ui.js:27` | Clear total/room and explicit Save. Guided drafts show interpreted items; manual drafts use disclosure. Keep pending/stale and amount-scope warnings. |
| `planDraftRestart` | `plan-setup.js:143` | Explicit unsaved-draft replacement confirmation is a good recovery model. Keep current saved Budget and historical payments untouched. |
| `firstBudgetExample` | `plan-setup.js:321` | Optional first-use payoff, explicitly a projection; keep Example/no-payment boundary. Returning customers should not be repeatedly prompted. |
| `budgetAfterFunding` | `budget-everyday.js:182`, `funding-budget.js` | Distinguishes first setup from incoming money with existing Budget. Keep receipt reference and original payment return context; do not force Budget creation. |
| `incomePlan` | `budget-everyday.js:180` | Received amount/current remaining costs and keep/adjust are meaningful. Pending/no-credit branch must not claim money arrived. Keep existing-period semantics. |
| `budgetEstimate` | `budget-estimate.js:50` | Rate × count tool has useful live total and Use/Cancel. Keep draft-only meaning and stale-context recovery; do not auto-save a cost. |
| `budgetHistory` | `budget-history.js:115` | Four-week basis and editable suggestion are sound. P1 no-draft recovery and precise row-error focus need correction; incomplete history should explain why. |
| `budgetCycle` | `budget-everyday.js:153` | Reuses full category totals without rolling unspent money. Keep explicit dates, review and saved draft; improve bad-row error focus. Consider discard confirmation for edited drafts. |
| `budgetCycleReview` | `budget-everyday.js:157` | Total/dates/replacement meaning are explicit; keep final confirmation and item disclosure. Missing draft safely returns to Plan. |
| `budgetPeriodReview` | `budget-period-review.js:123` | Planned vs recorded and “so far” are meaningful recurring facts. Keep missing categories, pending amounts, external-spending caveat and refresh requirement. |
| `budgetReviewDates` | `budget-period-review.js:115` | Comparison-only dates are correctly separate. P2 rename “Budget through” to “Review through”; retain invalid/future-date handling. |
| `budgetReviewNext` | `budget-period-review.js:119` | Clear next-period dates and keep/adjust progression. Keep current Budget until final confirmation and existing blocker recovery. |
| `spendingOutlook` | `spending-outlook.js:41` | Daily guide explicitly covers extras, time basis and rounded calculation. Keep no-Budget, gap, missing/ended/changed-allowance and due-today branches; never promise funds will last. |
| `makeRoom` | `money-boxes.js:163` | Options are relevant to the current payment. Keep actual available box amounts, protected withdrawal and original-payment return; no generic tutorial collapse here. |

### Money Boxes, automation and protection — 12 routes

| Route | Source evidence | First-time / recurring assessment and state decision |
| --- | --- | --- |
| `goals` | `money-boxes.js:20`, `saving-rules.js:158` | Clear savings total, box cards and create/fund feedback. Lower first-use explanation is suitable; keep pending transfers and archived restoration distinct. |
| `goal` | `money-boxes.js:45`, `savings-hacks-ui.js:110–122` | Latest Fund/Transfer/Hack priority is correct. Preserve balance, target, pending hold, protection status and low explanatory placement. Optional compact method caption only. |
| `goalEdit` | `money-boxes.js:25` | Optional hack/protection are genuinely optional. Preserve fresh consent and metadata rollback; return successful existing-box edits to the selected box (P2). |
| `allocate` | `money-boxes.js:75` | Source balance, destination account and live impact are appropriate. Keep zero/insufficient balance error and later review/PIN; do not use this page to move money. |
| `allocationReview` | `money-boxes.js:86` | Compatibility alias to current payment review. Keep actual reachable review rather than rendering an obsolete allocation-only screen. |
| `releaseGoal` | `money-boxes.js:75` | Amount available in the selected box and confirmation delay matter. Keep pending hold, partner requirement and own authorisation. |
| `releaseReview` | `money-boxes.js:86` | Compatibility alias to current transfer review. Keep consistent source/destination and protected withdrawal branch. |
| `savingRule` | `saving-rules.js:143` | Earlier manual receipt prompt stays only for existing users and is clearly manual. Preserve separate authorisation and remove preference; do not duplicate new per-box setup. |
| `savingMilestones` | `saving-rules.js:147` | Actual saved amount and recorded milestones are truthful. Keep empty progress meaning, pending exclusion and current balance after withdrawals. |
| `boxProtectionInvite` | `money-box-protection-ui.js:71` | Pending/active/expired/locked invitation states are explicit and sample-labelled. Keep acceptance voluntary, codes scoped and current partner in place until replacement accepts. |
| `boxProtectionChange` | `money-box-protection-ui.js:105` | Shows exact switch/change and current protection. Keep fresh partner approval, Keep current protection and applied-state confirmation. |
| `boxProtectionSupport` | `money-box-protection-ui.js:122` | Pending/approved/declined are distinguished and sample-only. Keep no-unlock-on-request meaning and return to exact transfer/change; no fake real support connection. |

### Pause surfaces — 4 routes

| Route | Source evidence | First-time / recurring assessment and state decision |
| --- | --- | --- |
| `pause` | `pause.js:11`, `clarity-pause.js:44`, `pause-recovery.js:27` | Current mounted page gives consequence, exact payment and alternatives before own authorisation. Keep timer/reduced-motion, Edit/Continue and projected calculation; visual root review decides density. |
| `samplePause` | `pause-intro.js:66` | Preserve the user-approved future-contribution/two-week story, immediate sign-up/skip, Replay and reduced-motion static presentation. Example is not a real withdrawal. |
| `pauseDemo` | `pause.js:28` | Tester-only scenario selector. Keep non-test redirection; do not promote debug signals into the customer experience. |
| `pauseLog` | `pause-engine.js:112`, `pause.js:35` | Tester-only response record. Keep sample privacy and non-test guard; not a production spending report. |

### Splits and group collections — 25 routes

| Route | Source evidence | First-time / recurring assessment and state decision |
| --- | --- | --- |
| `groupMoneyHome` | `group-money-ui.js:171` | Three distinct requests and recent records are clear. Preserve individual-request engine and earlier shared records; global styling may reduce visual repetition. |
| `groupMoneyList` | `:178` | All/Splits/Collections filters and five-row pagination are useful. Contextualise empty title/next step to the selected filter. |
| `groupMoneySplit` | `:184` | Existing expense is not a second charge; completed-source total is read-only. Keep explicit Outside Lumo path, fee exclusion and 1-of-3 progress. |
| `groupMoneySource` | `:189` | Completed eligible payment list and outside-payment fallback are sound. Keep duplicate source exclusions and no-payment empty-state path. |
| `groupMoneyCollection` | `:194` | Target/deadline and separate collection account are explicit. Keep future-date validation and 1-of-3 flow; no personal-balance implication. |
| `groupMoneyPeople` | `:198` | People, shares and saved groups are functional. Move mandate choices below their member-entry dependency (P2); keep live count, owner share and equal/custom math. |
| `groupMoneyApprovers` | `:209` | Explicit names and threshold correctly separate role from contribution. Keep minimum two, organiser vote only if chosen and fresh validation after membership edits. |
| `groupMoneyContacts` | `:216` | Recent/Lumo/saved/device sources and selected count are useful. Keep already-included protection and consented phone picker; zero-selection button could become disabled with explanation. |
| `groupMoneySaveGroup` | `:230` | Reusable people, not reusable money, is clear. Keep self included once and fresh amounts on reuse. |
| `groupMoneyRemoveGroup` | `:234` | Clear confirmation removes a saved people list only. Keep existing split/collection records intact. |
| `groupMoneyReview` | `:238` | Expense shares or target/account/deadline/mandate are explicit before create. Keep agreement language and full mandate access; creation moves no money. |
| `groupMoneyDetail` | `:246` | Contribution total, separate sample balance, role, mandate and reserved/available figures are useful recurring data. Keep each member's actual recorded amount and closed/source-changed states. |
| `groupMoneySample` | `:258` | Clearly marked simulated contribution/repayment. Keep correct local contributor restriction, remaining-target/share amount and no personal-account debit. |
| `groupMoneyRules` | `:264` | Details/activity and cancel/refund confirmations preserve history. Keep proportional unspent refund rule, source references and organiser-only management. |
| `groupMoneyMandate` | `:277` | Full rules, roles and acceptance list must remain readable. Keep legacy/invalid mandate recovery and exact shared version. |
| `groupMoneyMember` | `:288` | Organiser's explicitly labelled member simulation; not a real identity switch. Keep accepted/approver gating and return to exact proposal/mandate. |
| `groupMoneyPayments` | `:303` | Available/reserved funds and proposal list are correct. Fix role/acceptance/balance-aware empty prompt (P1); keep all proposal guards. |
| `groupMoneyProposal` | `:309` | Recipient/purpose/amount and available balance are clear. Keep no-fee sample and group-approval requirement before any disbursement. |
| `groupMoneyProposalReview` | `:314` | Exact proposal facts plus required approvals/reservation/48-hour expiry are material. Keep explicit create vs payment distinction. |
| `groupMoneyProposalDetail` | `:320` | Approval count, exact details and member decisions are transparent. Keep contributor read-only role, organiser execution, stale/expired/cancelled/paid states and scope-sensitive approvals. |
| `groupMoneyInvitations` | `:331` | Existing roles/status/organiser list is useful. Move demonstration below real saved invitations when records exist; preserve sample scenario access. |
| `groupMoneySampleInvitations` | `:337` | Approver/contributor and expired/closed examples fulfil requested test scenarios. Keep clearly sample labelled and avoid real invitation claims. |
| `groupMoneyInvitation` | `:341` | Shows role, named threshold, target/deadline, organiser and full mandate. Keep accept/decline, stale refresh and unavailable/closed/expired/joined state distinctions. |
| `groupMoneyInvitationMandate` | `:353` | Deliberate full agreement page. Do not auto-collapse roles/rules as ordinary guidance. Back returns to the pending decision. |
| `groupMoneyInvitationDecline` | `:357` | Clear consequence and Keep alternative; no contribution or authority granted. Preserve history and exact role wording. |

All `:LINE` entries in this section refer to `dist/group-money-ui.js`.

### Earlier shared-cost records — 5 routes

| Route | Source evidence | First-time / recurring assessment and state decision |
| --- | --- | --- |
| `sharedExpenses` | `shared-expenses.js:134` | Earlier records and eligible completed payments remain readable. Preserve no-payments fallback; modern requests hub is the primary creation path. |
| `sharedSplit` | `shared-expenses.js:138` | Legacy equal/custom form includes self and payment source. Keep totals and fee exclusion; missing draft safely returns to earlier list. |
| `sharedSplitReview` | `shared-expenses.js:142` | Explicit share review; creating private requests moves no money. Keep legacy context instead of treating absent draft fallback as a broken page. |
| `sharedGroup` | `shared-expenses.js:146` | Original payment, confirmed repayments and unpaid shares are distinct. Keep changed-source warning, closed-request renewal and explicit sample controls. |
| `sharedReceive` | `shared-expenses.js:151` | Sample receipt recording only. Keep amount/reference, no-real-charge disclosure and original source constraints. |

### Shared payment/request contexts — 9 routes

These are owned jointly with the payment audit; this review covers only planning/savings/shared-cost decoration.

| Route | Source evidence | First-time / recurring assessment and state decision |
| --- | --- | --- |
| `addMoney` | `pause-recovery.js:65` | When reached from Pause, exact original payment and current funding need remain visible. Keep separate receipt/return and no automatic payment promise. |
| `send` | `money-boxes.js:96` | Box draft reuses selected box entry; ordinary send stays with payments. Keep original draft ownership and correct box/direction scope. |
| `paymentReview` | `money-boxes.js:99`, `money-box-protection-ui.js:87` | Box source/destination/fee, projected balances and partner approval stay together. Keep stale/insufficient quote recovery and approval for the exact amount. |
| `authorize` | `money-boxes.js:122` | Own PIN/biometric approval remains separate from partner approval. Keep exact box/amount and changed-quote re-review; do not hide security instructions as repeat guidance. |
| `paymentResult` | `money-boxes.js:147`, `shared-expenses.js:162` | Savings movement is not spending; pending/failed/reversed have truthful status. Keep original receipt/reference and separate split affordance for eligible external spending only. |
| `txDetail` | `money-boxes.js:152`, `saving-rules.js:181`, `shared-expenses.js:162` | Current status/history and sample boundaries remain. Keep pending refresh vs new attempt, actual ledger amounts and legacy receipt prompts without double saving. |
| `requests` | `shared-expenses.js:163`, `group-money-ui.js:171` | Individual and shared money remain reachable from the modern chooser. Keep individual request ownership/status and avoid duplicating primary creation hierarchies. |
| `requestDetail` | `shared-expenses.js:156` | Shared-cost request shows original share, received and unpaid separately. Keep source-change and closed-request guards; unpaid requests are not available money. |
| `chatBankingActions` | `shared-expenses.js:164`, `budget-guide-ui.js:50` | Assistance is a route to the same draft, not a second ledger. Keep Budget and earlier shared-cost actions; primary Chat UX is reviewed separately. |

## Acceptance checks for an implementation pass

1. Reproduce no-draft Budget history, then prove its primary recovery acts and never saves costs merely on view.
2. Render group payments for organiser/member, zero/non-zero funds, accepted/unaccepted mandate and existing proposals; each empty prompt must describe an available next step.
3. Put an invalid amount in the last selected row with the first row valid/unchecked; focus and `aria-invalid` must identify that exact row, while dates remain valid and typed values survive.
4. Save an existing hack, then observe the selected box and new status without reopening it; create a new box and retain the established funding-success path.
5. If member/mandate ordering changes, verify picker, saved groups, custom split shares and named approvers retain all values and the exact review guard.
6. Compare first/returning Budget setup at 320×568, 375×667 and 150% text. Category/amount/review must remain clear and all optional tools reachable. Keep inline total-period semantics.
7. Run existing Budget, Money Box/protection, Savings hack, group/mandate and task-sheet journey suites before peer sync; browser geometry and each edition's final appearance remain separate proof.

## Mounted defect reproductions

The following were reproduced after the initial catalogue using the actual shipped module order and isolated sample state:

- A negative `cycle-amount-1` produced the correct positive-amount error, but focus and `aria-invalid` were applied to valid `cycle-end`.
- A negative `history-amount-1` in Food/Transport rows produced the row-validation error, but focus and `aria-invalid` were applied to valid `history-amount-0`.
- On `budgetHistory` with `planDraft`, `budgetCycleDraft` and `budgetHistoryDraft` all absent, clicking Continue Budget draft left the route unchanged and created no resumable draft. No renderer errors occurred; it is an inert recovery action.
- On group payments with no proposals, an accepted organiser and zero available funds saw “Propose a payment” but only Back to collection. An invited contributor with GH₵600 available also saw that instruction despite `canPropose:false`, again with only Back. The guards are correct; the empty-state copy is wrong.

## Proposed ownership for an approved implementation pass

The smallest functional/recovery package is `dist/budget-history.js`, `dist/budget-everyday.js`, `dist/money-boxes.js`, `dist/group-money-ui.js` and `dist/budget-period-review.js`, with a focused mounted planning-UX test. These need parent coordination because Money Box payment contexts overlap the payment audit. No financial engine, ledger, mandate rule or approval controller needs to change. Form hierarchy/period/tool presentation should wait for root’s visual second pass and may use scoped CSS or an existing UI adapter.

## Phase 2 — actual edition visuals and design challenge

Used a separately owned browser tab on the source-only `__deep-gallery.html` planning gallery. Each frame was the actual edition source at 375×667, with isolated in-memory sample state. Reviewed all **73 registered planning routes in all three editions**. The 82-route source catalogue above additionally includes shared payment contexts owned with the payments audit. Screenshots were viewport captures, not full-page captures. When early gallery screenshots showed mixed old/new frames, those were treated as fixture timing artifacts and not as product defects; later review used completed generation labels and a separate fresh observation before each screenshot.

Everyday received both first/return optical passes. For peers, reviewed every first-use screen, then separately reviewed every changed returning layout. All three generated inventories confirm the same seven guidance-layout changes: `allowance`, `essentialEdit`, `essentials`, `goal`, `goalEdit`, `goals`, `planEdit`. Those seven were visually checked with lower guidance collapsed in Minna and Hibiscus. Other returning surfaces were reviewed through actual first/return task-state comparisons; equivalent layouts were not falsely counted as a second unique visual. Changes in generated sample codes/references were distinguished from changes to fields, actions or money. All three inventories contain 73 planning routes with no renderer errors or fallbacks.

### Visual coverage ledger

All rows below received an optical review in Everyday, Minna and Hibiscus. “Ends” means lower controls/supporting details additionally inspected; the source catalogue still covers every branch.

| Gallery group | Routes reviewed | Additional review / result |
| --- | --- | --- |
| 1–4 | `allocate`, `allocationReview`, `allowance`, `boxProtectionChange` | First and returning allowance footer; enriched pending partner-change state. Transfers clearly separate source/destination. Confirmed wrong transfer-specific copy on a protection change. |
| 5–8 | `boxProtectionInvite`, `boxProtectionSupport`, `budgetAfterFunding`, `budgetCategory` | Enriched invitation, pending support reference, confirmed incoming sample credit and actual Food category. No support request implies an unlock. |
| 9–12 | `budgetCycle`, `budgetCycleReview`, `budgetDelete`, `budgetEstimate` | Both no-context recovery and enriched real drafts/confirmation/15×7 estimate. Cycle footer inspected; touching pills in Hibiscus confirmed. |
| 13–16 | `budgetHistory`, `budgetPeriodReview`, `budgetReviewDates`, `budgetReviewNext` | Both no-context recovery and enriched four-week suggestion/comparison/date forms. Expanded recorded calculation/category comparisons inspected. Comparison end-label issue confirmed. |
| 17–20 | `essentialEdit`, `essentials`, `firstBudgetExample`, `firstEssentials` | First/return and form ends in all peers. Actual category-total semantics remain useful. Setup amount appears well below the first viewport because assistance, saved items and period all precede it. |
| 21–24 | `firstGoal`, `firstPlanReview`, `goal`, `goalEdit` | First/return lower guides. Optional hack and protection controls remain optional. In isolated Hibiscus frame, inspected all four automated-method parameter forms and consent, saved an income hack, verified existing-edit return goes to list, reopened selected box and inspected active compact controls. No real money or user records involved. |
| 25–28 | `goals`, `groupMoneyApprovers`, `groupMoneyCollection`, `groupMoneyContacts` | First/return savings guide and approver/footer controls. Hibiscus selected-approver text is unreadable against selected dark-plum background; reported to system owner. Money Box list/card fits. |
| 29–32 | `groupMoneyDetail`, `groupMoneyHome`, `groupMoneyInvitation`, `groupMoneyInvitationDecline` | Role, contribution balance, pending invitation and decline consequence remain distinct. No forced group-flow redesign. |
| 33–36 | `groupMoneyInvitationMandate`, `groupMoneyInvitations`, `groupMoneyList`, `groupMoneyMandate` | Full mandate ends, member roles/acceptance lists and return paths checked in all editions. Required agreement text retained. Demonstration still outweighs saved invitations. |
| 37–40 | `groupMoneyMember`, `groupMoneyPayments`, `groupMoneyPeople`, `groupMoneyProposal` | Role preview, availability/reservations, approval mode, people inputs and proposal input are reachable. Preserve existing order; empty-role contradiction is copy, not authorisation logic. |
| 41–44 | `groupMoneyProposalDetail`, `groupMoneyProposalReview`, `groupMoneyRemoveGroup`, `groupMoneyReview` | Ends checked in all editions: individual decisions, exact proposal, reservation/expiry, full mandate access and explicit creation consent all reachable. |
| 45–48 | `groupMoneyRules`, `groupMoneySample`, `groupMoneySampleInvitations`, `groupMoneySaveGroup` | Expanded activity/management, sample expired/closed invitation alternatives and cancellation location inspected. Sample/real boundary remains clear. |
| 49–52 | `groupMoneySource`, `groupMoneySplit`, `incomePlan`, `makeRoom` | Completed payment/outside-Lumo choice, existing-expense wording, pending/confirmed income branches and savings/payment recovery inspected. |
| 53–56 | `pause`, `pauseDemo`, `pauseLog`, `plan` | Preserve approved Pause concept. Tester-only destinations resolve to ordinary Pay outside tester mode. Plan has one update action; Hibiscus Money Box card fits. |
| 57–60 | `planBenefit`, `planDraftRestart`, `planEdit`, `planExplanation` | First/return management lower guide inspected. Body explanation is deliberate task content. Legacy inner Back/LUMO/help row confirmed under task chrome on some forms. |
| 61–64 | `planPeriod`, `planSetup`, `releaseGoal`, `releaseReview` | Date/optional expected-money and transfer review controls fit and are reachable. Source/destination and projected balance stay visible. |
| 65–68 | `samplePause`, `savingMilestones`, `savingRule`, `sharedExpenses` | Approved two-week goal story retained. Legacy manual saving preference and separate authorisation are explicit; lower Save/Cancel inspected. |
| 69–72 | `sharedGroup`, `sharedReceive`, `sharedSplit`, `sharedSplitReview` | Full prepared legacy records, sample receipt, second friend/Add friend/Review and private-request review inspected. No unpaid share is presented as available funds. |
| 73 | `spendingOutlook` | Current balance/remaining costs/daily extras are distinguished; calculation remains available and no promise that money will last is introduced. |

### Findings added by visuals

1. **P1 — Hibiscus selected approver contrast.** In `groupMoneyApprovers`, `.gm-contact.selected` becomes dark plum through the broad selected-state theme, while `.gm-person-copy strong` remains plum and small role copy remains dark/muted. Selected names are effectively invisible. Everyday's green and Minna's yellow selection remain readable. Root assigned this shared-theme correction to the system audit; do not add a competing per-page patch here.
2. **P2 — Legacy navigation inside task chrome.** `allowance` and `essentialEdit` show an inner Back/LUMO/help row beneath the new task-sheet Back/help/QR/close row. This consumes space and creates competing navigation. Root assigned the exact legacy-header semantics to the system owner; preserve actual content headings and functional toolbars.
3. **P2 — Change-specific partner instruction.** Enriched `boxProtectionChange` says “Approve protection change,” describes replacing the partner, then says “Enter your partner’s code for this transfer.” Use “for this change” in this context; keep transfer wording for transfer authorisation. This is a copy correction in `money-box-protection-ui.js`, not approval logic.
4. **P2 — Cycle footer lacks normal action spacing.** `budgetCycle` directly emits primary submit, secondary Keep draft and Discard into its form. In Hibiscus the two pill edges touch. Wrap these existing controls in the same `.actions` container used by the review page. No new step or discard semantics in this pass.
5. **P2 — Active hack needs a short identity fact.** The upper compact active control shows only “Savings hack / On / Edit / Pause / Cancel hack.” In the isolated sample, the customer has to open the lower explanation to remember whether it is income, spending, round-up or schedule. Parent accepted a single short fact label in this existing control: e.g. “Income · 10%,” “Spending · 5%,” “Roundups · GH₵1” or “Weekly · GH₵10.” Keep full mechanics, limits, explanations and history below.

### Iteration 2 decisions after seeing all editions

- Keep Fund / Transfer back / Add or manage Savings hack at the top. The user's hierarchy works. Add only the current rule identity, not a larger explanation.
- Keep separate, explicit group mandate and acceptance pages, complete named people and threshold. Do not change the mandate/people order in this pass. The selected contrast and role-aware empty state are concrete corrections that preserve the user's deferred group-flow decision.
- Keep the Budget-benefit task page and approved Pause story. Their longer text/animation serves an explicit first-use or calculation purpose; generic collapse would remove needed context.
- Manual first-Budget setup needs a smaller hierarchy adjustment, not another wizard. Parent should decide whether to compact the chosen period and assistance after the core fixes. Category, total, period-total hint and review must stay together; all tools remain reachable. No scope expansion approved here yet.
- Do not report an absence of automated geometry findings as an absence of UX problems. This visual pass found contrast, spacing, context and recovery issues. No new horizontal overflow was observed in these 375×667 planning views; final viewport/text-size verification belongs to the shared QA pass after implementation.

### Phase 3 ownership proposed to parent

Own application files after explicit gate: `dist/budget-history.js`, `dist/budget-everyday.js`, `dist/money-boxes.js`, `dist/group-money-ui.js`, `dist/budget-period-review.js`, `dist/money-box-protection-ui.js`, `dist/savings-hacks-ui.js`; focused mounted tests for actual recovery/focus/context cases. No independent CSS file expected. System owner handles duplicate task chrome, selected-state contrast and shared group-label/important-note readability. Root owns any manual setup hierarchy decision and peer sync/publishing. Preserve every existing money, mandate, invitation and approval rule.

## Phase 3 implementation checkpoint

Parent explicitly authorised the seven-file package after all domain visual reviews. Implemented truthful suggestion recovery, exact invalid row/date focus, role/mandate/balance-specific proposal empty states, filter-specific list empty copy, selected-box return after an existing edit, comparison-only date label, change-specific partner-code wording, standard cycle action spacing and one short dynamic hack-method fact. New boxes retain their funding banner; partner invitation/change completion still takes precedence. No engine, ledger, mandate order or approval rule changed.

The focused mounted regression suite additionally exposed the native retained-parent distinction: calling `L.go('plan')` from a plan-family sheet intentionally dismisses to its launching page. For a stale suggestion opened from Home, the labelled Back to Budget recovery therefore returned Home. The history helper now uses explicit `L.openTab('plan')` when there is no setup draft; Close still uses normal task dismissal, and an actual saved setup still resumes. Kept the correct explicit-Plan test assertion and fixed the route behavior rather than weakening it.

Tests are serialised by the shared QA owner. The retained planning batch passed nine files / 169 test groups before the explicit-destination correction, with stable source hashes. Focused `tests/planning-finish.test.cjs` covers recovery, real-draft preservation, selected-row errors, role-specific proposal prompts, filter copy, existing/new box destinations, compact active/paused hack identity and comparison/protection context. Its initial whole-draft snapshot was narrowed to exact entered fields because entering the existing setup legitimately adds `savedBudgetMarkUnverified` metadata; financial and cycle snapshots remain exact. Final reruns and visual sign-off are recorded by the parent QA ledger.

Existing tests changed only where behavior intentionally changed: one title expectation in `tests/budget-history.test.cjs`, and one successful existing-box destination expectation in `tests/money-box-protection-ui.test.cjs` (now `goal` with the exact box ID). Application checkpoint: `/tmp/lumo-planning-pre-finish`.

## Final changed-screen and native-history iteration

After the shared source and final theme styles were mirrored, reviewed the changed planning screens again in all three editions. Directly configured and saved an existing box through its real visible controls in each isolated preview: Everyday income 10%, Minna GH₵1 roundups and Hibiscus weekly GH₵10. Each returned directly to the same Laptop box with unchanged GH₵100 saved balance. The current-method fact, status and Edit/Pause/Cancel controls fit the existing compact block; full mechanics and limits remain below. Pausing retains the identity and changes the available action to Resume. All three cycle footers now separate the controls clearly. Hibiscus selected approver names and role captions are white and readable against plum.

A separate **12-case finishing gallery** was added as QA source only: four suggestion-recovery states, four role/acceptance/balance proposal-empty states, active/paused hacks, cycle footer and selected approvers. Every case was visually inspected in Everyday, Minna and Hibiscus. This adds state optics, not extra registered product routes. Each empty prompt matches the action actually permitted; all mandatory mandate wording stays intact. The fixture does not alter the 295-case geometry matrix.

### Native-history defect found and resolved

Clicking the pending-history Back to Budget action in the browser exposed a problem that the initial mounted test did not: the page showed Home while the history entry said Plan. This reproduced with **the real browser History API**, isolated memory-only storage and a single actual app iframe. Before the fix, Hibiscus reported `actualRoute: home`, `historyRoute: plan`, Home headings and no renderer errors; it was not just a stale selected navigation icon or a fake-history artifact.

The task closes by traversing native history. An earlier core popstate handler can restore its Home parent before the task finalises the requested history entry, a situation already documented by the existing Budget-to-Chat handoff. The bounded history helper now closes the current task first and then requests Plan. The task controller's existing closing queue performs that explicit destination after native close. The global task controller, core, authentication and approval logic remain unchanged. A maintainer comment records why the two calls are intentional.

`tests/planning-finish.test.cjs` now has **10 passing checks**, including deferred-history tests from both Home and Plan. The check verifies that Plan waits behind the pending native close, route and history converge on Plan, money and entered drafts stay unchanged, and ordinary Close still returns to its own parent. The affected retained history suite passed **18 checks** after this final behavior change; the earlier retained 169-group planning batch remains recorded. Shared QA pinned final helper SHA-256 `59e12ac77dbf7fd8db5315d3a5cd8a708802f693a4c3946af1f5dbf463ba646c` after a comment-only sync.

Actual browser proof used `planning-native-history.html/js` from QA source, with `window.history instanceof History` true and no history override:

| Edition | Launch parent | Back to Budget result | History entry | Task | Money / errors |
| --- | --- | --- | --- | --- | --- |
| Everyday | Home | Plan, visible Budget body | Plan | Closed | GH₵590 available / GH₵100 savings, unchanged; no errors |
| Everyday | Plan | Plan, visible Budget body | Plan | Closed | Same, unchanged; no errors |
| Minna | Home | Plan, visible Budget body | Plan | Closed | Same, unchanged; no errors |
| Minna | Plan | Plan, visible Budget body | Plan | Closed | Same, unchanged; no errors |
| Hibiscus | Home | Plan, visible Budget body | Plan | Closed | Same, unchanged; no errors |
| Hibiscus | Plan | Plan, visible Budget body | Plan | Closed | Same, unchanged; no errors |

All six proofs also showed Plan selected in the native navigation and no suggestion/setup/cycle draft created. Two additional native Hibiscus checks confirmed that the separate **Close** action still returns to Home when launched from Home, and Plan when launched from Plan, with matching history and unchanged money. QA runtime assets are registered for cleanup and are not product routes or shipment assets.

Planning sign-off: confirmed fixes are functionally tested and optically checked in all three editions. No further planning source changes are proposed. Broader financial, layout and publication gates remain owned by the parent.
