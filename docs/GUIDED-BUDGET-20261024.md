# Guided Budget creation · 24 October 2026

## Purpose

Help a student explain what Everyday money needs to cover, understand the effect of a payment, and save a Budget deliberately. Guidance is optional. The existing direct form stays available.

## Recovery

Before this change, both repositories were checkpointed with `checkpoint-before-guided-budget-20261024`:

- Everyday published v27, source 087ecf429ff3ba613aab5b226daaf16eccf96dde.
- Minna published v9, source 44803eab015e2beed5f15af52a35396ad1451768.

Both hosted editions retain their existing URLs, access modes, branding and independent demo storage. Campus Pilot and Clarity Edition are not changed.

## Experience

- First Budget explanation offers **Build it with Lumo** and **Enter it myself**. The confirmed first-funding prompt offers the same routes.
- The cost form offers **Continue in Chat**, carrying its existing amounts, names, dates and editing target.
- Chat can understand named totals, multiple costs, date periods, daily rates with explicit counts, and basic Budget questions. It asks for missing information and offers short replies. It never invents a student’s timetable, prices or allowance receipt.
- A compact draft control replaces ordinary spending filters while guidance is active. The conversation and composer keep their normal independent layout. Students can pause, resume or return to the form.
- With four complete weeks of eligible recorded history, an empty guide can open the existing spending-based suggestion. That flow retains its evidence and save guards.
- Guided review shows the named items before Save. The existing financial calculation is available in its detail disclosure. Review and Save handlers remain authoritative.
- A newer saved Budget or allowance blocks an old draft from overwriting it. Restarting explicitly confirms replacement of only the unsaved conversation draft.

## State and financial authority

`L.state.planDraft` is the single editable Budget. `budgetGuideSession` stores conversation metadata, a draft token, pending clarification, revision and a baseline. It is not a second Budget or account.

Projection uses `L.firstPlanPosition()` and the existing engine. Only the existing explicit `L.saveFirstPlan()` commits planning information. Chat never authorises a transaction, moves funds or funds Money Boxes. Money Boxes remain separate savings. Expected allowance is not received money.

Linked payments and paid-outside coverage retain their IDs and ledger authority. Pending linked payments prevent unsafe changes. Ordinary spending/payment questions leave guidance without becoming new Budget items; cancellation retains unrelated payment drafts.

This buildless prototype uses bounded local conversation logic. It has no new remote AI service or model connection. Production natural-language coverage, model evaluation and service integration remain separate implementation work. All account, payment, verification and biometric activity remains simulated.

## Validation and browser evidence

Use the approved edition manifest, plus `tests/budget-guide.test.cjs` and `tests/budget-guide-ui.test.cjs`. The reusable local fixture is `tests/manual-layout/guided-budget-audit.html`; serve a temporary copy during browser QA and remove it from dist before packaging.

Reference fixture: GH₵500 available in Everyday money, GH₵100 already in Money Boxes. “Food 250 and transport 100 for seven days” prepares GH₵350 of Budget costs and GH₵150 left after the Budget. Save changes planning information only; Everyday money, savings and transactions stay unchanged.

Phone checks cover guided and manual entry, partial-form handoff, named review, explicit Save, independent Chat scrolling, pause/resume and larger text. Browser keyboard checks use reduced available viewport height rather than a physical phone keyboard. Detailed results and screenshots are in `docs/qa/guided-budget/`.
