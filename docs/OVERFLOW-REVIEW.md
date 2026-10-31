# UI overflow review · 26 October 2026

This review covers Everyday, Minna and Hibiscus. Presentation fixes preserve each edition's colours, illustrations, navigation destinations and financial controllers. Group journeys, roles and mandate rules are unchanged.

## Corrections

- QR scanner and personal code content grow into a scrollable task surface on short screens.
- Task titles and contextual Chat controls share narrow headers without squeezing action targets.
- The Hibiscus mobile Chat title remains the requested icon; an older narrow-width text rule no longer wins.
- Compact navigation gives Money Story enough space and keeps labels inside their tracks.
- Phone Home amounts use a full-width row below the caption and illustration. Wide savings and available-balance contexts reserve the same space when hidden and shown.
- Budget values, card details, analytics, saving prompts and long group copy wrap inside their own components.
- Compact group tasks use one continuous task scroller, preventing pinned headings/actions from collapsing the reading area. Larger screens retain pinned actions.
- Welcome and setup Pause content remain in normal flow; long toast messages stay within the phone width.

## Validation

The browser inventory covered 240 screen/state cases at eight viewport/text settings per edition: 320×568, 375×667, 390×844, 390×480, 568×320, 768×1024, 1100×900 and 320×568 with actual computed text enlarged to 150%.

The new collapsed-scroll check identified compact group cases after the broader pass. Following the fix, all 50 group cases were rechecked at all eight settings: 400 layouts per edition, zero findings.

The final Home pass includes two additional cases with GH₵10,000 available, GH₵9,600 budgeted, GH₵400 remaining and GH₵999,999.99 savings. All six Home cases passed at eight settings: 48 layouts per edition, zero findings. Both shown/hidden pairs were compared at every size: 16 comparisons per edition, zero pixels of movement in cards, actions or eye position, and no amount/illustration overlap.

The retained audit checks horizontal overflow, text clipped inside components, clipped/unreachable controls, covering panels, collapsed reading areas and privacy geometry. Closed disclosures and intentionally hidden icon labels are excluded; expanded disclosure cases are tested separately.

All nine Home hierarchy checks and all 71 task-sheet journey checks passed in each edition. The required Minna regression gate passed 74/74 test files and Hibiscus passed 82/82, with nine contract checks each. The final CSS pin refresh passed both contract gates. Everyday's required Chat banking test also passed. Git diff checks are clean.

## Repeat the review

The reusable isolated browser harness is in the Everyday checkout under `tests/manual-layout/`. See `OVERFLOW-AUDIT.md` there for preparation, the complete measurement criteria and cleanup. It uses memory-only sample profiles and stubbed camera capture; geometry review does not establish hardware camera or live-payment correctness.

Temporary audit files and edition mirrors must be removed from `dist` before publication.

