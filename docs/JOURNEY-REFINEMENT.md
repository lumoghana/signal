# Lumo journey refinement · 25

The consequence comes into focus through a progression, rather than three repetitions of the same warning.

| Stage | Job | Visual treatment |
| --- | --- | --- |
| Home | Explain room after the saved plan | Dominant amount on a quiet green insight surface; one small clarity ring |
| Amount entry | Show one live projected consequence while editing | Unboxed label and one short line; 48–64 px art; working plan selector; Review immediately follows |
| Review | Verify recipient, amount, fees and total | Neutral payment summary; 48 px art; no repeated plan warning |
| Pause | Make the consequential choice | Full Lumo green canvas; specific conclusion; supporting facts; equal Edit amount and Continue to PIN choices; 64 px art |
| Chat | Answer the question, then offer the arithmetic | Financial conclusions use a quiet green insight surface and one ring; generic replies remain white; 108 px introduction disappears when conversation starts |
| Result | Confirm what actually happened | 72 px illustration; a 56 px status ring, labelled result and receipt; confirmed, pending and failed retain distinct states |

## Purposeful shared rules

The small 13 px ring with its offset dot marks a Lumo insight. Home, live entry, Pause and financial Chat use the same shape. It does not mark a payment as completed. The larger result ring contains the actual transaction-status icon and has no extra brand dot. No additional decorative rings or logo repetitions were introduced. The approved live wordmark is unchanged.

Green draws attention to a useful Lumo conclusion. Home and financial Chat replies use `--green-soft`, while Pause alone owns the full `--green` canvas. Generic Chat replies remain white. Entry and Review remain on the neutral paper surface. A green surface is not permission to spend: an essentials shortfall is always stated explicitly. Only a confirmed result receives the green status ring. Pending and reversed use neutral status marks; failed and delivery-problem results use the existing shortfall tokens with explicit text.

Illustrations shrink as the task becomes more specific. Existing introductory art keeps its existing large scale. Home and introductory Chat use 108 px art; entry uses 64 px, or 48 px on a short viewport; Review uses 48 px; Pause uses 64 px; result uses 72 px. Compact entry suppresses background scenery and the redundant recipient avatar. Long names and enlarged text increase natural height rather than being clipped.

The cedi label is a non-shrinking, non-wrapping item on payment, funding and request amount fields. The numeric input is the flexible item and can shrink within its row. It retains a real numeric input, the Ghana-cedi accessible label, decimals and existing validation. Compact entry typography applies only to the payment amount stage. The system's two-decimal display formatter, tabular numerals, typeface and financial calculation authority are unchanged.

## Layout budget and verification limits

The action is in document flow directly after the compact projection. The plan selector remains visible and at least 44 px high. Review remains at least 54 px high. Optional notes follow the main action and remain accessible. No fixed or sticky overlay, text clamp, clipped panel or maximum screen height is used.

Source-based estimate for an ordinary-text Campus Pay entry, with a short recipient and a two-line plan hint: about 500–540 px from the top of the screen content to the bottom of Review. A transfer with Change recipient adds a 44 px action. A longer name, three-line hint, error or enlarged text adds natural height. These are estimates from CSS block sizes and line heights, not phone-browser measurements. Safe areas, browser chrome, an open keyboard and font rendering can reduce the visible space.

The new `dist/journey-refinement.css` is the final shared CSS layer. Its narrowly scoped entry selectors intentionally override legacy `!important` scene sizes; the generic introduction and recipient-check screens keep their current scale. Existing reduced-motion rules remain authoritative. Source and VM checks can establish markup, calculations and controls, but cannot establish phone fit, keyboard occlusion or assistive-technology behavior without a supported browser/device pass.

See `SYSTEM-REFERENCE.md` for the complete type, numerical, spacing, colour, illustration and motion rules, and `VERIFICATION.md` for the actual checks completed.
