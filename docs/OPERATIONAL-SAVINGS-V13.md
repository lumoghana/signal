# Operational, Savings and Budget · v13

Approved product update, 22 October 2026. Existing Everyday Edition project,
storage key, wordmarks, typeface and Campus Pilot artwork are retained.

## Restore point

Before editing: published Site version 12, commit
`a40275350fb1aef8fd4900190a51720230a38916`.
Local tag: `checkpoint-before-budget-moneyboxes-20261022`.
The source checkout also has a pre-change git bundle outside the repository.
No changes were made to Campus Pilot or Clarity Edition projects.

## Customer journey

1. Sample Ghana Card check → review verified name, date of birth and card.
   These are read-only. University, email and optional address are editable.
   Changing phone retains the existing OTP check. Non-Legon students see a
   pilot limitation notice without a Student ID requirement.
2. Existing consent and security steps → two distinct sample account numbers.
3. Add money → Mobile Money or bank/GIP. GCB Bank receiving details use the
   operational account. Bank instructions explain beneficiary checking and
   confirmed receipt. A separately labelled simulation lets visitors try it.
4. Confirmed first funding → optional two-step Budget setup. Pending or failed
   credits never claim receipt. Later funding offers Budget review.
5. Money Boxes have their own create/edit/fund/transfer-back flow. Targets and
   dates are optional. Creation starts at zero; it never moves money.
6. Every money movement uses reviewed details and separate PIN authorisation.
   Meaningful operational Budget trade-offs retain the existing Pause rules,
   reveal timing and 90 ms Continue hold. Withdrawals use box availability.

## Account model

| Value | Authority |
|---|---|
| Operational confirmed balance | `state.balance` |
| Operational available | Balance minus pending external/deposit holds |
| Remaining Budget | Unpaid `state.essentials`, including existing linked-payment coverage |
| Left after Budget | Operational available minus remaining Budget, floored at zero |
| Savings confirmed balance | Sum of `state.goals[].allocated`, now actual funded box balances |
| Savings available to move back | Box balances minus pending withdrawal holds |
| Combined money | Operational confirmed + savings confirmed |

`accounts.version === 2` distinguishes the model. Stable legacy internal names
remain for compatibility. `two-account-engine.js` owns migration, movements,
holds, idempotence and resolution. Home, payment projections, Pause and Chat use
the shared financial engines. Money Boxes cannot fulfil Budget items.

Internal movements use `type: internal` and `internalTransfer: true`. They appear
in Activity with ↔, and are excluded from external spending and received-income
summaries. Failed transfers release reservations. Pending transfers do not move
confirmed balances. Funded or pending boxes cannot be archived; empty archives
are reversible. Savings balances block closure.

## Migration

Existing virtual goal allocations become funded Money Boxes by moving the same
amount out of operational money. Combined money is preserved, and migration
runs once. For example, legacy balance600/budget350/goal100 becomes operational500,
savings100 and left-after-budget150. Existing operational account number remains;
a distinct stable demo savings number is added.

If old allocations exceed available operational funds after pending holds,
migration funds only what exists and records `legacyUnfunded` on boxes plus a
Home notice. It never creates money, spends a hold or silently loses a requested
allocation. Existing payments, feedback, profile and drafts are preserved.

## Validation

Canonical confirmed funding and transfer fixture:

| Stage | Operational | Remaining Budget | Savings | Left after Budget |
|---|---:|---:|---:|---:|
| Receive600, budget350 | 600 | 350 | 0 | 250 |
| Fund box100 | 500 | 350 | 100 | 150 |
| Extra80 from that state | 420 | 350 | 100 | 70 |
| Extra140 from that state | 360 | 350 | 100 | 10 |
| Extra280 from that state | 220 | 350 | 100 | 0, Budget130 short |
| Linked Budget80 from500 | 420 | 270 | 100 | 150 |

These replace the old single-account fixture, which deducted goal allocations
inside the same balance. Savings is never deducted twice. A purchase cannot
silently spend savings; the student first transfers it back.

20 focused automated suites passed: two-account-engine, account-onboarding,
signup-university, funding-budget, money-boxes-journey, budget-chat, budget-copy,
product-accounts, payment-integrity, clarity-pause, mobile-network,
category-intelligence, category-one-tap, category-refinement, transaction-journey,
navigation-visibility, chat-coach, plan-period, plan-impact-consistency, task-sheet.
All shipped JavaScript passed `node --check`; `git diff --check` passed.
Older historical visual-spec suites outside this selection are not a v13
acceptance claim.

The 71 task-sheet checks retain focus, background isolation, history, form values,
keyboard viewport response, scrolling and reduced-motion behavior. Browser QA
covered fresh non-Legon sign-up, verified details review, distinct accounts,
bank guide/sample600 credit, Budget350 setup, Money Box creation/funding100,
Home500/150/100 and transfer-back confirmation. The new compact Home artwork was
visually checked after fixing a cascade sizing conflict.

## Boundaries

This is a local-state simulation. No real account, Ghana Card, OTP, bank/GIP,
Mobile Money, network lookup or payment provider is connected. Physical phone
keyboards and every browser/text-size combination were not manually tested.
Long forms, instructions, histories and enlarged text can scroll naturally.
No new interest, lock-in, deposit insurance, forecasts or savings charges are
claimed. Pilot access settings stay public, as before.
