# Expressive Lumo system

The interface uses a stable native-style app frame, an expressive foreground cast and a restrained monochrome Legon setting. Its main intelligence appears as real, selectable text with a subtle lime highlight behind the useful amount or conclusion. The existing capital-L SVG wordmarks and original Lumo Sans files remain intact.

Decorative rings and repeated standalone ring markers have been removed from Home, Pause, Chat, Plan and entry, along with their reserved height and padding. The actual approved wordmark and explicit transaction status icons remain intact. In content, lime highlights Home's money left after the plan, the projected comparison value in Pause, the latest account-backed financial Chat conclusion and the compact entry consequence. In the main navigation it identifies the current destination, as requested. Plan summaries use ordinary ink text. Lime remains #CFEF59, ink #111111 and paper #FFFFFF. A shortfall is identified by its words and calculated amount; lime does not imply that a purchase is safe.

| Role | Rule |
| --- | --- |
| Main destination title | Lumo Sans Bold 700, 32–40px, compact 1.1 line height. |
| Home conclusion | Bold 700, 44–54px. Available balance stays separately labelled and smaller. Both privacy-controlled figures preserve their existing masking logic. |
| Pause conclusion | Bold 700, 24–26px; one before/after comparison. Only the projected value receives the subtle lime highlight. |
| Chat | Latest financial answer 22px/700 with text-width highlighting; other answers 20px/600 without the highlight. Calculations remain expandable. |
| Body and labels | 15–16px body; supporting copy 14px; metadata 12px. Inputs remain at least 16px. |
| Actions | Ink primary or white outlined secondary, 54px minimum height; 44px text and icon targets. The financial insight receives the lime accent. |
| Everyday illustration | 184–220px compositional band, 164px in short viewports. One understandable gesture over a lighter campus setting. |
| Onboarding and empty states | 220–260px where room allows; 208px on short viewports. |
| Home and initial Chat | 184–216px, 164px on short viewports. Active Chat removes introductory art so the conversation can take over. |
| Task sheets | Standard 96px art; short forms 64px; introductions 132px. Payment entry 48px, Review 40px, Pause 48–60px, PIN 56px, result 112–148px. |

`.bold-scene` contains one `.legon-backdrop` with `.legon-backdrop-image` and one `.expressive-figure` with `.bold-figure-image`. Only the backdrop is converted to grayscale. The foreground uses `object-fit: contain`, keeping its entire gesture and textile colours. The background uses a lighter opacity and edge fade, preventing buildings from competing with financial text. Background cropping is permitted; foreground cropping is not.

`.lumo-lens` remains a legacy grouping hook, `.lumo-lens-value` identifies its primary figure or conclusion, and `.intelligence-note` identifies supporting explanation. The grouping draws no pseudo-element or container decoration. Background gradients follow real text and financial values rather than creating oversized panels. Home keeps the account and plan distinction. Pause keeps its values hypothetical. Chat uses the existing engine and never moves money.

Entry is a single text group with no empty icon column or reserved marker gap. Inherited green input glows, Pay-panel focus outlines, spending-category graphics and menu hover icons use neutral ink or gray. Confirmed transaction status and the illustrative plan-benefit calculation retain their existing semantic treatment. The stylesheet does not recolour clothing or other illustration pixels to match the interface accent.

`clarity-bold.css` loads after `task-sheet.css`, which already follows the older visual layers. The selectors explicitly respect entry, review, Pause, authorisation, result and keyboard-open contexts. Long names, large amounts, enlarged text, open calculations and forms can scroll naturally. The implementation does not shrink important copy or fix the height of an inner form to force one-screen layouts.

Motion uses the existing reveal 180ms and resolve 220ms easing. Task stages move only 8px on entry and remain immediately actionable. Navigation gives a small press response. Financial values do not pulse or count. Reduced motion removes the visual transitions while preserving all content and actions.

The task shell keeps the parent mounted and inert, with one app-width sheet and one content scroll surface. Namespaced empty error outlets retain their original hidden behavior, preventing the background page from shifting. Toasts sit above the active sheet. Existing payment status, authorisation, validation, privacy and calculation logic remain the authority.

Source and behavior tests can verify asset mapping, amount formatting, focus and history contracts, privacy and financial results. They do not substitute for device verification of keyboard-open layouts, increased text or the composed artwork. Browser and device limitations must be reported with the release evidence.

Current navigation uses an explicit visible ink bar at `#nav:not([hidden])`, overcoming the earlier specificity conflict. All five labels/icons stay visible; the current destination uses lime and a short underline as a location cue. Current task-prop mapping, source-asset reuse and clipping rules are recorded in [page-correlation validation](PAGE-CORRELATION-VALIDATION.md). Foreground service SVGs use tightly bounded nested viewports with no fragment IDs; ordinary character masters remain contained PNGs.
