# Signal Home spacing and proportion · 31 October 2026

Home spread its sections across the available height with `justify-content:space-between`. This made the greeting, balance, actions and guidance feel separated. The user asked for tighter spacing and more considered proportions.

## Change

`dist/signal-ring-home.css` now uses a start-aligned stack with fixed10px main gaps. Spare height stays below the content. The greeting has a0 0 4px margin; the existing short-phone composition retains4px gaps and1px 0 2px greeting margins. This supersedes the earlier fill-height instruction that distributed spare height between sections.

On phones at least721px tall and360px wide, the identity and secondary content have slightly more weight:132px wordmark,52px header,30px greeting,104px actions,116px buddy with68px Lux and86px destination controls. The approved dark balance card, hollow ring, floor glow and all card internals are unchanged. Narrow or enlarged content keeps its existing natural scrolling and extra-row behavior.

The correction applies to both current Home and its retained parent presentation. There is no behavioral JS change. Native financial values, privacy reserves, routes, navigation nodes, full-page journeys and contextual-sheet rules remain authoritative. Monochrome and other editions are unchanged.

## Measured result at390 × 844

| Element | Before: top / height | After: top / height |
|---|---:|---:|
| Header |12 /44px |16 /52px |
| Greeting |80.2 /54.5px |78 /56.6px |
| Balance card |160.9 /229.8px |148.6 /229.8px |
| Actions |412.0 /98px |388.5 /104px |
| Lux guidance |531.2 /108px |502.5 /116px |
| Destinations |660.4 /78px |628.5 /88px |

The balance card keeps exactly the same height. Actions now follow it by10px, and guidance and destinations continue at the same10px interval. The main content reads as one group.

## Verification

The required regression gate passed **543/543 tests**, with zero failures or skipped test cases. The edition contract passed its local pinned source baseline and financial journey checks; no peer checkout was available for its separate cross-check. The JavaScript bundle remains byte-identical: `lumo-runtime.f5ce50acf959.js`.

Ten managed-browser checks covered ordinary Home at390 × 844,375 × 667 and1100 × 900, long balances shown and hidden, heavy planned costs, multiple Money Boxes, an empty account,320 × 568 with200% text and390 × 480 keyboard space. All ten had zero geometry, clipping, artwork-overlap or unreachable-content findings. Ordinary Home fits without scrolling at both phone sizes and in the desktop frame. Large or long content remains naturally scrollable. The standard390 × 844 privacy toggle kept every visible Home section's top and height exactly unchanged. See [browser-audit.json](browser-audit.json) and [regression.log](regression.log).

Actual browser captures: [before](before-home.png) and [after](after-home.png), plus the uncropped [before browser](before-browser.jpg) and [after browser](after-browser.jpg). These use isolated sample data. The browser audit is diagnostic, not a WCAG certification or proof of live provider behavior. Change fixture and viewport controls sequentially: overlapping manual changes can compound the QA harness's font scaling. The200% result was rechecked from a fresh harness, with24px navigation labels against the native12px baseline.

Final deterministic build verification passed after QA fixture cleanup. The CSS bundle is `lumo-ui.9d2d64d5b32b.css`.

Run `node scripts/build-release.cjs`, `node scripts/build-release.cjs --check` and `node scripts/check-edition-parity.cjs --regression`. Browser fixtures are memory-only; remove staged `dist/__*` files before publication.
