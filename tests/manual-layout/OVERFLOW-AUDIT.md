# Lumo browser overflow audit

Run this utility from the Everyday checkout. It prepares a local QA page from
these retained source files and, when present, mirrors the independent Minna and
Hibiscus source modules and their exact fonts into temporary preview folders.
It does not copy saved browser records or modify either peer checkout.

```sh
node tests/manual-layout/prepare-overflow-audit.cjs --prepare
```

Optional peer locations:

```sh
node tests/manual-layout/prepare-overflow-audit.cjs --minna /workspace/sites/lumo-minna-edition --hibiscus /workspace/sites/lumo-hibiscus-edition
```

Follow the Sites managed preview instructions. Use the exact URL returned by
`sites-preview start`, then open `/__overflow-audit.html` on that origin. The
edition picker supports the prepared peer builds. Each iframe replaces local
and session storage with a new memory store before loading `core.js`, uses
synchronous sample browser history, and stubs camera capture. Background tab
visibility is controlled so the shown/hidden money fixtures remain explicit.
No customer profile is read, changed, or sent.

The fixture picker inventories the shipped view registry. It adds populated
named collection, approver/contributor invitation, expense split, funded card,
long figure/name, empty state, and expanded Budget/Chat tool examples. A route
alias follows its actual native destination and is recorded in the report.
It does not force an older template into an unrelated task shell.

Use **Run all layouts** for the complete inventory. **Run priority layouts**
checks the central journeys. **Run targeted layouts** is a short Home, Budget,
Chat, and invitation pass. **Run group layouts** checks every group variant at
all eight sizes after a group-specific layout change. **Run privacy layouts**
checks every Home variant at ten settings: the eight standard settings plus
320 × 568 and 390 × 844 at 200 percent text. It includes a large balance with a
small amount left after the Budget. Both long-value Home fixtures have explicit
shown/hidden geometry comparisons in the final report.

**Run savings layouts** checks the 34 Money Box setup, detail, list, partner
invitation and Plan examples at all eight settings (272 layouts per edition).
It covers manual saving and all four automatic choices; creation and edits;
existing paused and cancelled instructions; expanded limits; invalid amount and missing
consent; an initially protected box; long names; active history; a reached
target; and a Budget shortfall that skips a saving. Plan cases include ordinary,
large-figure, expanded, seven-category and empty states.

Check fixture setup before preparing the browser harness:

```sh
node tests/manual-layout/check-savings-fixtures.cjs
```

This loads the actual app modules in the existing DOM helper, checks all 34
setup/renderer results and asserts sample rule, money, consent and history
facts. It does not substitute for browser geometry. For source integration it
appends the new Savings hack modules if the index has not included them yet;
both module files must exist.

**Run guidance layouts** checks 30 first/returning examples across all eight
settings (240 layouts per edition). The 15 pairs cover Money Boxes and setup,
account balances, Budget editing, adding money, transfers, requests,
the actual Cards and Money Story menu routes, profile/security, and payment
review/PIN/Budget amount meaning.
Each returning fixture uses actual route navigation away and back, rather than
injecting a dismissal flag. Plan and payment confirmation deliberately have no
generic guide. The final `guidanceComparisons` retain expanded/collapsed state
and prove task copy, controls and sample balances are unchanged between visits.
These added variants are excluded from the separate 34-case Savings sweep.

```sh
node tests/manual-layout/check-guidance-fixtures.cjs
```

This verifies all 30 setups, first/returning state, unchanged task content and
actions, and payment recipient/amount/fees/PIN plus whole-period Budget amount
instructions outside any guide. It uses the actual shipped page-guidance module
(or appends it for pre-index source integration). Browser geometry remains a
separate check.

The full matrix is:

- 320 × 568, 375 × 667, and 390 × 844 phone layouts.
- 390 × 480 keyboard space and 568 × 320 landscape.
- 320 × 568 with actual computed type enlarged to 150 percent.
- 768 × 1024 tablet and 1100 × 900 desktop shell.

**Run 200% text** is a separate sweep of every standard and long-value fixture
at 320 × 568 and 390 × 844 with computed text enlarged to 200 percent. The
Viewport picker also exposes a single 320 × 568 200 percent check. This models
text enlargement, not browser page zoom, and leaves the original eight-setting
matrix unchanged.

Type scaling snapshots all base computed font sizes before applying explicit
scaled sizes. It restores those inline overrides before the next measurement,
so inherited font sizes are not multiplied twice. Animations, transitions and
initial sheet transforms are frozen for stable geometry. This page checks
layout; it does not test animation timing or establish real payment, camera,
authentication, mandate enforcement, or backend correctness.

The report checks:

- Content escaping the phone horizontally.
- Leaf text widths and actual text Range fragments clipped by a hidden
  ancestor, including inline amounts whose `clientWidth` is zero.
- Controls clipped by a non-scrolling surface.
- Persistent overlays at the end of a scroller, with alternate scroll
  positions tested before a control is classified as unreachable.
- Required copy or controls trapped in a scroll outlet under eight pixels high.
- Primary Home amount text painting over its own illustration, using actual
  text Range fragments and requiring more than two pixels of overlap in both
  dimensions. Hidden amounts and adjacent support/heading text are excluded.
- Home cards, quick actions and eye position before/after hiding large figures,
  with a one-pixel tolerance and explicit shown/hidden state verification.
- In the Hibiscus Plan Money Boxes card, painted heading text overlapping the
  saved-amount summary by more than two pixels in each direction, and text
  escaping the section's horizontal boundary. These appear in
  `planBoxesOverlap`, including when everything remains within the phone.

- Savings hack controls share the Fund/Transfer back action group, follow
  those actions without overlap, precede metadata links, and keep supporting
  details below the actions. These checks appear in `savingsHackPlacement`.
- First-use guidance is expanded and returning guidance is collapsed; form
  controls, payment confirmation facts and Budget amount meaning remain outside
  it. These checks appear in `guidanceStateIssues`, with paired-content checks
  under `guidanceComparisons` and `guidanceFindings`.

Closed disclosure descendants are excluded except for their own summary.
Expanded Budget and Chat tool fixtures cover those controls when opened.
The Savings hack expanded-limits and long-history examples also open their
disclosures. Other Savings hack fixtures keep them closed.
Visually hidden labels, font-size-zero icon labels and native field scrolling
are excluded. Deliberate ellipsis is reported separately from failures.
Text Range clipping currently checks horizontal fragments; visually inspect
screens with tight line heights as well.

All results are rendered into `#report` as JSON. The final summary contains
`counts`, `privacyComparisons`, `privacyFindings`, `guidanceComparisons`,
`guidanceFindings`, and every finding. Read that
DOM report through the supported browser API. The browser evaluation scope may
not expose the page's JavaScript globals. Inspect flagged cases visually before
changing product CSS; layout records alone do not explain the intended design.

For an ordinary UI journey, the actual controls are `#sh-kind`, `#sh-value`,
`#sh-cadence`, `#sh-start`, `#sh-cap`, `#sh-buffer` and `#sh-consent`.
The optional limits disclosure is `details.sh-limits`. New-box setup fixtures
select kinds through normal change/input events. Detail status and history use
`.savings-hack-status.sh-priority-control`, `.sh-status` and the lower
`.savings-hack-details` / `.sh-history` sections. Rule explanation uses
`details.sh-info`. The JSON setup facts under
`setup.savingsHack` disclose selected kind, committed rule state, saved sample
money, history count, validation text and partner-field visibility.

Once browser checks finish, remove the temporary runtime assets:

```sh
node tests/manual-layout/prepare-overflow-audit.cjs --clean
```

The cleanup removes the three generated `__overflow-*` files, two
`__deep-gallery.*` files, three `__deep-*-fixtures.js` scenario files, two `__planning-native-history.*`
diagnostic files and two `__audit-*` mirror directories under `dist`.
Keep this source harness in tests.
Confirm the generated runtime assets are absent before packaging or publishing.

## Whole-product visual gallery

Open `/__deep-gallery.html` on the same managed preview origin. It shows four
isolated native 375 × 667 app viewports at a time. The default Four across
capture layout optically scales each phone to 80 percent so all four fit in a
1348 × 926 browser viewport. It does not change the app's logical viewport or
text size. Native two by two provides a larger view when inspecting details.

Choose an edition, journey, first or returning visit and page group. The
requested route and final rendered route are recorded under each phone; a real
native redirect or renderer forward is retained, rather than replacing it with
an older template. Top, Middle and Bottom controls expose long pages, and the
Details control opens supporting disclosures for a separate inspection. Empty
and long-value states use the existing route-specific variants where available.
The Text size control supports 100, 150 and 200 percent actual computed text.

Wait for **Four pages ready** and the current generation, page, experience and
text-size suffix before observing a screenshot. Controls stay disabled while a
generation is rendering. Ready is set after fixture preparation, fonts, two
animation frames and settling at each layout stage. The same generation must
appear in the four phone labels. Read `#report` in a fresh DOM observation to
confirm actual headings and controls; do not reuse a previous group's report.
An error is labelled explicitly and remains in the report.

First visit uses a fresh sample profile and prepared native task context.
Returning visit navigates away and re-enters that task. Sensitive transient
tasks deliberately expire: card approval requires a fresh action, card details
hide after leaving, and an abandoned generic confirmation is cleared. Inspect
the valid first entry and the safe returning recovery separately. The gallery
does not prove camera behavior, real authentication, production route guards,
backend enforcement or financial correctness.

## Registry and fixture inventory

```sh
node tests/manual-layout/build-review-inventory.cjs
```

This reads each edition's actual shipped script sequence using its own retained
DOM helper, traces successive view assignments, and prepares every registered
route for first and returning visits. The reports in
`docs/review-2026-10-27/inventory*.json` retain source hashes, final writer,
definition file/line, actual renderer calls, task content and controls, guidance,
fixture errors and basic programmatic-label facts. The Markdown matrix lists
every current route. These are DOM checks; browser appearance, visible focus,
contrast, reading order and production reachability still need human review.
Absence of a literal navigation link does not establish that a contextual route
is unreachable. The five test-mode utilities and intentional compatibility
aliases remain explicitly identified.

The separate Onboarding finish, Payments finish and Planning finish scenario
journeys expose 4, 8 and 12 explicitly labelled native sample contexts. These
are gallery-only registrations loaded from retained deep-*-fixtures.js sources.
They do not add cases to any matrix. Experience and State are disabled for
these prepared scenarios; the route, scenario ID and actual renderer remain in
the report. Ordinary Welcome First uses a fresh reset profile; Returning uses
an existing locked profile.

The text-size fixture snapshots inline computed sizes for one mounted state.
A later live interaction can replace child nodes without those temporary inline
overrides. Use independently seeded and scaled shown/hidden privacy pairs for
the invariant, rather than treating an unscaled replacement after a live 200
percent gallery click as an app defect.

The dedicated `/__planning-native-history.html` diagnostic uses one isolated
375 × 667 iframe with the real History API. It shares the same memory-only
profile and four explicit Budget recovery preparations, with visible Prepare
and Read native-state controls. Its report shows the actual route, native
history route and retained parent. Use it to distinguish a browser traversal
from the gallery’s synchronous history fixture before changing app navigation.
Both diagnostic runtime files are registered for cleanup.
