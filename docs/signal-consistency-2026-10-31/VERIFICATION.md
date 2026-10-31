# Signal consistency verification · 31 October 2026

The final required command was `taskset -c 0-2 node scripts/check-edition-parity.cjs --regression`.

- Exit status 0; **535/535 regression tests passed**, with zero failures, cancellations or Node-test skips, in 127.08 seconds.
- Eight local edition contracts passed. The optional external peer-checkout comparison was unavailable; the pinned shared baseline, load order, storage isolation and local financial scenarios passed.
- Final frozen bundles: `lumo-runtime.42b5aff400ce.js` and `lumo-ui.f94871d2ffe0.css`.
- JavaScript SHA256: `42b5aff400cee822ae2e41f4fc9e49372119ab131dfc3a9e83c604debdf30edd`.
- Stylesheet SHA256: `f94871d2ffe0c7289b3853536f39d9356b5444d26ee8e661d28f6110751df37a`.
- The focused Signal, navigation and Menu suites passed 72/72 in 11.81 seconds before the final CSS-only corrections. Existing exact Menu restoration assertions remain unchanged.
- One new Signal case covers root Profile navigation from Plan, Pay and Money Story, with unchanged money, retained screen/scroll, working current focus and retained navigation. The prior navigation suite's Signal-only expected destination was updated to Profile on all ordinary roots; other editions still expect their native Menu behavior.

The earlier candidate using `lumo-ui.7ed99332ae6b.css` passed 535/535 in 121.60 seconds. A subsequent browser check found that opening a task or Menu could release the hidden navigation's layout space and move the retained Home card. The final edition-only CSS preserves that space while keeping navigation hidden, inert and excluded from accessibility. The complete required gate was repeated on the final build above.

The mounted review in `mounted-route-coverage.json` covers 217 registered routes at first and returning entry: 434 prepared cases, zero renderer/runtime errors and 14 registered-renderer forwards. It uses the existing memory-only native fixtures, synchronous history and the existing inventory's fake timer shim for OTP. It records native delegation rather than forcing an older template.

That mounted harness does not evaluate CSS and does not establish browser geometry, contrast, camera compatibility or every real entry path. Its JavaScript bundle is unchanged from the final release; the evidence distinguishes the stylesheet present during the DOM scan from later CSS-only contrast and retained-layout corrections. The browser review and screenshots are recorded separately by the Site owner.
