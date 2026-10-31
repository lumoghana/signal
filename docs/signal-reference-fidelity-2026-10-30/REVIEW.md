# Signal reference fidelity correction

The user identified two specific differences from the approved reference: missing lighting beneath the main ring and a compressed composition leaving unused space above navigation. This update changes only `dist/signal-ring-home.css`, plus deterministic generated CSS/asset metadata. The exact behavioral JS bundle and character assets are unchanged. No financial, privacy, authentication, timing or Monochrome source is modified.

## What changed

The outer `.screen-home` already filled the available view, but its inner `.signal-home` stopped at its content height. The outer screen is now a flex column and Home grows into the available space, distributing spare vertical room between its content groups. Content is never clipped to obtain this fit.

Scale was compared with the supplied 590 by 1280 reference. At390 pixels wide its action tiles correspond to about99 pixels, its insight to112 pixels, its main ring to111 pixels, and its group gaps to13 pixels. The corrected ordinary composition uses98px action tiles, a108px ring/stage, a naturally growing insight with18px lead text, and12px minimum gaps. The existing native budget/date footer remains inside the money card.

Two decorative, non-interactive lime ellipses now light the floor beneath Lux. The main card has restrained stage lighting, and the unchanged ring image has a slight perspective/rotation and contact shadow. The glow is below the ring rather than an all-around face halo. The actual image file is not altered.

Greeting supporting text and action helpers are more readable. Short phones now retain those helper lines with a coordinated smaller composition rather than hiding them. Narrow/enlarged containers keep natural wrapping and vertical scrolling. Larger facts, warnings, notices and long names are permitted to grow.

## Browser verification

`home.png` is an exact crop of the final actual app in the cloud browser, using isolated memory-only sample state. It is not a generated mockup. The original screenshot was 1363 by 936; the 390 by 844 phone iframe was at x486.5/y48. The integer crop is x486/y48 to x877/y892.

- 390 by844 ordinary Home: document width390, view client/scroll746/746. Inner Home is726.40625px high, and destinations end at y738.40625. They previously ended at y671.71875, leaving about67px more unused space.
- 375 by667 ordinary Home: document width375, view client/scroll578/578, destinations end at y574.40625. Greeting and action helper lines remain visible.
- 375 by667 GH₵3,000 room: shown and hidden primary bounds remain x28/y168.03125,235 by55.796875. The same76px artwork slot and glow remain separate from money; its transformed visible bounds are approximately82 by85px.
- 320-pixel phone at200% text: document width320, no horizontally out-of-bounds visible elements; natural vertical scrolling remains available, view client/scroll600/2035.
- The retained Home behind native Add money keeps a108 by108px ring slot, confirming current/retained selectors remain aligned.

The source-owned local review fixture uses memory-only sample storage and never customer records. Every temporary `dist/__*` fixture is removed before packaging.

## Automated verification

The full required regression manifest ran with 531/533 successful results. Two plain-file suites aborted at their canonical stylesheet integrity check while CSS was being saved/rebuilt for an observed fit correction; no financial assertion failed. Both complete affected Savings Hack suites were then rerun against the frozen final build and passed 2/2, including all internal UI assertions. This is recorded as a full-manifest run plus clean affected-suite reruns, not as a single clean 533/533 command.

The final cleaned-tree focused tests, contracts and deterministic build check are recorded below after completion.

Final cleaned-tree results: 31/31 focused Signal/assets/title checks passed (16.35 seconds), all eight local edition contracts passed, and deterministic `build-release --check` plus `git diff --check` passed. No `dist/__*` fixture remains. The optional external peer checkout was absent; local pinned shared-source/outcome checks passed. The public hosting identity remains the independent Signal project.

Final JS is unchanged: `/lumo-runtime.b0d6b1aa1e33.js`, SHA-256 `b0d6b1aa1e33f4a589f851bac7565275f78e3ad016855133295c795ff6673bc9`.

Final CSS: `/lumo-ui.a15e187e5e1f.css`, SHA-256 `a15e187e5e1fec5f99deb5886aeda9c7d1339eeeddc8b127d3832f55d02867f3`. There are 112 scripts, 89 stylesheets and 29 public cache assets, 5,126,018 bytes, version `5d629df870bdcf40d852`.
