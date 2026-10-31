# First Money Box invitation

The active Monochrome Home now offers Create a Money Box / Put money aside for a goal when there are no nonarchived/nondeleted boxes. The whole tile opens existing native goalEdit setup. An existing zero-funded, completed or untargeted box keeps the usual total, count and boxes-list destination. Empty-state balance markup and absent savings privacy targets are omitted.

This is edition-only presentation. Shared financial engines, Savings Hacks, drafts, account state, accepted mandates and other editions are unchanged.

## Verification

- node --test tests/monochrome-design.test.cjs: 22/22 passed. Existing acceptance covers no boxes, archived/deleted-only, zero-funded existing boxes, direct creation, cancellation and privacy without changing money.
- node scripts/check-edition-parity.cjs --regression --sequential: 278/278 passed, exit 0.
- Native browser Home privacy sweep: 70 layouts, no setup errors or findings, including small phones, landscape, desktop and 200% text.
- Native 375x667 first-box tile opens Add a Money Box, with Box name and optional Savings Hack setup; Back returns to Home. The prompt remains readable with balances hidden.
- JavaScript syntax and diff checks passed. Temporary dist/__ layout fixtures removed before publication.
