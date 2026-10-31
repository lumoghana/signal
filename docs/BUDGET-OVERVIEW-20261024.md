# Visible student Budget

Restore point: `checkpoint-before-budget-overview-20261024` in both checkouts. The previous hosted Everyday v28 and Minna v10 remain recoverable. Original Campus Pilot and Clarity projects are outside this change.

## Customer experience

The Plan destination displays Total Budget as the main figure and lists every populated category directly. This is the full amount budgeted for the period, including covered costs. Still to cover and Left after Budget are secondary. Payment projections continue to use remaining commitments, not the original total. The review also shows full item totals with any smaller remaining amount explicitly labelled.

Tap a category to edit or delete an item. Edit budget offers item management. Delete entire Budget is in Budget tools and Edit budget's other options. Every delete requires a confirmation in the existing retained-parent sheet. Cancellation and dismissal cannot delete. A confirmation rechecks the current Budget and pending linked transactions. History, account balances and Money Boxes are not deleted or moved. Confirmed deletion clears unfinished Budget proposals and cached editors, with that consequence disclosed before confirming. Old draft actions cannot restore removed costs. An unsubmitted payment using a removed source keeps its entered fields but must be reviewed again.

Build with Lumo is available before the first Budget; Adjust with Lumo is available on returning Budgets. Form and Chat use the same uncommitted draft and existing explicit review/save controller. New or returning students can also start guidance from Chat Actions or by asking to build or edit a Budget.

## Seven categories

| Stable key | Budget line | Examples |
| --- | --- | --- |
| food | Food | Meals, groceries, waakye |
| transport | Transport | Trotro, ride fares |
| data-airtime | Data & airtime | Data bundles, phone credit |
| study-fees | Study & fees | Books, printing, tuition |
| housing-bills | Housing & bills | Hostel, rent, utilities |
| personal-social | Personal & social | Clothes, toiletries, social spending |
| other | Other | Costs outside the other categories |

Students use only the categories they need, with at most one new line per category. This is a shared taxonomy, not seven required amounts or a universal recommendation. Known cost aliases resolve to a category; uncertain Chat inputs ask for one-tap classification. An existing category total is not silently overwritten by an alias: Chat asks whether to replace, combine or retain it. The manual form requires editing the existing line. Monetary validation, two decimal places and the existing per-item limit remain.

Spending-history suggestions aggregate the recorded cost categories before weekly rounding; original transactions remain the evidence. A newly confirmed period uses up to seven canonical lines and archives the previous costs without retargeting old payments.

## Existing saved information

No startup migration rewrites saved costs. Earlier custom names, IDs, covered amounts and payment links remain intact. The overview groups them into the same seven categories. A legacy category may contain several earlier subitems, which remain individually editable/deletable. The payment-source selector retains those original subitems so it can fulfil the correct historical commitment. New Budgets and new periods use the fixed seven-line structure. Ambiguous legacy labels are grouped under Other until explicitly assigned a category.

## Scope and validation

Both editions share the controllers and taxonomy while retaining their own identity, visual adapter, storage key, hosting project and access settings. No live AI, bank integration or new payment rules were introduced. Guidance remains bounded prototype logic. Browser validation uses local sample fixtures, never visitors' records. Keyboard checks approximate a reduced viewport rather than physical iOS/Android hardware. Longer item lists and enlarged text may scroll naturally.

Implementation: `budget-categories.js`, `budget-overview.js/css`, guided Budget controller, shared plan review, spending-history and fresh-period adapters, payment source categorization. Evidence and test results: `docs/qa/budget-overview/`.
