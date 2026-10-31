# Primary journeys: two-pass product audit

Reviewed 27 October 2026. This is a read-only design audit before implementation, not a claim of student usability testing or awards. Phase 2 includes direct browser inspection in a dedicated gallery tab. No application files were changed by this audit.

## Coverage and method

The shipped Everyday script order exposes 188 routes. This domain reviewed 28 actual route IDs, including the primary roots, Chat and its task sheets, Money Story, notifications, milestones and adjacent activity/category screens. Final mounted output was inspected using the existing isolated DOM harness, rather than relying on older view definitions that later scripts overwrite. Valid branch and recovery logic were traced in source. Context-dependent routes without a selected answer/payment were also mounted to inspect their fallback states.

Most relevant controllers are byte-identical and loaded in Everyday, Minna and Hibiscus: app.js, chat-coach.js, chat-banking.js, hibiscus-chat.js, chat-context-starters.js, daily-insights.js, money-story-analytics.js, page-guidance.js and contextual-chat.js. Hibiscus navigation intentionally differs from the Everyday/Minna file in its header selector and Home wrapper. Do not overwrite this edition adapter while synchronizing shared fixes.

First-use lens: clear purpose, next step, understandable money meaning, optional learning and recovery. Returning lens: direct controls, retained drafts/reading position, trustworthy snapshots and periods, quiet repeated guidance, and access to an earlier result.

Mounted audit snapshots and reproduced issues are retained at /tmp/lumo-primary-audit-runtime.json and /tmp/lumo-primary-audit-proofs.json. The relevant factual results are recorded below so the review does not depend on those temporary files.

## Route ledger

| Route | First-time review | Returning-user review | Result and evidence |
| --- | --- | --- | --- |
| home | The account amount, Add money, Request money and Transfers are clear. No extra Story or Cards card should be reintroduced. | Budget details are direct; pending and Budget-gap controls remain specific. Eye geometry must stay fixed. | Preserve this hierarchy. Everyday adapter: everyday-home.js:16–34; shared time basis: experience-clarity.js:14–32. Root to verify the two other visual adapters. |
| pay | Three payment kinds and labelled destination rows explain the available jobs. | Recent/favourites are useful repeat shortcuts; one new draft still goes through review. | Preserve function. Visible density needs parent screenshot review; DOM button counts include inactive tab panels, so counts alone are not evidence of clutter. focus.js:57–61; campus-everyday.js:43–55. |
| plan | Budget and Money Boxes have distinct account meanings. | The main amount and item controls are already concise; tools are lower disclosures. | Preserve Plan navigation label and direct Home entry. Detailed Budget audit belongs to planning reviewer. plan-hub.js:8–30; experience-clarity.js:50–75. |
| more | The You entry exposes Profile, Account, Security, Privacy, Notifications and Help with sublabels. | Stable account/settings grid is easy to learn. Customer name/campus must never be treated as disposable introductory text. | Preserve personal details and existing art. focus.js:98–100; personal-qr.js:110–112. |
| profile | Name, handle, masked phone, campus and email have clear roles. Edit is explicit. | QR and change-phone controls stay reachable. | No priority defect found. Keep preview persistence disclosure. account.js:68; detailed account review is cross-owned. |
| profileEdit | Field labels and Save/Discard make the task explicit. | Native discard protection exists; the lower guide should not reset entered fields. | Preserve behavior. native-decisions.js:56–57; page-guidance.js exact allowlist. |
| chat | One relevant insight, three starters and a composer give a clear entry. | Main conversation retains snapshots and an unsent composer draft. | Temporal copy defect F2 and cross-root gesture inconsistency F5. The apparent second starter tray is hidden by CSS and is not a defect. hibiscus-chat.js:23–42; feature-flows.css:324. |
| chatBankingActions | Labelled rows cover payments, funding, shared costs, Budget, boxes and Story. | Back to conversation returns to the retained parent. | Functionally clear, but a long menu should remain secondary to the composer. chat-banking.js:44–45; later shared/planning decorators add their existing actions. |
| hibiscusChatHistory | Empty history explains that no questions have been asked. | Existing questions are a non-interactive summary list; saved affordability can appear current and cannot be opened from the list. | Priority F1. hibiscus-chat.js:75–80. |
| chatCalculation | Selected answer, saved calculation and snapshot warning are explicit. | A calculation opens without updating or rewriting the answer. | Preserve. Invalid index recovers to the conversation. chat-coach.js:274–289. |
| chatBankingChoice | The missing recipient/source/box is explicit and choices are labelled. | One detail completes a proposed draft, not a payment. | Preserve controls. A missing reply has a recoverable return message. chat-everyday.js:200–212. |
| chatBankingReplace | Existing draft identity and amount are shown before replacement. | Keep previous draft prevents accidental loss. | Recovery edge F8: the view itself still says an unfinished draft exists when the selected draft or proposal has disappeared. chat-everyday.js:196–199. |
| chatCalendarPayments | The selected answer period and completed payment rows are clear. | Links lead to the original receipt. | Empty state is explicit. Keep the selected answer context and unchanged financial filtering. chat-everyday.js:214–216. |
| chatExpectedDate | It is plainly an expected date, not money received. | Cancel and Save keep a focused one-field task. | Preserve its money-meaning instruction even after learning. chat-planning.js:195. |
| moneyStoryHome | Period, total, graph and breakdown provide a credible financial picture. | Filters, receipt links and asking about the exact current scope are useful. | Canonical guide gap F6. Preserve the existing maximum of two insights and date/fee meaning. money-story-analytics.js:37–58,84–90; hibiscus-navigation.js:22–25. |
| homeMoneyStory | Same financial dashboard inside a task, with a way back to the originating context. | It should not teach the same Story definition again after the primary tab was learned. | F6; do not replace the contextual task with an unconditional root navigation. |
| story | Legacy alias renders the same current dashboard. | Saved links remain useful. | Include in canonical Story learning state; preserve compatibility. money-story-analytics.js:92. |
| dailyMoneyStory | Calendar period, total and breakdown are distinct from rolling Story periods. | A saved weekly review keeps its frozen dates. | Preserve exact range and empty-state facts. Preview wording issue F7. daily-insights.js:180–186; money-story-analytics.js:94–103. |
| notifications | Pending payments and Budget warnings have clear top entries. | Updates remain available and can be marked read. | Private preview navigation F4; redundant Mark all read can be suppressed when nothing is unread. daily-insights.js:155–158. |
| notificationPrefs | Money/Plan/Chat/Marketing categories are labelled. | Timing is a separate linked task, but its scope should be obvious. | Keep delivery limitations honest. Refresh old Essentials wording in this UI only if the account reviewer agrees. account.js:76; daily-insights.js:160–161. |
| dailyUpdatePrefs | Weekly reviews, quiet hours and private previews are discoverable. | Disabled options still expose and validate irrelevant time fields. | Priority F3. daily-insights.js:162–178. |
| dailyAccountNotice | Valid notice has a title/body and Done. | Saved important notices remain accessible. | Recovery edge F8: invalid index currently produces a generic Account notice with no body rather than explaining that it is unavailable. daily-insights.js:145–146. |
| missions | A compact setup-progress view can encourage first actions. | Completed labels should reflect real actions and not expected money alone. | F9: Budget-cost milestone can be Done without any Budget cost. app.js:63. |
| activity | Filters, search, time scope and statuses form a familiar record list. | Spending drill-down preserves its scope, while all-activity includes internal transfers as such. | Preserve this distinction and exact receipt links. compact.js:99–128. Detailed record review overlaps payments auditor. |
| categoryEdit | Amount/recipient and category choices make the correction specific. | One-payment vs future-memory scope is explicit. | Preserve read-only money balance meaning and original category authority. category-intelligence.js:101–105. |
| categorySort | Optional three-payment queue is approachable. | Skip and Close avoid forced financial homework. | Recovery edge F8: an initially empty/stale queue says choices were saved even if no choice was made. category-intelligence.js:129–136. |
| categoryMatch | Matching payment rows make a Chat correction safer than guessing. | A changed/refunded record may remove all eligible options. | Recovery edge F8: empty list currently leaves Which payment? and Not now without explaining the missing choices. category-intelligence.js:288–290. |
| storyTx | Historical category editor still has a labelled select and receipt link when its ID is valid. | Compatibility links should not be silently removed. | Legacy alias, lower priority. Missing ID falls back to the full Story; modern entry points use categoryEdit. app.js:57; category-intelligence.js:137–139. |

## Findings and proposed design changes

### F1 — History must open a saved answer and communicate that it is saved

Priority: high. A returning customer expects the history icon to help find an earlier answer. The current list prints only each question and headline, with no row action. It also omits the stale-projection status that the main Chat correctly displays.

Reproduced using the production DOM harness: ask Can I spend GH₵80?, lower available money, render Chat, then open history. Main Chat contains Earlier projection. History instead contains Your budget stays covered. GH₵720.00 spare., no earlier/saved warning and no row button. No harness errors occurred.

Preferred direction: make history a question index. Each accessible row opens the corresponding retained conversation turn. Give every financial answer preview a clear Saved answer/snapshot status, or omit the answer headline from the index altogether. The original full answer, calculation, warnings and Check again remain authoritative. Closing history must preserve composer input and retained parent nodes, including deferred browser history. Do not recompute old answers silently or replace the entire conversation on a history tap.

Files: hibiscus-chat.js:75–80; chat-coach.js:235–239,294; feature-flows.css:325–329. A shared read-only snapshot-status helper may be exposed if necessary instead of copying the financial comparison logic.

### F2 — Use last 7 days for rolling-period Chat copy

Priority: high because wording changes the interpretation of a money amount. hibiscus-chat.js:38–39 calls spendingSummary with days:7 but says paid out this week. money-story-analytics.js:60–63 uses the same this-week wording for transfers inside a Last 7 days summary.

Mounted reproduction: a GH₵50 payment six days earlier gives rolling7=50 and calendar thisWeek=0, while the Chat insight still says GH₵50.00 paid out this week.

Preferred direction: change these fixed phrases to in the last 7 days. Preserve all arithmetic, cutoff windows, calendar summaries and ledgers. Do not change the calculation to a calendar week to fit the existing phrase.

### F3 — Optional timing settings must be conditional

Priority: medium/high. dailyUpdatePrefs always shows review day/time and quiet-hour times, then validates them regardless of whether the corresponding option is enabled.

Mounted reproduction: weekly=false and quiet=false; clear the now-irrelevant times; Save remains on the page with Choose a valid review time. No financial state changes are involved.

Preferred direction: place weekly day/time in an enabled-only group and quiet-hour times in a quiet-enabled group. Retain the last valid values while off, and validate only the enabled option. Turning an option off should be a complete, successful action. Keep scheduler eligibility and no-backfill rules unchanged. Also retain the Ghana-time and in-app-preview explanation where relevant.

Files: daily-insights.js:162–178 and its stylesheet section.

### F4 — Private previews need neutral event identities

Priority: medium. With privateUpdates enabled, receipt, status and Budget events all become the exact same title/body. Icons alone are not enough for first-time recognition or nonvisual navigation.

Mounted reproduction: three different event kinds render three identical A money update is ready. titles.

Preferred direction: hide amounts, counterparties and detailed status while retaining neutral labels such as Payment update, Budget update and Weekly review. State the preference scope as hiding amounts and names, not every possible account notice. Important notices remain available. Mark all read should be offered only when at least one relevant item is unread.

Files: daily-insights.js:155–164. Do not change notification generation, read/quiet semantics or claim live push delivery.

### F5 — Chat gesture support should match the primary navigation

Priority: medium. The visible chat icon works on all primary roots, but swipe support still recognises only home/pay/plan/more/chat. Cards and Money Story are now first-class tabs.

Preferred direction: extend the existing root allowlist to cardsHome and moneyStoryHome, using the same guarded gesture controller and last-tab return. Keep the browser edge, form/selection, nested-task, keyboard and accidental-click protections. Do not add swipe navigation inside payment or approval tasks.

Files: chat-banking.js:73–119; hibiscus-navigation.js:9–11,71–93. The latter has an intentional Hibiscus-specific adapter, so a shared gesture fix should not overwrite that entire file.

### F6 — Learning state should follow a conceptual page across exact aliases

Priority: medium. page-guidance.js gives Cards and Story aliases the same definition but records seen by raw route. This repeats the same first-use explanation through another entry point.

Mounted reproduction: learn moneyStoryHome, open Chat actions, then its homeMoneyStory task. Both disclosures are expanded on their respective first raw route, and state contains two separate seen flags.

Preferred direction: canonical guidance keys for moneyStoryHome/homeMoneyStory/story, and cardsHome/virtualCards, within the current profile namespace. Preserve existing route-specific DOM attributes and each view's return context. Migrate/read existing alias seen flags so previously learned explanations do not reopen. Keep distinct guidance for genuinely different tasks, and do not share state across editions or profiles.

Files: page-guidance.js:36–37,49–74,98–114.

### F7 — Name the weekly preview's actual period

Priority: medium/low. notificationPrefs offers Preview my weekly story, which opens period:thisWeek, while weekly-review setup explains that scheduled stories cover seven complete days. A current partial calendar week and a completed review range are different views.

Preferred direction: either label the current action Preview this week's spending, or pass the exact scheduled preview range. Prefer the small truthful wording change unless product intentionally needs a scheduling simulator. Keep the displayed dates, calendar-window definitions and stored reviews unchanged.

Files: daily-insights.js:161,164,180–184.

### F8 — Make stale/empty recovery views truthful and actionable

Priority: medium. The following are source-confirmed edge states, not new normal flows:

- chatBankingReplace without a current unfinished draft still says one exists and offers Keep my previous draft.
- dailyAccountNotice with an unavailable index shows a generic saved-notice message and no actual body.
- categoryMatch with no eligible IDs leaves an unexplained empty choice list.
- categorySort with an empty/stale queue celebrates choices saved even if nothing was changed.

Preferred direction: small route-local guards with plain unavailable/nothing-to-sort messages and an explicit return to the originating job. Keep all valid-state actions and controllers unchanged. These views should never fabricate a saved draft, notice or completed action merely to fill the screen.

### F9 — Setup progress should reflect the action named

Priority: medium/low, but trust matters in a finished product. app.js:63 marks Add an everyday budget cost complete when allowance.amount>0, even if no Budget cost exists.

Mounted reproduction: planSaved=false, essentials=[], allowance.amount=500, no transactions or boxes; hasMeaningfulPlan=false, yet this milestone is Done and progress is 2 of 5.

Preferred direction: use an actual saved valid Budget item for the Budget-cost milestone. Keep expected money as expected money, and do not introduce a new financial mutation or inferred account funding. If this screen is intended as lifetime achievements rather than setup status, that wider semantic decision needs an explicit product rule instead of incidental current-field conditions.

## Second design iteration: challenge and decisions

| Initial idea | Challenge | Decision |
| --- | --- | --- |
| Redesign the five-tab navigation | The user has explicitly shaped Home, Plan and header utilities; replacing them would create relearning without solving the proven defects. | Keep navigation structure and improve consistency of its existing behaviors. |
| Remove all repetitive helper text | Amount meaning, current-period scope, pending status, approval and consent remain essential. | Keep the exact-copy guidance approach; repair alias learning only. |
| Open history by rebuilding Chat | This can lose unsent input, reading position or a contextual payment return. | Use retained-parent navigation and a targeted turn jump, with deferred-history tests. |
| Recompute the historical answer in place | A historical answer must stay an honest snapshot. | Preserve saved text; clearly mark it and offer explicit Check again. |
| Change rolling maths to calendar week | That would break the agreed dashboard/window contract and existing calculations. | Correct only the misleading fixed phrases. |
| Leave all private titles generic | Maximum privacy is simple, but makes the list hard to navigate. | Retain neutral event identity while excluding amounts, counterparties and revealing status. |
| Hide all read notifications | Important history and account notices should not disappear. | Keep records; remove only an irrelevant bulk-read action when everything is already read. |
| Share learning state globally across editions | Each edition deliberately owns separate profile data. | Share only exact route aliases inside the current profile state. |
| Add swipe support to every screen | Form entry, approval and native browser gestures must remain predictable. | Extend only to the two missing primary roots and preserve existing guards. |
| Flag a duplicated prompt tray on empty Chat | The DOM contains two prompt groups, but CSS explicitly hides the legacy tray in the feed. | Reject this as a false positive. Parent can separately assess semantic duplication of an insight and its first starter in real screenshots. |

## Recommended implementation order

1. Correct period wording and historical-answer safety/discovery.
2. Repair optional timing settings and exact-alias learning.
3. Improve private preview identities, recovery fallbacks and milestone truth.
4. Extend guarded Chat gestures to the two missing roots.
5. Apply visual refinements only where parent browser inspection shows a concrete hierarchy, contrast, spacing or interaction problem. Preserve Everyday's green/illustrations, Minna's typography and art, Hibiscus's plum identity, the fixed QR and current financial safeguards.

The review does not justify adding new Home cards, changing account structure, weakening payment review, inventing real bank automation, or replacing the paused group-collection product decisions.

## Phase 2: direct visual review and third design challenge

The dedicated browser review used tab 11 and the local product gallery, with native 375 × 667 app frames presented four across. All app profiles were isolated memory-only samples; no customer session or live money was used. Every primary-domain screen was inspected in both First visit and Returning visit modes, in every edition. Only viewport screenshots were used. The fixture was refreshed after the gallery race fix and again after valid Chat choice/replacement/payment-list contexts were added.

The final canonical primary catalogue contains 30 routes. All 180 canonical edition/experience combinations were viewed. Before the catalogue was corrected, three additional Everyday routes (authorize, everydayPayments, everydayRepeatChoice) were also reviewed in both experiences, for six additional views. These six belong to the payments catalogue and are not counted as extra canonical primary routes.

### Visual coverage ledger

| Canonical routes | Everyday First / Returning | Minna First / Returning | Hibiscus First / Returning |
| --- | --- | --- | --- |
| actionConfirm, activity, balances, categoryEdit | Viewed / Viewed | Viewed / Viewed | Viewed / Viewed |
| categoryMatch, categorySort, chat, chatBankingActions | Viewed / Viewed | Viewed / Viewed | Viewed / Viewed |
| chatBankingChoice, chatBankingReplace, chatCalculation, chatCalendarPayments | Viewed / Viewed | Viewed / Viewed | Viewed / Viewed |
| chatExpectedDate, dailyAccountNotice, dailyMoneyStory, dailyUpdatePrefs | Viewed / Viewed | Viewed / Viewed | Viewed / Viewed |
| hibiscusChatHistory, home, homeMoneyStory, missions | Viewed / Viewed | Viewed / Viewed | Viewed / Viewed |
| moneyStoryHome, more, notifications, pay | Viewed / Viewed | Viewed / Viewed | Viewed / Viewed |
| resetConfirm, sampleConfirm, story, storyTx | Viewed / Viewed | Viewed / Viewed | Viewed / Viewed |
| testing, welcome | Viewed / Viewed | Viewed / Viewed | Viewed / Viewed |

Additional critical-content inspection, beyond the top-of-page sweep:

| Content | Everyday | Minna | Hibiscus |
| --- | --- | --- | --- |
| Balance detail list, actions and account explanation | Middle and bottom, details open | Middle and bottom, details open | Middle and bottom, details open |
| Chat actions long menu and return control | Bottom | Bottom | Bottom |
| Daily Story graph, payment breakdown, methodology and final actions | Middle and bottom, details open | Middle and bottom, native and open details | Middle and bottom, native and open details |
| Update preferences, quiet-hour inputs, privacy choice and Save | Middle and bottom | Middle and bottom | Middle and bottom |
| Root Story, exact graph values, recent payments, Ask and View payments | Middle and bottom, details open | Middle and bottom, details open | Middle and bottom; graph values open |
| You grid, Sign out, Pay secondary routes and bottom navigation clearance | Middle and bottom | Middle and bottom | Middle and bottom |
| Valid recipient-choice, old/new draft and original-payment-list task contexts | Refreshed and viewed | Refreshed and viewed | Refreshed and viewed |

Minna Chat was also exercised through its actual visible starter: What can I spend a day? → saved daily guide → Conversation history. The resulting history shows the question and the GH₵16.66 headline as static text. Its only action is Back to conversation. This directly confirms F1's discoverability problem, beyond a source-only assertion. The older affordability snapshot after a balance change remains covered by the isolated source harness reproduction, not represented as a browser-tested live account action.

### What the visual pass keeps

- Home has an effective small set of jobs: account position, direct Budget detail, Add money, Money Boxes, Request money and Transfers. The current composition, in-card eye and illustration are kept. No Story or Cards Home card is warranted.
- Everyday's green accent and art, Minna's art and sharper monochrome presentation, and Hibiscus's plum account card and existing single Home illustration are retained. The user's Hibiscus illustration message was a missing-art complaint; it does not authorize removing its present illustration.
- The fixed QR and conventional Chat controls are recognizable in all three editions. Plan remains the bottom-navigation label.
- The first-use About activity and What counts? disclosures visibly open, while recurring views collapse those explanations. This mechanism works; F6 repairs exact-alias memory rather than replacing it.
- Graph values and methodology are dense when explicitly opened, but readable, aligned and scrollable. They give exact money scope and should not be removed merely to shorten a screen. Bottom Story actions and the final settings controls remain reachable above or through the intended scroll area.
- The empty Chat feed does not expose the legacy extra prompt tray. There is one visible starter group, not two.

### Visual findings and refined decisions

F2, F3, F8 and F9 are visible in the prepared screen states and remain justified. F1 was confirmed with an actual saved answer. F4, F5 and F6 require the explicit source/harness scenarios already documented, so the top screenshots alone are not presented as proof of those behaviors. No additional arbitrary spacing or card redesign is proposed.

**SYS-nav, shared system ownership:** storyTx shows both native sheet chrome and an inner Back / LUMO / help row. The duplication appears in all editions and consumes space before the task title. The system reviewer owns a central fix for exact legacy navigation inside active sheets. Do not hide arbitrary h1s, toolbars or task controls with a page-specific rule. The contextual native sheet title and task body heading serve separate accessibility roles.

**F10, clarify the two draft alternatives before replacement:** the populated chatBankingReplace sheet identifies the existing Akua draft for GH₵80, then offers Start this new draft without identifying the new GH₵30 proposal inside the modal. A sighted person can sometimes read the new proposal on the dimmed conversation behind it; the active dialog itself needs to be sufficient. Preferred bounded refinement: retain the existing-draft summary and add a concise New draft summary with proposed recipient/box, amount and existing source label where supplied. Keep the existing review and approval process, and do not recreate a full payment review inside this choice. This is display-only, using the already resolved proposal, not a new financial decision. File: chat-everyday.js:196–199.

The third challenge rejects further speculative redesign: shrinking or removing requested illustrations would reverse a user decision; replacing semantic financial disclosures with tiny icons would make money harder to understand; adding more explanatory copy to Chat would crowd a currently clear composer; adding a full comparison matrix to draft replacement would duplicate the later review. The final proposal is the ten bounded findings plus the shared SYS-nav correction, with the present visual identity and primary hierarchy preserved.

### Proposed implementation ownership

Shared primary-domain edits can be authored in Everyday, then synchronized file-for-file to the other editions only where those files are identical. Proposed owned files: dist/hibiscus-chat.js, dist/chat-coach.js (only if a targeted retained-turn jump needs a hook), dist/chat-banking.js, dist/daily-insights.js, dist/money-story-analytics.js, dist/page-guidance.js, dist/chat-everyday.js, dist/category-intelligence.js and dist/app.js. A small history-row style may use the existing Chat stylesheet if the system owner agrees on the selector boundary.

No change is proposed to edition navigation adapters, financial computations, payment authorisation, ledger/account storage, group mandate policy or the paused group product design. Browser tests should prove the saved-turn jump preserves the composer and retained conversation, learning is remembered across exact aliases inside one profile, disabled timing choices save, and all new recovery messages return to the appropriate job.

## Phase 3: implementation and validation checkpoint

The ten bounded primary findings are implemented in Everyday only, ready for the root's controlled synchronization. The bankAdd GIP disclosure also uses the shared learn-once mechanism: its existing six steps open on first visit, collapse on return and can be reopened. The sample-account warning, actual receiving details, copy buttons, sample receipt form and incoming-activity control stay outside that optional guide.

History uses the main Chat snapshot-status function and shows question links rather than old monetary headlines. Choosing one closes the native task and focuses the retained original turn; it does not append/recompute an answer or replace the composer. Both ordinary and deferred browser-history cases pass. The two newly supported swipe roots protect their buttons, links, forms, disclosures and header controls while retaining deliberate background navigation.

The implementation changes nine shared controllers: hibiscus-chat.js, chat-coach.js, chat-banking.js, daily-insights.js, chat-everyday.js, money-story-analytics.js, page-guidance.js, category-intelligence.js and the single milestone predicate in app.js. No stylesheet, edition adapter or financial computation was edited by this domain. The baseline source checkpoint is /tmp/lumo-primary-phase3-before.

Inventory ran the new tests/primary-finish.test.cjs against the real shipped script order: **18 of 18 behavior groups passed**. The first run identified only a test selector that assumed a literal virtualCardCreate action; it was corrected to the actual visible Create a virtual card control. Seven retained suites passed 149 groups: daily-insights, chat-everyday, page-guidance, page-guidance-safety, chat-swipe-refinement, category-refinement and money-story-analytics.

The eighth retained suite exposed an older selector in category-intelligence.test.cjs that expected the retired .category-shelf. A separate queued before/current probe restored all nine primary controllers from the pre-change source checkpoint, replayed the actual payment → skip → Story path, and proved the same result before and after: the current Money Story dashboard has one eligible payment and its Help Lumo recognise it action opens the existing sorter; sorting the original payment changes only its category and keeps funds unchanged. The root authorized replacing that retired entry selector with the shipped insight action while retaining every original category, amount, payment-count and funds assertion. The only other existing test edit updates the old generic private-title expectation to Incoming payment update; its privacy checks remain intact, and the new suite tests all five neutral event kinds and exclusion of amounts, names and detailed status.

Validation evidence is recorded under docs/review-2026-10-27/test-runs with prefixes 2026-10-27T01-15-21-504Z-primary-retained, 2026-10-27T01-18-18-250Z-primary-finish-cards and 2026-10-27T01-18-37-915Z-primary-category-diagnosis. The revised retained category suite subsequently passed all 11 checks. No application correction was needed for either test-selector issue.

## Final integrated visual and interaction pass

After integration, the changed primary screens were inspected again in Everyday, Minna and Hibiscus in the dedicated browser gallery. No further primary source changes were made during this pass.

| Changed behavior | Everyday | Minna | Hibiscus |
| --- | --- | --- | --- |
| Empty category picker/sorter recovery, without fabricated success | Visually clear | Visually clear | Visually clear |
| Rolling-seven-day Chat amount label | Correct and readable | Correct and readable | Correct and readable |
| Existing GH₵80 draft versus new GH₵30 Akua/Food proposal | Both identities, amounts and source visible inside the dialog | Same | Same |
| Missing account notice recovery | Clear View updates action | Same | Same |
| Weekly controls expand when enabled; both timing groups hide when disabled | Actual UI verified | Actual UI verified | Actual UI verified |
| Saving disabled timing and private previews; truthful calendar-week preview label | Actual UI verified | Actual UI verified | Actual UI verified |
| Private incoming update label without original amount/counterparty | Actual UI and screenshot verified | Same | Same |
| Actual two-question history, selecting the earlier affordability answer | Turn 0 focused, two turns retained, unsent text preserved | Same | Same |
| Story root first guide → Got it → contextual Story task | Root open, task alias closed | Same | Same |
| Cards first guide → Got it → Chat → Back to Cards | First open, return closed, correct root restored | Same | Same |
| Milestones and Story presentation with current theme/art | Preserved | Preserved | Preserved |

The history check used real visible controls in each isolated app: ask Can I spend GH₵80?, ask What did I spend today?, type an unsent question, open history and choose the original affordability question. DOM observation confirmed the selected original turn received focus and the original two turns remained; the composer still held Keep this unsent question. History presents readable question rows and explicit saved-answer identities, with no old money headline competing with current figures.

The payments reviewer separately confirmed bankAdd's integrated GIP guide in all three editions: first visit expanded, returning visit collapsed and reopenable, with the warning, receiving account/copy controls and incoming activity retained. Those results match the primary regression test.

Browser verification covered root buttons and the exact Chat return destinations. Touch/pointer swipe ownership, guarded controls and cancellation were verified by the queued native-event DOM suites, including both new roots. This browser-control surface does not expose physical touch swipes, so these are not claimed as physical-phone gesture tests. The final pass found no additional primary visual defect requiring an application change.

The final inventory also enriched two deep-review-only contexts through existing public APIs; the standard matrix cases and application source stayed unchanged. Six further populated-view checks passed: categoryMatch in all editions shows two Akua’s Kitchen GH₵80 payments on distinct dates with a choose-one instruction and Not now, and dailyAccountNotice in all editions shows the actual saved title/body, saved-notice explanation and Done. These valid samples render correctly alongside the already verified missing-context recoveries. No further fixture or application correction was needed.
