# Signal card reference fidelity · 31 October 2026

The previous card retained a white-faced frontal ring, an extra footer row, and an overly tall neutral privacy reserve. This update follows the user's supplied close-up: a hollow tilted lime ring with eyes on its surface, low floor light, a large cedi amount, a single divider and two lower balances.

Only Signal is edited. Monochrome's source, hosting identity, audience and storage are unchanged. Money calculations, persistence, payment engines, Pause timing and authentication are unchanged.

## Presentation changes

- Dedicated transparent hero asset; the small white-faced contextual Lux and existing Pause asset remain unchanged.
- Reference-relative card padding and ring placement; no artificial CSS rotation of the ring image.
- Local card money presentation uses ₵ and omits zero pesewas. Native rounding and nonzero pesewas are preserved. Other pages keep their existing formatter.
- Native budget and date controls are now inside the information disclosure beside the title. The native amount button still opens its calculation.
- Neutral privacy glyphs use the same shortened currency, avoiding an unintended extra line. Very long values and enlarged text can grow naturally.
- New hero added to the existing offline shell cache.

## Browser verification

Actual managed browser render, memory-only sample fixture. No customer state altered.

| Check | Observed result |
| --- | --- |
| 390×844, ordinary text | Card358×229.8125px; view746/746px; no scrolling |
| Reference scaled to358px | Card~358×228px; divider~163px from card top |
| Actual divider | 162.875px from card top |
| Hero image element | 103.8125×104.890625px, including transparent margins and attention strokes |
| 375×667, ordinary text | Card347×224.828125px; view578/578px; no scrolling |
| 375×667, ₵3,000 room | Same card and amount bounds when shown/hidden; amount196.75×61.75px |
| 320×740, 200% text, very large balance | Document320/320px wide; no visible horizontal overflow; natural vertical scroll600/1968px |
| Information disclosure | Opens the existing budget button and period text; native controls remain usable |

The screenshot files are exact crops of one actual browser capture. The screenshot sample is ₵800 room, ₵1,000 available and ₵200 planned costs; numbers are not baked into an image or hardcoded in production.

## Validation

Final required regression gate passed534/534, zero failures, cancellations or skips (128.49s). Eight local edition contracts passed. Optional external peer-checkout comparison was unavailable; the pinned baseline and local scenarios passed. Affected complete suites passed100/100 before the full run.

The first full run caught a presentation consistency bug: zero pesewas were omitted on initial Home render but could reappear after refreshing a plain-text private wrapper. The Home formatter now handles both cases; the four existing exact Menu-restoration tests remain unchanged and pass. Five existing suites' literal Home currency expectations were updated; non-Home format and underlying financial assertions remain intact. Nonzero pesewas, hide/show/refresh, native budget/date handlers and financial immutability are covered. Deterministic build check and diff whitespace check passed.

Exact image prompts and technical crop details are in asset-prompts.json. The ring was generated with the built-in image tool; layout, controls and financial text remain real application UI.
