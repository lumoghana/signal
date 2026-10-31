# Shared UI finishing pass · v15

The existing Everyday Edition font, wordmarks, colours, drawings, account model
and journeys are retained. `ui-consistency.css` is the final presentation layer.
Home's main figure, supporting balance and global privacy control remain in its
own composition. This pass does not change the Pause sequence or payment state.

## Rules

| Role | Shared treatment |
|---|---|
| Main destination title | 32px at normal root size; 28px on short viewports; bold |
| Sheet/task title | 24px, bold, consistent line height |
| Active Chat heading | Compact 24px; introductory decoration still collapses |
| Supporting introduction | 15px with 1.5 line height |
| Field labels and detail controls | 14px, semibold; detail touch targets at least 44px |
| Full task action | 16px bold; at least 52px tall; 16px corners |
| Compact card action | 14px bold; at least 48px tall; 16px corners |
| Text action | 14px semibold; at least 44px tall |
| Card/receipt surface | Existing white and neutral border, 24px corners |
| Notice/control surface | 16px corners |
| Primary result symbol | 56px; existing success/pending/failure meaning retained |
| Inline funding feedback | Compact 40px symbol rather than a large success hero |

All pixel equivalents above assume the normal 16px root. Text rules use rem to
respect enlarged browser text. Amount fields, PINs, financial conclusions and
the Pause hero keep their specialist rules. Home controls use the same compact
action tokens without inheriting the task page layout.

## Mismatches corrected

- Plan's 12px/14px-corner action buttons now use the same compact action role as
  other card controls.
- Main headings use one role across Plan, Pay, You, Money Story and introductory
  Chat; sheets intentionally use the smaller task role.
- Field labels and expandable detail controls share weight, contrast and targets.
- Money Box summary cards fill their surface and use the shared border and type.
- Transfer results use the same symbol scale as other payment results. Where a
  transfer result repeats the sheet's title above its outcome headline, the
  redundant visual title is removed while the actual outcome stays prominent.

## Preserved boundaries

No monetary value, warning threshold, confirmation timing, authentication,
navigation destination, provider state or saved information is changed. The
stylesheet does not disable scrolling, recolour artwork, resize the Pause hero,
or move the Chat composer. Important failure and shortfall wording stays visible.
Natural scrolling remains available for long content and enlarged text.

## Home hierarchy and privacy

With a saved Budget, Left after Budget leads the operational card. Available
balance is a compact, inline supporting row beneath it, rather than a second
large amount above it. Without a Budget, available balance is the sole main
figure and the Budget invitation remains separate.

The one shared Home privacy control is the final control at the header's right
edge, outside both accounts. It shows an eye and Hide/Show, with the full
accessible name Hide/Show balances. Compact copy survives toggling. Available,
room and savings still mask together; backgrounding and locked access retain
their existing protections. Direct toggling while locked cannot reveal money.
The operational Add money footer, confirmed-funding Campus Pay shortcut,
Request money and Money Story are retained.

Account-detail and balance-detail views now use the shared page-heading
component. The Pause comparison says Budget coverage, so its label cannot be
mistaken for a claim that the entire Budget remains funded.

## Restore and verification

Restore point: published version14, source
`965789feb017b408e669ba110f924563287c2e09`, tag
`checkpoint-before-balance-hierarchy-v15-20261022`.

New home-hierarchy suite: 11 passing behavioral checks. Selected regressions:
home-funding-state, plan-hub, product-accounts, navigation-visibility,
funding-budget, money-boxes-journey, transaction-journey, task-sheet,
clarity-pause and budget-copy. Syntax checks and git diff checks pass.

Browser QA covered Home, masking/revealing all three figures, Plan and its edit
sheet, opening/active Chat, Pay, Campus Pay entry and Pause, You and account
details. At the available preview width, measured Home room44px versus supporting
available16px, a72×44px eye control at the header's right edge outside the cards,
and no horizontal app overflow. Account-sheet and active Chat headings24px;
Plan card actions14px with48px targets. These are actual rendered checks, not
physical-phone or every-text-size claims. Natural scrolling remains available.
The supplied screenshot copy was unavailable; this pass used the current source
and preview plus the user's explicit placement and hierarchy requirements.
