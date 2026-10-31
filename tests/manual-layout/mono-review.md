# Monochrome review plan

This source-only harness reviews the current Minna checkout. It does not mirror a peer or read a saved customer profile. The app is booted in isolated, synchronous, memory-only sample storage. Camera is stubbed. Native-history tests remain separate because the broad gallery uses an isolated history fixture.

## Coverage

- All 188 final registered routes, both first and returning prepared states.
- Native route gallery matrix: 320 × 568 at 100% text, 390 × 844 at 100%, and 320 × 568 at 200%. This is 1,128 rendered layouts.
- Existing stress fixture audit retains normal, empty, long amounts/names, group mandates/invitations, Savings Hacks and first/returning guidance fixtures. Its controls expose the established multi-viewport, keyboard-space, landscape, tablet, desktop and privacy matrices.
- Palette scanning examines computed foreground/background/border/outline/decoration/accent/caret/SVG colors and gradient/shadow colors, plus visible pseudo-elements. Permitted paint is achromatic or exact acid lime `#d7ff3f`, with transparent/opacity variants. Effective ancestor grayscale is recognised. Unfiltered raster/SVG image resources require visual review.
- Geometry checks retain horizontal overflow, text clipping, financial-value fragment clipping, collapsed scroll regions, unreachable or occluded actions, Home artwork collisions, Money Box action placement and required disclosure-content checks.

## Browser entry points

1. Run `node tests/manual-layout/mono-stage.cjs` in the checkout.
2. Use the approved Sites preview URL with `/__mono-gallery.html` for native optical review and the all-route first/returning sweep.
3. Use `/__mono-audit.html` for the existing stress fixture matrices plus computed palette audit.
4. Reports are visible in each page's report DOM. Full results are exposed as `window.monoSweepResults`/`window.monoSweepSummary` or `window.auditResults`/`window.auditSummary` for read-only inspection.
5. Before publication, run `node tests/manual-layout/mono-stage.cjs --clean`. No `__` QA paths should remain in `dist` or its loaded index.

## Required independent checks

- Source identity remains `appgprj_6adb132dc840819199654cb9e526ecd4`; namespace remains `lumo-minna-edition-v1`.
- Original shared product and additive-feature hashes/load order remain pinned. Edition-only final presentation adapters must be explicitly declared without reclassifying them as shared features.
- Run `node scripts/check-edition-parity.cjs --regression --sequential` after runtime source is frozen. A peer omission is reported as a skip, not a peer-equivalence pass.
- Retain real transaction totals, pending/failure recovery, PIN approval, timed Pause, collection mandate/roles, savings caps/buffers/idempotency, accessible labels, and sample-money disclosure.
- Inspect the fresh Welcome, returning Home, Plan, Chat, Pay, Cards, You, critical review/approval/Pause/result, QR Scan/My code, Money Box/hack, and group contribution/approver surfaces as complete compositions.

## Boundaries

A computed palette check does not prove every pixel in an image is monochrome. A geometry pass does not establish aesthetic quality, real camera compatibility, physical touch ergonomics or production banking security. Those limits must not be obscured by test counts.
