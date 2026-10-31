# Lumo · Signal

The original Signal identity selected by the user, applied to the complete existing Monochrome prototype at https://lumo-signal.oness15.chatgpt.site. Signal has its own Site, independent lumo-signal-edition-v1 sample records and offline cache. The original Monochrome Site remains unchanged. Native financial controllers are preserved.

Signal adds the original folded-L Lux character, raised-palm Pause, rounded heavy wordmark, warm ivory / ink / acid-lime presentation and a Home with Add money, full Payments, Collect, factual contextual Chat, Money Boxes and Money Story. Bottom navigation is Home, Ask Lumo and Menu. All existing onboarding, payments, planning, savings hacks, cards, QR, IOU, All Your Money, recovery and group-collection capabilities remain in their existing controllers.

The presentation is owned by `dist/signal-edition.js`, `dist/signal-system.css` and `dist/signal-home.css`, loaded after previous edition layers and before final platform runtime. `config/platform-entry.json` is authoritative. No shared financial baseline module was changed.

Sample money, verification, biometrics, accounts and transactions remain simulations. No live banking provider is connected.

Build and verify:

```sh
node scripts/build-release.cjs
node scripts/build-release.cjs --check
node scripts/check-edition-parity.cjs --regression --sequential
```

Release review: [Signal review](docs/signal-2026-10-30/REVIEW.md).
