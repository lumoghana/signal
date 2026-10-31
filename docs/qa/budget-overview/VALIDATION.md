# Budget management validation · 24 October 2026

Both editions passed all 48 approved test files. The Minna edition gate also passed all nine identity, storage isolation, route and payment parity checks against Everyday.

Focused Budget checks: 68 guide controller, 13 guide UI, 12 category authority, 12 overview/deletion, 17 cross-surface integration: 122 checks per edition.

Confirmed: original Budget350 with linked spending80 shows original total350, remaining270; linked payments fulfil a cost once. Deleted commitments never move account money, alter savings or delete transactions. Pending linked payments and changed Budget signatures block deletion. Cancellation and Back preserve records. Drafts/cached forms cannot resurrect deleted items. Known aliases, unknown-category clarification, duplicate-category choices, stale guide proposals, history10-category aggregation and fresh-period archival are tested.

Browser QA: Everyday360×640,390×844,320×640 at150% text; Minna360×640,412×915,320×640 at150% text. Seven populated categories have no horizontal overflow in the checked narrow layouts. Main Edit/Chat actions remain visible above the list; all seven rows require natural scrolling at360×640 and enlarged text. The larger412×915 view shows all seven rows and the actions. Money Boxes and optional tools may require scrolling. Two-item Budget fits the main information and actions on the small phone.

Everyday: performed returning Chat edit (Food250→300), review total400 with remaining320 after earlier80 fulfilment, explicit Save, and return to Budget showing400 total/100 left. New-student guidance shows all seven category options; an unknown Church50 cost asks classification without losing its amount. At390×480 available height, Chat composer bottom423 remains inside the viewport and thread scrolls independently.

Minna: verified the same visible totals, fixed-category form, pending deletion error, and whole-Budget deletion returning to zero Budget with savings100 unchanged. Native sheet interactions keep one dialog over the retained Plan context. Automated checks cover focus/back, reduced motion, repeated taps, payment success/pending/failure and stale forms. Physical phone keyboard and screen-reader hardware were not available; reduced viewport and semantic behavior checks are approximations.

The local audit fixture is retained under tests/manual-layout only and excluded from the public dist output. Screenshots and full regression logs are adjacent. Screenshots show only generated sample records. No original customer records were imported.

Intentional updated prior tests: fixed category labels replace arbitrary new names; existing legacy names remain covered. Add-item navigation is now Edit budget→Add a budget item. Storage-sensitive test assertions derive each edition's own key, preserving actual isolation testing.
