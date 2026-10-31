# Unaided setup and planning review · v20

## v21 introduction clarification

The plan introduction now leads with **What is a plan?**, defines it as costs the student's money needs to cover, and explains two uses: show what remains after commitments and show what a proposed payment changes. The sheet title is **How your plan works**. Creating a plan does not move or lock money. The worked shortfall example remains accurate and isolated, but is collapsed under **See an example** rather than appearing to be a warning about the student's own account. The separate sample Pause and two-step setup are unchanged. Prior v20 source `d8080055572b5588b0807ff2b7890b40283bb1d4`, saved version `appgprj_6ad4c822fe3881919757091e91e2ce9f~appgver_7c85b6e6beb8819196d1411625da22bf`, remains restorable.

The benefit, simple-plan and sheet interaction suites are the relevant follow-up checks. The browser/phone verification limitations below still apply.

Reviewed for a new student using the prototype without an ambassador. This is an expert cognitive walkthrough plus automated interaction testing, not observation of Gen Z participants.

## Findings and implementation

The previous main path asked about expected income, costs and a goal before showing the student's own result. Optional decisions appeared compulsory because they occupied separate steps. My plan also put allowance first. That made setup feel like completing a banking profile before discovering Lumo's purpose.

The new path starts with what the student needs to cover:

1. A short, clearly labelled sample shows a GH₵280 purchase leaving essentials GH₵30 short and a GH₵100 goal uncovered. The full calculation is optional and isolated from account data.
2. **Costs to cover:** choose Food, Transport or Data, or type another cost, then enter the **Total to cover**. Suggestions supply names, never invented amounts. A live sentence shows what remains or what still needs money. Review captures the last entered cost automatically.
3. **Review:** lead with Left after your plan, then account money and commitments. Saving a plan does not move money. Save returns to Home with the real plan reflected there.

Only Costs and Review are core setup steps. Goals, expected income and a plan date remain optional. A date labels the plan period; it does not multiply a cost or create recurring payments. My plan puts Essentials first, then goals and expected money. Its existing management destinations, history and milestones remain available.

Finish later, Close, backdrop dismissal, Back, Help and reload preserve unfinished values. Returning resumes the draft without replaying the example. Existing legacy drafts retain their current step. New draft costs can be edited without duplicate IDs. Saved essential metadata, dates and goal commitments are retained.

Zero-funded students can save actual costs and see the uncovered amount. Expected income never becomes account money. The review uses the shared financial engine and current linked-payment coverage, including a payment that resolves while a draft is open. Unchanged or reduced existing goal allocations do not strand an underfunded plan; new increases are revalidated against available funds on confirmation.

## Interaction comparison

One cost, no optional goal or expected income; from the labelled benefit screen through Save. Field focus and typing are excluded.

| Measure | Before, v19 | After, v20 |
| --- | --- | --- |
| Core forms | Income → costs → goal → review | Costs → review |
| Main button activations | 5: start, skip income, next, skip goal, save | 3: start, review, save |
| Using a cost suggestion | Not available | Adds one activation and supplies the name |
| Own result | Review after the optional forms | Live while entering the first valid cost |

The after count is measured through actual mounted DOM button activations. The before count is a source-based route/action count. Neither is a timed participant test. Rendered scrolling and keyboard obstruction could not be measured.

## Checks completed

- **17 new actual-index plan checks:** the main route, measured activations, live and restored previews, invalid/empty costs, multiple costs, editing, five dismissal/recovery paths, optional additions, zero funds, existing metadata and underfunded commitments, linked-payment success/failure while open, and changed-funds validation. These checks mount the shipped modules and sheet controller in a lightweight DOM harness.
- **6 benefit and 9 period checks:** sample isolation, legacy drafts, access checks, dates and atomic save.
- **71 sheet checks:** dismissal, Back, focus, parent restoration, retained values and protected actions.
- Production and broader journey suites: sign-up, navigation, privacy, Campus Pay, transfers, Chat, authorisation, confirmed/pending/failed outcomes, duplicate submission and consistent financial projections.
- Home money story, illustration context, navigation visibility, native layout contracts, completion, plan-impact and Chat suites pass. Syntax and diff checks pass.

| Shared fixture: GH₵600 available, GH₵350 essentials, GH₵100 goal | Result verified |
| --- | --- |
| Extra GH₵80 | GH₵520 available; GH₵70 left after plan |
| Extra GH₵140 | GH₵460 available; GH₵10 left after plan |
| Extra GH₵280 | GH₵320 available; essentials GH₵30 short; goal GH₵100 uncovered; total plan gap GH₵130 |
| GH₵80 linked to essentials | GH₵520 available; GH₵270 remaining essentials; GH₵100 goal; GH₵150 left after plan |

No Pause thresholds, payment authentication requirements or transaction success rules changed. All money, verification and payments remain simulated. Identity assets, Home mirror artwork, navigation and existing local saved information are preserved.

## Remaining verification

The supported browser controller was unavailable. Automated DOM and synthetic viewport contracts do not establish visual phone fit, physical keyboard behaviour or ease of use by students. There is no observed completion rate or supported claim of superiority over another product. Longer cost lists and enlarged text can scroll naturally.

Give new students the prototype without explanation and ask:

1. “Set it up for GH₵200 of food and GH₵150 of transport.” Observe where they hesitate; do not coach.
2. “What does Left after your plan mean? Has saving paid anyone?” Listen for account money versus commitments.
3. “Change food to GH₵180.” Check whether they find editing without adding a duplicate.
4. “Leave halfway and come back.” Check whether they recognise how to resume.
5. “Can you spend another GH₵280?” Ask what changes, including essentials and the goal, before they continue to authentication.

Record unassisted completion, wrong turns, requests for help, time to first useful result and scrolling/keyboard obstruction. Test on 360 × 640, 390 × 844 and 412 × 915 phones, with normal/enlarged text and reduced motion. Use those observations to decide the next refinement.

## Recovery

Prior published v19: commit `2acc6c883cc7dcc98042569cdd495cfd34e6fd7d`; saved Site version `appgprj_6ad4c822fe3881919757091e91e2ce9f~appgver_9c34d3c1d8008191b03a11f89cd8e8be`. Local checkpoint `checkpoint-clarity-before-simple-plan-20261019`. The current demo-storage key remains `lumo-clarity-edition-v1`; neither original prototype is edited.
