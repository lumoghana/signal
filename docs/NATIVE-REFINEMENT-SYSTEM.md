# Native task refinement

The existing wordmark, four authentic Lumo Sans weights, white/ink foundation, selective lime information highlights and textile illustrations remain the identity. This pass changes layout and task presentation. It does not introduce a visual reset, a new illustration family or new financial behavior.

`dist/native-refinement.css` must load last. The older project contains several layered rules, including percentage sheet heights, viewport density changes and high-specificity illustration sizes. The final stylesheet deliberately overrides those affected rules by component and route, without reducing important text to fit a screen.

| Surface | Rule |
| --- | --- |
| Task sheet | Height follows content. A viewport cap leaves a safe top gap; no percentage-height minimum or large empty panel. Chrome remains outside the single scrolling body. |
| Treatments | Selection, edit, detail, Pause, confirmation and longer forms share the same host. Short edits use 28px artwork, selection 48px, detail and confirmation no decorative characters. |
| Home | One 44px greeting/header, 25px separate available figure, 44px money left after the plan, one explanation, a full-width campus money-checking scene between the overview and actions, growing to the available height up to340px, 54px main actions, one 44px secondary tools disclosure and compact recent activity. The three groups are money, actions and recent activity. |
| Entry | Compact recipient context, 28px task art, 42px amount and 16px input/selector text. GH₵ remains together. The compact projected consequence sits before Review. |
| Review | 40px amount labelled once, recipient/method, fee and total; the decorative scene is removed. A qualifying Pause owns the consequence. |
| Pause | 24px direct consequence across the full width, one before/after pair, 54px equivalent core choices. Decorative art is removed. Calculations follow the choices and longer support can scroll naturally. |
| Result | One explicit state symbol and confirmed, pending or failed wording. No character scene competes with the result. |
| Chat | Compact 72px introduction; active conversation removes introduction. The thread is its own scroll surface. Tools, composer and main navigation stay outside it. |

`data-sheet-treatment` on the dialog and layer distinguishes `selection`, `edit`, `detail`, `pause`, `confirmation` and `form`. `data-sheet-overflow` and measured content-height variables are diagnostic; CSS does not use the measurement to set a fixed dialog height. Content growth, open details, font enlargement and keyboard changes use the same natural body overflow. The host keeps focus, Back, Close, draft, privacy and payment safeguards intact.

Chat uses `--chat-viewport-height`, `--chat-viewport-top` and `--chat-keyboard-height` from the visual viewport. Updating these values does not rerender the composer or lose input. On a short keyboard-open viewport, the redundant page heading and introductory art give way to the conversation; the main navigation and labelled input remain. The saved-information note stays available to assistive technology. Full calculations open a focused detail sheet.

The tools region has its own viewport-relative height cap and can scroll if the student opens longer suggestions or spending controls. An active thread retains at least 6rem of readable space. The workspace itself allows overflow as an accessibility fallback, with a sticky composer, so unusually large text or short viewports cannot collapse the answer area to zero or permanently clip controls. At ordinary sizes the conversation remains the primary independent scroll surface.

Phone layouts use the full viewport width and dynamic height, with safe-area padding. Desktop retains its frame above 900px. Normal Home and form content can scroll for larger text, long names and amounts. The ordinary type sizes use rem units so text can enlarge. Navigation keeps the proven black bar, visible inactive items, lime current item, short underline, and accessible focus treatment.

The source targets 360 × 640, 390 × 844 and 412 × 915 phone layouts. Narrow/short rules reduce artwork and spare spacing, never essential text or targets. These are implementation targets, not claims of rendered fit. Source and DOM tests can verify controls, state, privacy, independent scroll hooks and declared sizes. Supported browser/device tools are unavailable, so physical keyboard behavior, font enlargement and pixel-level phone composition remain unverified until a browser/device pass is possible.

Funded Home puts Add money, Request money and Money Story in one expandable shelf. This adds one activation to those secondary tasks; primary payments stay direct. The open shelf survives task return and account-refresh rerenders. Keyboard-open task forms keep their real submit action sticky with matching scroll clearance. Unconfirmed result marks are neutral; only confirmed status gets a filled ink mark. See [current validation](COMPLETION-PASS-VALIDATION.md).
