# Home and Plan refinement · v14

22 October 2026. Retains the Everyday Edition identity, two-account engine,
existing storage, payment rules and saved customer information.

Restore point: published version13, source
`62e5568f1e1f07bae666ca06fb0ada1e36c7037a`, tag
`checkpoint-before-home-plan-v14-20261022`.

## Home

- Three groups: both accounts, quick actions, money story.
- Available operational balance remains separate from the more prominent
  Left after Budget figure. One visible, labelled eye controls both and savings.
- The existing contextual Campus illustration sits beside the Budget insight
  inside the everyday account rather than occupying an unrelated header area.
- Account labels and the non-Legon notice are shorter. Budget arithmetic remains
  one tap away; important uncovered-budget amounts stay visible on Home.
- Before any confirmed funding, Add money is the main action alongside Request
  money. After confirmed funding, Campus Pay takes that place and Add money is
  permanently available in the operational card footer.
- Money Boxes remains a separate savings card, including a useful empty state.
  The money story still excludes movements between the customer's own accounts.

## Funding milestone

`home-funding-state.js` owns `L.hasFundedOperationalAccount()`. It records
`accounts.operational.hasBeenFunded` from a positive, confirmed external incoming
transaction. Pending/failed credits, external bank-debit claims and internal
transfers cannot set it. Positive legacy opening money is recognised through the
existing migration metadata. The flag remains after money is spent and through
reloads. This changes presentation only; it never changes money or authorisation.

## Plan

The retained route `plan` now has the visible navigation label Plan. Its hub
shows two separate sections:

- Budget: operational spending room, remaining costs, edit/add-cost controls,
  optional period, calculation and expected-money details.
- Money Boxes: actual savings total, box count, open/create actions.

No savings is deducted from the Budget again. Box funding, withdrawal, Pause,
PIN, history and existing sheets remain owned by their established modules.

## Validation

New focused tests cover the funding milestone, Home action placement and working
sheet links, plus both populated and empty Plan sections. Existing financial
product integration, navigation, funding, Money Box and payment journey tests
remain in the selected regression set. No historical visual-spec suite outside
that set is an acceptance claim.

Browser checks cover Home presentation, Campus Pay from Home, Add money from the
operational card, Plan with both sections, and return to the retained parent.
Compact-height and narrow-width CSS preserve natural scrolling and touch targets.
Physical phone keyboards and all enlarged-text combinations are not manually
verified. All banking and payment activity remains simulated.
