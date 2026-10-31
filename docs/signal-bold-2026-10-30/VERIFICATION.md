# Signal automated verification

Verified on 30 October 2026 against the actual scripts referenced by `dist/index.html`. Browser layout evidence is maintained separately from these functional checks.

## Required release gate

`taskset -c 0-2 node scripts/check-edition-parity.cjs --regression`

- **533 Node tests passed; 0 failed, cancelled or skipped.** Duration: 264.58 seconds. Three permitted CPUs bounded Node's parallel worker count; every manifest test ran.
- All eight local edition contract groups passed: independent identity/namespace, pinned shared engines and load order, foreign-record isolation, destination registration, authoritative financial journeys, pending/failure/retry rules, QR/authorisation boundaries, and protected Money Box withdrawals.
- Optional peer-checkout comparison was skipped because no peer checkout was available. The local approved feature baseline and financial scenarios were checked.
- Gate bundle after the Home-only proportion correction: `lumo-runtime.82ab86f1f228.js` and `lumo-ui.d48539e0b7fa.css`.

## Added adapter coverage

The six added tests in `tests/signal-edition.test.cjs` exercise the shipped adapters through the native DOM harness:

1. Installation guards and repeated native renders preserve adapter composition without duplicate characters or financial changes.
2. Nine financial/account families retain field identifiers, required consent, native inline handlers and financial facts when rendered again.
3. Mobile-money funding retains explicit wallet ownership, amount validation and its original review submission.
4. Collection choices and the functional card status icon remain separate from decorative Lux, with simulation disclosures intact.
5. Payment Pause retains its projection, reveal/read/hold hooks and a separate PIN step; early continuation cannot move money.
6. The first empty illustrated Chat opens at its greeting, then preserves draft, retained-task identity and reading position; actual new answers retain native scroll behavior.

Existing financial, authentication, privacy, timing, history and native navigation assertions remain intact. Presentation updates only replace the cropped Lux asset expectation, pin the new public shell assets, and allow Profile's decorative account mark beside its accessible title echo.

## Earlier heading-only build delta

After the CSS-only account-heading correction:

- `node scripts/build-release.cjs --check` passed, confirming the deterministic actual entry, canonical sources and public shell integrity.
- `node scripts/check-edition-parity.cjs` passed all eight local groups again, with the same optional peer-checkout skip.
- `node --test --test-concurrency=1 tests/signal-edition.test.cjs tests/platform-assets.test.cjs tests/mono-chrome-consistency.test.cjs` passed **31/31 tests**, with 0 failures, cancellations or skips.
- Heading-delta entry: `lumo-runtime.82ab86f1f228.js` and `lumo-ui.5bd3dc817c60.css`; 112 source scripts and 86 source stylesheets.

## Final Home proportion build

The bounded Home-only proportion correction was then verified by the complete 533-test gate above. `node scripts/build-release.cjs --check` also passed against the final actual entry, containing 112 source scripts and 86 source stylesheets.

- Script SHA-256: `82ab86f1f228727519f957c9732da5cacaa1642b693784af314666e5d72f6dba`.
- Stylesheet SHA-256: `d48539e0b7fa35da0be0154ccc8e27d5084725f29ac7d860802e251572ff3cc1`.

The final delta changes presentation only. JavaScript is unchanged. Layout and heading visibility require the separate browser review; these checks do not claim rendered geometry or contrast coverage.
