# Identity assets recovered for Lumo · Clarity Edition

The visual identity files were recovered from the earlier illustration-first project's existing source, not redrawn or approximated. The original site and reference checkout were read only throughout this work.

- Source site: https://lumo-illustration-first.oness15.chatgpt.site/
- Source version: 11.
- Source commit: `455165754b26b94b7c468d4fcbc6cf67d37c38e7`.
- Reference checkout: `/workspace/sites/lumo-identity-reference`.
- Independent destination: `/workspace/sites/lumo-clarity-edition`.
- Original files retain their exact bytes, including the original black wordmark's `#111413` fill. The interface ink token can be `#111111` without altering that artwork.

## Wordmarks

Use the actual capital-L assets at `/brand/Lumo-Wordmark-Black.svg` and `/brand/Lumo-Wordmark-White.svg`. Both are outlined SVGs with a native `viewBox="0 0 2502 712"`, a width-to-height ratio of about 3.514:1. They contain the same four outlines: L, u, m and the clarity-ring o. Neither contains text or relies on a browser font to reproduce the logo.

Preserve natural proportions with `height:auto` and `object-fit:contain`. The source geometry defines an 80px minimum digital ink width and clearspace of 136 design units, one quarter of the o's outer diameter. The o has outer diameter 544, inner diameter 388 and stroke 78. That open circular geometry can inform a meaningful comparison or status cue; it is not an instruction to add rings around every component.

## Lumo Sans

Recovered original font version 1.120 in four real static weights:

| Role | Weight | Shipped web asset |
| --- | ---: | --- |
| Body and supporting copy | Regular 400 | `fonts/LumoSans-Regular.woff2` |
| Labels and secondary emphasis | Medium 500 | `fonts/LumoSans-Medium.woff2` |
| Conclusions, amounts and main actions | Semibold 600 | `fonts/LumoSans-Semibold.woff2` |
| Occasional strong emphasis | Bold 700 | `fonts/LumoSans-Bold.woff2` |

Original TTF counterparts and `fonts/lumo-sans.css` are retained unchanged. `dist/clarity-type.css` declares those web assets explicitly under `Lumo Sans`, overrides the interface font token and forbids synthetic styles. It does not modify glyphs or create a replacement face.

All four native files contain G, H, U+20B5 CEDI SIGN, U+2212 MINUS SIGN, comma, period, hyphen and all ten digits. Default digits are proportional. The native OpenType `tnum` feature supplies equal 640-unit digit advances at every weight, so financial figures use `font-variant-numeric: lining-nums tabular-nums`.

Keep `GH₵` indivisible in financial interface elements. Typography alone cannot prevent wrapping if a currency element is allowed to shrink; its container also needs `white-space:nowrap` and appropriate flex sizing. The numeric formatter and financial engine remain the functional foundation's authority.

## Verification and limits

`python tests/clarity-font.test.py` verifies all original file hashes, native weights, required glyph outlines, tabular digit advances, unmodified wordmark paths and the four real CSS face declarations.

FreeType loaded the exact WOFF2 binaries and produced identical masks and advance widths to their TTF counterparts at 13, 15, 16, 24 and 48px, using real GH₵ samples and tabular numerals. `docs/lumo-sans-native-proof.png` was rendered and visually inspected at representative sizes. Essential supporting copy should remain 15–16px; 13px Regular is delicate and suitable only for supplementary information.

The proof is a native font raster, not a browser screenshot. It does not verify actual phone layout, browser font loading, keyboard behaviour or browser text scaling. Those require the supported browser or device workflow.

## Exact-byte provenance

The following SHA-256 values match the recovered source and are enforced by the identity test.

| Destination under `dist/` | SHA-256 |
| --- | --- |
| `brand/Lumo-Wordmark-Black.svg` | `e6a2e95d213dad264d1f01b277c6f8924004a0167a2bb01056b56b8398e80712` |
| `brand/Lumo-Wordmark-White.svg` | `82b5c0a63df5fdd89b0b28b5e437f81d76502dcb260ef5314172d9b2f016c739` |
| `brand/geometry.json` | `5c5f8c464ec425cadd67262d370d3ffa6bf258ef51d6195ab7cb6e76e0fa10d4` |
| `fonts/LumoSans-Regular.ttf` | `4247abe8b6be05315334ba17974ae8da4a89c35c44342219258de0e60c94ed59` |
| `fonts/LumoSans-Regular.woff2` | `b5d60e8fd10f1d1a17448f678ff5dc5982723de6945f772f86e3bf37936d1a3a` |
| `fonts/LumoSans-Medium.ttf` | `fc9f513f9abe92c5c43b1d57ef2cc4beba77bf4049cc25d7c3668da1d8960083` |
| `fonts/LumoSans-Medium.woff2` | `73cf3b4597bc9486ad5b34949ebf813c03015700c1c9d816068d6e1ec659c3ce` |
| `fonts/LumoSans-Semibold.ttf` | `b7fbf8e6e8be5963d465cea3f8d3ac490f7aa43be7126c4fa1802d23f09ec6ba` |
| `fonts/LumoSans-Semibold.woff2` | `2031bc32245f2b380fa44d39713088c543ef988c5a69bdd4dc12f090653ffdfb` |
| `fonts/LumoSans-Bold.ttf` | `6131c133e3db6f3cae3f2985ac64d07f44921fd561a2c34335873e5f1e713326` |
| `fonts/LumoSans-Bold.woff2` | `0dd7f2fe8d361af84a4e3cbda63c156e1abd65e02b0723707d37478248b12c11` |
| `fonts/lumo-sans.css` | `431965a97e8a17a868374e09cf72c42aaee79986e5227dcac88ea896fffc976d` |
