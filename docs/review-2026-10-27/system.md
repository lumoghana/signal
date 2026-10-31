# Cross-app system review, 27 October 2026

Scope: shipped Everyday, Minna and Hibiscus style/script order, shared shell, sheets, fields, feedback, accessibility, motion and responsive behavior. This combines a source review, mounted DOM reproduction and read-only browser inspection in an isolated four-screen gallery. The parent owns whole-app visual review and publication. No application source was changed in this phase.

## Review cycle 1: current system

The build already has useful foundations. They should be retained rather than replaced by another visual system:

- Each edition has its own font, palette and control shape. The preload matches the active font in all three editions: Lumo Jakarta, Manrope UI and Inter Tight.
- Shared task sheets provide a labelled modal, inert background, focus containment, Escape dismissal, restored trigger focus and one body scroller. `task-sheet.js:194–205`, `:241–253`, `:369–384`.
- The shell preserves safe areas and lets content grow instead of cropping required actions. `native-refinement.css:3–43`, `overflow-shell.css:1–12`.
- Ordinary buttons and fields generally have useful touch dimensions: shared task actions 52/54px, normal fields 52/54px, group fields 48px, main navigation 48/52px. `ui-consistency.css:42–72`, `native-refinement.css:49–60`, `group-money.css:47–54`, `feature-flows.css:283–285` / Hibiscus `hibiscus-navigation.css:3`.
- Icons supplied by `L.icon` are decorative (`aria-hidden=true`); named controls provide the accessible action. The current QR, task chrome, Chat send and Home actions have names. `core.js:7`, `qr-floating.js:10–13`, `task-sheet.js:152`, mounted Home inspection.
- Error text has a role, invalid fields are focused, and reduced motion changes smooth error scrolling to immediate scrolling. `core.js:28`.
- Main effects respect reduced motion and put final numerical facts into the first paint. `motion.css:1–43`, `motion.js:5–17`. No animation expansion is recommended.
- The new page guidance is already deliberately selective and preserves mandatory financial/consent content. Retain its first/returning behavior.

### SYS-01 — field errors erase permanent descriptions

**Priority: P1. Confirmed in a mounted journey.**

`L.error` replaces the field's entire `aria-describedby` value with `error`, and both the root and sheet input listeners later remove the entire attribute. This disconnects permanent meaning from fields after their first validation error.

Evidence:

- `core.js:28` sets `aria-describedby='error'`.
- `core.js:75` removes all descriptions on input.
- `task-sheet.js:204` does the same in a task.
- `app.js:22` deliberately associates `essAmount` with `essential-total-help` (whole-period amount, not a daily amount).
- `plan-setup.js:225` associates the first Budget amount with `first-cost-period-help`.
- `money-box-protection-ui.js:37` associates the partner phone with `goalPartnerHint`.

Mounted production-script reproduction using `tests/helpers/task-sheet-dom.cjs`:

| Moment | `essAmount` description tokens |
| --- | --- |
| Open `essentialEdit` | `essential-total-help` |
| Call `L.error(..., 'essAmount')` | `error` |
| Input correction | absent |

Proposed fix: preserve existing description tokens, append `error` once, and remove only that token when clearing invalid state. Apply the same rule in the root and sheet listeners. Preserve focus, visible error text and all existing validation/business checks.

Acceptance: repeat the error/correction cycle twice in ordinary and task forms; the original hint remains associated, error is not duplicated, and financial state is unchanged.

### SYS-02 — common header targets are smaller than the app's mobile target goal

**Priority: P2 design/comfort improvement, not a blanket WCAG AA failure.**

The ordinary task buttons use a 44px minimum, while the primary utilities are explicitly reduced:

- Actual mounted Everyday Home contains `.icon-btn` Updates and `.avatar` You; `everyday-home.css:7` sets both to 36×36px.
- `page-chrome.css:13` sets the Chat entry to 40×40px with `!important`.
- `qr-floating.css:2` sets QR to 40×40px. `:6–7` sets the QR sheet grid/icon widths to 40px.
- `everyday-home.css:18` sets the eye to 40px, then `:99` reduces it to 36px in short windows.
- `minna-home.css:42` sets Home icons to 40px on shorter phones.
- `everyday-home.css:31` gives payment-in-progress/shortfall controls only a 30px minimum; `:106–115` reduces other recurring actions on short screens to 34/40px.

Proposed fix: a consistent 44px minimum hit area for these repeated standalone controls, with unchanged 18–22px glyphs. The source shows a real inconsistency with the rest of Lumo; the benefit is more comfortable repeat use.

Acceptance: verify actual bounding boxes, adjacent target spacing, named actions and no overlap at 320px. A 40px control is not automatically a WCAG 2.5.8 failure: the AA minimum is 24 CSS px with exceptions. Our 44px web goal is an app design choice informed by mobile guidance.

### SYS-03 — Hibiscus active field boundaries are too faint

**Priority: P1 clarity/accessibility improvement; confirmed final computed colors in the browser.**

Hibiscus makes ordinary text readable but uses very faint input boundaries:

- `hibiscus-system.css:19–20`: `--line2:#ddd3da`, `--control-line:#c6b7c9`.
- `hibiscus-system.css:156–160`: active inputs/selects/textareas have `border:1px solid var(--line2)` on `--card:#fffdfe`.
- `hibiscus-flows.css:130–133`: phone/OTP use the same faint border with `!important`.
- `hibiscus-flows.css:208`: setup fields also force this boundary.
- `group-money.css:51` uses `--control-line` for group fields.

Calculated from source colors using WCAG relative luminance (not rounded to decide pass):

| Foreground | Adjacent surface | Ratio |
| --- | --- | --- |
| Field `#ddd3da` | Card `#fffdfe` | 1.439:1 |
| Field `#ddd3da` | Page `#f8f5f7` | 1.346:1 |
| Group control `#c6b7c9` | Card `#fffdfe` | 1.882:1 |
| Muted text `#76657c` | Page `#f8f5f7` | 4.944:1 |

A field with little fill contrast relies on its boundary to show where entry is possible. WCAG 1.4.11 requires 3:1 for visual information required to identify a control or state; it does not require every decorative divider or text-button border to reach 3:1.

Proposed fix: a targeted active-field boundary color, keeping the plum family. A candidate `#927e98` produces 3.427:1 against the page, 3.663:1 against the card, and 3.151:1 against the sunken surface. Confirm in context. Keep dividers/card outlines light; preserve invalid/focus colors and intentional borderless amount entry.

### SYS-04 — important secondary text is unevenly scaled across features

**Priority: P2 readability improvement, not a WCAG minimum-font-size finding.**

Shared field labels target 14px through `--ui-label` (`ui-consistency.css:8`, `:62–67`), but late feature rules make comparable tasks visibly different:

- Group field labels 12px, member/role metadata 11px, mandate explanation paragraphs 12px: `group-money.css:50`, `:62`, `:93`, `:116–144`.
- Savings instruction consent is 12px: `savings-hacks.css:7`.
- Savings history dates and prototype note are 11px: `savings-hacks.css:5`, `:10`.
- Short-height Home rules reduce account context to 10px and some Minna savings context to 9px: `everyday-home.css:98–115`, `minna-home.css:33–38`; later shared Home support rules restore several, but the source still contains shrinking behavior to test.
- Main live Budget meaning is 12px through `experience-clarity.css:28–37`; the requirement is meaningful supporting text rather than decorative copy.

Proposed finish scale: 16px entry text; 14px labels, consent and important explanatory text; 12–13px genuinely secondary captions. Keep the current edition typefaces and primary money hierarchy. Improve density through spacing/structure and the existing disclosures, not by reducing important text to fit a short phone.

Acceptance: compare the same form roles across Money Boxes, groups, Cards and account settings in all three editions; review 320px and 200% text, with one vertical scroll surface when needed. Do not add a universal `p`, `small` or `button` font override.

### SYS-05 — the existing enlargement matrix stops at 150%

**Priority: P1 verification gap, not proof of a present rendering failure.**

The retained audit matrix explicitly includes `[320,568,1.5]` but not a 200% text case. See `tests/manual-layout/overflow-audit.html:1`, `overflow-audit.js:155`. The past 150% checks should not be described as evidence of WCAG 1.4.4, which requires content/functionality at up to 200% resizing.

Proposed verification: add a 200% text setting and run the critical forms, approvals, current money values, first/returning guidance, long labels and navigation. Also test actual keyboard focus paths through sticky content. Existing scroll-padding and sheet focus containment provide a strong starting point; do not assume geometry-only tests prove focus visibility.

## Review cycle 2: challenge and scope gate

The proposed system changes were challenged against brand, first-use clarity, repeat speed and regression risk:

1. **Keep edition fonts and the existing palette.** All three font preloads are correct. A font replacement would create churn rather than solve these findings.
2. **Keep existing muted text.** Everyday `#53614b` against its paper is 6.243:1; Hibiscus muted is 4.944:1. Do not darken all subdued text or flatten the premium hierarchy to fix active field boundaries.
3. **44px cannot be applied without a width check.** At 320px with 22px gutters, the Home content width is 276px. An 86px wordmark plus four 44px targets and current gaps can exceed it. Reduce action-group gaps to 2px at that width or use an equivalent intentional header arrangement; do not squeeze labels or change the user-approved header order.
4. **Do not enlarge the icon artwork.** Grow hit areas while keeping recognizable glyph size and the current Chat/QR symbols.
5. **Do not globally darken `--line2`.** It is also used for decorative separation and progress backgrounds. Target actual fields and the phone/code field containers. Preserve amount rows, invalid red and focus treatment.
6. **Do not claim that `outline:none` alone is a focus failure.** Minna Chat deliberately shows a focus-within outline around the composer: `chat-banking.css:137–147`, `minna-edition.css:132–136`. A second input outline is unnecessary.
7. **Do not rewrite the modal shell.** It already has inert backgrounds, named chrome, focus restoration and a native body scroller. Keep and test it instead.
8. **Do not add more motion as a polish layer.** Existing restrained feedback and reduced-motion behavior are appropriate for financial decisions.
9. **Do not collapse mandatory meaning.** Consent, current source of funds, recipient/fees, warnings, partner/mandate approval and sample boundaries remain readable even for returning users.

## Visual review cycle 2: confirm, challenge, narrow

Inspected actual mounted screens at a native 375×667 CSS viewport in all three editions. Four-across gallery capture scales the phone panels to 0.8 only for display; the following sizes and computed colors are read from the native iframe DOM. Payment screenshots include Add money, authorisation, bank receiving details and airtime entry. Primary screenshots include Home, Money Story and milestones. Onboarding screenshots compare university, PIN, privacy and the privacy notice in each edition.

### SYS-06 — duplicated legacy navigation below sheet chrome

**Priority: P1. Confirmed visually across domains by the parent; centralized fix recommended.**

Story transaction category, allowance and Budget-item editing can show another Back / LUMO / Help row beneath the task sheet’s own Back / title / Help / QR / Close header. This wastes roughly one utility row and gives two competing ways to go back. The source suppression in `task-sheet.css:171–174` covers a few shallow nesting patterns, so deeper wrappers survive.

`core.js:23` generates the legacy header row as `.topline`, with direct buttons labelled `Go back` and `Get help`, then a separate `.page-heading`. Equivalent navigation rows appear in payments, product accounts, onboarding and focus helpers. Functional `.topline` rows also exist inside device cards and the merchant sales summary (`account.js:73`, `:84`), so a blanket descendant `.topline` rule would hide useful content.

Proposed exact scope: inside `.task-sheet-body` only, hide `.topline` rows that contain both direct `button[aria-label="Go back"]` and `button[aria-label="Get help"]`. Keep the sibling page heading, all body explanations, functional toolbars and onboarding headers outside a task. The application already depends on CSS `:has()` for layout. This can be a shared final presentation rule; no routing or business changes are needed.

Acceptance: Story category, allowance, Budget-item editing, nested Money Box transfer forms and account details have one visible task chrome; headings and device/merchant rows remain. Keyboard focus must skip the hidden duplicate controls, while native Back, Help and Close remain usable.

### SYS-07 — QR wraps beneath onboarding headers

**Priority: P1 visible layout defect. Confirmed in Everyday first/returning by onboarding reviewer, also visible on the privacy notice during this system review.**

`native-refinement.css:344–345` gives `.onboarding-page>.topline` a three-column grid for Back / label / Help. `qr-floating.js:19`, `:35` uses that same row as the eligible QR host, adds `.has-qr-corner` and appends a fourth child. Application correction/status, signed-in privacy notice and saved campus interest therefore put QR on a second row under Back.

Proposed fix: target only `.onboarding-page>.topline.has-qr-corner` with four explicit columns, `44px minmax(0,1fr) 44px 44px`. Keep recognizable glyphs, allow the central context label to wrap, and use smaller gaps on narrow phones. Onboarding screens excluded from QR keep their existing three-column layout.

### SYS-08 — inline consent checkbox grows into a separate row

**Priority: P1 comprehension defect. Confirmed by payments reviewer in Everyday and Minna mobile-money funding.**

The ownership label is an inline checkbox followed by `This wallet is registered to me.` (`payments.js:341`). `ui-consistency.css:205–206` enables wrapping on every `.inline` and gives all direct inputs a flexible 9rem basis, including checkboxes. The control consumes a row; the explanation falls below it, breaking the visual relationship.

Proposed semantic finish: for `label.inline` containing a direct checkbox or radio, use a non-wrapping flex row with top-aligned 20px non-growing control, wrapping caption and at least 44px total row height. Keep the label clickable, consent text and validation unchanged. Do not change ordinary inline text/date/amount fields. This belongs in the shared system finish rather than a payment-only workaround.

### SYS-09 — identical visible body headings repeat native task titles

**Priority: P2 hierarchy/space improvement. Evaluation only, pending implementation gate.**

The current Add money sheet shows `Add money` in its permanently visible task chrome and `Add money.` again as a large body heading. The same exact echo is visible on group collection/approver setup and was confirmed by the parent on Money Box editing. Task chrome is an `h2` labelled dialog title (`task-sheet.js:199`); its current title is established centrally in `chrome()` (`:132–145`) after each task render (`:307–310`).

A mounted sweep of the shipped script sequence and all first-visit prepared routes found 47 title/`h1` text matches after case/whitespace/trailing punctuation normalization. Forty-six matches are ordinary `.page-heading>h1` page titles; the remaining match is the requests hero. Useful distinct headings remain: `Bank receiving details` / `Add from your bank`, `Your Money Box` / `Laptop`, `Balance details` / `Two accounts. Clear roles.`, and `Your money story` / `Where did it go?`.

Recommendation: keep one visible task title when its first body `.page-heading>h1` is an exact normalized echo. Mark only that heading as visually hidden while retaining the `h1` for assistive navigation. Preserve its subtitle, illustration, entity names and all legal/financial content. Remove the wrapper’s margin only when the hidden heading is its sole child. Do not hide other `h1` elements or headings outside a native sheet. The requests hero can remain until explicitly included; an overly broad hero rule would increase risk without solving the main issue. If the renderer focused the echo, move entry focus to the visible labelled native title, without scrolling the retained parent.

Apple’s current [toolbar guidance](https://developer.apple.com/design/human-interface-guidelines/toolbars) describes a large title transitioning to a standard title as scrolling starts. Its [UIKit sample](https://developer.apple.com/documentation/uikit/customizing-your-app-s-navigation-bar) describes the title moving into the navigation bar. These are not a reason to keep two permanently visible identical titles. A new collapsing-title animation would add complexity and is unnecessary for these short task sheets. The above is a contextual design inference, not an accessibility requirement.

Acceptance: Add money, Budget item editing, Money Box editing and group setup have one visible task title; a body `h1` still exists and is available to assistive technology; unique/descriptive headings, subtitles, entity names and illustrations remain. Standalone onboarding and primary pages remain unchanged.

### SYS-10 — selected Hibiscus approver names disappear

**Priority: P1. Confirmed in actual browser and computed DOM, planning page group 25–28.**

On `groupMoneyApprovers`, selected contacts have the theme’s dark plum background `#4a1d4f`, but `.gm-person-copy strong` remains exactly `#4a1d4f` (1:1 contrast) and role captions remain `#76657c`. The parent button computes to white text, but explicit descendant colors defeat inheritance. The result is a selected list of blank names, making financial approver selection difficult to verify. Unselected names and Everyday/Minna’s light selected rows remain readable.

Source: Hibiscus `hibiscus-system.css:143–145` applies the dark selected treatment; shared `group-money.css:61–62` sets name/role type, including explicit muted role text, while Hibiscus heading/strong rules set plum.

Proposed fix: scope to Hibiscus `.gm-contact.selected .gm-person-copy :is(strong,small)` and use the on-ink color. Keep dark plum selection, check indicators, avatar circles, role wording and all approval logic. This also protects selected contacts on the other group selection screens. Do not change all selected descendants globally.

Acceptance: selected names and roles remain readable in the full set of group person/approver selectors, selection checks still distinguish states, and unselected plus disabled contacts preserve their existing appearance.

### Computed browser evidence

| Screen / control | Final computed observation | Decision |
| --- | --- | --- |
| Everyday Home Updates / You | 36×36px | Increase hit area to 44px; retain glyph and header order. |
| Everyday Home Chat / QR / eye | 40×40px | Same 44px design target. |
| Minna Home Updates / You / Chat / QR / eye | 40×40px at 375×667 | Same target; preserve monochrome treatment. |
| Hibiscus header Notifications / You | 44px high; Chat and eye 40px | Preserve existing comfortable controls, align remaining standalone utilities. |
| Everyday Home budget-details row | 38px high, 12px text | Increase to 44px without changing destination or balance geometry. |
| Ordinary Home quick actions | 44px high | Retain; no general increase needed. |
| Hibiscus university / email | 16px entry; #fffdfe fill, #c6b7c9 border | Entry size works; boundary needs targeted contrast improvement. |
| Hibiscus PIN / authorisation PIN | 24px entry; #fffdfe fill, #ddd3da border | Preserve special PIN type size; improve border only. |
| Hibiscus payment authorisation | Primary pay action 50px, biometrics 54px, Back to review 44px; meaningful balance/consequence still visible | Retain control hierarchy and the labelled demo boundary. |
| Main navigation | Everyday 77px hit area, Hibiscus 48px in current viewport; 11px captions | Targets already comfortable. Keep captions and brand shapes. |
| Everyday collection setup | Labels12px; mandatory source-of-funds `.gm-note`12px/17.4px line | Confirmed uneven important-text scale; target14px labels/meaning, keep true metadata quieter. |

The three typefaces and financial hierarchy still work together within their editions. The visual audit supports targeted cleanup, not a new font or another global spacing system. The Money Story chart, visible numeric totals and distinct active tabs give a useful scan order.

### Brand/history challenge resolved

An initial concern about the visible Hibiscus Home illustration was **rejected** after the parent checked the exact prior conversation. The 25 October request was interpreted and shipped as restoring the missing Home illustration, including wide and hidden balances. Preserve the current Home figure and its geometry. The product’s constraint is one illustration per screen, with relevant payment art and simple icons in Pay menus. Everyday keeps its confirmed green accent and campus artwork; Minna keeps its own monochrome composition.

### 200% verification fixture

The inventory agent has now added 100%, 150% and 200% text settings to the gallery and a 320×568 / 200% setting to the retained manual audit. Initial gallery observations exposed a fixture race: applying enlargement while a new route rendered doubled some elements twice (campus heading 108px instead of 54px). This was reported as test tooling, not a product defect. Resetting to 100% and applying after stable rendering gave the expected 27→54px and 30→60px headings. The agent then added generation snapshots, disabled controls during rendering and guarded each asynchronous step. Only the stable generation-labelled results should count as evidence. A larger caption in an early race-affected screenshot is not an app overflow finding. After the fix, Minna university/PIN/privacy/notice at generation 4/5 show 200% text with 375px document width and 375px scroll width. Bottom-of-page review keeps Continue, Save and leave and Back reachable. In the privacy sheet, keyboard Tab from native Help reaches QR with a visible outline at y=27px, inside the visible chrome. This is representative evidence, not a claim of whole-app conformance.

## Implementation checkpoint

Phase 3 implemented in Everyday’s owned files only, with the parent/inventory agent integrating the final stylesheet and script after page guidance. `core.js` now appends the error description token and exposes a shared error-clear helper; both ordinary and task input listeners remove only that token. `product-finish.js` handles exact duplicate navigation and task-title presentation. It exempts entity/receipt/report routes even when a user-owned name coincidentally matches the generic title. It retains the semantic h1 and transfers initial focus to the visible native task title.

`product-finish.css` supplies the bounded utility/field/consent/profile/selected-contact corrections above. Home’s eye, primary amount and artwork retain their geometry. The savings amount gets a full-width grid row in both privacy states; it is not shrunk to fit. Extra 200% findings supplied by the parent are handled by ordinary name wrapping, intrinsic label/value wrapping, and an em-based Hibiscus account grid that uses one column when text is enlarged. No financial value, approval rule or stored instruction changes.

Focused mounted validation ran serially through the inventory agent against the actual shipped index: `node --test tests/product-finish.test.cjs` — **5 passed, 0 failed** on the final neutral-reservation source. The fifth case checks the reservation and its lack of DOM number text. This covers real partner-phone validation and permanent hints in ordinary/task forms, error-token correction, duplicate-title semantics/focus/idempotency, preserved art/subtitle/money, entity-name collision, and retained functional device rows. Syntax and whitespace checks pass. Browser geometry and cross-edition mirroring remain separate gates owned by the parent.

## Final privacy blocker and cause-based correction

The parent’s separate shown/hidden 200% fixtures exposed a real limit beyond the earlier live-gallery scaling caveat. The primary amount’s fixed 1.25/2.5em minimum reserved fewer lines than the enlarged currency / whole / cents formatter needed. For example, Everyday long values at 320px had 64px amount text, 80px line height, 160px minimum but 240px shown height; the hidden mask used 160px. This shifted later cards/actions by 80px. Across the three editions the long/heavy fixtures differed by 80–160px. Separately, empty Home’s `Money available now` caption retained nowrap and clipped at 320px/200%. The assertions were retained.

The finishing layer now overlays a neutral reservation formatter in the primary amount’s grid cell. It uses empty, aria-hidden spans and static CSS-generated zero glyphs, with the same currency/whole/cents styles and tabular numerals. Existing ordinary/wide/huge classes choose conservative neutral digit buckets; no actual amount is read, copied or kept in hidden DOM text or attributes. The reservation wraps intrinsically with the available width and the actual enlarged parent type. Both privacy states therefore reserve the same neutral line box, while the existing formatter/mask remains authoritative. Normal ordinary type fits one line and keeps the existing density. The empty caption may wrap normally.

The parent owns the final full geometry, 200% and privacy sweep evidence. The last pre-reservation normal 375×667 visual pass confirmed savings heights of 118.11px Everyday, 115.33px Minna and 118.11px Hibiscus; all quick actions fit and retained Home uses the same savings grid. Hibiscus selected approver names/roles, common profile values, input boundaries and four-child onboarding headers were independently visually confirmed by the domain reviewers.

## Suggested implementation boundary

- Behavior: `core.js` and `task-sheet.js` for description-token preservation only, backed by mounted form tests.
- Presentation: one narrowly scoped finishing stylesheet loaded after current presentation layers, or small approved changes in `qr-floating.css`, `page-chrome.css`, Home header rules and Hibiscus field styles. Keep control geometry identical between visible/hidden balances.
- Typography: exact feature selectors for labels/consent/mandate text; avoid universal minimum font rules.
- Verification: retained manual layout source for 200% enlargement, bounding-box targets, focus visibility and the existing financial/privacy regression suite. The parent owns browser inspection and publication.

No unverified claim of WCAG conformance, user-research success or award quality follows from this source audit.

## Primary references checked

- [WCAG 2.2, normative specification](https://www.w3.org/TR/WCAG22/): 2.5.8 minimum pointer target is 24 CSS px with exceptions; 1.4.4 requires resizing to 200%; 2.4.11 concerns focused components not being wholly obscured by author content.
- [W3C target-size explanation](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- [W3C non-text contrast explanation](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html): 3:1 applies where visual information is needed to identify controls/states, not every divider.
- [W3C text contrast explanation](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): 4.5:1 normal text; 3:1 qualifying large text.
- [W3C focus-not-obscured explanation](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html).
- [W3C error-identification explanation](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html).
- [Apple UI Design Dos and Don'ts](https://developer.apple.com/design/tips/): official 44×44pt touch-target recommendation, sufficient contrast, legible text and alignment. Native points are not a WCAG web unit; Lumo's 44 CSS px goal is a deliberate design target.
- [Material accessibility structure](https://m3.material.io/foundations/designing/structure): official search excerpt recommends considering 48×48dp targets for most platforms. Its full page requires JavaScript in the retrieval tool, so no further detail from it is relied upon.


## Final system sign-off

Final finishing source: JS `f23b8e65586393d34fbd8c8107795a6ab3b1c931bd0a4bee474ee25f85df103d`, CSS `ba01a58da3a6b128de99d8d1e1d4a8fac4e526267cdd10eb803cef7102a667b4`. The parent reports the dedicated privacy sweep passed all three editions: 60 layouts each, no findings/setup errors, 20/20 shown/hidden comparisons stable including 320/390px at 200%. The empty caption wraps.

Fresh actual-browser 375×667 / 100% inspection on that source confirms unchanged ordinary operational-card density and a 50px neutral reservation in all three themes:

| Edition | Operational card | Savings button | Quick actions end | Visible boundary |
| --- | --- | --- | --- | --- |
| Everyday | 280.31px | 118.11px | 553.22px | View bottom553.75px |
| Minna | 278.30px | 115.33px | 547.44px | View bottom553.16px |
| Hibiscus | 280.31px | 118.11px | 556.86px | Floating navigation begins580.02px |

Both 44px quick actions are fully visible. Fonts, artwork and edition accents remain. The retained Home beneath conversation history has the same 50px reservation and savings grid/card height. Independent domain reviewers confirmed the selected Hibiscus approver names/roles, stronger field boundaries, wider profile values and single-row onboarding QR headers. No further application source edits were made after this sign-off.
