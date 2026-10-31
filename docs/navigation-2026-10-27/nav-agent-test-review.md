# Three-destination navigation acceptance

Command: `node scripts/check-edition-parity.cjs --regression --sequential`

Final result: 86 files, 129 Node checks, 129 passed, zero failed. All eight local contract checks passed. Peer checkout comparison was explicitly skipped; the local approved shared-source hashes, namespace, registered views, financial journeys and approval rules passed. Input/output pins show no change during the final run in the index, JavaScript, manifest, checker or test files captured.

## New coverage

`tests/monochrome-navigation.test.cjs` adds 26 actual-index cases:

- Exactly Home, Ask Lumo and Menu on every ordinary primary surface, with correct selection and unchanged money.
- One grouped entry for each of 15 existing money, planning, account and support destinations. Each entry opens its actual destination; native task or browser Back returns safely.
- The Home body is byte-identical after a Menu/Chat/Home round trip. Its three money actions remain intact.
- Unsent Chat questions, saved answers and reading position survive Menu visits.
- Closing a Chat task restores the exact original composer and thread nodes.
- Native browser Back restores Menu and retains the unsent question.
- Card creation still requires review/approval; keeping a draft returns to Cards without funding or issuing.
- Guided Budget and contextual Chat retain their own navigation and task-return context.
- Locked and closed accounts do not expose primary navigation or Menu content.
- Help remains available in ordinary Menu; business testing tools remain conditional.

## Existing expectation changes

Changed only obsolete presentation expectations in:

- `edition-flow-navigation.test.cjs`: five direct buttons become three; grouped destinations are exercised through Menu; Menu is selected for Plan/Pay/Story/Cards/You.
- `chat-banking.test.cjs` and `chat-everyday.test.cjs`: ordinary Chat has primary navigation; active task sheets still hide it. Money, authentication, draft, history, composer and exact-node assertions remain.
- `everyday-home-hierarchy.test.cjs` and `home-hierarchy.test.cjs`: Plan is available through Menu instead of a direct bottom tab. Budget calculations, disclosure, privacy and money assertions remain.
- `experience-clarity.test.cjs`: the Menu control survives retained tasks; grouped Plan keeps its actual name, handler and destination. Original node-retention checks remain.
- `ambassador-entry.test.cjs`: the guide is selected through its stable Menu route marker. The legacy minimal fixture now parses navigation buttons and supports replacement of those nodes, matching the new retained-control presentation. All signup, consent, sample balance, feedback export and explicit reset assertions remain.
- `check-edition-parity.cjs`: only the local navigation count, ordinary Chat visibility, handlers and active-destination expectations changed. Shared-source hashes, route coverage, financial scenarios and exact retained-parent assertions are untouched.

## Findings retained and corrected

The first checker stopped on its obsolete five-button count. The first complete regression then found old labels/direct-Plan assumptions, plus a real navigation node-retention regression: the shared five-tab presenter replaced the new controls during task dismissal. Root fixed the presentation adapter to reuse its three original controls. `home-funding-state.test.cjs`'s exact retained-navigation-node assertion was left unchanged and passes.

The first new lock test also exposed a fixture setup mistake: directly toggling locked state while already on Home and asking `openTab('home')` is a deliberate no-op. The fixture now renders the lock transition first, then tests guarded navigation. No production guard changed.

Initial and intermediate logs remain alongside final evidence. These Node checks make no physical layout, camera, biometric, live-provider or production-money claim; root owns browser layout and optical validation.
