# Signal lower Home reference · 31 October 2026

The user points to the pale “Lumo noticed” panel and paired Money Boxes and Money Story tiles as still differing from the supplied reference. This change is confined to that lower Home composition in Signal. The approved dark balance card, hollow hero Lux, floor glow, quick actions, compact page stack and native navigation remain unchanged.

## Reference scale and composition

The uploaded crop is 828 × 464 pixels, but includes the phone edges. Its inner app surface is approximately 786 pixels wide and its insight panel approximately 724 pixels wide. Comparing the image at its raw pixel size would overstate the intended component sizes. Scaling the 724-pixel panel to Signal's 358-pixel content width gives these approximate reference dimensions:

| Element | Reference at 358px content width |
| --- | ---: |
| Insight panel height | 114px |
| Visible small Lux diameter | 54px |
| Insight copy inset from the panel's left edge | 103px |
| Each destination tile | 174 × 76px |
| Gap between destination tiles | 10px |
| Destination icon size | 26–28px |

The previous tall-phone presentation already had a 116px insight panel and 86px destination buttons. The correction therefore changes the arrangement and missing detail rather than enlarging the entire lower stack. The new insight grid uses a 76px artwork column, 14px gaps and 12px horizontal padding, starting the copy about 102px inside the panel. Lux renders at 58px inside an 84px artwork region. Three decorative olive attention strokes sit above and to the right, with a soft radial contact shadow beneath the ring. The artwork remains outside the text column; the speech-tail decoration stays suppressed.

The pale green panel retains its 20px corners. Its green 13px “Lumo noticed” eyebrow has more weight, and the copy stack uses 5px gaps. The primary insight stays 18px with a 1.2 line height at ordinary phone sizes; supporting detail and the contextual question retain their separate native roles.

## Native information and intentional differences

The illustrative ₵40/day, Friday deadline and “on track” reassurance are not copied into the application. The panel still reads `L.monoConversation.current()` for its actual insight, detail and supported question. Its existing visibility helper masks private insight text, and its button still opens the native contextual conversation. Different saved costs, confirmed spending or savings targets can produce different wording and a taller panel than the illustration.

Money Boxes retains the actual nonarchived, nondeleted box state and savings total. Existing boxes still open `goals`; the empty state still offers “Create a Money Box” and opens `goalEdit`. The actual count remains accessible. No sample amount is substituted for the user's savings.

The savings amount now uses Home's existing compact formatter: `₵` replaces `GH₵`, zero pesewas are omitted and nonzero pesewas remain. Native formatting and rounding still own the value. Both normal synchronization and `L.refreshPrivateMoney` apply that same presentation to Home savings, so rendering, masking, revealing and refreshing converge on the same text. The static muted “saved” label is a sibling of the refreshable `#overview-savings` node, preventing amount refreshes from removing or multiplying it. Existing private-value markup and the neutral sizing reserve remain in place; raw hidden balances are not added to decorative attributes or labels.

## Paired destinations

Both tiles now carry the reference's three-level hierarchy:

| Tile | Title | Current context | Helper |
| --- | --- | --- | --- |
| Money Boxes | Money Boxes | Actual private savings amount, then muted “saved” | Save for what matters |
| Money Story | Money Story | This week, clearer | See where your money goes |

The empty Money Box state keeps its existing creation copy rather than pretending there are savings. Money Story retains its `L.openTab('moneyStoryHome')` handler.

The jar now has the reference's olive lid, black body and small lime mark. Both jar and chart symbols occupy 28 × 30px regions. The tile grids use equal icon, copy and chevron columns; copy and savings align left. The savings line wraps when necessary. Both tiles retain ivory surfaces, thin neutral borders and 18px corners. Their buttons stretch to equal tile height, with a 76px minimum normally and an 86px minimum on taller phones. The new helper text uses a smaller supporting rank; the Story helper can extend beneath the centered chevron's column without turning into another control.

## Short screens and enlarged text

The existing short-phone rules remain active at heights up to 720px: 4px section gaps, a 74px minimum insight panel, a 58px artwork column, 48px Lux, smaller decorative strokes and 64px minimum destination buttons. The eyebrow is omitted in that compact state, while native financial facts and the contextual question remain available. These are minimum heights rather than clipped fixed boxes.

At the existing relative narrow/enlarged-text container threshold, destinations become one column and artwork reduces to its own bounded column. Long amounts, native insight details, alerts, larger text and reduced keyboard space may grow and scroll naturally. No overflow hiding, line truncation or forced single-screen claim is introduced. Normal 375 × 667 and 390 × 844 layout, current and retained-parent Home, privacy states, large savings and enlarged-text behavior require final browser review.

## Verification status

The focused Signal test run passed **16/16**, and the deterministic build check passed for this candidate. The focused assertions include compact savings formatting, preservation of nonzero pesewas, private masking and repeated refresh/reveal behavior without duplicating the static “saved” label.

The prepared-page browser review covered **219 layouts across all 217 registered views**, with no setup, navigation, geometry, font-family or solid-text contrast findings. The final short-phone correction is confined to the max-height:720px rule; the 390px page sweep composition is unchanged.

Final bounded Home checks passed at **375 × 667** (view client/scroll 578/578) and **390 × 844** (746/746), with no horizontal overflow, unreachable content or text/content clipping. At **320 × 568 with 200% text**, the layout grows to a 1890px content scroll surface below its 382px viewport. The paired destinations stack and remain reachable, with no clipping or horizontal overflow. The lower enlarged-text screenshot confirms that the Story helper stays beneath the chevron. Long-savings shown/hidden checks retained the same 107.375px destination height and 35.78125px savings-line height.

The first full gate found five older savings-format expectations. The edition-aware assertions were corrected to the approved Signal compact formatting while other editions retain their previous precise display. The focused hierarchy and Signal tests then passed **40/40**, with 21 additional hierarchy script checks. The final full manifest regression gate passed **573/573**, with zero failures (145.9 seconds). The deterministic build check also passed.

Final release bundles: JS `2d3ad4058bfa6bd1ebd9a94e1de1619475da99cf0fc2bc437a94bbd788321603`; CSS `032613c842439e1642190dfa404e1bea29582b81c04ea8ba0fab46a96938b8a5`. These checks are diagnostic; they do not certify accessibility or live financial-provider behavior.

Relevant sources are `dist/signal-edition.js` and `dist/signal-ring-home.css`. Shared financial, authentication, persistence, QR and Pause engines, baseline hashes, Monochrome and other editions are outside this presentation change. Temporary browser-audit assets must be cleaned before packaging.
