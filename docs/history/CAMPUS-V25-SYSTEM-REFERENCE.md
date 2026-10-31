> Historical campus v25 record. Superseded for Clarity Edition by docs/SYSTEM-REFERENCE.md and docs/CLARITY-VALIDATION.md.

# Lumo system · 25

**The consequence comes into focus.** Orient the student, state the conclusion, explain only the facts needed to act, then offer a clear choice. Home, entry, Pause, Chat and confirmation share the visual language; Review is a neutral check of payment facts. The complete app remains a local simulation with no live payments.

## Each stage has one job

| Stage | Job | Illustration / accent / ring |
| --- | --- | --- |
| Home | Understand the amount left after the plan | 108 px art; green insight tint; one small ring by the key label |
| Entry | A brief live consequence while editing | 64 px art, 48 px on short screens; plain background; one ring with the compact conditional line |
| Review | Check recipient, amount, fees and total | 48 px art; neutral background; no repeated plan warning or extra ring |
| Pause | Understand the specific trade-off and choose | 64 px art; full green; same small ring; supporting facts and equal alternatives |
| Chat | Concise conclusion, then optional calculation | 108 px introduction, hidden in conversation; financial insight tint and one ring |
| Confirmation | Know the actual transaction result | 72 px art; status ring with check only for confirmed success; neutral pending and separate failed state |

Entry keeps the currency prefix together in a non-shrinking item and lets the numeric input use the remaining row width. The live preview is unboxed and short. Review sits directly after it, ahead of the optional note. The plan selector stays visible with 16 px text and a comfortable target. Details: `JOURNEY-REFINEMENT.md`.

## Identity and geometry

The deployed wordmark is live `lum<span>o</span>` lettering, not a separate master logo file. Its existing system face, 750 weight, tracking, proportions and offset green dot are protected, including its original synthesis behavior. No wordmark or icon artwork was redrawn. A separate approved vector master was not present in the current project and was not substituted from an older brand exploration.

The closed rounded counter and small offset dot inform a quiet clarity ring on Home, rounded result marks and the focus edge during a reveal. Use that geometry once where it explains attention. Do not place decorative rings around every component.

## Typography and money

| Role | Family / weight | Treatment |
| --- | --- | --- |
| Screen title | Self-hosted Plus Jakarta Sans 700 | 32–38 px; short, open lines |
| Financial conclusion | Same family 600 | 23–25 px in compact decisions; 1.18–1.25 leading |
| Main amount | Same family 600 | 38–52 px; tabular numerals; small currency and legible cents |
| Supporting facts | Same family 400 | 14–15 px; 1.45–1.5 leading |
| Main action | Same family 700 | 54 px minimum height; instant response |
| Text action / navigation | Same family 600 | 44 px minimum target |
| Secondary information | Same family 400 | Normally 12–13 px; allow scrolling |

Use only real 400, 500, 600 and 700 UI weights. The variable WOFF is served locally and preloaded. It contains native cedi and minus outlines and real equal-width `tnum` digits at every UI weight. Browser font synthesis is disabled for the interface. The protected wordmark is a deliberate exception. See `TYPOGRAPHY-AUDIT.md` and the retained OFL licence.

`L.money` / `L.formatMoney` are the shared authority: **GH₵600.00**, **GH₵1,234.56**, **−GH₵30.00**. Always two decimal places, comma grouping, no space after the currency and a true minus. `L.planMoney` aliases this formatter; `L.balanceNumber` uses its parts for large real-text figures. Right-align comparison values and use tabular numerals. Inputs remain numeric, with a separate accessible cedi label. Chat still understands GHS and cedi variants typed by students. CSV currency metadata may retain the ISO code GHS.

## Colour, spacing and controls

| Token | Value | Meaning |
| --- | --- | --- |
| `--paper` | #F8F9F4 | Warm monochrome foundation |
| `--ink` | #20261E | Text and strong actions |
| `--muted` | #53614B | Readable supporting text |
| `--green` | #B5E96A | Established Lumo accent; Pause canvas |
| `--green-soft` | #EAF3DF | A useful insight or covered-plan result |
| `--green-ink` | #314B1F | Text and focus on insight surfaces |
| `--shortfall-soft` / `--red` | #F4E8E0 / #8A3D2B | Supporting shortfall cue with explicit words/symbols |
| `--control-line` | #7A896F | Visible field and control edges |

Green means attention to a Lumo insight, rather than permission to spend. A shortfall always names what is uncovered. Exact spare-room wording handles a narrow remainder without relying on colour or introducing a new financial threshold. Use the 4 / 8 / 12 / 16 / 24 / 32 px spacing scale, 16 px control curves and 24 px panel curves. Prefer open rows and whitespace; add a surface only to group a conclusion or an actionable task. Equal Pause choices share size, border, fill and weight. Text and icons remain understandable without colour. Fifteen text/control/focus token pairs pass computed contrast checks; decorative separators are not meaningful control boundaries.

## Illustration family

Keep the existing small cast, rounded black contours, tiny profile/dot-eye faces, expressive hands, large hair/garment blocks and sparse black-and-white African-print cuffs or pockets. Ghanaian context comes from the people, objects and restrained Legon linework. Scenery is neutral and subordinate at 0.4 opacity; compact decisions show only the foreground action. Existing bitmap lime variations remain illustration tints, rather than replacing the primary brand token.

Introductory scenes: 148–196 px. Everyday scenes: 108–144 px. Compact tasks: entry48–64 px, Review48 px, Pause64 px and result72 px; the role-specific scale takes precedence over generic introductory sizes. Active Chat hides the introduction. Generic Pause uses the recurring seated student with a phone and thinking gesture. Its native SVG silhouette clip excludes the sneakers/laptop thought objects. The full trade-off is available only as explicit `tradeoff` art for relevant situations. Do not embed labels, amounts or financial consequences in artwork. See `../ILLUSTRATION-SYSTEM.md` for construction and selection rules.

## Motion

Shared grammar: **reveal 180 ms → hold 80 ms → resolve 220 ms**, with `cubic-bezier(.2,.75,.3,1)`. Press response is immediate. Figures are correct from first paint and never count up, down or interpolate. Privacy reveal brings the balance, allocations and room into focus together. Amount edits get a subtle replaceable edge emphasis. Chat immediately removes introductory decoration and settles the answer into view. No action waits for animation.

A confirmed-result flourish requires an actual successful transaction and completed delivery. Pending, failed, reversed and delivery-problem states use their own finite emphasis. Reduced motion removes movement while retaining every figure, explanation and action; backgrounding cancels effects. Motion never authorizes a payment or mutates balances, planning data or transaction status.

## Financial story and policy boundaries

The existing Pause engine owns available funds, pending holds, linked-essential coverage and remaining commitments. Home delegates to those same cents-based facts. Entry, Pause and Chat consume `L.planImpactSummary`; Review verifies the draft’s recipient, principal, existing fee and total without repeating the plan warning. Goal allocations are planning commitments, not a second account debit.

| Discretionary payment | Projected account balance | Essentials short | Goal uncovered | Total plan gap | Left after plan |
| ---: | ---: | ---: | ---: | ---: | ---: |
| Before payment | GH₵600.00 | GH₵0.00 | GH₵0.00 | GH₵0.00 | GH₵150.00 |
| GH₵80.00 | GH₵520.00 | GH₵0.00 | GH₵0.00 | GH₵0.00 | GH₵70.00 |
| GH₵140.00 | GH₵460.00 | GH₵0.00 | GH₵0.00 | GH₵0.00 | GH₵10.00 |
| GH₵280.00 | GH₵320.00 | GH₵30.00 | GH₵100.00 | GH₵130.00 | GH₵0.00 |

All rows use GH₵350.00 remaining essentials and a GH₵100.00 laptop allocation. Paying GH₵80.00 **linked to Food** reduces both available funds and that obligation by GH₵80.00, so room stays GH₵150.00.

The low-spare result says “Your plan stays covered. GH₵10.00 spare.” There is no new spare-room warning threshold. The documented account-balance-below-50 signal, score threshold and independent worsening-plan trigger are unchanged. Predictive buffer policy remains future scope. Expected allowance is excluded from available money. A selected plan period is metadata, never evidence that money will last until that date.

## Scope, checkpoint and evidence

Latest refinement checkpoint: deployed version **24**, source `a62fd26532ef4624622a9d3c9d8a29d91c7e5705`. The earlier v23 checkpoint is also retained. Recover through that saved Site version or source commit. A local Git tag `checkpoint/lumo-before-journey-v25-20261018` was created before this refinement; the earlier system checkpoint and bundle are also retained.

The system is carried through all existing routes using shared primitives. Onboarding, funding, planning, transfers, Campus Pay, PIN, navigation, samples and privacy remain connected. The reference and verification notes sit outside the customer flow.

See `VERIFICATION.md` for completed checks and explicit limits. Actual phone-browser screenshots and a journey recording were not captured because the supported browser capability was unavailable. Component rasters and VM markup checks are not presented as phone screenshots. Device fit, enlarged text, software keyboards and assistive technology still need the listed manual pass.
