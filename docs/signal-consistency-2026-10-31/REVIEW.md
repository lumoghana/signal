# Signal, one experience · 31 October 2026

Signal's Home had moved to a dark money card, rounded Manrope figures and a more restrained companion, while other pages retained oversized lime banners, condensed figures, rotated stamps and inconsistent navigation. This review brings the complete independent Signal edition into the same visual language.

## What changed

- Manrope UI is the real reading and monetary face, including currency. Meaningful task headings use a consistent24–28px scale, body copy14–16px, ordinary actions52px and records64–72px. Home retains its existing composition and reference-card geometry.
- Ink surfaces anchor actual financial figures. Forms, receipts and records use light surfaces; factual guidance uses pale green. Primary actions are ink, secondary actions neutral, and selected navigation uses the same lime pill across ordinary roots. Pause retains its focused dark setting and native equal-choice hierarchy.
- Welcome, setup, Chat, Profile, Help and Menu use proportionate upright Lux artwork, consistent spacing and20px panels/16px controls. Existing art assets are reused.
- Pay, funding, Collect, reviews, results, records, cards and QR follow the same hierarchy. Funding/Collect introductions are compact factual companion notes. QR data and its black/white rendering remain untouched.
- Plan, Money Boxes, Money Story, holdings and recovery share the same money-summary language. IOU amounts stay on neutral surfaces so expected repayments are distinct from available money. Native dates, Budget details, amounts and qualifiers remain visible.
- Ordinary root headers use Home's wordmark scale and Profile initial. Their Profile control opens Profile directly, matching Home. Native Chat/QR controls remain; notifications are reachable in Menu. Native sidebar closing/history/focus behavior stays intact.
- Recovery dialogs outside#app and load/offline/update notices now belong to the same design system. Supporting text, navigation labels, date controls and disclosures have stronger contrast; dark interactive panels have visible focus outlines.
- Opening a task or Menu now reserves the hidden navigation's layout space. The background page stays still. Native hidden/inert/aria-hidden states remain in place, and the task retains its own scroller.

Changes stay in the existing Signal presentation files. No new parallel style layer, financial engine, persistence path or mascot was introduced. Monochrome's independent Site, storage and source are unchanged.

## Verification

The release is built from JavaScript42b5aff400ce and CSSf94871d2ffe0. Required regression gate: **535/535 passed**, zero failures/cancellations/skips,127.08seconds. The earlier focused navigation/Signal/Menu run passed72/72. Exact Menu-restoration assertions remain unchanged. Eight local edition contracts pass; an optional separate external peer checkout was unavailable.

Mounted source coverage includes **217 registered routes × first/returning =434cases**, zero renderer/runtime errors. Fourteen native renderer forwards are classified honestly. This is mounted coverage, not a claim that a person visually examined every state. Exact records are in mounted-route-coverage.json.

The managed-browser release sweep inspected **219 prepared layouts covering all217 registered screens** at390×844, including two additional utility cases. It reported zero setup errors, horizontal overflow/unreachable-control findings, font-family/load findings or computed solid-text contrast findings. See browser-screen-audit.json. Signal's deliberate ivory/ink/pale-green colours are excluded from an obsolete strict neutral-RGB filter; visible text contrast remains checked. Hidden accessible title descendants are excluded from visible-clipping findings. These diagnostics are not WCAG certification, image/pseudo-element contrast certification or proof of live provider behavior.

Direct visual review covered Welcome, phone entry, Home, Plan, Money Boxes, Money Story, Ask Lumo, Pay, payment review, Pause, Collect, All Your Money, IOUs, late-allowance recovery, cards, Profile, Menu and save-failure recovery. Eight additional long-value/enlarged-text browser cases at320×568 and200% text reported no horizontal overflow, unreachable controls or clipping. The long payment-review entry correctly forwarded to native Pause; no older template was forced. See browser-enlarged-text.json.

Home measurements remain358×229.8125px for its card, view746/746px at390×844; at375×667 the card is347×224.828125px and view578/578px. Showing/hiding money preserves exact card bounds. In the final retained-task check, Home's card stays at x16,y160.921875,w358,h229.8125 before and underneath funding; hidden navigation remains hidden/inert/aria-hidden, and the funding view is566/566px. This corrects the observed31px background shift when hidden navigation previously released its height.

## Review images

overview.png assembles four exact phone crops from actual managed-browser renders. The individual Home, Plan, Pay and Chat PNGs contain real application text and controls, not generated mockups. The last retained-navigation CSS correction applies only while tasks cover their parent; the ordinary roots shown are unchanged. Other rendered figures are native isolated sample balances, not hardcoded visual copy.

The final change preserves all financial calculations, precise detailed amounts, privacy behavior, IOU expected-money rules, consent, mandates, authentication, Pause reveal/reading/hold timing, saving safeguards and the explicit simulated-service boundary. No camera or real payment/provider integration was exercised.

## Reproduce

Run `node tests/manual-layout/signal-experience-stage.cjs` for the memory-only managed-browser review at `/__mono-audit.html`. The underlying review framework has legacy names but loads the actual current Signal bundle. Clean with the same helper plus `--clean`, and remove every dist/__* fixture before publishing. Build with `node scripts/build-release.cjs`, verify with `--check`, and run `node scripts/check-edition-parity.cjs --regression`.
