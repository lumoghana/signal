> Historical campus v25 record. Superseded for Clarity Edition by docs/SYSTEM-REFERENCE.md and docs/CLARITY-VALIDATION.md.

# Lumo typography audit and implementation

The interface uses **Plus Jakarta Sans, version 2.071**, from the official Google Fonts repository. Its circular lowercase forms, open counters and steady numerals complement the existing Lumo mark without borrowing its exact lettering. The mark retains its original font, weight, tracking and dot construction.

## What changed

The preceding implementation had no self-hosted interface font. Its system stack selected different faces on Apple, Windows and Android devices, while CSS requested weights including 450, 550, 620, 650 and 750. Those weights could be rounded to the few faces available on a device or synthesised. It also meant typography was not controlled consistently across platforms.

The new interface has one locally served variable font, four deliberate UI weights and explicit roles. It does not request an external font service at runtime. Normal styles are shipped; `font-synthesis: none` prevents simulated bold and italic. The approved wordmark remains a separate protected identity rule using its existing face.

## Typeface choice and real glyph audit

| Candidate | Actual inspected file | Cedi U+20B5 | True minus U+2212 | Tabular figures | Decision |
| --- | --- | --- | --- | --- | --- |
| Manrope | Version 4.505 | Missing | Present | Present | Rejected, because currency would silently fall back |
| DM Sans | Official variable source | Missing | Present | Not required after cedi failure | Rejected for the same reason |
| Plus Jakarta Sans | Version 2.071 | Present | Present | Real `tnum` feature | Selected |

The shipped file contains the complete `GH₵`, decimal and thousands separators, the true minus sign and all ten digits. The `tnum` feature substitutes equal-width digit glyphs. Their advance widths were checked at 400, 500, 600 and 700, rather than assuming that a CSS declaration makes numbers tabular. The original font's weight axis is 200–800; the CSS face exposes the intended 400–700 range.

Native cedi coverage is verified. This is not a claim of complete African-language coverage. Any future local-language copy needs an additional glyph audit, particularly open e and open o.

## Shared roles

| Role | Weight | Size and leading | Tracking | Use |
| --- | --- | --- | --- | --- |
| Screen title | 700 | 32–38 px, 1.12 | −0.045 em | Screen orientation |
| Financial conclusion | 600 | 24–30 px, 1.22 | −0.035 em | Pause headline and Chat's first answer |
| Main amount | 600 | 40–48 px, 1.08 | −0.045 em | Left after plan, payment amount and key result |
| Supporting explanation | 400 | 15 px, 1.5 | −0.01 em | The facts beneath the conclusion |
| Action | 700 | Existing control size, 1.3 | −0.015 em | Main and equal decision buttons |
| Navigation and expandable detail | 600 | Existing size | −0.01 em | Navigation, rows and calculation control |
| Secondary information | 400 | 13 px, 1.45 | 0 | Privacy note, footnotes and limitations |
| Context label | 600 | Existing size, 1.4 | +0.09 em | Pause and screen context |

Responsive system styles may refine sizes for compact states, but retain the role, weight and relative emphasis. Do not reduce supporting information to microscopic text to force a screen to fit. Allow natural scrolling for long content or larger text.

Use `--font-ui`, `--weight-regular`, `--weight-medium`, `--weight-semibold`, `--weight-bold`, `--type-title`, `--type-consequence`, `--type-amount`, `--type-body`, `--type-support` and `--type-meta`. Reuse `.lumo-conclusion` and `.lumo-amount` on new components where a more specific existing role is unavailable. Do not add another font family for a new screen.

## Numeric rules

Product amounts use the shared JavaScript formatter, never hand-built currency strings. The common presentation is **GH₵600.00**, including two decimal places, comma grouping and a true minus before the currency for negative amounts: **−GH₵30.00**. Alignment uses tabular figures and right-aligned numeric columns. The currency remains text so it can scale, be copied and be announced by assistive technology. Goal allocations remain commitments in the plan, not additional deductions from the account balance.

## Source, licence and loading

- Family and author: Plus Jakarta Sans, Tokotype / The Plus Jakarta Sans Project Authors.
- Licence: [SIL Open Font License 1.1](../dist/assets/fonts/PlusJakartaSans-OFL.txt), included with the delivered asset.
- [Official Google Fonts source](https://github.com/google/fonts/tree/main/ofl/plusjakartasans).
- Upstream source commit recorded in the official metadata: `18d1cd2f7ea10481919d2f05c1f7064b7307fc26` in [tokotype/PlusJakartaSans](https://github.com/tokotype/PlusJakartaSans/tree/18d1cd2f7ea10481919d2f05c1f7064b7307fc26).
- Source file: `PlusJakartaSans[wght].ttf`, 176,288 bytes. SHA-256: `89b3fb38aa0d275d7a731d0d817a4f1622b316b4d7fbdedcf02ee9099ff68bc8`.
- Shipped asset: `dist/assets/fonts/PlusJakartaSans-v2.071.woff`, 78,380 bytes. SHA-256: `544f24a30716c85c425cd2c37e9fbcf4b8134290815742d512bfe3e633aae4ef`.
- Conversion: lossless WOFF container compression with fontTools. No outlines, advances or substitution features were edited.
- Loading: one same-origin font, preloaded by the document and declared in `dist/type-system.css` with `font-display: swap`. A normal system stack remains available if the font request fails; the normal successful path uses the self-hosted family, including its cedi glyph.

The retained `PlusJakartaSans-METADATA.pb` records the official source's family, authorship, licence and upstream revision. Update this audit and the font tests if the binary is replaced.

## Verification and limits

Run `python tests/font-system.test.py`. It inspects the compressed delivered binary, verifies local loading and licence presence, checks real currency and minus outlines, confirms true weight support, and checks equal tabular digit advances at every UI weight.

These checks establish the font file and CSS contract. They do not establish successful browser network loading, visual rendering on an actual phone, keyboard layout, text resizing or final layout fit. Those checks require the browser/device evidence recorded separately in the project validation notes.
