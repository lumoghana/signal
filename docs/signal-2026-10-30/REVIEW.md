# Signal presentation review · 30 October 2026

User direction: apply original Signal's UI/UX, Lux identity and personality to every existing Monochrome prototype capability, using the supplied existing Site. This is an edition-specific presentation change. The hosting project and existing audience are preserved.

## Implementation

- New final Signal adapter and two scoped stylesheets, with original Signal wordmark and transparent 3D Lux assets.
- Original money-first Home composition, native actual balances, privacy-aware planned costs, full Payments action, native Collect, truthful existing contextual Chat, paired savings/Story destinations.
- Home / Ask Lumo / Menu, using retained native navigation nodes and unchanged task/focus/history controllers.
- Signal surfaces/type/controls across setup, Chat, Pay, Plan, savings, cards, QR, group collections, personal IOUs, All Your Money and late-allowance recovery.
- Raised-palm Lux on all Pause entries. Native reveal, reading minimum, hold, review, cancellation and separate PIN/biometric demonstration retained.
- Manifest and explicit public-only offline cache include Signal identity. No new account data or provider integration.

## Verification

The full required `node scripts/check-edition-parity.cjs --regression --sequential` run passed526 Node-reported tests, with zero failures, plus eight local source-contract groups. Optional peer comparison was skipped because no peer checkout exists; shared baseline source hashes remain unchanged. New Signal regressions verify actual monetary facts, planned-cost privacy/refresh, expected-income exclusion, full Payments, retained nav, Story Back/Forward and money-life tasks. Final public-shell identity-cache test and deterministic build/registry checks were also run after manifest/cache finalisation.

Browser review used the managed Sites preview and actual bundled entry. Normal Home fits375×667 and390×844. At375×667, view clientHeight and scrollHeight both586; Home height547.984375 stays identical with money shown/hidden. At200% text the page grows vertically and controls remain reachable without horizontal page overflow; support columns and lower tiles stack by relative container query.

Hands-on browser journeys: Home Pay to all three Payments tabs; Lumo recipient/amount entry; real budget-gap Pause; short click retaining Pause and deliberate hold reaching separate PIN; unfinished-payment leave confirmation; Menu; All Your Money; IOU records/details; recovery plan; Welcome and sample Pause; sign-in returning to hidden Home; QR Scan/My code. Camera capture is unavailable in this cloud browser; the existing explicit image/manual-code fallback and personal QR remain available. Native camera/biometric behaviour and real financial services are not validated by this prototype.

## Preserved boundaries

Incoming IOUs, expected allowance and pending incoming remain outside available funds and costs. Money Boxes count once and remain separate. Native repayment settlement, receipt linking, recovery coverage, optional savings pause/resumption, group mandates and exact-rail approval stay unchanged. Sample-money disclosures remain visible. No financial baseline or existing account namespace was replaced.


## Separation correction

Signal is now a separate Site at https://lumo-signal.oness15.chatgpt.site. It uses lumo-signal-edition-v1 for records, offline cache and the native single-writer lock. No Monochrome records are imported. Monochrome was restored to exact saved version12 at its original link. Source runtime classes stay compatible. Independent identity/storage contracts and affected financial/privacy tests were rerun after separation.
