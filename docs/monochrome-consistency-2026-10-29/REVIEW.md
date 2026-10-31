# Monochrome consistency review

Scope: the Monochrome prototype itself, following the user’s observation about Home number styling and black card surfaces. Everyday, Hibiscus and invitation media are outside this change. The review uses current hosted version7 and its exact source as the baseline.

## Findings and corrections

The measured UI family was already Manrope UI on Home, Plan, payments and Money Story. It was inaccurate to infer that Home used a different font family. The real drift was role weight and numeric settings:Home primary500 and Story500, Plan/payment review550, some supporting/group records550/600/650; Plan’s Money Boxes amount and Home supporting amounts inherited normal numeric variants.

The final edition-owned type layer keeps the established family, cedi fallback, sizes, spacing and decimal/currency scale. Lead financial figures use medium500, supporting account balances500, dense records600; targeted monetary roles use lining/tabular numbers. PIN/OTP/PAN spacing, chart labels, ordinary prose and the exact SVG wordmark/avatar retain their established treatment.

Intentional dark financial/focus anchors stay distinct from white working cards and softer supporting context. The review does not convert all cards to black. Two new shared-feature surfaces missed the earlier Mono styling:the payout source panel used an undefined surface token/transparent white fallback, and contribution result symbols missed the native neutral circular status treatment. The final edition-only surface layer gives these their established white-source and neutral/lime-confirmed roles.

Contextual payout and contribution bodies had specific wording while the native sheet toolbar still said generic payment. A bounded presentation adapter updates the displayed native toolbar/close names for those flows while retaining native route registration, family, treatment, history, focus and authentication. Only exact redundant static Profile/Money Boxes body titles receive the existing accessible title-echo treatment; named entities remain visible.

## Verification

The source-owned memory-only audit checks registered pages and high-use/long/short/enlarged variants using actual renderers. It reports font loading/families, numeric roles, surface colours, solid-background contrast, palette, geometry and reachability, plus intentional delegation and guarded tester routes. Image/pseudo-element backgrounds remain a separate visual inspection responsibility. Financial rules are unchanged and the existing cross-edition source/financial gate remains required. Final result counts are recorded below after the last verification.

The normal-text contrast audit found the repeated prototype footer and Welcome preview note at4.35:1 (#767676 on #fafafa). Both now use the established muted ink (#6c6c6c), exceeding4.5:1. The initial page pass had0font-family/font-load/geometry failures; stale legacy/new-rail QA setup was updated separately, and current rail/member/menu/tester contexts now have explicit actual-render coverage. These were fixture corrections, not changes to customer financial rules.

Final page pass:196layouts covering194registeredstandardroutes plus explicitPauseDemo/PauseLog tester contexts. Missing registered routes0; setup/render/font-loading/font-family/geometry/solid-background-contrast findings0. Expected native delegation is reported separately:MoneyBox review aliases, sidebar composition and ordinary tester guards.

The first486-layout responsive stress pass found one existing reachability issue:expanded Chat tools at320×568 with200%text retained a non-shrinking tools panel after the thread had shrunk, clipping the composer. An edition-only rule now lets the existing tools scroller shrink to its established44px minimum while preserving the header/composer and normal closed-tool layout. Final responsive retest follows.

Final responsive retest:486layouts across81critical/long/current-payout/tester scenarios and6narrow/short/landscape/enlarged configurations. Setup/font-loading/font-family/palette/solid-contrast/geometry/reachability findings0. The formerly clipped expanded Chat case also passed a separate targeted320×568200%check with the existing tools scroller at44px and composer fully reachable.

Required regression gate:367/367 passed,0failed; the final edition/source/financial parity gate also passed after the final CSS pin. The new mounted task-chrome suite has10actual-controller cases, including strict comparison with an adapter-free journey for native Back/depth/family/treatment/parent, preserving ordinary payments, Money Box transfers and financial state.

Home privacy retest:70layouts across7Home states and10phone/landscape/tablet/desktop/text-size configurations,0findings.20explicitshown/hidden comparison pairs are stable within1px;0privacy shifts,0artwork overlap,0text clipping and0unreachable controls. The changed monetary type treatment preserves the existing privacy sizing mechanism.

Focused coverage of the changed contribution surfaces and longer Chat transcripts exposed two further320px200%Chat clipping states. The final fixed-height Chat workspace now permits vertical scrolling only when its intrinsic content exceeds available space; the existing landscape one-surface fallback is respected. The thread/tools retain their scroll areas, open tools shrink first and fonts/content are not reduced or removed. The following114-case focused rerun validates this final containment rule.

Final focused feature retest:114layouts across19current-contribution/result/receipt/long-Chat scenarios and6narrow/short/landscape/200%configurations.0setup/render/font-loading/font-family/solid-contrast/geometry/reachability findings. Both formerly clipped long Chat states pass after the final containment fallback.

Review coverage totals866layout configurations:196page/tester views +486responsive critical/current-rail variants +70Home privacy configurations +114focused contribution/longChat configurations. All observed findings were corrected and their affected cases rechecked with0remaining findings. Normal-task/financial/source parity gate passed after the last pinned CSS edit; Everyday and Hibiscus checkouts are unchanged. Final publication removes alltemporary dist QA assets.
