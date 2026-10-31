# Illustration merge

Clarity Edition uses the actual eight editorial character masters from the illustration-first prototype. They were recovered from that project's v11 source, `dist/assets`, and copied unchanged to `dist/assets/clarity`. Every copied PNG retains the original 1536 × 1024 canvas, transparency, gestures, linework and coloured textile patterns. No atlas clipping, recolouring, tracing, AI redrawing or embedded financial text was introduced.

## Shared drawing family

The recurring male student wears an open, patterned shirt over a white top. The recurring female student and food vendor wear recognisable patterned clothing. Black hair, outlined facial features, white body and object shapes, expressive open-hand gestures and substantial black contours bind the scenes together. Colour belongs to the recovered textiles. The interface accent is a separate semantic highlight and does not recolour those masters.

Figures are shown whole using `object-fit: contain`. Introductory and empty states can carry a larger drawing. Everyday screens use a medium drawing. Entry, Review, Pause and authorisation use compact drawings; financial consequences and controls take priority. Root layout rules own the actual responsive sizes.

## Recovered assets and use

| Original file | Main use | SHA-256 of untouched original and copy |
| --- | --- | --- |
| `student-expressive.png` | Home, welcome, receiving-money context, account and phone tasks | `cfd4d16e8132be91c6c1decb2c3dd4a92f7e9fc006ca27116a4ba8c7469400c6` |
| `friends-editorial.png` | Transfers, requests, social payment entry | `4a3ad9646adaddc24c0d1a2dfd16e0379b137cc003ccf7c2ea2f1a22894aaa6c` |
| `campus-pay-editorial.png` | Campus Pay and food counter context before payment | `b4208efb1b9bc187a8dc166febbb0ec3fa6283ebc9d05735a96f450a110104b2` |
| `money-review-refined-4.13.png` | Planning, spending history, receipts and account detail | `d066e3e22cf681a5d449136f997f764e38f67111576db3ec76dc91881a4fff74` |
| `goal-study-4.16.png` | A saved laptop goal or a laptop-only trade-off; other goals use the neutral notebook scene | `9062fb49de0df31df6c948b75a46ebfd1e580315261b89afb459c1150344f855` |
| `essentials-pause-editorial.png` | Essentials shortfall when the remaining essentials include food | `42f2d7631cd3cb5e0c7f3663a610b90281bc973233be65698a684f8104bbcbe7` |
| `payment-complete-editorial.png` | Confirmed, delivered Campus Pay food payment only | `50229e6c7d4dae4a2cb67675866f739f3a179b6a9bc1f569b3c5f53b9d5d66d6` |
| `thoughtful-refined-4.13.png` | Chat, help, generic choices, unrelated essential shortfalls and unconfirmed results | `a0eff30b70e883816453d2a798b480c7130cc095d62114065d2238e1e68eeb3c` |

The old background setting PNGs and social poster were inspected but are not layered into the interface. The poster embeds product text; it is unsuitable as reusable interface illustration. The simple settings are available in the reference source, but the new edition's open white composition does not need them. Clothing and gestures remain intact.

## Semantics and known limits

The earlier project has no dedicated artwork for bank transfer, water, electricity, mobile data, identity capture or account recovery. Those tasks use a neutral earlier student or notebook scene. This is an explicit neutral fallback, not a new claim that those images depict the particular service. Camera/PIN controls keep their existing behaviour and compact treatment.

Food delivery artwork requires a successful transaction and confirmed delivery where a delivery state exists. Pending, delivery-pending, delivery-failed, failed, cancelled and unknown results use a neutral thoughtful scene. A transfer or printing payment never shows food being handed over. The status icon and real interface text remain the authority.

Generic Pause artwork does not assume a sneaker purchase or laptop trade-off. A food illustration is selected only from actual remaining essential names. Unrelated costs use the thoughtful student. A laptop-only goal consequence may select the laptop scene. Financial comparisons remain real HTML driven by the existing calculation engine.

## Checks

`tests/clarity-art.test.cjs` checks original asset hashes and PNG dimensions, one `data-art` instance per renderer, untouched single-image composition, route selection, conditional essential/goal scenes and confirmed-result gating. These are source and component checks. They are not phone screenshots or browser layout verification.
