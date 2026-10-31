# Independent review before the student ambassador session

28 October 2026 · Lumo Monochrome

The reviewed build is suitable for a guided student usability session after the corrections below. No blocking money-flow or permission defect was found in the reviewed simulated journeys. This is a judgement about this prototype, not a live banking launch or a guarantee that every phone/browser combination has been verified.

## How the review was conducted

Four independent domain reviews covered setup/account access, payments/QR/cards, planning/Chat/Story, and groups/accessibility. Source review and shipped-runtime reproductions were followed by separate browser visual reviews. The review did not treat the previous passing layout counts as proof of usable task sequences.

A fresh, memory-only browser rehearsal walked through Welcome, the sample Pause, empty-field and incorrect-code feedback, identity acknowledgement, leaving and resuming signup, preserved university/email details, demo PIN confirmation, reviewing the privacy notice, account creation, an empty Home, a GH₵500 sample wallet top-up, the first-Budget offer and choosing Do later. The balance remained GH₵500; no Budget or savings movement was imposed.

Payment review independently completed normal-customer Lumo, mobile-money and bank transfers, all six bill types, funded card creation and the funding-to-Budget handoff using deferred native history. QR interruption/dismissal, Pause, pending/failure recovery, receipt handling and card controls were also reviewed. Planning review covered dates, saved-cost meaning, renewal, Money Boxes, Savings Hacks, Chat facts/snapshots/drafts and Story filters. Group review checked roles, invitations, mandates, selected states, focus, custom shares and unfinished work.

Visual review included first and returning states, empty/long content, the bottom of tasks, failure/recovery examples and enlarged text. Panels that intentionally delegated to another route were identified as aliases rather than claimed as independent screen coverage.

## Findings corrected

| Finding | Impact | Correction |
| --- | --- | --- |
| Signup Product updates could be on while Privacy and Notifications showed off. | A saved choice appeared to be ignored. | One canonical marketing choice, safe legacy reconciliation and synchronization after successful explicit signup/toggle actions. Existing explicit opt-outs stay off. Invalid or repeated submissions cannot change consent. |
| Changing between an unfinished split and collection silently replaced the draft. A different source receipt could do the same. | Students could lose entered work while exploring. | A native choice names the replacement and offers Keep. Exact account, draft and source guards reject stale or repeated actions. Browser Back preserves the original work. |
| Reopening the same receipt, reselecting custom mode, or going back to edit expense basics could reset entered shares or titles. | An intentional custom split could become an equal split without a clear request. | Same-source entry resumes the draft. Explicit shares survive repeated mode taps and basic edits; original validation still rejects a total that no longer matches. |
| Member/approver selection re-rendered the page at the top and moved keyboard focus. | Long lists became frustrating and keyboard users lost their place. | Same-route selection retains the selected control and both potential scroll surfaces. Navigation, validation errors and disappearing controls retain their native focus behaviour. |
| Cards, Plan and Story could put QR alone on a second header row at 375×667. | The promised top-corner action and header rhythm were inconsistent. | The customer shortcut is a 44px icon with its complete accessible name. Brand, notifications, customer, Chat and QR fit on one row. Independently rechecked in the browser. |
| Home's recent-spending question promised a pace-based runway answer, while Chat used Budget/allowance dates. | The answer did not fulfil the question's expectation. | Home asks for the supported daily spending guide. A Budget with no allowance date now yields its usable daily guide and explicit limits, not an unrelated allowance-date request. No forecast engine was added. |
| Download your data omitted Money updates and lost expected-money/period context. | The export did not match its stated scope or visible choices. | The already-authenticated export includes explicit notification choices and committed planning metadata. Copy names the included records and excludes unfinished drafts, Chat and group collections. PINs, raw state and full card details remain excluded. |
| A rolling seven-day Story can have eight calendar-day bars; its explanation was hidden. | Correct mathematics could look like a chart defect. | A visible partial-day note sits beside the graph. The window, totals and transaction eligibility are unchanged. |
| The ambassador guide used the old You menu path, and firstGoal mentioned a destination called Savings. | Instructions could send students looking for missing navigation. | Guide paths now match Menu and Help & support. The sample merchant action works without a camera. Money Box instructions use the actual destination name. |
| The unified QR backdrop still announced Close Campus Pay. | Screen-reader naming disagreed with the visible QR experience. | The backdrop and visible close control both use Close QR. |
| Activity and the ambassador entry retained older generic brand tokens; small faces downloaded the large portrait. | Identity was inconsistent and unnecessarily heavy. | Generic full-page branding uses the supplied character. Small placements use existing 192/512 derivatives; the exact original remains unchanged. This reduces requested image bytes, without a measured claim about network load time. |

Selected split modes and collection-list filters also expose their selected state to assistive technology.

## Verification and evidence

- **233 regression checks passed**, including 28 focused checks added for the findings above. Financial/shared-source hashes and edition isolation passed. The optional live peer-checkout comparison was unavailable; the approved local shared baseline was checked.
- The runtime/source fingerprint was captured before and after the final full run and was identical. See `source-before.json`, `source-after.json` and `regression.log`.
- **2,384 responsive layouts across 298 core/state scenarios** passed with zero reported palette, clipping, reachability, collapsed-scroll, guidance or privacy-geometry findings.
- A separate **406-layout sweep at 200% text** passed with zero findings.
- Additional nine-member browser checks covered lower-list selection at 375×667 and 390×844. Mouse and keyboard selection retained the relevant member and did not return to the top. Native Keep returned to the chooser; reopening Split preserved Study group printing and GH₵90.
- Independent browser reviewers reloaded and verified the root-header, Story-note and Money Box instruction corrections. Returning guidance was checked independently of long-value fixtures.

The synthetic DOM suite verifies behaviour and authority; it is not a browser layout engine. Browser layout sweeps verify rendered geometry in the configured Chrome environment, not every phone. The independent manual review covered task meaning, state transitions and visual judgement that those tools do not establish.

## What the ambassador session should make explicit

This is sample money. Bank payments, identity verification, real biometric approval and cross-device account/collection participation are not connected. Support reports and feedback stay on the browser until downloaded. Cross-phone QR scanning can identify a sample recipient, but does not transfer a real balance to another phone. These are prototype boundaries, not newly discovered transaction failures.

Physical iPhone/Android camera behaviour, permission prompts, gallery file selection, VoiceOver/TalkBack and constrained mobile-network performance still require real-device checks. Camera access is stubbed in the isolated review harness. No claim of complete device compatibility or accessibility certification is made.

The remaining student research should explore whether students understand available money versus money left after planned costs, discover Collect and Money Boxes, trust and understand the daily guide, and understand contributor/approver roles. Preferences and comprehension still need observation even when the implementation behaves correctly.

## Implementation scope

The changes are confined to the Monochrome edition's adapters, presentation and regression coverage. Shared financial engines, transaction authorisation, group mandates, Savings Hack consent and posting, QR generation/decoding, saved namespaces and other editions were not changed. Temporary review pages are removed before publication.
