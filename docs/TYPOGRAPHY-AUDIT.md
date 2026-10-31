# Clarity Edition typography audit

The deployed interface uses only the original Lumo Sans 1.120 files recovered from illustration-first v11. Regular400, Medium500, Semibold600 and Bold700 are separate native WOFF2 faces. Regular and Semibold are preloaded; all four weight files exist. The inherited type-role sheet no longer declares or loads Jakarta. The SVG wordmarks are separate outlined artwork, never font-rendered logos.

Native binary checks confirm GH₵, Unicode minus, digits and equal-width tnum alternates in all four weights. WOFF2/TTF raster parity passed at13,15,16,24 and48px. Actual small-size raster proof: `lumo-sans-native-proof.png`. Browser network loading and device rasterisation require the unavailable supported browser capability and are not claimed.

See [asset provenance and exact weights](IDENTITY-ASSETS.md), [system](SYSTEM-REFERENCE.md) and `tests/clarity-font.test.py`. The prior Jakarta audit is preserved only in `history/CAMPUS-V25-TYPOGRAPHY-AUDIT.md`.
