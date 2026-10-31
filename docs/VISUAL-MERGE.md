# Lumo · Clarity Edition visual reference

> Clarity v2 adds three signature scenes and one persistent Campus Pay task sheet. Read `EXPRESSIVE-PASS.md`, `TASK-SHEET-STYLE.md` and `EXPRESSIVE-SHEET-VALIDATION.md` alongside these foundation rules.

This edition combines the campus prototype's working product with the earlier illustration-first identity. It is a separate project and does not replace either source site. The central rule remains **the consequence comes into focus**.

## Sources of truth

| Part | Source retained | Application |
| --- | --- | --- |
| Journeys, saved state and validation | Campus prototype v25 | Existing onboarding, funding, payments, plans, goals, activity, help and account flows |
| Financial meaning | Campus calculation and transaction engines | Shared preview, Pause, Chat, confirmed balances and planned-expense fulfilment |
| Lettering | Original illustration-first Lumo Sans files | Regular 400, Medium 500, Semibold 600 and Bold 700; no synthetic weights or italics |
| Logo | Original capital-L SVG assets | Black and white artwork, unchanged native 2502:712 proportions |
| Illustration | Eight recovered illustration-first textile PNG masters | Original gestures, line work, clothing patterns and transparency |
| Composition | Earlier `minna.css` and final illustration-first screens | White canvas, open groups, ink navigation, simple dividers and restrained lime figures |

The implementation layer is `dist/clarity-edition.css`, loaded after the existing functional style sheets and `clarity-type.css`. It changes presentation, not product rules. Source assets are documented separately by the identity and illustration manifests.

## Typography and numbers

Use Lumo Sans throughout the interface. Use 600 for titles and financial conclusions, 500 for secondary actions and labels, and 400 for explanations. Bold 700 remains available for inherited emphasis. The authentic font files include the cedi sign and tabular numeral alternates.

| Role | Ordinary size | Rule |
| --- | --- | --- |
| Intro title | 40px | Short, 1.08 line-height; open letterforms |
| Screen title | 32px | 600, 1.12 line-height, modest tracking |
| Financial consequence | 24–26px | 600, specific conclusion before explanation |
| Home main amount | 42–52px | 600, tabular figures, lime underline |
| Available balance | 24–26px | Smaller context beside its own label |
| Payment entry | 38–42px | Real native decimal input; no custom keypad |
| Chat conclusion | 19–20px | Recognisable emphasis without a large card |
| Body and supporting text | 14–16px | Natural wrapping; no line clamping |
| Metadata | 12–13px | Short labels and boundaries, never essential instructions |

Use the existing shared money formatter for GH₵, grouping, signs and decimal precision. Large-display amounts use the shared currency/whole/cents markup. Keep `GH₵` in a non-wrapping currency span. Alignment uses `lining-nums tabular-nums`. Goals remain commitments within the plan, not a second account debit.

## Colour and framing

| Token | Value | Purpose |
| --- | --- | --- |
| White | `#FFFFFF` | Product canvas and button surfaces |
| Ink | `#111111` | Text, primary actions, navigation and focus |
| Figure lime | `#CFEF59` | Selected financial figure and confirmed result ring |
| Muted | `#555555` | Readable explanations and secondary labels |
| Divider | `#DEDEDE` | Group separation, not interactive boundaries |
| Control border | `#858585` | Input and control affordance |
| Neutral wash | `#F5F5F5` | User message and supporting states |

Lime highlights **information** rather than filling primary buttons. Home highlights the plan-derived figure; Pause highlights the projected comparison value. A shortfall is always explicit in words. Pending and failed results retain their actual state labels and neutral icon treatment. The confirmed ring is distinct from a small insight ring.

Use 4, 8, 12, 16, 24 and 32px spacing steps. Ordinary phone gutters are 24px, reducing to 18px at narrow widths. Related facts share alignment; dividers separate groups. Keep cards only for useful grouping. Receipts and the Home conclusion are open rather than large rounded panels. Controls use 12px corners and 1.5px strokes.

The capital-L wordmark stays an actual image, at least 80px wide, with its native aspect ratio and surrounding space. Its rounded counter is echoed only in the small insight ring and status circle. It is not recreated as text, distorted, filtered or repeatedly inserted into the task.

## Illustration construction and scale

The original PNGs are the drawing authority. Preserve their outlined figures, expressive gestures, clothing texture and textile colours. Keep the interface monochrome with restrained lime, while colour remains inside the recovered drawings. Never redraw or recolour these masters to approximate missing scenes.

| Context | Ordinary scene height | Purpose |
| --- | --- | --- |
| Intro and onboarding | 148–180px | Welcome and establish character |
| Home | 152px | Human presence after the financial conclusion |
| Chat entry | 164px | Invite a useful question |
| Everyday and empty state | 140px | Support one task or state |
| Payment entry | 48–56px | Orient without displacing the form action |
| Review | 48px | Keep recipient and payment facts first |
| Pause and authorisation | 52–64px | Support the decision; never compete with it |
| Result | 104–128px | Acknowledge the actual confirmed or unresolved state |

Short screens reduce illustration height before text. Images use `object-fit: contain`, retaining complete figures and patterns. Active conversations hide the introductory illustration. The food illustration is used only when the saved essentials justify it; the laptop scene is reserved for a relevant goal. The neutral thoughtful scene is the fallback where the original family has no exact action.

## Connected journey and motion

| Surface | Job | Emphasis |
| --- | --- | --- |
| Home | Understand account money and the plan | Left after the plan; available balance smaller |
| Entry | Enter or revise the proposed amount | One compact live consequence |
| Review | Check who and how much | Recipient, amount, fee and total |
| Pause, when triggered | Make an informed consequential choice | Specific headline, one before/after comparison, equally accessible edit and continue |
| Authorisation | Decide whether to submit | Explicit PIN confirmation |
| Result | Explain what actually happened | Confirmed, pending, failed or reversed state |
| Chat | Answer the same financial question | Concise conclusion, relevant next action, expandable calculation |

Retain the shared **reveal → hold → resolve** timing: 180ms reveal, 80ms hold and 220ms resolve, with the existing `cubic-bezier(.2,.75,.3,1)` easing. The Pause comparison makes a small spatial reveal; it does not animate a fake account debit. The real final projection exists immediately. No animation blocks an action or triggers a transaction.

Reduced motion removes transitions and transforms while preserving every amount, explanation and choice. Success motion remains tied to confirmed transaction state. Pending or failed payments never receive the success animation.

## Responsive and accessibility rules

Keep native inputs at least 16px and actions at least 44px high. Use ink focus outlines on white and white outlines inside black navigation. Do not put fixed actions over forms or the Chat composer. Keep the main view as the natural scrolling surface, permitting text enlargement, optional detail and long names without clipping. The amount row is a non-wrapping flex row with a fixed currency label and a shrinking native input.

Source review covered the existing cascade, narrow-width media rules, full-size image containment, currency spans, comparison structure, focus visibility and reduced-motion rules. A supported live browser was unavailable in this environment. Actual phone rendering, on-screen keyboard behaviour, increased text size and screenshots require a device/browser check. Those checks must not be represented as completed visual validation.
